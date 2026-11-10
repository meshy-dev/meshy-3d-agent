#!/usr/bin/env python3
"""Maintainer-only sync of shared references and Cursor skill copies; never ships in skills."""
from __future__ import annotations
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# (owner skill, reference, skills carrying byte-identical copies so each installs on its own).
# OpenClaw installs one skill, so it carries both workflows.
CURSOR_SKILLS = ("meshy-3d-generation", "meshy-3d-printing")

SHARED = (
    ("meshy-3d-generation", "setup.md", ("meshy-3d-printing", "meshy-openclaw")),
    ("meshy-3d-generation", "delivery.md", ("meshy-3d-printing", "meshy-openclaw")),
    ("meshy-3d-generation", "troubleshooting.md", ("meshy-3d-printing", "meshy-openclaw")),
    ("meshy-3d-generation", "pipelines.md", ("meshy-openclaw",)),
    ("meshy-3d-generation", "animation.md", ("meshy-openclaw",)),
    ("meshy-3d-printing", "printing.md", ("meshy-openclaw",)),
    ("meshy-3d-printing", "creative-lab.md", ("meshy-openclaw",)),
)

def sync_shared(check: bool) -> None:
    for owner, name, copies in SHARED:
        source = ROOT / "skills" / owner / "references" / name
        for skill in copies:
            target = ROOT / "skills" / skill / "references" / name
            if check:
                if not target.is_file() or target.read_bytes() != source.read_bytes():
                    raise ValueError(f"Shared reference is stale: {target.relative_to(ROOT)}")
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(source.read_bytes())

def sync_cursor(check: bool) -> None:
    """Materialize a two-skill root without symlinks or the combined OpenClaw skill."""
    destination = ROOT / "cursor" / "skills"
    expected = {}
    for name in CURSOR_SKILLS:
        source = ROOT / "skills" / name
        for file in source.rglob("*"):
            if file.is_symlink():
                raise ValueError(f"Symlink in source skill: {file.relative_to(ROOT)}")
            if file.is_file():
                expected[Path(name) / file.relative_to(source)] = file.read_bytes()
    if destination.is_symlink():
        raise ValueError("Cursor skills root must not be a symlink")
    existing = list(destination.rglob("*")) if destination.exists() else []
    for file in existing:
        if file.is_symlink():
            raise ValueError(f"Symlink in Cursor package: {file.relative_to(ROOT)}")
        if file.is_file() and file.relative_to(destination) not in expected:
            if check:
                raise ValueError(f"Unexpected Cursor package file: {file.relative_to(ROOT)}")
            file.unlink()
    for relative, data in expected.items():
        target = destination / relative
        if check:
            if not target.is_file() or target.read_bytes() != data:
                raise ValueError(f"Cursor skill copy is stale: {target.relative_to(ROOT)}")
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
    # Empty extra directories also must not expose unintended skill names.
    for directory in sorted((p for p in existing if p.is_dir()), key=lambda p: len(p.parts), reverse=True):
        if not any(directory.iterdir()):
            if check:
                raise ValueError(f"Unexpected empty Cursor directory: {directory.relative_to(ROOT)}")
            directory.rmdir()

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail instead of writing when a copy is stale")
    args = parser.parse_args()
    sync_shared(args.check)
    sync_cursor(args.check)
    print("Shared references and Cursor package are in sync" if args.check else "Generated shared references and Cursor package")

if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as exc:
        raise SystemExit(str(exc))
