#!/usr/bin/env python3
"""OBJ coordinate-system and scale fixer for 3D printing slicers.

Dual-use: importable library AND argparse CLI.
Library function: fix_obj_for_printing(input_path, output_path=None, target_height_mm=75.0)
"""
# Part of the meshy-3d-agent skill bundle. Source of truth: https://github.com/meshy-dev/meshy-3d-agent

import os
import sys


def fix_obj_for_printing(input_path, output_path=None, target_height_mm=75.0):
    """
    Fix OBJ coordinate system, scale, and position for 3D printing slicers.
    - Rotates from glTF Y-up to slicer Z-up: (x, y, z) -> (x, -z, y)
    - Scales model to target_height_mm (default 75mm)
    - Centers model on XY plane
    - Aligns model bottom to Z=0
    """
    if output_path is None:
        output_path = input_path

    lines = open(input_path, "r").readlines()

    rotated = []
    min_x, max_x = float("inf"), float("-inf")
    min_y, max_y = float("inf"), float("-inf")
    min_z, max_z = float("inf"), float("-inf")
    for line in lines:
        if line.startswith("v "):
            parts = line.split()
            x, y, z = float(parts[1]), float(parts[2]), float(parts[3])
            rx, ry, rz = x, -z, y
            min_x, max_x = min(min_x, rx), max(max_x, rx)
            min_y, max_y = min(min_y, ry), max(max_y, ry)
            min_z, max_z = min(min_z, rz), max(max_z, rz)
            rotated.append(("v", rx, ry, rz, parts[4:]))
        elif line.startswith("vn "):
            parts = line.split()
            nx, ny, nz = float(parts[1]), float(parts[2]), float(parts[3])
            rotated.append(("vn", nx, -nz, ny, []))
        else:
            rotated.append(("line", line))

    model_height = max_z - min_z
    scale = target_height_mm / model_height if model_height > 1e-6 else 1.0
    x_offset = -(min_x + max_x) / 2.0 * scale
    y_offset = -(min_y + max_y) / 2.0 * scale
    z_offset = -(min_z * scale)

    with open(output_path, "w") as f:
        for item in rotated:
            if item[0] == "v":
                _, rx, ry, rz, extra = item
                tx = rx * scale + x_offset
                ty = ry * scale + y_offset
                tz = rz * scale + z_offset
                extra_str = " " + " ".join(extra) if extra else ""
                f.write(f"v {tx:.6f} {ty:.6f} {tz:.6f}{extra_str}\n")
            elif item[0] == "vn":
                _, nx, ny, nz, _ = item
                f.write(f"vn {nx:.6f} {ny:.6f} {nz:.6f}\n")
            else:
                f.write(item[1])

    print(f"OBJ fixed: rotated Y-up→Z-up, scaled to {target_height_mm:.0f}mm, centered, bottom at Z=0")
    print(f"Output: {os.path.abspath(output_path)}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    import argparse

    parser = argparse.ArgumentParser(
        prog="fix_obj",
        description="Fix OBJ coordinate system and scale for 3D printing slicers.",
    )
    parser.add_argument("input", help="Input OBJ file path")
    parser.add_argument("--output", default=None,
                        help="Output OBJ file path (default: in-place, overwrites input)")
    parser.add_argument("--height-mm", dest="height_mm", type=float, default=75.0,
                        help="Target model height in millimetres (default: 75.0)")

    args = parser.parse_args()

    if not os.path.exists(args.input):
        sys.exit(f"ERROR: Input file not found: {args.input}")

    fix_obj_for_printing(args.input, output_path=args.output, target_height_mm=args.height_mm)


if __name__ == "__main__":
    main()
