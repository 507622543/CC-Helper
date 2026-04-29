import execa from 'execa';
import { spawn } from 'child_process';
import { getActiveProfile, getProfileFormat, ensureProfileFormat } from './profile.js';
import { sendMonitorEvent } from './ccg.js';
import { ensureStatusLine } from './yolo.js';
import { t } from './i18n.js';
import { colors, symbols, divider } from './theme.js';

import fs from 'fs';
import path from 'path';
import os from 'os';
import { startOpenAIProxy, getProxyErrorState, resetProxyErrorState } from './adapter-proxy.js';
import { startAllMcpServices, stopMcpService } from './mcp-manager.js';
import { getLastSessionId } from './session-utils.js';
import { cleanApiEnvFromSettings } from './profile.js';
import { PROVIDER_ENV_KEYS, getCurrentCcSwitchProvider, getCcSwitchProviderSummary } from './ccswitch.js';

export const runClaude = async (options = {}) => {
    const useCcSwitch = options.configSource === 'ccswitch' || options.useCcSwitch;
    const profile = useCcSwitch ? null : getActiveProfile(options.sessionProfileName);
    const env = { ...process.env }; // Start with current env
    let proxyServer = null;
    let mcpProcesses = []; // Track spawned MCP child processes

    // --- Cleanup state (shared across signal handlers) ---
    let backupClaudeMd = null;
    let tempClaudeMdCreated = false;
    let backupSettingsLocal = null;
    let tempSettingsLocalCreated = false;
    let cleanupDone = false;
    const cwd = process.cwd();
    const claudeMdPath = path.join(cwd, 'CLAUDE.md');
    const projectClaudeDir = path.join(cwd, '.claude');
    const projectSettingsLocalPath = path.join(projectClaudeDir, 'settings.local.json');

    // Centralized cleanup function — safe to call multiple times
    const cleanup = async () => {
        if (cleanupDone) return;
        cleanupDone = true;

        // Restore CLAUDE.md
        if (tempClaudeMdCreated) {
            try {
                if (backupClaudeMd !== null) {
                    fs.writeFileSync(claudeMdPath, backupClaudeMd);
                } else {
                    fs.unlinkSync(claudeMdPath);
                }
            } catch {
                // ignore cleanup errors
            }
        }

        // Restore project-level settings.local.json
        if (tempSettingsLocalCreated) {
            try {
                if (backupSettingsLocal !== null) {
                    fs.writeFileSync(projectSettingsLocalPath, backupSettingsLocal);
                } else {
                    fs.unlinkSync(projectSettingsLocalPath);
                }
            } catch {
                // ignore cleanup errors
            }
        }

        // Kill Proxy
        if (proxyServer) {
            try { proxyServer.close(); } catch { }
        }

        // Kill MCP processes (no need to clean global settings.json
        // since MCP servers are now in project-level settings.local.json
        // which is restored by the backup/restore logic above)
        if (mcpProcesses.length > 0) {
            for (const { process: proc } of mcpProcesses) {
                stopMcpService(proc);
            }
        }

        // Notify Monitor End
        try {
            await sendMonitorEvent('end', profile, options.role || 'default');
        } catch { }
    };

    if (options.role && options.role !== 'default') {
        try {
            // Find role file
            // 1. Try absolute path
            // 2. Try in .claude/.ccg/prompts/claude/
            const homeDir = os.homedir();
            const rolePath = path.isAbsolute(options.role)
                ? options.role
                : path.join(homeDir, '.claude', '.ccg', 'prompts', 'claude', options.role.endsWith('.md') ? options.role : `${options.role}.md`);

            if (fs.existsSync(rolePath)) {
                console.log(colors.textDim(t('runner.loadingRole', { role: colors.primary(path.basename(rolePath)) })));
                const roleContent = fs.readFileSync(rolePath, 'utf8');

                // Backup existing CLAUDE.md
                if (fs.existsSync(claudeMdPath)) {
                    backupClaudeMd = fs.readFileSync(claudeMdPath, 'utf8');
                }

                // Write new CLAUDE.md with role content
                // If there was existing content, prepend or append? 
                // Usually Role definition is System Prompt, so it should be dominant.
                // We'll Prepend it if existing content exists, or just overwrite for this session.
                // Let's overwite/create for the session to ensure strict role adherence.
                fs.writeFileSync(claudeMdPath, roleContent);
                tempClaudeMdCreated = true;
            } else {
                console.log(colors.warning(`Role file not found: ${rolePath}`));
            }
        } catch (e) {
            console.error(colors.error('Failed to configure role:'), e.message);
        }
    }

    if (useCcSwitch) {
        for (const key of PROVIDER_ENV_KEYS) {
            delete env[key];
        }

        try {
            const provider = getCurrentCcSwitchProvider('claude');
            const summary = provider ? getCcSwitchProviderSummary(provider) : null;
            if (summary) {
                console.log(colors.textDim(t('runner.loadedProfile', { name: colors.primary(`CC Switch: ${summary.name}`) })));
                console.log(colors.textDim(t('runner.apiUrl', { url: colors.primary(summary.baseUrl || 'managed by CC Switch') })) + '\n');
            } else {
                console.log(colors.warning('CC Switch provider not selected. Open CC Switch or run: cchelper ccswitch use') + '\n');
            }
        } catch (e) {
            console.log(colors.warning(`Warning: Could not read CC Switch provider: ${e.message}`));
        }
    } else if (profile) {
        // Map profile fields to standard Environment Variables
        if (profile.url) {
            // Determine endpoint type from profile format:
            //   'anthropic'     → native Anthropic or third-party Anthropic-format proxy
            //   'openai-compat' → needs adapter proxy (Anthropic→OpenAI conversion)
            const format = await ensureProfileFormat(profile);
            const isOfficialAnthropic = profile.url.includes('api.anthropic.com');
            const isThirdPartyAnthropic = (format === 'anthropic') && !isOfficialAnthropic;
            const isOpenAICompat = (format === 'openai-compat');

            if (isOpenAICompat) {
                // OpenAI-compatible endpoint: start adapter proxy
                try {
                    const { url, server } = await startOpenAIProxy({
                        targetUrl: profile.url,
                        apiKey: profile.key || '',
                        port: 0 // random port
                    });
                    proxyServer = server;

                    // Point Claude CLI to our local proxy
                    env['CLAUDE_BASE_URL'] = url;
                    env['ANTHROPIC_BASE_URL'] = url;

                    console.log(colors.textDim(`${symbols.success} Adapter: ${url} → ${profile.url}`));
                } catch (e) {
                    console.error('Failed to start adapter:', e);
                }
                // REMOVED: env['OPENAI_BASE_URL'] = profile.url; (to avoid affecting Codex CLI)
            } else {
                // Anthropic format (official or third-party): direct connect, no adapter
                env['CLAUDE_BASE_URL'] = profile.url;
                env['ANTHROPIC_BASE_URL'] = profile.url;
            }

            // Suppress fingerprinting headers for ALL third-party endpoints
            // (both Anthropic-format and OpenAI-format third-party proxies).
            // Many providers detect Claude Code's native headers and reject requests.
            if (!isOfficialAnthropic) {
                env['CLAUDE_CODE_ATTRIBUTION_HEADER'] = '0';
                env['CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC'] = '1';
            }
        }
        // Handle OAuth or API key authentication
        if (profile.oauth) {
            // OAuth authentication
            const oauth = profile.oauth;

            // Check if token is expired
            if (oauth.expiresAt && Date.now() > oauth.expiresAt) {
                console.log(colors.warning('⚠ OAuth token expired. Please refresh your token.'));
            }

            // Use accessToken as API key
            env['CLAUDE_API_KEY'] = oauth.accessToken;
            env['ANTHROPIC_API_KEY'] = oauth.accessToken;
            console.log(colors.textDim('Using OAuth authentication'));
        } else if (profile.key) {
            // Standard API key authentication
            env['CLAUDE_API_KEY'] = profile.key;
            env['ANTHROPIC_API_KEY'] = profile.key;
            // REMOVED: env['OPENAI_API_KEY'] = profile.key; (to avoid affecting Codex CLI)
        }

        // Set Opus/Sonnet models if specified
        if (options.opusModel) {
            env['ANTHROPIC_DEFAULT_OPUS_MODEL'] = options.opusModel;
            console.log(colors.textDim(t('runner.usingOpusModel', { model: colors.primary(options.opusModel) })));
        }
        if (options.sonnetModel) {
            env['ANTHROPIC_DEFAULT_SONNET_MODEL'] = options.sonnetModel;
            console.log(colors.textDim(t('runner.usingSonnetModel', { model: colors.primary(options.sonnetModel) })));
        }

        console.log(colors.textDim(t('runner.loadedProfile', { name: colors.primary(profile.name) })));
        console.log(colors.textDim(t('runner.apiUrl', { url: colors.primary(profile.url) })) + '\n');
    } else {
        console.log(colors.warning(t('runner.noActiveProfile')) + '\n');
    }

    const command = options.command || 'claude';
    const args = [...(options.args || [])];

    // Pass selected Opus model to Claude Code via --model flag
    // ANTHROPIC_DEFAULT_OPUS_MODEL env var alone is not recognized by Claude Code;
    // the --model CLI flag is the official way to specify the model.
    if (options.opusModel && !args.includes('--model')) {
        args.push('--model', options.opusModel);
    }

    // Start MCP services (URLs will be injected into project-level settings below)
    let mcpServerList = [];
    try {
        const started = await startAllMcpServices();
        if (started.length > 0) {
            mcpServerList = started.map(s => ({ name: s.name, url: s.url }));
            // Track only processes we actually spawned (not already-running ones)
            mcpProcesses = started.filter(s => s.process !== null);
        }
    } catch (err) {
        console.error(colors.warning(`Warning: MCP startup error: ${err.message}`));
    }

    console.log(colors.primary(`${symbols.arrowRight} ${t('runner.starting', { command: colors.text(command) })}`) + '\n');
    console.log(divider(50) + '\n');

    // Notify Monitor
    await sendMonitorEvent('start', profile, options.role || 'default');

    // Deploy and configure native statusline
    ensureStatusLine();

    // Clean residual API env from settings.json AFTER all settings.json writes
    // (ensureStatusLine may read+write settings.json, so cleanup must come last)
    cleanApiEnvFromSettings();

    // Create project-level .claude/settings.local.json for instance isolation.
    // This ensures each cchelper instance uses its own API config even when
    // multiple windows run with different profiles simultaneously.
    if (profile) {
        try {
            fs.mkdirSync(projectClaudeDir, { recursive: true });

            // Backup existing settings.local.json
            if (fs.existsSync(projectSettingsLocalPath)) {
                backupSettingsLocal = fs.readFileSync(projectSettingsLocalPath, 'utf8');
            }

            // Read global settings for model defaults
            const homeDir = os.homedir();
            const globalSettingsFile = path.join(homeDir, '.claude', 'settings.json');
            let globalOpusModel = null;
            let globalSonnetModel = null;
            try {
                if (fs.existsSync(globalSettingsFile)) {
                    const gs = JSON.parse(fs.readFileSync(globalSettingsFile, 'utf8'));
                    globalOpusModel = gs?.env?.ANTHROPIC_DEFAULT_OPUS_MODEL || null;
                    globalSonnetModel = gs?.env?.ANTHROPIC_DEFAULT_SONNET_MODEL || null;
                }
            } catch { /* non-fatal */ }

            const localSettings = { env: {} };
            if (env['ANTHROPIC_API_KEY']) localSettings.env.ANTHROPIC_API_KEY = env['ANTHROPIC_API_KEY'];
            if (env['ANTHROPIC_BASE_URL']) localSettings.env.ANTHROPIC_BASE_URL = env['ANTHROPIC_BASE_URL'];
            if (env['CLAUDE_BASE_URL']) localSettings.env.CLAUDE_BASE_URL = env['CLAUDE_BASE_URL'];
            if (env['CLAUDE_API_KEY']) localSettings.env.CLAUDE_API_KEY = env['CLAUDE_API_KEY'];
            if (options.opusModel) {
                localSettings.env.ANTHROPIC_DEFAULT_OPUS_MODEL = options.opusModel;
            } else if (globalOpusModel) {
                localSettings.env.ANTHROPIC_DEFAULT_OPUS_MODEL = globalOpusModel;
            }
            if (options.sonnetModel) {
                localSettings.env.ANTHROPIC_DEFAULT_SONNET_MODEL = options.sonnetModel;
            } else if (globalSonnetModel) {
                localSettings.env.ANTHROPIC_DEFAULT_SONNET_MODEL = globalSonnetModel;
            }

            // Suppress fingerprinting for third-party endpoints
            const isOfficialAnthropic = profile.url?.includes('api.anthropic.com');
            if (profile.url && !isOfficialAnthropic) {
                localSettings.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
                localSettings.env.CLAUDE_CODE_ATTRIBUTION_HEADER = '0';
            }

            fs.writeFileSync(projectSettingsLocalPath, JSON.stringify(localSettings, null, 2), 'utf8');
            tempSettingsLocalCreated = true;

            // Inject MCP servers into project-level settings (not global)
            if (mcpServerList.length > 0) {
                try {
                    const currentLocal = JSON.parse(fs.readFileSync(projectSettingsLocalPath, 'utf8'));
                    if (!currentLocal.mcpServers) currentLocal.mcpServers = {};
                    for (const { name, url } of mcpServerList) {
                        currentLocal.mcpServers[name] = { type: 'sse', url };
                        console.log(colors.textDim(`  → MCP "${name}": ${url}`));
                    }
                    fs.writeFileSync(projectSettingsLocalPath, JSON.stringify(currentLocal, null, 2), 'utf8');
                } catch { /* non-fatal */ }
            }

            console.log(colors.textDim(`${symbols.success} Session config isolated in ${projectClaudeDir}`));
        } catch (e) {
            console.log(colors.warning(`Warning: Could not create session settings: ${e.message}`));
        }
    }

    // Reset proxy error state for this session
    resetProxyErrorState();

    // Register signal handlers for cleanup
    const signalHandler = async () => {
        await cleanup();
    };
    process.on('SIGINT', signalHandler);
    process.on('SIGTERM', signalHandler);

    return new Promise((resolve, reject) => {
        try {
            // Use stdio: 'inherit' for full TTY passthrough
            // Token tracking is handled by Claude Code's native statusline hook
            const subprocess = spawn(command, args, {
                env,
                stdio: 'inherit',
                shell: true
            });

            subprocess.on('close', async (code) => {
                // Remove signal handlers
                process.removeListener('SIGINT', signalHandler);
                process.removeListener('SIGTERM', signalHandler);

                console.log('\n' + divider(50));

                // Collect proxy error state
                const proxyErrors = getProxyErrorState();

                // Get last sessionId for potential resume
                let lastSessionId = null;
                try {
                    lastSessionId = await getLastSessionId(cwd);
                } catch { }

                if (code === 0) {
                    console.log(colors.success(`\n${symbols.success} ${t('runner.sessionCompleted')}\n`));
                } else {
                    console.log(colors.warning(`\n${symbols.warning} ${t('runner.exitedWithCode', { code })}\n`));
                }

                await cleanup().catch(() => { });

                resolve({ exitCode: code, proxyErrors, lastSessionId });
            });

            subprocess.on('error', async (error) => {
                // Remove signal handlers
                process.removeListener('SIGINT', signalHandler);
                process.removeListener('SIGTERM', signalHandler);

                console.log('\n' + divider(50));
                console.error(colors.error(`\n${symbols.error} ${t('runner.failedToRun', { command })}`), error.message);

                if (error.message.includes('ENOENT')) {
                    console.log(colors.warning(`\n${symbols.warning} ${t('runner.troubleshooting')}`));
                    console.log(colors.textDim(`  ${symbols.bullet} ${t('runner.ensureInstalled', { command })}`));
                    console.log(colors.textDim(`  ${symbols.bullet} ${t('runner.tryRunning')}`));
                    console.log(colors.textDim(`  ${symbols.bullet} ${t('runner.visitDocs')}\n`));
                }

                await cleanup().catch(() => { });

                reject(error);
            });

        } catch (e) {
            // Remove signal handlers
            process.removeListener('SIGINT', signalHandler);
            process.removeListener('SIGTERM', signalHandler);

            console.log('\n' + divider(50));
            console.error(colors.error(`\n${symbols.error} ${t('runner.failedToRun', { command })}`), e.message);

            if (e.message.includes('ENOENT')) {
                console.log(colors.warning(`\n${symbols.warning} ${t('runner.troubleshooting')}`));
                console.log(colors.textDim(`  ${symbols.bullet} ${t('runner.ensureInstalled', { command })}`));
                console.log(colors.textDim(`  ${symbols.bullet} ${t('runner.tryRunning')}`));
                console.log(colors.textDim(`  ${symbols.bullet} ${t('runner.visitDocs')}\n`));
            }

            cleanup().catch(() => { });

            reject(e);
        }
    });
};

export const checkClaudeInstallation = async () => {
    try {
        const result = await execa('claude', ['--version'], { reject: false });
        return {
            installed: result.exitCode === 0,
            version: result.stdout.trim()
        };
    } catch (e) {
        return {
            installed: false,
            version: null
        };
    }
};
