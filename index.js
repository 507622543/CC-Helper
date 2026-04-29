#!/usr/bin/env node
import { program } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { addProfile, listProfiles, setActiveProfile, getActiveProfile, getActiveProfileName, deleteProfile, editProfile, queryAvailableOpusModels, queryAvailableSonnetModels } from './lib/profile.js';
import { getMcpServices, addMcpService, removeMcpService, checkPortInUse } from './lib/mcp-manager.js';
import { installCCG, checkCCGInstallation } from './lib/ccg.js';
import { runClaude } from './lib/runner.js';
import { exportSession } from './lib/session-utils.js';
import { checkDockerAvailable, ensureYoloImage, runYoloDocker, runYoloTempDir, showDiff, mergeBack, discardSandbox } from './lib/yolo.js';
import { toggleYolo, showYoloStatus, isYoloActive } from './lib/yolo-toggle.js';
import axios from 'axios';
import { t, getLanguage, setLanguage, getSupportedLanguages, getLanguageDisplayName } from './lib/i18n.js';
import { colors, symbols, box, divider, keyValue, statusBadge, statusCodeBadge, table } from './lib/theme.js';
import { virtualCompanyMenu } from './lib/virtual-company.js';
import { trellisMenu, getTrellisStatus } from './lib/trellis.js';
import {
    isCcSwitchInstalled,
    listCcSwitchProviders,
    getCurrentCcSwitchProvider,
    switchCcSwitchProvider,
    getCcSwitchProviderSummary,
    getCcSwitchCounts,
    getCcSwitchDoctorReport,
    cleanCcSwitchLocalOverrides,
    openCcSwitch,
} from './lib/ccswitch.js';

// --- Dashboard / Status ---
const showStatus = async (sessionProfileName) => {
    const profile = getActiveProfile(sessionProfileName);
    const profileText = profile ? colors.success(profile.name) : colors.error(t('dashboard.none'));
    const urlText = profile?.url ? colors.primary(profile.url) : colors.textMuted(t('dashboard.na'));

    let statusCode = 'N/A';
    let latency = 0;
    let usageInfo = colors.textMuted(t('dashboard.unknown'));
    let statusType = 'pending';
    let latencyText = colors.textMuted(t('dashboard.na'));
    let usageText = colors.textMuted(t('dashboard.notSupported'));
    let endpointType = '';

    if (profile?.url && profile?.key) {
        const start = Date.now();
        const isNativeAnthropic = profile.url.includes('api.anthropic.com');
        endpointType = isNativeAnthropic ? 'Anthropic' : 'OpenAI-Compatible';

        try {
            let response;

            if (isNativeAnthropic) {
                // Anthropic native: lightweight POST with max_tokens=1
                const baseUrl = profile.url.replace(/\/+$/, '');
                const messagesUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/messages` : `${baseUrl}/v1/messages`;
                response = await axios.post(messagesUrl, {
                    model: 'claude-haiku-4-5-20251001',
                    max_tokens: 1,
                    messages: [{ role: 'user', content: 'hi' }]
                }, {
                    headers: {
                        'x-api-key': profile.key,
                        'anthropic-version': '2023-06-01',
                        'content-type': 'application/json'
                    },
                    timeout: 8000,
                    validateStatus: () => true
                });
            } else {
                // OpenAI-compatible: use GET /v1/models (zero tokens, no cost)
                const baseUrl = profile.url.replace(/\/+$/, '');
                const modelsUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/models` : `${baseUrl}/v1/models`;
                response = await axios.get(modelsUrl, {
                    headers: {
                        'Authorization': `Bearer ${profile.key}`,
                        'content-type': 'application/json'
                    },
                    timeout: 8000,
                    validateStatus: () => true
                });
            }

            latency = Date.now() - start;
            statusCode = response.status;
            latencyText = latency < 500
                ? colors.success(`${latency}ms`)
                : latency < 2000
                    ? colors.warning(`${latency}ms`)
                    : colors.error(`${latency}ms`);

            // Determine status
            if (statusCode >= 200 && statusCode < 300) {
                statusType = 'success';
                usageInfo = `${t('dashboard.online')} (${latency}ms)`;

                // For OpenAI-compatible: show available model count
                if (!isNativeAnthropic && response.data?.data) {
                    const modelCount = response.data.data.length;
                    const claudeModels = response.data.data.filter(m =>
                        m.id && m.id.toLowerCase().includes('claude')
                    ).length;
                    usageText = claudeModels > 0
                        ? colors.success(`${claudeModels} Claude / ${modelCount} ${t('dashboard.totalModels')}`)
                        : colors.primary(`${modelCount} ${t('dashboard.totalModels')}`);
                }
            } else if (statusCode === 401) {
                statusType = 'error';
                usageInfo = `API Key ${t('dashboard.invalid')} (${latency}ms)`;
            } else if (statusCode === 403) {
                statusType = 'warning';
                usageInfo = `${t('dashboard.forbidden')} (${latency}ms)`;
            } else if (statusCode >= 400 && statusCode < 500) {
                // 4xx but reachable — endpoint is alive
                statusType = 'warning';
                usageInfo = `${t('dashboard.online')} (${latency}ms)`;
            } else if (statusCode >= 500) {
                statusType = 'error';
                usageInfo = `${t('dashboard.serverError')} (${latency}ms)`;
            } else {
                statusType = 'info';
                usageInfo = `${t('dashboard.online')} (${latency}ms)`;
            }

            // Extract rate limit info from headers (works for both Anthropic and OpenAI)
            const headers = response.headers || {};
            const rateLimitRemaining = headers['anthropic-ratelimit-requests-remaining'] ||
                headers['x-ratelimit-remaining-requests'] ||
                headers['x-ratelimit-remaining'] ||
                headers['x-rate-limit-remaining'];
            const rateLimitLimit = headers['anthropic-ratelimit-requests-limit'] ||
                headers['x-ratelimit-limit-requests'] ||
                headers['x-ratelimit-limit'] ||
                headers['x-rate-limit-limit'];

            if (rateLimitRemaining !== undefined && rateLimitLimit !== undefined) {
                const remaining = parseInt(rateLimitRemaining);
                const limit = parseInt(rateLimitLimit);
                if (!isNaN(remaining) && !isNaN(limit) && limit > 0) {
                    const usagePercent = Math.round(((limit - remaining) / limit) * 100);
                    usageText = colors.primary(`${remaining}/${limit} (${usagePercent}% ${t('dashboard.usagePercent')})`);
                }
            }

        } catch (error) {
            latency = Date.now() - start;
            if (error.code === 'ECONNABORTED') {
                usageInfo = t('dashboard.timeout');
                statusType = 'error';
                statusCode = 'TIMEOUT';
            } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                usageInfo = t('dashboard.unreachable');
                statusType = 'error';
                statusCode = 'ERROR';
            } else if (error.response) {
                statusCode = error.response.status;
                latencyText = colors.primary(`${latency}ms`);
                statusType = statusCode >= 500 ? 'error' : 'warning';
                usageInfo = `${t('dashboard.online')} (${latency}ms)`;
            } else {
                usageInfo = t('dashboard.networkError');
                statusType = 'error';
                statusCode = 'ERROR';
            }

            if (statusCode === 'ERROR' || statusCode === 'TIMEOUT') {
                latencyText = colors.textMuted(t('dashboard.na'));
                usageText = colors.textMuted(t('dashboard.na'));
            }
        }
    } else if (profile?.url && !profile?.key) {
        usageInfo = t('dashboard.apiKeyNotConfigured');
        statusType = 'warning';
        statusCode = 'N/A';
    }

    const content = [
        keyValue(t('dashboard.name'), profileText, 12),
        keyValue(t('dashboard.url'), urlText, 12),
        endpointType ? keyValue(t('dashboard.type'), colors.info(endpointType), 12) : null,
        keyValue(t('dashboard.statusCode'), statusCodeBadge(statusCode), 12),
        keyValue(t('dashboard.latency'), latencyText, 12),
        keyValue(t('dashboard.usage'), usageText, 12),
        keyValue(t('dashboard.status'), statusBadge(statusType, usageInfo), 12),
    ].filter(Boolean).join('\n');

    const statusBox = box(content, {
        width: 70,
        padding: 1,
        borderStyle: 'round',
        borderColor: colors.primary,
        titleText: t('dashboard.title'),
        titleAlign: 'center',
    });

    console.clear();
    console.log(statusBox);
};

