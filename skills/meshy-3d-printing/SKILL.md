---
name: meshy-3d-printing
description: Generate or prepare models for physical 3D printing, including white or multicolor prints, Creative Lab products, sizing, and slicer handoff.
license: MIT
---

# Meshy 3D Printing

Use Meshy CLI **0.4.0** to deliver the requested print files at the intended size, with
analysis/repair results where applicable and a slicer handoff when requested. This skill is
self-contained. Ordinary digital assets belong to meshy-3d-generation.

| Need | Reference |
|---|---|
| CLI runner, credentials, or output location | [Setup](references/setup.md) |
| Local preparation, cloud generation, or product workflow | [Printing recipes](references/printing.md) |
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
| Creative Lab lamp, keychain, fridge magnet or figure template | Prototype → review → build → select product artifacts |

A figurine does not by itself require Creative Lab. Infer the route from the intended product;
ask about size, color or style only when the missing choice materially changes the result.
For an existing model, distinguish local preparation from cloud printability analysis; a
local dimension check cannot establish full printability.

## Cloud authorization

Resolve the runner automatically using Setup (compatible `meshy` or
`npm exec --yes --package=meshy-cli@0.4.0 -- meshy …`). Local-only work stops at runner setup.
Cloud work reuses a verified session. If login is needed, keep `auth login --device` running,
show its URL and user code in **commentary/progress, never a final answer**, and await the
same tool session in this turn. After it exits, verify `auth status` and resume the print job.
Do not ask for a "done" message or credentials in chat; Setup has the host wait procedure.

## Printing-specific constraints

- Repair changes geometry and drops textures. Use repaired geometry downstream and retexture
  before multicolor output. Use analysis when functional parts, thin features or other
  requirements make it relevant; its report does not establish material suitability.
- Prepare a Y-up OBJ as a new Z-up file at the requested height, centered and grounded. Do not
  repeat the transform or apply it to STL, 3MF, or relief product output. A multicolor 3MF
  requires no OBJ conversion. Product ZIPs and optional lamp bases have distinct handling in
  Printing recipes.
- API, downloads and geometry operations use the CLI. Local inputs have a 50 MiB limit.
  Business commands use `--output-schema v1 --format json --no-update-check`; writes carry
  the resolved `--workspace WORKSPACE`. Read returned paths and IDs rather than guessing.
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
