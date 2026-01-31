/**
 * Virtual Company Storage - 存储层
 *
 * What: 虚拟公司数据的持久化存储
 * Why: Agent 状态和消息历史需要持久化
 * Why it's good: 内存缓存 + 防抖写入，解决并发竞态
 */

import Conf from 'conf';
import { randomUUID } from 'crypto';

const store = new Conf({
    projectName: 'cc-helper',
    configName: 'virtual-company',
});

/**
 * 内存缓存层 — 所有读写走内存，修改后延迟批量写入磁盘
 * 解决多 Agent 并发写 conf 文件的竞态问题
 */
const cache = {
    workspaces: store.get('workspaces', {}),
    agents: store.get('agents', {}),
    groups: store.get('groups', {}),
    messages: store.get('messages', {}),
    lastReads: store.get('lastReads', {}),
};

let flushTimer = null;
const FLUSH_DELAY_MS = 500;

function scheduleFlush() {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
        store.set('workspaces', cache.workspaces);
        store.set('agents', cache.agents);
        store.set('groups', cache.groups);
        store.set('messages', cache.messages);
        store.set('lastReads', cache.lastReads);
        flushTimer = null;
    }, FLUSH_DELAY_MS);
}

/** 立即写入磁盘（用于关闭前） */
export function flushNow() {
    if (flushTimer) clearTimeout(flushTimer);
    store.set('workspaces', cache.workspaces);
    store.set('agents', cache.agents);
    store.set('groups', cache.groups);
    store.set('messages', cache.messages);
    store.set('lastReads', cache.lastReads);
}

// --- Workspace (公司实例) ---

