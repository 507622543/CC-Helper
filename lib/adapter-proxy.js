import http from 'http';
import axios from 'axios';
import { EventEmitter } from 'events';

// Simple event emitter for logging/debug
export const proxyEvents = new EventEmitter();

// --- API Error State Tracking ---
const errorState = {
    lastError: null,        // { statusCode, errorType, message, timestamp }
    consecutiveErrors: 0,   // Consecutive upstream error count
    totalErrors: 0,         // Total errors in this session
    lastSuccess: null,      // Timestamp of last successful request
    isStreamInterrupted: false, // Flag for stream-based network errors
};

/**
 * Returns current proxy error state snapshot
 * Used by runner.js to determine if API failure caused Claude Code to exit
 */
export const getProxyErrorState = () => ({ ...errorState });

/**
 * Resets error state (call when starting a new session)
 */
export const resetProxyErrorState = () => {
    errorState.lastError = null;
    errorState.consecutiveErrors = 0;
    errorState.totalErrors = 0;
    errorState.lastSuccess = null;
    errorState.isStreamInterrupted = false;
};

function recordProxyError(statusCode, errorType, message) {
    errorState.lastError = { statusCode, errorType, message, timestamp: Date.now() };
    errorState.consecutiveErrors++;
    errorState.totalErrors++;
    proxyEvents.emit('api-error', errorState.lastError);
}

function recordProxySuccess() {
    errorState.consecutiveErrors = 0;
    errorState.lastSuccess = Date.now();
}

/**
 * Supported Claude models list for /v1/models endpoint.
 * Claude Code CLI queries this to validate model availability.
 */
const SUPPORTED_MODELS = [
    // Opus
    'claude-opus-4-6-20250116',
    'claude-opus-4-5-20251101',
    'claude-opus-4-1-20250805',
    'claude-3-opus-20240229',
    // Sonnet
    'claude-sonnet-4-6-20250514',
    'claude-sonnet-4-5-20250929',
    'claude-4-sonnet-think',
    'claude-3-7-sonnet-20250219',
    'claude-3-5-sonnet-20241022',
    // Haiku
    'claude-haiku-4-5-20251001',
    'claude-3-5-haiku-20241022',
];

/**
 * Starts a minimal HTTP server that acts as a proxy:
 * Anthropic Format (Incoming) -> OpenAI Format (Outgoing)
 *
 * @param {object} config
 * @param {string} config.targetUrl - The real OpenAI-compatible endpoint (e.g. https://api.5202030.xyz)
 * @param {string} config.apiKey - The API Key
 * @param {number} config.port - Port to listen on (0 for random)
 * @returns {Promise<object>} { url, server, port }
 */
