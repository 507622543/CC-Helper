/**
 * Model Router - 多模型路由器
 *
 * 根据 Agent 配置路由到不同的 LLM 后端
 *
 * What: 统一的 LLM 调用接口，支持多种模型后端
 * Why: 让不同角色可以使用最适合的模型
 * Why it's good: CEO 用 Opus 做决策，Coder 用 Codex 写代码，灵活高效
 */

import { getActiveProfile } from './profile.js';

/**
 * 支持的模型后端类型
 */
export const MODEL_BACKENDS = {
    ANTHROPIC: 'anthropic',      // 直接调用 Anthropic API
    CLAUDE_CODE: 'claude-code',  // 调用 Claude Code CLI (headless)
    OPENROUTER: 'openrouter',    // OpenRouter 聚合 API
    OPENAI: 'openai',            // OpenAI API (for Codex)
    GLM: 'glm',                  // 智谱 GLM (原 swarm-ide 默认)
};

/**
 * 模型 ID 到后端的映射
 */
const MODEL_BACKEND_MAP = {
    // Claude 系列 -> Anthropic API
    'claude-opus-4': MODEL_BACKENDS.ANTHROPIC,
    'claude-sonnet-4': MODEL_BACKENDS.ANTHROPIC,
    'claude-sonnet-4-20250514': MODEL_BACKENDS.ANTHROPIC,
    'claude-opus-4-20250514': MODEL_BACKENDS.ANTHROPIC,
    'claude-3-5-sonnet-20241022': MODEL_BACKENDS.ANTHROPIC,
    'claude-3-opus-20240229': MODEL_BACKENDS.ANTHROPIC,

    // 使用 Claude Code 作为后端
    'claude-code': MODEL_BACKENDS.CLAUDE_CODE,
    'cc': MODEL_BACKENDS.CLAUDE_CODE,

    // OpenAI / Codex
    'codex': MODEL_BACKENDS.OPENAI,
    'gpt-4': MODEL_BACKENDS.OPENAI,
    'gpt-4-turbo': MODEL_BACKENDS.OPENAI,
    'gpt-4o': MODEL_BACKENDS.OPENAI,
    'o1': MODEL_BACKENDS.OPENAI,
    'o1-mini': MODEL_BACKENDS.OPENAI,

    // New Claude models via OpenAI-compatible API (e.g. OneAPI)
    'claude-opus-4-5-20251101': MODEL_BACKENDS.OPENAI,
    'claude-4-5-opus-thinking': MODEL_BACKENDS.OPENAI,

    // GLM 系列
    'glm-4': MODEL_BACKENDS.GLM,
    'glm-4.7': MODEL_BACKENDS.GLM,

    // OpenRouter (fallback for unknown models)
    'openrouter': MODEL_BACKENDS.OPENROUTER,
};

/**
 * 后端配置
 */
const BACKEND_CONFIGS = {
    [MODEL_BACKENDS.ANTHROPIC]: {
        baseUrl: 'https://api.anthropic.com',
        apiVersion: '2023-06-01',
        getApiKey: (profile) => profile?.key || process.env.ANTHROPIC_API_KEY,
    },
    [MODEL_BACKENDS.CLAUDE_CODE]: {
        // Claude Code 通过 CLI 调用
        command: 'claude',
        flags: ['-p', '--output-format', 'json'],
    },
    [MODEL_BACKENDS.OPENAI]: {
        baseUrl: 'https://api.openai.com/v1',
        getApiKey: (profile) => profile?.key || process.env.OPENAI_API_KEY,
    },
    [MODEL_BACKENDS.OPENROUTER]: {
        baseUrl: 'https://openrouter.ai/api/v1',
        getApiKey: () => process.env.OPENROUTER_API_KEY,
    },
    [MODEL_BACKENDS.GLM]: {
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        getApiKey: () => process.env.GLM_API_KEY,
    },
};

/**
 * 主路由函数：调用 LLM
 *
 * @param {object} options - 调用选项
 * @param {string} options.model - 模型 ID
 * @param {string} options.systemPrompt - System prompt
 * @param {array} options.messages - 消息历史
 * @param {array} options.tools - 可用工具列表
 * @param {number} options.maxTokens - 最大 token 数
 * @param {boolean} options.stream - 是否流式输出
 * @param {function} options.onStream - 流式输出回调
 * @returns {Promise<object>} LLM 响应
 */
