/**
 * Company Planner - 智能公司规划器
 *
 * 输入任务描述，自动规划出公司组织架构
 *
 * What: 根据任务需求自动设计多 Agent 组织架构
 * Why: 让用户无需手动配置复杂的 Agent 层级
 * Why it's good: 降低使用门槛，让 AI 来做 AI 团队的 HR
 */

import { getActiveProfile } from './profile.js';
import { t } from './i18n.js';

/**
 * 预设的角色模板库
 * 可根据任务类型自动匹配
 */
export const ROLE_TEMPLATES = {
    // 领导层
    ceo: {
        id: 'ceo',
        role: 'CEO',
        model: 'claude-opus-4',
        responsibilities: ['总体规划', '最终决策', '资源协调', '风险把控'],
        canDelegate: true,
        canApprove: true,
    },
    cto: {
        id: 'cto',
        role: 'CTO',
        model: 'claude-opus-4',
        responsibilities: ['技术架构', '技术选型', '代码审核', '技术风险评估'],
        canDelegate: true,
        canApprove: true,
    },
    pm: {
        id: 'pm',
        role: 'Product Manager',
        model: 'claude-sonnet-4',
        responsibilities: ['需求分析', '任务拆解', '进度跟踪', '优先级排序'],
        canDelegate: true,
        canApprove: false,
    },

    // 开发层
    'frontend-lead': {
        id: 'frontend-lead',
        role: 'Frontend Lead',
        model: 'claude-sonnet-4',
        responsibilities: ['前端架构', 'UI/UX 技术决策', '前端代码审核'],
        canDelegate: true,
        canApprove: false,
    },
    'backend-lead': {
        id: 'backend-lead',
        role: 'Backend Lead',
        model: 'claude-sonnet-4',
        responsibilities: ['后端架构', 'API 设计', '数据库设计', '后端代码审核'],
        canDelegate: true,
        canApprove: false,
    },
    'frontend-dev': {
        id: 'frontend-dev',
        role: 'Frontend Developer',
        model: 'claude-sonnet-4',
        responsibilities: ['UI 组件开发', '页面实现', '前端测试'],
        canDelegate: false,
        canApprove: false,
    },
    'backend-dev': {
        id: 'backend-dev',
        role: 'Backend Developer',
        model: 'claude-sonnet-4',
        responsibilities: ['API 实现', '业务逻辑', '数据库操作'],
        canDelegate: false,
        canApprove: false,
    },
    'fullstack-dev': {
        id: 'fullstack-dev',
        role: 'Fullstack Developer',
        model: 'claude-sonnet-4',
        responsibilities: ['全栈开发', '端到端功能实现'],
        canDelegate: false,
        canApprove: false,
    },

    // 质量层
    'qa-lead': {
        id: 'qa-lead',
        role: 'QA Lead',
        model: 'claude-sonnet-4',
        responsibilities: ['测试策略', '质量标准', '测试代码审核'],
        canDelegate: true,
        canApprove: false,
    },
    tester: {
        id: 'tester',
        role: 'Tester',
        model: 'claude-sonnet-4',
        responsibilities: ['编写测试用例', '执行测试', '报告 Bug'],
        canDelegate: false,
        canApprove: false,
    },
    'security-analyst': {
        id: 'security-analyst',
        role: 'Security Analyst',
        model: 'claude-sonnet-4',
        responsibilities: ['安全审计', '漏洞扫描', '安全建议'],
        canDelegate: false,
        canApprove: false,
    },

    // 运维层
    devops: {
        id: 'devops',
        role: 'DevOps Engineer',
        model: 'claude-sonnet-4',
        responsibilities: ['CI/CD 配置', '部署脚本', '基础设施'],
        canDelegate: false,
        canApprove: false,
    },
    dba: {
        id: 'dba',
        role: 'DBA',
        model: 'claude-sonnet-4',
        responsibilities: ['数据库优化', '数据迁移', '备份策略'],
        canDelegate: false,
        canApprove: false,
    },

    // 设计层
    'ui-designer': {
        id: 'ui-designer',
        role: 'UI Designer',
        model: 'claude-sonnet-4',
        responsibilities: ['界面设计', '视觉规范', '设计系统'],
        canDelegate: false,
        canApprove: false,
    },

    // 文档层
    'tech-writer': {
        id: 'tech-writer',
        role: 'Technical Writer',
        model: 'claude-sonnet-4',
        responsibilities: ['API 文档', '用户手册', '技术文档'],
        canDelegate: false,
        canApprove: false,
    },
};

/**
 * 任务类型到角色配置的映射
 */
