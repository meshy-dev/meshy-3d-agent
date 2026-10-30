# Printing recipes

Use [Setup](setup.md) for the runner, login and path rules, [Delivery](delivery.md) for cost,
previews and hand-over, and [Troubleshooting](troubleshooting.md) for recovery. These recipes
target **Meshy CLI 0.7** (0.7.1 or later) on Node.js 22.12+. Parameter details come from each command's `--help`;
the skill carries no API client.

Contents: 0 local-only work · state · print size · 1 white prints · 2 analysis and repair · 3 multicolor ·
4 split into parts. Creative Lab products are in [creative-lab](creative-lab.md).

## 0. Local-only work needs no account

These commands are local: no credential, no balance check, no network, no cost. When the user
already has the geometry and only wants it prepared or opened, this is the whole job.

```bash
meshy slicer detect --format json --no-update-check
meshy mesh prepare-print "SOURCE_OBJ" --height-mm 75 --output "OUTPUT_FILE" --workspace "WORKSPACE" --format json --no-update-check
meshy slicer open --slicer SLICER_ID --file "OUTPUT_FILE" --format json --no-update-check
```

`mesh prepare-print` rotates Y-up to Z-up, scales to the requested height, centers XY and
grounds Z=0, and rejects degenerate input. It writes a new file — use `--output`, never
`--in-place` — and keeps MTL/texture dependencies unless `--geometry-only` is given. Treat an STL
or 3MF the user already has as print-oriented unless they say otherwise: open it, do not run the
OBJ transform on it. `slicer detect` returning an empty list is a valid answer: deliver the prepared file and
say which slicers the CLI knows how to launch. `launch_requested` means the application was
started, not that the import succeeded.

Only leave this section when the job actually needs Meshy to make or change a model.

## Carry state explicitly

Uppercase tokens are placeholders, not literal arguments or shell variables. Read each JSON
result before forming the next command. Keep `{resource, task_id, parent_task_id}` for each
stage in your notes: these recipes deliver with `download` and `mesh prepare-print`, which leave
no sidecar. `WORKSPACE`, `JOB_DIR` and `OUTPUT_FILE` come from the user's requested location as
resolved in [Setup](setup.md). All create commands use `--async`; read `result.submission.task_id`
as the ID named in the next step, and `wait` blocks until that task is terminal. Pass
`--workspace WORKSPACE` on every command that writes a file (download, `-o`, mesh preparation);
create and wait write nothing there. Local CLI credential and journal storage is controlled
separately by CLI configuration.

For an existing job, use its originating resource and task ID (Delivery says where to find
them). Never query an image task through text-to-3d. An ID is not interchangeable with its asset URL. `--input-task-id` is
only for task types the destination command explicitly accepts; otherwise take a supported model
URL from the completed task, or its downloaded local model. Never pass both source forms and
hope the right one wins.

## Print size

Only an OBJ is sized here, by `mesh prepare-print`. Cloud print files (a multicolor 3MF, split
parts, product STLs) arrive in millimetres at a size Meshy chooses, not the user's: scale them
uniformly in the slicer to the requested size, and in the hand-over say which size to set rather
than claiming the file already has it.

## 1. White geometry from text or photo

A plain single-colour print is this route — generation, optional analysis, local preparation.
The word "figurine", "statue" or "toy" does not by itself send the job to Creative Lab.

Choose **one** creation route. Text preview is untextured geometry:

```bash
meshy text-to-3d create --mode preview --prompt "A sturdy small owl figurine on a broad flat base" --target-formats glb,obj --async --format json --no-update-check
meshy text-to-3d wait TEXT_ID --timeout 600 --format json --no-update-check
```

Or use the user's photo (local JPG/PNG/WebP or a supported URL):

```bash
meshy image-to-3d create --image-url INPUT_IMAGE --should-texture false --target-formats glb,obj --async --format json --no-update-check
meshy image-to-3d wait IMAGE_ID --timeout 600 --format json --no-update-check
```

`--should-texture false` is deliberate for a white print: the CLI textures an image by default,
and texturing is a paid stage nobody asked for. Only after `SUCCEEDED`, set SOURCE_ID and
SOURCE_RESOURCE to that task. Run analysis below when required; if repair changes the model, set CURRENT_RESOURCE/CURRENT_ID to the repair task
instead. Otherwise CURRENT equals SOURCE. Download from **CURRENT**, not an earlier preview:

```bash
meshy download --resource CURRENT_RESOURCE --task-id CURRENT_ID --model-format obj --output-dir "JOB_DIR/white-model" --workspace "WORKSPACE" --format json --no-update-check
```

