#!/usr/bin/env node
import { program } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { addProfile, listProfiles, setActiveProfile, getActiveProfile, deleteProfile } from './lib/profile.js';
import { installCCG, checkCCGInstallation } from './lib/ccg.js';
import { runClaude } from './lib/runner.js';
import { checkDockerAvailable, ensureYoloImage, runYoloDocker, runYoloTempDir, showDiff, mergeBack, discardSandbox } from './lib/yolo.js';
import axios from 'axios';
import { t, getLanguage, setLanguage, getSupportedLanguages, getLanguageDisplayName } from './lib/i18n.js';
import { colors, symbols, box, divider, keyValue, statusBadge, statusCodeBadge, table } from './lib/theme.js';
import { virtualCompanyMenu } from './lib/virtual-company.js';

// --- Dashboard / Status ---
const showStatus = async () => {
    const profile = getActiveProfile();
    const profileText = profile ? colors.success(profile.name) : colors.error(t('dashboard.none'));
    const urlText = profile?.url ? colors.primary(profile.url) : colors.textMuted(t('dashboard.na'));

    // Enhanced API detection with status code, latency, and usage info
    let statusCode = 'N/A';
    let latency = 0;
    let usageInfo = colors.textMuted(t('dashboard.unknown'));
    let statusType = 'pending';
    let latencyText = colors.textMuted(t('dashboard.na'));
    let usageText = colors.textMuted(t('dashboard.notSupported'));

    if (profile?.url && profile?.key) {
        try {
            const start = Date.now();

            // Minimal API request to check status (consumes ~12 tokens)
            const response = await axios.post(`${profile.url}/messages`, {
                model: 'claude-3-haiku-20240307',  // Cheapest model
                max_tokens: 5,                      // Minimal output
                messages: [{
                    role: 'user',
                    content: 'Output only: 23'     // Simple instruction
                }]
            }, {
                headers: {
                    'x-api-key': profile.key,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                },
                timeout: 5000,
                validateStatus: () => true  // Accept all status codes
            });

            latency = Date.now() - start;
            statusCode = response.status;

            // Format latency text
            latencyText = colors.primary(`${latency}ms`);

            // Verify response contains "23" to confirm API is working
            let apiWorking = false;
            if (statusCode >= 200 && statusCode < 300) {
                try {
                    const outputText = response.data?.content?.[0]?.text || '';
                    apiWorking = outputText.includes('23');
                } catch {
                    apiWorking = false;
                }
            }

            // Determine status type based on status code
            if (statusCode >= 200 && statusCode < 300) {
                statusType = apiWorking ? 'success' : 'warning';
                usageInfo = apiWorking ? `${t('dashboard.online')} (${latency}ms)` : `${t('dashboard.apiResponseError')} (${latency}ms)`;
            } else if (statusCode >= 400 && statusCode < 500) {
                statusType = 'warning';
                usageInfo = `${t('dashboard.online')} (${latency}ms)`;
            } else if (statusCode >= 500) {
                statusType = 'error';
                usageInfo = `${t('dashboard.online')} (${latency}ms)`;
            } else {
                statusType = 'info';
                usageInfo = `${t('dashboard.online')} (${latency}ms)`;
            }

            // Try to extract rate limit info from response headers
            const headers = response.headers;
            const rateLimitRemaining = headers['anthropic-ratelimit-requests-remaining'] ||
                                      headers['x-ratelimit-remaining'] ||
                                      headers['x-rate-limit-remaining'];
            const rateLimitLimit = headers['anthropic-ratelimit-requests-limit'] ||
                                  headers['x-ratelimit-limit'] ||
                                  headers['x-rate-limit-limit'];

            if (rateLimitRemaining !== undefined && rateLimitLimit !== undefined) {
                const remaining = parseInt(rateLimitRemaining);
                const limit = parseInt(rateLimitLimit);
                const usagePercent = Math.round(((limit - remaining) / limit) * 100);
                usageText = colors.primary(`${remaining}/${limit} (${usagePercent}% ${t('dashboard.usagePercent')})`);
            } else {
                usageText = colors.textMuted(t('dashboard.notSupported'));
            }

        } catch (error) {
            // Handle network errors
            if (error.code === 'ECONNABORTED') {
                usageInfo = t('dashboard.timeout');
                statusType = 'error';
                statusCode = 'TIMEOUT';
            } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                usageInfo = t('dashboard.unreachable');
                statusType = 'error';
                statusCode = 'ERROR';
            } else if (error.response) {
                // Got response but with error status
                statusCode = error.response.status;
                latency = Date.now() - start;
                latencyText = colors.primary(`${latency}ms`);

                if (statusCode >= 400 && statusCode < 500) {
                    statusType = 'warning';
                    usageInfo = `${t('dashboard.online')} (${latency}ms)`;
                } else {
                    statusType = 'error';
                    usageInfo = `${t('dashboard.online')} (${latency}ms)`;
                }
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
        // No API key configured
        usageInfo = t('dashboard.apiKeyNotConfigured');
        statusType = 'warning';
        statusCode = 'N/A';
    }

    const content = [
        keyValue(t('dashboard.name'), profileText, 12),
        keyValue(t('dashboard.url'), urlText, 12),
        keyValue(t('dashboard.statusCode'), statusCodeBadge(statusCode), 12),
        keyValue(t('dashboard.latency'), latencyText, 12),
        keyValue(t('dashboard.usage'), usageText, 12),
        keyValue(t('dashboard.status'), statusBadge(statusType, usageInfo), 12),
    ].join('\n');

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

// --- Interactive Main Menu ---
const showMainMenu = async () => {
    await showStatus();

    const { action } = await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: colors.primaryBold(t('mainMenu.prompt')),
        choices: [
            { name: colors.text(`${symbols.pointer} ${t('mainMenu.startClaude')}`), value: 'start' },
            { name: colors.text(`${symbols.bullet} ${t('yolo.menuItem')}`), value: 'yolo' },
            { name: colors.text(`${symbols.bullet} ${t('mainMenu.manageProfiles')}`), value: 'profile' },
            { name: colors.rainbow(`${symbols.bullet} ${t('mainMenu.virtualCompany')}`), value: 'company' },
            { name: colors.text(`${symbols.bullet} ${t('mainMenu.viewStatus')}`), value: 'status' },
            { name: colors.text(`${symbols.bullet} ${t('mainMenu.languageSettings')}`), value: 'language' },
            { name: colors.textDim(`${symbols.bulletInactive} ${t('mainMenu.exit')}`), value: 'exit' }
        ],
        pageSize: 10
    }]);

    return action;
};

