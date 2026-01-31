/**
 * Virtual Company - cchelper 集成层
 *
 * What: 虚拟公司功能的 CLI 交互界面
 * Why: 让用户通过 cchelper 菜单使用多 Agent 协作功能
 * Why it's good: 一键创建 AI 公司，自动规划 + 角色生成 + Agent 启动
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import { colors, symbols, box } from './theme.js';
import { t } from './i18n.js';
import { getActiveProfile } from './profile.js';
import { planCompany, planCompanyFromPreset, getTaskTypePresets, toSwarmIdeFormat } from './company-planner.js';
import { generateAllPrompts } from './role-prompt-writer.js';
import * as storage from './virtual-company-storage.js';
import * as runtime from './virtual-company-runtime.js';

/**
 * 虚拟公司主菜单
 */
export async function virtualCompanyMenu() {
    let running = true;

    while (running) {
        console.clear();

        // 显示活跃公司状态
        const workspaces = storage.listWorkspaces().filter(w => w.status === 'active');
        const activeAgents = runtime.getActiveAgents();

        const statusContent = [
            `${chalk.bold('Active Companies')}: ${workspaces.length}`,
            `${chalk.bold('Running Agents')}: ${activeAgents.length}`,
        ].join('\n');

        console.log(box(statusContent, {
            width: 56,
            padding: 1,
            borderStyle: 'round',
            borderColor: colors.accent,
            titleText: '🏢 Virtual Company',
            titleAlign: 'center',
        }));

        const { action } = await inquirer.prompt([{
            type: 'list',
            name: 'action',
            message: colors.primaryBold('Choose action:'),
            choices: [
                { name: colors.text(`${symbols.pointer} Plan & Launch New Company`), value: 'plan' },
                { name: colors.text(`${symbols.bullet} Quick Start (Preset)`), value: 'preset' },
                ...(workspaces.length > 0 ? [
                    { name: colors.text(`${symbols.bullet} Chat with Company`), value: 'chat' },
                    { name: colors.text(`${symbols.bullet} View Company Status`), value: 'status' },
                    { name: colors.text(`${symbols.bullet} Shutdown Company`), value: 'shutdown' },
                ] : []),
                { name: colors.textDim(`${symbols.arrowLeft} Back to Main Menu`), value: 'back' },
            ],
        }]);

        switch (action) {
            case 'plan':
                await planNewCompany();
                break;
            case 'preset':
                await quickStartCompany();
                break;
            case 'chat':
                await chatWithCompany();
                break;
            case 'status':
                await viewCompanyStatus();
                break;
            case 'shutdown':
                await shutdownCompany();
                break;
            case 'back':
                running = false;
                break;
        }
    }
}

/**
 * AI 规划新公司
 */
async function planNewCompany() {
    const profile = getActiveProfile();
    if (!profile) {
        console.log(chalk.red('\n  No active profile. Please add a profile first.\n'));
        await pause();
        return;
    }

    console.log(chalk.cyan('\n  🤖 Company Planner - AI will analyze your task and design a team\n'));

    const { taskDescription } = await inquirer.prompt([{
        type: 'input',
        name: 'taskDescription',
        message: 'Describe your task:',
        validate: input => input.trim().length > 10 ? true : 'Please describe your task in more detail (at least 10 characters)',
    }]);

    const { constraints } = await inquirer.prompt([{
        type: 'input',
        name: 'constraints',
        message: 'Any constraints? (optional, press Enter to skip):',
    }]);

    console.log(chalk.yellow('\n  ⏳ AI is analyzing your task and designing the team...\n'));

    try {
        const structure = await planCompany(taskDescription, {
            constraints: constraints || undefined,
        });

        // 显示规划结果
        displayCompanyStructure(structure);

        const { confirm } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirm',
            message: 'Launch this company?',
            default: true,
        }]);

        if (confirm) {
            await launchCompany(taskDescription, structure);
        }
    } catch (error) {
        console.log(chalk.red(`\n  Error: ${error.message}\n`));
        console.log(chalk.gray('  Tip: Check your API key and network connection.\n'));
        await pause();
    }
}

