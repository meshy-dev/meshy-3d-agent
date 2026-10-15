# Printing recipes

Use [Setup](setup.md) for the runner, login and path rules, [Delivery](delivery.md) for cost,
previews and hand-over, and [Troubleshooting](troubleshooting.md) for recovery. These recipes
target **meshy-cli@0.4.3** on Node.js 22.12+. Parameter details come from each command's `--help`;
the skill carries no API client.

## 0. Local-only work needs no account

These commands are local: no credential, no balance check, no network, no cost. When the user
already has the geometry and only wants it prepared or opened, this is the whole job.

```bash
meshy slicer detect --output-schema v1 --format json --no-update-check
meshy mesh prepare-print "SOURCE_OBJ" --height-mm 75 --output "OUTPUT_FILE" --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy slicer open --slicer SLICER_ID --file "OUTPUT_FILE" --output-schema v1 --format json --no-update-check
```

`mesh prepare-print` rotates Y-up to Z-up, scales to the requested height, centers XY and
grounds Z=0, and rejects degenerate input. It writes a new file — use `--output`, never
`--in-place` — and keeps MTL/texture dependencies unless `--geometry-only` is given. An STL or
3MF the user already has is already in print orientation: open it, do not run the OBJ transform
on it. `slicer detect` returning an empty list is a valid answer: deliver the prepared file and
say which slicers the CLI knows how to launch. `launch_requested` means the application was
started, not that the import succeeded.

Only leave this section when the job actually needs Meshy to make or change a model.

## Carry state explicitly

Uppercase tokens are placeholders, not literal arguments or shell variables. Read each JSON
result before forming the next command. Keep `{resource, task_id, parent_task_id, project_dir}`
for each stage. `WORKSPACE`, `PROJECT_ROOT` and `OUTPUT_FILE` come from the user's requested
location as resolved in [Setup](setup.md). Use one initialized project per user job:

```bash
meshy project init --root "PROJECT_ROOT" --name "print project" --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
```

Read `result.project_dir` as PROJECT_DIR. All following create commands use `--async`; read
`result.submission.task_id` as the ID named in the next step. `wait --project` saves
`task_ID.json` and records the result. Pass `--workspace WORKSPACE` on every writing command,
including create (submission/project state), wait, download, record and mesh preparation. Local
CLI credential and journal storage is controlled separately by CLI configuration.

For an existing job, use its initialized project and originating resource. Never query an image
task through text-to-3d. An ID is not interchangeable with its asset URL. `--input-task-id` is
only for task types the destination command explicitly accepts; otherwise take a supported model
URL from the completed task, or its downloaded local model. Never pass both source forms and
hope the right one wins.

## 1. White geometry from text or photo

A plain single-colour print is this route — generation, optional analysis, local preparation.
The word "figurine", "statue" or "toy" does not by itself send the job to Creative Lab.

Choose **one** creation route. Text preview is untextured geometry:

```bash
meshy text-to-3d create --mode preview --prompt "A sturdy small owl figurine on a broad flat base" --target-formats glb,obj --async --project "PROJECT_DIR" --stage geometry --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy text-to-3d wait TEXT_ID --timeout 600 --project "PROJECT_DIR" --stage geometry --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
```

Or use the user's photo (local JPG/PNG/WebP or a supported URL):

```bash
meshy image-to-3d create --image-url INPUT_IMAGE --should-texture false --target-formats glb,obj --async --project "PROJECT_DIR" --stage geometry --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy image-to-3d wait IMAGE_ID --timeout 600 --project "PROJECT_DIR" --stage geometry --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
```

`--should-texture false` is deliberate for a white print: texturing is a paid stage nobody asked
for. Only after `SUCCEEDED`, set SOURCE_ID and SOURCE_RESOURCE to that task. Run analysis below
when required; if repair changes the model, set CURRENT_RESOURCE/CURRENT_ID to the repair task
instead. Otherwise CURRENT equals SOURCE. Download from **CURRENT**, not an earlier preview:

