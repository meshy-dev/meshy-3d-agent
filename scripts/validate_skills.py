#!/usr/bin/env python3
"""CI validation for the meshy-3d-agent skills repository (ENG-1578).

Five checks:
  1. Frontmatter: every skills/<dir>/SKILL.md has name == <dir>, a semver
     metadata.version, and a non-empty description containing both a trigger
     phrase ("use when ...") and a routing boundary ("... instead", "not for ...").
  2. Version sync: .claude-plugin/plugin.json, .cursor-plugin/plugin.json,
     every SKILL.md metadata.version, and the top CHANGELOG.md entry must all
     agree. Optional version fields in .claude-plugin/marketplace.json (top
     level or per entry) must agree too.
  3. Manifest coverage: all three manifests exist, parse, and carry a non-empty
     "name"; .claude-plugin/marketplace.json must list every skills/<dir>
     across its entries' skills arrays; an explicit skills list in the claude /
     cursor plugin.json (if present) must cover the same set.

     There is deliberately no .codex-plugin/plugin.json: Codex's plugin
     marketplace only accepts a plugin root in a subdirectory carrying its own
     real skills/ tree (a symlink or a "../skills" manifest path both install
     with zero skills and still report success), which would mean committing a
     second copy of every skill. Codex reads .agents/skills instead, so the
     README's directory install covers it without a manifest.
  4. Reference bidirectionality: every relative markdown link in a skill's
     SKILL.md must resolve to an existing file inside the skill directory,
     and every non-SKILL markdown file in the skill directory (reference.md,
     references/**, ...) must be reachable from SKILL.md through in-directory
     markdown links.
  5. No parent-directory ("..") path segments in manifest string values or in
     skill markdown links, so every skill directory stays independently
     installable.

Exits 0 when all checks pass, 1 otherwise. Emits ::error annotations when
running inside GitHub Actions.

Local run:  python3 scripts/validate_skills.py   (requires pyyaml)
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
SKILLS_DIR = ROOT / "skills"
CHANGELOG = ROOT / "CHANGELOG.md"
CLAUDE_PLUGIN = ROOT / ".claude-plugin" / "plugin.json"
MARKETPLACE = ROOT / ".claude-plugin" / "marketplace.json"
CURSOR_PLUGIN = ROOT / ".cursor-plugin" / "plugin.json"
MANIFEST_PATHS = [CLAUDE_PLUGIN, MARKETPLACE, CURSOR_PLUGIN]

SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+$")
FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.DOTALL)
TRIGGER_RE = re.compile(r"use\s+(?:this\s+skill\s+)?when", re.IGNORECASE)
BOUNDARY_RE = re.compile(
    r"\b(?:instead|not\s+for|do\s+not\s+use|don'?t\s+use|only\s+(?:for|when)|except)\b",
    re.IGNORECASE,
)
MD_LINK_RE = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
CHANGELOG_VER_RE = re.compile(r"^##\s+\[(\d+\.\d+\.\d+)\]", re.MULTILINE)
EXTERNAL_LINK_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*:")

IN_CI = os.environ.get("GITHUB_ACTIONS") == "true"


def rel(path: Path) -> str:
    return str(Path(path).resolve().relative_to(ROOT))


def skill_dirs() -> list[Path]:
    if not SKILLS_DIR.is_dir():
        return []
    return sorted(
        d for d in SKILLS_DIR.iterdir() if d.is_dir() and (d / "SKILL.md").is_file()
    )


def load_json(path: Path, errors: list[str]):
    if not path.is_file():
        errors.append(f"{rel(path)}: manifest missing")
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        errors.append(f"{rel(path)}: invalid JSON: {exc}")
        return None


def load_frontmatter(path: Path):
    match = FRONTMATTER_RE.match(path.read_text(encoding="utf-8"))
    if not match:
        return None
    try:
        return yaml.safe_load(match.group(1))
    except yaml.YAMLError:
        return None


def md_link_targets(text: str) -> list[str]:
    targets = []
    for match in MD_LINK_RE.finditer(text):
        target = match.group(1).strip()
        if target.startswith("<"):
            end = target.find(">")
            target = target[1:end] if end != -1 else target[1:]
        else:
            target = target.split(" ")[0]  # drop optional "title"
        targets.append(target)
    return targets


def is_external(target: str) -> bool:
    return (
        bool(EXTERNAL_LINK_RE.match(target))
        or target.startswith("#")
        or target.startswith("//")
    )


# --- Check 1: frontmatter ----------------------------------------------------


def check_frontmatter() -> list[str]:
    errors = []
    for directory in skill_dirs():
        path = directory / "SKILL.md"
        fm = load_frontmatter(path)
        if not isinstance(fm, dict):
            errors.append(f"{rel(path)}: missing or unparseable YAML frontmatter")
            continue
        name = fm.get("name")
        if name != directory.name:
            errors.append(
                f'{rel(path)}: frontmatter name "{name}" != directory name '
                f'"{directory.name}"'
            )
        metadata = fm.get("metadata")
        version = metadata.get("version") if isinstance(metadata, dict) else None
        if version is None:
            errors.append(f"{rel(path)}: metadata.version missing")
        elif not SEMVER_RE.match(str(version)):
            errors.append(
                f'{rel(path)}: metadata.version "{version}" is not semver x.y.z'
            )
        description = fm.get("description")
        if not isinstance(description, str) or not description.strip():
            errors.append(f"{rel(path)}: description missing or empty")
            continue
        if not TRIGGER_RE.search(description):
            errors.append(
                f'{rel(path)}: description lacks a trigger phrase '
                f'(expected "use when ...")'
            )
        if not BOUNDARY_RE.search(description):
            errors.append(
                f"{rel(path)}: description lacks a boundary note "
                f'(e.g. "use ... instead", "not for ...")'
            )
    return errors


# --- Check 2: version sync ---------------------------------------------------


def collect_versions(manifests: dict) -> tuple[list[str], dict[str, str]]:
    errors: list[str] = []
    versions: dict[str, str] = {}

    for path, data in manifests.items():
        if data is None:
            continue
        label = rel(path)
        if path == MARKETPLACE:
            if "version" in data:
                versions[f"{label} (top level)"] = str(data["version"])
            entries = data.get("plugins")
            if isinstance(entries, list):
                for entry in entries:
                    if isinstance(entry, dict) and "version" in entry:
                        versions[
                            f"{label} entry {entry.get('name', '?')}"
                        ] = str(entry["version"])
        else:
            value = data.get("version")
            if value is None:
                errors.append(f"{label}: version field missing")
            else:
                versions[label] = str(value)

    for directory in skill_dirs():
        path = directory / "SKILL.md"
        fm = load_frontmatter(path)
        if (
            isinstance(fm, dict)
            and isinstance(fm.get("metadata"), dict)
            and fm["metadata"].get("version") is not None
        ):
            versions[f"{rel(path)} metadata.version"] = str(fm["metadata"]["version"])

    if CHANGELOG.is_file():
        match = CHANGELOG_VER_RE.search(CHANGELOG.read_text(encoding="utf-8"))
        if match:
            versions["CHANGELOG.md top entry"] = match.group(1)
        else:
            errors.append("CHANGELOG.md: no '## [x.y.z]' entry found")
    else:
        errors.append("CHANGELOG.md: missing")

    return errors, versions


def check_versions(manifests: dict) -> list[str]:
    errors, versions = collect_versions(manifests)
    for label, value in sorted(versions.items()):
        if not SEMVER_RE.match(value):
            errors.append(f'{label}: "{value}" is not semver x.y.z')
    if len(set(versions.values())) > 1:
        detail = "\n    ".join(
            f"{label} = {value}" for label, value in sorted(versions.items())
        )
        errors.append(f"version mismatch across manifests/skills/CHANGELOG:\n    {detail}")
    return errors


# --- Check 3: manifest coverage ----------------------------------------------


def expand_skills_field(value, where: str, actual: set[str], errors: list[str]) -> set[str]:
    covered: set[str] = set()
    if isinstance(value, str):
        items = [value]
    elif isinstance(value, list):
        items = value
    else:
        errors.append(f"{where}: skills must be a string or an array of strings")
        return covered
    for item in items:
        if not isinstance(item, str):
            errors.append(f"{where}: skills entries must be strings")
            continue
        normalized = item.strip().lstrip("./").rstrip("/")
        if normalized == "skills":
            covered |= actual
        elif normalized.startswith("skills/"):
            name = normalized[len("skills/"):]
            if name in actual:
                covered.add(name)
            else:
                errors.append(
                    f"{where}: skills entry '{item}' matches no skills/<dir> "
                    f"containing a SKILL.md"
                )
        else:
            errors.append(f"{where}: skills entry '{item}' is not under skills/")
    return covered


def check_manifest_coverage(manifests: dict, load_errors: list[str]) -> list[str]:
    errors = list(load_errors)
    actual = {d.name for d in skill_dirs()}

    for path, data in manifests.items():
        if data is None:
            continue
        name = data.get("name")
        if not (isinstance(name, str) and name.strip()):
            errors.append(f"{rel(path)}: name missing or empty")

    marketplace = manifests.get(MARKETPLACE)
    if marketplace is not None:
        owner = marketplace.get("owner")
        if not (
            isinstance(owner, dict)
            and isinstance(owner.get("name"), str)
            and owner["name"].strip()
        ):
            errors.append(f"{rel(MARKETPLACE)}: owner.name missing")
        entries = marketplace.get("plugins")
        if not isinstance(entries, list) or not entries:
            errors.append(f"{rel(MARKETPLACE)}: plugins[] missing or empty")
        else:
            covered: set[str] = set()
            for entry in entries:
                if not isinstance(entry, dict):
                    errors.append(f"{rel(MARKETPLACE)}: plugin entry is not an object")
                    continue
                entry_name = entry.get("name")
                if not (isinstance(entry_name, str) and entry_name.strip()):
                    errors.append(f"{rel(MARKETPLACE)}: plugin entry missing name")
                    entry_name = "?"
                source = entry.get("source")
                where = f"{rel(MARKETPLACE)} entry '{entry_name}'"
                if isinstance(source, str):
                    resolved = (ROOT / source).resolve()
                    if not resolved.is_dir():
                        errors.append(f"{where}: source '{source}' is not a directory")
                    elif not (resolved / ".claude-plugin" / "plugin.json").is_file():
                        errors.append(
                            f"{where}: source '{source}' has no "
                            f".claude-plugin/plugin.json (required with strict "
                            f"marketplace entries)"
                        )
                elif not isinstance(source, dict):
                    errors.append(f"{where}: missing source")
                covered |= expand_skills_field(
                    entry.get("skills", []), where, actual, errors
                )
            if covered != actual:
                errors.append(
                    f"{rel(MARKETPLACE)}: entries cover {sorted(covered)} but "
                    f"skills/ contains {sorted(actual)}"
                )

    # If the claude/cursor root plugin.json ever gains an explicit skills
    # list, it must cover every skill directory too (auto-discovery does the
    # right thing when the field is absent).
    for path in (CLAUDE_PLUGIN, CURSOR_PLUGIN):
        data = manifests.get(path)
        if data is not None and "skills" in data:
            covered = expand_skills_field(data["skills"], rel(path), actual, errors)
            if covered != actual:
                errors.append(
                    f"{rel(path)}: explicit skills list covers {sorted(covered)} "
                    f"but skills/ contains {sorted(actual)}"
                )

    return errors


# --- Check 4: reference bidirectionality --------------------------------------


def check_references() -> list[str]:
    errors = []
    for directory in skill_dirs():
        root = directory.resolve()
        md_files = {p.resolve() for p in directory.rglob("*.md")}
        graph: dict[Path, set[Path]] = {p: set() for p in md_files}
        for path in md_files:
            for target in md_link_targets(path.read_text(encoding="utf-8")):
                if is_external(target):
                    continue
                target = target.split("#", 1)[0]
                if not target:
                    continue
                resolved = (path.parent / target).resolve()
                try:
                    resolved.relative_to(root)
                except ValueError:
                    continue  # escapes the skill dir; check 5 reports '..' cases
                if not resolved.exists():
                    errors.append(f"{rel(path)}: linked file '{target}' does not exist")
                elif resolved in md_files:
                    graph[path].add(resolved)
        start = (directory / "SKILL.md").resolve()
        seen: set[Path] = set()
        stack = [start]
        while stack:
            current = stack.pop()
            if current in seen:
                continue
            seen.add(current)
            stack.extend(graph.get(current, set()) - seen)
        for path in sorted(md_files - {start}):
            if path not in seen:
                errors.append(
                    f"{rel(path)}: not referenced by any markdown link chain "
                    f"from {rel(directory / 'SKILL.md')}"
                )
    return errors


# --- Check 5: no parent-directory references ----------------------------------


def iter_strings(obj, prefix=""):
    if isinstance(obj, dict):
        for key, value in obj.items():
            yield from iter_strings(value, f"{prefix}.{key}" if prefix else key)
    elif isinstance(obj, list):
        for index, value in enumerate(obj):
            yield from iter_strings(value, f"{prefix}[{index}]")
    elif isinstance(obj, str):
        yield prefix, obj


def has_parent_segment(value: str) -> bool:
    return ".." in value.replace("\\", "/").split("/")


def check_no_parent_refs(manifests: dict) -> list[str]:
    errors = []
    for path, data in manifests.items():
        if data is None:
            continue
        for json_path, value in iter_strings(data):
            if has_parent_segment(value):
                errors.append(
                    f"{rel(path)}: '{json_path}' contains a '..' path segment: "
                    f"{value!r}"
                )
    for directory in skill_dirs():
        for path in directory.rglob("*.md"):
            for target in md_link_targets(path.read_text(encoding="utf-8")):
                if is_external(target):
                    continue
                if has_parent_segment(target.split("#", 1)[0]):
                    errors.append(
                        f"{rel(path)}: link '{target}' contains a '..' path "
                        f"segment (skill directories must be independently "
                        f"installable)"
                    )
    return errors


# --- Runner --------------------------------------------------------------------


def main() -> int:
    manifests: dict = {}
    load_errors: list[str] = []
    for path in MANIFEST_PATHS:
        manifests[path] = load_json(path, load_errors)

    checks = [
        ("Check 1/5: SKILL.md frontmatter", check_frontmatter()),
        ("Check 2/5: version sync", check_versions(manifests)),
        (
            "Check 3/5: manifest coverage",
            check_manifest_coverage(manifests, load_errors),
        ),
        ("Check 4/5: reference bidirectionality", check_references()),
        ("Check 5/5: no parent-directory references", check_no_parent_refs(manifests)),
    ]

    failed = 0
    for title, errors in checks:
        if errors:
            failed += 1
            print(f"FAIL {title}")
            for error in errors:
                print(f"    {error}")
                if IN_CI:
                    annotation = str(error).replace("\n", " -- ")
                    print(f"::error ::{annotation}")
        else:
            print(f"ok   {title}")

    if failed:
        print(f"\n{failed} of {len(checks)} checks FAILED")
        return 1
    print(f"\nAll {len(checks)} checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
