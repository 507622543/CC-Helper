import Conf from 'conf';
import chalk from 'chalk';
import { t } from './i18n.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';

const config = new Conf({ projectName: 'cc-helper' });

export const getProfiles = () => config.get('profiles', []);
export const getActiveProfileName = () => config.get('activeProfile');

export const getActiveProfile = (name) => {
    const profiles = getProfiles();
    const activeName = name || getActiveProfileName();
    return profiles.find(p => p.name === activeName);
};

/**
 * Detects whether an endpoint uses Anthropic format or OpenAI-compatible format.
 * @param {object} profile - Profile with url and key
 * @returns {Promise<'anthropic'|'openai-compat'>}
 */
export const detectEndpointFormat = async (profile) => {
    if (!profile?.url) return 'openai-compat';

    // api.anthropic.com is always anthropic
    if (profile.url.includes('api.anthropic.com')) return 'anthropic';

    // Auto-detect via testAnthropicEndpoint
    try {
        const isAnthropic = await testAnthropicEndpoint(profile);
        return isAnthropic ? 'anthropic' : 'openai-compat';
    } catch {
        return 'openai-compat';
    }
};

/**
 * Returns the effective format of a profile.
 * If the profile has a stored format, use it. Otherwise fallback to 'openai-compat'.
 * Call detectEndpointFormat() for reliable auto-detection (requires network).
 */
export const getProfileFormat = (profile) => {
    if (!profile) return 'openai-compat';
    if (profile.format) return profile.format;
    // Legacy profiles without format field: check URL as heuristic
    if (profile.url && profile.url.includes('api.anthropic.com')) return 'anthropic';
    return 'openai-compat';
};

/**
 * Ensures a profile has a `format` field. If missing, auto-detects via network
 * and persists the result. Called lazily before launching Claude.
 * @param {object} profile - Profile object (mutated in-place)
 * @returns {Promise<string>} The detected or existing format
 */
export const ensureProfileFormat = async (profile) => {
    if (!profile) return 'openai-compat';
    if (profile.format) return profile.format;

    // Legacy profile: auto-detect and persist
    try {
        console.log(chalk.cyan('  → Detecting endpoint format (one-time migration)...'));
        profile.format = await detectEndpointFormat(profile);
        console.log(chalk.green(`  → Format: ${profile.format}`));

        // Persist to config
        const profiles = getProfiles();
        const idx = profiles.findIndex(p => p.name === profile.name);
        if (idx !== -1) {
            profiles[idx].format = profile.format;
            config.set('profiles', profiles);
        }
    } catch {
        profile.format = getProfileFormat(profile);
    }
    return profile.format;
};

export const addProfile = async (profile) => {
    const profiles = getProfiles();
    if (profiles.find(p => p.name === profile.name)) {
        throw new Error(t('profile.alreadyExists', { name: profile.name }));
    }

    // Handle OAuth profile
    if (profile.oauth) {
        // OAuth profile: set format to anthropic and use api.anthropic.com
        profile.format = 'anthropic';
        profile.url = profile.url || 'https://api.anthropic.com';
        console.log(chalk.cyan('  → OAuth profile detected'));
    } else if (!profile.format && profile.url && profile.key) {
        // Auto-detect endpoint format if not specified
        try {
            console.log(chalk.cyan('  → Detecting endpoint format...'));
            profile.format = await detectEndpointFormat(profile);
            console.log(chalk.green(`  → Format: ${profile.format}`));
        } catch {
            profile.format = 'openai-compat';
        }
    }

    profiles.push(profile);
    config.set('profiles', profiles);
    if (profiles.length === 1) {
        await setActiveProfile(profile.name);
        // Sync is handled by setActiveProfile
    }
};

export const setActiveProfile = async (name) => {
    const profiles = getProfiles();
    const profile = profiles.find(p => p.name === name);
    if (!profile) {
        throw new Error(t('profile.notFound', { name }));
    }
    config.set('activeProfile', name);

    // Sync profile to Claude settings.json
    await syncProfileToClaudeSettings(profile);

    console.log(chalk.green(`✓ ${t('profile.switchedTo', { name })}`));
    return name;
};

