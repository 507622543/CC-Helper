import chalk from 'chalk';

// ============================================
// CC Helper Theme - Minimal Blue
// 极简蓝调主题
// ============================================

// --- 配色方案 ---
export const colors = {
    // 主色调
    primary: chalk.hex('#3B82F6'),      // 蓝色
    primaryBold: chalk.hex('#3B82F6').bold,
    primaryDim: chalk.hex('#60A5FA'),   // 浅蓝

    // 辅助色
    secondary: chalk.hex('#6366F1'),    // 靛蓝
    accent: chalk.hex('#8B5CF6'),       // 紫色

    // 状态色
    success: chalk.hex('#10B981'),      // 绿色
    warning: chalk.hex('#F59E0B'),      // 橙色
    error: chalk.hex('#EF4444'),        // 红色
    info: chalk.hex('#06B6D4'),         // 青色

    // 中性色
    text: chalk.hex('#F8FAFC'),         // 白色文字
    textDim: chalk.hex('#94A3B8'),      // 灰色文字
    textMuted: chalk.hex('#64748B'),    // 暗灰文字
    border: chalk.hex('#475569'),       // 边框色

    // 背景提示
    highlight: chalk.bgHex('#1E3A5F').hex('#F8FAFC'),

    // 彩虹色（用于特殊功能标记）
    rainbow: chalk.hex('#FF6B9D'),          // 粉红色（彩虹色代表）
    rainbowBold: chalk.hex('#FF6B9D').bold, // 粗体彩虹色
};

// --- 符号常量（替代 emoji）---
export const symbols = {
    // 状态指示
    success: chalk.hex('#10B981')('✓'),
    error: chalk.hex('#EF4444')('✗'),
    warning: chalk.hex('#F59E0B')('!'),
    info: chalk.hex('#3B82F6')('i'),

    // 列表符号
    bullet: chalk.hex('#3B82F6')('›'),
    bulletActive: chalk.hex('#10B981')('›'),
    bulletInactive: chalk.hex('#64748B')('·'),

    // 菜单符号
    pointer: chalk.hex('#3B82F6')('▸'),
    selected: chalk.hex('#10B981')('◆'),
    unselected: chalk.hex('#64748B')('◇'),

    // 进度符号
    running: chalk.hex('#3B82F6')('◐'),
    done: chalk.hex('#10B981')('●'),
    pending: chalk.hex('#64748B')('○'),

    // 分隔符
    line: chalk.hex('#475569')('─'),
    doubleLine: chalk.hex('#475569')('═'),
    verticalLine: chalk.hex('#475569')('│'),

    // 箭头
    arrowRight: chalk.hex('#3B82F6')('→'),
    arrowLeft: chalk.hex('#3B82F6')('←'),
    arrowUp: chalk.hex('#3B82F6')('↑'),
    arrowDown: chalk.hex('#3B82F6')('↓'),

    // 其他
    star: chalk.hex('#F59E0B')('★'),
    dot: chalk.hex('#3B82F6')('•'),
};

// --- 边框样式 ---
export const borders = {
    // 单线边框
    single: {
        topLeft: '┌',
        topRight: '┐',
        bottomLeft: '└',
        bottomRight: '┘',
        horizontal: '─',
        vertical: '│',
    },
    // 圆角边框
    round: {
        topLeft: '╭',
        topRight: '╮',
        bottomLeft: '╰',
        bottomRight: '╯',
        horizontal: '─',
        vertical: '│',
    },
    // 双线边框
    double: {
        topLeft: '╔',
        topRight: '╗',
        bottomLeft: '╚',
        bottomRight: '╝',
        horizontal: '═',
        vertical: '║',
    },
};

// --- 辅助函数 ---

/**
 * 创建水平分隔线
 */
export const divider = (width = 40, style = 'single') => {
    const char = style === 'double' ? '═' : '─';
    return colors.border(char.repeat(width));
};

/**
 * 创建标题栏
 */
export const title = (text, width = 40) => {
    const padding = Math.max(0, width - text.length - 4);
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    return colors.primaryBold(`${'─'.repeat(leftPad)}[ ${text} ]${'─'.repeat(rightPad)}`);
};