// --- Helper: Get Available Roles ---
const getAvailableRoles = () => {
    const roles = [];
    const homeDir = os.homedir();

    // 1. Check .claude/.ccg/prompts/claude
    const ccgPath = path.join(homeDir, '.claude', '.ccg', 'prompts', 'claude');
    if (fs.existsSync(ccgPath)) {
        try {
            const files = fs.readdirSync(ccgPath).filter(f => f.endsWith('.md'));
            files.forEach(f => roles.push({
                name: f.replace('.md', ''),
                path: path.join(ccgPath, f),
                type: 'ccg'
            }));
        } catch { }
    }

    // 2. Check .claude/ root (for simple user added roles like CiFang.md)
    const rootPath = path.join(homeDir, '.claude');
    if (fs.existsSync(rootPath)) {
        try {
            const files = fs.readdirSync(rootPath).filter(f => f.endsWith('.md') && f.toLowerCase() !== 'readme.md');
            files.forEach(f => {
                // Avoid duplicates if same name exists
                if (!roles.find(r => r.name === f.replace('.md', ''))) {
                    roles.push({
                        name: f.replace('.md', ''),
                        path: path.join(rootPath, f),
                        type: 'user'
                    });
                }
            });
        } catch { }
    }

    return roles.sort((a, b) => a.name.localeCompare(b.name));
};

// --- API Recovery Menu ---
/**
 * Shows recovery options when Claude Code exits with API errors
 * @param {object} result - { exitCode, proxyErrors, lastSessionId }
 * @param {object} launchOptions - Original launch options { command, role, opusModel }
 * @returns {Promise<string>} Action taken: 'resumed' | 'exported' | 'exit'
 */
const showRecoveryMenu = async (result, launchOptions) => {
    const { proxyErrors, lastSessionId } = result;
    const hasApiError = proxyErrors?.lastError != null;
    const hasSession = !!lastSessionId;

    // Display error info box
    const errorLines = [];
    if (hasApiError) {
        const err = proxyErrors.lastError;
        errorLines.push(colors.error(`${symbols.error} ${t('recovery.detected')}`));
        errorLines.push('');
        errorLines.push(keyValue(t('recovery.errorType'), colors.warning(err.errorType || 'unknown'), 14));
        errorLines.push(keyValue(t('recovery.statusCode'), colors.warning(String(err.statusCode || 'N/A')), 14));
        errorLines.push(keyValue(t('recovery.consecutiveErrors'), colors.warning(`${proxyErrors.consecutiveErrors} ${t('recovery.times')}`), 14));
        if (err.message) {
            errorLines.push(keyValue(t('recovery.errorInfo'), colors.textDim(err.message.slice(0, 80)), 14));
        }
    } else {
        errorLines.push(colors.warning(`${symbols.warning} Claude Code ${t('runner.exitedWithCode', { code: result.exitCode })}`));
    }

    if (hasSession) {
        errorLines.push('');
        errorLines.push(keyValue(t('recovery.sessionId'), colors.primary(lastSessionId.slice(0, 8) + '...'), 14));
    }

    if (proxyErrors?.isStreamInterrupted) {
        errorLines.push('');
        errorLines.push(colors.info(`${symbols.info} ${t('recovery.autoContinuing')}`));
    }

    console.log(box(errorLines.join('\n'), {
        width: 70,
        padding: 1,
        borderStyle: 'round',
        borderColor: colors.error,
        titleText: 'API Recovery',
        titleAlign: 'center',
    }));

    // Build choices
    const choices = [];

    if (hasSession) {
        choices.push({
            name: colors.text(`${symbols.pointer} ${t('recovery.switchProfile')}`),
            value: 'switch'
        });
        choices.push({
            name: colors.text(`${symbols.bullet} ${t('recovery.retryResume')}`),
            value: 'retry'
        });
        choices.push({
            name: colors.text(`${symbols.bullet} ${t('recovery.exportSession')}`),
            value: 'export'
        });
        if (proxyErrors?.isStreamInterrupted) {
            choices.push({
                name: colors.primary(`${symbols.pointer} ${t('recovery.autoResumeContinue')}`),
                value: 'auto-continue'
            });
        }
    } else {
        choices.push({
            name: colors.text(`${symbols.pointer} ${t('recovery.switchProfile')}`),
            value: 'switch-fresh'
        });
    }

    choices.push({
        name: colors.textDim(`${symbols.arrowLeft} ${t('recovery.exitToMenu')}`),
        value: 'exit'
    });

    const { action } = await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: colors.primaryBold(t('recovery.prompt')),
        choices
    }]);

    if (action === 'switch' || action === 'switch-fresh' || action === 'auto-continue') {
        let profileName = null;
        if (action === 'switch' || action === 'switch-fresh') {
            // Select new profile
            const profiles = listProfiles();
            if (profiles.length < 2) {
                console.log(colors.warning(`\n${symbols.warning} Only 1 profile available. Add more profiles first.\n`));
                return 'exit';
            }

            const currentProfile = getActiveProfile();
            const answers = await inquirer.prompt([{
                type: 'list',
                name: 'profileName',
                message: colors.primaryBold(t('recovery.selectProfile')),
                choices: profiles
                    .filter(p => p.name !== currentProfile?.name)
                    .map(p => ({
                        name: `${colors.text(p.name)} ${colors.textDim(`(${p.url})`)}`,
                        value: p.name
                    }))
            }]);
            profileName = answers.profileName;
            await setActiveProfile(profileName);
        }

        // Re-launch Claude Code with --resume or --continue
        if (hasSession && (action === 'switch' || action === 'auto-continue')) {
            const isAutoContinue = action === 'auto-continue' || (action === 'switch' && proxyErrors?.isStreamInterrupted);
            const args = ['--resume', lastSessionId];
            if (isAutoContinue) {
                args.push('continue');
            }

            console.log(colors.primary(`\n${symbols.arrowRight} ${t('recovery.resuming')}\n`));
            const resumeResult = await runClaude({
                command: launchOptions.command || 'claude',
                args,
                role: launchOptions.role,
                opusModel: launchOptions.opusModel,
            });
            // Recursively check if resume also failed
            if (resumeResult.exitCode !== 0 && (resumeResult.proxyErrors?.lastError || resumeResult.exitCode !== 0)) {
                return await showRecoveryMenu(resumeResult, launchOptions);
            }
        } else {
            // Fresh start with new profile
            const freshResult = await runClaude({
                command: launchOptions.command || 'claude',
                role: launchOptions.role,
                opusModel: launchOptions.opusModel,
            });
            if (freshResult.exitCode !== 0 && freshResult.proxyErrors?.lastError) {
                return await showRecoveryMenu(freshResult, launchOptions);
            }
        }
        return 'resumed';

    } else if (action === 'retry') {
        console.log(colors.primary(`\n${symbols.arrowRight} ${t('recovery.resuming')}\n`));
        const retryResult = await runClaude({
            command: launchOptions.command || 'claude',
            args: ['--resume', lastSessionId],
            role: launchOptions.role,
            opusModel: launchOptions.opusModel,
        });
        if (retryResult.exitCode !== 0 && (retryResult.proxyErrors?.lastError || retryResult.exitCode !== 0)) {
            return await showRecoveryMenu(retryResult, launchOptions);
        }
        return 'resumed';

    } else if (action === 'export') {
        console.log(colors.textDim(`\n${symbols.running} ${t('recovery.exporting')}`));
        try {
            const exportPath = await exportSession(lastSessionId);
            console.log(colors.success(`${symbols.success} ${t('recovery.exported')} ${colors.primary(exportPath)}\n`));
        } catch (e) {
            console.error(colors.error(`${symbols.error} Export failed: ${e.message}\n`));
        }
        // Show menu again after export
        return await showRecoveryMenu(result, launchOptions);

    } else {
        return 'exit';
    }
};