export const listProfiles = () => {
    const profiles = getProfiles();
    const active = getActiveProfileName();
    return profiles.map(p => ({
        ...p,
        isActive: p.name === active
    }));
};

export const deleteProfile = async (name) => {
    const profiles = getProfiles();
    const filtered = profiles.filter(p => p.name !== name);

    if (filtered.length === profiles.length) {
        throw new Error(t('profile.notFound', { name }));
    }

    config.set('profiles', filtered);

    // If deleted profile was active, clear active profile or set to first available
    const activeName = getActiveProfileName();
    if (activeName === name) {
        if (filtered.length > 0) {
            await setActiveProfile(filtered[0].name);
        } else {
            config.delete('activeProfile');
            clearClaudeSettings();
            console.log(chalk.yellow(t('profile.noRemaining')));
        }
    }
};

export const editProfile = async (name, updates) => {
    const profiles = getProfiles();
    const idx = profiles.findIndex(p => p.name === name);
    if (idx === -1) {
        throw new Error(t('profile.notFound', { name }));
    }

    // Track if URL or key changed (need to re-detect format)
    const urlChanged = updates.url && updates.url !== profiles[idx].url;
    const keyChanged = updates.key && updates.key !== profiles[idx].key;

    // Apply updates (only non-empty values)
    if (updates.url) profiles[idx].url = updates.url;
    if (updates.key) profiles[idx].key = updates.key;
    if (updates.model !== undefined) {
        if (updates.model) {
            profiles[idx].model = updates.model;
        } else {
            delete profiles[idx].model; // Empty string = clear manual override
        }
    }
    if (updates.format) {
        profiles[idx].format = updates.format;
    }

    // Handle OAuth updates
    if (updates.oauth) {
        profiles[idx].oauth = updates.oauth;
        profiles[idx].format = 'anthropic';
        console.log(chalk.cyan('  → OAuth credentials updated'));
    }

    // Re-detect format if URL or key changed and no explicit format override
    if ((urlChanged || keyChanged) && !updates.format && !updates.oauth) {
        try {
            console.log(chalk.cyan('  → Re-detecting endpoint format...'));
            profiles[idx].format = await detectEndpointFormat(profiles[idx]);
            console.log(chalk.green(`  → Format: ${profiles[idx].format}`));
        } catch {
            // Keep existing format on detection failure
        }
    }

    config.set('profiles', profiles);

    // If this is the active profile, re-sync to Claude settings
    const activeName = getActiveProfileName();
    if (activeName === name) {
        await syncProfileToClaudeSettings(profiles[idx]);
    }

    return profiles[idx];
};

// --- Sync Profile to Claude Settings ---

/**
 * Cleans global ~/.claude/settings.json of any instance-specific data.
 *
 * In the multi-instance model, ALL instance-specific config (API keys, URLs,
 * model defaults, MCP servers) is passed exclusively via:
 *   - Process env vars at spawn time
 *   - Project-level .claude/settings.local.json
 *
 * Global settings.json should only contain shared, non-instance-specific
 * settings (statusLine, plugins, permissions, etc.).
 */
