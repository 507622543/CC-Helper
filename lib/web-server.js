/**
 * Web Server - cchelper 嵌入式 HTTP 服务器
 *
 * What: 提供 REST API 和静态文件服务的轻量级 Web 服务器
 * Why: 让用户通过网页界面使用虚拟公司功能
 * Why it's good: 无需额外依赖，使用 Node.js 内置模块
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as storage from './virtual-company-storage.js';
import * as runtime from './virtual-company-runtime.js';
import { listProfiles } from './profile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.join(__dirname, '..', 'web');
const WEB_DIST_DIR = path.join(__dirname, '..', 'web-dist'); // React build output

// MIME 类型映射
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
};

// SSE 客户端列表
const sseClients = new Set();

/**
 * 发送 SSE 事件到所有客户端
 */
export function broadcastEvent(event, data) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
        try {
            client.write(message);
        } catch (e) {
            sseClients.delete(client);
        }
    }
}

// 监听 runtime 事件并广播
runtime.eventBus.on('message.created', (event) => {
    broadcastEvent('ui.message.created', { message: event, groupId: event.groupId, memberIds: event.memberIds });
});

runtime.eventBus.on('agent.status', (event) => {
    broadcastEvent('ui.agent.status', event);
});

runtime.eventBus.on('agent.llm.start', (event) => {
    broadcastEvent('ui.agent.llm.start', event);
});

runtime.eventBus.on('agent.llm.done', (event) => {
    broadcastEvent('ui.agent.llm.done', event);
});

/**
 * 解析请求体
 */
async function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(new Error('Invalid JSON'));
            }
        });
        req.on('error', reject);
    });
}

/**
 * 发送 JSON 响应
 */
function sendJson(res, data, status = 200) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(data));
}

/**
 * 发送错误响应
 */
function sendError(res, message, status = 500) {
    sendJson(res, { error: message }, status);
}

/**
 * API 路由处理
 */