/**
 * 创建带边框的盒子
 */
export const box = (content, options = {}) => {
    const {
        width = 50,
        padding = 1,
        borderStyle = 'round',
        borderColor = colors.primary,
        titleText = '',
        titleAlign = 'center',
    } = options;

    const border = borders[borderStyle] || borders.round;
    const lines = content.split('\n');
    const innerWidth = width - 2;

    // 构建边框颜色函数
    const bc = typeof borderColor === 'function' ? borderColor : chalk.hex('#3B82F6');

    // 顶部边框
    let result = [];
    if (titleText) {
        const titleLen = getDisplayWidth(titleText);
        const availableWidth = innerWidth - titleLen - 2;
        const leftLen = titleAlign === 'center' ? Math.floor(availableWidth / 2) : (titleAlign === 'right' ? availableWidth : 0);
        const rightLen = availableWidth - leftLen;
        result.push(
            bc(border.topLeft) +
            bc(border.horizontal.repeat(leftLen)) +
            ' ' + colors.text(titleText) + ' ' +
            bc(border.horizontal.repeat(rightLen)) +
            bc(border.topRight)
        );
    } else {
        result.push(bc(border.topLeft + border.horizontal.repeat(innerWidth) + border.topRight));
    }

    // 上内边距
    for (let i = 0; i < padding; i++) {
        result.push(bc(border.vertical) + ' '.repeat(innerWidth) + bc(border.vertical));
    }

    // 内容行 - 使用固定宽度填充
    const contentWidth = innerWidth - padding * 2;
    for (const line of lines) {
        const lineLen = getDisplayWidth(line);
        const padRight = Math.max(0, contentWidth - lineLen);
        result.push(
            bc(border.vertical) +
            ' '.repeat(padding) +
            line +
            ' '.repeat(padRight) +
            ' '.repeat(padding) +
            bc(border.vertical)
        );
    }

    // 下内边距
    for (let i = 0; i < padding; i++) {
        result.push(bc(border.vertical) + ' '.repeat(innerWidth) + bc(border.vertical));
    }

    // 底部边框
    result.push(bc(border.bottomLeft + border.horizontal.repeat(innerWidth) + border.bottomRight));

    return result.join('\n');
};

/**
 * 去除 ANSI 转义码（用于计算实际字符宽度）
 */
export const stripAnsi = (str) => {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
};

/**
 * 计算字符串的显示宽度（考虑中文等宽字符）
 */
export const getDisplayWidth = (str) => {
    const stripped = stripAnsi(str);
    let width = 0;
    for (const char of stripped) {
        const code = char.charCodeAt(0);
        // 中文、日文、韩文等宽字符范围
        if (
            (code >= 0x4E00 && code <= 0x9FFF) ||   // CJK Unified Ideographs
            (code >= 0x3000 && code <= 0x303F) ||   // CJK Symbols and Punctuation
            (code >= 0xFF00 && code <= 0xFFEF) ||   // Halfwidth and Fullwidth Forms
            (code >= 0x3040 && code <= 0x309F) ||   // Hiragana
            (code >= 0x30A0 && code <= 0x30FF) ||   // Katakana
            (code >= 0xAC00 && code <= 0xD7AF)      // Hangul Syllables
        ) {
            width += 2;
        } else {
            width += 1;
        }
    }
    return width;
};

/**
 * 格式化菜单选项
 */
export const menuItem = (label, isSelected = false, prefix = '') => {
    const indicator = isSelected ? symbols.selected : symbols.unselected;
    const text = isSelected ? colors.text(label) : colors.textDim(label);
    return `  ${prefix}${indicator} ${text}`;
};

/**
 * 格式化状态标签
 */
export const statusBadge = (status, text) => {
    const badges = {
        success: colors.success(`[${symbols.success}] ${text}`),
        error: colors.error(`[${symbols.error}] ${text}`),
        warning: colors.warning(`[${symbols.warning}] ${text}`),
        info: colors.info(`[${symbols.info}] ${text}`),
        pending: colors.textDim(`[${symbols.pending}] ${text}`),
    };
    return badges[status] || colors.textDim(`[ ] ${text}`);
};