export const syncProfileToClaudeSettings = async (profile) => {
    if (!profile) return;

    const homeDir = os.homedir();
    const claudeDir = path.join(homeDir, '.claude');
    const settingsFile = path.join(claudeDir, 'settings.json');

    try {
        // Ensure .claude directory exists
        if (!fs.existsSync(claudeDir)) {
            fs.mkdirSync(claudeDir, { recursive: true });
        }

        // Read existing settings or create new
        let settings = {};
        if (fs.existsSync(settingsFile)) {
            try {
                settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
            } catch {
                settings = {};
            }
        }

        if (!settings.env) {
            settings.env = {};
        }

        // Remove ALL instance-specific env vars from global settings.
        // These are now managed per-instance via project-level settings.
        delete settings.env.ANTHROPIC_BASE_URL;
        delete settings.env.ANTHROPIC_API_KEY;
        delete settings.env.CLAUDE_BASE_URL;
        delete settings.env.CLAUDE_API_KEY;
        delete settings.env.ANTHROPIC_DEFAULT_OPUS_MODEL;
        delete settings.env.ANTHROPIC_DEFAULT_SONNET_MODEL;

        // Clean up empty env object
        if (Object.keys(settings.env).length === 0) {
            delete settings.env;
        }

        fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
    } catch (error) {
        console.error(chalk.yellow(`Warning: Could not sync profile to settings.json: ${error.message}`));
    }
};

/**
 * Clears ANTHROPIC_BASE_URL and ANTHROPIC_API_KEY from ~/.claude/settings.json
 * Called when the last profile is deleted
 */
export const clearClaudeSettings = () => {
    const homeDir = os.homedir();
    const settingsFile = path.join(homeDir, '.claude', 'settings.json');

    try {
        if (!fs.existsSync(settingsFile)) return;

        let settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));

        if (settings.env) {
            delete settings.env.ANTHROPIC_BASE_URL;
            delete settings.env.ANTHROPIC_API_KEY;

            // If env is now empty, remove it entirely
            if (Object.keys(settings.env).length === 0) {
                delete settings.env;
            }
        }

        fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
    } catch (error) {
        // Non-fatal
        console.error(chalk.yellow(`Warning: Could not clear settings.json: ${error.message}`));
    }
};

// --- URL Normalization ---

/**
 * Normalizes API base URL to ensure correct path structure
 * Prevents duplicate /v1 paths in API requests
 *
 * @param {string} baseUrl - The base URL to normalize
 * @returns {string} Normalized URL ending with /v1 (without trailing slash)
 *
 * Examples:
 * - https://api.example.com → https://api.example.com/v1
 * - https://api.example.com/ → https://api.example.com/v1
 * - https://api.example.com/v1 → https://api.example.com/v1
 * - https://api.example.com/v1/ → https://api.example.com/v1
 */
export const normalizeApiUrl = (baseUrl) => {
    if (!baseUrl) return baseUrl;

    // Remove trailing slashes
    let normalized = baseUrl.replace(/\/+$/, '');

    // Strip known endpoint suffixes — users sometimes paste full endpoint URLs
    // e.g. https://api.example.com/v1/messages → https://api.example.com/v1
    //      https://api.example.com/v1/chat/completions → https://api.example.com/v1
    normalized = normalized.replace(/\/v1\/messages$/, '/v1');
    normalized = normalized.replace(/\/v1\/chat\/completions$/, '/v1');

    // Check if URL already ends with /v1
    if (normalized.endsWith('/v1')) {
        return normalized;
    }

    // Add /v1 if not present
    return `${normalized}/v1`;
};

/**
 * Strips known endpoint path suffixes from a base URL.
 * Ensures a clean base suitable for appending /v1/messages, /v1/models, etc.
 * @param {string} url - Raw URL that might contain endpoint paths
 * @returns {string} Clean base URL without trailing slash or endpoint paths
 */
const stripEndpointPaths = (url) => {
    if (!url) return url;
    let clean = url.replace(/\/+$/, '');
    clean = clean.replace(/\/v1\/messages$/, '');
    clean = clean.replace(/\/v1\/chat\/completions$/, '');
    clean = clean.replace(/\/v1\/models(\/.*)?$/, '');
    clean = clean.replace(/\/v1$/, '');
    return clean;
};

/**
 * Builds the correct /v1/messages endpoint URL from any base URL variant.
 * Handles cases where users paste full endpoint URLs.
 */
const buildMessagesUrl = (rawUrl) => {
    return stripEndpointPaths(rawUrl) + '/v1/messages';
};