async function handleApi(req, res, pathname) {
    const method = req.method;
    const parts = pathname.split('/').filter(Boolean);
    // parts[0] = 'api'

    try {
        // GET /api/workspaces
        if (parts[1] === 'workspaces' && !parts[2] && method === 'GET') {
            const workspaces = storage.listWorkspaces();
            return sendJson(res, { workspaces });
        }

        // POST /api/workspaces
        if (parts[1] === 'workspaces' && !parts[2] && method === 'POST') {
            const body = await parseBody(req);
            const workspace = storage.createWorkspace(body.name, body.taskDescription, body.structure);
            return sendJson(res, workspace, 201);
        }

        // GET /api/workspaces/:id
        if (parts[1] === 'workspaces' && parts[2] && !parts[3] && method === 'GET') {
            const workspace = storage.getWorkspace(parts[2]);
            if (!workspace) return sendError(res, 'Workspace not found', 404);
            return sendJson(res, workspace);
        }

        // GET /api/workspaces/:id/defaults
        if (parts[1] === 'workspaces' && parts[2] && parts[3] === 'defaults' && method === 'GET') {
            const workspace = storage.getWorkspace(parts[2]);
            if (!workspace) return sendError(res, 'Workspace not found', 404);
            const agents = storage.listAgentsByWorkspace(parts[2]);
            const humanAgent = agents.find(a => a.role === 'Human');
            const assistantAgent = agents.find(a => a.role !== 'Human' && !a.parentId);
            const groups = storage.listGroupsByWorkspace(parts[2]);
            const defaultGroup = groups.find(g => g.name === '全员群') || groups[0];
            return sendJson(res, {
                workspaceId: workspace.id,
                humanAgentId: humanAgent?.id || null,
                assistantAgentId: assistantAgent?.id || null,
                defaultGroupId: defaultGroup?.id || null,
            });
        }

        // GET /api/agents
        if (parts[1] === 'agents' && !parts[2] && method === 'GET') {
            const url = new URL(req.url, `http://${req.headers.host}`);
            const workspaceId = url.searchParams.get('workspaceId');
            const meta = url.searchParams.get('meta') === 'true';
            let agents = workspaceId
                ? storage.listAgentsByWorkspace(workspaceId)
                : runtime.getActiveAgents();
            if (meta) {
                agents = agents.map(a => ({
                    id: a.id,
                    role: a.role,
                    parentId: a.parentId,
                    createdAt: a.createdAt || new Date().toISOString(),
                }));
            }
            return sendJson(res, { agents });
        }

        // GET /api/agents/:id
        if (parts[1] === 'agents' && parts[2] && !parts[3] && method === 'GET') {
            const agent = storage.getAgent(parts[2]);
            if (!agent) return sendError(res, 'Agent not found', 404);
            return sendJson(res, { ...agent, llmHistory: agent.llmHistory || '[]' });
        }

        // POST /api/agents
        if (parts[1] === 'agents' && !parts[2] && method === 'POST') {
            const body = await parseBody(req);
            const agent = storage.createAgent(body.workspaceId, {
                role: body.role,
                roleKey: body.roleKey || body.role.toLowerCase(),
                model: body.model || 'claude-sonnet-4',
                parentId: body.creatorId || null,
                systemPrompt: body.systemPrompt || '',
                responsibilities: body.responsibilities || [],
                canDelegate: body.canDelegate || false,
                canApprove: body.canApprove || false,
                apiProfileId: body.apiProfileId || null,
            });
            // 创建 P2P 群组
            const groups = storage.listGroupsByWorkspace(body.workspaceId);
            const humanAgent = storage.listAgentsByWorkspace(body.workspaceId).find(a => a.role === 'Human');
            let groupId = null;
            if (humanAgent) {
                const p2p = storage.getOrCreateP2P(body.workspaceId, humanAgent.id, agent.id);
                groupId = p2p.id;
            }
            broadcastEvent('ui.agent.created', { agent });
            return sendJson(res, { agentId: agent.id, groupId }, 201);
        }

        // GET /api/agents/:id/context-stream (SSE)
        if (parts[1] === 'agents' && parts[2] && parts[3] === 'context-stream' && method === 'GET') {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
            });
            sseClients.add(res);
            req.on('close', () => sseClients.delete(res));
            // 保持连接
            const keepAlive = setInterval(() => {
                try {
                    res.write(': keepalive\n\n');
                } catch (e) {
                    clearInterval(keepAlive);
                    sseClients.delete(res);
                }
            }, 15000);
            return;
        }

        // GET /api/groups
        if (parts[1] === 'groups' && !parts[2] && method === 'GET') {
            const url = new URL(req.url, `http://${req.headers.host}`);
            const workspaceId = url.searchParams.get('workspaceId');
            const groups = workspaceId ? storage.listGroupsByWorkspace(workspaceId) : [];
            // 添加 contextTokens 和 unreadCount
            const enrichedGroups = groups.map(g => {
                const messages = storage.getGroupMessages(g.id, 100);
                const lastMessage = messages[messages.length - 1];
                return {
                    ...g,
                    contextTokens: messages.reduce((sum, m) => sum + (m.content?.length || 0) / 4, 0) | 0,
                    unreadCount: 0,
                    lastMessage: lastMessage ? {
                        content: lastMessage.content?.slice(0, 100),
                        contentType: lastMessage.contentType,
                        sendTime: lastMessage.createdAt,
                        senderId: lastMessage.senderId,
                    } : undefined,
                    updatedAt: lastMessage?.createdAt || g.createdAt,
                };
            });
            return sendJson(res, { groups: enrichedGroups });
        }

        // GET /api/groups/:id/messages
        if (parts[1] === 'groups' && parts[2] && parts[3] === 'messages' && method === 'GET') {
            const messages = storage.getGroupMessages(parts[2], 100);
            const formattedMessages = messages.map(m => ({
                id: m.id,
                senderId: m.senderId,
                content: m.content,
                contentType: m.contentType,
                sendTime: m.createdAt,
            }));
            return sendJson(res, { messages: formattedMessages });
        }

        // POST /api/groups/:id/messages
        if (parts[1] === 'groups' && parts[2] && parts[3] === 'messages' && method === 'POST') {
            const body = await parseBody(req);
            const message = storage.sendMessage(parts[2], body.senderId, body.content, body.contentType || 'text');
            // 唤醒群成员
            const group = storage.getGroup(parts[2]);
            if (group) {
                for (const memberId of group.memberIds) {
                    if (memberId !== body.senderId) {
                        runtime.wakeAgent(memberId);
                    }
                }
            }
            return sendJson(res, message, 201);
        }

        // GET /api/agent-graph
        if (parts[1] === 'agent-graph' && method === 'GET') {
            const url = new URL(req.url, `http://${req.headers.host}`);
            const workspaceId = url.searchParams.get('workspaceId');
            const agents = workspaceId ? storage.listAgentsByWorkspace(workspaceId) : [];
            const groups = workspaceId ? storage.listGroupsByWorkspace(workspaceId) : [];

            const nodes = agents.map(a => ({
                id: a.id,
                role: a.role,
                parentId: a.parentId,
            }));

            // 计算边（消息统计）
            const edgeMap = new Map();
            for (const group of groups) {
                const messages = storage.getGroupMessages(group.id, 1000);
                for (const msg of messages) {
                    for (const memberId of group.memberIds) {
                        if (memberId !== msg.senderId) {
                            const key = `${msg.senderId}=>${memberId}`;
                            const existing = edgeMap.get(key) || { from: msg.senderId, to: memberId, count: 0, lastSendTime: '' };
                            existing.count++;
                            existing.lastSendTime = msg.createdAt;
                            edgeMap.set(key, existing);
                        }
                    }
                }
            }

            return sendJson(res, { nodes, edges: Array.from(edgeMap.values()) });
        }

        // GET /api/ui-stream (SSE)
        if (parts[1] === 'ui-stream' && method === 'GET') {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
            });
            sseClients.add(res);
            req.on('close', () => sseClients.delete(res));
            const keepAlive = setInterval(() => {
                try {
                    res.write(': keepalive\n\n');
                } catch (e) {
                    clearInterval(keepAlive);
                    sseClients.delete(res);
                }
            }, 15000);
            return;
        }

        // GET /api/profiles
        if (parts[1] === 'profiles' && method === 'GET') {
            const profiles = listProfiles().map(p => ({
                name: p.name,
                url: p.url,
                isActive: p.isActive,
                hasKey: !!p.key,
            }));
            return sendJson(res, { profiles });
        }

        // GET /api/config
        if (parts[1] === 'config' && method === 'GET') {
            return sendJson(res, { tokenLimit: 100000 });
        }

        // GET /api/health
        if (parts[1] === 'health' && method === 'GET') {
            return sendJson(res, { status: 'ok', timestamp: new Date().toISOString() });
        }

        sendError(res, 'Not Found', 404);
    } catch (error) {
        console.error('API Error:', error);
        sendError(res, error.message, 500);
    }
}

