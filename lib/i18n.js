import Conf from 'conf';

const config = new Conf({ projectName: 'cc-helper' });

// 语言包定义
const messages = {
    'zh-CN': {
        // === Dashboard ===
        dashboard: {
            title: 'CC Helper 控制台',
            activeProfile: '当前配置',
            name: '名称:',
            url: '地址:',
            type: '类型:',
            status: '状态:',
            statusCode: '状态码:',
            latency: '响应延迟:',
            usage: '占用情况:',
            online: '在线',
            unreachable: '无法连接',
            unknown: '未知',
            none: '无',
            na: '不可用',
            notSupported: '不支持',
            networkError: '网络错误',
            timeout: '超时',
            apiResponseError: 'API 响应异常',
            usagePercent: '已用',
            apiKeyNotConfigured: 'API Key 未配置',
            totalModels: '个可用模型',
            invalid: '无效',
            forbidden: '访问被拒绝',
            serverError: '服务器错误'
        },

        // === 主菜单 ===
        mainMenu: {
            prompt: '请选择操作:',
            startClaude: '启动 Claude Code',
            manageProfiles: '配置管理',
            installCCG: '安装 CCG Skills',
            viewStatus: '查看状态',
            languageSettings: '语言设置',
            virtualCompany: '虚拟公司 (多智能体协作) [测试版]',
            selectRole: '选择角色 / 人设:',
            selectOpus: '选择 Opus 模型:',
            selectSonnet: '选择 Sonnet 模型:',
            queryingModels: '正在查询可用的 Opus 模型...',
            queryingSonnetModels: '正在查询可用的 Sonnet 模型...',
            autoSelected: '自动选择',
            noModelsDetected: '未检测到模型，使用备选',
            exit: '退出'
        },

        // === 首次启动 ===
        firstRun: {
            welcome: '欢迎使用 CC Helper',
            detected: '检测到首次运行',
            ccgNotInstalled: 'CCG Skills 尚未安装',
            askInstall: '是否现在安装 CCG Skills？',
            installDesc: 'CCG Skills 提供多模型协作开发能力',
            skipDesc: '跳过安装，稍后可在菜单中安装',
            yes: '是，立即安装',
            no: '否，稍后再说'
        },

        // === Profile 管理 ===
        profile: {
            title: '配置管理',
            noProfiles: '暂无配置',
            actions: '配置操作:',
            addNew: '添加新配置',
            switch: '切换配置',
            delete: '删除配置',
            viewAll: '查看所有配置',
            backToMain: '返回主菜单',
            createNew: '创建新配置',
            profileName: '配置名称:',
            apiBaseUrl: 'API 地址:',
            apiKey: 'API 密钥:',
            nameEmpty: '名称不能为空',
            invalidUrl: '请输入有效的 URL',
            keyEmpty: 'API 密钥不能为空',
            addSuccess: '配置添加成功！',
            error: '错误:',
            selectToActivate: '选择要激活的配置:',
            selectToDelete: '选择要删除的配置:',
            confirmDelete: '确定要删除 "{name}" 吗？',
            deleteSuccess: '配置删除成功！',
            switchedTo: '已切换到配置: {name}',
            alreadyExists: '名称为 {name} 的配置已存在',
            notFound: '配置 {name} 不存在',
            noRemaining: '没有剩余配置，已清除当前配置',
            pressEnter: '按 Enter 继续...',
            active: '已激活',
            hasKey: '有密钥',
            edit: '编辑配置',
            editHint: '留空保持当前值不变',
            editSuccess: '配置更新成功！',
            selectToEdit: '选择要编辑的配置:',
            testConn: '测试连接',
            selectToTest: '选择要测试的配置:',
            testing: '正在测试连接',
            testSuccess: '连接成功',
            testAuthFail: 'API Key 认证失败',
            testReachable: '端点可达但返回异常',
            testMissingInfo: '缺少 URL 或 API Key'
        },

        // === Runner ===
        runner: {
            loadedProfile: '已加载配置: {name}',
            apiUrl: 'API 地址: {url}',
            noActiveProfile: '无激活配置，使用系统默认值',
            loadingRole: '正在加载角色: {role}',
            usingOpusModel: '使用 Opus 模型: {model}',
            usingSonnetModel: '使用 Sonnet 模型: {model}',
            starting: '正在启动 {command}...',
            sessionCompleted: 'Claude Code 会话已完成',
            exitedWithCode: 'Claude Code 退出，代码: {code}',
            failedToRun: '启动 {command} 失败:',
            troubleshooting: '故障排除:',
            ensureInstalled: "请确保 '{command}' 已安装并在 PATH 中",
            tryRunning: '尝试运行: claude --version',
            visitDocs: '访问: https://github.com/anthropics/claude-code'
        },

        // === Status Bar ===
        statusBar: {
            model: '模型',
            input: '输入',
            output: '输出',
            total: '总计',
            cost: '费用'
        },

        // === CCG 安装 ===
        ccg: {
            installing: '正在安装 CCG Skills 和 Prompts...',
            creatingDirs: '正在创建目录...',
            dirsCreated: '目录创建完成',
            cleaningTemp: '正在清理旧临时目录...',
            cloning: '正在克隆 ccg-skills 仓库...',
            pleaseWait: '请稍候...',
            cloned: '仓库克隆完成',
            copying: '正在复制 skills 到 Claude 目录...',
            skillsInstalled: '{count} 个 skill(s) 已安装',
            installLocations: '安装位置:',
            skills: 'Skills:',
            prompts: 'Prompts:',
            cleaningUp: '正在清理临时文件...',
            cleanupComplete: '清理完成',
            installSuccess: 'CCG Skills 安装成功！',
            installFailed: '安装失败:',
            troubleshooting: '故障排除提示:',
            ensureGit: '1. 确保 Git 已安装并在 PATH 中',
            checkInternet: '2. 检查网络连接',
            verifyPermissions: '3. 确认对 ~/.claude 有写入权限'
        },

        // === 语言设置 ===
        language: {
            title: '语言设置',
            current: '当前语言: {lang}',
            select: '选择语言:',
            chinese: '简体中文',
            english: 'English',
            changed: '语言已切换为: {lang}'
        },

        // === 通用 ===
        common: {
            goodbye: '再见！',
            yes: '是',
            no: '否'
        },

        // === API 恢复 ===
        recovery: {
            detected: '检测到 API 连接异常',
            errorInfo: '错误信息',
            errorType: '错误类型',
            statusCode: '状态码',
            consecutiveErrors: '连续错误',
            prompt: '请选择操作:',
            switchProfile: '切换配置并恢复会话',
            switchProfileDesc: '选择其他 API 配置，恢复之前的对话',
            exportSession: '导出会话记录',
            exportSessionDesc: '将当前会话的用户消息导出为 Markdown',
            retryResume: '用当前配置重试恢复',
            retryResumeDesc: '可能是临时故障，用同一配置尝试恢复',
            exitToMenu: '返回主菜单',
            selectProfile: '选择新配置:',
            exporting: '正在导出会话记录...',
            exported: '会话记录已导出到:',
            resuming: '正在恢复会话...',
            noSession: '未找到可恢复的会话',
            sessionId: '会话 ID',
            times: '次',
            autoContinuing: '检测到连接中断，正在自动尝试继续 (3秒后)...',
            autoContinueFailed: '自动继续失败，请手动操作。',
            autoResumeContinue: '自动恢复并继续 (Continue)',
        },

        // === YOLO 模式 ===
        yolo: {
            menuItem: 'YOLO 模式 (沙盒自动执行)',
            title: 'YOLO Mode',
            selectSandbox: '选择沙盒类型:',
            dockerSandbox: 'Docker 容器隔离',
            dockerDesc: '完全隔离的文件系统，最安全',
            tempDirSandbox: '临时目录隔离',
            tempDirDesc: '复制项目到临时位置，轻量方便',
            projectPath: '项目路径 (留空使用当前目录，输入 back 返回):',
            invalidPath: '目录不存在，请输入有效路径',
            warning: '== 安全警告 ==',
            warningText: '即将在沙盒中以 --dangerously-skip-permissions 模式运行。\nClaude 将自动执行所有操作，不再请求确认。',
            confirmRun: '确认在沙盒中启动 YOLO 模式？',
            dockerNotFound: 'Docker 未检测到。请安装 Docker Desktop 或选择临时目录方案。',
            buildingImage: '正在构建 YOLO Docker 镜像...',
            imageReady: 'Docker 镜像就绪',
            imageBuildFailed: 'Docker 镜像构建失败:',
            startingDocker: '正在启动 Docker 沙盒...',
            copyingProject: '正在复制项目到临时目录...',
            copyDone: '项目已复制到: {path}',
            startingTempDir: '正在临时目录中启动 YOLO 模式...',
            sessionDone: 'YOLO 会话已结束',
            postAction: '会话结束后操作:',
            viewDiff: '查看变更 (diff)',
            mergeback: '合并变更回原目录',
            discard: '丢弃所有变更',
            done: '完成，返回主菜单',
            merging: '正在合并变更...',
            mergeSuccess: '变更已合并回原目录',
            discarded: '变更已丢弃',
            diffTitle: '== 变更对比 ==',
            cancelled: '已取消'
        },

        // === Trellis 框架管理 ===
        trellis: {
            menuItem: 'Trellis 框架管理',
            enabled: '已启用',
            notInitialized: '未初始化',
            notInstalled: '未安装',
            selectAction: '选择 Trellis 操作:',
            initialize: '在当前目录初始化 Trellis',
            update: '更新 Trellis 模板',
            viewStatus: '查看 Trellis 状态',
            returnToMain: '返回主菜单',
            initializing: '正在初始化 Trellis...',
            initSuccess: 'Trellis 初始化成功！',
            initFailed: 'Trellis 初始化失败',
            updating: '正在更新 Trellis...',
            updateSuccess: 'Trellis 更新成功！',
            updateFailed: 'Trellis 更新失败',
            installFirst: '请先全局安装 Trellis: npm install -g @mindfoldhq/trellis@latest',
            enterUsername: '请输入 Trellis 用户名:',
            usernameEmpty: '用户名不能为空',
            statusTitle: 'Trellis 状态',
            trellisDir: '.trellis 目录',
            exists: '存在',
            notExists: '不存在',
            contents: '内容',
        },

        // === YOLO Toggle (运行时切换) ===
        yoloToggle: {
            activated: 'YOLO 模式已激活！所有权限已开放。',
            deactivated: 'YOLO 模式已关闭，权限已恢复。',
            alreadyActive: 'YOLO 模式已经处于激活状态。',
            notActive: 'YOLO 模式当前未激活。',
            allPermissionsGranted: '所有工具权限已注入 settings.local.json，Claude Code 对话中立即生效。',
            permissionsRestored: '原始权限配置已从备份恢复。',
            deactivateHint: '再次运行 cc yolo 即可关闭。',
            restoreFailed: '恢复备份失败',
        },

        // === 虚拟公司 ===
        virtualCompany: {
            // 标题和导航
            title: '虚拟公司',
            activeCompanies: '活跃公司',
            runningAgents: '运行中智能体',
            planAndLaunch: '规划并创建新公司',
            quickStart: '快速启动 (预设)',
            returnToMain: '返回主菜单',
            back: '返回',

            // 规划器
            plannerTitle: '公司规划器 - AI 将分析您的任务并设计团队',
            noActiveProfile: '无激活配置，请先添加配置。',
            describeTask: '描述您的项目或任务 (输入 back 返回):',
            analyzing: 'AI 正在分析您的任务并设计团队...',
            buildingFromPreset: '正在从预设构建团队...',

            // 启动流程
            launching: '正在启动虚拟公司...',
            workspaceCreated: '工作空间已创建: {name}',
            generatingPrompts: '正在生成角色提示词...',
            humanAgentCreated: '人类代理已创建',
            agentCreated: '智能体已创建: {role} ({model})',
            allHandsGroupCreated: '全员群组已创建 ({count} 名成员)',
            startingAgents: '正在启动智能体...',
            allAgentsRunning: '全部 {count} 个智能体已运行!',
            companyLaunched: '公司启动完成!',

            // 聊天
            chattingWith: '正在与 {role} 对话',
            allHandsGroup: '全员群组 (广播)',
            messagePrompt: '消息 (留空退出):',
            selectAgent: '选择要对话的智能体:',
            chatWithAgent: '与特定智能体对话',
            groupChat: '群组对话: {name}',

            // 运行时
            selectAction: '选择操作:',
            chatWithTeam: '与团队成员对话',
            viewStatus: '查看公司状态',
            shutdownCompany: '关闭公司',

            // 状态
            companyStatus: '公司状态: {name}',
            teamStructure: '团队结构',

            // 关闭
            shutdownComplete: '公司已关闭。',

            // 预设
            presets: {
                softwareTeam: '软件开发团队',
                softwareTeamDesc: 'PM、架构师、前端和后端开发者',
                researchTeam: '研究团队',
                researchTeamDesc: '研究员、分析师和撰稿人',
                creativeTeam: '创意团队',
                creativeTeamDesc: '创意总监、设计师和文案',
                custom: '自定义 (AI 规划)',
                customDesc: '描述您的任务，AI 会设计团队'
            },

            // 角色
            roles: {
                productManager: '产品经理',
                architect: '架构师',
                frontendDev: '前端开发',
                backendDev: '后端开发',
                researcher: '研究员',
                analyst: '分析师',
                writer: '撰稿人',
                creativeDirector: '创意总监',
                designer: '设计师',
                copywriter: '文案'
            },

            // 网页版
            webUI: '打开网页版',
            webUIStarting: '正在启动 Web 服务器...',
            webUIReady: 'Web 界面已就绪: {url}',
            webUIOpening: '正在打开浏览器...'
        }
    },

    'en': {
        // === Dashboard ===
        dashboard: {
            title: 'CC Helper Dashboard',
            activeProfile: 'Active Profile',
            name: 'Name:',
            url: 'URL:',
            type: 'Type:',
            status: 'Status:',
            statusCode: 'Status Code:',
            latency: 'Latency:',
            usage: 'Usage:',
            online: 'Online',
            unreachable: 'Unreachable',
            unknown: 'Unknown',
            none: 'None',
            na: 'N/A',
            notSupported: 'Not Supported',
            networkError: 'Network Error',
            timeout: 'Timeout',
            apiResponseError: 'API Response Error',
            usagePercent: 'used',
            apiKeyNotConfigured: 'API Key Not Configured',
            totalModels: 'models available',
            invalid: 'Invalid',
            forbidden: 'Forbidden',
            serverError: 'Server Error'
        },

        // === Main Menu ===
        mainMenu: {
            prompt: 'What would you like to do?',
            startClaude: 'Start Claude Code',
            manageProfiles: 'Manage Profiles',
            installCCG: 'Install CCG Skills',
            viewStatus: 'View Status',
            languageSettings: 'Language Settings',
            virtualCompany: 'Virtual Company (Multi-Agent) [Beta]',
            selectRole: 'Select Role / Persona:',
            selectOpus: 'Select Opus Model:',
            selectSonnet: 'Select Sonnet Model:',
            queryingModels: 'Querying available Opus models...',
            queryingSonnetModels: 'Querying available Sonnet models...',
            autoSelected: 'Auto-selected',
            noModelsDetected: 'No models detected, using fallback',
            exit: 'Exit'
        },

        // === First Run ===
        firstRun: {
            welcome: 'Welcome to CC Helper',
            detected: 'First run detected',
            ccgNotInstalled: 'CCG Skills not installed',
            askInstall: 'Would you like to install CCG Skills now?',
            installDesc: 'CCG Skills enables multi-model collaborative development',
            skipDesc: 'Skip installation, you can install later from the menu',
            yes: 'Yes, install now',
            no: 'No, maybe later'
        },

        // === Profile Management ===
        profile: {
            title: 'Profile Management',
            noProfiles: 'No profiles configured',
            actions: 'Profile Actions:',
            addNew: 'Add New Profile',
            switch: 'Switch Profile',
            delete: 'Delete Profile',
            viewAll: 'View All Profiles',
            backToMain: 'Back to Main Menu',
            createNew: 'Create New Profile',
            profileName: 'Profile Name:',
            apiBaseUrl: 'API Base URL:',
            apiKey: 'API Key:',
            nameEmpty: 'Name cannot be empty',
            invalidUrl: 'Please enter a valid URL',
            keyEmpty: 'API Key cannot be empty',
            addSuccess: 'Profile added successfully!',
            error: 'Error:',
            selectToActivate: 'Select profile to activate:',
            selectToDelete: 'Select profile to delete:',
            confirmDelete: 'Are you sure you want to delete "{name}"?',
            deleteSuccess: 'Profile deleted successfully!',
            switchedTo: 'Switched to profile: {name}',
            alreadyExists: 'Profile with name {name} already exists',
            notFound: 'Profile {name} not found',
            noRemaining: 'No profiles remaining. Active profile cleared.',
            pressEnter: 'Press Enter to continue...',
            active: 'Active',
            hasKey: 'Has Key',
            edit: 'Edit Profile',
            editHint: 'Leave empty to keep current value',
            editSuccess: 'Profile updated successfully!',
            selectToEdit: 'Select profile to edit:',
            testConn: 'Test Connection',
            selectToTest: 'Select profile to test:',
            testing: 'Testing connection',
            testSuccess: 'Connection successful',
            testAuthFail: 'API Key authentication failed',
            testReachable: 'Endpoint reachable but returned error',
            testMissingInfo: 'Missing URL or API Key'
        },

        // === Runner ===
        runner: {
            loadedProfile: 'Loaded profile: {name}',
            apiUrl: 'API URL: {url}',
            noActiveProfile: 'No active profile. Using system defaults.',
            loadingRole: 'Loading role status: {role}',
            usingOpusModel: 'Using Opus model: {model}',
            usingSonnetModel: 'Using Sonnet model: {model}',
            starting: 'Starting {command}...',
            sessionCompleted: 'Claude Code session completed successfully',
            exitedWithCode: 'Claude Code exited with code {code}',
            failedToRun: 'Failed to run {command}:',
            troubleshooting: 'Troubleshooting:',
            ensureInstalled: "Make sure '{command}' is installed and in your PATH",
            tryRunning: 'Try running: claude --version',
            visitDocs: 'Visit: https://github.com/anthropics/claude-code'
        },

        // === Status Bar ===
        statusBar: {
            model: 'Model',
            input: 'Input',
            output: 'Output',
            total: 'Total',
            cost: 'Cost'
        },

        // === CCG Installation ===
        ccg: {
            installing: 'Installing CCG Skills and Prompts...',
            creatingDirs: 'Creating directories...',
            dirsCreated: 'Directories created',
            cleaningTemp: 'Cleaning up old temp directory...',
            cloning: 'Cloning ccg-skills repository...',
            pleaseWait: 'This may take a moment...',
            cloned: 'Repository cloned',
            copying: 'Copying skills to Claude directory...',
            skillsInstalled: '{count} skill(s) installed',
            installLocations: 'Installation Locations:',
            skills: 'Skills:',
            prompts: 'Prompts:',
            cleaningUp: 'Cleaning up temporary files...',
            cleanupComplete: 'Cleanup complete',
            installSuccess: 'CCG Skills installation completed successfully!',
            installFailed: 'Installation failed:',
            troubleshooting: 'Troubleshooting tips:',
            ensureGit: '1. Ensure Git is installed and in PATH',
            checkInternet: '2. Check your internet connection',
            verifyPermissions: '3. Verify you have write permissions to ~/.claude'
        },

        // === Language Settings ===
        language: {
            title: 'Language Settings',
            current: 'Current language: {lang}',
            select: 'Select language:',
            chinese: '简体中文',
            english: 'English',
            changed: 'Language changed to: {lang}'
        },

        // === Common ===
        common: {
            goodbye: 'Goodbye!',
            yes: 'Yes',
            no: 'No'
        },

        // === API Recovery ===
        recovery: {
            detected: 'API connection error detected',
            errorInfo: 'Error Info',
            errorType: 'Error Type',
            statusCode: 'Status Code',
            consecutiveErrors: 'Consecutive Errors',
            prompt: 'What would you like to do?',
            switchProfile: 'Switch profile and resume session',
            switchProfileDesc: 'Select another API profile, then resume previous conversation',
            exportSession: 'Export session history',
            exportSessionDesc: 'Export user messages from this session as Markdown',
            retryResume: 'Retry with current profile',
            retryResumeDesc: 'May be a temporary issue, retry with same profile',
            exitToMenu: 'Return to main menu',
            selectProfile: 'Select new profile:',
            exporting: 'Exporting session history...',
            exported: 'Session exported to:',
            resuming: 'Resuming session...',
            noSession: 'No resumable session found',
            sessionId: 'Session ID',
            times: 'times',
            autoContinuing: 'Connection interrupted, automatically retrying to continue (in 3s)...',
            autoContinueFailed: 'Auto-continue failed, please operate manually.',
            autoResumeContinue: 'Auto-Resume & Continue',
        },

        // === YOLO Mode ===
        yolo: {
            menuItem: 'YOLO Mode (Sandboxed Auto-Execute)',
            title: 'YOLO Mode',
            selectSandbox: 'Select sandbox type:',
            dockerSandbox: 'Docker Container Isolation',
            dockerDesc: 'Fully isolated filesystem, most secure',
            tempDirSandbox: 'Temporary Directory Isolation',
            tempDirDesc: 'Copy project to temp location, lightweight',
            projectPath: 'Project path (leave empty for cwd, type "back" to return):',
            invalidPath: 'Directory does not exist. Please enter a valid path.',
            warning: '== SECURITY WARNING ==',
            warningText: 'About to run in sandbox with --dangerously-skip-permissions.\nClaude will execute ALL operations without confirmation.',
            confirmRun: 'Confirm launching YOLO mode in sandbox?',
            dockerNotFound: 'Docker not detected. Please install Docker Desktop or choose temp directory.',
            buildingImage: 'Building YOLO Docker image...',
            imageReady: 'Docker image ready',
            imageBuildFailed: 'Docker image build failed:',
            startingDocker: 'Starting Docker sandbox...',
            copyingProject: 'Copying project to temporary directory...',
            copyDone: 'Project copied to: {path}',
            startingTempDir: 'Starting YOLO mode in temporary directory...',
            sessionDone: 'YOLO session completed',
            postAction: 'Post-session actions:',
            viewDiff: 'View changes (diff)',
            mergeback: 'Merge changes back to original directory',
            discard: 'Discard all changes',
            done: 'Done, return to main menu',
            merging: 'Merging changes...',
            mergeSuccess: 'Changes merged back to original directory',
            discarded: 'Changes discarded',
            diffTitle: '== CHANGE DIFF ==',
            cancelled: 'Cancelled'
        },

        // === Trellis Framework ===
        trellis: {
            menuItem: 'Trellis Framework',
            enabled: 'Enabled',
            notInitialized: 'Not Initialized',
            notInstalled: 'Not Installed',
            selectAction: 'Select Trellis action:',
            initialize: 'Initialize Trellis in current directory',
            update: 'Update Trellis templates',
            viewStatus: 'View Trellis status',
            returnToMain: 'Return to main menu',
            initializing: 'Initializing Trellis...',
            initSuccess: 'Trellis initialized successfully!',
            initFailed: 'Trellis initialization failed',
            updating: 'Updating Trellis...',
            updateSuccess: 'Trellis updated successfully!',
            updateFailed: 'Trellis update failed',
            installFirst: 'Please install Trellis first: npm install -g @mindfoldhq/trellis@latest',
            enterUsername: 'Enter Trellis username:',
            usernameEmpty: 'Username cannot be empty',
            statusTitle: 'Trellis Status',
            trellisDir: '.trellis directory',
            exists: 'Exists',
            notExists: 'Not exists',
            contents: 'Contents',
        },

        // === YOLO Toggle (Runtime Toggle) ===
        yoloToggle: {
            activated: 'YOLO mode activated! All permissions granted.',
            deactivated: 'YOLO mode deactivated. Permissions restored.',
            alreadyActive: 'YOLO mode is already active.',
            notActive: 'YOLO mode is not currently active.',
            allPermissionsGranted: 'All tool permissions injected into settings.local.json. Takes effect immediately in Claude Code.',
            permissionsRestored: 'Original permission config restored from backup.',
            deactivateHint: 'Run cc yolo again to deactivate.',
            restoreFailed: 'Failed to restore backup',
        },

        // === Virtual Company ===
        virtualCompany: {
            // Title and navigation
            title: 'Virtual Company',
            activeCompanies: 'Active Companies',
            runningAgents: 'Running Agents',
            planAndLaunch: 'Plan & Launch New Company',
            quickStart: 'Quick Start (Preset)',
            returnToMain: 'Return to Main Menu',
            back: 'Back',

            // Planner
            plannerTitle: 'Company Planner - AI will analyze your task and design a team',
            noActiveProfile: 'No active profile. Please add a profile first.',
            describeTask: 'Describe your project or task (type "back" to return):',
            analyzing: 'AI is analyzing your task and designing the team...',
            buildingFromPreset: 'Building team from preset...',

            // Launch process
            launching: 'Launching Virtual Company...',
            workspaceCreated: 'Workspace created: {name}',
            generatingPrompts: 'Generating role prompts...',
            humanAgentCreated: 'Human agent created',
            agentCreated: 'Agent created: {role} ({model})',
            allHandsGroupCreated: 'All-hands group created ({count} members)',
            startingAgents: 'Starting agents...',
            allAgentsRunning: 'All {count} agents are running!',
            companyLaunched: 'Company Launched!',

            // Chat
            chattingWith: 'Chatting with {role}',
            allHandsGroup: 'All-hands group (broadcast)',
            messagePrompt: 'Message (empty to exit):',
            selectAgent: 'Select agent to chat with:',
            chatWithAgent: 'Chat with specific agent',
            groupChat: 'Group chat: {name}',

            // Runtime
            selectAction: 'Select action:',
            chatWithTeam: 'Chat with team member',
            viewStatus: 'View company status',
            shutdownCompany: 'Shutdown company',

            // Status
            companyStatus: 'Company: {name}',
            teamStructure: 'Team Structure',

            // Shutdown
            shutdownComplete: 'Company shutdown complete.',

            // Presets
            presets: {
                softwareTeam: 'Software Development Team',
                softwareTeamDesc: 'PM, Architect, Frontend and Backend developers',
                researchTeam: 'Research Team',
                researchTeamDesc: 'Researcher, Analyst and Writer',
                creativeTeam: 'Creative Team',
                creativeTeamDesc: 'Creative Director, Designer and Copywriter',
                custom: 'Custom (AI Planning)',
                customDesc: 'Describe your task, AI will design the team'
            },

            // Roles
            roles: {
                productManager: 'Product Manager',
                architect: 'Architect',
                frontendDev: 'Frontend Developer',
                backendDev: 'Backend Developer',
                researcher: 'Researcher',
                analyst: 'Analyst',
                writer: 'Writer',
                creativeDirector: 'Creative Director',
                designer: 'Designer',
                copywriter: 'Copywriter'
            },

            // Web UI
            webUI: 'Open Web UI',
            webUIStarting: 'Starting Web server...',
            webUIReady: 'Web UI ready: {url}',
            webUIOpening: 'Opening browser...'
        }
    }
};

