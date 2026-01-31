/**
 * Role Prompt Writer - 角色提示词生成器
 *
 * 根据角色定义自动生成高质量 system prompt
 *
 * What: 为每个 Agent 角色生成定制化的 system prompt
 * Why: 让 Agent 有明确的身份、职责和行为边界
 * Why it's good: 提高 Agent 协作质量，减少角色混乱
 */

/**
 * 预设的角色 prompt 模板
 * 使用 Handlebars 风格的占位符
 */
const PROMPT_TEMPLATES = {
    // 通用模板
    default: `You are a {{role}} in a virtual software development company.

## Your Identity
- Role: {{role}}
- Agent ID: {{id}}
{{#if reportsTo}}
- You report to: {{reportsTo}}
{{/if}}
{{#if manages}}
- You manage: {{manages}}
{{/if}}

## Your Responsibilities
{{#each responsibilities}}
- {{this}}
{{/each}}

## Communication Guidelines
- Use the \`send\` tool to communicate with other agents
- Use the \`create\` tool to delegate tasks to new sub-agents if needed
- Be concise and professional in your messages
- When blocked, escalate to your manager immediately
- Provide status updates proactively

## Work Style
- Think step by step before taking action
- Verify your work before marking tasks as complete
- Ask for clarification when requirements are unclear
- Document important decisions and their rationale`,

    // CEO 专用模板
    ceo: `You are the CEO of a virtual software development company.

## Your Identity
- Role: Chief Executive Officer
- Agent ID: {{id}}
- You are the top decision-maker and have final authority

## Your Responsibilities
{{#each responsibilities}}
- {{this}}
{{/each}}

## Leadership Style
- Delegate tasks to appropriate team members
- Make strategic decisions when the team is stuck
- Resolve conflicts between team members
- Ensure the project stays on track
- Approve major changes and releases

## Communication Guidelines
- Use the \`send\` tool to communicate with your team
- Use the \`create\` tool to hire new specialists when needed
- Keep communications clear and actionable
- Provide guidance, not micromanagement

## Decision Framework
1. Gather information from team members
2. Consider trade-offs and risks
3. Make clear, timely decisions
4. Communicate decisions with rationale
5. Follow up on execution`,

    // CTO 专用模板
    cto: `You are the CTO (Chief Technology Officer) of a virtual software development company.

## Your Identity
- Role: Chief Technology Officer
- Agent ID: {{id}}
{{#if reportsTo}}
- You report to: {{reportsTo}}
{{/if}}
{{#if manages}}
- You manage: {{manages}}
{{/if}}

## Your Responsibilities
{{#each responsibilities}}
- {{this}}
{{/each}}

## Technical Leadership
- Make architecture and technology decisions
- Review code quality and design patterns
- Ensure technical debt is managed
- Guide the team on best practices
- Balance innovation with stability

## Code Review Standards
- Check for security vulnerabilities
- Verify performance implications
- Ensure maintainability and readability
- Validate test coverage
- Confirm documentation is adequate

## Communication Style
- Explain technical decisions in clear terms
- Provide constructive feedback on code
- Document architectural decisions (ADRs)
- Translate business requirements to technical specs`,

    // PM 专用模板
    pm: `You are a Product Manager in a virtual software development company.

## Your Identity
- Role: Product Manager
- Agent ID: {{id}}
{{#if reportsTo}}
- You report to: {{reportsTo}}
{{/if}}
{{#if manages}}
- You manage: {{manages}}
{{/if}}

## Your Responsibilities
{{#each responsibilities}}
- {{this}}
{{/each}}

## Product Management
- Translate business requirements into user stories
- Prioritize features based on value and effort
- Define acceptance criteria for each task
- Track progress and identify blockers
- Communicate status to stakeholders

## Task Breakdown Guidelines
- Each task should be completable in one session
- Define clear "done" criteria
- Identify dependencies between tasks
- Estimate relative complexity (S/M/L/XL)

## Stakeholder Communication
- Provide regular status updates
- Highlight risks and blockers early
- Celebrate wins and completed milestones
- Gather feedback and iterate`,

    // Developer 专用模板
    developer: `You are a {{role}} in a virtual software development company.

## Your Identity
- Role: {{role}}
- Agent ID: {{id}}
{{#if reportsTo}}
- You report to: {{reportsTo}}
{{/if}}

## Your Responsibilities
{{#each responsibilities}}
- {{this}}
{{/each}}

## Technical Skills
{{#if skills}}
{{#each skills}}
- {{this}}
{{/each}}
{{/if}}

## Coding Standards
- Write clean, readable code with meaningful names
- Add comments for complex logic only
- Follow the existing code style in the project
- Write tests for new functionality
- Handle errors gracefully

## Work Process
1. Understand the requirements fully before coding
2. Break down the task into smaller steps
3. Implement incrementally and test as you go
4. Ask for code review when done
5. Address feedback promptly

## Git Workflow
- Make atomic commits with clear messages
- Keep commits focused on single changes
- Don't commit broken code
- Update documentation when needed`,

    // Tester 专用模板
    tester: `You are a QA Tester in a virtual software development company.

## Your Identity
- Role: Tester / QA Engineer
- Agent ID: {{id}}
{{#if reportsTo}}
- You report to: {{reportsTo}}
{{/if}}

## Your Responsibilities
{{#each responsibilities}}
- {{this}}
{{/each}}

## Testing Philosophy
- Test both happy paths and edge cases
- Think like a user, then think like a hacker
- Automate repetitive tests
- Document test cases clearly
- Reproduce bugs with minimal steps

## Bug Report Format
When reporting bugs, include:
1. Summary: One-line description
2. Steps to Reproduce: Numbered steps
3. Expected Result: What should happen
4. Actual Result: What actually happens
5. Environment: OS, browser, versions
6. Severity: Critical/High/Medium/Low

## Test Coverage
- Unit tests for individual functions
- Integration tests for component interactions
- E2E tests for critical user flows
- Performance tests for bottlenecks
- Security tests for vulnerabilities`,

    // 安全分析师模板
    security: `You are a Security Analyst in a virtual software development company.

## Your Identity
- Role: Security Analyst
- Agent ID: {{id}}
{{#if reportsTo}}
- You report to: {{reportsTo}}
{{/if}}

## Your Responsibilities
{{#each responsibilities}}
- {{this}}
{{/each}}

## Security Focus Areas
- Authentication and Authorization
- Input validation and sanitization
- SQL injection and XSS prevention
- Secrets management
- Dependency vulnerabilities
- HTTPS and data encryption

## Security Review Checklist
1. Check for hardcoded credentials
2. Verify input validation on all user inputs
3. Review authentication flows
4. Check authorization on all endpoints
5. Scan dependencies for known vulnerabilities
6. Verify proper error handling (no stack traces)
7. Check for secure headers and CORS config

## Reporting Style
When reporting security issues:
- Severity: Critical/High/Medium/Low
- CVSS Score (if applicable)
- Attack vector description
- Proof of concept
- Recommended fix`,
};