```bash
meshy download --resource CURRENT_RESOURCE --task-id CURRENT_ID --model-format obj --output-dir "PROJECT_DIR/white-model" --project "PROJECT_DIR" --stage white-model --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
```

OBJ selection includes MTL/textures when present. Read `result.downloads.files` to identify
OBJ_PATH, then prepare it with the local recipe in section 0, writing to the user's requested
location. If OBJ is absent, use `download --list` to inspect actual assets and propose
conversion of the **current** model to OBJ; conversion is an additional paid operation, not a
reason to regenerate. Use `convert create --help` for its source/target parameters. GLB may
instead be delivered for a slicer that supports it. Replace 75 mm with the requested height
(15 cm = 150 mm).

## 2. Analyze, optionally repair, preserve lineage

Analysis is free and returns a report, not model assets. By ID it takes a successful
image-to-3d, multi-image-to-3d, text-to-3d, remesh or retexture task made with Meshy 6 or newer,
or a repair result (see help). Other sources, such as a Creative Lab build, use a supported
**model URL** instead of assuming their IDs are accepted.

```bash
meshy analyze-printability create --input-task-id SOURCE_ID --async --project "PROJECT_DIR" --stage analysis --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy analyze-printability wait ANALYSIS_ID --timeout 600 --project "PROJECT_DIR" --stage analysis --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
```

When the printer or the print size is known, add `--printer-type fdm|sla|full_color` and the
planned size, `--intended-print-height-mm N` (GLB input only) or `--intended-print-longest-side-mm
N`, to the analysis create. It then also checks wall thickness at that size against the
printer's minimum (FDM 1.0 mm, SLA 0.8 mm, full colour 2.0 mm) and reports it in
`printability.thin_walls`; this takes longer. Either one alone is enough: a printer alone is
checked at 150 mm tall (an STL at its own size), a size alone assumes FDM. Use the user's real
size rather than inventing one. Without either, wall thickness is not checked.

Read `result.task.printability`, distinguish task completion from report
`healthy`/`warning`/`error`, and describe holes, non-manifold or degenerate geometry and volume
findings. A missing report is unknown, not healthy. Repair errors when the intended print
requires it; discuss relevant warnings. Retain existing user authorization; ask only if this
additional paid repair is outside it.

