#!/usr/bin/env node

// ============================================================
//  CC Helper - Custom Status Line for Claude Code
//  Powerline-inspired design with ANSI 256-color palette
//  No emojis. Pure typographic aesthetics.
// ============================================================

const ESC = '\x1b';
const RESET = `${ESC}[0m`;

// --- Color Palette (256-color) ---
const fg = (n) => `${ESC}[38;5;${n}m`;
const bg = (n) => `${ESC}[48;5;${n}m`;
const bold = `${ESC}[1m`;

const palette = {
    // Backgrounds
    bgDark:     bg(235),
    bgMid:      bg(237),
    bgLight:    bg(239),
    // Foregrounds
    label:      fg(245),     // muted gray for labels
    sep:        fg(240),     // separator color
    model:      fg(75),      // cool blue
    inputTk:    fg(114),     // soft green
    outputTk:   fg(221),     // warm yellow
    cost:       fg(177),     // muted magenta
    linesAdd:   fg(114),     // green
    linesDel:   fg(174),     // soft red
    ctxLow:     fg(114),     // green  (< 50%)
    ctxMid:     fg(221),     // yellow (50-80%)
    ctxHigh:    fg(203),     // red    (> 80%)
    accent:     fg(75),      // diamond accent
    dim:        fg(242),     // very dim
};

// --- Unicode Glyphs ---
const DIAMOND  = '\u25C6';   // ◆
const SEP      = '\u2502';   // │
const BAR_FULL = '\u2588';   // █
const BAR_MID  = '\u2593';   // ▓
const BAR_EMPTY = '\u2591';  // ░

// --- Helpers ---
function formatNum(n) {
    if (n == null || isNaN(n)) return '0';
    return Number(n).toLocaleString('en-US');
}

function formatCost(n) {
    if (n == null || isNaN(n)) return '0.0000';
    return Number(n).toFixed(4);
}

function ctxColor(pct) {
    if (pct >= 80) return palette.ctxHigh;
    if (pct >= 50) return palette.ctxMid;
    return palette.ctxLow;
}

function progressBar(pct, width = 10) {
    const clamped = Math.max(0, Math.min(100, pct || 0));
    const filled = Math.round((clamped / 100) * width);
    const mid = (filled < width && filled > 0) ? 1 : 0;
    const empty = width - filled - mid;
    const color = ctxColor(clamped);

    return (
        color + BAR_FULL.repeat(filled) +
        (mid ? palette.dim + BAR_MID : '') +
        palette.dim + BAR_EMPTY.repeat(empty) +
        RESET
    );
}

function buildStatusLine(data) {
    const model = data?.model?.display_name || 'Unknown';
    const cost = data?.cost?.total_cost_usd || 0;
    const linesAdded = data?.cost?.total_lines_added || 0;
    const linesRemoved = data?.cost?.total_lines_removed || 0;
    const ctx = data?.context_window || {};
    const totalIn = ctx.total_input_tokens || 0;
    const totalOut = ctx.total_output_tokens || 0;
    const usedPct = ctx.used_percentage || 0;

    const sep = `${palette.sep} ${SEP} ${RESET}`;

    const segments = [
        // Model
        `${palette.accent}${DIAMOND}${RESET} ${bold}${palette.model}${model}${RESET}`,
        // Input tokens
        `${palette.label}In${RESET} ${palette.inputTk}${formatNum(totalIn)}${RESET}`,
        // Output tokens
        `${palette.label}Out${RESET} ${palette.outputTk}${formatNum(totalOut)}${RESET}`,
        // Cost
        `${palette.cost}$${formatCost(cost)}${RESET}`,
        // Context progress bar
        `${palette.label}Ctx${RESET} ${progressBar(usedPct)} ${ctxColor(usedPct)}${Math.round(usedPct)}%${RESET}`,
    ];

    // Lines changed (only show if non-zero)
    if (linesAdded > 0 || linesRemoved > 0) {
        segments.push(
            `${palette.linesAdd}+${linesAdded}${RESET} ${palette.linesDel}-${linesRemoved}${RESET}`
        );
    }

    return ` ${segments.join(sep)} `;
}

// --- Main ---
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
    try {
        const data = JSON.parse(input);
        console.log(buildStatusLine(data));
    } catch {
        // Fallback: still output something graceful
        console.log(`${palette.dim}${DIAMOND} CC Helper${RESET}`);
    }
});