// --- Interactive Main Menu ---
const truncateText = (value, max = 52) => {
    const text = String(value || '');
    return text.length > max ? `${text.slice(0, max - 3)}...` : text;
};

const getCcSwitchRows = (providers) => providers.map(provider => {
    const summary = getCcSwitchProviderSummary(provider);
    return {
        Current: summary.isCurrent ? '*' : '',
        Name: summary.name,
        URL: truncateText(summary.baseUrl || 'N/A', 44),
        Format: summary.apiFormat,
        Key: summary.hasKey ? 'yes' : 'no',
        ID: truncateText(summary.id, 24),
    };
});

const resolveCcSwitchProvider = (target, app = 'claude') => {
    if (!target) return null;
    const providers = listCcSwitchProviders(app);
    const exact = providers.find(provider => provider.id === target || provider.name === target);
    if (exact) return exact;

    const lower = target.toLowerCase();
    const fuzzy = providers.filter(provider =>
        provider.id.toLowerCase().includes(lower) ||
        provider.name.toLowerCase().includes(lower)
    );
    return fuzzy.length === 1 ? fuzzy[0] : null;
};

const printCcSwitchStatus = async (app = 'claude') => {
    console.log();
    if (!isCcSwitchInstalled()) {
        console.log(colors.warning(`${symbols.warning} CC Switch is not initialized. Open CC Switch once, then add or import providers.`));
        return;
    }

    const counts = getCcSwitchCounts();
    const current = getCurrentCcSwitchProvider(app);
    const summary = current ? getCcSwitchProviderSummary(current) : null;

    const content = [
        keyValue('App', colors.primary(app), 14),
        keyValue('Provider', summary ? colors.success(summary.name) : colors.warning('None'), 14),
        keyValue('Base URL', summary ? colors.primary(summary.baseUrl || 'N/A') : colors.textMuted('N/A'), 14),
        keyValue('API Format', summary ? colors.text(summary.apiFormat) : colors.textMuted('N/A'), 14),
        keyValue('API Key', summary?.hasKey ? colors.success('configured') : colors.warning('missing'), 14),
        divider(46),
        keyValue('Providers', colors.text(String(counts.providers ?? 'N/A')), 14),
        keyValue('MCP', colors.text(String(counts.mcp_servers ?? 'N/A')), 14),
        keyValue('Prompts', colors.text(String(counts.prompts ?? 'N/A')), 14),
        keyValue('Skills', colors.text(String(counts.skills ?? 'N/A')), 14),
    ].join('\n');

    console.log(box(content, {
        titleText: 'CC Switch',
        width: 62,
        borderColor: colors.info,
    }));
};

const printCcSwitchProviders = async (app = 'claude') => {
    console.log();
    if (!isCcSwitchInstalled()) {
        console.log(colors.warning(`${symbols.warning} CC Switch is not initialized. Open CC Switch once, then add or import providers.`));
        return;
    }

    const providers = listCcSwitchProviders(app);
    if (providers.length === 0) {
        console.log(colors.warning(`${symbols.warning} No CC Switch providers found for ${app}.`));
        return;
    }

    console.log(colors.primaryBold(`CC Switch Providers (${app})\n`));
    console.log(table(getCcSwitchRows(providers), { borderColor: colors.info }));
};

const printCcSwitchDoctor = async (app = 'claude') => {
    console.log();
    const report = getCcSwitchDoctorReport(app);
    const current = report.currentProvider;
    const levelColor = {
        ok: colors.success,
        info: colors.info,
        warn: colors.warning,
        error: colors.error,
    };

    const content = [
        keyValue('Installed', report.installed ? colors.success('yes') : colors.error('no'), 14),
        keyValue('App', colors.primary(app), 14),
        keyValue('Provider', current ? colors.success(current.name) : colors.warning('None'), 14),
        keyValue('Base URL', current ? colors.primary(current.baseUrl || 'N/A') : colors.textMuted('N/A'), 14),
    ].join('\n');

    console.log(box(content, {
        titleText: 'CC Switch Doctor',
        width: 66,
        borderColor: colors.info,
    }));

    if (report.checks.length === 0) {
        console.log(colors.textMuted('No checks available.'));
        return;
    }

    console.log();
    for (const check of report.checks) {
        const paint = levelColor[check.level] || colors.text;
        const tag = check.level.toUpperCase().padEnd(5);
        console.log(`  ${paint(tag)} ${colors.text(check.title)}`);
        if (check.detail) {
            console.log(colors.textDim(`        ${check.detail}`));
        }
    }
};

const cleanCcSwitchOverridesFlow = async () => {
    const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: 'Clean provider env overrides from ~/.claude/settings.local.json?',
        default: true,
    }]);

    if (!confirm) return;
    const result = cleanCcSwitchLocalOverrides();
    if (!result.changed) {
        console.log(colors.success(`${symbols.success} No local provider overrides found.`));
        return;
    }
    console.log(colors.success(`${symbols.success} Cleaned local provider overrides.`));
    console.log(colors.textDim(`  File: ${result.file}`));
    console.log(colors.textDim(`  Backup: ${result.backupDir}`));
};

const switchCcSwitchProviderFlow = async (target, app = 'claude') => {
    if (!isCcSwitchInstalled()) {
        console.log(colors.warning(`${symbols.warning} CC Switch is not initialized. Open CC Switch once, then add or import providers.`));
        return;
    }

    let provider = resolveCcSwitchProvider(target, app);
    if (!provider) {
        const providers = listCcSwitchProviders(app);
        if (providers.length === 0) {
            console.log(colors.warning(`${symbols.warning} No CC Switch providers found for ${app}.`));
            return;
        }

        const { providerId } = await inquirer.prompt([{
            type: 'list',
            name: 'providerId',
            message: colors.primaryBold('Select CC Switch provider:'),
            choices: providers.map(item => {
                const summary = getCcSwitchProviderSummary(item);
                const current = summary.isCurrent ? `${colors.success(' [current]')}` : '';
                const key = summary.hasKey ? colors.success('key') : colors.warning('no key');
                const url = colors.textDim(summary.baseUrl || 'N/A');
                return {
                    name: `${summary.isCurrent ? symbols.selected : symbols.unselected} ${colors.text(summary.name)} ${current} ${colors.textDim(`(${summary.apiFormat}, ${key})`)} ${url}`,
                    value: item.id,
                };
            }),
            pageSize: 15,
        }]);
        provider = providers.find(item => item.id === providerId);
    }

    if (!provider) {
        console.log(colors.error(`${symbols.error} Provider not found: ${target}`));
        return;
    }

    const summary = getCcSwitchProviderSummary(provider);
    console.log(colors.textDim(`\n${symbols.running} Switching CC Switch ${app} provider to ${summary.name}...`));
    const result = switchCcSwitchProvider(provider.id, app);
    console.log(colors.success(`${symbols.success} Switched to ${result.provider.name}`));
    console.log(colors.textDim(`  Backup: ${result.backupDir}`));
    return result.provider;
};

const manageCcSwitch = async () => {
    let done = false;
    while (!done) {
        console.clear();
        await printCcSwitchStatus('claude');

        const { action } = await inquirer.prompt([{
            type: 'list',
            name: 'action',
            message: colors.primaryBold('CC Switch Bridge'),
            choices: [
                { name: colors.text(`${symbols.bullet} Status`), value: 'status' },
                { name: colors.text(`${symbols.bullet} List Claude providers`), value: 'list' },
                { name: colors.text(`${symbols.bullet} Switch Claude provider`), value: 'switch' },
                { name: colors.text(`${symbols.bullet} Doctor / diagnose conflicts`), value: 'doctor' },
                { name: colors.text(`${symbols.bullet} Clean local overrides`), value: 'clean' },
                { name: colors.text(`${symbols.bullet} Open CC Switch app`), value: 'open' },
                { name: colors.textDim(`${symbols.arrowLeft} Back`), value: 'back' },
            ],
            pageSize: 10,
        }]);

        try {
            if (action === 'status') {
                await printCcSwitchStatus('claude');
            } else if (action === 'list') {
                await printCcSwitchProviders('claude');
            } else if (action === 'switch') {
                await switchCcSwitchProviderFlow(null, 'claude');
            } else if (action === 'doctor') {
                await printCcSwitchDoctor('claude');
            } else if (action === 'clean') {
                await cleanCcSwitchOverridesFlow();
            } else if (action === 'open') {
                const exe = openCcSwitch();
                console.log(colors.success(`${symbols.success} Opened CC Switch: ${exe}`));
            } else if (action === 'back') {
                done = true;
                continue;
            }
        } catch (error) {
            console.log(colors.error(`${symbols.error} ${error.message}`));
        }

        await inquirer.prompt([{
            type: 'input',
            name: 'continue',
            message: colors.textDim(t('profile.pressEnter'))
        }]);
    }
};