// 内存缓存：记录某个 BaseURL 实际使用的后端协议
// Key: baseUrl, Value: backend (e.g., 'openai', 'anthropic')
const PROTOCOL_CACHE = new Map();

/**
 * 主路由函数：调用 LLM
 *
 * 实现了智能协议切换 (Auto-Protocol Switching)：
 * 1. 优先使用已缓存的成功协议
 * 2. 尝试默认映射的协议
 * 3. 如果失败，自动尝试其他兼容协议（即 Anthropic <-> OpenAI 互切）
 */
export async function callLLM(options) {
    const {
        model = 'claude-sonnet-4',
        systemPrompt = '',
        messages = [],
        tools = [],
        maxTokens = 4096,
        stream = false,
        onStream = null,
    } = options;

    // 1. 获取基础配置
    const profile = getActiveProfile();
    // 默认推断的后端
    let targetBackend = MODEL_BACKEND_MAP[model] || MODEL_BACKENDS.ANTHROPIC;

    // 2. 检查缓存：如果这个 URL 之前通过别的协议成功过，就用那个
    const profileUrl = profile?.url;
    if (profileUrl && PROTOCOL_CACHE.has(profileUrl)) {
        const cachedBackend = PROTOCOL_CACHE.get(profileUrl);
        // 只有当缓存的后端确实支持当前请求时才使用（例如 Claude Code 不走网络，不适用此逻辑）
        if (cachedBackend !== targetBackend &&
            (cachedBackend === MODEL_BACKENDS.OPENAI || cachedBackend === MODEL_BACKENDS.ANTHROPIC)) {
            // 如果模型名非常明确地指向了另一种后端（比如 gpt-4 指向 openai），通常不应该改
            // 但如果用户用 openai 协议套壳 claude 模型，这里需要允许 override
            targetBackend = cachedBackend;
        }
    }

    // 内部执行函数
    const executeCall = async (backend) => {
        switch (backend) {
            case MODEL_BACKENDS.ANTHROPIC:
                return callAnthropic({ model, systemPrompt, messages, tools, maxTokens, stream, onStream });
            case MODEL_BACKENDS.CLAUDE_CODE:
                return callClaudeCode({ systemPrompt, messages, tools });
            case MODEL_BACKENDS.OPENAI:
                return callOpenAI({ model, systemPrompt, messages, tools, maxTokens, stream, onStream });
            case MODEL_BACKENDS.GLM:
                return callGLM({ model, systemPrompt, messages, tools, maxTokens, stream, onStream });
            case MODEL_BACKENDS.OPENROUTER:
                return callOpenRouter({ model, systemPrompt, messages, tools, maxTokens, stream, onStream });
            default:
                throw new Error(`Unsupported model backend: ${backend}`);
        }
    };

    try {
        // 3. 首次尝试
        const result = await executeCall(targetBackend);

        // 如果成功且是自定义 URL，记录到缓存
        if (profileUrl) {
            PROTOCOL_CACHE.set(profileUrl, targetBackend);
        }
        return result;

    } catch (error) {
        // 4. 智能容错重试 (Smart Fallback)
        // 只有在网络层面的特定错误（404 路径不对，400 参数不对，401 格式不对）且有自定义 URL 时才重试
        // 并且只在 Anthropic 和 OpenAI 之间互切，因为这是最混淆的两种情况
        const isNetworkError = error.response || error.message.includes('status code');
        const canRetry = profileUrl && isNetworkError;

        if (!canRetry) throw error; // 无法重试的错误直接抛出

        let retryBackend = null;

        // 策略: Anthropic -> OpenAI
        if (targetBackend === MODEL_BACKENDS.ANTHROPIC && !error.message.includes('401')) {
            // 401 可能是 key 错，也可能是协议错。但 404 (Path not found) 几乎肯定是协议错
            // 尝试切到 OpenAI
            console.warn(`[Auto-Switch] Anthropic protocol failed, trying OpenAI compatible protocol...`);
            retryBackend = MODEL_BACKENDS.OPENAI;
        }
        // 策略: OpenAI -> Anthropic
        else if (targetBackend === MODEL_BACKENDS.OPENAI) {
            // 尝试切到 Anthropic
            console.warn(`[Auto-Switch] OpenAI protocol failed, trying Anthropic protocol...`);
            retryBackend = MODEL_BACKENDS.ANTHROPIC;
        }

        if (retryBackend) {
            try {
                const retryResult = await executeCall(retryBackend);
                // 重试成功！更新缓存
                console.log(`[Auto-Switch] Success! Switching protocol for ${profileUrl} to ${retryBackend}`);
                PROTOCOL_CACHE.set(profileUrl, retryBackend);
                return retryResult;
            } catch (retryError) {
                // 重试也失败，抛出原始错误（或者重试的错误，视情况而定，这里抛出原始错误可能更直观，但抛出重试错误可能包含更多信息）
                // 通常抛出最后一次尝试的错误
                throw retryError;
            }
        }

        throw error;
    }
}

