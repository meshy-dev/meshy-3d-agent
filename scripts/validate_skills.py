#!/usr/bin/env python3
"""Validate the two independently installable CLI skills and the plugin manifests that list them."""
import argparse
import hashlib
import json
import os
import jsonschema
from pathlib import Path
import re
import shlex
import sys
import tempfile
import urllib.request
import yaml

ROOT = Path(__file__).resolve().parent.parent
SKILLS = ("meshy-3d-generation", "meshy-3d-printing")
# Cursor's schemas, fetched at a pinned commit and checked by hash. cursor/plugins has no license,
# and the repository root is the plugin package, so no copy is kept here.
CURSOR_SCHEMA_URL = "https://raw.githubusercontent.com/cursor/plugins/5229aad76c37451561c5b81a9b5072ae1c549a5b/schemas/{}.schema.json"
CURSOR_SCHEMAS = {
    "plugin": "31db124b1c7e43c22abb13ebf7e7c74556482e480fd492b80638d815c85b96b1",
    "marketplace": "50c85058bf329588401fd2fc93180a574fa64abbb6c2606400febfb6f4d094e8",
}
PATH_KEYS = ("composerIcon", "logo", "skills", "icon_small", "icon_large")
VERSION = "0.9.6"
# The Meshy CLI the skills are written for: any 0.8.x from MIN_CLI.
MIN_CLI = "0.8.5"
LINK = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
# The pinned temporary-package runner documented in setup.md; recipes stay written as `meshy ...`.
RUNNER = ["npm", "exec", "--yes", f"--package=meshy-cli@{MIN_CLI}", "--"]
# Written paths are placeholders resolved from the user's request, never a hardcoded directory.
WORKSPACE_FLAGS = ("--workspace", "WORKSPACE")

def require(condition, message):
    if not condition:
        raise ValueError(message)

def commands(text):
    for fence in re.finditer(r"```(?:bash|sh|shell)\n(.*?)```", text, re.S):
        body = fence.group(1).replace("\\\n", " ")
        for line in body.splitlines():
            argv = shlex.split(line, comments=True)
            if argv:
                yield argv

def validate_skill(folder):
    entry = folder / "SKILL.md"
    text = entry.read_text()
    match = re.match(r"\A---\n(.*?)\n---", text, re.S)
    require(match, f"{entry}: missing frontmatter")
    meta = yaml.safe_load(match.group(1))
    require(meta.get("name") == folder.name, f"{entry}: name mismatch")
    require(bool(meta.get("description")), f"{entry}: missing description")
    require(not meta.get("metadata") and "interface" not in meta, f"{entry}: unexpected metadata/interface block; the release version lives in the plugin manifests")
    require(MIN_CLI in text, f"{entry}: missing minimum CLI version")
    require(len(text.splitlines()) <= 300, f"{entry}: move detail into references")
    markdown = set()
    for file in folder.rglob("*"):
        require(not file.is_symlink(), f"{file}: symlink in skill")
        require("scripts" not in file.relative_to(folder).parts and file.suffix not in (".py", ".sh", ".js", ".mjs", ".pyc"), f"{file}: bundled runtime")
        if file.suffix == ".md":
            markdown.add(file.resolve())
    graph = {}
    for file in markdown:
        content = file.read_text()
        require(not re.search(r"\b(?:meshy_task\.py|fix_obj\.py|slicers\.py|pip install requests)\b", content), f"{file}: old runtime instruction")
        links = set()
        # Inline code is an example to write, not a link to follow (`![Preview](/abs/path.png)`).
        for target in LINK.findall(re.sub(r"`[^`\n]*`", "", content)):
            if re.match(r"[a-z]+://|#", target):
                continue
            target = target.split("#")[0]
            resolved = (file.parent / target).resolve()
            require(resolved.is_relative_to(folder.resolve()) and resolved.is_file(), f"{file}: invalid/local escaping link {target}")
            if resolved.suffix == ".md":
                links.add(resolved)
        graph[file] = links
        for argv in commands(content):
            if argv[: len(RUNNER)] == RUNNER:
                argv = argv[len(RUNNER) :]  # same contract through the pinned temporary package
            if argv[0] != "meshy":
                require(argv[0] not in ("curl", "python", "python3", "jq"), f"{file}: non-CLI runtime command")
                continue
            if "--help" in argv or "--version" in argv:
                continue
            require("--format" in argv and argv[argv.index("--format") + 1] == "json", f"{file}: missing JSON output")
            require("--no-update-check" in argv, f"{file}: unexpected update check")
            # Removed upstream: every command prints the v1 envelope (0.5.0), and the project store is gone (0.7.0).
            # The CLI refuses all of these (exit 2), so a documented command must not carry them.
            require("--output-schema" not in argv, f"{file}: --output-schema no longer exists")
            require(argv[1] != "project" and "--project" not in argv and "--stage" not in argv, f"{file}: the project store no longer exists")
            require(not any("meshy_output" in arg for arg in argv[1:]), f"{file}: hardcoded output root instead of a resolved placeholder")
            writes = any(flag in argv for flag in ("--save-json", "--output", "-o", "--output-dir")) or argv[1:3] == ["mesh", "prepare-print"]
            if writes and argv[1] != "auth":
                require("--workspace" in argv, f"{file}: output write without workspace")
                require(argv[argv.index("--workspace") + 1] == WORKSPACE_FLAGS[1], f"{file}: workspace must be the resolved WORKSPACE placeholder")
    reachable, queue = set(), [entry.resolve()]
    while queue:
        file = queue.pop()
        if file not in reachable:
            reachable.add(file)
            queue.extend(graph.get(file, ()))
    require(markdown <= reachable, f"{folder}: unreachable documents {markdown - reachable}")
    # The first-run contract each skill must be able to answer on its own.
    setup = (folder / "references" / "setup.md").read_text()
    for needle in (f"npm exec --yes --package=meshy-cli@{MIN_CLI} -- meshy", "auth login --device", "--region cn", "./meshy_output", "WORKSPACE", "JOB_DIR"):
        require(needle in setup, f"{folder}: setup.md does not document {needle!r}")
    # --no-wait only in the two-step sign-in, which resumes by flow_id (CLI 0.7.3 no longer prints the device code).
    require("--no-wait" not in setup or "--device-flow FLOW_ID" in setup, f"{folder}: --no-wait without the --device-flow resume")
    delivery = (folder / "references" / "delivery.md").read_text()
    for needle in ("thumbnail.primary", "docs.meshy.ai/en/api/pricing", "--dry-run", "_meta.json"):
        require(needle in delivery, f"{folder}: delivery.md does not document {needle!r}")

