import Conf from 'conf';
import chalk from 'chalk';
import { t } from './i18n.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const config = new Conf({ projectName: 'cc-helper' });

export const getProfiles = () => config.get('profiles', []);
export const getActiveProfileName = () => config.get('activeProfile');

export const getActiveProfile = () => {
    const profiles = getProfiles();
    const activeName = getActiveProfileName();
    return profiles.find(p => p.name === activeName);
};

export const addProfile = (profile) => {
    const profiles = getProfiles();
    if (profiles.find(p => p.name === profile.name)) {
        throw new Error(t('profile.alreadyExists', { name: profile.name }));
    }
    profiles.push(profile);
    config.set('profiles', profiles);
    if (profiles.length === 1) {
        setActiveProfile(profile.name);
        // Sync is handled by setActiveProfile
    }
};

export const setActiveProfile = (name) => {
    const profiles = getProfiles();
    const profile = profiles.find(p => p.name === name);
    if (!profile) {
        throw new Error(t('profile.notFound', { name }));
    }
    config.set('activeProfile', name);

    // Sync profile to Claude settings.json
    syncProfileToClaudeSettings(profile);

    console.log(chalk.green(`✓ ${t('profile.switchedTo', { name })}`));
};

export const listProfiles = () => {
    const profiles = getProfiles();
    const active = getActiveProfileName();
    return profiles.map(p => ({
        ...p,
        isActive: p.name === active
    }));
};

export const deleteProfile = (name) => {
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
            setActiveProfile(filtered[0].name);
        } else {
            config.delete('activeProfile');
            clearClaudeSettings();
            console.log(chalk.yellow(t('profile.noRemaining')));
        }
    }
};

// --- Sync Profile to Claude Settings ---

/**
 * Syncs the active profile's URL and API Key to ~/.claude/settings.json
 * This ensures Claude Code can read the correct configuration on startup
 */
export const syncProfileToClaudeSettings = (profile) => {
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
                // If parse fails, start fresh
                settings = {};
            }
        }

        // Ensure env object exists
        if (!settings.env) {
            settings.env = {};
        }

        // Update env with profile data
        if (profile.url) {
            settings.env.ANTHROPIC_BASE_URL = profile.url;
        }
        if (profile.key) {
            settings.env.ANTHROPIC_API_KEY = profile.key;
        }

        // Write back to settings.json
        fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
    } catch (error) {
        // Non-fatal: log but don't throw
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

    // Check if URL already ends with /v1
    if (normalized.endsWith('/v1')) {
        return normalized;
    }

    // Add /v1 if not present
    return `${normalized}/v1`;
};