/**
 * 调用 Anthropic API
 */
async function callAnthropic({ model, systemPrompt, messages, tools, maxTokens, stream, onStream }) {
    const { default: axios } = await import('axios');
    const profile = getActiveProfile();
    const config = BACKEND_CONFIGS[MODEL_BACKENDS.ANTHROPIC];

    const apiKey = config.getApiKey(profile);
    if (!apiKey) {
        throw new Error('Anthropic API key not configured. Add a profile or set ANTHROPIC_API_KEY');
    }

    const baseUrl = profile?.url || config.baseUrl;

    // 构建请求体
    const requestBody = {
        model: normalizeAnthropicModel(model),
        max_tokens: maxTokens,
        messages: messages,
    };

    if (systemPrompt) {
        requestBody.system = systemPrompt;
    }

    if (tools && tools.length > 0) {
        requestBody.tools = tools.map(formatToolForAnthropic);
    }

    if (stream) {
        requestBody.stream = true;
    }

    const response = await axios.post(
        `${baseUrl}/messages`,
        requestBody,
        {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': config.apiVersion,
            },
            timeout: 120000,
            responseType: stream ? 'stream' : 'json',
        }
    );

    if (stream && onStream) {
        return handleAnthropicStream(response.data, onStream);
    }

    return parseAnthropicResponse(response.data);
}

/**
 * 调用 Claude Code CLI (headless mode)
 */
async function callClaudeCode({ systemPrompt, messages, tools }) {
    const { execa } = await import('execa');
    const config = BACKEND_CONFIGS[MODEL_BACKENDS.CLAUDE_CODE];

    // 构建最后一条用户消息作为 prompt
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    if (!lastUserMessage) {
        throw new Error('No user message to send to Claude Code');
    }

    const prompt = lastUserMessage.content;

    // 构建命令行参数
    const args = [
        '-p', prompt,  // Prompt 模式
        '--output-format', 'json',
    ];

    // 如果有 system prompt，通过环境变量或配置传递
    // (Claude Code 可能需要通过 CLAUDE.md 或其他方式)

    try {
        const result = await execa(config.command, args, {
            timeout: 300000, // 5 分钟超时
            reject: false,
        });

        if (result.exitCode !== 0) {
            throw new Error(`Claude Code exited with code ${result.exitCode}: ${result.stderr}`);
        }

        // 解析 JSON 输出
        try {
            const output = JSON.parse(result.stdout);
            return {
                content: output.result || output.message || result.stdout,
                toolCalls: [],
                stopReason: 'end_turn',
            };
        } catch {
            // 非 JSON 输出，直接返回文本
            return {
                content: result.stdout,
                toolCalls: [],
                stopReason: 'end_turn',
            };
        }
    } catch (error) {
        throw new Error(`Failed to call Claude Code: ${error.message}`);
    }
}

/**
 * 调用 OpenAI API (包括 Codex)
 */
async function callOpenAI({ model, systemPrompt, messages, tools, maxTokens, stream, onStream }) {
    const { default: axios } = await import('axios');
    const profile = getActiveProfile();
    const config = BACKEND_CONFIGS[MODEL_BACKENDS.OPENAI];

    const apiKey = config.getApiKey(profile);
    if (!apiKey) {
        throw new Error('OpenAI API key not configured. Add a profile or set OPENAI_API_KEY');
    }

    let baseUrl = profile?.url || config.baseUrl;
    // Auto-append /v1 if missing for custom URLs, assuming standardized OneAPI format
    if (profile?.url && !baseUrl.endsWith('/v1')) {
        baseUrl = baseUrl.replace(/\/$/, '') + '/v1';
    }

    // 构建消息列表 (OpenAI 格式)
    const openaiMessages = [];
    if (systemPrompt) {
        openaiMessages.push({ role: 'system', content: systemPrompt });
    }
    openaiMessages.push(...messages);

    const requestBody = {
        model: normalizeOpenAIModel(model),
        messages: openaiMessages,
        max_tokens: maxTokens,
    };

    if (tools && tools.length > 0) {
        requestBody.tools = tools.map(formatToolForOpenAI);
    }

    if (stream) {
        requestBody.stream = true;
    }

    const response = await axios.post(
        `${baseUrl}/chat/completions`,
        requestBody,
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            timeout: 120000,
            responseType: stream ? 'stream' : 'json',
        }
    );

    if (stream && onStream) {
        return handleOpenAIStream(response.data, onStream);
    }

    return parseOpenAIResponse(response.data);
}