export function createWorkspace(name, taskDescription, companyStructure) {
    const id = randomUUID();

    cache.workspaces[id] = {
        id,
        name,
        taskDescription,
        companyStructure,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    scheduleFlush();
    return cache.workspaces[id];
}

export function getWorkspace(id) {
    return cache.workspaces[id] || null;
}

export function listWorkspaces() {
    return Object.values(cache.workspaces);
}

export function updateWorkspaceStatus(id, status) {
    if (!cache.workspaces[id]) return null;
    cache.workspaces[id].status = status;
    cache.workspaces[id].updatedAt = new Date().toISOString();
    scheduleFlush();
    return cache.workspaces[id];
}

export function deleteWorkspace(id) {
    delete cache.workspaces[id];

    for (const [agentId, agent] of Object.entries(cache.agents)) {
        if (agent.workspaceId === id) delete cache.agents[agentId];
    }

    for (const [groupId, group] of Object.entries(cache.groups)) {
        if (group.workspaceId === id) delete cache.groups[groupId];
    }

    scheduleFlush();
}

// --- Agent ---

export function createAgent(workspaceId, { role, roleKey, model, parentId, systemPrompt, responsibilities, canDelegate, canApprove }) {
    const id = randomUUID();

    cache.agents[id] = {
        id,
        workspaceId,
        role,
        roleKey: roleKey || role.toLowerCase().replace(/\s+/g, '-'),
        model: model || 'claude-sonnet-4',
        parentId: parentId || null,
        systemPrompt: systemPrompt || '',
        responsibilities: responsibilities || [],
        canDelegate: canDelegate || false,
        canApprove: canApprove || false,
        status: 'idle',
        llmHistory: [],
        createdAt: new Date().toISOString(),
    };

    scheduleFlush();
    return cache.agents[id];
}

export function getAgent(id) {
    return cache.agents[id] || null;
}

export function listAgentsByWorkspace(workspaceId) {
    return Object.values(cache.agents).filter(a => a.workspaceId === workspaceId);
}

export function updateAgentStatus(id, status) {
    if (!cache.agents[id]) return null;
    cache.agents[id].status = status;
    scheduleFlush();
    return cache.agents[id];
}

export function updateAgentLLMHistory(id, history) {
    if (!cache.agents[id]) return null;
    cache.agents[id].llmHistory = history;
    scheduleFlush();
    return cache.agents[id];
}

export function getAgentChildren(parentId) {
    return Object.values(cache.agents).filter(a => a.parentId === parentId);
}

// --- Group (群聊) ---

export function createGroup(workspaceId, name, memberIds) {
    const id = randomUUID();

    cache.groups[id] = {
        id,
        workspaceId,
        name,
        memberIds: memberIds || [],
        createdAt: new Date().toISOString(),
    };

    scheduleFlush();
    return cache.groups[id];
}

/**
 * 创建或获取两个 Agent 之间的 P2P 群聊
 */
export function getOrCreateP2P(workspaceId, agentId1, agentId2) {
    const existing = Object.values(cache.groups).find(g =>
        g.workspaceId === workspaceId &&
        g.memberIds.length === 2 &&
        g.memberIds.includes(agentId1) &&
        g.memberIds.includes(agentId2)
    );

    if (existing) return existing;

    const agent1 = getAgent(agentId1);
    const agent2 = getAgent(agentId2);
    const name = `${agent1?.role || 'Agent'} ↔ ${agent2?.role || 'Agent'}`;

    return createGroup(workspaceId, name, [agentId1, agentId2]);
}

export function getGroup(id) {
    return cache.groups[id] || null;
}

export function listGroupsByWorkspace(workspaceId) {
    return Object.values(cache.groups).filter(g => g.workspaceId === workspaceId);
}

export function listGroupsByAgent(agentId) {
    return Object.values(cache.groups).filter(g => g.memberIds.includes(agentId));
}

export function addGroupMember(groupId, agentId) {
    if (!cache.groups[groupId]) return null;
    if (!cache.groups[groupId].memberIds.includes(agentId)) {
        cache.groups[groupId].memberIds.push(agentId);
        scheduleFlush();
    }
    return cache.groups[groupId];
}

// --- Messages ---

const MAX_MESSAGES_PER_GROUP = 200;

export function sendMessage(groupId, senderId, content, type = 'text') {
    const id = randomUUID();

    if (!cache.messages[groupId]) {
        cache.messages[groupId] = [];
    }

    const msg = {
        id,
        groupId,
        senderId,
        content,
        type,
        createdAt: new Date().toISOString(),
    };

    cache.messages[groupId].push(msg);

    // 自动清理旧消息（超过 MAX_MESSAGES_PER_GROUP 条）
    if (cache.messages[groupId].length > MAX_MESSAGES_PER_GROUP) {
        cache.messages[groupId] = cache.messages[groupId].slice(-MAX_MESSAGES_PER_GROUP);
    }

    scheduleFlush();
    return msg;
}

export function getGroupMessages(groupId, limit = 50) {
    const groupMessages = cache.messages[groupId] || [];
    return groupMessages.slice(-limit);
}

export function getUnreadMessages(groupId, afterMessageId) {
    const groupMessages = cache.messages[groupId] || [];

    if (!afterMessageId) return groupMessages;

    const afterIndex = groupMessages.findIndex(m => m.id === afterMessageId);
    if (afterIndex === -1) return groupMessages;

    return groupMessages.slice(afterIndex + 1);
}

// --- Last Read Tracking ---

export function markAsRead(agentId, groupId, messageId) {
    const key = `${agentId}:${groupId}`;
    cache.lastReads[key] = messageId;
    scheduleFlush();
}

export function getLastReadMessageId(agentId, groupId) {
    const key = `${agentId}:${groupId}`;
    return cache.lastReads[key] || null;
}

// --- Utility ---

export function clearAll() {
    cache.workspaces = {};
    cache.agents = {};
    cache.groups = {};
    cache.messages = {};
    cache.lastReads = {};
    store.clear();
}

export function getStoreSize() {
    return {
        workspaces: Object.keys(cache.workspaces).length,
        agents: Object.keys(cache.agents).length,
        groups: Object.keys(cache.groups).length,
        messages: Object.values(cache.messages).reduce((sum, arr) => sum + arr.length, 0),
    };
}

export default {
    // Workspace
    createWorkspace, getWorkspace, listWorkspaces, updateWorkspaceStatus, deleteWorkspace,
    // Agent
    createAgent, getAgent, listAgentsByWorkspace, updateAgentStatus, updateAgentLLMHistory, getAgentChildren,
    // Group
    createGroup, getOrCreateP2P, getGroup, listGroupsByWorkspace, listGroupsByAgent, addGroupMember,
    // Message
    sendMessage, getGroupMessages, getUnreadMessages, markAsRead, getLastReadMessageId,
    // Utility
    clearAll, getStoreSize, flushNow,
};
