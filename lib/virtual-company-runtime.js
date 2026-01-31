/**
 * Virtual Company Runtime - Agent 运行时引擎
 *
 * What: 管理 Agent 生命周期、消息分发、工具调用
 * Why: 多 Agent 协作需要一个事件驱动的运行时
 * Why it's good: 借鉴 swarm-ide 的液态拓扑 + 极简原语设计
 */

import { callLLM } from './model-router.js';
import * as storage from './virtual-company-storage.js';
import { EventEmitter } from 'events';
import chalk from 'chalk';

/**
 * 全局事件总线
 */
export const eventBus = new EventEmitter();
eventBus.setMaxListeners(100);

/**
 * Agent 可用的内置工具定义
 */
const AGENT_TOOLS = [
    {
        name: 'self',
        description: 'Get your own identity information (id, role, parentId)',
        parameters: { type: 'object', properties: {} },
    },
    {
        name: 'create',
        description: 'Create a new sub-agent that reports to you',
        parameters: {
            type: 'object',
            properties: {
                role: { type: 'string', description: 'Role name for the new agent (e.g., "Backend Developer")' },
                guidance: { type: 'string', description: 'Additional instructions for this agent' },
            },
            required: ['role'],
        },
    },
    {
        name: 'send',
        description: 'Send a message to another agent by their ID. This creates a private chat between you two.',
        parameters: {
            type: 'object',
            properties: {
                to: { type: 'string', description: 'Target agent ID' },
                content: { type: 'string', description: 'Message content' },
            },
            required: ['to', 'content'],
        },
    },
    {
        name: 'send_group_message',
        description: 'Send a message to a group chat',
        parameters: {
            type: 'object',
            properties: {
                groupId: { type: 'string', description: 'Group ID' },
                content: { type: 'string', description: 'Message content' },
            },
            required: ['groupId', 'content'],
        },
    },
    {
        name: 'create_group',
        description: 'Create a new group chat with specified agents',
        parameters: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Group name' },
                memberIds: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Agent IDs to add to the group',
                },
            },
            required: ['name', 'memberIds'],
        },
    },
    {
        name: 'list_agents',
        description: 'List all agents in your workspace',
        parameters: { type: 'object', properties: {} },
    },
    {
        name: 'list_groups',
        description: 'List all groups you are a member of',
        parameters: { type: 'object', properties: {} },
    },
    {
        name: 'get_group_messages',
        description: 'Get recent messages from a group',
        parameters: {
            type: 'object',
            properties: {
                groupId: { type: 'string', description: 'Group ID' },
                limit: { type: 'number', description: 'Max messages to retrieve (default 20)' },
            },
            required: ['groupId'],
        },
    },
    {
        name: 'bash',
        description: 'Execute a shell command (for coding tasks)',
        parameters: {
            type: 'object',
            properties: {
                command: { type: 'string', description: 'Shell command to execute' },
            },
            required: ['command'],
        },
    },
    {
        name: 'report_done',
        description: 'Report that your assigned task is complete',
        parameters: {
            type: 'object',
            properties: {
                summary: { type: 'string', description: 'Brief summary of what was accomplished' },
            },
            required: ['summary'],
        },
    },
];

/**
 * 活跃的 Agent 运行器实例
 * Map<agentId, AgentRunner>
 */
const activeRunners = new Map();

/**
 * Agent Runner - 单个 Agent 的运行循环
 */
class AgentRunner {
    constructor(agent, workspace) {
        this.agent = agent;
        this.workspace = workspace;
        this.isRunning = false;
        this.wakePromise = null;
        this.wakeResolve = null;
        this.maxToolRounds = 5; // 最多 5 轮工具调用
    }

