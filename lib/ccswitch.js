import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, spawnSync } from 'child_process';

export const PROVIDER_ENV_KEYS = new Set([
    'ANTHROPIC_BASE_URL',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'CLAUDE_BASE_URL',
    'CLAUDE_API_KEY',
    'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    'ANTHROPIC_DEFAULT_OPUS_MODEL',
    'ANTHROPIC_DEFAULT_SONNET_MODEL',
    'ANTHROPIC_MODEL',
    'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
    'CLAUDE_CODE_ATTRIBUTION_HEADER',
]);

const APP_CURRENT_KEYS = {
    claude: 'currentProviderClaude',
    codex: 'currentProviderCodex',
    gemini: 'currentProviderGemini',
    opencode: 'currentProviderOpencode',
    openclaw: 'currentProviderOpenclaw',
    hermes: 'currentProviderHermes',
};

export const getCcSwitchDir = () => path.join(os.homedir(), '.cc-switch');
export const getCcSwitchDbPath = () => path.join(getCcSwitchDir(), 'cc-switch.db');
export const getCcSwitchSettingsPath = () => path.join(getCcSwitchDir(), 'settings.json');
export const getCcSwitchExePath = () => path.join(process.env.LOCALAPPDATA || '', 'Programs', 'CC Switch', 'cc-switch.exe');

const readJson = (file, fallback = {}) => {
    try {
        if (!fs.existsSync(file)) return fallback;
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return fallback;
    }
};

const writeJson = (file, data) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp.${Date.now()}`;
    fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.renameSync(tmp, file);
};

const backupFile = (file, backupDir) => {
    if (!fs.existsSync(file)) return;
    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(file, path.join(backupDir, path.basename(file)));
};

const runPythonJson = (script, args = []) => {
    const candidates = ['python', 'py'];
    let lastError = null;

    for (const exe of candidates) {
        const result = spawnSync(exe, ['-', ...args], {
            input: script,
            encoding: 'utf8',
            windowsHide: true,
        });

        if (result.error) {
            lastError = result.error;
            continue;
        }

        if (result.status !== 0) {
            throw new Error((result.stderr || result.stdout || `Python exited with ${result.status}`).trim());
        }

        try {
            return JSON.parse(result.stdout || 'null');
        } catch (err) {
            throw new Error(`Failed to parse Python output: ${err.message}`);
        }
    }

    throw new Error(`Python not found: ${lastError?.message || 'unknown error'}`);
};

const dbScript = `
import json, sqlite3, sys
db, op = sys.argv[1], sys.argv[2]
app = sys.argv[3] if len(sys.argv) > 3 else "claude"
con = sqlite3.connect(db)
con.row_factory = sqlite3.Row

def provider_from_row(row):
    settings = json.loads(row["settings_config"] or "{}")
    meta = json.loads(row["meta"] or "{}")
    return {
        "id": row["id"],
        "name": row["name"],
        "settingsConfig": settings,
        "websiteUrl": row["website_url"],
        "category": row["category"],
        "createdAt": row["created_at"],
        "sortIndex": row["sort_index"],
        "notes": row["notes"],
        "icon": row["icon"],
        "iconColor": row["icon_color"],
        "meta": meta,
        "isCurrent": bool(row["is_current"]),
    }

if op == "list":
    rows = con.execute("""
        SELECT id, name, settings_config, website_url, category, created_at,
               sort_index, notes, icon, icon_color, meta, is_current
        FROM providers
        WHERE app_type = ?
        ORDER BY COALESCE(sort_index, 999999), created_at ASC, name ASC
    """, (app,)).fetchall()
    print(json.dumps([provider_from_row(r) for r in rows], ensure_ascii=False))
elif op == "get":
    key = sys.argv[4]
    row = con.execute("""
        SELECT id, name, settings_config, website_url, category, created_at,
               sort_index, notes, icon, icon_color, meta, is_current
        FROM providers
        WHERE app_type = ? AND (id = ? OR name = ?)
        ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END
        LIMIT 1
    """, (app, key, key, key)).fetchone()
    print(json.dumps(provider_from_row(row) if row else None, ensure_ascii=False))
elif op == "set-current":
    provider_id = sys.argv[4]
    with con:
        con.execute("UPDATE providers SET is_current = 0 WHERE app_type = ?", (app,))
        con.execute("UPDATE providers SET is_current = 1 WHERE app_type = ? AND id = ?", (app, provider_id))
    print(json.dumps({"ok": True}, ensure_ascii=False))