/**
 * Builds the correct /v1/chat/completions endpoint URL from any base URL variant.
 */
const buildChatCompletionsUrl = (rawUrl) => {
    return stripEndpointPaths(rawUrl) + '/v1/chat/completions';
};

/**
 * Builds the correct /v1/models endpoint URL from any base URL variant.
 */
const buildModelsUrl = (rawUrl) => {
    return stripEndpointPaths(rawUrl) + '/v1/models';
};

// --- Model Detection ---

/**
 * Known Opus model IDs in order of preference (newest first)
 */
const OPUS_MODELS = [
    'claude-opus-4-6',           // Latest (no date suffix on some proxies)
    'claude-opus-4-6-20250116',  // With date suffix
    'claude-opus-4-5-20251101',
    'claude-opus-4-1-20250805',
    'claude-opus-4-20250514',
    'claude-3-opus-20240229',
];

/**
 * Known Sonnet model IDs in order of preference (newest first)
 */
const SONNET_MODELS = [
    'claude-sonnet-4-6',
    'claude-sonnet-4-6-20250514',
    'claude-sonnet-4-5-20250929',
    'claude-3-7-sonnet-20250219',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-sonnet-latest',
];

/**
 * Queries upstream API for available models
 * @param {object} profile - Profile with url and key
 * @returns {Promise<string[]>} List of model IDs, or empty array on failure
 */
export const queryUpstreamModels = async (profile) => {
    if (!profile?.url || !profile?.key) {
        return [];
    }

    try {
        const modelsUrl = buildModelsUrl(profile.url);

        const response = await axios.get(modelsUrl, {
            headers: {
                'Authorization': `Bearer ${profile.key}`,
                'Content-Type': 'application/json'
            },
            timeout: 8000,
            validateStatus: () => true
        });

        if (response.status >= 200 && response.status < 300 && response.data?.data) {
            return response.data.data
                .filter(m => m.id && m.id.toLowerCase().includes('claude'))
                .map(m => m.id);
        }

        return [];
    } catch (error) {
        console.error(chalk.yellow(`Warning: Could not query upstream models: ${error.message}`));
        return [];
    }
};

/**
 * Tests whether an endpoint supports the Anthropic Messages API format (POST /v1/messages).
 * Many third-party proxies support both Anthropic and OpenAI formats,
 * while some only support OpenAI (chat/completions).
 * @param {object} profile - Profile with url and key
 * @returns {Promise<boolean>} true if /v1/messages is supported
 */
export const testAnthropicEndpoint = async (profile) => {
    if (!profile?.url || !profile?.key) return false;

    // api.anthropic.com always supports it
    if (profile.url.includes('api.anthropic.com')) return true;

    try {
        const messagesUrl = buildMessagesUrl(profile.url);

        const cancelSource = axios.CancelToken.source();
        // Cancel after 8s to avoid SSE streaming hangs
        const cancelTimer = setTimeout(() => cancelSource.cancel('timeout'), 8000);

        try {
            const response = await axios.post(messagesUrl, {
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 1,
                stream: false,
                messages: [{ role: 'user', content: 'hi' }]
            }, {
                headers: {
                    'x-api-key': profile.key,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                },
                timeout: 8000,
                cancelToken: cancelSource.token,
                validateStatus: () => true,
                // Limit response size to avoid huge SSE buffer
                maxContentLength: 10000,
                maxBodyLength: 10000
            });

            clearTimeout(cancelTimer);

            // Any HTTP response means the endpoint accepted the route.
            // Check for explicit route rejection in body.
            const status = response.status;
            if (status >= 200 && status < 300) return true;
            if (status === 401 || status === 403 || status === 429) return true;

            const body = typeof response.data === 'string'
                ? response.data
                : JSON.stringify(response.data || '');
            const bodyLower = body.toLowerCase();

            // Only "invalid url" or "cannot post" means the route doesn't exist.
            // Do NOT check for generic "not found" — model-not-found still means the endpoint exists.
            if (bodyLower.includes('invalid url') || bodyLower.includes('cannot post')) {
                return false;
            }

            return true;
        } catch (err) {
            clearTimeout(cancelTimer);
            // If cancelled due to our timer or content-length exceeded,
            // that means the server was actively responding → endpoint exists
            if (axios.isCancel(err)) return true;
            if (err.code === 'ERR_BAD_RESPONSE') return true;
            throw err;
        }
    } catch {
        return false;
    }
};