    /**
     * 启动 Agent 运行循环
     */
    async start() {
        this.isRunning = true;
        storage.updateAgentStatus(this.agent.id, 'idle');

        this.log(`Agent started: ${this.agent.role}`);
        eventBus.emit('agent.started', { agentId: this.agent.id, role: this.agent.role });

        while (this.isRunning) {
            await this.waitForWakeUp();

            if (!this.isRunning) break;

            try {
                await this.processUnreadMessages();
            } catch (error) {
                this.log(`Error: ${error.message}`, 'error');
                storage.updateAgentStatus(this.agent.id, 'error');
            }
        }
    }

    /**
     * 停止 Agent
     */
    stop() {
        this.isRunning = false;
        if (this.wakeResolve) {
            this.wakeResolve();
        }
        storage.updateAgentStatus(this.agent.id, 'idle');
        this.log(`Agent stopped: ${this.agent.role}`);
        eventBus.emit('agent.stopped', { agentId: this.agent.id });
    }

    /**
     * 唤醒 Agent (有新消息时调用)
     */
    wake() {
        if (this.wakeResolve) {
            this.wakeResolve();
        }
    }

    /**
     * 等待被唤醒
     */
    async waitForWakeUp() {
        this.wakePromise = new Promise(resolve => {
            this.wakeResolve = resolve;
        });
        storage.updateAgentStatus(this.agent.id, 'idle');
        await this.wakePromise;
        this.wakeResolve = null;
    }

    /**
     * 处理所有未读消息
     */
    async processUnreadMessages() {
        storage.updateAgentStatus(this.agent.id, 'busy');

        // 获取 Agent 所在的所有群组
        const groups = storage.listGroupsByAgent(this.agent.id);

        for (const group of groups) {
            const lastReadId = storage.getLastReadMessageId(this.agent.id, group.id);
            const unread = storage.getUnreadMessages(group.id, lastReadId);

            // 过滤掉自己发的消息
            const newMessages = unread.filter(m => m.senderId !== this.agent.id);

            if (newMessages.length > 0) {
                await this.respondToMessages(group, newMessages);

                // 标记已读
                const lastMsg = unread[unread.length - 1];
                if (lastMsg) {
                    storage.markAsRead(this.agent.id, group.id, lastMsg.id);
                }
            }
        }

        storage.updateAgentStatus(this.agent.id, 'idle');
    }

    /**
     * 响应消息 (调用 LLM)
     */
    async respondToMessages(group, newMessages) {
        this.log(`Processing ${newMessages.length} new messages in group "${group.name}"`);

        // 构建 LLM 消息历史
        const llmMessages = this.buildLLMMessages(group, newMessages);

        // 多轮工具调用循环
        let round = 0;
        let messages = [...llmMessages];

        while (round < this.maxToolRounds) {
            round++;

            const response = await callLLM({
                model: this.agent.model,
                systemPrompt: this.agent.systemPrompt,
                messages: messages,
                tools: AGENT_TOOLS,
                maxTokens: 4096,
            });

            // 处理文本响应
            if (response.content) {
                this.log(`[${this.agent.role}] ${response.content.slice(0, 200)}...`);

                // 自动将文本回复发送到群组
                storage.sendMessage(group.id, this.agent.id, response.content, 'text');
                eventBus.emit('message.created', {
                    groupId: group.id,
                    agentId: this.agent.id,
                    content: response.content,
                });
            }

            // 处理工具调用
            if (response.toolCalls && response.toolCalls.length > 0) {
                const toolResults = [];

                for (const toolCall of response.toolCalls) {
                    const result = await this.executeTool(toolCall);
                    toolResults.push({
                        role: 'user',
                        content: [
                            {
                                type: 'tool_result',
                                tool_use_id: toolCall.id,
                                content: JSON.stringify(result),
                            },
                        ],
                    });
                }

                // 添加 assistant response 和 tool results 到消息历史
                messages.push({
                    role: 'assistant',
                    content: response.toolCalls.map(tc => ({
                        type: 'tool_use',
                        id: tc.id,
                        name: tc.name,
                        input: tc.arguments,
                    })),
                });
                messages.push(...toolResults);

                // 继续下一轮
                continue;
            }

            // 没有工具调用，结束
            break;
        }

        // 保存 LLM 历史
        storage.updateAgentLLMHistory(this.agent.id, messages);
    }