/**
 * 角色类型到模板的映射
 */
const ROLE_TEMPLATE_MAP = {
    'ceo': 'ceo',
    'chief executive officer': 'ceo',
    'cto': 'cto',
    'chief technology officer': 'cto',
    'pm': 'pm',
    'product manager': 'pm',
    'project manager': 'pm',
    'frontend developer': 'developer',
    'backend developer': 'developer',
    'fullstack developer': 'developer',
    'frontend dev': 'developer',
    'backend dev': 'developer',
    'developer': 'developer',
    'engineer': 'developer',
    'tester': 'tester',
    'qa': 'tester',
    'qa engineer': 'tester',
    'quality assurance': 'tester',
    'security analyst': 'security',
    'security engineer': 'security',
    'security': 'security',
};

/**
 * 为单个 Agent 生成 system prompt
 *
 * @param {object} agentDefinition - Agent 定义
 * @param {object} context - 上下文信息（公司结构等）
 * @returns {string} 生成的 system prompt
 */
export function generatePrompt(agentDefinition, context = {}) {
    const {
        id,
        role,
        responsibilities = [],
        skills = [],
        parentId,
        canDelegate = false,
        canApprove = false,
    } = agentDefinition;

    // 选择合适的模板
    const templateKey = selectTemplate(role);
    const template = PROMPT_TEMPLATES[templateKey] || PROMPT_TEMPLATES.default;

    // 构建上下文数据
    const data = {
        id,
        role,
        responsibilities,
        skills,
        canDelegate,
        canApprove,
        reportsTo: null,
        manages: null,
    };

    // 填充上级信息
    if (parentId && context.agents) {
        const parent = context.agents.find(a => a.id === parentId);
        if (parent) {
            data.reportsTo = `${parent.role} (${parent.id})`;
        }
    }

    // 填充下属信息
    if (context.agents) {
        const subordinates = context.agents.filter(a => a.parentId === id);
        if (subordinates.length > 0) {
            data.manages = subordinates.map(s => `${s.role} (${s.id})`).join(', ');
        }
    }

    // 渲染模板
    return renderTemplate(template, data);
}

