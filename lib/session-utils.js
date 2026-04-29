/**
 * Session Utilities - 会话管理工具
 *
 * What: 提供 Claude Code 会话的查询和导出功能
 * Why: 在 API 失效恢复场景中，需要获取最近的 sessionId 和导出会话记录
 * Why it's good: 保证开发连续性，用户可以切换 API 后恢复原有会话
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';

/**
 * Gets the most recent sessionId for a given project directory
 * @param {string} project - Project directory path (defaults to cwd)
 * @returns {Promise<string|null>} Most recent sessionId or null
 */
export const getLastSessionId = async (project) => {
    const targetProject = project || process.cwd();
    const historyPath = path.join(os.homedir(), '.claude', 'history.jsonl');

    if (!fs.existsSync(historyPath)) {
        return null;
    }

    // Read history.jsonl line by line from end (most recent last)
    const content = fs.readFileSync(historyPath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);

    // Search from newest to oldest
    for (let i = lines.length - 1; i >= 0; i--) {
        try {
            const entry = JSON.parse(lines[i]);
            // Normalize paths for comparison (Windows path handling)
            const entryProject = entry.project?.replace(/\\/g, '/').toLowerCase();
            const targetNorm = targetProject.replace(/\\/g, '/').toLowerCase();
            if (entryProject === targetNorm && entry.sessionId) {
                return entry.sessionId;
            }
        } catch {
            continue;
        }
    }

    return null;
};

/**
 * Gets recent session history entries
 * @param {string} project - Project directory (optional, null = all projects)
 * @param {number} limit - Max entries to return
 * @returns {Promise<Array>} Array of session entries
 */
export const getSessionHistory = async (project, limit = 10) => {
    const historyPath = path.join(os.homedir(), '.claude', 'history.jsonl');

    if (!fs.existsSync(historyPath)) {
        return [];
    }

    const content = fs.readFileSync(historyPath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    const entries = [];

    // Collect unique sessions (most recent first)
    const seenSessions = new Set();

    for (let i = lines.length - 1; i >= 0; i--) {
        try {
            const entry = JSON.parse(lines[i]);

            if (project) {
                const entryProject = entry.project?.replace(/\\/g, '/').toLowerCase();
                const targetNorm = project.replace(/\\/g, '/').toLowerCase();
                if (entryProject !== targetNorm) continue;
            }

            if (entry.sessionId && !seenSessions.has(entry.sessionId)) {
                seenSessions.add(entry.sessionId);
                entries.push(entry);
                if (entries.length >= limit) break;
            }
        } catch {
            continue;
        }
    }

    return entries;
};

/**
 * Exports session conversation to a Markdown file
 * Uses Claude Code CLI's --resume + --print to extract conversation
 * Falls back to history.jsonl summary if CLI export fails
 *
 * @param {string} sessionId - Session ID to export
 * @param {string} outputDir - Output directory (defaults to cwd)
 * @returns {Promise<string>} Path to exported file
 */
export const exportSession = async (sessionId, outputDir) => {
    const outDir = outputDir || process.cwd();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `claude-session-${sessionId.slice(0, 8)}-${timestamp}.md`;
    const outputPath = path.join(outDir, filename);

    // Approach: Extract user messages from history.jsonl for this session
    const historyPath = path.join(os.homedir(), '.claude', 'history.jsonl');

    const sessionMessages = [];
    if (fs.existsSync(historyPath)) {
        const content = fs.readFileSync(historyPath, 'utf8');
        const lines = content.trim().split('\n').filter(Boolean);

        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                if (entry.sessionId === sessionId) {
                    sessionMessages.push(entry);
                }
            } catch {
                continue;
            }
        }
    }

    // Build Markdown content
    const mdLines = [
        `# Claude Code Session Export`,
        ``,
        `- **Session ID**: \`${sessionId}\``,
        `- **Exported**: ${new Date().toLocaleString()}`,
        `- **Messages**: ${sessionMessages.length}`,
        ``,
        `---`,
        ``,
    ];

    if (sessionMessages.length > 0) {
        const projectPath = sessionMessages[0].project || 'Unknown';
        mdLines.splice(4, 0, `- **Project**: \`${projectPath}\``);

        mdLines.push(`## Conversation History`);
        mdLines.push(``);

        for (const msg of sessionMessages) {
            const time = new Date(msg.timestamp).toLocaleTimeString();
            mdLines.push(`### [${time}] User`);
            mdLines.push(``);
            mdLines.push(`\`\`\``);
            mdLines.push(msg.display || '(empty)');
            mdLines.push(`\`\`\``);
            mdLines.push(``);
        }
    } else {
        mdLines.push(`> No messages found for this session in history.`);
        mdLines.push(``);
    }

    mdLines.push(`---`);
    mdLines.push(`*To resume this session: \`claude --resume ${sessionId}\`*`);

    fs.writeFileSync(outputPath, mdLines.join('\n'), 'utf8');
    return outputPath;
};