/**
 * 快速启动（预设模板）
 */
async function quickStartCompany() {
    const presets = getTaskTypePresets();

    const { taskType } = await inquirer.prompt([{
        type: 'list',
        name: 'taskType',
        message: 'Select project type:',
        choices: presets.map(p => ({
            name: `${p.description} (${p.roleCount} roles)`,
            value: p.key,
        })),
    }]);

    const { taskDescription } = await inquirer.prompt([{
        type: 'input',
        name: 'taskDescription',
        message: 'Describe your specific task:',
        validate: input => input.trim().length > 5 ? true : 'Please provide a task description',
    }]);

    console.log(chalk.yellow('\n  ⏳ Building team from preset...\n'));

    const structure = planCompanyFromPreset(taskType, taskDescription);

    displayCompanyStructure(structure);

    const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: 'Launch this company?',
        default: true,
    }]);

    if (confirm) {
        await launchCompany(taskDescription, structure);
    }
}

/**
 * 启动公司
 */
async function launchCompany(taskDescription, structure) {
    console.log(chalk.cyan('\n  🚀 Launching Virtual Company...\n'));

    // 1. 创建 workspace
    const workspace = storage.createWorkspace(
        structure.name || `Company-${Date.now().toString(36)}`,
        taskDescription,
        structure
    );

    console.log(chalk.green(`  ✓ Workspace created: ${workspace.name}`));

    // 2. 生成所有 Agent 的 system prompt
    console.log(chalk.yellow('  ⏳ Generating role prompts...'));
    const prompts = generateAllPrompts(structure);

    // 3. 创建 Human Agent (代表用户)
    const humanAgent = storage.createAgent(workspace.id, {
        role: 'Human',
        roleKey: 'human',
        model: 'none',
        parentId: null,
        systemPrompt: '',
        responsibilities: ['Final decision maker'],
        canDelegate: true,
        canApprove: true,
    });
    console.log(chalk.green(`  ✓ Human agent created`));

    // 4. 创建所有 AI Agent
    const agentIdMap = {}; // structureAgentId -> storageAgentId

    for (const agentDef of structure.agents) {
        const systemPrompt = prompts[agentDef.id] || '';

        // 解析 parentId (可能是 structure 中的 ID)
        let parentId = null;
        if (agentDef.parentId === null) {
            // 顶级 agent，报告给 human
            parentId = humanAgent.id;
        } else if (agentIdMap[agentDef.parentId]) {
            parentId = agentIdMap[agentDef.parentId];
        }

        const agent = storage.createAgent(workspace.id, {
            role: agentDef.role,
            roleKey: agentDef.roleKey || agentDef.id,
            model: agentDef.model || 'claude-sonnet-4',
            parentId,
            systemPrompt,
            responsibilities: agentDef.responsibilities || [],
            canDelegate: agentDef.canDelegate || false,
            canApprove: agentDef.canApprove || false,
        });

        agentIdMap[agentDef.id] = agent.id;
        console.log(chalk.green(`  ✓ Agent created: ${agentDef.role} (${agentDef.model})`));
    }

    // 5. 创建全员群聊
    const allAgentIds = [humanAgent.id, ...Object.values(agentIdMap)];
    const allGroup = storage.createGroup(workspace.id, '全员群', allAgentIds);
    console.log(chalk.green(`  ✓ All-hands group created (${allAgentIds.length} members)`));

    // 6. 创建 CEO ↔ Human P2P
    const ceoAgentDef = structure.agents.find(a => a.parentId === null);
    if (ceoAgentDef && agentIdMap[ceoAgentDef.id]) {
        storage.getOrCreateP2P(workspace.id, humanAgent.id, agentIdMap[ceoAgentDef.id]);
    }

    // 7. 启动所有 AI Agent
    console.log(chalk.yellow('\n  ⏳ Starting agents...'));
    for (const [structId, storageId] of Object.entries(agentIdMap)) {
        await runtime.startAgent(storageId, workspace);
    }
    console.log(chalk.green(`  ✓ All ${Object.keys(agentIdMap).length} agents are running!\n`));

    // 8. 保存元数据
    console.log(box(
        [
            `Company: ${chalk.bold(workspace.name)}`,
            `Task: ${taskDescription.slice(0, 50)}...`,
            `Agents: ${allAgentIds.length}`,
            `Workspace ID: ${chalk.gray(workspace.id)}`,
        ].join('\n'),
        {
            width: 56,
            padding: 1,
            borderStyle: 'round',
            borderColor: colors.success,
            titleText: '✅ Company Launched!',
            titleAlign: 'center',
        }
    ));

    // 9. 自动进入聊天模式
    const { enterChat } = await inquirer.prompt([{
        type: 'confirm',
        name: 'enterChat',
        message: 'Start chatting with the CEO?',
        default: true,
    }]);

    if (enterChat) {
        await chatWithAgent(workspace.id, humanAgent.id, agentIdMap[ceoAgentDef?.id]);
    }
}