def safe_path(child, root):
    path = (root / child).resolve()
    require(path.is_relative_to(root.resolve()) and path.exists(), f"Missing/escaping package path: {child}")

def safe_paths(value, root):
    if isinstance(value, dict):
        for key, child in value.items():
            if isinstance(child, str) and (key in PATH_KEYS or child.startswith("./assets/")):
                safe_path(child, root)
            elif key in PATH_KEYS and isinstance(child, list):
                for item in child:
                    safe_path(item, root)
            else:
                safe_paths(child, root)
    elif isinstance(value, list):
        for child in value:
            safe_paths(child, root)

def cursor_schema(name):
    """Cursor's schema `name`, from the cache outside the repository or downloaded once."""
    cache = Path(os.environ.get("CURSOR_SCHEMA_CACHE", Path(tempfile.gettempdir()) / "meshy-3d-agent-cursor-schemas"))
    path = cache / f"{name}.schema.json"
    if not path.is_file():
        with urllib.request.urlopen(CURSOR_SCHEMA_URL.format(name), timeout=30) as response:
            data = response.read()
        cache.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    data = path.read_bytes()
    require(hashlib.sha256(data).hexdigest() == CURSOR_SCHEMAS[name], f"Cursor {name} schema does not match the pinned commit: {path}")
    return json.loads(data)

def validate_cursor(manifest, root):
    for error in jsonschema.Draft7Validator(cursor_schema("plugin")).iter_errors(manifest):
        raise ValueError(f".cursor-plugin/plugin.json: {error.json_path}: {error.message}")
    # A list entry whose folder holds a SKILL.md loads exactly that skill.
    require(manifest.get("skills") == [f"./skills/{name}" for name in SKILLS], ".cursor-plugin/plugin.json: skills must list exactly the generation and printing skills")
    # The Marketplace tile shows the logo as a square; a PNG keeps its own dark background on light themes.
    logo = root / manifest.get("logo", "")
    require(logo.suffix == ".png" and logo.is_file(), ".cursor-plugin/plugin.json: logo must be a PNG in the repository")
    header = logo.read_bytes()[:24]
    width, height = int.from_bytes(header[16:20], "big"), int.from_bytes(header[20:24], "big")
    require(header[:8] == b"\x89PNG\r\n\x1a\n" and width == height >= 512, ".cursor-plugin/plugin.json: logo must be a square PNG of at least 512 px")

def validate_cursor_marketplace(market, manifest, root):
    for error in jsonschema.Draft7Validator(cursor_schema("marketplace")).iter_errors(market):
        raise ValueError(f".cursor-plugin/marketplace.json: {error.json_path}: {error.message}")
    # Without this file, Cursor's "Add to Marketplace" read .claude-plugin/marketplace.json and
    # listed the root plugin once per Claude Code entry: three plugins named meshy-3d-agent.
    entries = market["plugins"]
    require(len(entries) == 1, ".cursor-plugin/marketplace.json: list exactly one plugin, the one at the repository root")
    require(entries[0]["name"] == manifest["name"], ".cursor-plugin/marketplace.json: the entry's name must match .cursor-plugin/plugin.json")
    require((root / entries[0]["source"]).resolve() == root.resolve(), ".cursor-plugin/marketplace.json: the entry's source must be the repository root")
    require(entries[0].get("description") == manifest["description"], ".cursor-plugin/marketplace.json: the entry's description must match .cursor-plugin/plugin.json")

def validate(root):
    for name in SKILLS:
        validate_skill(root / "skills" / name)
    require(f"Current release: **{VERSION}**" in (root / "README.md").read_text(), "README.md: current release is not " + VERSION)
    for name in (".claude-plugin/plugin.json", ".cursor-plugin/plugin.json"):
        manifest = json.loads((root / name).read_text())
        require(manifest.get("version") == VERSION, f"{name}: version mismatch")
        require(manifest.get("name"), f"{name}: missing name")
        safe_paths(manifest, root)
    cursor_manifest = json.loads((root / ".cursor-plugin" / "plugin.json").read_text())
    validate_cursor(cursor_manifest, root)
    validate_cursor_marketplace(json.loads((root / ".cursor-plugin" / "marketplace.json").read_text()), cursor_manifest, root)
    market = json.loads((root / ".claude-plugin" / "marketplace.json").read_text())
    listed = {s for plugin in market["plugins"] for s in plugin.get("skills", [])}
    require(all(f"./skills/{name}" in listed for name in SKILLS), "Marketplace does not expose every CLI skill")
    print(f"Validated CLI skills: {root}")

if __name__ == "__main__":
    argparse.ArgumentParser(description=__doc__).parse_args()
    try:
        validate(ROOT)
    except (ValueError, OSError, KeyError, yaml.YAMLError) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
