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
            apiKeyNotConfigured: 'API Key 未配置'
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
            hasKey: '有密钥'
        },

        // === Runner ===
        runner: {
            loadedProfile: '已加载配置: {name}',
            apiUrl: 'API 地址: {url}',
            noActiveProfile: '无激活配置，使用系统默认值',
            loadingRole: '正在加载角色: {role}',
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
        }
    },

    'en': {
        // === Dashboard ===
        dashboard: {
            title: 'CC Helper Dashboard',
            activeProfile: 'Active Profile',
            name: 'Name:',
            url: 'URL:',
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
            apiKeyNotConfigured: 'API Key Not Configured'
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
            hasKey: 'Has Key'
        },

        // === Runner ===
        runner: {
            loadedProfile: 'Loaded profile: {name}',
            apiUrl: 'API URL: {url}',
            noActiveProfile: 'No active profile. Using system defaults.',
            loadingRole: 'Loading role status: {role}',
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