export const startOpenAIProxy = (config) => {
    return new Promise((resolve, reject) => {
        const server = http.createServer(async (req, res) => {
            const method = req.method;
            const url = req.url || '';
            proxyEvents.emit('log', `[Proxy] ${method} ${url}`);

            // --- Route: POST /v1/messages (Anthropic -> OpenAI conversion) ---
            if (method === 'POST' && url.includes('/v1/messages')) {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const anthropicReq = JSON.parse(body);
                        proxyEvents.emit('log', `[Proxy] Incoming Request Model: ${anthropicReq.model}`);

                        // 1. Convert to OpenAI Request
                        const openaiReq = convertAnthropicToOpenAI(anthropicReq);

                        // Smart model mapping for OpenAI-compatible endpoints
                        const mappedModel = mapClaudeModel(openaiReq.model);
                        if (mappedModel !== openaiReq.model) {
                            proxyEvents.emit('log', `[Proxy] Mapping model ${openaiReq.model} -> ${mappedModel}`);
                            openaiReq.model = mappedModel;
                        }

                        // 2. Determine target endpoint
                        let targetEndpoint = config.targetUrl;
                        // Strip any endpoint suffixes, then append /v1/chat/completions
                        targetEndpoint = targetEndpoint.replace(/\/+$/, '');
                        targetEndpoint = targetEndpoint.replace(/\/v1\/messages$/, '');
                        targetEndpoint = targetEndpoint.replace(/\/v1\/chat\/completions$/, '');
                        targetEndpoint = targetEndpoint.replace(/\/v1$/, '');
                        targetEndpoint += '/v1/chat/completions';

                        proxyEvents.emit('log', `Proxying to ${targetEndpoint} for model ${openaiReq.model}`);

                        // 3. Send to OpenAI Provider with browser-like headers
                        const response = await axios.post(targetEndpoint, openaiReq, {
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${config.apiKey}`,
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                                'Accept': '*/*',
                                'Accept-Encoding': 'gzip, deflate, br',
                                'Accept-Language': 'en-US,en;q=0.9'
                            },
                            responseType: anthropicReq.stream ? 'stream' : 'json',
                            validateStatus: () => true,
                            timeout: 300000 // 5 min timeout
                        });

                        // 4. Handle Response
                        if (response.status !== 200) {
                            proxyEvents.emit('log', `[Proxy] Upstream Error Status: ${response.status}`);

                            // Emit user-friendly rate limit hint
                            if (response.status === 429) {
                                proxyEvents.emit('rate-limit', {
                                    model: openaiReq.model,
                                    retryAfter: response.headers?.['retry-after'] || null,
                                });
                            }

                            // Convert upstream error to Anthropic error format
                            if (response.data && typeof response.data.pipe === 'function') {
                                // Stream error — collect and convert
                                let errBody = '';
                                for await (const chunk of response.data) {
                                    errBody += chunk.toString();
                                }
                                const anthropicErr = convertToAnthropicError(response.status, errBody);
                                recordProxyError(response.status, anthropicErr.error.type, anthropicErr.error.message);
                                res.writeHead(response.status, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify(anthropicErr));
                            } else {
                                proxyEvents.emit('log', `[Proxy] Upstream Error Body: ${JSON.stringify(response.data)}`);
                                const anthropicErr = convertToAnthropicError(response.status, response.data);
                                recordProxyError(response.status, anthropicErr.error.type, anthropicErr.error.message);
                                res.writeHead(response.status, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify(anthropicErr));
                            }
                            return;
                        }

                        // Successful response
                        recordProxySuccess();

                        if (anthropicReq.stream) {
                            // Stream Translation
                            res.writeHead(200, {
                                'Content-Type': 'text/event-stream',
                                'Cache-Control': 'no-cache',
                                'Connection': 'keep-alive',
                            });

                            await handleOpenAIToAnthropicStream(response.data, res, openaiReq.model);
                        } else {
                            // JSON Translation
                            const anthropicResp = convertOpenAIToAnthropicResponse(response.data, openaiReq.model);
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify(anthropicResp));
                        }

                    } catch (error) {
                        proxyEvents.emit('log', `[Proxy] Error: ${error.message}`);
                        // Only write error response if headers haven't been sent yet
                        if (!res.headersSent) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                type: 'error',
                                error: { type: 'api_error', message: error.message }
                            }));
                        } else {
                            // Headers already sent (streaming), just close the connection
                            try { res.end(); } catch { }
                        }
                    }
                });

                // --- Route: GET /v1/models — Model listing for Claude Code validation ---
            } else if (method === 'GET' && url.match(/\/v1\/models(\/|$)/)) {
                proxyEvents.emit('log', `[Proxy] Serving model list/info for: ${url}`);

                // Check if requesting a specific model: /v1/models/{model_id}
                const modelIdMatch = url.match(/\/v1\/models\/(.+?)(\?|$)/);

                if (modelIdMatch) {
                    // Specific model query
                    const requestedModel = decodeURIComponent(modelIdMatch[1]);
                    proxyEvents.emit('log', `[Proxy] Model validation check: ${requestedModel}`);

                    // Accept any claude model — the upstream provider decides actual availability
                    const modelInfo = {
                        id: requestedModel,
                        object: 'model',
                        created: Math.floor(Date.now() / 1000),
                        owned_by: 'anthropic',
                    };
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(modelInfo));
                } else {
                    // Full model list
                    const modelList = {
                        object: 'list',
                        data: SUPPORTED_MODELS.map(id => ({
                            id,
                            object: 'model',
                            created: Math.floor(Date.now() / 1000),
                            owned_by: 'anthropic',
                        })),
                    };
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(modelList));
                }

                // --- Route: Fallback — Transparent proxy for any other requests ---
            } else {
                proxyEvents.emit('log', `[Proxy] Fallback passthrough: ${method} ${url}`);
                // Try to forward to upstream, converting path accordingly
                try {
                    const baseUrl = config.targetUrl.replace(/\/$/, '');
                    const targetUrl = baseUrl + url;

                    let body = null;
                    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
                        body = await collectRequestBody(req);
                    }

                    const upstreamResp = await axios({
                        method: method.toLowerCase(),
                        url: targetUrl,
                        data: body ? JSON.parse(body) : undefined,
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${config.apiKey}`
                        },
                        validateStatus: () => true,
                        timeout: 30000, // 30s for passthrough
                    });

                    res.writeHead(upstreamResp.status, { 'Content-Type': 'application/json' });
                    res.end(typeof upstreamResp.data === 'string'
                        ? upstreamResp.data
                        : JSON.stringify(upstreamResp.data));
                } catch (err) {
                    proxyEvents.emit('log', `[Proxy] Fallback passthrough error: ${err.message}`);
                    // If upstream fails, return health check as last resort
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('CC-Helper OpenAI Adapter Proxy Active');
                }
            }
        });

        server.listen(config.port || 0, '127.0.0.1', () => {
            const address = server.address();
            const port = address.port;
            resolve({
                url: `http://127.0.0.1:${port}`,
                server,
                port
            });
        });

        server.on('error', reject);
    });
};