elif op == "counts":
    tables = ["providers", "mcp_servers", "prompts", "skills", "settings", "proxy_config"]
    out = {}
    for table in tables:
        try:
            out[table] = con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        except Exception:
            out[table] = None
    print(json.dumps(out, ensure_ascii=False))
else:
    raise SystemExit(f"unknown op: {op}")
`;

export const isCcSwitchInstalled = () => fs.existsSync(getCcSwitchDbPath());

export const listCcSwitchProviders = (app = 'claude') => {
    if (!isCcSwitchInstalled()) return [];
    return runPythonJson(dbScript, [getCcSwitchDbPath(), 'list', app]);
};

export const getCcSwitchProvider = (key, app = 'claude') => {
    if (!isCcSwitchInstalled()) return null;
    return runPythonJson(dbScript, [getCcSwitchDbPath(), 'get', app, key]);
};

export const getCcSwitchCounts = () => {
    if (!isCcSwitchInstalled()) return {};
    return runPythonJson(dbScript, [getCcSwitchDbPath(), 'counts', 'claude']);
};

export const getCurrentCcSwitchProvider = (app = 'claude') => {
    const settings = readJson(getCcSwitchSettingsPath(), {});
    const currentKey = APP_CURRENT_KEYS[app];
    const bySettings = currentKey ? settings[currentKey] : null;
    if (bySettings) {
        const provider = getCcSwitchProvider(bySettings, app);
        if (provider) return provider;
    }
    return listCcSwitchProviders(app).find(p => p.isCurrent) || null;
};

const stripProviderEnv = (settings) => {
    const cleaned = JSON.parse(JSON.stringify(settings || {}));
    if (cleaned.env && typeof cleaned.env === 'object') {
        for (const key of PROVIDER_ENV_KEYS) {
            delete cleaned.env[key];
        }
        if (Object.keys(cleaned.env).length === 0) {
            delete cleaned.env;
        }
    }
    return cleaned;
};

const mergeClaudeSettings = (base, provider) => {
    const merged = JSON.parse(JSON.stringify(base || {}));
    const providerEnv = provider?.settingsConfig?.env || {};
    if (Object.keys(providerEnv).length > 0) {
        merged.env = { ...(merged.env || {}), ...providerEnv };
    }
    return merged;
};

const getClaudeSettingsPath = () => path.join(os.homedir(), '.claude', 'settings.json');
const getClaudeLocalSettingsPath = () => path.join(os.homedir(), '.claude', 'settings.local.json');

const maskSecret = (value) => {
    if (!value) return '(missing)';
    if (value.length <= 16) return '***';
    return `${value.slice(0, 7)}...${value.slice(-13)}`;
};

const collectProviderEnv = (env = {}) => {
    const out = {};
    for (const key of PROVIDER_ENV_KEYS) {
        if (env[key]) out[key] = env[key];
    }
    return out;
};

export const switchCcSwitchProvider = (key, app = 'claude') => {
    const provider = getCcSwitchProvider(key, app);
    if (!provider) {
        throw new Error(`CC Switch provider not found: ${key}`);
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(getCcSwitchDir(), `cchelper-cli-switch-backup-${stamp}`);
    backupFile(getCcSwitchDbPath(), backupDir);
    backupFile(getCcSwitchSettingsPath(), backupDir);

    runPythonJson(dbScript, [getCcSwitchDbPath(), 'set-current', app, provider.id]);

    const settings = readJson(getCcSwitchSettingsPath(), {});
    const currentKey = APP_CURRENT_KEYS[app];
    if (currentKey) {
        settings[currentKey] = provider.id;
        writeJson(getCcSwitchSettingsPath(), settings);
    }

    if (app === 'claude') {
        const claudeSettings = getClaudeSettingsPath();
        const claudeLocalSettings = getClaudeLocalSettingsPath();
        backupFile(claudeSettings, backupDir);
        backupFile(claudeLocalSettings, backupDir);

        const base = stripProviderEnv(readJson(claudeSettings, {}));
        writeJson(claudeSettings, mergeClaudeSettings(base, provider));

        if (fs.existsSync(claudeLocalSettings)) {
            const local = stripProviderEnv(readJson(claudeLocalSettings, {}));
            if (Object.keys(local).length > 0) {
                writeJson(claudeLocalSettings, local);
            } else {
                fs.unlinkSync(claudeLocalSettings);
            }
        }
    }

    return { provider, backupDir };
};

export const getCcSwitchDoctorReport = (app = 'claude') => {
    const report = {
        installed: isCcSwitchInstalled(),
        app,
        currentProvider: null,
        counts: {},
        checks: [],
    };

    const addCheck = (level, title, detail = '') => {
        report.checks.push({ level, title, detail });
    };

    if (!report.installed) {
        addCheck('error', 'CC Switch database not found', getCcSwitchDbPath());
        return report;
    }

    report.counts = getCcSwitchCounts();
    const provider = getCurrentCcSwitchProvider(app);
    report.currentProvider = provider ? getCcSwitchProviderSummary(provider) : null;

    if (!provider) {
        addCheck('error', 'No active CC Switch provider', `app=${app}`);
        return report;
    }

    const providerEnv = collectProviderEnv(provider.settingsConfig?.env || {});
    if (Object.keys(providerEnv).length === 0) {
        addCheck('warn', 'Current provider has no API env', provider.name);
    } else {
        addCheck('ok', 'Current provider env is present', `${provider.name} (${Object.keys(providerEnv).join(', ')})`);
    }

    const globalSettings = readJson(getClaudeSettingsPath(), {});
    const globalEnv = collectProviderEnv(globalSettings.env || {});
    const missingInGlobal = Object.keys(providerEnv).filter(key => !globalEnv[key]);
    if (missingInGlobal.length > 0) {
        addCheck('warn', 'Claude global settings are not fully synced', missingInGlobal.join(', '));
    } else {
        addCheck('ok', 'Claude global settings match provider shape', getClaudeSettingsPath());
    }

    const localSettings = readJson(getClaudeLocalSettingsPath(), {});
    const localEnv = collectProviderEnv(localSettings.env || {});
    if (Object.keys(localEnv).length > 0) {
        addCheck('warn', 'Project/local Claude settings override provider env', `${getClaudeLocalSettingsPath()} (${Object.keys(localEnv).join(', ')})`);
    } else {
        addCheck('ok', 'No provider env override in settings.local.json', getClaudeLocalSettingsPath());
    }

    const processEnv = collectProviderEnv(process.env);
    for (const [key, value] of Object.entries(processEnv)) {
        if (value.startsWith('sk-ant-') && value.endsWith('PROXY_MANAGED')) {
            addCheck('info', `${key} is proxy-managed in this shell`, maskSecret(value));
        } else if (providerEnv[key] && providerEnv[key] !== value) {
            addCheck('warn', `${key} in shell differs from CC Switch provider`, maskSecret(value));
        } else {
            addCheck('info', `${key} is set in this shell`, maskSecret(value));
        }
    }

    return report;
};

export const cleanCcSwitchLocalOverrides = () => {
    const file = getClaudeLocalSettingsPath();
    if (!fs.existsSync(file)) {
        return { changed: false, file, backupDir: null };
    }

    const current = readJson(file, {});
    const cleaned = stripProviderEnv(current);
    if (JSON.stringify(current) === JSON.stringify(cleaned)) {
        return { changed: false, file, backupDir: null };
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(getCcSwitchDir(), `cchelper-doctor-backup-${stamp}`);
    backupFile(file, backupDir);

    if (Object.keys(cleaned).length > 0) {
        writeJson(file, cleaned);
    } else {
        fs.unlinkSync(file);
    }

    return { changed: true, file, backupDir };
};

export const getCcSwitchProviderSummary = (provider) => {
    const env = provider?.settingsConfig?.env || {};
    const meta = provider?.meta || {};
    return {
        id: provider?.id,
        name: provider?.name,
        baseUrl: env.ANTHROPIC_BASE_URL || env.CLAUDE_BASE_URL || env.OPENAI_BASE_URL || '',
        model: env.ANTHROPIC_MODEL || env.ANTHROPIC_DEFAULT_OPUS_MODEL || '',
        apiFormat: meta.apiFormat || meta.api_format || 'anthropic',
        hasKey: Boolean(env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY || env.CLAUDE_API_KEY || env.OPENAI_API_KEY),
        isCurrent: Boolean(provider?.isCurrent),
        notes: provider?.notes || '',
    };
};

export const openCcSwitch = () => {
    const exe = getCcSwitchExePath();
    if (!fs.existsSync(exe)) {
        throw new Error(`CC Switch executable not found: ${exe}`);
    }
    const child = spawn(exe, [], { detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();
    return exe;
};
