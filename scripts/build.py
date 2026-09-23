#!/usr/bin/env python3
"""Maintainer-only sync of shared references into the skills that carry copies; never ships in skills."""
from __future__ import annotations
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# (owner skill, reference, skills carrying byte-identical copies so each installs on its own).
# OpenClaw installs one skill, so it carries both workflows.
SHARED = (
    ("meshy-3d-generation", "setup.md", ("meshy-3d-printing", "meshy-openclaw")),
    ("meshy-3d-generation", "delivery.md", ("meshy-3d-printing", "meshy-openclaw")),
    ("meshy-3d-generation", "troubleshooting.md", ("meshy-3d-printing", "meshy-openclaw")),
    ("meshy-3d-generation", "pipelines.md", ("meshy-openclaw",)),
    ("meshy-3d-printing", "printing.md", ("meshy-openclaw",)),
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

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail instead of writing when a copy is stale")
    args = parser.parse_args()
    sync_shared(args.check)
    print("Shared references are in sync" if args.check else "Generated shared references")

if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as exc:
        raise SystemExit(str(exc))