/**
 * 调用 GLM API
 */
async function callGLM({ model, systemPrompt, messages, tools, maxTokens, stream, onStream }) {
    const { default: axios } = await import('axios');
    const config = BACKEND_CONFIGS[MODEL_BACKENDS.GLM];

    const apiKey = config.getApiKey();
    if (!apiKey) {
        throw new Error('GLM API key not configured. Set GLM_API_KEY environment variable');
    }

    // GLM 使用类似 OpenAI 的格式
    const glmMessages = [];
    if (systemPrompt) {
        glmMessages.push({ role: 'system', content: systemPrompt });
    }
    glmMessages.push(...messages);

    const requestBody = {
        model: model || 'glm-4.7',
        messages: glmMessages,
        max_tokens: maxTokens,
    };

    if (tools && tools.length > 0) {
        requestBody.tools = tools.map(formatToolForOpenAI); // GLM 兼容 OpenAI 格式
    }

    if (stream) {
        requestBody.stream = true;
    }

    const response = await axios.post(
        `${config.baseUrl}/chat/completions`,
        requestBody,
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            timeout: 120000,
            responseType: stream ? 'stream' : 'json',
        }
    );

    if (stream && onStream) {
        return handleOpenAIStream(response.data, onStream);
    }

    return parseOpenAIResponse(response.data);
}

/**
 * 调用 OpenRouter API
 */
async function callOpenRouter({ model, systemPrompt, messages, tools, maxTokens, stream, onStream }) {
    const { default: axios } = await import('axios');
    const config = BACKEND_CONFIGS[MODEL_BACKENDS.OPENROUTER];

    const apiKey = config.getApiKey();
    if (!apiKey) {
        throw new Error('OpenRouter API key not configured. Set OPENROUTER_API_KEY environment variable');
    }

    const openrouterMessages = [];
    if (systemPrompt) {
        openrouterMessages.push({ role: 'system', content: systemPrompt });
    }
    openrouterMessages.push(...messages);

    const requestBody = {
        model: model,
        messages: openrouterMessages,
        max_tokens: maxTokens,
    };

    if (tools && tools.length > 0) {
        requestBody.tools = tools.map(formatToolForOpenAI);
    }

    if (stream) {
        requestBody.stream = true;
    }

    const response = await axios.post(
        `${config.baseUrl}/chat/completions`,
        requestBody,
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://github.com/cc-helper',
                'X-Title': 'CC Helper Virtual Company',
            },
            timeout: 120000,
            responseType: stream ? 'stream' : 'json',
        }
    );

    if (stream && onStream) {
        return handleOpenAIStream(response.data, onStream);
    }

    return parseOpenAIResponse(response.data);
}

// --- 辅助函数 ---

function normalizeAnthropicModel(model) {
    const map = {
        'claude-opus-4': 'claude-opus-4-20250514',
        'claude-sonnet-4': 'claude-sonnet-4-20250514',
    };
    return map[model] || model;
}

function normalizeOpenAIModel(model) {
    const map = {
        'codex': 'gpt-4-turbo',
        'gpt-4': 'gpt-4-turbo',
    };
    return map[model] || model;
}

function formatToolForAnthropic(tool) {
    return {
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters || tool.input_schema || { type: 'object', properties: {} },
    };
}

function formatToolForOpenAI(tool) {
    return {
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters || { type: 'object', properties: {} },
        },
    };
}

function parseAnthropicResponse(data) {
    const result = {
        content: '',
        toolCalls: [],
        stopReason: data.stop_reason || 'end_turn',
    };

    if (Array.isArray(data.content)) {
        for (const block of data.content) {
            if (block.type === 'text') {
                result.content += block.text;
            } else if (block.type === 'tool_use') {
                result.toolCalls.push({
                    id: block.id,
                    name: block.name,
                    arguments: block.input,
                });
            }
        }
    }

    return result;
}