    /**
     * 构建 LLM 消息历史
     */
    buildLLMMessages(group, newMessages) {
        // 获取群组历史消息 (最近 20 条)
        const history = storage.getGroupMessages(group.id, 20);

        const messages = [];

        // 历史消息
        for (const msg of history) {
            const sender = storage.getAgent(msg.senderId);
            const senderName = sender ? sender.role : 'Human';

            if (msg.senderId === this.agent.id) {
                messages.push({
                    role: 'assistant',
                    content: msg.content,
                });
            } else {
                messages.push({
                    role: 'user',
                    content: `[${senderName}]: ${msg.content}`,
                });
            }
        }

        // 确保最后一条是 user 消息
        if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
            messages.push({
                role: 'user',
                content: '[System]: You have been mentioned or have new messages. Please review and respond.',
            });
        }

        return messages;
    }

    /**
     * 执行工具调用
     */
    async executeTool(toolCall) {
        const { name, arguments: args } = toolCall;

        this.log(`Tool call: ${name}(${JSON.stringify(args).slice(0, 100)})`);

        switch (name) {
            case 'self':
                return {
                    id: this.agent.id,
                    role: this.agent.role,
                    parentId: this.agent.parentId,
                    workspaceId: this.agent.workspaceId,
                };

            case 'create':
                return this.toolCreate(args);

            case 'send':
                return this.toolSend(args);

            case 'send_group_message':
                return this.toolSendGroupMessage(args);

            case 'create_group':
                return this.toolCreateGroup(args);

            case 'list_agents':
                return this.toolListAgents();

            case 'list_groups':
                return this.toolListGroups();

            case 'get_group_messages':
                return this.toolGetGroupMessages(args);

            case 'bash':
                return this.toolBash(args);

            case 'report_done':
                return this.toolReportDone(args);

            default:
                return { error: `Unknown tool: ${name}` };
        }
    }

    async toolCreate({ role, guidance }) {
        const newAgent = storage.createAgent(this.workspace.id, {
            role,
            model: 'claude-sonnet-4',
            parentId: this.agent.id,
            systemPrompt: guidance || '',
            responsibilities: [],
            canDelegate: false,
            canApprove: false,
        });

        // 自动创建 P2P 群聊
        const p2p = storage.getOrCreateP2P(this.workspace.id, this.agent.id, newAgent.id);

        // 启动新 Agent
        await startAgent(newAgent.id, this.workspace);

        this.log(`Created sub-agent: ${role} (${newAgent.id})`);
        eventBus.emit('agent.created', { agentId: newAgent.id, role, parentId: this.agent.id });

        return {
            agentId: newAgent.id,
            role: newAgent.role,
            p2pGroupId: p2p.id,
            message: `Created agent "${role}" and a private chat with them.`,
        };
    }

    toolSend({ to, content }) {
        const p2p = storage.getOrCreateP2P(this.workspace.id, this.agent.id, to);
        const msg = storage.sendMessage(p2p.id, this.agent.id, content, 'text');

        // 唤醒目标 Agent
        wakeAgent(to);

        eventBus.emit('message.created', {
            groupId: p2p.id,
            agentId: this.agent.id,
            targetId: to,
            content,
        });

        return { messageId: msg.id, groupId: p2p.id, status: 'sent' };
    }

    toolSendGroupMessage({ groupId, content }) {
        const group = storage.getGroup(groupId);
        if (!group) return { error: 'Group not found' };

        const msg = storage.sendMessage(groupId, this.agent.id, content, 'text');

        // 唤醒群内所有其他 Agent
        for (const memberId of group.memberIds) {
            if (memberId !== this.agent.id) {
                wakeAgent(memberId);
            }
        }

        eventBus.emit('message.created', {
            groupId,
            agentId: this.agent.id,
            content,
        });

        return { messageId: msg.id, status: 'sent' };
    }

    toolCreateGroup({ name, memberIds }) {
        // 确保创建者是成员
        const allMembers = [...new Set([this.agent.id, ...memberIds])];
        const group = storage.createGroup(this.workspace.id, name, allMembers);

        eventBus.emit('group.created', { groupId: group.id, name, members: allMembers });

        return { groupId: group.id, name, memberCount: allMembers.length };
    }

    toolListAgents() {
        const agents = storage.listAgentsByWorkspace(this.workspace.id);
        return agents.map(a => ({
            id: a.id,
            role: a.role,
            status: a.status,
            parentId: a.parentId,
        }));
    }

    toolListGroups() {
        const groups = storage.listGroupsByAgent(this.agent.id);
        return groups.map(g => ({
            id: g.id,
            name: g.name,
            memberCount: g.memberIds.length,
        }));
    }

    toolGetGroupMessages({ groupId, limit }) {
        const messages = storage.getGroupMessages(groupId, limit || 20);
        return messages.map(m => {
            const sender = storage.getAgent(m.senderId);
            return {
                id: m.id,
                sender: sender?.role || 'Human',
                content: m.content,
                createdAt: m.createdAt,
            };
        });
    }

    async toolBash({ command }) {
        // 安全沙箱：命令过滤
        const blocked = checkCommandSafety(command);
        if (blocked) {
            this.log(`Blocked dangerous command: ${command}`, 'warn');
            return {
                exitCode: -1,
                stdout: '',
                stderr: `Command blocked by safety sandbox: ${blocked}`,
            };
        }

        const { execa } = await import('execa');

        try {
            const result = await execa('bash', ['-c', command], {
                timeout: 30000,
                reject: false,
                cwd: process.cwd(), // 限制工作目录
            });

            return {
                exitCode: result.exitCode,
                stdout: result.stdout?.slice(0, 5000) || '',
                stderr: result.stderr?.slice(0, 2000) || '',
            };
        } catch (error) {
            return {
                exitCode: -1,
                stdout: '',
                stderr: error.message,
            };
        }
    }

    toolReportDone({ summary }) {
        this.log(`Task complete: ${summary}`);
        eventBus.emit('agent.done', {
            agentId: this.agent.id,
            role: this.agent.role,
            summary,
        });

        // 通知上级
        if (this.agent.parentId) {
            const parentP2P = storage.getOrCreateP2P(
                this.workspace.id,
                this.agent.id,
                this.agent.parentId
            );
            storage.sendMessage(
                parentP2P.id,
                this.agent.id,
                `[Task Complete] ${summary}`,
                'system'
            );
            wakeAgent(this.agent.parentId);
        }

        return { status: 'reported', summary };
    }

    /**
     * 日志输出
     */
    log(message, level = 'info') {
        const prefix = chalk.cyan(`[${this.agent.role}]`);
        const timestamp = chalk.gray(new Date().toLocaleTimeString());

        switch (level) {
            case 'error':
                console.error(`${timestamp} ${prefix} ${chalk.red(message)}`);
                break;
            case 'warn':
                console.warn(`${timestamp} ${prefix} ${chalk.yellow(message)}`);
                break;
            default:
                console.log(`${timestamp} ${prefix} ${chalk.white(message)}`);
        }
    }
}