const TASK_TYPE_PRESETS = {
    'web-app': {
        description: 'Web 应用开发',
        suggestedRoles: ['ceo', 'pm', 'frontend-lead', 'backend-lead', 'frontend-dev', 'backend-dev', 'tester'],
        hierarchy: {
            ceo: ['pm', 'frontend-lead', 'backend-lead', 'tester'],
            pm: [],
            'frontend-lead': ['frontend-dev'],
            'backend-lead': ['backend-dev'],
        },
    },
    'api-service': {
        description: 'API 服务开发',
        suggestedRoles: ['ceo', 'cto', 'backend-lead', 'backend-dev', 'tester', 'tech-writer'],
        hierarchy: {
            ceo: ['cto'],
            cto: ['backend-lead', 'tech-writer'],
            'backend-lead': ['backend-dev', 'tester'],
        },
    },
    'cli-tool': {
        description: '命令行工具开发',
        suggestedRoles: ['ceo', 'pm', 'fullstack-dev', 'tester', 'tech-writer'],
        hierarchy: {
            ceo: ['pm'],
            pm: ['fullstack-dev', 'tester', 'tech-writer'],
        },
    },
    'bug-fix': {
        description: 'Bug 修复',
        suggestedRoles: ['ceo', 'fullstack-dev', 'tester'],
        hierarchy: {
            ceo: ['fullstack-dev', 'tester'],
        },
    },
    'refactor': {
        description: '代码重构',
        suggestedRoles: ['ceo', 'cto', 'fullstack-dev', 'tester', 'security-analyst'],
        hierarchy: {
            ceo: ['cto'],
            cto: ['fullstack-dev', 'security-analyst', 'tester'],
        },
    },
    'custom': {
        description: '自定义 (让 AI 规划)',
        suggestedRoles: [],
        hierarchy: {},
    },
};

/**
 * 使用 Claude 分析任务并生成公司架构
 *
 * @param {string} taskDescription - 任务描述
 * @param {object} options - 配置选项
 * @returns {Promise<object>} 公司架构 JSON
 */
export async function planCompany(taskDescription, options = {}) {
    const profile = getActiveProfile();

    if (!profile) {
        throw new Error(t('company.noProfile'));
    }

    const systemPrompt = buildPlannerSystemPrompt();
    const userPrompt = buildPlannerUserPrompt(taskDescription, options);

    // 调用 Claude API 进行规划
    const response = await callClaudeForPlanning(profile, systemPrompt, userPrompt);

    // 解析并验证返回的架构
    const companyStructure = parseAndValidateStructure(response);

    return companyStructure;
}

/**
 * 根据预设任务类型快速生成公司架构
 *
 * @param {string} taskType - 任务类型 key
 * @param {string} taskDescription - 具体任务描述
 * @returns {object} 公司架构
 */
export function planCompanyFromPreset(taskType, taskDescription) {
    const preset = TASK_TYPE_PRESETS[taskType];

    if (!preset) {
        throw new Error(`Unknown task type: ${taskType}`);
    }

    const agents = [];
    const roleIdMap = {}; // 用于追踪生成的 agent ID

    // 生成 agents
    for (const roleKey of preset.suggestedRoles) {
        const template = ROLE_TEMPLATES[roleKey];
        if (!template) continue;

        const agentId = `${roleKey}-${Date.now().toString(36)}`;
        roleIdMap[roleKey] = agentId;

        agents.push({
            id: agentId,
            role: template.role,
            roleKey: roleKey,
            model: template.model,
            parentId: null, // 稍后填充
            responsibilities: [...template.responsibilities],
            canDelegate: template.canDelegate,
            canApprove: template.canApprove,
        });
    }

    // 填充 parentId 关系
    for (const [parentKey, childKeys] of Object.entries(preset.hierarchy)) {
        const parentId = roleIdMap[parentKey];
        for (const childKey of childKeys) {
            const agent = agents.find(a => a.roleKey === childKey);
            if (agent && parentId) {
                agent.parentId = parentId;
            }
        }
    }

    return {
        name: `Team-${Date.now().toString(36)}`,
        taskDescription,
        taskType,
        createdAt: new Date().toISOString(),
        agents,
        metadata: {
            preset: taskType,
            presetDescription: preset.description,
        },
    };
}

/**
 * 获取所有可用的任务类型预设
 */
export function getTaskTypePresets() {
    return Object.entries(TASK_TYPE_PRESETS).map(([key, value]) => ({
        key,
        description: value.description,
        roleCount: value.suggestedRoles.length,
    }));
}

/**
 * 构建规划器的 system prompt
 */