// 获取当前语言
export const getLanguage = () => config.get('language', 'zh-CN');

// 设置语言
export const setLanguage = (lang) => {
    if (messages[lang]) {
        config.set('language', lang);
        return true;
    }
    return false;
};

// 获取支持的语言列表
export const getSupportedLanguages = () => Object.keys(messages);

// 翻译函数
export const t = (key, params = {}) => {
    const lang = getLanguage();
    const keys = key.split('.');

    let value = messages[lang];
    for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
            value = value[k];
        } else {
            // 回退到英文
            value = messages['en'];
            for (const k2 of keys) {
                if (value && typeof value === 'object' && k2 in value) {
                    value = value[k2];
                } else {
                    return key; // 找不到则返回 key
                }
            }
            break;
        }
    }

    if (typeof value !== 'string') {
        return key;
    }

    // 替换参数 {param}
    return value.replace(/\{(\w+)\}/g, (match, paramName) => {
        return params[paramName] !== undefined ? params[paramName] : match;
    });
};

// 获取语言显示名称
export const getLanguageDisplayName = (lang) => {
    const names = {
        'zh-CN': '简体中文',
        'en': 'English'
    };
    return names[lang] || lang;
};

export default { t, getLanguage, setLanguage, getSupportedLanguages, getLanguageDisplayName };
