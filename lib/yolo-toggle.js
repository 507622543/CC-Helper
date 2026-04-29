import fs from 'fs';
import path from 'path';
import os from 'os';
import { t } from './i18n.js';
import { colors, symbols, box } from './theme.js';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SETTINGS_LOCAL = path.join(CLAUDE_DIR, 'settings.local.json');
const YOLO_BACKUP = path.join(CLAUDE_DIR, '.yolo-backup.json');

// All tool wildcard permissions for YOLO mode
const YOLO_PERMISSIONS = [
    'Bash(*)',
    'Edit(*)',
    'Write(*)',
    'Read(*)',
    'WebFetch(*)',
    'WebSearch',
    'NotebookEdit(*)',
    'Glob(*)',
    'Grep(*)',
    'Task(*)',
    'mcp__*',
];

/**
 * Check if YOLO mode is currently active
 * (backup file exists = YOLO is on)
 */
export const isYoloActive = () => {
    return fs.existsSync(YOLO_BACKUP);
};

/**
 * Get current YOLO status info
 */
export const getYoloStatus = () => {
    const active = isYoloActive();
    let currentPermCount = 0;

    try {
        if (fs.existsSync(SETTINGS_LOCAL)) {
            const settings = JSON.parse(fs.readFileSync(SETTINGS_LOCAL, 'utf8'));
            currentPermCount = settings?.permissions?.allow?.length || 0;
        }
    } catch { }

    return {
        active,
        permissionCount: currentPermCount,
        backupExists: fs.existsSync(YOLO_BACKUP),
        settingsPath: SETTINGS_LOCAL,
        backupPath: YOLO_BACKUP,
    };
};

/**
 * Enable YOLO mode:
 * 1. Backup current settings.local.json
 * 2. Inject wildcard permissions
 */
export const enableYolo = () => {
    // Safety: don't double-enable
    if (isYoloActive()) {
        console.log(colors.warning(`${symbols.warning} ${t('yoloToggle.alreadyActive')}`));
        return false;
    }

    // Ensure .claude directory exists
    if (!fs.existsSync(CLAUDE_DIR)) {
        fs.mkdirSync(CLAUDE_DIR, { recursive: true });
    }

    // Read current settings (or create empty)
    let currentSettings = {};
    if (fs.existsSync(SETTINGS_LOCAL)) {
        try {
            currentSettings = JSON.parse(fs.readFileSync(SETTINGS_LOCAL, 'utf8'));
        } catch {
            currentSettings = {};
        }
    }

    // Backup current settings
    fs.writeFileSync(YOLO_BACKUP, JSON.stringify(currentSettings, null, 2), 'utf8');

    // Inject YOLO permissions (merge with existing, adding wildcards)
    const existingAllow = currentSettings?.permissions?.allow || [];
    const mergedAllow = [...new Set([...YOLO_PERMISSIONS, ...existingAllow])];

    currentSettings.permissions = {
        ...currentSettings.permissions,
        allow: mergedAllow,
    };

    fs.writeFileSync(SETTINGS_LOCAL, JSON.stringify(currentSettings, null, 2), 'utf8');

    return true;
};

/**
 * Disable YOLO mode:
 * Restore settings.local.json from backup
 */
export const disableYolo = () => {
    if (!isYoloActive()) {
        console.log(colors.warning(`${symbols.warning} ${t('yoloToggle.notActive')}`));
        return false;
    }

    try {
        // Restore from backup
        const backup = fs.readFileSync(YOLO_BACKUP, 'utf8');
        fs.writeFileSync(SETTINGS_LOCAL, backup, 'utf8');

        // Remove backup file (marks YOLO as inactive)
        fs.unlinkSync(YOLO_BACKUP);

        return true;
    } catch (e) {
        console.log(colors.error(`${symbols.error} ${t('yoloToggle.restoreFailed')}: ${e.message}`));
        return false;
    }
};

/**
 * Toggle YOLO mode on/off
 * Returns the new state (true = active, false = inactive)
 */
export const toggleYolo = () => {
    if (isYoloActive()) {
        const success = disableYolo();
        if (success) {
            const content = [
                colors.success(`${symbols.success} ${t('yoloToggle.deactivated')}`),
                '',
                colors.textDim(t('yoloToggle.permissionsRestored')),
            ].join('\n');

            console.log(box(content, {
                width: 56,
                padding: 1,
                borderStyle: 'round',
                borderColor: colors.success,
                titleText: 'YOLO Mode OFF',
                titleAlign: 'center',
            }));
        }
        return false;
    } else {
        const success = enableYolo();
        if (success) {
            const content = [
                colors.warning(`${symbols.warning} ${t('yoloToggle.activated')}`),
                '',
                colors.textDim(t('yoloToggle.allPermissionsGranted')),
                '',
                colors.textDim(`${t('yoloToggle.deactivateHint')}`),
            ].join('\n');

            console.log(box(content, {
                width: 56,
                padding: 1,
                borderStyle: 'round',
                borderColor: colors.warning,
                titleText: 'YOLO Mode ON',
                titleAlign: 'center',
            }));
        }
        return true;
    }
};

/**
 * Show YOLO status display
 */
export const showYoloStatus = () => {
    const status = getYoloStatus();

    const statusText = status.active
        ? colors.warning(`${symbols.warning} ACTIVE`)
        : colors.success(`${symbols.success} INACTIVE`);

    const content = [
        `  Status:      ${statusText}`,
        `  Permissions: ${colors.primary(String(status.permissionCount))} rules`,
        `  Settings:    ${colors.textDim(status.settingsPath)}`,
        status.active ? `  Backup:      ${colors.textDim(status.backupPath)}` : null,
    ].filter(Boolean).join('\n');

    console.log(box(content, {
        width: 64,
        padding: 1,
        borderStyle: 'round',
        borderColor: status.active ? colors.warning : colors.primary,
        titleText: 'YOLO Mode Status',
        titleAlign: 'center',
    }));
};
