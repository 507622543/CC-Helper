# CC Helper

A CLI helper tool for Claude Code that provides profile management, multi-model routing, real-time status bar, and CCG Skills integration.

## Features

- **Profile Management** - Manage multiple API configurations and switch between them easily
- **Real-time Status Bar** - Display model info, token usage, and cost tracking in the terminal
- **Multi-model Routing** - Route requests to different LLM backends (Anthropic, OpenAI, Claude Code)
- **CCG Skills Integration** - Install and manage CCG Skills for multi-model collaboration
- **i18n Support** - English and Chinese interface
- **Virtual Company** - Multi-agent collaboration system (experimental)
- **OpenAI Proxy** - Adapter proxy for OpenAI-compatible endpoints
- **YOLO Mode** - Docker-based sandboxed execution environment

## Installation

### Requirements

- Node.js >= 14.0.0
- npm >= 6.0.0
- Claude Code CLI installed

### Quick Install

```bash
# Clone or download the project
cd cc-helper

# Install dependencies
npm install

# Global install (recommended)
npm install -g .

# Or use npm link for development
npm link
```

### Setup Wizard

Run the setup wizard for first-time configuration:

```bash
node setup.js
```

Or on Windows:
```cmd
setup.bat
```

### Verify Installation

```bash
cchelper --version
cchelper --help
```

## Usage

### Interactive Mode (Recommended)

```bash
cchelper
# or
cc
```

This opens the main menu where you can:
- Start Claude Code with active profile
- Manage profiles
- Install CCG Skills
- View connection status
- Change language settings
- Access Virtual Company features

### Command Line Mode

```bash
# Manage profiles
cchelper profile

# View status
cchelper status

# Start Claude Code
cchelper start

# Start with a specific role
cchelper start --role developer

# Install CCG Skills
cchelper ccg install

# Start in YOLO mode (Docker sandbox)
cchelper yolo
```

## Project Structure

```
cc-helper/
├── index.js                    # Main entry, CLI and interactive menu
├── package.json                # Project configuration
│
├── lib/                        # Core modules
│   ├── profile.js              # Profile CRUD, sync to Claude settings
│   ├── ccg.js                  # CCG Skills installation
│   ├── runner.js               # Claude Code launcher with role injection
│   ├── statusbar.js            # Real-time status bar (token/cost tracking)
│   ├── statusline.js           # Claude Code statusLine integration
│   ├── i18n.js                 # Internationalization (zh-CN, en)
│   ├── theme.js                # Terminal colors and symbols
│   ├── model-router.js         # Multi-model LLM routing
│   ├── adapter-proxy.js        # Anthropic to OpenAI format proxy
│   ├── yolo.js                 # Docker sandbox mode
│   ├── virtual-company.js      # Multi-agent collaboration UI
│   ├── virtual-company-runtime.js  # Agent process management
│   ├── virtual-company-storage.js  # Workspace persistence
│   ├── company-planner.js      # AI company structure planning
│   └── role-prompt-writer.js   # Role prompt generation
│
├── setup.js                    # First-run setup wizard
├── setup.bat / setup.ps1       # Windows setup launchers
├── uninstall.js                # Uninstall script
├── cchelper.cmd / cchelper.ps1 # Windows launchers
├── test.bat / test.ps1         # Test scripts
└── Dockerfile.yolo             # Docker image for YOLO mode
```

## Configuration

### Profile Storage

- Windows: `%APPDATA%\cc-helper-nodejs\Config\config.json`
- macOS/Linux: `~/.config/cc-helper-nodejs/config.json`

### Profile Format

```json
{
  "profiles": [
    {
      "name": "Production",
      "url": "https://api.anthropic.com",
      "key": "sk-ant-xxxxx"
    }
  ],
  "activeProfile": "Production"
}
```

### CCG Skills Location

- Windows: `%USERPROFILE%\.claude\commands\ccg\`
- macOS/Linux: `~/.claude/commands/ccg/`

## Dependencies

- `commander` - CLI framework
- `inquirer` - Interactive prompts
- `chalk` - Terminal colors
- `boxen` - Box drawing
- `conf` - Configuration management
- `axios` - HTTP client
- `execa` - Process execution

## Troubleshooting

### Command not found

```bash
# Reinstall globally
npm install -g .

# Or check npm global path
npm config get prefix
```

### Claude Code not found

Ensure Claude Code CLI is installed:
```bash
claude --version
```

Visit https://github.com/anthropics/claude-code for installation.

### API connection failed

1. Check network connection
2. Verify API URL is correct
3. Check firewall settings
4. Use `cchelper status` to diagnose

## Development

```bash
# Install dependencies
npm install

# Link for development
npm link

# Run tests
.\test.ps1      # PowerShell
test.bat        # CMD
```

## License

ISC

## Related Links

- [Claude Code](https://github.com/anthropics/claude-code) - Anthropic's official CLI
- [CCG Skills](https://github.com/dkjsiogu/ccg-skills) - Multi-model collaboration skills
- [Anthropic API](https://docs.anthropic.com/) - API documentation