/**
 * 与公司对话
 */
async function chatWithCompany() {
    const workspaces = storage.listWorkspaces().filter(w => w.status === 'active');

    if (workspaces.length === 0) {
        console.log(chalk.yellow('\n  No active companies.\n'));
        await pause();
        return;
    }

    // 选择公司
    const { workspaceId } = await inquirer.prompt([{
        type: 'list',
        name: 'workspaceId',
        message: 'Select company:',
        choices: workspaces.map(w => ({
            name: `${w.name} — ${w.taskDescription?.slice(0, 40)}...`,
            value: w.id,
        })),
    }]);

    const agents = storage.listAgentsByWorkspace(workspaceId);
    const humanAgent = agents.find(a => a.role === 'Human');
    const aiAgents = agents.filter(a => a.role !== 'Human');

    // 选择要对话的 Agent
    const { targetId } = await inquirer.prompt([{
        type: 'list',
        name: 'targetId',
        message: 'Who do you want to talk to?',
        choices: [
            ...aiAgents.map(a => ({
                name: `${a.role} (${chalk.gray(a.status)})`,
                value: a.id,
            })),
            { name: chalk.yellow('📢 All-hands group (broadcast)'), value: 'all' },
        ],
    }]);

    if (targetId === 'all') {
        const groups = storage.listGroupsByWorkspace(workspaceId);
        const allGroup = groups.find(g => g.name === '全员群');
        if (allGroup) {
            await chatInGroup(workspaceId, humanAgent.id, allGroup.id);
        }
    } else {
        await chatWithAgent(workspaceId, humanAgent.id, targetId);
    }
}

/**
 * 与单个 Agent 对话
 */