/**
 * 格式化 HTTP 状态码徽章
 * @param {number|string} statusCode - HTTP 状态码
 * @param {string} customText - 自定义文本（可选）
 * @returns {string} 格式化后的状态码徽章
 */
export const statusCodeBadge = (statusCode, customText = '') => {
    // 状态码文本映射
    const statusTexts = {
        200: 'OK',
        201: 'Created',
        204: 'No Content',
        301: 'Moved Permanently',
        302: 'Found',
        304: 'Not Modified',
        400: 'Bad Request',
        401: 'Unauthorized',
        403: 'Forbidden',
        404: 'Not Found',
        405: 'Method Not Allowed',
        408: 'Request Timeout',
        429: 'Too Many Requests',
        500: 'Internal Server Error',
        502: 'Bad Gateway',
        503: 'Service Unavailable',
        504: 'Gateway Timeout',
    };

    // 处理特殊状态码（字符串类型）
    if (!statusCode || statusCode === 'N/A') {
        return colors.textMuted(`[${symbols.pending}] N/A`);
    }

    if (statusCode === 'ERROR') {
        return colors.error(`[${symbols.error}] Network Error`);
    }

    if (statusCode === 'TIMEOUT') {
        return colors.error(`[${symbols.error}] Timeout`);
    }

    // 尝试解析为数字
    const code = parseInt(statusCode);

    // 如果解析失败，返回原始值
    if (isNaN(code)) {
        return colors.textMuted(`[${symbols.pending}] ${statusCode}`);
    }

    const text = customText || statusTexts[code] || 'Unknown';

    // 根据状态码范围选择颜色和符号
    if (code >= 200 && code < 300) {
        // 2xx - 成功
        return colors.success(`[${symbols.success}] ${code} ${text}`);
    } else if (code >= 300 && code < 400) {
        // 3xx - 重定向
        return colors.info(`[${symbols.info}] ${code} ${text}`);
    } else if (code >= 400 && code < 500) {
        // 4xx - 客户端错误
        return colors.warning(`[${symbols.warning}] ${code} ${text}`);
    } else if (code >= 500 && code < 600) {
        // 5xx - 服务器错误
        return colors.error(`[${symbols.error}] ${code} ${text}`);
    } else {
        // 未知状态码
        return colors.textMuted(`[${symbols.pending}] ${code} ${text}`);
    }
};

/**
 * 创建进度指示
 */
export const progress = (current, total, width = 20) => {
    const percent = Math.min(1, current / total);
    const filled = Math.round(width * percent);
    const empty = width - filled;
    const bar = colors.primary('█'.repeat(filled)) + colors.textMuted('░'.repeat(empty));
    const percentText = colors.textDim(`${Math.round(percent * 100)}%`);
    return `${bar} ${percentText}`;
};

/**
 * 格式化键值对（固定宽度输出）
 */
export const keyValue = (key, value, keyWidth = 12) => {
    const keyDisplayWidth = getDisplayWidth(key);
    const paddedKey = key + ' '.repeat(Math.max(0, keyWidth - keyDisplayWidth));
    return `${colors.textDim(paddedKey)}${value}`;
};

/**
 * 创建 ASCII Logo
 */
export const logo = () => {
    const lines = [
        '  ██████╗ ██████╗    ██╗  ██╗███████╗██╗     ██████╗ ███████╗██████╗ ',
        ' ██╔════╝██╔════╝    ██║  ██║██╔════╝██║     ██╔══██╗██╔════╝██╔══██╗',
        ' ██║     ██║         ███████║█████╗  ██║     ██████╔╝█████╗  ██████╔╝',
        ' ██║     ██║         ██╔══██║██╔══╝  ██║     ██╔═══╝ ██╔══╝  ██╔══██╗',
        ' ╚██████╗╚██████╗    ██║  ██║███████╗███████╗██║     ███████╗██║  ██║',
        '  ╚═════╝ ╚═════╝    ╚═╝  ╚═╝╚══════╝╚══════╝╚═╝     ╚══════╝╚═╝  ╚═╝',
    ];
    return lines.map(line => colors.primary(line)).join('\n');
};