const showMainMenu = async (sessionProfileName) => {
    console.clear();
    await showStatus(sessionProfileName);

    const ccgStatus = checkCCGInstallation();
    const ccgLabel = ccgStatus.installed && ccgStatus.skillCount > 0
        ? `${t('mainMenu.installCCG')} ${colors.success(`[${ccgStatus.skillCount} skills]`)}`
        : `${t('mainMenu.installCCG')} ${colors.warning('[Not Installed]')}`;

    const trellisStatus = getTrellisStatus();
    const trellisLabel = `${t('trellis.menuItem')} ${trellisStatus.label}`;

    const { action } = await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: colors.primaryBold(t('mainMenu.prompt')),
        choices: [
            { name: colors.text(`${symbols.pointer} ${t('mainMenu.startClaude')}`), value: 'start' },
            { name: colors.text(`${symbols.bullet} ${t('yolo.menuItem')}`), value: 'yolo' },
            { name: colors.text(`${symbols.bullet} CC Switch Bridge`), value: 'ccswitch' },
            { name: colors.text(`${symbols.bullet} ${t('mainMenu.manageProfiles')}`), value: 'profile' },
            { name: colors.text(`${symbols.bullet} ${ccgLabel}`), value: 'ccg' },
            { name: colors.rainbow(`${symbols.bullet} ${t('mainMenu.virtualCompany')}`), value: 'company' },
            { name: colors.text(`${symbols.bullet} ${trellisLabel}`), value: 'trellis' },
            { name: colors.text(`${symbols.bullet} ${t('mainMenu.viewStatus')}`), value: 'status' },
            { name: colors.text(`${symbols.bullet} ${t('mainMenu.languageSettings')}`), value: 'language' },
            { name: colors.textDim(`${symbols.bulletInactive} ${t('mainMenu.exit')}`), value: 'exit' }
        ],
        pageSize: 12
    }]);

    return action;
};

// --- Profile Connectivity Test ---
const testProfileConnectivity = async (profile) => {
    if (!profile?.url || !profile?.key) {
        console.log(colors.warning(`  ${symbols.warning} ${t('profile.testMissingInfo')}`));
        return;
    }

    const isNativeAnthropic = profile.url.includes('api.anthropic.com');
    const start = Date.now();

    try {
        let response;
        if (isNativeAnthropic) {
            const baseUrl = profile.url.replace(/\/+$/, '');
            const messagesUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/messages` : `${baseUrl}/v1/messages`;
            response = await axios.post(messagesUrl, {
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 1,
                messages: [{ role: 'user', content: 'hi' }]
            }, {
                headers: { 'x-api-key': profile.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
                timeout: 8000,
                validateStatus: () => true
            });
        } else {
            const baseUrl = profile.url.replace(/\/+$/, '');
            const modelsUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/models` : `${baseUrl}/v1/models`;
            response = await axios.get(modelsUrl, {
                headers: { 'Authorization': `Bearer ${profile.key}` },
                timeout: 8000,
                validateStatus: () => true
            });
        }

        const latency = Date.now() - start;
        const status = response.status;

        if (status >= 200 && status < 300) {
            console.log(colors.success(`  ${symbols.success} ${t('profile.testSuccess')} (${latency}ms)`));
            if (!isNativeAnthropic && response.data?.data) {
                const claudeCount = response.data.data.filter(m => m.id?.includes('claude')).length;
                if (claudeCount > 0) {
                    console.log(colors.textDim(`  ${symbols.bullet} ${claudeCount} Claude ${t('dashboard.totalModels')}`));
                }
            }
        } else if (status === 401) {
            console.log(colors.error(`  ${symbols.error} ${t('profile.testAuthFail')} (HTTP ${status})`));
        } else {
            console.log(colors.warning(`  ${symbols.warning} ${t('profile.testReachable')} (HTTP ${status}, ${latency}ms)`));
        }
    } catch (error) {
        if (error.code === 'ECONNABORTED') {
            console.log(colors.error(`  ${symbols.error} ${t('dashboard.timeout')}`));
        } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            console.log(colors.error(`  ${symbols.error} ${t('dashboard.unreachable')}`));
        } else {
            console.log(colors.error(`  ${symbols.error} ${t('dashboard.networkError')}: ${error.message}`));
        }
    }
};

