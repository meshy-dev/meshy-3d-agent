---
name: meshy-3d-printing
description: "Generates and prepares models for physical 3D printing with the Meshy CLI: white and multicolor prints (3MF, STL, OBJ), printability analysis and repair, splitting into parts, Creative Lab products such as figures, lamps and keychains, sizing, and slicer handoff (Bambu Studio, OrcaSlicer, PrusaSlicer, Cura). Use when the user wants something 3D-printed or asks for print or slicer files."
license: MIT
compatibility: "Needs Node.js 22.12+ and the Meshy CLI 0.7.x, 0.7.1 or later (npm install -g meshy-cli@0.7); network access to the Meshy API."
---

# Meshy 3D Printing

Use Meshy CLI **0.7** (0.7.1 or later) to deliver the requested print files at the intended size, with
analysis/repair results where applicable and a slicer handoff when requested. This skill is
self-contained. Ordinary digital assets belong to meshy-3d-generation.

| Need | Reference |
|---|---|
| CLI runner, credentials, or output location | [Setup](references/setup.md) |
| Local preparation, white or multicolor prints, analysis/repair, or splitting into parts | [Printing recipes](references/printing.md) |
| Creative Lab products (figures, lamps, keychains, magnets, keycaps, fidgets) | [Creative Lab](references/creative-lab.md) |
| Cost, waiting, preview, delivery, or finding a previous model | [Delivery](references/delivery.md) |
| Failed or uncertain operation | [Troubleshooting](references/troubleshooting.md) |

Read relevant sections as needed. Recipes illustrate valid commands; select only the stages
needed for the user's output.

## Choose local or cloud work

| Request | Route |
|---|---|
| Scale, orient or ground an existing OBJ | Local `mesh prepare-print`; no auth or balance |
| Open an existing STL or 3MF | Local `slicer detect` and `slicer open`; no auth or balance |
| White model from text or photo | Generate geometry without textures; analyze/repair as needed; prepare the file |
| Multicolor model | Generate/reuse geometry; analyze/repair as needed; texture; multi-color-print |
| Print in separate parts (build plate, colours per part, fewer supports) | Generate/reuse geometry; auto-split; slice the parts |
| Check or fix an existing model (holes, thin walls), any format | Free analyze-printability by task ID or `--model-url`; repair only if needed |
| Resize an existing STL, 3MF or GLB | Scale it in the slicer; only an OBJ is resized locally |
| Creative Lab figure (a stylized collectible from a photo), vinyl figure, brick figure, lamp, keychain, fridge magnet, keycap or pixel fidget board | Prototype → review → build → select product artifacts |
| Creative Lab collapsible fidget | One create from the photo → STL |

Colour routes differ: multicolor paints one object's surface for a multi-material printer; a
split cuts it into parts, one filament each, and drops the texture (split before any repair;
the two do not chain); the pixel fidget board is a product of its own.

A figurine does not by itself require Creative Lab. Infer the route from the intended product;
ask about size, color or style only when the missing choice materially changes the result.
For an existing model, distinguish local preparation from cloud printability analysis; a
local dimension check cannot establish full printability.

## Cloud authorization

Before the first command run `meshy --version`; no need to ask. When `meshy` is missing or
older than 0.7.1, install the newest 0.7.x with `npm install -g meshy-cli@0.7` and say so in
one line; Setup covers a refused install and a CLI of 0.8 or newer. Local-only work stops at runner setup.
Cloud work reuses a verified session. If login is needed, keep `auth login --device` running (with `--region cn` for a
user in mainland China),
show its URL and user code in **commentary/progress, never a final answer**, and await the
same tool session in this turn. After it exits, verify `auth status` and resume the print job.
Do not ask for a "done" message or credentials in chat; Setup has the host wait procedure.

## Printing-specific constraints

- Repair changes geometry and drops textures. Use repaired geometry downstream and retexture
  before multicolor output. Use analysis when functional parts, thin features or other
  requirements make it relevant, with the printer type and print size when known so wall
  thickness is checked too; its report does not establish material suitability.
- Prepare a Y-up OBJ as a new Z-up file at the requested height, centered and grounded. Do not
  repeat the transform or apply it to STL, 3MF, or relief product output. A multicolor 3MF
  requires no OBJ conversion; cloud print files are scaled in the slicer (Printing recipes, *Print size*). Product ZIPs and optional lamp bases have distinct handling in
  Printing recipes.
- API, downloads and geometry operations use the CLI. Local inputs have a 50 MiB limit, and a
  local model must be GLB or glTF (multicolor: GLB); an STL, OBJ or FBX goes to Meshy only as an
  http(s) URL.
  Every command uses `--format json --no-update-check` and prints one `meshy.cli/v1` envelope;
  writes carry the resolved `--workspace WORKSPACE`. Read returned paths and IDs rather than
  guessing.
- Submit cloud tasks once with `create --async`, retain their resource and lineage, and `wait`
  on the same task. Keep the turn active during waits. Unknown submission and interrupted
  downloads are recovery cases, not permission to generate again.
- Work within the approved scope and budget; propose additional paid stages before spending.
  Delivery describes applicable estimates. Local preparation and printability analysis are free.

## Finish the handoff

Show an available rendered preview and deliver file paths, dimensions, analysis/repair status
and reported charges. Launch a detected slicer only when requested or already authorized;
`launch_requested` does not prove successful import or start a physical printer. If no suitable
slicer is installed, still deliver the files. Explain relevant remaining checks, such as supports
and wall thickness, without describing an untested model as guaranteed printable.
