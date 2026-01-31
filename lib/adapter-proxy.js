import http from 'http';
import axios from 'axios';
import { EventEmitter } from 'events';

// Simple event emitter for logging/debug
export const proxyEvents = new EventEmitter();

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
            // Only handle POST /v1/messages
            if (req.method === 'POST' && req.url.includes('/v1/messages')) {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const anthropicReq = JSON.parse(body);
                        console.log(`[Proxy] Incoming Request Model: ${anthropicReq.model}`);

                        // 1. Convert to OpenAI Request
                        const openaiReq = convertAnthropicToOpenAI(anthropicReq);

                        // FORCE MODEL OVERRIDE for debugging/compatibility
                        // The user's API only works with this specific model name based on previous tests
                        if (openaiReq.model.includes('claude')) {
                            console.log(`[Proxy] Mapping model ${openaiReq.model} -> claude-opus-4-5-20251101`);
                            openaiReq.model = 'claude-opus-4-5-20251101';
                        }

                        // 2. Determine target endpoint
                        // config.targetUrl could be "https://api.5202030.xyz" or "https://api.5202030.xyz/v1/chat/completions"
                        let targetEndpoint = config.targetUrl;
                        if (!targetEndpoint.endsWith('/chat/completions')) {
                            targetEndpoint = targetEndpoint.replace(/\/$/, '') + '/v1/chat/completions';
                        }

                        proxyEvents.emit('log', `Proxying to ${targetEndpoint} for model ${openaiReq.model}`);

                        // 3. Send to OpenAI Provider
                        const response = await axios.post(targetEndpoint, openaiReq, {
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${config.apiKey}`
                            },
                            responseType: anthropicReq.stream ? 'stream' : 'json',
                            validateStatus: () => true // Handle 4xx/5xx manually
                        });

                        // 4. Handle Response
                        if (response.status !== 200) {
                            console.error(`[Proxy] Upstream Error Status: ${response.status}`);
                            // Forward error
                            res.writeHead(response.status, { 'Content-Type': 'application/json' });
                            // If stream, it might be a stream of error, but usually JSON
                            if (response.data && typeof response.data.pipe === 'function') {
                                response.data.pipe(res);
                            } else {
                                console.error(`[Proxy] Upstream Error Body: ${JSON.stringify(response.data)}`);
                                res.end(JSON.stringify(response.data));
                            }
                            return;
                        }

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
                        console.error('Proxy Error:', error.message);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: { type: 'proxy_error', message: error.message } }));
                    }
                });
            } else {
                // Fallback / Health check
                res.writeHead(200);
                res.end('CC-Helper OpenAI Adapter Proxy Active');
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
        messages.push({ role: 'system', content: anthropicReq.system });
    }

    if (anthropicReq.messages) {
        for (const msg of anthropicReq.messages) {
            // Handle content array (text/image) -> OpenAI content
            if (Array.isArray(msg.content)) {
                // TODO: Handle Image
                const textParts = msg.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
                messages.push({ role: msg.role, content: textParts });
            } else {
                messages.push({ role: msg.role, content: msg.content });
            }
        }
    }

    // Model mapping (optional override)
    let model = anthropicReq.model;
    // If it's the specific expired one, maybe we keep it, assuming user knows best.
    // Or we map well-known aliases.

    return {
        model: model,
        messages: messages,
        max_tokens: anthropicReq.max_tokens || 4096,
        stream: anthropicReq.stream,
        temperature: anthropicReq.temperature,
        top_p: anthropicReq.top_p,
    };
}

function convertOpenAIToAnthropicResponse(openaiResp, model) {
    const choice = openaiResp.choices[0];
    const content = choice.message.content || '';

    return {
        id: openaiResp.id,
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: content }],
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
    let msgId = 'msg_' + Date.now(); // Fake ID

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

    // 2. Send Content Block Start
    sendEvent(res, 'content_block_start', {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' }
    });

    let buffer = '';

    // Process stream
    for await (const chunk of openaiStream) {
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

                if (delta?.content) {
                    sendEvent(res, 'content_block_delta', {
                        type: 'content_block_delta',
                        index: 0,
                        delta: { type: 'text_delta', text: delta.content }
                    });
                }
            } catch (e) {
                // ignore parse error
            }
        }
    }

    // 3. Send Content Block Stop
    sendEvent(res, 'content_block_stop', {
        type: 'content_block_stop',
        index: 0
    });

    // 4. Send Message Delta (Stop Reason)
    sendEvent(res, 'message_delta', {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 0 } // usage not always available in stream
    });

    // 5. Send Message Stop
    sendEvent(res, 'message_stop', { type: 'message_stop' });

    res.end();
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