// --- Profile Management Menu ---
const manageProfiles = async (sessionProfileName) => {
    console.clear();
    const profiles = listProfiles();
    const activeName = sessionProfileName || getActiveProfileName();

    const profileList = profiles.length > 0
        ? profiles.map(p =>
            `  ${p.name === activeName ? symbols.selected : symbols.unselected} ${colors.text(p.name)} ${colors.textMuted(`(${p.url})`)}`
        ).join('\n')
        : colors.textMuted(`  ${t('profile.noProfiles')}`);

    const content = profileList;

    console.log(box(content, {
        width: 56,
        padding: 1,
        borderStyle: 'round',
        borderColor: colors.secondary,
        titleText: t('profile.title'),
        titleAlign: 'center',
    }));

    const { action } = await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: colors.primaryBold(t('profile.actions')),
        choices: [
            { name: colors.text(`${symbols.bullet} ${t('profile.addNew')}`), value: 'add' },
            { name: profiles.length === 0 ? colors.textMuted(`${symbols.bulletInactive} ${t('profile.edit')}`) : colors.text(`${symbols.bullet} ${t('profile.edit')}`), value: 'edit', disabled: profiles.length === 0 },
            { name: profiles.length === 0 ? colors.textMuted(`${symbols.bulletInactive} ${t('profile.switch')}`) : colors.text(`${symbols.bullet} ${t('profile.switch')}`), value: 'switch', disabled: profiles.length === 0 },
            { name: profiles.length === 0 ? colors.textMuted(`${symbols.bulletInactive} ${t('profile.testConn')}`) : colors.text(`${symbols.bullet} ${t('profile.testConn')}`), value: 'test', disabled: profiles.length === 0 },
            { name: profiles.length === 0 ? colors.textMuted(`${symbols.bulletInactive} ${t('profile.delete')}`) : colors.text(`${symbols.bullet} ${t('profile.delete')}`), value: 'delete', disabled: profiles.length === 0 },
            { name: profiles.length === 0 ? colors.textMuted(`${symbols.bulletInactive} ${t('profile.viewAll')}`) : colors.text(`${symbols.bullet} ${t('profile.viewAll')}`), value: 'list', disabled: profiles.length === 0 },
            { name: colors.textDim(`${symbols.arrowLeft} ${t('profile.backToMain')}`), value: 'back' }
        ]
    }]);

    if (action === 'add') {
        console.log(colors.primary(`\n${symbols.bullet} ${t('profile.createNew')}\n`));

        // Ask user to choose between API Key or OAuth
        const { authType } = await inquirer.prompt([{
            type: 'list',
            name: 'authType',
            message: colors.textDim('Authentication Type:'),
            choices: [
                { name: 'API Key (Standard)', value: 'apikey' },
                { name: 'OAuth (Claude AI)', value: 'oauth' }
            ]
        }]);

        if (authType === 'oauth') {
            // OAuth flow
            const oauthAnswers = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'name',
                    message: colors.textDim(t('profile.profileName')),
                    validate: input => input.trim() ? true : t('profile.nameEmpty')
                },
                {
                    type: 'input',
                    name: 'oauthJson',
                    message: colors.textDim('Paste OAuth JSON (or file path):'),
                    validate: input => input.trim() ? true : 'OAuth config required'
                }
            ]);

            try {
                let oauthData;
                // Try to parse as JSON first
                try {
                    oauthData = JSON.parse(oauthAnswers.oauthJson);
                } catch {
                    // Try to read as file path
                    if (fs.existsSync(oauthAnswers.oauthJson)) {
                        oauthData = JSON.parse(fs.readFileSync(oauthAnswers.oauthJson, 'utf8'));
                    } else {
                        throw new Error('Invalid JSON or file path');
                    }
                }

                const profileData = {
                    name: oauthAnswers.name,
                    url: 'https://api.anthropic.com',
                    oauth: oauthData.claudeAiOauth || oauthData
                };

                await addProfile(profileData);
                console.log(colors.success(`\n${symbols.success} OAuth profile added successfully!`));
                await new Promise(resolve => setTimeout(resolve, 1500));
            } catch (e) {
                console.log(colors.error(`\n${symbols.error} ${t('profile.error')} ${e.message}\n`));
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            return await manageProfiles();
        }

        // Standard API Key flow
        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'name',
                message: colors.textDim(t('profile.profileName')),
                validate: input => input.trim() ? true : t('profile.nameEmpty')
            },
            {
                type: 'input',
                name: 'url',
                message: colors.textDim(t('profile.apiBaseUrl')),
                default: 'https://api.anthropic.com',
                validate: input => {
                    try {
                        new URL(input);
                        return true;
                    } catch {
                        return t('profile.invalidUrl');
                    }
                }
            },
            {
                type: 'password',
                name: 'key',
                message: colors.textDim(t('profile.apiKey')),
                mask: '*',
                validate: input => input.trim() ? true : t('profile.keyEmpty')
            },
            {
                type: 'input',
                name: 'model',
                message: colors.textDim('Preferred Opus Model (leave empty for auto-detect):'),
                default: '',
            }
        ]);
        try {
            const profileData = { name: answers.name, url: answers.url, key: answers.key };
            if (answers.model && answers.model.trim()) {
                profileData.model = answers.model.trim();
            }
            await addProfile(profileData);
            console.log(colors.success(`\n${symbols.success} ${t('profile.addSuccess')}`));

            console.log(colors.textDim(`\n${symbols.running} ${t('profile.testing')}...`));
            await testProfileConnectivity(answers);
            await new Promise(resolve => setTimeout(resolve, 1500));
        } catch (e) {
            console.log(colors.error(`\n${symbols.error} ${t('profile.error')} ${e.message}\n`));
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        return await manageProfiles();
    } else if (action === 'edit') {
        const { name } = await inquirer.prompt([{
            type: 'list',
            name: 'name',
            message: colors.primaryBold(t('profile.selectToEdit')),
            choices: profiles.map(p => ({
                name: `${p.isActive ? symbols.selected : symbols.unselected} ${p.name} ${colors.textMuted(`(${p.url})`)}`,
                value: p.name
            }))
        }]);
        const currentProfile = profiles.find(p => p.name === name);
        console.log(colors.textDim(`\n  ${t('profile.editHint')}\n`));
        const updates = await inquirer.prompt([
            {
                type: 'input',
                name: 'url',
                message: colors.textDim(t('profile.apiBaseUrl')),
                default: currentProfile.url,
                validate: input => {
                    if (!input.trim()) return true; // keep current
                    try { new URL(input); return true; } catch { return t('profile.invalidUrl'); }
                }
            },
            {
                type: 'password',
                name: 'key',
                message: colors.textDim(`${t('profile.apiKey')} ${colors.textMuted('(leave empty to keep current)')}`),
                mask: '*',
            },
            {
                type: 'input',
                name: 'model',
                message: colors.textDim(`Preferred Opus Model ${colors.textMuted(`(current: ${currentProfile.model || 'auto-detect'}, empty=auto)`)}`),
                default: currentProfile.model || '',
            }
        ]);
        try {
            await editProfile(name, { url: updates.url || undefined, key: updates.key || undefined, model: updates.model !== undefined ? updates.model.trim() : undefined });
            console.log(colors.success(`\n${symbols.success} ${t('profile.editSuccess')}\n`));
            await new Promise(resolve => setTimeout(resolve, 1500));
        } catch (e) {
            console.log(colors.error(`\n${symbols.error} ${t('profile.error')} ${e.message}\n`));
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        return await manageProfiles(name);
    } else if (action === 'test') {
        const { name } = await inquirer.prompt([{
            type: 'list',
            name: 'name',
            message: colors.primaryBold(t('profile.selectToTest')),
            choices: profiles.map(p => ({
                name: `${p.isActive ? symbols.selected : symbols.unselected} ${p.name} ${colors.textMuted(`(${p.url})`)}`,
                value: p.name
            }))
        }]);
        const targetProfile = profiles.find(p => p.name === name);
        console.log(colors.textDim(`\n${symbols.running} ${t('profile.testing')}...\n`));
        await testProfileConnectivity(targetProfile);
        console.log('');
        await inquirer.prompt([{ type: 'input', name: 'continue', message: colors.textDim(t('profile.pressEnter')) }]);
        return await manageProfiles(targetProfile.name);
    } else if (action === 'switch') {
        const { name } = await inquirer.prompt([{
            type: 'list',
            name: 'name',
            message: t('profile.selectToActivate'),
            choices: profiles.map(p => ({
                name: `${p.isActive ? symbols.selected : symbols.unselected} ${p.name} ${colors.textMuted(`(${p.url})`)}`,
                value: p.name
            }))
        }]);
        const newProfileName = await setActiveProfile(name);
        await new Promise(resolve => setTimeout(resolve, 1000));
        await new Promise(resolve => setTimeout(resolve, 1000));
        return await manageProfiles(newProfileName || name);
    } else if (action === 'delete') {
        const { name } = await inquirer.prompt([{
            type: 'list',
            name: 'name',
            message: colors.error(t('profile.selectToDelete')),
            choices: profiles.map(p => ({
                name: `${p.name} ${colors.textMuted(`(${p.url})`)}`,
                value: p.name
            }))
        }]);
        const { confirm } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirm',
            message: colors.error(t('profile.confirmDelete', { name })),
            default: false
        }]);
        if (confirm) {
            await deleteProfile(name);
            console.log(colors.success(`\n${symbols.success} ${t('profile.deleteSuccess')}\n`));
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
        return await manageProfiles();
    } else if (action === 'list') {
        console.log('\n');
        const tableData = profiles.map(p => ({
            [t('profile.active')]: p.isActive ? symbols.success : '',
            [t('dashboard.name').replace(':', '')]: p.name,
            [t('dashboard.url').replace(':', '')]: p.url,
            [t('profile.hasKey')]: p.key ? symbols.success : symbols.error
        }));
        console.log(table(tableData, {
            borderStyle: 'round',
            borderColor: colors.primary,
            headerColor: colors.primaryBold
        }));
        console.log('');
        await inquirer.prompt([{
            type: 'input',
            name: 'continue',
            message: colors.textDim(t('profile.pressEnter'))
        }]);
        return await manageProfiles(activeName);
    } else if (action === 'back') {
        return activeName;
    }
};

// --- Language Settings Menu ---
const manageLanguage = async () => {
    console.clear();
    const currentLang = getLanguage();

    const content = t('language.current', { lang: colors.primary(getLanguageDisplayName(currentLang)) });

    console.log(box(content, {
        width: 56,
        padding: 1,
        borderStyle: 'round',
        borderColor: colors.accent,
        titleText: t('language.title'),
        titleAlign: 'center',
    }));

    const { lang } = await inquirer.prompt([{
        type: 'list',
        name: 'lang',
        message: colors.primaryBold(t('language.select')),
        choices: getSupportedLanguages().map(l => ({
            name: `${l === currentLang ? symbols.selected : symbols.unselected} ${getLanguageDisplayName(l)}`,
            value: l
        }))
    }]);

    if (lang !== currentLang) {
        setLanguage(lang);
        console.log(colors.success(`\n${symbols.success} ${t('language.changed', { lang: getLanguageDisplayName(lang) })}\n`));
        await new Promise(resolve => setTimeout(resolve, 1500));
    }
};

