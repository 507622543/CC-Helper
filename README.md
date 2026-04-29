# CC Helper

CC Helper is a Claude Code companion CLI for managing API profiles, starting Claude Code with session-isolated settings, installing CCG skills, and bridging local configuration into CC Switch.

[![Version](https://img.shields.io/badge/version-1.2.0-blue.svg)](https://github.com/507622543/CC-Helper)
[![Node](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-ISC-green.svg)](LICENSE)

## Features

- Interactive CLI dashboard for Claude Code workflows.
- Multiple profile management with API URL, key, endpoint format, and model selection.
- CC Switch bridge for provider listing, switching, diagnostics, and Claude startup.
- Session-isolated Claude settings through project-level `.claude/settings.local.json`.
- Anthropic-format and OpenAI-compatible endpoint support through a local adapter proxy.
- CCG Skills installation and role prompt selection.
- MCP service management with automatic startup for configured local services.
- YOLO mode for Docker or temporary-directory sandbox execution.
- Virtual Company and Trellis experimental multi-agent workflows.
- Status line integration for model, token, and cost visibility.
- English and Simplified Chinese interface support.

## Installation

### Requirements

- Node.js >= 14.0.0
- npm >= 6.0.0
- Claude Code CLI installed and available as `claude`
- Optional: CC Switch, Docker, and Python for the matching features

### Install From Source

```bash
git clone https://github.com/507622543/CC-Helper.git
cd CC-Helper
npm install
npm install -g .
```

For development:

```bash
npm link
```

Verify:

```bash
cchelper --version
cchelper --help
```

The short alias `cc` is also registered.

## Quick Start

Interactive mode:

```bash
cchelper
```

Common commands:

```bash
cchelper profile
cchelper status
cchelper start
cchelper start --role developer
cchelper start --model claude-opus-4-5
cchelper yolo
cchelper mcp list
cchelper ccg install
```

## CC Switch Bridge

CC Helper can keep its original profile system while also operating through CC Switch providers.

```bash
cchelper ccswitch
cchelper ccswitch status
cchelper ccswitch list
cchelper ccswitch use <provider-name-or-id>
cchelper ccswitch doctor
cchelper ccswitch clean
cchelper ccswitch open
```

Start Claude Code with a CC Switch provider:

```bash
cchelper start --ccswitch
cchelper start --ccswitch <provider-name-or-id>
```

What the bridge does:

- Reads providers from the local CC Switch database.
- Switches the active Claude provider in CC Switch.
- Syncs the selected provider into Claude settings when needed.
- Backs up touched CC Switch and Claude config files before writing.
- Cleans provider-specific overrides from `~/.claude/settings.local.json`.
- Diagnoses shell environment variables that may override the selected provider.

Manual CC Switch mapping:

| CC Helper profile field | CC Switch provider field |
| --- | --- |
| `name` | Provider name |
| `url` | `ANTHROPIC_BASE_URL` / `CLAUDE_BASE_URL` |
| `key` | `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, or `CLAUDE_API_KEY` |
| `format: anthropic` | API format `anthropic` |
| `format: openai-compat` | API format `openai_chat` |
| model override | `ANTHROPIC_MODEL` or default model env fields |

For OpenAI-compatible endpoints, enable the relevant CC Switch proxy/routing mode before using them with Claude Code.

## Profiles

Profiles are stored by the `conf` package:

- Windows: `%APPDATA%\cc-helper-nodejs\Config\config.json`
- macOS/Linux: `~/.config/cc-helper-nodejs/config.json`

Example profile shape:

```json
{
  "profiles": [
    {
      "name": "Example",
      "url": "https://api.example.com",
      "key": "<your-api-key>",
      "format": "anthropic"
    }
  ],
  "activeProfile": "Example"
}
```

Do not commit real profile config files or API keys.

## MCP Services

```bash
cchelper mcp list
cchelper mcp add
cchelper mcp remove --name web-search
```

Configured MCP services are started automatically before Claude Code launches and are injected into the project-level Claude settings for that session.

## YOLO Mode

```bash
cchelper yolo
cchelper yolo --status
cchelper yolo --on
cchelper yolo --off
```

YOLO mode is intended for isolated experimentation. Prefer Docker mode when available.

## Local Migration From CC Helper To CC Switch

The repository includes a local-only helper:

```bash
python migrate-cchelper-to-ccswitch.py
```

It imports local CC Helper profiles, prompts, skills, and MCP services into CC Switch. The script is designed to avoid printing secrets and to create backups before writing.

## Security And Privacy

- API keys and OAuth tokens must stay in local config only.
- Do not commit `.claude/`, `.cc-switch/`, `.env`, database files, backups, logs, or generated web build output.
- `cchelper ccswitch doctor` masks secrets and reports only whether provider-related variables are present or conflicting.
- `cchelper ccswitch clean` removes provider-specific env overrides from Claude local settings after confirmation.

## Project Structure

```text
CC-Helper/
  index.js                         CLI entry and interactive menu
  package.json                     npm package metadata
  migrate-cchelper-to-ccswitch.py  local migration helper
  lib/
    profile.js                     profile CRUD and Claude settings sync
    runner.js                      Claude Code launcher
    ccswitch.js                    CC Switch bridge
    adapter-proxy.js               Anthropic-to-OpenAI adapter proxy
    mcp-manager.js                 MCP service management
    yolo.js                        sandbox workflows
    yolo-toggle.js                 YOLO toggle state
    statusline.js                  Claude statusLine integration
    virtual-company.js             experimental multi-agent menu
    trellis.js                     experimental Trellis workflow
    i18n.js                        language support
    theme.js                       terminal rendering helpers
```

## Troubleshooting

Claude Code cannot find the right API key:

```bash
cchelper ccswitch doctor
cchelper ccswitch clean
cchelper ccswitch use <provider-name-or-id>
```

Command not found:

```bash
npm install -g .
npm config get prefix
```

Claude Code not found:

```bash
claude --version
```

Connection failed:

```bash
cchelper status
cchelper ccswitch status
```

## Development

```bash
npm install
npm link
node --check index.js
node --check lib/runner.js
node --check lib/ccswitch.js
```

## License

ISC

## Related Links

- [Claude Code](https://github.com/anthropics/claude-code)
- [CC Switch](https://github.com/farion1231/cc-switch)
- [CCG Skills](https://github.com/dkjsiogu/ccg-skills)
