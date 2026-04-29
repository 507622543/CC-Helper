#!/usr/bin/env python3
"""
Migrate local cc-helper configuration into CC Switch.

This script is intentionally local-only and idempotent:
- backs up CC Switch and Claude live config files before writing
- upserts deterministic provider/prompt/skill IDs
- never prints API keys or tokens
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import sqlite3
import time
from pathlib import Path
from urllib.parse import urlparse


PROVIDER_ENV_KEYS = {
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "CLAUDE_BASE_URL",
    "CLAUDE_API_KEY",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_MODEL",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
    "CLAUDE_CODE_ATTRIBUTION_HEADER",
}


def home() -> Path:
    return Path.home()


def now_ms() -> int:
    return int(time.time() * 1000)


def read_json(path: Path, default):
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8-sig") as f:
        return json.load(f)


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + f".tmp.{time.time_ns()}")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    if path.exists():
        path.unlink()
    tmp.replace(path)


def backup_file(path: Path, backup_dir: Path) -> None:
    if path.exists():
        backup_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, backup_dir / path.name)


def sanitize_id(value: str, fallback: str = "profile") -> str:
    text = value.strip().lower()
    text = re.sub(r"[^a-z0-9_-]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-_")
    return text[:40] or fallback


def short_hash(*parts: str) -> str:
    h = hashlib.sha1()
    for part in parts:
        h.update(part.encode("utf-8", errors="ignore"))
        h.update(b"\0")
    return h.hexdigest()[:10]


def infer_website(url: str | None) -> str | None:
    if not url:
        return None
    parsed = urlparse(url)
    if parsed.scheme and parsed.netloc:
        return f"{parsed.scheme}://{parsed.netloc}"
    return None


def is_official_anthropic(url: str | None) -> bool:
    return bool(url and "api.anthropic.com" in url)


def build_provider(profile: dict, sort_index: int, default_models: dict[str, str]) -> tuple[str, dict]:
    name = str(profile.get("name") or "unnamed")
    url = str(profile.get("url") or "").rstrip("/")
    fmt = profile.get("format") or "anthropic"
    provider_id = f"cchelper-{sanitize_id(name)}-{short_hash(name, url)}"

    env: dict[str, str] = {}
    if url:
        env["ANTHROPIC_BASE_URL"] = url
        env["CLAUDE_BASE_URL"] = url

    key = profile.get("key")
    oauth = profile.get("oauth")
    if isinstance(oauth, dict):
        token = oauth.get("accessToken") or ""
        if token:
            env["ANTHROPIC_AUTH_TOKEN"] = token
            env["ANTHROPIC_API_KEY"] = token
            env["CLAUDE_API_KEY"] = token
    elif key:
        env["ANTHROPIC_AUTH_TOKEN"] = str(key)
        env["ANTHROPIC_API_KEY"] = str(key)
        env["CLAUDE_API_KEY"] = str(key)

    if profile.get("model"):
        env["ANTHROPIC_MODEL"] = str(profile["model"])
    for k, v in default_models.items():
        env.setdefault(k, v)

    if url and not is_official_anthropic(url):
        env["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"] = "1"
        env["CLAUDE_CODE_ATTRIBUTION_HEADER"] = "0"

    meta: dict = {
        "providerType": "cc-helper-import",
        "apiKeyField": "ANTHROPIC_AUTH_TOKEN",
        "commonConfigEnabled": True,
    }
    if fmt == "openai-compat":
        meta["apiFormat"] = "openai_chat"
    else:
        meta["apiFormat"] = "anthropic"

    note_bits = [f"Imported from cc-helper profile '{name}'", f"format={fmt}"]
    if isinstance(oauth, dict):
        expires = oauth.get("expiresAt")
        note_bits.append("oauth snapshot imported; refresh is not managed by CC Switch")
        if isinstance(expires, int) and expires < now_ms():
            note_bits.append("oauth access token appears expired")
    if fmt == "openai-compat":
        note_bits.append("requires CC Switch Local Routing/proxy for Anthropic-to-OpenAI conversion")

    provider = {
        "id": provider_id,
        "name": name,
        "settings_config": {"env": env},
        "website_url": infer_website(url),
        "category": "aggregator" if url and not is_official_anthropic(url) else "official",
        "created_at": now_ms(),
        "sort_index": sort_index,
        "notes": "; ".join(note_bits),
        "icon": "anthropic",
        "icon_color": "#D4915D",
        "meta": meta,
        "in_failover_queue": False,
    }
    return provider_id, provider


def strip_provider_env(settings: dict) -> dict:
    cleaned = json.loads(json.dumps(settings, ensure_ascii=False))
    env = cleaned.get("env")
    if isinstance(env, dict):
        for key in PROVIDER_ENV_KEYS:
            env.pop(key, None)
        if not env:
            cleaned.pop("env", None)
    return cleaned


def merge_settings(base: dict, provider_settings: dict) -> dict:
    merged = json.loads(json.dumps(base, ensure_ascii=False))
    provider_env = provider_settings.get("env", {})
    if provider_env:
        env = merged.setdefault("env", {})
        if isinstance(env, dict):
            env.update(provider_env)
    return merged


def ensure_column(con: sqlite3.Connection, table: str, column: str, ddl: str) -> None:
    rows = con.execute(f"PRAGMA table_info({table})").fetchall()
    if column not in {row[1] for row in rows}:
        con.execute(f"ALTER TABLE {table} ADD COLUMN {ddl}")


def ensure_compatible_schema(con: sqlite3.Connection) -> None:
    ensure_column(
        con,
        "providers",
        "in_failover_queue",
        "in_failover_queue BOOLEAN NOT NULL DEFAULT 0",
    )
    ensure_column(
        con,
        "mcp_servers",
        "enabled_opencode",
        "enabled_opencode BOOLEAN NOT NULL DEFAULT 0",
    )
    ensure_column(
        con,
        "mcp_servers",
        "enabled_hermes",
        "enabled_hermes BOOLEAN NOT NULL DEFAULT 0",
    )
    ensure_column(
        con,
        "skills",
        "enabled_hermes",
        "enabled_hermes BOOLEAN NOT NULL DEFAULT 0",
    )
    ensure_column(
        con,
        "skills",
        "updated_at",
        "updated_at INTEGER NOT NULL DEFAULT 0",
    )
    ensure_column(
        con,
        "skills",
        "content_hash",
        "content_hash TEXT",
    )


def prompt_files() -> list[Path]:
    roots = [
        home() / ".claude" / ".ccg" / "prompts" / "claude",
        home() / ".claude",
    ]
    files: list[Path] = []
    seen: set[Path] = set()
    for root in roots:
        if not root.exists():
            continue
        for path in sorted(root.glob("*.md")):
            if path.name.lower() == "readme.md":
                continue
            resolved = path.resolve()
            if resolved not in seen:
                files.append(path)
                seen.add(resolved)
    return files


def skill_dirs() -> list[Path]:
    roots = [home() / ".agents" / "skills", home() / ".claude" / "skills"]
    dirs: list[Path] = []
    seen: set[str] = set()
    for root in roots:
        if not root.exists():
            continue
        for skill_md in sorted(root.glob("*/SKILL.md")):
            d = skill_md.parent
            key = d.name.lower()
            if key not in seen:
                dirs.append(d)
                seen.add(key)
    return dirs


def parse_skill(path: Path) -> tuple[str, str]:
    name = path.name
    description = ""
    skill_md = path / "SKILL.md"
    try:
        text = skill_md.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return name, description
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            title = stripped.lstrip("#").strip()
            if title:
                name = title
                break
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.lower().startswith("description:"):
            description = stripped.split(":", 1)[1].strip()
            break
    if not description:
        for line in text.splitlines():
            stripped = line.strip()
            if stripped and not stripped.startswith("#"):
                description = stripped[:300]
                break
    return name, description


def hash_dir(path: Path) -> str:
    h = hashlib.sha256()
    for file in sorted(p for p in path.rglob("*") if p.is_file()):
        try:
            rel = file.relative_to(path).as_posix()
            h.update(rel.encode("utf-8"))
            h.update(file.read_bytes())
        except OSError:
            continue
    return h.hexdigest()


def main() -> None:
    appdata = Path(os.environ["APPDATA"])
    cc_helper_config = appdata / "cc-helper-nodejs" / "Config" / "config.json"
    cc_switch_dir = home() / ".cc-switch"
    cc_switch_db = cc_switch_dir / "cc-switch.db"
    cc_switch_settings = cc_switch_dir / "settings.json"
    claude_settings = home() / ".claude" / "settings.json"
    claude_local_settings = home() / ".claude" / "settings.local.json"

    if not cc_helper_config.exists():
        raise SystemExit(f"cc-helper config not found: {cc_helper_config}")
    if not cc_switch_db.exists():
        raise SystemExit(f"CC Switch database not found: {cc_switch_db}")

    stamp = time.strftime("%Y%m%d-%H%M%S")
    backup_dir = cc_switch_dir / f"migration-backup-{stamp}"
    for path in [cc_switch_db, cc_switch_settings, claude_settings, claude_local_settings]:
        backup_file(path, backup_dir)

    cfg = read_json(cc_helper_config, {})
    profiles = cfg.get("profiles") or []
    active_name = cfg.get("activeProfile")

    local_settings = read_json(claude_local_settings, {})
    local_env = local_settings.get("env") if isinstance(local_settings, dict) else {}
    default_models = {}
    if isinstance(local_env, dict):
        for key in [
            "ANTHROPIC_DEFAULT_HAIKU_MODEL",
            "ANTHROPIC_DEFAULT_OPUS_MODEL",
            "ANTHROPIC_DEFAULT_SONNET_MODEL",
        ]:
            if local_env.get(key):
                default_models[key] = str(local_env[key])

    providers = []
    active_provider_id = None
    for i, profile in enumerate(profiles):
        provider_id, provider = build_provider(profile, 10000 + i, default_models)
        providers.append((profile, provider_id, provider))
        if profile.get("name") == active_name:
            active_provider_id = provider_id

    con = sqlite3.connect(cc_switch_db)
    try:
        con.execute("PRAGMA foreign_keys = ON")
        ensure_compatible_schema(con)
        with con:
            con.execute("UPDATE providers SET is_current = 0 WHERE app_type = 'claude'")
            for profile, provider_id, provider in providers:
                con.execute(
                    """
                    INSERT OR REPLACE INTO providers
                    (id, app_type, name, settings_config, website_url, category,
                     created_at, sort_index, notes, icon, icon_color, meta,
                     is_current, in_failover_queue)
                    VALUES (?, 'claude', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        provider_id,
                        provider["name"],
                        json.dumps(provider["settings_config"], ensure_ascii=False),
                        provider["website_url"],
                        provider["category"],
                        provider["created_at"],
                        provider["sort_index"],
                        provider["notes"],
                        provider["icon"],
                        provider["icon_color"],
                        json.dumps(provider["meta"], ensure_ascii=False),
                        1 if provider_id == active_provider_id else 0,
                        0,
                    ),
                )

            common_config = strip_provider_env(read_json(claude_settings, {}))
            con.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                ("common_config_claude", json.dumps(common_config, ensure_ascii=False, indent=2)),
            )
            con.execute("DELETE FROM settings WHERE key = 'common_config_claude_cleared'")

            imported_prompts = 0
            for path in prompt_files():
                content = path.read_text(encoding="utf-8", errors="replace")
                prompt_id = f"cchelper-prompt-{short_hash(str(path), content)}"
                ts = int(path.stat().st_mtime)
                con.execute(
                    """
                    INSERT OR REPLACE INTO prompts
                    (id, app_type, name, content, description, enabled, created_at, updated_at)
                    VALUES (?, 'claude', ?, ?, ?, 0, ?, ?)
                    """,
                    (
                        prompt_id,
                        path.stem,
                        content,
                        f"Imported from {path}",
                        ts,
                        ts,
                    ),
                )
                imported_prompts += 1

            imported_skills = 0
            for d in skill_dirs():
                name, description = parse_skill(d)
                skill_id = f"local:{d.name}"
                ts = int((d / "SKILL.md").stat().st_mtime)
                con.execute(
                    """
                    INSERT OR REPLACE INTO skills
                    (id, name, description, directory, repo_owner, repo_name, repo_branch,
                     readme_url, enabled_claude, enabled_codex, enabled_gemini,
                     enabled_opencode, enabled_hermes, installed_at, content_hash, updated_at)
                    VALUES (?, ?, ?, ?, NULL, NULL, 'main', NULL, 1, 0, 0, 0, 0, ?, ?, ?)
                    """,
                    (skill_id, name, description, d.name, ts, hash_dir(d), ts),
                )
                imported_skills += 1

            mcp_config = read_json(home() / ".claude.json", {})
            mcp_servers = mcp_config.get("mcpServers")
            imported_mcp = 0
            if isinstance(mcp_servers, dict):
                for server_id, server in sorted(mcp_servers.items()):
                    if not isinstance(server, dict):
                        continue
                    con.execute(
                        """
                        INSERT OR REPLACE INTO mcp_servers
                        (id, name, server_config, description, homepage, docs, tags,
                         enabled_claude, enabled_codex, enabled_gemini,
                         enabled_opencode, enabled_hermes)
                        VALUES (?, ?, ?, ?, NULL, NULL, '[]', 1, 0, 0, 0, 0)
                        """,
                        (
                            f"cchelper-{sanitize_id(server_id, 'mcp')}",
                            server_id,
                            json.dumps(server, ensure_ascii=False),
                            "Imported from ~/.claude.json",
                        ),
                    )
                    imported_mcp += 1
    finally:
        con.close()

    app_settings = read_json(cc_switch_settings, {})
    if active_provider_id:
        app_settings["currentProviderClaude"] = active_provider_id
    app_settings["skillStorageLocation"] = "unified"
    app_settings.setdefault("skillSyncMethod", "auto")
    write_json(cc_switch_settings, app_settings)

    common_config = strip_provider_env(read_json(claude_settings, {}))
    active_provider = next((p for _, pid, p in providers if pid == active_provider_id), None)
    if active_provider:
        write_json(claude_settings, merge_settings(common_config, active_provider["settings_config"]))

    if claude_local_settings.exists():
        cleaned_local = strip_provider_env(read_json(claude_local_settings, {}))
        if cleaned_local:
            write_json(claude_local_settings, cleaned_local)
        else:
            claude_local_settings.unlink()

    print(json.dumps(
        {
            "backup": str(backup_dir),
            "providers_imported": len(providers),
            "active_profile": active_name,
            "active_provider_id": active_provider_id,
            "prompts_imported": imported_prompts,
            "skills_indexed": imported_skills,
            "mcp_imported": imported_mcp,
        },
        ensure_ascii=False,
        indent=2,
    ))


if __name__ == "__main__":
    main()