/**
 * Verifies a specific model is actually usable on the upstream endpoint
 * (not just listed in /v1/models, but can handle a real request with non-empty output)
 * @param {object} profile - Profile with url and key
 * @param {string} modelId - Model ID to verify
 * @param {boolean} [useAnthropicFormat] - Force Anthropic format (true) or OpenAI format (false). If omitted, auto-detect by domain.
 * @returns {Promise<boolean>} true if the model actually works and produces output
 */
export const verifyModelAvailability = async (profile, modelId, useAnthropicFormat) => {
    if (!profile?.url || !profile?.key || !modelId) return false;

    try {
        const baseUrl = stripEndpointPaths(profile.url);
        const isAnthropic = useAnthropicFormat !== undefined
            ? useAnthropicFormat
            : baseUrl.includes('api.anthropic.com');

        const cancelSource = axios.CancelToken.source();
        const cancelTimer = setTimeout(() => cancelSource.cancel('timeout'), 15000);

        try {
            let response;
            if (isAnthropic) {
                const messagesUrl = buildMessagesUrl(profile.url);
                response = await axios.post(messagesUrl, {
                    model: modelId,
                    max_tokens: 5,
                    stream: false,
                    messages: [{ role: 'user', content: 'Say hi' }]
                }, {
                    headers: {
                        'x-api-key': profile.key,
                        'anthropic-version': '2023-06-01',
                        'content-type': 'application/json'
                    },
                    timeout: 15000,
                    cancelToken: cancelSource.token,
                    validateStatus: () => true,
                    maxContentLength: 10000
                });
            } else {
                const chatUrl = buildChatCompletionsUrl(profile.url);
                response = await axios.post(chatUrl, {
                    model: modelId,
                    max_tokens: 5,
                    stream: false,
                    messages: [{ role: 'user', content: 'Say hi' }]
                }, {
                    headers: {
                        'Authorization': `Bearer ${profile.key}`,
                        'content-type': 'application/json'
                    },
                    timeout: 15000,
                    cancelToken: cancelSource.token,
                    validateStatus: () => true,
                    maxContentLength: 10000
                });
            }

            clearTimeout(cancelTimer);

            if (response.status < 200 || response.status >= 300) {
                return false;
            }

            // Check for "200 but empty content" — some providers list models
            // that return 200 with completion_tokens=0 and empty content.
            const data = response.data;
            if (data) {
                // OpenAI format: check choices[0].message.content and usage.completion_tokens
                if (data.choices) {
                    const content = data.choices[0]?.message?.content || '';
                    const outTokens = data.usage?.completion_tokens || 0;
                    if (content === '' && outTokens === 0) {
                        return false; // Model listed but not actually generating output
                    }
                }
                // Anthropic format: check content[0].text and usage.output_tokens
                if (data.content) {
                    const text = data.content[0]?.text || '';
                    const outTokens = data.usage?.output_tokens || 0;
                    if (text === '' && outTokens === 0) {
                        return false;
                    }
                }
            }

            return true;
        } catch (err) {
            clearTimeout(cancelTimer);
            // If cancelled by our timer, the server was actively responding → model works
            if (axios.isCancel(err)) return true;
            throw err;
        }
    } catch {
        return false;
    }
};

/**
 * Determines the best Opus model based on upstream availability
 * @param {string[]} upstreamModels - List of model IDs from upstream
 * @returns {string|null} Best Opus model ID, or null if none available
 */
