#!/usr/bin/env python3
"""
Build script for meshy-3d-agent.

Usage:
    python3 scripts/build.py           # regenerate all targets
    python3 scripts/build.py --check   # verify everything is in sync; exit 0 = OK, exit 1 = violations
"""

import sys
import shutil
from pathlib import Path

# Repo root = parent of this script's parent directory
REPO_ROOT = Path(__file__).resolve().parent.parent

SOURCE_MD = REPO_ROOT / "reference" / "source.md"
SKILL_DIRS = {
    "generation": REPO_ROOT / "skills" / "meshy-3d-generation",
    "printing":   REPO_ROOT / "skills" / "meshy-3d-printing",
    "openclaw":   REPO_ROOT / "skills" / "meshy-openclaw",
}
OPENCLAW_SKILL_MD = SKILL_DIRS["openclaw"] / "SKILL.md"

GENERATED_HEADER = (
    "<!-- GENERATED FILE — edit reference/source.md "
    "(and skills/meshy-openclaw/SKILL.md for the SECURITY MANIFEST), "
    "then run scripts/build.py. Do not edit directly. -->"
)

SCRIPT_SRC_DIR = REPO_ROOT / "scripts" / "src"
SCRIPT_COPIES = [
    # (source_path, [(dest_path, from_label), ...])
    (
        SCRIPT_SRC_DIR / "meshy_task.py",
        [
            (SKILL_DIRS["generation"] / "scripts" / "meshy_task.py",
             "scripts/src/meshy_task.py"),
            (SKILL_DIRS["printing"] / "scripts" / "meshy_task.py",
             "scripts/src/meshy_task.py"),
            (SKILL_DIRS["openclaw"] / "scripts" / "meshy_task.py",
             "scripts/src/meshy_task.py"),
        ],
    ),
    (
        SKILL_DIRS["printing"] / "scripts" / "slicers.py",
        [
            (SKILL_DIRS["openclaw"] / "scripts" / "slicers.py",
             "skills/meshy-3d-printing/scripts/slicers.py"),
        ],
    ),
    (
        SKILL_DIRS["printing"] / "scripts" / "fix_obj.py",
        [
            (SKILL_DIRS["openclaw"] / "scripts" / "fix_obj.py",
             "skills/meshy-3d-printing/scripts/fix_obj.py"),
        ],
    ),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def extract_security_manifest(skill_md_path: Path) -> str:
    """
    Parse the SECURITY MANIFEST section from SKILL.md.
    Returns the block from '## SECURITY MANIFEST' up to (not including)
    the next '---' thematic break line.
    """
    lines = skill_md_path.read_text(encoding="utf-8").splitlines(keepends=True)
    in_section = False
    collected = []
    for line in lines:
        if line.rstrip() == "## SECURITY MANIFEST":
            in_section = True
            collected.append(line)
            continue
        if in_section:
            if line.rstrip() == "---":
                break
            collected.append(line)
    if not collected:
        raise ValueError(
            f"Could not find '## SECURITY MANIFEST' section in {skill_md_path}"
        )
    return "".join(collected)


def source_header_end(source_lines: list[str]) -> int:
    """
    Return the index (exclusive) of the end of the opening header block:
    the '# Meshy API' title + intro blockquote + Base URL + Docs lines.
    That is the line index just after the 'Docs: ...' line.
    """
    for i, line in enumerate(source_lines):
        if line.startswith("Docs:"):
            return i + 1
    raise ValueError("Could not find 'Docs:' line in source.md")


def build_reference_content(source_text: str, include_manifest: bool) -> str:
    """Build the content for a generated reference.md."""
    lines = source_text.splitlines(keepends=True)

    if not include_manifest:
        return GENERATED_HEADER + "\n" + source_text

    # Insert SECURITY MANIFEST after the opening header block
    manifest_text = extract_security_manifest(OPENCLAW_SKILL_MD)
    insert_at = source_header_end(lines)

    before = "".join(lines[:insert_at])
    after = "".join(lines[insert_at:])

    # Ensure blank line before manifest section, then the manifest, then ---,
    # then blank line before the rest.
    separator = "\n---\n\n"
    content = (
        GENERATED_HEADER + "\n"
        + before
        + "\n"
        + manifest_text.rstrip("\n")
        + separator
        + after.lstrip("\n")
    )
    return content


def add_generated_comment_to_script(src_text: str, from_label: str) -> str:
    """
    Insert a GENERATED comment immediately after the shebang line (if present),
    or prepend it at the top.
    """
    comment = f"# GENERATED from {from_label} by scripts/build.py — do not edit directly.\n"
    lines = src_text.splitlines(keepends=True)
    if lines and lines[0].startswith("#!"):
        return lines[0] + comment + "".join(lines[1:])
    return comment + src_text


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------

def generate_references() -> None:
    """Write the three generated reference.md files."""
    source_text = SOURCE_MD.read_text(encoding="utf-8")

    targets = [
        (SKILL_DIRS["generation"] / "reference.md", False),
        (SKILL_DIRS["printing"]   / "reference.md", False),
        (SKILL_DIRS["openclaw"]   / "reference.md", True),
    ]
    for dest, include_manifest in targets:
        content = build_reference_content(source_text, include_manifest)
        dest.write_text(content, encoding="utf-8")
        print(f"Written: {dest.relative_to(REPO_ROOT)}")


def generate_script_copies() -> None:
    """Copy script files with GENERATED headers; warn+skip missing sources."""
    for src_path, destinations in SCRIPT_COPIES:
        if not src_path.exists():
            print(
                f"WARNING: source script not found, skipping: "
                f"{src_path.relative_to(REPO_ROOT)}"
            )
            continue
        src_text = src_path.read_text(encoding="utf-8")
        from_label = str(src_path.relative_to(REPO_ROOT))
        generated_text = add_generated_comment_to_script(src_text, from_label)
        for dest_path, _ in destinations:
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            dest_path.write_text(generated_text, encoding="utf-8")
            print(f"Written: {dest_path.relative_to(REPO_ROOT)}")


def generate_all() -> None:
    generate_references()
    generate_script_copies()


# ---------------------------------------------------------------------------
# Check mode
# ---------------------------------------------------------------------------

def check_all() -> int:
    """
    Verify all generated files are in sync and run structural checks.
    Returns 0 on success, 1 on any violation.
    """
    violations: list[str] = []
    source_text = SOURCE_MD.read_text(encoding="utf-8")

    # 1. Check generated reference.md files are byte-identical to fresh generation
    targets = [
        (SKILL_DIRS["generation"] / "reference.md", False, "generation"),
        (SKILL_DIRS["printing"]   / "reference.md", False, "printing"),
        (SKILL_DIRS["openclaw"]   / "reference.md", True,  "openclaw"),
    ]
    for dest, include_manifest, label in targets:
        expected = build_reference_content(source_text, include_manifest)
        if not dest.exists():
            violations.append(
                f"MISSING: {dest.relative_to(REPO_ROOT)} (run build.py to generate)"
            )
        elif dest.read_text(encoding="utf-8") != expected:
            violations.append(
                f"OUT OF SYNC: {dest.relative_to(REPO_ROOT)} differs from "
                f"what 'python3 scripts/build.py' would produce"
            )

    # 2. Check script copies are byte-identical to fresh generation
    for src_path, destinations in SCRIPT_COPIES:
        if not src_path.exists():
            # Source missing — skip copy check (same as generate: warn+skip)
            continue
        src_text = src_path.read_text(encoding="utf-8")
        from_label = str(src_path.relative_to(REPO_ROOT))
        expected_text = add_generated_comment_to_script(src_text, from_label)
        for dest_path, _ in destinations:
            if not dest_path.exists():
                violations.append(
                    f"MISSING script copy: {dest_path.relative_to(REPO_ROOT)}"
                )
            elif dest_path.read_text(encoding="utf-8") != expected_text:
                violations.append(
                    f"OUT OF SYNC script copy: {dest_path.relative_to(REPO_ROOT)}"
                )

    # 3. Every skills/*/references/*.md is referenced by a markdown link in SKILL.md
    for skill_dir in SKILL_DIRS.values():
        refs_dir = skill_dir / "references"
        if not refs_dir.exists():
            continue
        skill_md = skill_dir / "SKILL.md"
        if not skill_md.exists():
            violations.append(f"MISSING SKILL.md: {skill_md.relative_to(REPO_ROOT)}")
            continue
        skill_md_text = skill_md.read_text(encoding="utf-8")
        for ref_file in refs_dir.iterdir():
            if ref_file.is_file() and ref_file.suffix == ".md":
                link_fragment = f"references/{ref_file.name}"
                if link_fragment not in skill_md_text:
                    violations.append(
                        f"UNLINKED: {ref_file.relative_to(REPO_ROOT)} "
                        f"not referenced in {skill_md.relative_to(REPO_ROOT)}"
                    )

    # 4. Every skills/*/SKILL.md is ≤ 300 lines
    for skill_dir in SKILL_DIRS.values():
        skill_md = skill_dir / "SKILL.md"
        if not skill_md.exists():
            continue
        line_count = len(skill_md.read_text(encoding="utf-8").splitlines())
        if line_count > 300:
            violations.append(
                f"TOO LONG: {skill_md.relative_to(REPO_ROOT)} "
                f"has {line_count} lines (limit: 300)"
            )

    if violations:
        print("CHECK FAILED — violations:")
        for v in violations:
            print(f"  - {v}")
        return 1

    print("ALL CHECKS PASSED")
    return 0


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    if "--check" in sys.argv:
        sys.exit(check_all())
    else:
        generate_all()


if __name__ == "__main__":
    main()
