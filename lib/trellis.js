import inquirer from 'inquirer';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { t } from './i18n.js';
import { colors, symbols, box, keyValue } from './theme.js';

/**
 * Check if trellis CLI is globally installed
 * @returns {boolean}
 */
const isTrellisInstalled = () => {
    try {
        execSync('trellis --version', {
            stdio: 'pipe',
            timeout: 5000,
        });
        return true;
    } catch {
        return false;
    }
};

/**
 * Check if current directory has been initialized with Trellis
 * @returns {boolean}
 */
export const isTrellisInitialized = () => {
    return fs.existsSync(path.join(process.cwd(), '.trellis'));
};

/**
 * Get trellis status label for main menu display
 * @returns {{ label: string, installed: boolean, initialized: boolean }}
 */
export const getTrellisStatus = () => {
    const installed = isTrellisInstalled();
    const initialized = isTrellisInitialized();

    if (!installed) {
        return {
            label: colors.error(`[${t('trellis.notInstalled')}]`),
            installed,
            initialized,
        };
    }
    if (initialized) {
        return {
            label: colors.success(`[${t('trellis.enabled')}]`),
            installed,
            initialized,
        };
    }
    return {
        label: colors.warning(`[${t('trellis.notInitialized')}]`),
        installed,
        initialized,
    };
};

/**
 * Run a trellis command with inherited stdio
 * @param {string[]} args
 * @returns {Promise<number>} exit code
 */
const runTrellisCommand = (args) => {
    return new Promise((resolve) => {
        const subprocess = spawn('trellis', args, {
            stdio: 'inherit',
            shell: true,
        });

        subprocess.on('close', (code) => {
            resolve(code ?? 1);
        });

        subprocess.on('error', (error) => {
            console.error(colors.error(`${symbols.error} ${error.message}`));
            resolve(1);
        });
    });
};

/**
 * Trellis management submenu
 */
export const trellisMenu = async () => {
    const installed = isTrellisInstalled();

    if (!installed) {
        console.log(colors.warning(`\n${symbols.warning} ${t('trellis.installFirst')}\n`));
        await inquirer.prompt([{
            type: 'input',
            name: 'continue',
            message: colors.textDim(t('profile.pressEnter')),
        }]);
        return;
    }

    let running = true;

    while (running) {
        console.clear();

        const initialized = isTrellisInitialized();

        // Build choices
        const choices = [];

        if (!initialized) {
            choices.push({
                name: colors.text(`${symbols.pointer} ${t('trellis.initialize')}`),
                value: 'init',
            });
        } else {
            choices.push({
                name: colors.text(`${symbols.bullet} ${t('trellis.update')}`),
                value: 'update',
            });
        }

        choices.push({
            name: colors.text(`${symbols.bullet} ${t('trellis.viewStatus')}`),
            value: 'status',
        });

        choices.push({
            name: colors.textDim(`${symbols.arrowLeft} ${t('trellis.returnToMain')}`),
            value: 'back',
        });

        const { action } = await inquirer.prompt([{
            type: 'list',
            name: 'action',
            message: colors.primaryBold(t('trellis.selectAction')),
            choices,
        }]);

        switch (action) {
            case 'init': {
                // Ask for username
                const { username } = await inquirer.prompt([{
                    type: 'input',
                    name: 'username',
                    message: colors.textDim(t('trellis.enterUsername')),
                    validate: (input) => input.trim() ? true : t('trellis.usernameEmpty'),
                }]);

                console.log(colors.primary(`\n${symbols.running} ${t('trellis.initializing')}\n`));
                const code = await runTrellisCommand(['init', '-u', username.trim(), '--claude', '-y']);

                if (code === 0) {
                    console.log(colors.success(`\n${symbols.success} ${t('trellis.initSuccess')}\n`));
                } else {
                    console.log(colors.error(`\n${symbols.error} ${t('trellis.initFailed')}\n`));
                }

                await inquirer.prompt([{
                    type: 'input',
                    name: 'continue',
                    message: colors.textDim(t('profile.pressEnter')),
                }]);
                break;
            }

            case 'update': {
                console.log(colors.primary(`\n${symbols.running} ${t('trellis.updating')}\n`));
                const code = await runTrellisCommand(['update']);

                if (code === 0) {
                    console.log(colors.success(`\n${symbols.success} ${t('trellis.updateSuccess')}\n`));
                } else {
                    console.log(colors.error(`\n${symbols.error} ${t('trellis.updateFailed')}\n`));
                }

                await inquirer.prompt([{
                    type: 'input',
                    name: 'continue',
                    message: colors.textDim(t('profile.pressEnter')),
                }]);
                break;
            }

            case 'status': {
                const trellisPath = path.join(process.cwd(), '.trellis');
                const exists = fs.existsSync(trellisPath);

                const lines = [
                    keyValue(t('trellis.trellisDir'), exists ? colors.success(t('trellis.exists')) : colors.error(t('trellis.notExists')), 16),
                ];

                if (exists) {
                    try {
                        const items = fs.readdirSync(trellisPath);
                        lines.push(keyValue(t('trellis.contents'), colors.primary(items.join(', ') || '-'), 16));
                    } catch {
                        lines.push(keyValue(t('trellis.contents'), colors.textMuted('-'), 16));
                    }
                }

                console.log(box(lines.join('\n'), {
                    width: 60,
                    padding: 1,
                    borderStyle: 'round',
                    borderColor: colors.primary,
                    titleText: t('trellis.statusTitle'),
                    titleAlign: 'center',
                }));

                await inquirer.prompt([{
                    type: 'input',
                    name: 'continue',
                    message: colors.textDim(t('profile.pressEnter')),
                }]);
                break;
            }

            case 'back':
                running = false;
                break;
        }
    }
};