function buildPlannerSystemPrompt() {
    return `You are a Company Planner AI. Your job is to analyze a task description and design an optimal organizational structure for a virtual AI company that will execute this task.

## Your Capabilities
- Analyze task complexity and requirements
- Design hierarchical team structures
- Assign appropriate roles and responsibilities
- Determine the right number of agents

## Output Format
You MUST respond with a valid JSON object following this exact schema:

\`\`\`json
{
  "name": "Company Name",
  "analysis": {
    "taskComplexity": "low|medium|high",
    "estimatedAgentCount": number,
    "keySkillsNeeded": ["skill1", "skill2"],
    "potentialChallenges": ["challenge1"]
  },
  "agents": [
    {
      "id": "unique-id",
      "role": "Role Name",
      "model": "claude-opus-4|claude-sonnet-4|codex",
      "parentId": null or "parent-agent-id",
      "responsibilities": ["resp1", "resp2"],
      "canDelegate": true|false,
      "canApprove": true|false
    }
  ]
}
\`\`\`

## Rules
1. Always include a CEO/Lead agent at the top (parentId: null)
2. Use claude-opus-4 for strategic/decision-making roles
3. Use claude-sonnet-4 for execution roles
4. Use codex for heavy backend/algorithm work
5. Keep the hierarchy flat when possible (max 3 levels)
6. Minimum 2 agents, maximum 10 agents
7. Every agent except CEO must have a parentId

## Model Selection Guide
- claude-opus-4: Strategic planning, architecture decisions, final approvals
- claude-sonnet-4: Implementation, coding, testing, documentation
- codex: Complex algorithms, backend optimization, data processing`;
}

/**
 * 构建规划器的 user prompt
 */
function buildPlannerUserPrompt(taskDescription, options) {
    let prompt = `Please analyze the following task and design an optimal company structure:\n\n`;
    prompt += `## Task Description\n${taskDescription}\n\n`;

    if (options.constraints) {
        prompt += `## Constraints\n${options.constraints}\n\n`;
    }

    if (options.preferredTeamSize) {
        prompt += `## Preferred Team Size: ${options.preferredTeamSize} agents\n\n`;
    }

    if (options.techStack) {
        prompt += `## Tech Stack: ${options.techStack.join(', ')}\n\n`;
    }

    prompt += `Now design the company structure. Respond ONLY with the JSON object, no additional text.`;

    return prompt;
}

/**
 * 调用 Claude API 进行规划
 */
async function callClaudeForPlanning(profile, systemPrompt, userPrompt) {
    const { default: axios } = await import('axios');

    const response = await axios.post(
        `${profile.url}/messages`,
        {
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            system: systemPrompt,
            messages: [
                { role: 'user', content: userPrompt }
            ],
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': profile.key,
                'anthropic-version': '2023-06-01',
            },
            timeout: 60000,
        }
    );

    // 提取文本内容
    const content = response.data.content;
    if (Array.isArray(content)) {
        const textBlock = content.find(b => b.type === 'text');
        return textBlock?.text || '';
    }
    return content;
}

/**
 * 解析并验证公司架构
 */
function parseAndValidateStructure(response) {
    // 尝试从响应中提取 JSON
    let jsonStr = response;

    // 如果包含 markdown code block，提取其中的 JSON
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
    }

    let structure;
    try {
        structure = JSON.parse(jsonStr);
    } catch (e) {
        throw new Error(`Failed to parse company structure: ${e.message}`);
    }

    // 验证必需字段
    if (!structure.name) {
        structure.name = `Team-${Date.now().toString(36)}`;
    }

    if (!Array.isArray(structure.agents) || structure.agents.length === 0) {
        throw new Error('Company structure must have at least one agent');
    }

    // 验证每个 agent
    for (const agent of structure.agents) {
        if (!agent.id) {
            agent.id = `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        }
        if (!agent.role) {
            throw new Error(`Agent ${agent.id} is missing role`);
        }
        if (!agent.model) {
            agent.model = 'claude-sonnet-4';
        }
        if (!agent.responsibilities) {
            agent.responsibilities = [];
        }
    }

    // 确保至少有一个顶级 agent (parentId === null)
    const hasTopLevel = structure.agents.some(a => a.parentId === null);
    if (!hasTopLevel) {
        structure.agents[0].parentId = null;
    }

    structure.createdAt = new Date().toISOString();

    return structure;
}

/**
 * 将公司架构转换为 Swarm-IDE 可用的格式
 */
export function toSwarmIdeFormat(companyStructure) {
    return {
        workspace: {
            name: companyStructure.name,
            createdAt: companyStructure.createdAt,
        },
        agents: companyStructure.agents.map(agent => ({
            id: agent.id,
            role: agent.role,
            parentId: agent.parentId,
            systemPrompt: null, // 由 Role Prompt Writer 填充
            model: agent.model,
            metadata: {
                responsibilities: agent.responsibilities,
                canDelegate: agent.canDelegate,
                canApprove: agent.canApprove,
            },
        })),
    };
}

export default {
    planCompany,
    planCompanyFromPreset,
    getTaskTypePresets,
    toSwarmIdeFormat,
    ROLE_TEMPLATES,
};