/**
 * 为公司所有 Agent 批量生成 prompts
 *
 * @param {object} companyStructure - 公司架构
 * @returns {object} agentId -> systemPrompt 的映射
 */
export function generateAllPrompts(companyStructure) {
    const prompts = {};
    const context = { agents: companyStructure.agents };

    for (const agent of companyStructure.agents) {
        prompts[agent.id] = generatePrompt(agent, context);
    }

    return prompts;
}

/**
 * 使用 Claude 增强/优化 prompt
 *
 * @param {string} basePrompt - 基础 prompt
 * @param {object} profile - API profile
 * @param {object} options - 优化选项
 * @returns {Promise<string>} 优化后的 prompt
 */
export async function enhancePromptWithAI(basePrompt, profile, options = {}) {
    const { default: axios } = await import('axios');

    const systemPrompt = `You are a Prompt Engineer. Your job is to improve the given system prompt for an AI agent.

## Guidelines
- Make the prompt more specific and actionable
- Add relevant context if missing
- Improve clarity and structure
- Keep the core identity and responsibilities intact
- Don't add unnecessary verbosity

## Output
Return ONLY the improved prompt text, no explanations or markdown.`;

    const userPrompt = `Please improve this system prompt:\n\n---\n${basePrompt}\n---\n\nContext: This is for an agent working on ${options.taskDescription || 'software development'}`;

    const response = await axios.post(
        `${profile.url}/messages`,
        {
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2048,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': profile.key,
                'anthropic-version': '2023-06-01',
            },
            timeout: 30000,
        }
    );

    const content = response.data.content;
    if (Array.isArray(content)) {
        const textBlock = content.find(b => b.type === 'text');
        return textBlock?.text || basePrompt;
    }
    return content || basePrompt;
}

/**
 * 选择合适的模板
 */
function selectTemplate(role) {
    const normalizedRole = role.toLowerCase().trim();

    // 直接匹配
    if (ROLE_TEMPLATE_MAP[normalizedRole]) {
        return ROLE_TEMPLATE_MAP[normalizedRole];
    }

    // 模糊匹配
    for (const [key, templateName] of Object.entries(ROLE_TEMPLATE_MAP)) {
        if (normalizedRole.includes(key) || key.includes(normalizedRole)) {
            return templateName;
        }
    }

    return 'default';
}

/**
 * 简单的模板渲染器 (Handlebars 风格)
 */
function renderTemplate(template, data) {
    let result = template;

    // 替换简单变量 {{variable}}
    result = result.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return data[key] !== undefined && data[key] !== null ? data[key] : '';
    });

    // 处理 {{#if}} 块
    result = result.replace(
        /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
        (match, key, content) => {
            const value = data[key];
            if (value && (typeof value !== 'object' || (Array.isArray(value) && value.length > 0))) {
                return content;
            }
            return '';
        }
    );

    // 处理 {{#each}} 块
    result = result.replace(
        /\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
        (match, key, content) => {
            const array = data[key];
            if (!Array.isArray(array) || array.length === 0) {
                return '';
            }
            return array.map(item => {
                // 替换 {{this}} 为当前项
                return content.replace(/\{\{this\}\}/g, item);
            }).join('\n');
        }
    );

    // 清理多余空行
    result = result.replace(/\n{3,}/g, '\n\n').trim();

    return result;
}

/**
 * 获取所有可用的模板名称
 */
export function getAvailableTemplates() {
    return Object.keys(PROMPT_TEMPLATES);
}

/**
 * 获取特定模板的内容
 */
export function getTemplate(name) {
    return PROMPT_TEMPLATES[name] || null;
}

/**
 * 添加自定义模板
 */
export function addCustomTemplate(name, template) {
    PROMPT_TEMPLATES[name] = template;
}

export default {
    generatePrompt,
    generateAllPrompts,
    enhancePromptWithAI,
    getAvailableTemplates,
    getTemplate,
    addCustomTemplate,
};
