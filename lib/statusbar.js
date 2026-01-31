import chalk from 'chalk';
import axios from 'axios';
import { t } from './i18n.js';

// ANSI escape sequences for terminal control
const ESC = '\x1b';
const SAVE_CURSOR = `${ESC}[s`;
const RESTORE_CURSOR = `${ESC}[u`;
const CLEAR_LINE = `${ESC}[2K`;
const MOVE_TO = (row, col) => `${ESC}[${row};${col}H`;
const SET_SCROLL_REGION = (top, bottom) => `${ESC}[${top};${bottom}r`;
const RESET_SCROLL_REGION = `${ESC}[r`;

class StatusBar {
    constructor() {
        this.model = 'Unknown';
        this.inputTokens = 0;
        this.outputTokens = 0;
        this.totalCost = 0.0;
        this.isActive = false;

        // API connection status
        this.apiUrl = null;
        this.connectionStatus = 'unknown'; // 'online', 'offline', 'unknown'
        this.connectionLatency = 0;
        this.connectionCheckInterval = null;

        // Status bar height (border + content + border)
        this.statusBarHeight = 3;

        // Resize handler
        this.resizeHandler = null;

        // Pricing per 1M tokens (USD)
        this.pricing = {
            'claude-opus-4': { input: 15.00, output: 75.00 },
            'claude-opus-4-5': { input: 15.00, output: 75.00 },
            'claude-sonnet-4': { input: 3.00, output: 15.00 },
            'claude-sonnet-3-5': { input: 3.00, output: 15.00 },
            'claude-haiku-3-5': { input: 0.80, output: 4.00 },
            'claude-3-5-sonnet': { input: 3.00, output: 15.00 },
            'claude-3-5-haiku': { input: 0.80, output: 4.00 },
            'claude-3-opus': { input: 15.00, output: 75.00 },
            'claude-3-sonnet': { input: 3.00, output: 15.00 },
            'claude-3-haiku': { input: 0.25, output: 1.25 }
        };
    }

    start(apiUrl) {
        this.isActive = true;
        if (apiUrl) {
            this.apiUrl = apiUrl;
            this.startConnectionCheck();
        }

        // Setup scroll region (leave space at bottom for status bar)
        this.setupScrollRegion();

        // Handle terminal resize
        this.resizeHandler = () => {
            this.setupScrollRegion();
            this.render();
        };
        process.stdout.on('resize', this.resizeHandler);

        this.render();
    }

    stop() {
        this.isActive = false;
        this.stopConnectionCheck();

        // Remove resize handler
        if (this.resizeHandler) {
            process.stdout.removeListener('resize', this.resizeHandler);
            this.resizeHandler = null;
        }

        // Clear status bar area and reset scroll region
        this.clearStatusBar();
        process.stdout.write(RESET_SCROLL_REGION);
    }

    setupScrollRegion() {
        const rows = process.stdout.rows || 24;
        // Set scroll region from row 1 to (total rows - status bar height - 1)
        const scrollBottom = Math.max(1, rows - this.statusBarHeight - 1);
        process.stdout.write(SET_SCROLL_REGION(1, scrollBottom));
    }

    clearStatusBar() {
        const rows = process.stdout.rows || 24;
        const width = process.stdout.columns || 80;

        // Save cursor, move to status bar area, clear lines, restore cursor
        process.stdout.write(SAVE_CURSOR);
        for (let i = 0; i < this.statusBarHeight; i++) {
            const row = rows - this.statusBarHeight + i;
            process.stdout.write(MOVE_TO(row, 1) + CLEAR_LINE);
        }
        process.stdout.write(RESTORE_CURSOR);
    }

    updateModel(model) {
        this.model = model;
        this.render();
    }

    updateTokens(inputTokens, outputTokens) {
        this.inputTokens += inputTokens;
        this.outputTokens += outputTokens;
        this.calculateCost();
        this.render();
    }

    calculateCost() {
        // Find matching pricing
        let pricing = null;
        for (const [key, value] of Object.entries(this.pricing)) {
            if (this.model.toLowerCase().includes(key)) {
                pricing = value;
                break;
            }
        }

        if (pricing) {
            const inputCost = (this.inputTokens / 1000000) * pricing.input;
            const outputCost = (this.outputTokens / 1000000) * pricing.output;
            this.totalCost = inputCost + outputCost;
        }
    }

    startConnectionCheck() {
        // Check immediately, then every 5 seconds
        this.checkConnection();
        this.connectionCheckInterval = setInterval(() => {
            this.checkConnection();
        }, 5000);
    }