// --- First Run Check ---
const checkFirstRun = async () => {
    const ccgStatus = checkCCGInstallation();

    // 如果 CCG Skills 已安装，跳过引导
    if (ccgStatus.installed && ccgStatus.skillCount > 0) {
        return;
    }

    console.clear();

    const welcomeContent = [
        colors.primary(t('firstRun.detected')),
        colors.textDim(t('firstRun.ccgNotInstalled')),
    ].join('\n');

    console.log(box(welcomeContent, {
        width: 56,
        padding: 1,
        borderStyle: 'round',
        borderColor: colors.info,
        titleText: t('firstRun.welcome'),
        titleAlign: 'center',
    }));

    const { install } = await inquirer.prompt([{
        type: 'list',
        name: 'install',
        message: colors.primaryBold(t('firstRun.askInstall')),
        choices: [
            {
                name: `${symbols.selected} ${t('firstRun.yes')}`,
                value: true
            },
            {
                name: `${symbols.unselected} ${t('firstRun.no')}`,
                value: false
            }
        ]
    }]);

    if (install) {
        console.log();
        await installCCG();
        await inquirer.prompt([{
            type: 'input',
            name: 'continue',
            message: colors.textDim(t('profile.pressEnter'))
        }]);
    }
};

// --- YOLO Mode Flow ---
const runYoloMode = async (sessionProfileName) => {
    console.clear();

    // 1. Select sandbox type
    const hasDocker = checkDockerAvailable();

    const sandboxChoices = [];
    if (hasDocker) {
        sandboxChoices.push({
            name: colors.text(`${symbols.bullet} ${t('yolo.dockerSandbox')} - ${colors.textDim(t('yolo.dockerDesc'))}`),
            value: 'docker'
        });
    }
    sandboxChoices.push({
        name: colors.text(`${symbols.bullet} ${t('yolo.tempDirSandbox')} - ${colors.textDim(t('yolo.tempDirDesc'))}`),
        value: 'tempdir'
    });
    sandboxChoices.push({
        name: colors.textDim(`${symbols.arrowLeft} ${t('profile.backToMain')}`),
        value: 'back'
    });

    if (!hasDocker) {
        console.log(colors.warning(`${symbols.warning} ${t('yolo.dockerNotFound')}\n`));
    }

    const { sandbox } = await inquirer.prompt([{
        type: 'list',
        name: 'sandbox',
        message: colors.primaryBold(t('yolo.selectSandbox')),
        choices: sandboxChoices
    }]);

    if (sandbox === 'back') return;

    // 2. Project path (with back option)
    const { projectPath: rawPath } = await inquirer.prompt([{
        type: 'input',
        name: 'projectPath',
        message: colors.textDim(t('yolo.projectPath')),
        default: process.cwd(),
        validate: (input) => {
            if (input.toLowerCase().trim() === 'back') return true;
            const p = input.trim() || process.cwd();
            try {
                if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return true;
            } catch { }
            return t('yolo.invalidPath');
        }
    }]);

    if (rawPath.toLowerCase().trim() === 'back') {
        console.log(colors.textDim(`${symbols.arrowLeft} ${t('yolo.cancelled')}`));
        return;
    }
    const projectPath = rawPath.trim() || process.cwd();

    // 3. Select role/persona (like Start Claude)
    const roles = getAvailableRoles();
    let selectedRole = 'default';

    if (roles.length > 0) {
        const { roleChoice } = await inquirer.prompt([{
            type: 'list',
            name: 'roleChoice',
            message: colors.primaryBold(t('mainMenu.selectRole') || 'Select Role / Persona:'),
            choices: [
                { name: colors.textDim('Default (None)'), value: 'default' },
                new inquirer.Separator(),
                ...roles.map(r => ({
                    name: `${colors.text(r.name)} ${colors.textDim(r.type === 'ccg' ? '(CCG)' : '(User)')}`,
                    value: r.path
                }))
            ]
        }]);
        selectedRole = roleChoice;
    }

    // 4. Security warning & confirmation
    console.log();
    console.log(colors.warning(`  ${t('yolo.warning')}`));
    console.log(colors.textDim(`  ${t('yolo.warningText')}`));
    console.log();

    const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: colors.warning(t('yolo.confirmRun')),
        default: false
    }]);

    if (!confirm) return;

    // 5. Execute in sandbox
    if (sandbox === 'docker') {
        if (!ensureYoloImage()) return;
        await runYoloDocker(projectPath, selectedRole, { sessionProfileName });
        // Docker modifies files in-place via volume mount, no merge needed
    } else {
        const result = await runYoloTempDir(projectPath, selectedRole, { sessionProfileName });

        // 6. Post-session actions (temp dir only)
        if (result.sandboxPath) {
            let postDone = false;
            while (!postDone) {
                const { postAction } = await inquirer.prompt([{
                    type: 'list',
                    name: 'postAction',
                    message: colors.primaryBold(t('yolo.postAction')),
                    choices: [
                        { name: colors.text(`${symbols.bullet} ${t('yolo.viewDiff')}`), value: 'diff' },
                        { name: colors.text(`${symbols.bullet} ${t('yolo.mergeback')}`), value: 'merge' },
                        { name: colors.textDim(`${symbols.bullet} ${t('yolo.discard')}`), value: 'discard' },
                        { name: colors.textDim(`${symbols.arrowLeft} ${t('yolo.done')}`), value: 'done' }
                    ]
                }]);

                switch (postAction) {
                    case 'diff':
                        showDiff(result.originalPath, result.sandboxPath);
                        break;
                    case 'merge':
                        mergeBack(result.originalPath, result.sandboxPath);
                        discardSandbox(result.sandboxPath);
                        postDone = true;
                        break;
                    case 'discard':
                        discardSandbox(result.sandboxPath);
                        postDone = true;
                        break;
                    case 'done':
                        postDone = true;
                        break;
                }
            }
        }
    }
};