function convertAnthropicToOpenAI(anthropicReq) {
    // Basic conversion
    const messages = [];

    if (anthropicReq.system) {
        // System can be a string or an array of content blocks
        let systemText;
        if (Array.isArray(anthropicReq.system)) {
            systemText = anthropicReq.system
                .filter(c => c.type === 'text')
                .map(c => c.text)
                .join('\n');
        } else {
            systemText = anthropicReq.system;
        }
        if (systemText) {
            messages.push({ role: 'system', content: systemText });
        }
    }

    if (anthropicReq.messages) {
        for (const msg of anthropicReq.messages) {
            if (Array.isArray(msg.content)) {
                // Check if this is a tool_result message (user role with tool_result blocks)
                const toolResults = msg.content.filter(c => c.type === 'tool_result');
                if (toolResults.length > 0 && msg.role === 'user') {
                    // Convert each tool_result into a separate OpenAI tool message
                    for (const tr of toolResults) {
                        const toolContent = Array.isArray(tr.content)
                            ? tr.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
                            : (tr.content || '');
                        messages.push({
                            role: 'tool',
                            tool_call_id: tr.tool_use_id,
                            content: toolContent,
                        });
                    }
                    // Also include any text content in this user turn
                    const textParts = msg.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
                    if (textParts) {
                        messages.push({ role: 'user', content: textParts });
                    }
                } else if (msg.role === 'assistant') {
                    // Check for tool_use blocks in assistant message
                    const toolUses = msg.content.filter(c => c.type === 'tool_use');
                    const textParts = msg.content.filter(c => c.type === 'text').map(c => c.text).join('\n');

                    if (toolUses.length > 0) {
                        // Convert to OpenAI assistant message with tool_calls
                        messages.push({
                            role: 'assistant',
                            content: textParts || null,
                            tool_calls: toolUses.map(tu => ({
                                id: tu.id,
                                type: 'function',
                                function: {
                                    name: tu.name,
                                    arguments: typeof tu.input === 'string'
                                        ? tu.input
                                        : JSON.stringify(tu.input || {}),
                                },
                            })),
                        });
                    } else {
                        messages.push({ role: msg.role, content: textParts });
                    }
                } else {
                    // Regular user message with only text/image content
                    const textParts = msg.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
                    messages.push({ role: msg.role, content: textParts });
                }
            } else {
                messages.push({ role: msg.role, content: msg.content });
            }
        }
    }

    // Model mapping (optional override)
    let model = anthropicReq.model;

    // Convert Anthropic tools -> OpenAI tools
    let tools;
    if (anthropicReq.tools && anthropicReq.tools.length > 0) {
        tools = anthropicReq.tools.map(tool => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description || '',
                parameters: tool.input_schema || {},
            },
        }));
    }

    // Convert Anthropic tool_choice -> OpenAI tool_choice
    let tool_choice;
    if (anthropicReq.tool_choice) {
        const tc = anthropicReq.tool_choice;
        if (tc.type === 'auto') {
            tool_choice = 'auto';
        } else if (tc.type === 'any') {
            tool_choice = 'required';
        } else if (tc.type === 'tool' && tc.name) {
            tool_choice = { type: 'function', function: { name: tc.name } };
        } else {
            tool_choice = 'auto';
        }
    }

    const openaiReq = {
        model: model,
        messages: messages,
        max_tokens: anthropicReq.max_tokens || 4096,
        stream: anthropicReq.stream,
        temperature: anthropicReq.temperature,
        top_p: anthropicReq.top_p,
    };

    if (tools) openaiReq.tools = tools;
    if (tool_choice !== undefined) openaiReq.tool_choice = tool_choice;

    // Pass through thinking parameter for providers that support it
    if (anthropicReq.thinking) {
        openaiReq.thinking = anthropicReq.thinking;
    }

    return openaiReq;
}