export const getDefaultOpusModel = (upstreamModels) => {
    if (!upstreamModels || upstreamModels.length === 0) {
        // Fallback to latest when upstream query fails
        return OPUS_MODELS[0];
    }

    const upstreamLower = upstreamModels.map(m => m.toLowerCase());

    // Check each Opus model in order of preference
    for (const opus of OPUS_MODELS) {
        if (upstreamLower.includes(opus.toLowerCase())) {
            return opus;
        }
    }

    // If no exact match, try fuzzy match
    for (const opus of OPUS_MODELS) {
        const version = opus.match(/opus-(\d+-\d+)/)?.[1] || opus.match(/opus-(\d+)/)?.[1];
        if (version) {
            const found = upstreamLower.find(m => m.includes('opus') && m.includes(version.replace('-', '.')));
            if (found) {
                return opus;
            }
        }
    }

    // No Opus available
    return null;
};

/**
 * Determines the best Sonnet model based on upstream availability
 * @param {string[]} upstreamModels - List of model IDs from upstream
 * @returns {string|null} Best Sonnet model ID, or null if none available
 */
export const getDefaultSonnetModel = (upstreamModels) => {
    if (!upstreamModels || upstreamModels.length === 0) {
        return SONNET_MODELS[0];
    }
    const upstreamLower = upstreamModels.map(m => m.toLowerCase());
    for (const sonnet of SONNET_MODELS) {
        if (upstreamLower.includes(sonnet.toLowerCase())) {
            return sonnet;
        }
    }
    // Fuzzy match
    for (const sonnet of SONNET_MODELS) {
        const version = sonnet.match(/sonnet-(\d+-\d+)/)?.[1] || sonnet.match(/sonnet-(\d+)/)?.[1];
        if (version) {
            const found = upstreamLower.find(m => m.includes('sonnet') && m.includes(version.replace('-', '.')));
            if (found) return sonnet;
        }
    }
    return null;
};

// --- API Env Cleanup for Multi-Instance Isolation ---

/**
 * Removes ALL instance-specific env vars from ~/.claude/settings.json
 * to prevent Claude Code from reading stale/conflicting values.
 *
 * In the multi-instance model, all instance-specific config is passed
 * exclusively via process env vars and project-level settings.local.json.
 * Global settings.json should NOT contain these values.
 *
 * This function is called by runner.js and yolo.js before spawning Claude Code.
 */
export const cleanApiEnvFromSettings = () => {
    const homeDir = os.homedir();
    const settingsFile = path.join(homeDir, '.claude', 'settings.json');

    try {
        if (!fs.existsSync(settingsFile)) return;

        const raw = fs.readFileSync(settingsFile, 'utf8');
        const settings = JSON.parse(raw);

        if (!settings.env) return;

        const keysToRemove = [
            'ANTHROPIC_BASE_URL',
            'ANTHROPIC_API_KEY',
            'CLAUDE_BASE_URL',
            'CLAUDE_API_KEY',
            'ANTHROPIC_DEFAULT_OPUS_MODEL',
            'ANTHROPIC_DEFAULT_SONNET_MODEL',
        ];

        let changed = false;
        for (const key of keysToRemove) {
            if (key in settings.env) {
                delete settings.env[key];
                changed = true;
            }
        }

        if (changed) {
            // Clean up empty env object
            if (Object.keys(settings.env).length === 0) {
                delete settings.env;
            }
            fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
        }
    } catch (error) {
        // Non-fatal: log but don't throw
        console.error(chalk.yellow(`Warning: Could not clean API env from settings.json: ${error.message}`));
    }
};

// --- MCP Server Injection ---

/**
 * Writes mcpServers into ~/.claude/settings.json so Claude Code picks them up.
 * @param {Array<{ name: string, url: string }>} mcpList
 */