    stopConnectionCheck() {
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
            this.connectionCheckInterval = null;
        }
    }

    async checkConnection() {
        if (!this.apiUrl) {
            this.connectionStatus = 'unknown';
            return;
        }
        try {
            const start = Date.now();
            await axios.get(this.apiUrl, {
                timeout: 4000,
                validateStatus: () => true
            });
            this.connectionLatency = Date.now() - start;
            this.connectionStatus = 'online';
        } catch {
            this.connectionStatus = 'offline';
            this.connectionLatency = 0;
        }
        this.render();
    }

    parseLogLine(line) {
        // Try to extract model information
        const modelMatch = line.match(/model[:\s]+([a-z0-9\-\.]+)/i);
        if (modelMatch) {
            this.updateModel(modelMatch[1]);
        }

        // Try to extract token usage from various formats
        // Format 1: "input_tokens: 1234, output_tokens: 5678"
        const tokenMatch1 = line.match(/input_tokens[:\s]+(\d+).*output_tokens[:\s]+(\d+)/i);
        if (tokenMatch1) {
            this.updateTokens(parseInt(tokenMatch1[1]), parseInt(tokenMatch1[2]));
            return;
        }

        // Format 2: "tokens: 1234 in, 5678 out"
        const tokenMatch2 = line.match(/tokens[:\s]+(\d+)\s+in.*?(\d+)\s+out/i);
        if (tokenMatch2) {
            this.updateTokens(parseInt(tokenMatch2[1]), parseInt(tokenMatch2[2]));
            return;
        }

        // Format 3: "Input: 1234 | Output: 5678"
        const tokenMatch3 = line.match(/input[:\s]+(\d+).*output[:\s]+(\d+)/i);
        if (tokenMatch3) {
            this.updateTokens(parseInt(tokenMatch3[1]), parseInt(tokenMatch3[2]));
            return;
        }

        // Format 4: JSON format
        try {
            const jsonMatch = line.match(/\{[^}]*"input_tokens"[^}]*\}/);
            if (jsonMatch) {
                const data = JSON.parse(jsonMatch[0]);
                if (data.input_tokens && data.output_tokens) {
                    this.updateTokens(data.input_tokens, data.output_tokens);
                }
            }
        } catch (e) {
            // Not JSON, ignore
        }
    }

    formatNumber(num) {
        return num.toLocaleString('en-US');
    }

    formatCost(cost) {
        return cost.toFixed(4);
    }

    render() {
        if (!this.isActive) return;

        const rows = process.stdout.rows || 24;
        const width = process.stdout.columns || 80;
        const totalTokens = this.inputTokens + this.outputTokens;

        // Build status line
        const statusLabel = this.connectionStatus === 'online'
            ? chalk.green(`● Online (${this.connectionLatency}ms)`)
            : this.connectionStatus === 'offline'
              ? chalk.red('● Offline')
              : chalk.gray('● Unknown');

        const parts = [
            `${t('statusBar.model')}: ${chalk.cyan(this.model)}`,
            `${t('statusBar.input')}: ${chalk.green(this.formatNumber(this.inputTokens))}`,
            `${t('statusBar.output')}: ${chalk.yellow(this.formatNumber(this.outputTokens))}`,
            `${t('statusBar.total')}: ${chalk.white(this.formatNumber(totalTokens))}`,
            `${t('statusBar.cost')}: ${chalk.magenta('$' + this.formatCost(this.totalCost))}`,
            `API: ${statusLabel}`
        ];

        const content = parts.join(chalk.gray(' | '));

        // Create border
        const topBorder = chalk.gray('┌' + '─'.repeat(Math.max(0, width - 2)) + '┐');
        const bottomBorder = chalk.gray('└' + '─'.repeat(Math.max(0, width - 2)) + '┘');

        // Pad content to fit width
        const contentLength = this.stripAnsi(content).length;
        const padding = Math.max(0, width - contentLength - 4);
        const paddedContent = chalk.gray('│ ') + content + ' '.repeat(padding) + chalk.gray(' │');

        // Calculate status bar start row (fixed at bottom)
        const startRow = rows - this.statusBarHeight;

        // Save cursor, draw status bar at fixed position, restore cursor
        process.stdout.write(SAVE_CURSOR);
        process.stdout.write(MOVE_TO(startRow, 1) + CLEAR_LINE + topBorder);
        process.stdout.write(MOVE_TO(startRow + 1, 1) + CLEAR_LINE + paddedContent);
        process.stdout.write(MOVE_TO(startRow + 2, 1) + CLEAR_LINE + bottomBorder);
        process.stdout.write(RESTORE_CURSOR);
    }

    getTerminalWidth() {
        return process.stdout.columns || 80;
    }

    stripAnsi(str) {
        // Remove ANSI escape codes for length calculation
        return str.replace(/\x1b\[[0-9;]*m/g, '');
    }

    reset() {
        this.inputTokens = 0;
        this.outputTokens = 0;
        this.totalCost = 0.0;
        this.model = 'Unknown';
        this.render();
    }
}

export default StatusBar;