```bash
meshy repair-printability create --input-task-id SOURCE_ID --async --project "PROJECT_DIR" --stage repaired --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy repair-printability wait REPAIR_ID --timeout 600 --project "PROJECT_DIR" --stage repaired --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy project record --project "PROJECT_DIR" --task-id REPAIR_ID --resource repair-printability --parent-task-id SOURCE_ID --stage repaired --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
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
is stricter than the API's advertised model limit and is not raised by passing a file to `--data`.

Set CURRENT_RESOURCE=`repair-printability`, CURRENT_ID=REPAIR_ID. Inspect its model assets.
Re-analyze with `--input-task-id REPAIR_ID`, and use that repaired model for printing,
conversion and texturing. Repair discards textures; a previously textured source cannot stand
in for the repaired mesh.

## 3. Multicolor 3MF

Only relevant when the user wants colour in the print. Detect a slicer with multicolor support
before incurring multicolor-specific costs. The CLI recognizes OrcaSlicer, Bambu Studio, Creality
Print, Elegoo Slicer and Anycubic Slicer Next as multicolor-capable; report the actual detection,
not an assumed install. Default to 4 colors/depth 4 unless the request specifies otherwise;
supported colors 1–16 and depth 3–6.

The input must carry textures. If an unrepaired text-to-3d preview is still the current geometry,
texture it using its own preview ID:

```bash
meshy text-to-3d create --mode refine --preview-task-id TEXT_ID --target-formats glb --async --project "PROJECT_DIR" --stage textured --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy text-to-3d wait TEXTURED_ID --timeout 600 --project "PROJECT_DIR" --stage textured --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
```

Refine cannot texture an image-to-3d, imported or repaired model. For an accepted image task,
retexture may use `--input-task-id IMAGE_ID`; for a repaired or unsupported task type, use its
actual model URL or local GLB. Read the repaired output URL as CURRENT_MODEL_URL:

```bash
meshy retexture create --model-url CURRENT_MODEL_URL --text-style-prompt "Natural owl colors with a warm brown body and cream face" --target-formats glb --async --project "PROJECT_DIR" --stage textured --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy retexture wait TEXTURED_ID --timeout 600 --project "PROJECT_DIR" --stage textured --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy project record --project "PROJECT_DIR" --task-id TEXTURED_ID --resource retexture --parent-task-id CURRENT_ID --stage textured --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
```

Replace the style with the user's requested look. Use only one style input. After repair,
CURRENT_ID here is REPAIR_ID; this preserves lineage instead of mistakenly returning to the
original mesh. After `SUCCEEDED`, an accepted textured task can be passed to multicolor:

```bash
meshy multi-color-print create --input-task-id TEXTURED_ID --max-colors 4 --max-depth 4 --async --project "PROJECT_DIR" --stage multicolor --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy multi-color-print wait MULTICOLOR_ID --timeout 600 --project "PROJECT_DIR" --stage multicolor --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy download --resource multi-color-print --task-id MULTICOLOR_ID --model-format 3mf --output-dir "PROJECT_DIR/multicolor" --project "PROJECT_DIR" --stage multicolor --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy slicer open --slicer SLICER_ID --file DOWNLOADED_3MF_PATH --output-schema v1 --format json --no-update-check
```

`--style realistic` (the default) samples colours from the texture and is the only style that
uses `--max-depth`; `--style cartoon` makes flat colour regions and a smaller file. Set
`--printer-brand` to the user's printer family (`bambu` by default; also `anycubic`, `creality`,
`elegoo`, `flashforge`, `prusa`, `qidi`, `snapmaker`, `ankermake`) so the 3MF carries that
slicer's preset.

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
meshy auto-split create --input-task-id SOURCE_ID --mode by_parts --prompt "head, body, base" --target-formats glb,3mf --layout on_plate --async --project "PROJECT_DIR" --stage split --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy auto-split wait SPLIT_ID --timeout 600 --project "PROJECT_DIR" --stage split --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy download --resource auto-split --task-id SPLIT_ID --model-format 3mf --output-dir "PROJECT_DIR/parts" --project "PROJECT_DIR" --stage split --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
```

`--mode auto` (the default) lets Meshy choose the cuts and needs no prompt. `by_parts` cuts along
the 1–10 parts named in `--prompt`, in any language; name the pieces rather than describing the
model. When Meshy reads no part names from the prompt, it splits along parts of its own choosing,
still charges, and marks the task `prompt_ignored: true`: check that field and tell the user. `by_color` cuts along named colour regions and needs an image-to-3d or multi-image-to-3d
source. GLB always comes back; every other format except STL keeps each part as its own object,
and STL fuses them into one solid, so do not deliver STL for separate parts. `--layout on_plate`
lays the parts out ready to slice, `assembled` keeps them in place. `--connectors true` adds
mortise-and-tenon joints at each cut. The parts get flat colours and the input texture is not
carried over: for a print in several colours, assign a filament per part in the slicer.

## 5. Creative Lab: product-specific pipelines

Choose this route only when the user asks for the styled product itself: a figure, a big-head
vinyl figure, a brick minifigure, a lamp, a keychain, a fridge magnet, a keycap, a pixel-bead
fidget board or a collapsible fidget. An ordinary printable model of a person, animal or
character is section 1, not this.

Each product requires a photo-driven prototype, then a build of that **same product**. A
text-only request first needs a generated or selected image using the CLI image commands, adding
its own cost; do not pass text to a lamp prototype. Only successful prototypes created through
this API with the matching credential are accepted as build inputs; web-app prototypes are not
interchangeable.

