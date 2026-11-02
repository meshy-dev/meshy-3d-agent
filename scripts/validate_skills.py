#!/usr/bin/env python3
"""Validate the three independently installable CLI skills and the plugin manifests that list them."""
import argparse
import json
import jsonschema
from pathlib import Path
import re
import shlex
import sys
import yaml

ROOT = Path(__file__).resolve().parent.parent
SKILLS = ("meshy-3d-generation", "meshy-3d-printing", "meshy-openclaw")
# meshy-openclaw repeats both of these in one skill for OpenClaw, so the Cursor plugin lists only these.
CURSOR_SKILLS = ("meshy-3d-generation", "meshy-3d-printing")
# Pinned copy of cursor/plugins@5229aad76c37451561c5b81a9b5072ae1c549a5b schemas/plugin.schema.json.
CURSOR_SCHEMA = ROOT / "scripts" / "cursor-plugin.schema.json"
PATH_KEYS = ("composerIcon", "logo", "skills", "icon_small", "icon_large")
VERSION = "0.9.1"
# The Meshy CLI the skills are written for: any 0.8.x from MIN_CLI. Package specs use the range.
CLI = "0.8"
MIN_CLI = "0.8.2"
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
    # OpenClaw gates and installs skills from metadata.openclaw; nothing else carries metadata.
    allowed = {"openclaw"} if folder.name == "meshy-openclaw" else set()
    require(set(meta.get("metadata") or {}) == allowed and "interface" not in meta, f"{entry}: unexpected metadata/interface block; the release version lives in the plugin manifests")
    require("env" not in ((meta.get("metadata") or {}).get("openclaw", {}).get("requires") or {}), f"{entry}: an env gate hides the skill from users who sign in through the browser")
    if folder.name == "meshy-openclaw":
        installs = meta["metadata"]["openclaw"].get("install") or []
        require([spec.get("package") for spec in installs] == [f"meshy-cli@{CLI}"], f"{entry}: the OpenClaw install hint must pin meshy-cli@{CLI}")
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
        for target in LINK.findall(content):
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

def validate_cursor(manifest):
    for error in jsonschema.Draft7Validator(json.loads(CURSOR_SCHEMA.read_text())).iter_errors(manifest):
        raise ValueError(f".cursor-plugin/plugin.json: {error.json_path}: {error.message}")
    # Cursor scans a string as a folder of skills, which would also load meshy-openclaw; a list
    # entry whose folder holds a SKILL.md loads exactly that skill.
    require(manifest.get("skills") == [f"./skills/{name}" for name in CURSOR_SKILLS], ".cursor-plugin/plugin.json: skills must list exactly the generation and printing skills")

def validate(root):
    for name in SKILLS:
        validate_skill(root / "skills" / name)
    for name in (".claude-plugin/plugin.json", ".cursor-plugin/plugin.json"):
        manifest = json.loads((root / name).read_text())
        require(manifest.get("version") == VERSION, f"{name}: version mismatch")
        require(manifest.get("name"), f"{name}: missing name")
        safe_paths(manifest, root)
    validate_cursor(json.loads((root / ".cursor-plugin" / "plugin.json").read_text()))
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