// --- Interactive Mode ---
const runInteractiveMode = async () => {
    // 首次运行检查
    await checkFirstRun();

    let running = true;
    let sessionProfileName = getActiveProfileName();

    while (running) {
        const action = await showMainMenu(sessionProfileName);

        switch (action) {
            case 'start':
                {
                    // Step 1: Select config source
                    let configSource = 'cchelper';
                    let selectedProfileName = sessionProfileName;
                    let selectedCcSwitchProvider = null;

                    if (isCcSwitchInstalled()) {
                        let currentCcSwitch = null;
                        try {
                            currentCcSwitch = getCurrentCcSwitchProvider('claude');
                        } catch { }

                        const currentSummary = currentCcSwitch ? getCcSwitchProviderSummary(currentCcSwitch) : null;
                        const { sourceChoice } = await inquirer.prompt([{
                            type: 'list',
                            name: 'sourceChoice',
                            message: colors.primaryBold('Select API config source:'),
                            choices: [
                                {
                                    name: `${symbols.selected} CC Helper profile ${colors.textDim(`(${sessionProfileName || 'none'})`)}`,
                                    value: 'cchelper',
                                },
                                {
                                    name: `${symbols.unselected} CC Switch provider ${colors.textDim(`(${currentSummary?.name || 'none'})`)}`,
                                    value: 'ccswitch',
                                },
                            ],
                            default: 'cchelper',
                        }]);
                        configSource = sourceChoice;
                    }

                    if (configSource === 'ccswitch') {
                        selectedCcSwitchProvider = await switchCcSwitchProviderFlow(null, 'claude');
                    } else {
                        const allProfiles = listProfiles();
                        if (allProfiles.length > 1) {
                            const { profileChoice } = await inquirer.prompt([{
                                type: 'list',
                                name: 'profileChoice',
                                message: colors.primaryBold('Select Profile:'),
                                choices: allProfiles.map(p => ({
                                    name: p.isActive
                                        ? `${colors.success(symbols.selected)} ${colors.primary(p.name)} ${colors.textDim('(' + (p.oauth ? 'OAuth' : p.url) + ')')} ${colors.success('(Current)')}`
                                        : `${symbols.unselected} ${p.name} ${colors.textDim('(' + (p.oauth ? 'OAuth' : p.url) + ')')}`,
                                    value: p.name
                                })),
                                default: sessionProfileName
                            }]);
                            selectedProfileName = profileChoice;
                            if (selectedProfileName !== sessionProfileName) {
                                await setActiveProfile(selectedProfileName);
                                sessionProfileName = selectedProfileName;
                            }
                        }
                    }

                    // Step 2: Select Role
                    const roles = getAvailableRoles();
                    let selectedRole = 'default';
                    const currentProfile = configSource === 'cchelper' ? getActiveProfile(sessionProfileName) : null;

                    if (roles.length > 0) {
                        const { roleChoice } = await inquirer.prompt([{
                            type: 'list',
                            name: 'roleChoice',
                            message: colors.primaryBold(t('mainMenu.selectRole') || 'Select Role / Persona:'),
                            choices: [
                                { name: colors.textDim('Default (None)'), value: 'default' },
                                new inquirer.Separator(),
                                ...roles.map(r => ({
                                    name: `${colors.text(r.name)} ${colors.textDim(r.type === 'ccg' ? '(CCG)' : '(User)')}`,
                                    value: r.path
                                }))
                            ]
                        }]);
                        selectedRole = roleChoice;
                    }

                    // Query available Opus models
                    let selectedOpusModel = null;
                    let selectedSonnetModel = null;
                    if (configSource === 'cchelper') {
                        console.log(colors.textDim(`\n${symbols.running} ${t('mainMenu.queryingModels') || 'Querying available Opus models...'}`));

                        const { models: availableOpus, recommended } = await queryAvailableOpusModels(currentProfile);

                        if (availableOpus.length > 1) {
                            // Multiple Opus models available - show selection menu
                            const opusChoices = availableOpus.map(m => ({
                                name: m === recommended
                                    ? `${colors.success(symbols.selected)} ${colors.primary(m)} ${colors.success('(Recommended)')}`
                                    : `${symbols.unselected} ${m}`,
                                value: m
                            }));

                            const { opusChoice } = await inquirer.prompt([{
                                type: 'list',
                                name: 'opusChoice',
                                message: colors.primaryBold(t('mainMenu.selectOpus') || 'Select Opus Model:'),
                                choices: opusChoices,
                                default: recommended
                            }]);
                            selectedOpusModel = opusChoice;
                            console.log(colors.success(`${symbols.success} Selected: ${selectedOpusModel}\n`));
                        } else if (availableOpus.length === 1) {
                            // Only one Opus model available
                            selectedOpusModel = availableOpus[0];
                            console.log(colors.textDim(`${symbols.bullet} ${t('mainMenu.autoSelected') || 'Auto-selected'}: ${colors.primary(selectedOpusModel)}\n`));
                        } else if (recommended) {
                            // No models detected but have a fallback recommendation
                            selectedOpusModel = recommended;
                            console.log(colors.warning(`${symbols.warning} ${t('mainMenu.noModelsDetected') || 'No models detected, using fallback'}: ${colors.primary(selectedOpusModel)}\n`));
                        }
                        selectedOpusModel = selectedOpusModel || recommended;

                        // Query available Sonnet models
                        console.log(colors.textDim(`${symbols.running} ${t('mainMenu.queryingSonnetModels') || 'Querying available Sonnet models...'}`));

                        const { models: availableSonnet, recommended: recommendedSonnet } = await queryAvailableSonnetModels(currentProfile);

                        if (availableSonnet.length > 1) {
                            const sonnetChoices = availableSonnet.map(m => ({
                                name: m === recommendedSonnet
                                    ? `${colors.success(symbols.selected)} ${colors.primary(m)} ${colors.success('(Recommended)')}`
                                    : `${symbols.unselected} ${m}`,
                                value: m
                            }));

                            const { sonnetChoice } = await inquirer.prompt([{
                                type: 'list',
                                name: 'sonnetChoice',
                                message: colors.primaryBold(t('mainMenu.selectSonnet') || 'Select Sonnet Model:'),
                                choices: sonnetChoices,
                                default: recommendedSonnet
                            }]);
                            selectedSonnetModel = sonnetChoice;
                            console.log(colors.success(`${symbols.success} Selected: ${selectedSonnetModel}\n`));
                        } else if (availableSonnet.length === 1) {
                            selectedSonnetModel = availableSonnet[0];
                            console.log(colors.textDim(`${symbols.bullet} ${t('mainMenu.autoSelected') || 'Auto-selected'}: ${colors.primary(selectedSonnetModel)}\n`));
                        } else if (recommendedSonnet) {
                            selectedSonnetModel = recommendedSonnet;
                            console.log(colors.warning(`${symbols.warning} ${t('mainMenu.noModelsDetected') || 'No models detected, using fallback'}: ${colors.primary(selectedSonnetModel)}\n`));
                        }
                    } else if (selectedCcSwitchProvider) {
                        const summary = getCcSwitchProviderSummary(selectedCcSwitchProvider);
                        console.log(colors.textDim(`\n${symbols.bullet} CC Switch provider: ${colors.primary(summary.name)} ${colors.textDim(summary.baseUrl || '')}\n`));
                    }

                    console.log(colors.primary(`\n${symbols.arrowRight} ${t('runner.starting', { command: 'Claude Code' })}\n`));
                    const launchOptions = {
                        command: 'claude',
                        role: selectedRole,
                        opusModel: selectedOpusModel,
                        sonnetModel: selectedSonnetModel,
                        sessionProfileName,
                        configSource,
                        useCcSwitch: configSource === 'ccswitch',
                    };
                    const result = await runClaude(launchOptions);

                    // Check if we need recovery
                    const needsRecovery = result.exitCode !== 0 && result.proxyErrors?.lastError;
                    if (needsRecovery) {
                        await showRecoveryMenu(result, launchOptions);
                    } else {
                        await inquirer.prompt([{
                            type: 'input',
                            name: 'continue',
                            message: colors.textDim(t('profile.pressEnter'))
                        }]);
                    }
                }
                break;

            case 'yolo':
                await runYoloMode(sessionProfileName);
                await inquirer.prompt([{
                    type: 'input',
                    name: 'continue',
                    message: colors.textDim(t('profile.pressEnter'))
                }]);
                break;

            case 'profile':
                {
                    const result = await manageProfiles(sessionProfileName);
                    if (typeof result === 'string') {
                        sessionProfileName = result;
                    }
                }
                break;

            case 'ccswitch':
                await manageCcSwitch();
                break;

            case 'ccg':
                console.log();
                try {
                    await installCCG();
                } catch (e) {
                    // error already logged by installCCG
                }
                await inquirer.prompt([{
                    type: 'input',
                    name: 'continue',
                    message: colors.textDim(t('profile.pressEnter'))
                }]);
                break;

            case 'company':
                await virtualCompanyMenu();
                break;

            case 'trellis':
                await trellisMenu();
                break;

            case 'status':
                await showStatus(sessionProfileName);
                await inquirer.prompt([{
                    type: 'input',
                    name: 'continue',
                    message: colors.textDim(t('profile.pressEnter'))
                }]);
                break;

            case 'language':
                await manageLanguage();
                break;

            case 'exit':
                console.log(colors.textDim(`\n${symbols.bullet} ${t('common.goodbye')}\n`));
                running = false;
                break;
        }
    }
};

// --- Commands ---

program
    .version('1.2.0')
    .description('Claude Code CLI Helper - Interactive AI Development Tool');

program
    .command('profile')
    .description('Manage profiles')
    .action(async () => {
        await manageProfiles();
    });

program
    .command('ccg')
    .description('Manage CCG integrations')
    .argument('<action>', 'install | monitor')
    .action(async (action) => {
        if (action === 'install') {
            await installCCG();
        } else {
            console.log('Unknown action');
        }
    });