Create the project using the initial recipe before any commands below. Substitute PRODUCT with
exactly `figure`, `vinyl-figure`, `brick-figure`, `lamp`, `keychain`, `fridge-magnet` or `keycap`.
`fidget-pixel` uses the same wait, download and record commands; only its prototype create below
adds `--type`:

```bash
meshy creative-lab PRODUCT prototype create --image-url INPUT_IMAGE --name "print product" --async --project "PROJECT_DIR" --stage prototype --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy creative-lab PRODUCT prototype wait PROTOTYPE_ID --timeout 600 --project "PROJECT_DIR" --stage prototype --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy download --resource creative-lab.PRODUCT.prototype --task-id PROTOTYPE_ID --list --output-schema v1 --format json --no-update-check
```

A keychain can carry engraved text: add `--name-text "TEXT"` (up to 10 characters) to its
prototype; the build inherits it, while `--name` only labels the task. The fidget board's
prototype needs the subject type, `person` (a chibi sprite) or `other` (a bead-art icon):

```bash
meshy creative-lab fidget-pixel prototype create --image-url INPUT_IMAGE --type person --name "print product" --async --project "PROJECT_DIR" --stage prototype --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
```

Review the returned concept image (lamp also supplies a lampshade GLB). Select the image's actual
asset key from the list if downloading a preview; do not guess a key. Continue to the intended
build if already authorized; ask only for a needed design choice or new cost outside the agreed
scope. Each create below is an **alternative**, not builds to run in sequence:

```bash
meshy creative-lab figure build create --input-task-id PROTOTYPE_ID --async --project "PROJECT_DIR" --stage build --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy creative-lab lamp build create --input-task-id PROTOTYPE_ID --model-format stl --options '{"diameter_mm":180,"light_source_preset":"none"}' --async --project "PROJECT_DIR" --stage build --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy creative-lab keychain build create --input-task-id PROTOTYPE_ID --model-format obj --options '{"size_mm":50}' --async --project "PROJECT_DIR" --stage build --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy creative-lab fridge-magnet build create --input-task-id PROTOTYPE_ID --model-format obj --options '{"size_mm":60}' --async --project "PROJECT_DIR" --stage build --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy creative-lab keycap build create --input-task-id PROTOTYPE_ID --candidate-id CANDIDATE_ID --async --project "PROJECT_DIR" --stage build --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy creative-lab fidget-pixel build create --input-task-id PROTOTYPE_ID --async --project "PROJECT_DIR" --stage build --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
```

Figure, vinyl figure and brick figure have **no** build `--options` or `--model-format`; build the
latter two exactly like the figure, with their own product name. The keycap build needs
CANDIDATE_ID from the finished prototype's `candidate_ids` (it holds one entry); its `--options`
take `head_size_mm` and `vertical_offset_mm`. The fidget board builds one 3MF; its `--options`
(shape, 16 or 32 grid, piece size and height, colour count) are in its build help. The default
32 × 8 mm board is about 26 cm per side: set `grid_size` and `piece_size_mm` from the size the
user wants. Lamp `--image-subject
character|landscape` belongs on prototype create. Lamp STL returns the shade and optionally a
fixture base when the selected light-source preset provides one: `none` must not be assumed to
yield `base_stl`; `bambu_mh001_60mm` is a supported preset. Use the user's actual dimensions and
fixture. `--model-format zip --include-result-json` is the lamp bundle alternative; result JSON
cannot be requested with STL. Keychain and fridge-magnet accept GLB/OBJ/ZIP and relief options;
inspect their build help before setting shape, backing or thickness.

The collapsible fidget has a single stage, straight from the photo, with no prototype to review:

```bash
meshy creative-lab fidget-collapsible create --image-url INPUT_IMAGE --async --project "PROJECT_DIR" --stage build --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy creative-lab fidget-collapsible wait BUILD_ID --timeout 600 --project "PROJECT_DIR" --stage build --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
```