OBJ selection includes MTL/textures when present. Read `result.downloads.files` to identify
OBJ_PATH, then prepare it with the local recipe in section 0, writing to the user's requested
location. A repaired model is GLB only, so after a repair this is the normal path: if OBJ is absent, use
`download --list` to inspect actual assets and propose conversion of the **current** model to OBJ; conversion is an additional paid operation, not a
reason to regenerate. Use `convert create --help` for its source/target parameters. GLB may
instead be delivered for a slicer that supports it. Replace 75 mm with the requested height
(15 cm = 150 mm).

## 2. Analyze, optionally repair, preserve lineage

Analysis is free and returns a report, not model assets. By ID it takes a successful
image-to-3d, multi-image-to-3d, text-to-3d, remesh or retexture task made with Meshy 6 or newer,
or a repair result (see help). Other sources, such as a Creative Lab build, use a supported
**model URL** instead of assuming their IDs are accepted.

```bash
meshy analyze-printability create --input-task-id SOURCE_ID --async --format json --no-update-check
meshy analyze-printability wait ANALYSIS_ID --timeout 600 --format json --no-update-check
```

When the printer or the print size is known, add `--printer-type fdm|sla|full_color` and the
planned size, `--intended-print-height-mm N` (GLB input only) or `--intended-print-longest-side-mm
N`, to the analysis create. It then also checks wall thickness at that size against the
printer's minimum (FDM 1.0 mm, SLA 0.8 mm, full colour 2.0 mm) and reports it in
`printability.thin_walls`; this takes longer. Either one alone is enough: a printer alone is
checked at 150 mm tall (an STL at its own size; an OBJ, FBX or glTF URL at 150 mm on its longest
side), a size alone assumes FDM. Use the user's real
size rather than inventing one. Without either, wall thickness is not checked.

Read `result.task.printability`, distinguish task completion from report
`healthy`/`warning`/`error`, and describe holes, non-manifold or degenerate geometry and volume
findings. A missing report is unknown, not healthy. Repair errors when the intended print
requires it; discuss relevant warnings. Retain existing user authorization; ask only if this
additional paid repair is outside it.

```bash
meshy repair-printability create --input-task-id SOURCE_ID --async --format json --no-update-check
meshy repair-printability wait REPAIR_ID --timeout 600 --format json --no-update-check
```

Repair also takes ANALYSIS_ID as its `--input-task-id`, unless that analysis was made from an
STL, FBX or glTF URL; repair those with the same `--model-url`. An analysis that checked wall thickness
hands over its printer and size, so that repair also thickens walls that are too thin (only when
more than 5% of the surface is); `--printer-type` and a print size on the repair set or override
them. A repair keeps the model's scale and, from a task ID, returns GLB. Pass ANALYSIS_ID to
repair only, never to another model endpoint.

For uploaded models replace `--input-task-id SOURCE_ID` with `--model-url MODEL_SOURCE` in
create. Both accept GLB, glTF, OBJ, FBX or STL from an http(s) URL, and repair returns the
input's format; a **local** file must be GLB or glTF, and the CLI refuses a local STL/OBJ/FBX
(exit 2) before sending it. Local input and base64 data URIs have a **50 MiB CLI limit**; this
is stricter than the API's advertised limit and is not raised by passing a file to `--data`. An
http(s) model URL can be larger (up to 400 MB for analysis and repair) and is not subject to it.

Set CURRENT_RESOURCE=`repair-printability`, CURRENT_ID=REPAIR_ID. Inspect its model assets.
Re-analyze with `--input-task-id REPAIR_ID`, and use that repaired model for printing,
conversion and texturing. Repair discards textures; a previously textured source cannot stand
in for the repaired mesh.

## 3. Multicolor 3MF

Only relevant when the user wants colour in the print. Detect a slicer with multicolor support
before incurring multicolor-specific costs; when none is found, say so and ask whether to go on,
since the 3MF can still be delivered. The CLI recognizes OrcaSlicer, Bambu Studio, Creality
Print, Elegoo Slicer and Anycubic Slicer Next as multicolor-capable; report the actual detection,
not an assumed install. Default to 4 colors/depth 4 unless the request specifies otherwise;
supported colors 1–16 and depth 3–6.

The input must carry textures. An unrepaired image-to-3d task made with the CLI's default
texturing already does: pass it straight to `multi-color-print`. If an unrepaired text-to-3d preview is still the current geometry,
texture it using its own preview ID:

```bash
meshy text-to-3d create --mode refine --preview-task-id TEXT_ID --target-formats glb --async --format json --no-update-check
meshy text-to-3d wait TEXTURED_ID --timeout 600 --format json --no-update-check
```

Refine cannot texture an image-to-3d, imported or repaired model. Retexture takes the current task by
ID: the image task, or after a repair the repair task (its GLB):

```bash
meshy retexture create --input-task-id CURRENT_ID --text-style-prompt "Natural owl colors with a warm brown body and cream face" --target-formats glb --async --format json --no-update-check
meshy retexture wait TEXTURED_ID --timeout 600 --format json --no-update-check
```

Pass a model URL or the downloaded GLB only when the ID is refused; a URL taken from a task
expires with it, so use it at once rather than storing it. Replace the style with the user's
requested look. Use only one style input. After repair,
CURRENT_ID here is REPAIR_ID; this preserves lineage instead of mistakenly returning to the
original mesh. After `SUCCEEDED`, an accepted textured task can be passed to multicolor:

```bash
meshy multi-color-print create --input-task-id TEXTURED_ID --max-colors 4 --max-depth 4 --async --format json --no-update-check
meshy multi-color-print wait MULTICOLOR_ID --timeout 600 --format json --no-update-check
meshy download --resource multi-color-print --task-id MULTICOLOR_ID --model-format 3mf --output-dir "JOB_DIR/multicolor" --workspace "WORKSPACE" --format json --no-update-check
meshy slicer open --slicer SLICER_ID --file DOWNLOADED_3MF_PATH --format json --no-update-check
```

`--style realistic` (the default) samples colours from the texture and is the only style that
uses `--max-depth`; `--style cartoon` makes flat colour regions and a smaller file. Set
`--printer-brand` to the user's printer family (`bambu` by default; also `anycubic`, `creality`,
`elegoo`, `flashforge`, `prusa`, `qidi`, `snapmaker`, `ankermake`) so the 3MF carries that
slicer's preset.

Multicolor reads at most 8,000,000 faces (400, no charge, above that): remesh first and pass the
remesh ID. PrusaSlicer is not detected as multicolor-capable, but `--printer-brand prusa` still
makes a 3MF for a Prusa MMU.

For a textured Creative Lab build or external model, replace the create source with
`--model-url TEXTURED_GLB_URL`: an http(s) GLB or FBX URL, or a local GLB. Do not pass a
Creative Lab build ID as `--input-task-id`. 3MF is already a print format; do not run OBJ coordinate preparation on it.
Merely converting GLB to 3MF does not substitute for multicolor segmentation.

## 4. Split a model into printable parts

Use Auto Split when the user wants the model printed in pieces: to fit the build plate, to print
parts in different colours, or to avoid supports. It takes a successful image-to-3d,
multi-image-to-3d, text-to-3d preview, remesh, convert or resize task whose model was generated
with Meshy 6 or 7 (see help). It refuses Smart Topology (meshy-t2/t2.5) models, repair and
retexture results, and any model from outside Meshy, even after a remesh, convert or resize; do
not pay for one of those steps to get a model in. Split the generation task, or its
remesh/convert/resize, before any repair.

```bash
meshy auto-split create --input-task-id SOURCE_ID --mode by_parts --prompt "head, body, base" --target-formats glb,3mf --layout on_plate --async --format json --no-update-check
meshy auto-split wait SPLIT_ID --timeout 600 --format json --no-update-check
meshy download --resource auto-split --task-id SPLIT_ID --model-format 3mf --output-dir "JOB_DIR/parts" --workspace "WORKSPACE" --format json --no-update-check
```

`--mode auto` (the default) lets Meshy choose the cuts and needs no prompt. `by_parts` cuts along
the 1–10 parts named in `--prompt`, in any language; name the pieces rather than describing the
model. Geometry the prompt does not name becomes one more part. When Meshy reads no part names from the
prompt, it splits along the parts it finds in the model's reference image, still charges, and
marks the task `prompt_ignored: true`: check that field and tell the user (with no reference
image, or fewer than 2 parts found in it, the request fails with 400 and no charge). Above 8,000,000 faces, remesh first. `by_color` cuts along named colour regions and needs an image-to-3d or multi-image-to-3d
source. GLB always comes back; every other format except STL keeps each part as its own object,
and STL fuses them into one solid, so do not deliver STL for separate parts. `--layout on_plate`
lays the parts out ready to slice, `assembled` keeps them in place. `--connectors true` adds
mortise-and-tenon joints at each cut. The parts get flat colours and the input texture is not
carried over: for a print in several colours, assign a filament per part in the slicer.
