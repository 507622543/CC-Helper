#!/usr/bin/env node

/**
 * CC Helper - Quick Setup Script
 * This script helps users quickly set up their first profile
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import boxen from 'boxen';
import { addProfile, listProfiles } from './lib/profile.js';

console.clear();

console.log(boxen(
    chalk.bold.cyan('Welcome to CC Helper! 🚀\n\n') +
    chalk.white('This quick setup will help you configure your first profile.\n') +
    chalk.gray('You can always add more profiles later using "cchelper profile"'),
    {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
        title: chalk.bold.white('Quick Setup'),
        titleAlignment: 'center'
    }
));

console.log(chalk.yellow('\n📋 Let\'s get started!\n'));

// Check if profiles already exist
const existingProfiles = listProfiles();
if (existingProfiles.length > 0) {
    console.log(chalk.green('✓ You already have profiles configured!\n'));
    console.log(chalk.cyan('Existing profiles:'));
    existingProfiles.forEach(p => {
        console.log(chalk.gray(`  ${p.isActive ? '●' : '○'} ${p.name} (${p.url})`));
    });
    console.log(chalk.yellow('\nRun "cchelper" to manage your profiles.\n'));
    process.exit(0);
}

// Profile templates
const templates = {
    anthropic: {
        name: 'Anthropic Official',
        url: 'https://api.anthropic.com',
        description: 'Official Anthropic API endpoint'
    },
    custom: {
        name: 'Custom',
        url: '',
        description: 'Custom API endpoint (proxy, self-hosted, etc.)'
    }
};

const setup = async () => {
    try {
        // Step 1: Choose template
        const { template } = await inquirer.prompt([{
            type: 'list',
            name: 'template',
            message: 'Choose a profile template:',
            choices: [
                {
                    name: `${chalk.cyan('Anthropic Official')} - ${chalk.gray('https://api.anthropic.com')}`,
                    value: 'anthropic'
                },
                {
                    name: `${chalk.cyan('Custom Endpoint')} - ${chalk.gray('Your own API URL')}`,
                    value: 'custom'
                }
            ]
        }]);

        // Step 2: Get profile details
        const questions = [
            {
                type: 'input',
                name: 'name',
                message: 'Profile name:',
                default: templates[template].name,
                validate: input => {
                    if (!input.trim()) return 'Name cannot be empty';
                    if (!/^[a-zA-Z0-9_-\s]+$/.test(input)) {
                        return 'Name can only contain letters, numbers, spaces, hyphens and underscores';
                    }
                    return true;
                }
            }
        ];

        if (template === 'custom') {
            questions.push({
                type: 'input',
                name: 'url',
                message: 'API Base URL:',
                validate: input => {
                    try {
                        new URL(input);
                        return true;
                    } catch {
                        return 'Please enter a valid URL (e.g., https://api.example.com)';
                    }
                }
            });
        }

        questions.push({
            type: 'password',
            name: 'key',
            message: 'API Key:',
            mask: '*',
            validate: input => {
                if (!input.trim()) return 'API Key cannot be empty';
                if (input.length < 10) return 'API Key seems too short';
                return true;
            }
        });

        const answers = await inquirer.prompt(questions);

        // Use template URL if not custom
        if (template !== 'custom') {
            answers.url = templates[template].url;
        }

        // Step 3: Confirm
        console.log(chalk.cyan('\n📝 Profile Summary:\n'));
        console.log(chalk.gray('  Name:'), chalk.white(answers.name));
        console.log(chalk.gray('  URL: '), chalk.white(answers.url));
        console.log(chalk.gray('  Key: '), chalk.white('*'.repeat(8) + answers.key.slice(-4)));
        console.log();

        const { confirm } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirm',
            message: 'Create this profile?',
            default: true
        }]);

        if (!confirm) {
            console.log(chalk.yellow('\n⚠ Setup cancelled.\n'));
            process.exit(0);
        }

        // Step 4: Create profile
        addProfile(answers);

        console.log(chalk.green('\n✓ Profile created successfully!\n'));

        // Step 5: Next steps
        console.log(boxen(
            chalk.bold('🎉 Setup Complete!\n\n') +
            chalk.white('Your profile has been created and activated.\n\n') +
            chalk.cyan('Next steps:\n') +
            chalk.gray('  1. Run "cchelper" to start the interactive interface\n') +
            chalk.gray('  2. Select "🚀 Start Claude Code" to begin\n') +
            chalk.gray('  3. Use "cchelper --help" to see all commands\n\n') +
            chalk.yellow('Tip: ') + chalk.gray('You can add more profiles anytime with "cchelper profile"'),
            {
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'green'
            }
        ));

        // Ask if user wants to start now
        const { startNow } = await inquirer.prompt([{
            type: 'confirm',
            name: 'startNow',
            message: 'Would you like to start cchelper now?',
            default: true
        }]);

        if (startNow) {
            console.log(chalk.blue('\n🚀 Starting cchelper...\n'));
            // Import and run the main program
            const { default: main } = await import('./index.js');
        } else {
            console.log(chalk.green('\n👋 Run "cchelper" when you\'re ready!\n'));
        }

    } catch (error) {
        if (error.isTtyError) {
            console.error(chalk.red('\n✗ Error: This environment doesn\'t support interactive prompts\n'));
        } else if (error.message === 'User force closed the prompt') {
            console.log(chalk.yellow('\n⚠ Setup cancelled by user.\n'));
        } else {
            console.error(chalk.red('\n✗ Error:'), error.message);
        }
        process.exit(1);
    }
};

setup();
