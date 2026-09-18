#!/usr/bin/env python3
"""Maintainer-only sync of the shared references from generation to printing; never ships in skills."""
from __future__ import annotations
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILLS = ("meshy-3d-generation", "meshy-3d-printing")
# generation owns these; printing carries byte-identical copies so it installs on its own.
SHARED = ("setup.md", "delivery.md", "troubleshooting.md")

def sync_shared(check: bool) -> None:
    for name in SHARED:
        source = ROOT / "skills" / SKILLS[0] / "references" / name
        target = ROOT / "skills" / SKILLS[1] / "references" / name
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