function convertOpenAIToAnthropicResponse(openaiResp, model) {
    const choice = openaiResp.choices[0];
    const contentBlocks = [];

    // Text content
    if (choice.message.content) {
        contentBlocks.push({ type: 'text', text: choice.message.content });
    }

    // Tool calls -> tool_use blocks
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        for (const tc of choice.message.tool_calls) {
            let inputObj;
            try {
                inputObj = JSON.parse(tc.function.arguments || '{}');
            } catch {
                inputObj = {};
            }
            contentBlocks.push({
                type: 'tool_use',
                id: tc.id,
                name: tc.function.name,
                input: inputObj,
            });
        }
    }

    if (contentBlocks.length === 0) {
        contentBlocks.push({ type: 'text', text: '' });
    }

    return {
        id: openaiResp.id,
        type: 'message',
        role: 'assistant',
        content: contentBlocks,
        model: model,
        stop_reason: mapFinishReason(choice.finish_reason),
        stop_sequence: null,
        usage: {
            input_tokens: openaiResp.usage?.prompt_tokens || 0,
            output_tokens: openaiResp.usage?.completion_tokens || 0
        }
    };
}

async function handleOpenAIToAnthropicStream(openaiStream, res, model) {
    let msgId = 'msg_' + Date.now();

    // 1. Send Message Start
    sendEvent(res, 'message_start', {
        type: 'message_start',
        message: {
            id: msgId,
            type: 'message',
            role: 'assistant',
            content: [],
            model: model,
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 }
        }
    });

    // 2. Send Content Block Start (text)
    sendEvent(res, 'content_block_start', {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' }
    });

    let buffer = '';
    let streamError = null;

    // Track open tool_use blocks: index -> { id, name, argumentsBuffer }
    const openToolBlocks = {};
    // text block index is always 0; tool blocks start at 1+
    let nextBlockIndex = 1;

    // Collect real usage from OpenAI stream (usually in the last chunk)
    let collectedUsage = { input_tokens: 0, output_tokens: 0 };

    // Abort upstream if client disconnects
    let clientDisconnected = false;
    res.on('close', () => { clientDisconnected = true; });

    // Process stream with error handling
    try {
        for await (const chunk of openaiStream) {
            if (clientDisconnected) break;

            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const dataStr = line.slice(6).trim();
                if (dataStr === '[DONE]') continue;

                try {
                    const event = JSON.parse(dataStr);
                    const delta = event.choices?.[0]?.delta;

                    // Collect usage data from OpenAI stream (usually in the final chunk)
                    if (event.usage) {
                        if (event.usage.prompt_tokens) collectedUsage.input_tokens = event.usage.prompt_tokens;
                        if (event.usage.completion_tokens) collectedUsage.output_tokens = event.usage.completion_tokens;
                    }

                    if (!delta) continue;

                    // Text content delta
                    if (delta.content) {
                        sendEvent(res, 'content_block_delta', {
                            type: 'content_block_delta',
                            index: 0,
                            delta: { type: 'text_delta', text: delta.content }
                        });
                    }

                    // Tool call deltas
                    if (delta.tool_calls && delta.tool_calls.length > 0) {
                        for (const tc of delta.tool_calls) {
                            const tcIndex = tc.index ?? 0;
                            const blockIndex = nextBlockIndex + tcIndex;

                            if (!openToolBlocks[tcIndex]) {
                                // New tool call starting — open a tool_use block
                                openToolBlocks[tcIndex] = {
                                    id: tc.id || `call_${tcIndex}`,
                                    name: tc.function?.name || '',
                                    argumentsBuffer: '',
                                    blockIndex,
                                };
                                // Close text block first if it's the first tool
                                if (Object.keys(openToolBlocks).length === 1) {
                                    sendEvent(res, 'content_block_stop', {
                                        type: 'content_block_stop',
                                        index: 0
                                    });
                                }
                                sendEvent(res, 'content_block_start', {
                                    type: 'content_block_start',
                                    index: blockIndex,
                                    content_block: {
                                        type: 'tool_use',
                                        id: openToolBlocks[tcIndex].id,
                                        name: openToolBlocks[tcIndex].name,
                                        input: {},
                                    }
                                });
                            }

                            // Accumulate name (may arrive in chunks)
                            if (tc.function?.name) {
                                openToolBlocks[tcIndex].name += tc.function.name;
                            }

                            // Stream arguments as input_json_delta
                            if (tc.function?.arguments) {
                                openToolBlocks[tcIndex].argumentsBuffer += tc.function.arguments;
                                sendEvent(res, 'content_block_delta', {
                                    type: 'content_block_delta',
                                    index: blockIndex,
                                    delta: {
                                        type: 'input_json_delta',
                                        partial_json: tc.function.arguments,
                                    }
                                });
                            }
                        }
                    }
                } catch (e) {
                    proxyEvents.emit('log', `[Proxy] Stream JSON parse error: ${e.message}, data: ${dataStr.slice(0, 200)}`);
                }
            }
        }

        // Process remaining buffer data
        if (buffer.trim()) {
            const remaining = buffer.trim();
            if (remaining.startsWith('data: ') && remaining.slice(6).trim() !== '[DONE]') {
                try {
                    const event = JSON.parse(remaining.slice(6).trim());
                    const delta = event.choices?.[0]?.delta;
                    if (delta?.content) {
                        sendEvent(res, 'content_block_delta', {
                            type: 'content_block_delta',
                            index: 0,
                            delta: { type: 'text_delta', text: delta.content }
                        });
                    }
                } catch (e) {
                    proxyEvents.emit('log', `[Proxy] Stream final buffer parse error: ${e.message}`);
                }
            }
        }
    } catch (error) {
        streamError = error;
        errorState.isStreamInterrupted = true;
        proxyEvents.emit('log', `[Proxy] Stream interrupted: ${error.message}`);
    }

    // Always send proper SSE closing events, even after error
    if (!clientDisconnected) {
        try {
            // Close any open tool blocks
            for (const tcIndex of Object.keys(openToolBlocks)) {
                sendEvent(res, 'content_block_stop', {
                    type: 'content_block_stop',
                    index: openToolBlocks[tcIndex].blockIndex
                });
            }

            // Close text block if no tool blocks were opened
            if (Object.keys(openToolBlocks).length === 0) {
                sendEvent(res, 'content_block_stop', {
                    type: 'content_block_stop',
                    index: 0
                });
            }

            // 4. Send Message Delta (Stop Reason) with real usage
            const stopReason = Object.keys(openToolBlocks).length > 0
                ? 'tool_use'
                : (streamError ? 'error' : 'end_turn');

            sendEvent(res, 'message_delta', {
                type: 'message_delta',
                delta: {
                    stop_reason: stopReason,
                    stop_sequence: null
                },
                usage: {
                    input_tokens: collectedUsage.input_tokens,
                    output_tokens: collectedUsage.output_tokens,
                }
            });

            // 5. Send Message Stop
            sendEvent(res, 'message_stop', { type: 'message_stop' });
        } catch (e) {
            proxyEvents.emit('log', `[Proxy] Error sending stream close events: ${e.message}`);
        }
    }

    try { res.end(); } catch { }
}