function parseOpenAIResponse(data) {
    const choice = data.choices?.[0];
    if (!choice) {
        throw new Error('No response from OpenAI');
    }

    const result = {
        content: choice.message?.content || '',
        toolCalls: [],
        stopReason: choice.finish_reason || 'stop',
    };

    if (choice.message?.tool_calls) {
        for (const tc of choice.message.tool_calls) {
            result.toolCalls.push({
                id: tc.id,
                name: tc.function.name,
                arguments: JSON.parse(tc.function.arguments || '{}'),
            });
        }
    }

    return result;
}

async function handleAnthropicStream(stream, onStream) {
    let fullContent = '';
    const toolCalls = [];
    let buffer = '';

    for await (const chunk of stream) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留不完整的行

        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
                const event = JSON.parse(data);

                if (event.type === 'content_block_delta') {
                    if (event.delta?.type === 'text_delta') {
                        fullContent += event.delta.text;
                        onStream({ type: 'text_delta', content: event.delta.text });
                    } else if (event.delta?.type === 'input_json_delta') {
                        // tool_use 的增量 JSON
                        onStream({ type: 'tool_delta', content: event.delta.partial_json });
                    }
                } else if (event.type === 'content_block_start') {
                    if (event.content_block?.type === 'tool_use') {
                        toolCalls.push({
                            id: event.content_block.id,
                            name: event.content_block.name,
                            arguments: {},
                            _jsonBuf: '',
                        });
                    }
                } else if (event.type === 'content_block_stop') {
                    // 完成一个 tool_use block 的 JSON 拼接
                    const lastTool = toolCalls[toolCalls.length - 1];
                    if (lastTool && lastTool._jsonBuf) {
                        try {
                            lastTool.arguments = JSON.parse(lastTool._jsonBuf);
                        } catch { /* partial json */ }
                        delete lastTool._jsonBuf;
                    }
                } else if (event.type === 'message_stop') {
                    onStream({ type: 'done' });
                }
            } catch { /* skip unparseable lines */ }
        }
    }

    return {
        content: fullContent,
        toolCalls: toolCalls.map(tc => ({ id: tc.id, name: tc.name, arguments: tc.arguments })),
        stopReason: toolCalls.length > 0 ? 'tool_use' : 'end_turn',
    };
}

async function handleOpenAIStream(stream, onStream) {
    let fullContent = '';
    const toolCalls = [];
    let buffer = '';

    for await (const chunk of stream) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
                onStream({ type: 'done' });
                continue;
            }

            try {
                const event = JSON.parse(data);
                const delta = event.choices?.[0]?.delta;

                if (delta?.content) {
                    fullContent += delta.content;
                    onStream({ type: 'text_delta', content: delta.content });
                }

                if (delta?.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        if (tc.index !== undefined) {
                            if (!toolCalls[tc.index]) {
                                toolCalls[tc.index] = {
                                    id: tc.id || '',
                                    name: tc.function?.name || '',
                                    _argsBuf: '',
                                };
                            }
                            if (tc.function?.arguments) {
                                toolCalls[tc.index]._argsBuf += tc.function.arguments;
                            }
                        }
                    }
                }
            } catch { /* skip */ }
        }
    }

    return {
        content: fullContent,
        toolCalls: toolCalls.map(tc => ({
            id: tc.id,
            name: tc.name,
            arguments: (() => { try { return JSON.parse(tc._argsBuf || '{}'); } catch { return {}; } })(),
        })),
        stopReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
    };
}

/**
 * 获取模型的推荐后端
 */
export function getModelBackend(model) {
    return MODEL_BACKEND_MAP[model] || MODEL_BACKENDS.ANTHROPIC;
}

/**
 * 获取所有支持的模型列表
 */
export function getSupportedModels() {
    return Object.keys(MODEL_BACKEND_MAP);
}

/**
 * 检查模型是否可用 (基于环境变量配置)
 */
export function isModelAvailable(model) {
    const backend = getModelBackend(model);
    const config = BACKEND_CONFIGS[backend];

    if (!config) return false;

    if (backend === MODEL_BACKENDS.CLAUDE_CODE) {
        // 检查 claude 命令是否可用
        return true; // 假设已安装
    }

    const apiKey = typeof config.getApiKey === 'function'
        ? config.getApiKey(getActiveProfile())
        : null;

    return !!apiKey;
}

export default {
    callLLM,
    getModelBackend,
    getSupportedModels,
    isModelAvailable,
    MODEL_BACKENDS,
};