export const injectMcpServers = (mcpList) => {
    if (!mcpList || mcpList.length === 0) return;

    const homeDir = os.homedir();
    const settingsFile = path.join(homeDir, '.claude', 'settings.json');

    try {
        let settings = {};
        if (fs.existsSync(settingsFile)) {
            try { settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch { settings = {}; }
        }

        if (!settings.mcpServers) settings.mcpServers = {};

        for (const { name, url } of mcpList) {
            settings.mcpServers[name] = { type: 'sse', url };
            console.log(chalk.cyan(`  → MCP "${name}": ${url}`));
        }

        fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
    } catch (err) {
        console.error(chalk.yellow(`Warning: Could not inject mcpServers: ${err.message}`));
    }
};

/**
 * Removes cchelper-managed MCP entries from ~/.claude/settings.json.
 * @param {string[]} names - Service names to remove (removes all mcpServers if omitted)
 */
export const clearMcpServers = (names) => {
    const homeDir = os.homedir();
    const settingsFile = path.join(homeDir, '.claude', 'settings.json');

    try {
        if (!fs.existsSync(settingsFile)) return;
        let settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));

        if (!settings.mcpServers) return;

        if (names && names.length > 0) {
            for (const name of names) {
                delete settings.mcpServers[name];
            }
            if (Object.keys(settings.mcpServers).length === 0) {
                delete settings.mcpServers;
            }
        } else {
            delete settings.mcpServers;
        }

        fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
    } catch (err) {
        console.error(chalk.yellow(`Warning: Could not clear mcpServers: ${err.message}`));
    }
};

/**
 * Generic function to query available models for a specific tier
 * @param {string} tier - 'opus' | 'sonnet'
 * @param {string[]} candidateList - List of candidate models
 * @param {object|string} profileOrName - Profile object or name
 * @returns {Promise<{models: string[], recommended: string|null}>}
 */
const queryAvailableModelsInternal = async (tier, candidateList, profileOrName) => {
    const targetProfile = typeof profileOrName === 'string'
        ? getActiveProfile(profileOrName)
        : (profileOrName || getActiveProfile());

    if (!targetProfile?.url || !targetProfile?.key) {
        return { models: [], recommended: null };
    }

    const upstreamModels = await queryUpstreamModels(targetProfile);
    if (!upstreamModels || upstreamModels.length === 0) {
        return { models: [], recommended: candidateList[0] };
    }

    const upstreamLower = upstreamModels.map(m => m.toLowerCase());
    const available = [];

    for (const model of candidateList) {
        if (upstreamLower.includes(model.toLowerCase())) {
            available.push(model);
        }
    }

    for (const upstream of upstreamModels) {
        const lower = upstream.toLowerCase();
        if (lower.includes(tier) && !available.find(a => a.toLowerCase() === lower)) {
            if (lower.startsWith('claude') && !lower.includes('gemini') && !lower.includes('thinking')) {
                available.push(upstream);
            }
        }
    }

    const supportsAnthropic = await testAnthropicEndpoint(targetProfile);
    const verified = [];
    for (let i = 0; i < available.length; i++) {
        const model = available[i];
        console.log(chalk.cyan(`  → [${i + 1}/${available.length}] ${model}...`));
        const ok = await verifyModelAvailability(targetProfile, model, supportsAnthropic);
        if (ok) {
            verified.push(model);
            console.log(chalk.green(`    ✓ ${model}`));
        } else {
            console.log(chalk.yellow(`    △ ${model} (empty/unavailable)`));
        }
    }

    const finalModels = verified.length > 0 ? verified : available;
    const recommended = finalModels.length > 0 ? finalModels[0] : null;

    return { models: finalModels, recommended };
};

/**
 * Queries upstream API and returns available Opus models
 */
export const queryAvailableOpusModels = (profileOrName) => {
    return queryAvailableModelsInternal('opus', OPUS_MODELS, profileOrName);
};

/**
 * Queries upstream API and returns available Sonnet models
 */
export const queryAvailableSonnetModels = (profileOrName) => {
    return queryAvailableModelsInternal('sonnet', SONNET_MODELS, profileOrName);
};
