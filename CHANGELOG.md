# Changelog

## 1.2.0 - 2026-04-29

### Added

- Added CC Switch bridge commands:
  - `cchelper ccswitch status`
  - `cchelper ccswitch list`
  - `cchelper ccswitch use <provider>`
  - `cchelper ccswitch doctor`
  - `cchelper ccswitch clean`
  - `cchelper ccswitch open`
- Added interactive `CC Switch Bridge` menu.
- Added `cchelper start --ccswitch [provider]` to launch Claude Code through a CC Switch provider.
- Added CC Switch diagnostics for provider env, Claude settings, shell env conflicts, and local overrides.
- Added local-only migration helper for importing CC Helper profiles into CC Switch.
- Added MCP service management and auto-start integration.
- Added Trellis and Virtual Company menu entries.

### Changed

- Updated README for the current public GitHub version.
- Updated package repository metadata to `507622543/CC-Helper`.
- Improved `.gitignore` to avoid committing local configs, databases, backups, logs, and generated artifacts.
- Kept CC Helper profiles and CC Switch providers as separate selectable configuration sources.

### Security

- CC Switch diagnostics mask secrets.
- Provider switching backs up touched CC Switch and Claude config files before writing.
- Local Claude provider overrides can be cleaned explicitly with `cchelper ccswitch clean`.

## 1.1.0

### Added

- Real-time status line integration.
- Token and cost visibility.
- Improved profile and model selection flows.
- YOLO mode and sandbox workflows.

## 1.0.0

### Added

- Initial interactive CLI.
- Profile management.
- Claude Code launcher.
- CCG Skills integration.
- Basic status checks.