/**
 * 创建简化 Logo
 */
export const logoSmall = () => {
    return colors.primaryBold('CC Helper') + colors.textDim(' v1.1.0');
};

/**
 * 创建表格（自定义渲染，支持中文对齐）
 * @param {Array<Object>} data - 数据数组，每个对象的 key 为列名
 * @param {Object} options - 配置选项
 * @param {string} options.borderStyle - 边框样式：'round' | 'single' | 'double'
 * @param {Function} options.borderColor - 边框颜色函数
 * @param {Function} options.headerColor - 表头颜色函数
 * @param {string} options.align - 对齐方式：'left' | 'center' | 'right'
 * @returns {string} 渲染后的表格字符串
 */
export const table = (data, options = {}) => {
    if (!data || data.length === 0) {
        return colors.textMuted('(No data)');
    }

    const {
        borderStyle = 'round',
        borderColor = colors.primary,
        headerColor = colors.primaryBold,
        align = 'left',
    } = options;

    const border = borders[borderStyle] || borders.round;
    const bc = typeof borderColor === 'function' ? borderColor : colors.primary;

    // 提取列名（从第一行数据）
    const columns = Object.keys(data[0]);

    // 计算每列的最大宽度
    const columnWidths = {};
    columns.forEach(col => {
        // 表头宽度
        let maxWidth = getDisplayWidth(col);
        // 数据行宽度
        data.forEach(row => {
            const cellValue = String(row[col] || '');
            const cellWidth = getDisplayWidth(cellValue);
            if (cellWidth > maxWidth) {
                maxWidth = cellWidth;
            }
        });
        columnWidths[col] = maxWidth;
    });

    // 辅助函数：根据对齐方式填充空格
    const padCell = (content, width, alignment = align) => {
        const contentWidth = getDisplayWidth(content);
        const padding = Math.max(0, width - contentWidth);

        if (alignment === 'center') {
            const leftPad = Math.floor(padding / 2);
            const rightPad = padding - leftPad;
            return ' '.repeat(leftPad) + content + ' '.repeat(rightPad);
        } else if (alignment === 'right') {
            return ' '.repeat(padding) + content;
        } else {
            return content + ' '.repeat(padding);
        }
    };

    // 构建表格
    const result = [];

    // 计算总宽度
    const totalWidth = columns.reduce((sum, col) => sum + columnWidths[col], 0) + columns.length * 3 + 1;

    // 顶部边框
    result.push(bc(border.topLeft + border.horizontal.repeat(totalWidth - 2) + border.topRight));

    // 表头行
    const headerCells = columns.map(col => padCell(headerColor(col), columnWidths[col], 'center'));
    result.push(bc(border.vertical) + ' ' + headerCells.join(bc(' ' + border.vertical + ' ')) + ' ' + bc(border.vertical));

    // 表头分隔线
    const separatorParts = columns.map(col => border.horizontal.repeat(columnWidths[col] + 2));
    result.push(bc(border.vertical + separatorParts.join(border.vertical) + border.vertical));

    // 数据行
    data.forEach(row => {
        const cells = columns.map(col => {
            const cellValue = String(row[col] || '');
            return padCell(cellValue, columnWidths[col]);
        });
        result.push(bc(border.vertical) + ' ' + cells.join(bc(' ' + border.vertical + ' ')) + ' ' + bc(border.vertical));
    });

    // 底部边框
    result.push(bc(border.bottomLeft + border.horizontal.repeat(totalWidth - 2) + border.bottomRight));

    return result.join('\n');
};

export default {
    colors,
    symbols,
    borders,
    divider,
    title,
    box,
    stripAnsi,
    getDisplayWidth,
    menuItem,
    statusBadge,
    statusCodeBadge,
    progress,
    keyValue,
    logo,
    logoSmall,
    table,
};