// --- 公共 API ---

/**
 * 启动一个 Agent
 */
export async function startAgent(agentId, workspace) {
    const agent = storage.getAgent(agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);

    if (activeRunners.has(agentId)) {
        return activeRunners.get(agentId);
    }

    const runner = new AgentRunner(agent, workspace);
    activeRunners.set(agentId, runner);

    // 异步启动事件循环
    runner.start().catch(err => {
        console.error(`Agent ${agentId} crashed:`, err.message);
        activeRunners.delete(agentId);
    });

    return runner;
}

/**
 * 停止一个 Agent
 */
export function stopAgent(agentId) {
    const runner = activeRunners.get(agentId);
    if (runner) {
        runner.stop();
        activeRunners.delete(agentId);
    }
}

/**
 * 唤醒一个 Agent
 */
export function wakeAgent(agentId) {
    const runner = activeRunners.get(agentId);
    if (runner) {
        runner.wake();
    }
}

/**
 * 停止所有 Agent
 */
export function stopAllAgents() {
    for (const [id, runner] of activeRunners) {
        runner.stop();
    }
    activeRunners.clear();
}

/**
 * 获取所有活跃 Agent 的状态
 */
export function getActiveAgents() {
    const result = [];
    for (const [id, runner] of activeRunners) {
        result.push({
            id,
            role: runner.agent.role,
            status: runner.agent.status,
            isRunning: runner.isRunning,
        });
    }
    return result;
}

