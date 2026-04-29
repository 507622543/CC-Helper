import net from 'net';
import { spawn } from 'child_process';
import Conf from 'conf';
import chalk from 'chalk';

const config = new Conf({ projectName: 'cc-helper' });

const CONF_KEY = 'mcpServices';

// --- Config CRUD ---

/**
 * Returns all configured MCP services.
 * @returns {{ name: string, installPath: string, port: number, startCmd: string }[]}
 */
export const getMcpServices = () => config.get(CONF_KEY, []);

/**
 * Adds a new MCP service config. Throws if name already exists.
 */
export const addMcpService = (service) => {
    const list = getMcpServices();
    if (list.find(s => s.name === service.name)) {
        throw new Error(`MCP service "${service.name}" already exists`);
    }
    list.push(service);
    config.set(CONF_KEY, list);
};

/**
 * Removes a MCP service config by name. Throws if not found.
 */
export const removeMcpService = (name) => {
    const list = getMcpServices();
    const filtered = list.filter(s => s.name !== name);
    if (filtered.length === list.length) {
        throw new Error(`MCP service "${name}" not found`);
    }
    config.set(CONF_KEY, filtered);
};

// --- Port Utilities ---

/**
 * Checks if a TCP port is already in use.
 * @param {number} port
 * @returns {Promise<boolean>}
 */
export const checkPortInUse = (port) => {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', (err) => {
            resolve(err.code === 'EADDRINUSE');
        });
        server.once('listening', () => {
            server.close(() => resolve(false));
        });
        server.listen(port, '127.0.0.1');
    });
};

/**
 * Polls until the port is accepting connections or timeout is reached.
 * @param {number} port
 * @param {number} timeoutMs
 * @returns {Promise<boolean>} true if port became available, false on timeout
 */
export const waitForPort = (port, timeoutMs = 15000) => {
    return new Promise((resolve) => {
        const deadline = Date.now() + timeoutMs;
        const tryConnect = () => {
            const sock = new net.Socket();
            sock.setTimeout(500);
            sock.on('connect', () => {
                sock.destroy();
                resolve(true);
            });
            sock.on('error', () => {
                sock.destroy();
                if (Date.now() >= deadline) {
                    resolve(false);
                } else {
                    setTimeout(tryConnect, 300);
                }
            });
            sock.on('timeout', () => {
                sock.destroy();
                if (Date.now() >= deadline) {
                    resolve(false);
                } else {
                    setTimeout(tryConnect, 300);
                }
            });
            sock.connect(port, '127.0.0.1');
        };
        tryConnect();
    });
};

// --- Process Management ---

/**
 * Starts a single MCP service.
 * If the port is already in use, assumes the service is already running and skips spawn.
 *
 * @param {{ name: string, installPath: string, port: number, startCmd: string }} service
 * @returns {Promise<{ url: string, process: ChildProcess | null, alreadyRunning: boolean }>}
 */
export const startMcpService = async (service) => {
    const { name, installPath, port, startCmd } = service;
    const url = `http://127.0.0.1:${port}/mcp`;

    // Check if already running
    const inUse = await checkPortInUse(port);
    if (inUse) {
        console.log(chalk.dim(`  → MCP [${name}] already running on :${port}`));
        return { url, process: null, alreadyRunning: true };
    }

    // Parse command: first token is the executable, rest are args
    const parts = startCmd.split(/\s+/);
    const exe = parts[0];
    const args = parts.slice(1);

    console.log(chalk.dim(`  → Starting MCP [${name}]: ${startCmd}`));

    const proc = spawn(exe, args, {
        cwd: installPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        shell: process.platform === 'win32',
    });

    proc.stdout?.on('data', (d) => {
        const line = d.toString().trim();
        if (line) {
            // Only emit startup-related lines to avoid noise
            if (line.toLowerCase().includes('start') || line.toLowerCase().includes('listen') || line.toLowerCase().includes('ready')) {
                console.log(chalk.dim(`    [${name}] ${line}`));
            }
        }
    });

    proc.stderr?.on('data', (d) => {
        const line = d.toString().trim();
        if (line) console.error(chalk.yellow(`    [${name}] ${line}`));
    });

    // Wait for port to accept connections
    const ready = await waitForPort(port, 20000);
    if (ready) {
        console.log(chalk.green(`  ✓ MCP [${name}] ready at ${url}`));
    } else {
        console.log(chalk.yellow(`  △ MCP [${name}] may not be ready (port ${port} not responding after 20s)`));
    }

    return { url, process: proc, alreadyRunning: false };
};

/**
 * Stops a MCP service process.
 * @param {ChildProcess} proc
 */
export const stopMcpService = (proc) => {
    if (!proc) return;
    try {
        if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', proc.pid.toString(), '/f', '/t'], { stdio: 'ignore' });
        } else {
            proc.kill('SIGTERM');
        }
    } catch {
        // Ignore kill errors
    }
};

/**
 * Starts all configured MCP services.
 * @returns {Promise<Array<{ name: string, url: string, process: ChildProcess | null }>>}
 */
export const startAllMcpServices = async () => {
    const services = getMcpServices();
    if (services.length === 0) return [];

    console.log(chalk.dim(`\n  Starting ${services.length} MCP service(s)...`));
    const results = [];

    for (const svc of services) {
        try {
            const { url, process: proc } = await startMcpService(svc);
            results.push({ name: svc.name, url, process: proc });
        } catch (err) {
            console.error(chalk.yellow(`  △ Failed to start MCP [${svc.name}]: ${err.message}`));
        }
    }

    return results;
};