async function chatWithAgent(workspaceId, humanAgentId, targetAgentId) {
    const targetAgent = storage.getAgent(targetAgentId);
    if (!targetAgent) {
        console.log(chalk.red('Agent not found'));
        return;
    }

    console.log(chalk.cyan(`\n  💬 Chatting with ${targetAgent.role}`));
    console.log(chalk.gray('  Type "exit" to leave, "status" to check, "history" to view messages\n'));

    // 监听回复
    const messageHandler = (event) => {
        if (event.agentId !== humanAgentId && event.targetId === humanAgentId) {
            const sender = storage.getAgent(event.agentId);
            console.log(chalk.green(`\n  [${sender?.role || 'Agent'}]: ${event.content}\n`));
        }
    };
    runtime.eventBus.on('message.created', messageHandler);

    let chatting = true;
    while (chatting) {
        const { message } = await inquirer.prompt([{
            type: 'input',
            name: 'message',
            message: chalk.blue('You >'),
        }]);

        const trimmed = message.trim();

        if (trimmed.toLowerCase() === 'exit') {
            chatting = false;
            continue;
        }

        if (trimmed.toLowerCase() === 'status') {
            const agents = runtime.getActiveAgents();
            console.log(chalk.cyan('\n  Active Agents:'));
            for (const a of agents) {
                const statusColor = a.status === 'busy' ? chalk.yellow : chalk.green;
                console.log(`  ${statusColor('●')} ${a.role} — ${a.status}`);
            }
            console.log();
            continue;
        }

        if (trimmed.toLowerCase() === 'history') {
            const p2p = storage.getOrCreateP2P(workspaceId, humanAgentId, targetAgentId);
            const msgs = storage.getGroupMessages(p2p.id, 20);
            console.log(chalk.cyan('\n  Recent messages:'));
            for (const msg of msgs) {
                const sender = storage.getAgent(msg.senderId);
                const name = sender?.role || 'Unknown';
                const isHuman = msg.senderId === humanAgentId;
                const prefix = isHuman ? chalk.blue('You') : chalk.green(name);
                console.log(`  ${prefix}: ${msg.content.slice(0, 200)}`);
            }
            console.log();
            continue;
        }

        if (!trimmed) continue;

        // 发送消息
        runtime.sendUserMessage(workspaceId, targetAgentId, trimmed, humanAgentId);
        console.log(chalk.gray('  Message sent. Waiting for response...'));

        // 等待一小段时间让 Agent 处理
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    runtime.eventBus.off('message.created', messageHandler);
}

/**
 * 在群聊中对话
 */
async function chatInGroup(workspaceId, humanAgentId, groupId) {
    const group = storage.getGroup(groupId);
    if (!group) {
        console.log(chalk.red('Group not found'));
        return;
    }

    console.log(chalk.cyan(`\n  💬 Group chat: ${group.name}`));
    console.log(chalk.gray('  Type "exit" to leave\n'));

    const messageHandler = (event) => {
        if (event.groupId === groupId && event.agentId !== humanAgentId) {
            const sender = storage.getAgent(event.agentId);
            console.log(chalk.green(`  [${sender?.role || 'Agent'}]: ${event.content?.slice(0, 300)}`));
        }
    };
    runtime.eventBus.on('message.created', messageHandler);

    let chatting = true;
    while (chatting) {
        const { message } = await inquirer.prompt([{
            type: 'input',
            name: 'message',
            message: chalk.blue('You (all-hands) >'),
        }]);

        if (message.trim().toLowerCase() === 'exit') {
            chatting = false;
            continue;
        }

        if (!message.trim()) continue;

        // 发送到群组
        storage.sendMessage(groupId, humanAgentId, message.trim(), 'text');

        // 唤醒所有群成员
        for (const memberId of group.memberIds) {
            if (memberId !== humanAgentId) {
                runtime.wakeAgent(memberId);
            }
        }

        console.log(chalk.gray('  Broadcast sent. Agents are thinking...'));
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    runtime.eventBus.off('message.created', messageHandler);
}

/**
 * 查看公司状态
 */
async function viewCompanyStatus() {
    const workspaces = storage.listWorkspaces();

    if (workspaces.length === 0) {
        console.log(chalk.yellow('\n  No companies found.\n'));
        await pause();
        return;
    }

    for (const ws of workspaces) {
        const agents = storage.listAgentsByWorkspace(ws.id);
        const groups = storage.listGroupsByWorkspace(ws.id);

        // 组织架构树
        console.log(box(
            [
                `Task: ${ws.taskDescription?.slice(0, 50)}`,
                `Status: ${ws.status}`,
                `Created: ${ws.createdAt}`,
                `Groups: ${groups.length}`,
            ].join('\n'),
            {
                width: 60,
                padding: 1,
                borderStyle: 'round',
                borderColor: ws.status === 'active' ? colors.success : colors.textMuted,
                titleText: ws.name,
                titleAlign: 'center',
            }
        ));

        // ASCII 组织架构图
        console.log(chalk.bold('\n  Organization Chart:\n'));
        const rootAgents = agents.filter(a => !a.parentId);
        for (const root of rootAgents) {
            renderOrgTree(agents, root, '  ', true);
        }

        // 消息统计
        let totalMessages = 0;
        for (const group of groups) {
            totalMessages += storage.getGroupMessages(group.id, 9999).length;
        }
        console.log(chalk.gray(`\n  Total messages exchanged: ${totalMessages}\n`));
    }

    await pause();
}

/**
 * 渲染 ASCII 组织架构树
 */
function renderOrgTree(allAgents, agent, prefix, isLast) {
    const connector = isLast ? '└── ' : '├── ';
    const extension = isLast ? '    ' : '│   ';

    // 状态图标
    const statusIcon = agent.status === 'busy' ? chalk.yellow('●') :
                       agent.status === 'error' ? chalk.red('●') :
                       agent.role === 'Human' ? chalk.blue('◆') : chalk.green('●');

    // 模型标签
    const modelTag = agent.model && agent.model !== 'none'
        ? chalk.gray(` [${agent.model}]`)
        : '';

    console.log(`${prefix}${connector}${statusIcon} ${chalk.bold(agent.role)}${modelTag}`);

    // 子 Agent
    const children = allAgents.filter(a => a.parentId === agent.id);
    children.forEach((child, idx) => {
        renderOrgTree(allAgents, child, prefix + extension, idx === children.length - 1);
    });
}

/**
 * 关闭公司
 */
async function shutdownCompany() {
    const workspaces = storage.listWorkspaces().filter(w => w.status === 'active');

    if (workspaces.length === 0) {
        console.log(chalk.yellow('\n  No active companies.\n'));
        await pause();
        return;
    }

    const { workspaceId } = await inquirer.prompt([{
        type: 'list',
        name: 'workspaceId',
        message: 'Select company to shutdown:',
        choices: workspaces.map(w => ({
            name: `${w.name} — ${w.taskDescription?.slice(0, 40)}...`,
            value: w.id,
        })),
    }]);

    const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: chalk.red('Are you sure you want to shutdown this company?'),
        default: false,
    }]);

    if (!confirm) return;

    // 停止所有 Agent
    const agents = storage.listAgentsByWorkspace(workspaceId);
    for (const agent of agents) {
        runtime.stopAgent(agent.id);
    }

    // 更新状态
    storage.updateWorkspaceStatus(workspaceId, 'archived');

    console.log(chalk.green('\n  ✓ Company shutdown complete.\n'));
    await pause();
}