/**
 * 从用户发送消息给指定 Agent
 * (用户也被视为一个特殊 Agent)
 */
export function sendUserMessage(workspaceId, targetAgentId, content, humanAgentId) {
    const p2p = storage.getOrCreateP2P(workspaceId, humanAgentId, targetAgentId);
    const msg = storage.sendMessage(p2p.id, humanAgentId, content, 'text');
    wakeAgent(targetAgentId);

    eventBus.emit('message.created', {
        groupId: p2p.id,
        agentId: humanAgentId,
        targetId: targetAgentId,
        content,
    });

    return msg;
}

/**
 * 获取 Agent 工具定义 (供外部使用)
 */
export function getAgentTools() {
    return [...AGENT_TOOLS];
}

/**
 * 命令安全检查
 * 返回 null 表示安全，返回字符串表示拦截原因
 */
function checkCommandSafety(command) {
    const cmd = command.toLowerCase().trim();

    // 危险命令黑名单
    const DANGEROUS_PATTERNS = [
        { pattern: /rm\s+(-rf?|--recursive)\s+[\/\\]/, reason: 'Recursive delete on root' },
        { pattern: /rm\s+(-rf?|--recursive)\s+~/, reason: 'Recursive delete on home directory' },
        { pattern: /mkfs/, reason: 'Filesystem formatting' },
        { pattern: /dd\s+if=/, reason: 'Raw disk write' },
        { pattern: /:(){ :\|:& };:/, reason: 'Fork bomb' },
        { pattern: /shutdown|reboot|poweroff|halt/, reason: 'System shutdown/reboot' },
        { pattern: /format\s+[a-z]:/, reason: 'Disk formatting (Windows)' },
        { pattern: /del\s+\/[sf]\s+[a-z]:\\/, reason: 'Recursive delete (Windows)' },
        { pattern: /reg\s+(delete|add)/, reason: 'Registry modification' },
        { pattern: /curl\s+.*\|\s*(bash|sh|python)/, reason: 'Remote code execution via pipe' },
        { pattern: /wget\s+.*\|\s*(bash|sh|python)/, reason: 'Remote code execution via pipe' },
        { pattern: /chmod\s+777\s+\//, reason: 'Dangerous permission change on root' },
        { pattern: /chown\s+.*\s+\//, reason: 'Ownership change on root' },
        { pattern: />\s*\/dev\/sd[a-z]/, reason: 'Direct disk write' },
        { pattern: /iptables\s+(-F|-X|--flush)/, reason: 'Firewall flush' },
        { pattern: /passwd/, reason: 'Password change' },
        { pattern: /useradd|userdel|adduser|deluser/, reason: 'User management' },
        { pattern: /\bsudo\b/, reason: 'Sudo execution not allowed' },
        { pattern: /\bsu\b\s/, reason: 'User switch not allowed' },
    ];

    for (const { pattern, reason } of DANGEROUS_PATTERNS) {
        if (pattern.test(cmd)) {
            return reason;
        }
    }

    return null;
}

export default {
    startAgent,
    stopAgent,
    wakeAgent,
    stopAllAgents,
    getActiveAgents,
    sendUserMessage,
    getAgentTools,
    eventBus,
};
