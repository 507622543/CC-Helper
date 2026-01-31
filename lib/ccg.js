import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';
import execa from 'execa';
import { t } from './i18n.js';
import { colors, symbols } from './theme.js';

const USER_HOME = os.homedir();
const CLAUDE_DIR = path.join(USER_HOME, '.claude');
const CCG_COMMANDS_DIR = path.join(CLAUDE_DIR, 'commands', 'ccg');
const CCG_PROMPTS_DIR = path.join(CLAUDE_DIR, '.ccg', 'prompts');

export const installCCG = async () => {
    console.log(colors.primary(`${symbols.arrowRight} ${t('ccg.installing')}\n`));

    try {
        // Create directories
        console.log(colors.textDim(`${symbols.bullet} ${t('ccg.creatingDirs')}`));
        fs.mkdirSync(CCG_COMMANDS_DIR, { recursive: true });
        fs.mkdirSync(path.join(CCG_PROMPTS_DIR, 'claude'), { recursive: true });
        fs.mkdirSync(path.join(CCG_PROMPTS_DIR, 'codex'), { recursive: true });
        fs.mkdirSync(path.join(CCG_PROMPTS_DIR, 'gemini'), { recursive: true });
        console.log(colors.success(`${symbols.success} ${t('ccg.dirsCreated')}\n`));

        // Clone repository
        const tempDir = path.join(os.tmpdir(), 'ccg-skills-temp');
        if (fs.existsSync(tempDir)) {
            console.log(colors.textDim(`${symbols.bullet} ${t('ccg.cleaningTemp')}`));
            fs.rmSync(tempDir, { recursive: true, force: true });
        }

        console.log(colors.primary(`${symbols.arrowRight} ${t('ccg.cloning')}`));
        console.log(colors.textMuted(`  ${t('ccg.pleaseWait')}\n`));

        await execa('git', ['clone', 'https://github.com/dkjsiogu/ccg-skills.git', tempDir]);
        console.log(colors.success(`${symbols.success} ${t('ccg.cloned')}\n`));

        // Copy skills
        console.log(colors.primary(`${symbols.arrowRight} ${t('ccg.copying')}`));
        const files = fs.readdirSync(tempDir);
        let copiedCount = 0;

        for (const file of files) {
            if (file.endsWith('.md')) {
                const sourcePath = path.join(tempDir, file);
                const destPath = path.join(CCG_COMMANDS_DIR, file);
                fs.copyFileSync(sourcePath, destPath);
                console.log(colors.textDim(`  ${symbols.bulletInactive} ${file}`));
                copiedCount++;
            }
        }

        console.log(colors.success(`\n${symbols.success} ${t('ccg.skillsInstalled', { count: copiedCount })}\n`));

        // Show installation summary
        console.log(colors.info(`${symbols.info} ${t('ccg.installLocations')}`));
        console.log(colors.textDim(`  ${t('ccg.skills')} ${CCG_COMMANDS_DIR}`));
        console.log(colors.textDim(`  ${t('ccg.prompts')} ${CCG_PROMPTS_DIR}\n`));

        // Cleanup
        console.log(colors.textDim(`${symbols.bullet} ${t('ccg.cleaningUp')}`));
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log(colors.success(`${symbols.success} ${t('ccg.cleanupComplete')}\n`));

        console.log(colors.success.bold(`${symbols.success} ${t('ccg.installSuccess')}\n`));

    } catch (e) {
        console.error(colors.error(`\n${symbols.error} ${t('ccg.installFailed')}`), e.message);
        console.log(colors.warning(`\n${symbols.warning} ${t('ccg.troubleshooting')}`));
        console.log(colors.textDim(`  ${symbols.bullet} ${t('ccg.ensureGit')}`));
        console.log(colors.textDim(`  ${symbols.bullet} ${t('ccg.checkInternet')}`));
        console.log(colors.textDim(`  ${symbols.bullet} ${t('ccg.verifyPermissions')}\n`));
        throw e;
    }
};

export const sendMonitorEvent = async (event, profile, role) => {
    // event: 'start' | 'end' | 'error'
    // profile: active profile object
    // role: string
    const monitorUrl = process.env.CCG_MONITOR_URL || 'http://127.0.0.1:3721';

    // Logic similar to codeagent-wrapper
    // This is a simplified telemetry ping
    if (event === 'start') {
        const payload = {
            cli_type: 'claude', // or 'cc-helper'
            prompt: `Running with role: ${role}`,
            workdir: process.cwd(),
            status: 'running',
            timestamp: new Date().toISOString(),
            profile: profile?.name || 'default'
        };
        try {
            await axios.post(`${monitorUrl}/api/tasks`, payload, { timeout: 1000 });
        } catch (e) {
            // Ignore monitor errors (fire and forget)
        }
    } else if (event === 'end') {
        const payload = {
            cli_type: 'claude',
            status: 'completed',
            timestamp: new Date().toISOString(),
            profile: profile?.name || 'default'
        };
        try {
            await axios.post(`${monitorUrl}/api/tasks/complete`, payload, { timeout: 1000 });
        } catch (e) {
            // Ignore monitor errors
        }
    }
};

export const checkCCGInstallation = () => {
    const installed = fs.existsSync(CCG_COMMANDS_DIR);
    const skillCount = installed ? fs.readdirSync(CCG_COMMANDS_DIR).filter(f => f.endsWith('.md')).length : 0;

    return {
        installed,
        skillCount,
        path: CCG_COMMANDS_DIR
    };
};