/**
 * 显示公司架构
 */
function displayCompanyStructure(structure) {
    console.log(chalk.cyan(`\n  📊 Company: ${structure.name}\n`));

    if (structure.analysis) {
        console.log(chalk.gray(`  Complexity: ${structure.analysis.taskComplexity}`));
        console.log(chalk.gray(`  Skills: ${structure.analysis.keySkillsNeeded?.join(', ')}`));
        console.log();
    }

    // 显示组织树
    const rootAgents = structure.agents.filter(a => a.parentId === null);
    for (const agent of rootAgents) {
        printAgentTree(structure.agents, agent, 0);
    }
    console.log();
}

function printAgentTree(allAgents, agent, depth) {
    const indent = '  '.repeat(depth + 1);
    const connector = depth === 0 ? '👑' : '├─';
    const modelTag = chalk.gray(`[${agent.model}]`);

    console.log(`${indent}${connector} ${chalk.bold(agent.role)} ${modelTag}`);

    if (agent.responsibilities && agent.responsibilities.length > 0) {
        for (const resp of agent.responsibilities.slice(0, 3)) {
            console.log(`${indent}   ${chalk.gray(`• ${resp}`)}`);
        }
    }

    // 递归打印子 Agent
    const children = allAgents.filter(a => a.parentId === agent.id);
    for (const child of children) {
        printAgentTree(allAgents, child, depth + 1);
    }
}

async function pause() {
    await inquirer.prompt([{
        type: 'input',
        name: 'continue',
        message: chalk.gray('Press Enter to continue...'),
    }]);
}

export default { virtualCompanyMenu };