/**
 * 静态文件处理
 */
function handleStatic(req, res, pathname) {
    // 默认文件
    if (pathname === '/' || pathname === '') {
        pathname = '/index.html';
    }

    // 优先使用 web-dist (React build)，然后回退到 web (vanilla JS)
    let webDir = WEB_DIST_DIR;
    let filePath = path.join(webDir, pathname);

    // 如果 web-dist 不存在或文件不存在，尝试 web 目录
    if (!fs.existsSync(filePath)) {
        webDir = WEB_DIR;
        filePath = path.join(webDir, pathname);
    }

    // 安全检查：防止路径遍历
    if (!filePath.startsWith(WEB_DIST_DIR) && !filePath.startsWith(WEB_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // 对于 SPA 路由，返回 index.html
                if (!pathname.includes('.')) {
                    const indexPath = fs.existsSync(path.join(WEB_DIST_DIR, 'index.html'))
                        ? path.join(WEB_DIST_DIR, 'index.html')
                        : path.join(WEB_DIR, 'index.html');
                    fs.readFile(indexPath, (err2, indexData) => {
                        if (err2) {
                            res.writeHead(404);
                            res.end('Not Found');
                        } else {
                            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                            res.end(indexData);
                        }
                    });
                    return;
                }
                res.writeHead(404);
                res.end('Not Found');
            } else {
                res.writeHead(500);
                res.end('Internal Server Error');
            }
            return;
        }

        const ext = path.extname(filePath);
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache',
        });
        res.end(data);
    });
}

/**
 * 请求处理器
 */
function requestHandler(req, res) {
    // CORS 预检
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (pathname.startsWith('/api/')) {
        handleApi(req, res, pathname);
    } else {
        handleStatic(req, res, pathname);
    }
}

let server = null;

/**
 * 启动 Web 服务器
 */
export function startServer(port = 3017) {
    return new Promise((resolve, reject) => {
        if (server) {
            resolve({ port, url: `http://localhost:${port}` });
            return;
        }

        server = http.createServer(requestHandler);

        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                // 端口被占用，尝试下一个
                server = null;
                startServer(port + 1).then(resolve).catch(reject);
            } else {
                reject(err);
            }
        });

        server.listen(port, () => {
            console.log(`Web server running at http://localhost:${port}`);
            resolve({ port, url: `http://localhost:${port}` });
        });
    });
}

/**
 * 停止 Web 服务器
 */
export function stopServer() {
    return new Promise((resolve) => {
        if (server) {
            server.close(() => {
                server = null;
                resolve();
            });
        } else {
            resolve();
        }
    });
}

export default { startServer, stopServer, broadcastEvent };
