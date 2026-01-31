import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getActiveProfile } from './profile.js';
import { t } from './i18n.js';
import { colors, symbols, divider } from './theme.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCKER_IMAGE = 'cchelper-yolo';

// --- StatusLine Setup (shared with runner.js) ---

export const ensureStatusLine = () => {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    const claudeDir = path.join(homeDir, '.claude');
    const targetScript = path.join(claudeDir, 'statusline-cchelper.js');
    const settingsFile = path.join(claudeDir, 'settings.json');
    const sourceScript = path.join(__dirname, 'statusline.js');

    try {
        // 1. Copy statusline script
        if (fs.existsSync(sourceScript)) {
            fs.copyFileSync(sourceScript, targetScript);
        }

        // 2. Update settings.json with statusLine config
        let settings = {};
        if (fs.existsSync(settingsFile)) {
            settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
        }

        const command = `node "${targetScript.replace(/\\/g, '/')}"`;

        if (!settings.statusLine || settings.statusLine.command !== command) {
            settings.statusLine = {
                type: 'command',
                command,
                padding: 0
            };
            fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
        }
    } catch {
        // Non-fatal
    }
};

// --- Docker Utilities ---

export const checkDockerAvailable = () => {
    try {
        execSync('docker info', { stdio: 'ignore', timeout: 5000 });
        return true;
    } catch {
        return false;
    }
};

export const ensureYoloImage = () => {
    // Check if image already exists
    try {
        const result = execSync(`docker images -q ${DOCKER_IMAGE}`, { encoding: 'utf8', timeout: 10000 });
        if (result.trim()) {
            console.log(colors.textDim(`${symbols.success} ${t('yolo.imageReady')}`));
            return true;
        }
    } catch {
        // continue to build
    }

    // Build image
    console.log(colors.primary(`${symbols.arrowRight} ${t('yolo.buildingImage')}`));
    const dockerfilePath = path.join(__dirname, '..', 'Dockerfile.yolo');

    try {
        execSync(`docker build -t ${DOCKER_IMAGE} -f "${dockerfilePath}" "${path.join(__dirname, '..')}"`, {
            stdio: 'inherit',
            timeout: 300000 // 5 min
        });
        console.log(colors.success(`${symbols.success} ${t('yolo.imageReady')}`));
        return true;
    } catch (e) {
        console.log(colors.error(`${symbols.error} ${t('yolo.imageBuildFailed')} ${e.message}`));
        return false;
    }
};

// --- Docker YOLO ---

export const runYoloDocker = (projectPath) => {
    const profile = getActiveProfile();
    const envFlags = [];

    if (profile?.url) {
        envFlags.push('-e', `ANTHROPIC_BASE_URL=${profile.url}`);
    }
    if (profile?.key) {
        envFlags.push('-e', `ANTHROPIC_API_KEY=${profile.key}`);
    }

    // Normalize path for Docker (convert Windows backslash to forward slash)
    const normalizedPath = projectPath.replace(/\\/g, '/');

    const dockerArgs = [
        'run', '--rm', '-it',
        '-v', `${normalizedPath}:/workspace`,
        '-w', '/workspace',
        ...envFlags,
        DOCKER_IMAGE
    ];

    // Ensure statusline is configured (for host-side config, Docker will use its own)
    ensureStatusLine();

    console.log(colors.primary(`\n${symbols.arrowRight} ${t('yolo.startingDocker')}\n`));
    console.log(divider(50) + '\n');

    return new Promise((resolve, reject) => {
        const proc = spawn('docker', dockerArgs, {
            stdio: 'inherit',
            shell: false
        });

        proc.on('close', (code) => {
            console.log('\n' + divider(50));
            console.log(colors.primary(`\n${symbols.success} ${t('yolo.sessionDone')}\n`));
            resolve({ exitCode: code, sandboxPath: null });
        });

        proc.on('error', (err) => {
            console.log(colors.error(`${symbols.error} Docker error: ${err.message}`));
            reject(err);
        });
    });
};

// --- Temp Directory YOLO ---

const copyDirSync = (src, dest) => {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        // Skip node_modules, .git, and other heavy dirs
        if (['node_modules', '.git', '.next', 'dist', 'build', '__pycache__'].includes(entry.name)) {
            continue;
        }

        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
};

export const runYoloTempDir = (projectPath) => {
    const profile = getActiveProfile();
    const timestamp = Date.now();
    const projectName = path.basename(projectPath);

    // Create temp dir in project's parent directory (not in system temp)
    const parentDir = path.dirname(projectPath);
    const tempDir = path.join(parentDir, `.cchelper-yolo-${projectName}-${timestamp}`);

    // Copy project to temp directory
    console.log(colors.primary(`${symbols.arrowRight} ${t('yolo.copyingProject')}`));
    try {
        copyDirSync(projectPath, tempDir);
    } catch (e) {
        console.log(colors.error(`${symbols.error} Copy failed: ${e.message}`));
        return Promise.reject(e);
    }
    console.log(colors.textDim(`${symbols.success} ${t('yolo.copyDone', { path: tempDir })}\n`));

    // Build environment
    const env = { ...process.env };
    if (profile?.url) {
        env['ANTHROPIC_BASE_URL'] = profile.url;
    }
    if (profile?.key) {
        env['ANTHROPIC_API_KEY'] = profile.key;
    }

    // Ensure statusline is configured
    ensureStatusLine();

    // Build claude args
    const claudeArgs = ['--dangerously-skip-permissions'];

    console.log(colors.primary(`${symbols.arrowRight} ${t('yolo.startingTempDir')}\n`));
    console.log(divider(50) + '\n');

    return new Promise((resolve, reject) => {
        const proc = spawn('claude', claudeArgs, {
            cwd: tempDir,
            env,
            stdio: 'inherit',
            shell: true
        });

        proc.on('close', (code) => {
            console.log('\n' + divider(50));
            console.log(colors.primary(`\n${symbols.success} ${t('yolo.sessionDone')}\n`));
            resolve({ exitCode: code, sandboxPath: tempDir, originalPath: projectPath });
        });

        proc.on('error', (err) => {
            console.log(colors.error(`${symbols.error} Error: ${err.message}`));
            reject(err);
        });
    });
};

// --- Post-session: Diff & Merge ---

export const showDiff = (originalPath, sandboxPath) => {
    console.log(colors.primary(`\n${symbols.arrowRight} ${t('yolo.diffTitle')}\n`));
    try {
        // Use git diff --no-index for comparing two directories
        const result = execSync(
            `git diff --no-index --stat "${originalPath}" "${sandboxPath}"`,
            { encoding: 'utf8', timeout: 30000 }
        );
        console.log(result || colors.textDim('  No changes detected.'));
    } catch (e) {
        // git diff --no-index returns exit code 1 when differences exist
        if (e.stdout) {
            console.log(e.stdout);
        } else {
            console.log(colors.textDim('  Could not generate diff.'));
        }
    }
    console.log();
};

export const mergeBack = (originalPath, sandboxPath) => {
    console.log(colors.primary(`${symbols.arrowRight} ${t('yolo.merging')}`));
    try {
        copyDirSync(sandboxPath, originalPath);
        console.log(colors.success(`${symbols.success} ${t('yolo.mergeSuccess')}`));
    } catch (e) {
        console.log(colors.error(`${symbols.error} Merge failed: ${e.message}`));
    }
};

export const discardSandbox = (sandboxPath) => {
    try {
        fs.rmSync(sandboxPath, { recursive: true, force: true });
        console.log(colors.textDim(`${symbols.success} ${t('yolo.discarded')}`));
    } catch {
        // Non-fatal
    }
};
