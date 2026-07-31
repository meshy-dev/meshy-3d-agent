#!/usr/bin/env python3
"""Slicer detection and launch helper for the Meshy 3D Printing skill.

Dual-use: importable library AND argparse CLI.
Library functions: detect_slicers(), open_in_slicer(file_path, slicer_name)
Constants:         SLICER_MAP, MULTICOLOR_SLICERS
"""
# Part of the meshy-3d-agent skill bundle. Source of truth: https://github.com/meshy-dev/meshy-3d-agent

import subprocess
import shutil
import platform
import os
import glob as glob_mod

SLICER_MAP = {
    "OrcaSlicer":           {"mac_app": "OrcaSlicer",          "win_exe": "orca-slicer.exe",         "win_dir": "OrcaSlicer",          "linux_exe": "orca-slicer"},
    "Bambu Studio":         {"mac_app": "BambuStudio",         "win_exe": "bambu-studio.exe",        "win_dir": "BambuStudio",         "linux_exe": "bambu-studio"},
    "Creality Print":       {"mac_app": "Creality Print",      "win_exe": "CrealityPrint.exe",       "win_dir": "Creality Print*",     "linux_exe": None},
    "Elegoo Slicer":        {"mac_app": "ElegooSlicer",        "win_exe": "elegoo-slicer.exe",       "win_dir": "ElegooSlicer",        "linux_exe": None},
    "Anycubic Slicer Next": {"mac_app": "AnycubicSlicerNext",  "win_exe": "AnycubicSlicerNext.exe",  "win_dir": "AnycubicSlicerNext",  "linux_exe": None},
    "PrusaSlicer":          {"mac_app": "PrusaSlicer",         "win_exe": "prusa-slicer.exe",        "win_dir": "PrusaSlicer",         "linux_exe": "prusa-slicer"},
    "UltiMaker Cura":       {"mac_app": "UltiMaker Cura",      "win_exe": "UltiMaker-Cura.exe",     "win_dir": "UltiMaker Cura*",     "linux_exe": None},
}
MULTICOLOR_SLICERS = {"OrcaSlicer", "Bambu Studio", "Creality Print", "Elegoo Slicer", "Anycubic Slicer Next"}


def detect_slicers():
    """Detect installed slicer software. Returns list of {name, path, multicolor}."""
    found = []
    system = platform.system()
    for name, info in SLICER_MAP.items():
        path = None
        if system == "Darwin":
            app = info.get("mac_app")
            if app and os.path.exists(f"/Applications/{app}.app"):
                path = f"/Applications/{app}.app"
        elif system == "Windows":
            win_dir = info.get("win_dir", "")
            win_exe = info.get("win_exe", "")
            for base in [os.environ.get("ProgramFiles", r"C:\Program Files"),
                         os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")]:
                if "*" in win_dir:
                    matches = glob_mod.glob(os.path.join(base, win_dir, win_exe))
                    if matches:
                        path = matches[0]
                        break
                else:
                    candidate = os.path.join(base, win_dir, win_exe)
                    if os.path.exists(candidate):
                        path = candidate
                        break
        else:  # Linux
            exe = info.get("linux_exe")
            if exe:
                path = shutil.which(exe)
        if path:
            found.append({"name": name, "path": path, "multicolor": name in MULTICOLOR_SLICERS})
    return found


def open_in_slicer(file_path, slicer_name):
    """Open a model file in the specified slicer."""
    info = SLICER_MAP.get(slicer_name, {})
    system = platform.system()
    abs_path = os.path.abspath(file_path)
    if system == "Darwin":
        app = info.get("mac_app", slicer_name)
        subprocess.run(["open", "-a", app, abs_path])
    elif system == "Windows":
        exe = info.get("win_exe")
        exe_path = shutil.which(exe) if exe else None
        if exe_path:
            subprocess.Popen([exe_path, abs_path])
        else:
            os.startfile(abs_path)
    else:
        exe = info.get("linux_exe")
        exe_path = shutil.which(exe) if exe else None
        if exe_path:
            subprocess.Popen([exe_path, abs_path])
        else:
            subprocess.run(["xdg-open", abs_path])
    print(f"Opened {abs_path} in {slicer_name}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _cmd_detect(args):
    slicers = detect_slicers()
    if slicers:
        for s in slicers:
            mc = " [multicolor]" if s["multicolor"] else ""
            print(f"- {s['name']}{mc}: {s['path']}")
    else:
        print("No slicer software detected. Install one of: OrcaSlicer, Bambu Studio, PrusaSlicer, etc.")


def _cmd_open(args):
    open_in_slicer(args.file, args.slicer)


def main():
    import argparse

    parser = argparse.ArgumentParser(
        prog="slicers",
        description="Detect and launch 3D printing slicer software.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("detect", help="List installed slicers")

    p_open = sub.add_parser("open", help="Open a model file in a slicer")
    p_open.add_argument("--file", required=True, help="Path to the model file")
    p_open.add_argument("--slicer", required=True, help="Slicer name (e.g. OrcaSlicer)")

    args = parser.parse_args()
    dispatch = {"detect": _cmd_detect, "open": _cmd_open}
    dispatch[args.command](args)


if __name__ == "__main__":
    main()
