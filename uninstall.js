#!/usr/bin/env node

/**
 * CC Helper - Uninstall Script
 * This script helps users cleanly uninstall CC Helper
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import boxen from 'boxen';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Conf from 'conf';

console.clear();

console.log(boxen(
    chalk.bold.red('CC Helper Uninstall\n\n') +
    chalk.white('This will remove CC Helper from your system.\n') +
    chalk.gray('Your configuration files can optionally be preserved.'),
    {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'red',
        title: chalk.bold.white('⚠️  Uninstall'),
        titleAlignment: 'center'
    }
));

const uninstall = async () => {
    try {
        // Step 1: Confirm uninstall
        const { confirmUninstall } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirmUninstall',
            message: chalk.yellow('Are you sure you want to uninstall CC Helper?'),
            default: false
        }]);

        if (!confirmUninstall) {
            console.log(chalk.green('\n✓ Uninstall cancelled.\n'));
            process.exit(0);
        }

        // Step 2: Ask about config files
        const config = new Conf({ projectName: 'cc-helper' });
        const configPath = config.path;
        const configExists = fs.existsSync(configPath);

        let removeConfig = false;
        if (configExists) {
            console.log(chalk.cyan('\n📁 Configuration file found:'));
            console.log(chalk.gray(`   ${configPath}\n`));

            const { removeConfigChoice } = await inquirer.prompt([{
                type: 'confirm',
                name: 'removeConfigChoice',
                message: 'Do you want to remove your configuration file? (profiles will be lost)',
                default: false
            }]);

            removeConfig = removeConfigChoice;
        }

        // Step 3: Uninstall
        console.log(chalk.blue('\n🗑️  Uninstalling CC Helper...\n'));

        // Unlink from global
        try {
            console.log(chalk.gray('Removing global link...'));
            execSync('npm unlink -g cc-helper', { stdio: 'ignore' });
            console.log(chalk.green('✓ Global link removed\n'));
        } catch (error) {
            console.log(chalk.yellow('⚠ Could not remove global link (may not be installed globally)\n'));
        }

        // Remove config if requested
        if (removeConfig && configExists) {
            try {
                console.log(chalk.gray('Removing configuration file...'));
                const configDir = path.dirname(configPath);
                fs.rmSync(configDir, { recursive: true, force: true });
                console.log(chalk.green('✓ Configuration removed\n'));
            } catch (error) {
                console.log(chalk.red(`✗ Could not remove config: ${error.message}\n`));
            }
        } else if (configExists) {
            console.log(chalk.cyan('ℹ Configuration file preserved at:'));
            console.log(chalk.gray(`  ${configPath}\n`));
        }

        // Step 4: Show summary
        console.log(boxen(
            chalk.bold.green('✓ Uninstall Complete\n\n') +
            chalk.white('CC Helper has been removed from your system.\n\n') +
            (configExists && !removeConfig
                ? chalk.cyan('Your configuration file was preserved.\n') +
                  chalk.gray('You can manually delete it at:\n') +
                  chalk.gray(`${configPath}\n\n`)
                : '') +
            chalk.yellow('To reinstall:\n') +
            chalk.gray('  cd D:\\cc-helper\n') +
            chalk.gray('  npm install -g .\n\n') +
            chalk.white('Thank you for using CC Helper! 👋'),
            {
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'green'
            }
        ));

    } catch (error) {
        if (error.message === 'User force closed the prompt') {
            console.log(chalk.yellow('\n⚠ Uninstall cancelled by user.\n'));
        } else {
            console.error(chalk.red('\n✗ Error during uninstall:'), error.message);
        }
        process.exit(1);
    }
};

uninstall();