program
    .command('start')
    .description('Start Claude Code Wrapper')
    .option('-r, --role <role>', 'Specify role prompt name')
    .option('-m, --model <model>', 'Specify Opus model (skip auto-detection)')
    .option('--ccswitch [provider]', 'Use CC Switch provider instead of cc-helper profile')
    .option('--cmd <command>', 'Override command to run', 'claude')
    .action(async (options) => {
        const useCcSwitch = options.ccswitch !== undefined;
        if (useCcSwitch) {
            if (typeof options.ccswitch === 'string') {
                await switchCcSwitchProviderFlow(options.ccswitch, 'claude');
            } else {
                await printCcSwitchStatus('claude');
            }
        } else {
            await showStatus();
        }

        // Query Opus model if not manually specified
        let opusModel = options.model || null;
        if (!useCcSwitch && !opusModel) {
            console.log(colors.textDim(`\n${symbols.running} ${t('mainMenu.queryingModels') || 'Querying available Opus models...'}`));
            const { models: availableOpus, recommended } = await queryAvailableOpusModels();
            if (recommended) {
                opusModel = recommended;
                console.log(colors.textDim(`${symbols.bullet} ${t('mainMenu.autoSelected') || 'Auto-selected'}: ${colors.primary(opusModel)}\n`));
            }
        }

        await runClaude({
            command: options.cmd,
            role: options.role,
            opusModel,
            configSource: useCcSwitch ? 'ccswitch' : 'cchelper',
            useCcSwitch,
        });
    });

program
    .command('status')
    .description('Show current status and active profile')
    .action(async () => {
        await showStatus();
    });

program
    .command('ccswitch')
    .description('CC Switch bridge: status, list, use, doctor, clean, or open')
    .argument('[action]', 'status | list | use | doctor | clean | open')
    .argument('[target]', 'Provider name or id')
    .option('-a, --app <app>', 'Target CC Switch app type', 'claude')
    .action(async (action, target, options) => {
        try {
            if (!action) {
                await manageCcSwitch();
                return;
            }

            if (action === 'status') {
                await printCcSwitchStatus(options.app);
                return;
            }

            if (action === 'list') {
                await printCcSwitchProviders(options.app);
                return;
            }

            if (action === 'use' || action === 'switch') {
                await switchCcSwitchProviderFlow(target, options.app);
                return;
            }

            if (action === 'doctor') {
                await printCcSwitchDoctor(options.app);
                return;
            }

            if (action === 'clean') {
                await cleanCcSwitchOverridesFlow();
                return;
            }

            if (action === 'open') {
                const exe = openCcSwitch();
                console.log(colors.success(`${symbols.success} Opened CC Switch: ${exe}`));
                return;
            }

            console.log(colors.warning(`Unknown action: ${action}. Use: status | list | use | doctor | clean | open`));
        } catch (error) {
            console.error(colors.error(`${symbols.error} ${error.message}`));
            process.exitCode = 1;
        }
    });

program
    .command('company')
    .description('Virtual Company - Multi-Agent collaboration')
    .action(async () => {
        await virtualCompanyMenu();
    });

program
    .command('yolo')
    .description('Toggle YOLO mode (grant all permissions to running Claude Code session)')
    .option('-s, --status', 'Show current YOLO mode status')
    .option('--on', 'Force enable YOLO mode')
    .option('--off', 'Force disable YOLO mode')
    .action(async (options) => {
        if (options.status) {
            showYoloStatus();
        } else if (options.on) {
            if (isYoloActive()) {
                console.log(colors.warning(`${symbols.warning} ${t('yoloToggle.alreadyActive')}`));
                showYoloStatus();
            } else {
                toggleYolo();
            }
        } else if (options.off) {
            if (!isYoloActive()) {
                console.log(colors.success(`${symbols.success} ${t('yoloToggle.notActive')}`));
                showYoloStatus();
            } else {
                toggleYolo();
            }
        } else {
            // Default: toggle
            toggleYolo();
        }
    });

program
    .command('mcp')
    .description('Manage MCP services (auto-started with cchelper)')
    .argument('[action]', 'add | remove | list')
    .option('-n, --name <name>', 'Service name')
    .option('-p, --path <path>', 'Install path of the MCP project')
    .option('--port <port>', 'Port the MCP server listens on', parseInt)
    .option('-c, --cmd <cmd>', 'Start command (e.g. "python -m src.mcp_server --transport http --host 127.0.0.1 --port 8897")')
    .action(async (action, options) => {
        // Interactive mode if no action given
        if (!action) {
            const { choice } = await inquirer.prompt([{
                type: 'list',
                name: 'choice',
                message: chalk.bold('MCP Service Manager'),
                choices: [
                    { name: 'List all MCP services', value: 'list' },
                    { name: 'Add a new MCP service', value: 'add' },
                    { name: 'Remove a MCP service', value: 'remove' },
                ],
            }]);
            action = choice;
        }

        if (action === 'list') {
            const services = getMcpServices();
            if (services.length === 0) {
                console.log(chalk.yellow('  No MCP services configured.'));
                console.log(chalk.dim('  Use: cc mcp add'));
                return;
            }
            console.log(chalk.bold('\n  Configured MCP Services:\n'));
            for (const svc of services) {
                const inUse = await checkPortInUse(svc.port);
                const status = inUse
                    ? chalk.green('● running')
                    : chalk.gray('○ stopped');
                console.log(`  ${status}  ${chalk.cyan(svc.name)}`);
                console.log(chalk.dim(`         Path: ${svc.installPath}`));
                console.log(chalk.dim(`         Port: ${svc.port}`));
                console.log(chalk.dim(`          Cmd: ${svc.startCmd}`));
                console.log(chalk.dim(`          URL: http://127.0.0.1:${svc.port}/mcp\n`));
            }
            return;
        }

        if (action === 'add') {
            const answers = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'name',
                    message: 'Service name (e.g. web-search):',
                    default: 'web-search',
                    when: !options.name,
                },
                {
                    type: 'input',
                    name: 'installPath',
                    message: 'Install path (absolute path to the MCP project folder):',
                    default: '',
                    when: !options.path,
                    validate: (v) => v.trim() ? true : 'Path is required',
                },
                {
                    type: 'number',
                    name: 'port',
                    message: 'Port the MCP server listens on:',
                    default: 8897,
                    when: !options.port,
                },
                {
                    type: 'input',
                    name: 'startCmd',
                    message: 'Start command:',
                    default: 'python -m src.mcp_server --transport http --host 127.0.0.1 --port 8897',
                    when: !options.cmd,
                },
            ]);

            const svc = {
                name: answers.name || options.name,
                installPath: answers.installPath || options.path,
                port: answers.port !== undefined ? answers.port : options.port,
                startCmd: answers.startCmd || options.cmd,
            };

            try {
                addMcpService(svc);
                console.log(chalk.green(`\n  ✓ MCP service "${svc.name}" added`));
                console.log(chalk.dim(`    Will auto-start at: http://127.0.0.1:${svc.port}/mcp`));
                console.log(chalk.dim(`    Next time you run: cc start`));
            } catch (err) {
                console.error(chalk.red(`  Error: ${err.message}`));
            }
            return;
        }

        if (action === 'remove') {
            const services = getMcpServices();
            if (services.length === 0) {
                console.log(chalk.yellow('  No MCP services configured.'));
                return;
            }

            const targetName = options.name || (await inquirer.prompt([{
                type: 'list',
                name: 'name',
                message: 'Select service to remove:',
                choices: services.map(s => ({ name: `${s.name} (port ${s.port})`, value: s.name })),
            }])).name;

            try {
                removeMcpService(targetName);
                console.log(chalk.green(`  ✓ MCP service "${targetName}" removed`));
            } catch (err) {
                console.error(chalk.red(`  Error: ${err.message}`));
            }
            return;
        }

        console.log(chalk.yellow(`Unknown action: ${action}. Use: add | remove | list`));
    });

// Default action - run interactive mode if no command specified
if (process.argv.length === 2) {
    runInteractiveMode().catch(err => {
        console.error(chalk.red('Error:'), err.message);
        process.exit(1);
    });
} else {
    program.parse(process.argv);
}
