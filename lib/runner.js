import execa from 'execa';
import { spawn } from 'child_process';
import { getActiveProfile } from './profile.js';
import { sendMonitorEvent } from './ccg.js';
import { ensureStatusLine } from './yolo.js';
import { t } from './i18n.js';
import { colors, symbols, divider } from './theme.js';

import fs from 'fs';
import path from 'path';
import os from 'os';
import { startOpenAIProxy } from './adapter-proxy.js';

export const runClaude = async (options = {}) => {
    const profile = getActiveProfile();
    const env = { ...process.env }; // Start with current env
    let proxyServer = null;

    // --- Role Configuration Injection ---

    // --- Role Configuration Injection ---
    let backupClaudeMd = null;
    let tempClaudeMdCreated = false;
    const cwd = process.cwd();
    const claudeMdPath = path.join(cwd, 'CLAUDE.md');

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

    if (profile) {
        // Map profile fields to standard Environment Variables
        if (profile.url) {
            // Check if we need the Adapter Proxy
            // If URL is NOT anthropic.com, we assume it's an OpenAI-compatible endpoint
            // because strict Anthropic proxies are rare compared to OneAPI/OpenAI-style.
            const isNativeAnthropic = profile.url.includes('api.anthropic.com');

            if (!isNativeAnthropic) {
                console.log(colors.textDim('Detected non-standard Endpoint. Starting OpenAI Compatibility Adapter...'));
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

                    console.log(colors.success(`Adapter running at ${url} -> ${profile.url}`));
                } catch (e) {
                    console.error('Failed to start adapter:', e);
                }
            } else {
                // Native behavior
                env['CLAUDE_BASE_URL'] = profile.url;
                env['ANTHROPIC_BASE_URL'] = profile.url;
            }

            // OpenAI Base URL is used by some tools, set it anyway to the real one or proxy?
            // Claude CLI doesn't use OPENAI_BASE_URL, but our internal tools might.
            // Let's leave OPENAI_BASE_URL as the REAL remote URL for clarity, 
            // as internal tools (cc-helper) use model-router which handles this natively.
            env['OPENAI_BASE_URL'] = profile.url;
        }
        if (profile.key) {
            env['CLAUDE_API_KEY'] = profile.key;
            env['ANTHROPIC_API_KEY'] = profile.key;
            // Native Claude CLI might complain if key format is wrong (sk-...) 
            // but usually it just passes it as a header. 
            // Our Proxy will take this key and inject it as Bearer token.
            env['OPENAI_API_KEY'] = profile.key;
        }
        console.log(colors.textDim(t('runner.loadedProfile', { name: colors.primary(profile.name) })));
        console.log(colors.textDim(t('runner.apiUrl', { url: colors.primary(profile.url) })) + '\n');
    } else {
        console.log(colors.warning(t('runner.noActiveProfile')) + '\n');
    }

    const command = options.command || 'claude';
    const args = options.args || [];

    console.log(colors.primary(`${symbols.arrowRight} ${t('runner.starting', { command: colors.text(command) })}`) + '\n');
    console.log(divider(50) + '\n');

    // Notify Monitor
    await sendMonitorEvent('start', profile, options.role || 'default');

    // Deploy and configure native statusline
    ensureStatusLine();

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
                console.log('\n' + divider(50));

                if (code === 0) {
                    console.log(colors.success(`\n${symbols.success} ${t('runner.sessionCompleted')}\n`));
                } else {
                    console.log(colors.warning(`\n${symbols.warning} ${t('runner.exitedWithCode', { code })}\n`));
                }

                // Restore CLAUDE.md
                if (tempClaudeMdCreated) {
                    try {
                        if (backupClaudeMd !== null) {
                            fs.writeFileSync(claudeMdPath, backupClaudeMd);
                        } else {
                            fs.unlinkSync(claudeMdPath);
                        }
                    } catch (e) {
                        // ignore cleanup errors
                    }
                }

                // Kill Proxy
                if (proxyServer) {
                    proxyServer.close();
                }

                // Notify Monitor End
                await sendMonitorEvent('end', profile, options.role || 'default');

                resolve({ exitCode: code });
            });

            subprocess.on('error', (error) => {
                console.log('\n' + divider(50));
                console.error(colors.error(`\n${symbols.error} ${t('runner.failedToRun', { command })}`), error.message);

                if (error.message.includes('ENOENT')) {
                    console.log(colors.warning(`\n${symbols.warning} ${t('runner.troubleshooting')}`));
                    console.log(colors.textDim(`  ${symbols.bullet} ${t('runner.ensureInstalled', { command })}`));
                    console.log(colors.textDim(`  ${symbols.bullet} ${t('runner.tryRunning')}`));
                    console.log(colors.textDim(`  ${symbols.bullet} ${t('runner.visitDocs')}\n`));
                }

                reject(error);
            });

        } catch (e) {
            console.log('\n' + divider(50));
            console.error(colors.error(`\n${symbols.error} ${t('runner.failedToRun', { command })}`), e.message);

            if (e.message.includes('ENOENT')) {
                console.log(colors.warning(`\n${symbols.warning} ${t('runner.troubleshooting')}`));
                console.log(colors.textDim(`  ${symbols.bullet} ${t('runner.ensureInstalled', { command })}`));
                console.log(colors.textDim(`  ${symbols.bullet} ${t('runner.tryRunning')}`));
                console.log(colors.textDim(`  ${symbols.bullet} ${t('runner.visitDocs')}\n`));
            }

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