// --- Profile Management Menu ---
const manageProfiles = async () => {
    console.clear();
    const profiles = listProfiles();

    const profileList = profiles.length > 0
        ? profiles.map(p =>
            `  ${p.isActive ? symbols.selected : symbols.unselected} ${colors.text(p.name)} ${colors.textMuted(`(${p.url})`)}`
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
            { name: profiles.length === 0 ? colors.textMuted(`${symbols.bulletInactive} ${t('profile.switch')}`) : colors.text(`${symbols.bullet} ${t('profile.switch')}`), value: 'switch', disabled: profiles.length === 0 },
            { name: profiles.length === 0 ? colors.textMuted(`${symbols.bulletInactive} ${t('profile.delete')}`) : colors.text(`${symbols.bullet} ${t('profile.delete')}`), value: 'delete', disabled: profiles.length === 0 },
            { name: profiles.length === 0 ? colors.textMuted(`${symbols.bulletInactive} ${t('profile.viewAll')}`) : colors.text(`${symbols.bullet} ${t('profile.viewAll')}`), value: 'list', disabled: profiles.length === 0 },
            { name: colors.textDim(`${symbols.arrowLeft} ${t('profile.backToMain')}`), value: 'back' }
        ]
    }]);

    if (action === 'add') {
        console.log(colors.primary(`\n${symbols.bullet} ${t('profile.createNew')}\n`));
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
            }
        ]);
        try {
            addProfile(answers);
            console.log(colors.success(`\n${symbols.success} ${t('profile.addSuccess')}\n`));
            await new Promise(resolve => setTimeout(resolve, 1500));
        } catch (e) {
            console.log(colors.error(`\n${symbols.error} ${t('profile.error')} ${e.message}\n`));
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        return await manageProfiles();
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
        setActiveProfile(name);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return await manageProfiles();
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
            deleteProfile(name);
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
        return await manageProfiles();
    } else if (action === 'back') {
        return;
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
const runYoloMode = async () => {
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

    // 3. Security warning & confirmation
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

    // 4. Execute in sandbox
    if (sandbox === 'docker') {
        if (!ensureYoloImage()) return;
        await runYoloDocker(projectPath);
        // Docker modifies files in-place via volume mount, no merge needed
    } else {
        const result = await runYoloTempDir(projectPath);

        // 5. Post-session actions (temp dir only)
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

    while (running) {
        const action = await showMainMenu();

        switch (action) {
            case 'start':
                {
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

                    console.log(colors.primary(`\n${symbols.arrowRight} ${t('runner.starting', { command: 'Claude Code' })}\n`));
                    await runClaude({ command: 'claude', role: selectedRole });
                    await inquirer.prompt([{
                        type: 'input',
                        name: 'continue',
                        message: colors.textDim(t('profile.pressEnter'))
                    }]);
                }
                break;

            case 'yolo':
                await runYoloMode();
                await inquirer.prompt([{
                    type: 'input',
                    name: 'continue',
                    message: colors.textDim(t('profile.pressEnter'))
                }]);
                break;

            case 'profile':
                await manageProfiles();
                break;

            case 'company':
                await virtualCompanyMenu();
                break;

            case 'status':
                await showStatus();
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
    .version('1.0.0')
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
    .option('--cmd <command>', 'Override command to run', 'claude')
    .action(async (options) => {
        await showStatus();
        await runClaude({
            command: options.cmd,
            role: options.role
        });
    });

program
    .command('status')
    .description('Show current status and active profile')
    .action(async () => {
        await showStatus();
    });

program
    .command('company')
    .description('Virtual Company - Multi-Agent collaboration')
    .action(async () => {
        await virtualCompanyMenu();
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