function sendEvent(res, eventName, data) {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function mapFinishReason(reason) {
    if (reason === 'stop') return 'end_turn';
    if (reason === 'length') return 'max_tokens';
    return 'end_turn';
}

/**
 * Smart model mapping for OpenAI-compatible endpoints
 * Maps Claude Code's model names to provider-supported equivalents
 *
 * Strategy: If the model name is already a well-formed Claude model ID
 * (e.g. claude-opus-4-6, claude-opus-4-6-20250116), pass it through unchanged.
 * Only map shorthand or non-standard names to canonical forms.
 */
function mapClaudeModel(model) {
    if (!model) return model;

    const modelLower = model.toLowerCase();

    // Already a well-formed Claude model ID — pass through as-is.
    // Matches: claude-opus-4-6, claude-opus-4-6-20250116, claude-sonnet-4-5-20250929,
    //          claude-3-opus-20240229, claude-3-5-sonnet-20241022, claude-haiku-4-5-20251001, etc.
    if (/^claude-(opus|sonnet|haiku)-\d/.test(modelLower) || /^claude-\d+(-\d+)?-(opus|sonnet|haiku)/.test(modelLower)) {
        return model;
    }

    // Shorthand/non-standard names — map to canonical form
    // Opus models
    if (modelLower.includes('opus')) {
        if (modelLower.includes('4-6') || modelLower.includes('4.6')) {
            return 'claude-opus-4-6-20250116';
        }
        if (modelLower.includes('4-5') || modelLower.includes('4.5')) {
            return 'claude-opus-4-5-20251101';
        }
        if (modelLower.includes('4-1') || modelLower.includes('4.1')) {
            return 'claude-opus-4-1-20250805';
        }
        if (modelLower.includes('3')) {
            return 'claude-3-opus-20240229';
        }
        return 'claude-opus-4-6-20250116';
    }

    // Sonnet models
    if (modelLower.includes('sonnet')) {
        if (modelLower.includes('thinking') || modelLower.includes('think')) {
            return 'claude-4-sonnet-think';
        }
        if (modelLower.includes('4-6') || modelLower.includes('4.6')) {
            return 'claude-sonnet-4-6-20250514';
        }
        if (modelLower.includes('4-5') || modelLower.includes('4.5')) {
            return 'claude-sonnet-4-5-20250929';
        }
        if (modelLower.includes('3-7') || modelLower.includes('3.7')) {
            return 'claude-3-7-sonnet-20250219';
        }
        if (modelLower.includes('3-5') || modelLower.includes('3.5')) {
            return 'claude-3-5-sonnet-20241022';
        }
        return 'claude-sonnet-4-5-20250929';
    }

    // Haiku models
    if (modelLower.includes('haiku')) {
        if (modelLower.includes('4-5') || modelLower.includes('4.5')) {
            return 'claude-haiku-4-5-20251001';
        }
        if (modelLower.includes('3-5') || modelLower.includes('3.5')) {
            return 'claude-3-5-haiku-20241022';
        }
        return 'claude-haiku-4-5-20251001';
    }

    // If no mapping found, return as-is (provider might support it directly)
    return model;
}

/**
 * Collect request body from IncomingMessage
 */
function collectRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

/**
 * Convert upstream OpenAI-format error to Anthropic error format.
 * Claude Code CLI expects: { type: "error", error: { type: "...", message: "..." } }
 */
function convertToAnthropicError(statusCode, upstreamData) {
    let message = 'Unknown upstream error';
    let errorType = 'api_error';

    // Parse upstream data
    if (typeof upstreamData === 'string') {
        try {
            upstreamData = JSON.parse(upstreamData);
        } catch {
            message = upstreamData;
        }
    }

    if (upstreamData && typeof upstreamData === 'object') {
        // OpenAI format: { error: { message, type, code } }
        if (upstreamData.error) {
            message = upstreamData.error.message || upstreamData.error.msg || JSON.stringify(upstreamData.error);
            if (upstreamData.error.type) {
                errorType = upstreamData.error.type;
            }
        } else if (upstreamData.message) {
            message = upstreamData.message;
        } else {
            message = JSON.stringify(upstreamData);
        }
    }

    // Map HTTP status to Anthropic error type
    if (statusCode === 401) errorType = 'authentication_error';
    else if (statusCode === 403) errorType = 'permission_error';
    else if (statusCode === 404) errorType = 'not_found_error';
    else if (statusCode === 429) errorType = 'rate_limit_error';
    else if (statusCode >= 500) errorType = 'api_error';

    return {
        type: 'error',
        error: {
            type: errorType,
            message: message,
        }
    };
}