Download it with `--resource creative-lab.fidget-collapsible --model-format stl`. For every
two-stage product, read BUILD_ID from the chosen create; wait and record its parent:

```bash
meshy creative-lab PRODUCT build wait BUILD_ID --timeout 600 --project "PROJECT_DIR" --stage build --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy project record --project "PROJECT_DIR" --task-id BUILD_ID --resource creative-lab.PRODUCT.build --parent-task-id PROTOTYPE_ID --stage build --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
meshy download --resource creative-lab.PRODUCT.build --task-id BUILD_ID --list --output-schema v1 --format json --no-update-check
```

Choose the actual delivered asset, not a guessed filename:

| Product / requested output | Selector | Delivered form |
|---|---|---|
| Figure | `--model-format obj` or `--model-format glb` | OBJ with MTL/texture dependencies, or GLB |
| Lamp STL | `--asset model.lamp_stl` | `lamp.stl` |
| Lamp optional base | `--asset model.base_stl`, **only if listed** | `base.stl` |
| Lamp ZIP | `--asset model.bundle_zip` | `bundle.zip` |
| Keychain / fridge-magnet GLB | `--model-format glb` | GLB |
| Keychain / fridge-magnet OBJ | `--asset model.obj` | **model.obj.zip**, containing OBJ/MTL/texture |
| Keychain / fridge-magnet ZIP | `--asset model.bundle_zip` | ZIP bundle |
| Vinyl / brick figure | as Figure | as Figure |
| Keycap GLB | `--model-format glb` | GLB, real-world millimetres |
| Keycap OBJ | `--asset model.obj_zip` | ZIP bundle with OBJ/MTL/texture |
| Fidget board | `--model-format 3mf` | one 3MF, one object per piece |
| Collapsible fidget | `--model-format stl` (resource `creative-lab.fidget-collapsible`) | STL; a preview GLB when listed |

A concrete lamp-shade download (only for the STL build):

```bash
meshy download --resource creative-lab.lamp.build --task-id BUILD_ID --asset model.lamp_stl --output-dir "PROJECT_DIR/lamp" --project "PROJECT_DIR" --stage build --workspace "WORKSPACE" --output-schema v1 --format json --no-update-check
```

For another listed asset, adapt the resource, selector and stage-specific output directory.
Repeat `--asset` to select multiple actual parts. The CLI does not extract archives; do not label
a downloaded ZIP as print-ready OBJ. Deliver the archive with extraction/import instructions, or
use the host's supported archive operation within the project after validating member paths and
symlinks. Do not create an extraction script inside the skill. Check the product's actual units
and orientation in the slicer; the generic Y-up rotation is not a blanket requirement for product
STL/3MF/relief bundles. A figure OBJ that is Y-up can use the local preparation recipe.

For multicolor figure/keychain/magnet, obtain the **textured build GLB** (request GLB for relief
builds when that is the intended route), then use `multi-color-print --model-url` as described
above. Never feed an OBJ ZIP or lamp STL into the GLB/FBX multicolor input. A second build is a
separate paid operation, so choose the intended output up front.

## 6. Cost and recovery

Estimate sources, spend rules, progress reporting and hand-over are in [Delivery](delivery.md):
`meshy make --dry-run` covers only the text/image-to-3D chains it runs, and everything else is
quoted from the dated published price list. Explain the selected stages — generation, optional
repair, texturing, multicolor, splitting, or Creative Lab prototype/build — and honour an already approved
scope without re-asking between its stages. A new design variant or a previously unapproved
repair or build is its own decision.

Timeout or interruption does not cancel the server task. Keep the accepted ID and rerun its
matching wait/get. For an unknown submission outcome, inspect journal/recovery information and
stop before another POST; never manufacture a replacement task to fix a missing local snapshot.
Partial downloads resume only the missing assets. Preserve source files, project lineage and the
CLI's existing shared login throughout recovery.
