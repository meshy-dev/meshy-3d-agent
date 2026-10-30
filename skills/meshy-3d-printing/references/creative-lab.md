# Creative Lab products

Product-specific print pipelines. Placeholders, state, local preparation and slicer handoff are as
in [printing](printing.md); the runner and paths in [setup](setup.md); cost and hand-over in
[delivery](delivery.md).

Choose this route only when the user asks for the styled product itself: a figure, a big-head
vinyl figure, a brick minifigure, a lamp, a keychain, a fridge magnet, a keycap, a pixel-bead
fidget board or a collapsible fidget. An ordinary printable model of a person, animal or
character is a white or multicolor print in [printing](printing.md), not this.

Each product requires a photo-driven prototype, then a build of that **same product**. A
text-only request first needs a generated or selected image using the CLI image commands, adding
its own cost; do not pass text to a lamp prototype. Only successful prototypes created through
the API by the same account are accepted as build inputs; web-app prototypes are not
interchangeable.

Substitute PRODUCT in the commands below with
exactly `figure`, `vinyl-figure`, `brick-figure`, `lamp`, `keychain`, `fridge-magnet` or `keycap`.
`fidget-pixel` uses the same wait and download commands; only its prototype create below
adds `--type`:

```bash
meshy creative-lab PRODUCT prototype create --image-url INPUT_IMAGE --name "print product" --async --format json --no-update-check
meshy creative-lab PRODUCT prototype wait PROTOTYPE_ID --timeout 600 --format json --no-update-check
meshy download --resource creative-lab.PRODUCT.prototype --task-id PROTOTYPE_ID --list --format json --no-update-check
```

A keychain can carry a name: add `--name-text "TEXT"` (up to 10 characters, CJK included) to
its prototype. It prints as a flat coloured detail on the face, not raised or cut text; the build
inherits it, while `--name` only labels the task. The fidget board's
prototype needs the subject type, `person` (a chibi sprite) or `other` (a bead-art icon):

```bash
meshy creative-lab fidget-pixel prototype create --image-url INPUT_IMAGE --type person --name "print product" --async --format json --no-update-check
```

Review the returned concept image (lamp also supplies a lampshade GLB). Select the image's actual
asset key from the list if downloading a preview; do not guess a key. Continue to the intended
build if already authorized; ask only for a needed design choice or new cost outside the agreed
scope. Each create below is an **alternative**, not builds to run in sequence:

```bash
meshy creative-lab figure build create --input-task-id PROTOTYPE_ID --async --format json --no-update-check
meshy creative-lab lamp build create --input-task-id PROTOTYPE_ID --model-format stl --options '{"diameter_mm":180,"light_source_preset":"none"}' --async --format json --no-update-check
meshy creative-lab keychain build create --input-task-id PROTOTYPE_ID --model-format obj --options '{"size_mm":50}' --async --format json --no-update-check
meshy creative-lab fridge-magnet build create --input-task-id PROTOTYPE_ID --model-format obj --options '{"size_mm":60}' --async --format json --no-update-check
meshy creative-lab keycap build create --input-task-id PROTOTYPE_ID --candidate-id CANDIDATE_ID --async --format json --no-update-check
meshy creative-lab fidget-pixel build create --input-task-id PROTOTYPE_ID --async --format json --no-update-check
```

Figure, vinyl figure and brick figure have **no** build `--options` or `--model-format`; build the
latter two exactly like the figure, with their own product name. The keycap build needs
CANDIDATE_ID from the finished prototype's `candidate_ids` (it holds one entry); its `--options`
take `head_size_mm` and `vertical_offset_mm`. The fidget board builds one 3MF. The default
32 × 8 mm board is about 26.5 cm per side: set `grid_size` and `piece_size_mm` from the size the
user wants. Lamp `--image-subject
character|landscape` belongs on prototype create. With the default preset (`bambu_mh001_60mm`) the STL build
returns `lamp_stl`, the open-bottom shade with its base plate, and `base_stl`, the separate
fixture mount; `none` gives one sealed shade and no `base_stl`. Use the user's actual dimensions
and fixture. `--model-format zip --include-result-json` is the lamp bundle alternative; result JSON
cannot be requested with STL. Keychain and fridge-magnet accept GLB/OBJ/ZIP. Build help lists only
`--options <json>`; the fields are:

| Product | `--options` fields (default; range) |
|---|---|
| keychain, fridge-magnet | `size_mm` (keychain 40, magnet 60), `badge_shape` (`circle`, `rounded-rect`, `hexagon`, `shield`, `star`), `relief_height_mm`, `base_thickness_mm` (0–20), `remove_background` (true follows the subject's outline, false uses `badge_shape`) |
| fidget-pixel | `shape` `square`/`hex`, `grid_size` 16/32 (32), `piece_size_mm` 6/8/10 (8; hex 6 or 8), `color_count` 1–8 (8), `piece_height_mm` 10–80 (15) |
| lamp | `diameter_mm` 50–400 (150), `thickness_mm` up to 10 (1), `cut_amount_percent` 1–100, `light_source_preset` |

Each product's page at `https://docs.meshy.ai/en/api/creative-lab-PRODUCT` has the rest.

The collapsible fidget has a single stage, straight from the photo, with no prototype to review:

```bash
meshy creative-lab fidget-collapsible create --image-url INPUT_IMAGE --async --format json --no-update-check
meshy creative-lab fidget-collapsible wait BUILD_ID --timeout 600 --format json --no-update-check
```

Download it with `--resource creative-lab.fidget-collapsible --model-format stl`. For every
two-stage product, read BUILD_ID from the chosen create, note PROTOTYPE_ID as its parent, wait:

```bash
meshy creative-lab PRODUCT build wait BUILD_ID --timeout 600 --format json --no-update-check
meshy download --resource creative-lab.PRODUCT.build --task-id BUILD_ID --list --format json --no-update-check
```

Choose the actual delivered asset, not a guessed filename:

| Product / requested output | Selector | Delivered form |
|---|---|---|
| Figure | `--model-format obj` or `--model-format glb` | OBJ with MTL/texture dependencies, or GLB |
| Lamp STL | `--asset model.lamp_stl` | `lamp.stl` |
| Lamp fixture mount | `--asset model.base_stl`, **only if listed** | `base.stl` |
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
meshy download --resource creative-lab.lamp.build --task-id BUILD_ID --asset model.lamp_stl --output-dir "JOB_DIR/lamp" --workspace "WORKSPACE" --format json --no-update-check
```

For another listed asset, adapt the resource, selector and stage-specific output directory.
Repeat `--asset` to select multiple actual parts. The CLI does not extract archives; do not label
a downloaded ZIP as print-ready OBJ. Deliver the archive with extraction/import instructions, or
use the host's supported archive operation within the workspace after validating member paths and
symlinks. Do not create an extraction script inside the skill. Check the product's actual units
and orientation in the slicer; the generic Y-up rotation is not a blanket requirement for product
STL/3MF/relief bundles. A figure OBJ that is Y-up can use the local preparation recipe.

For multicolor figure/keychain/magnet, obtain the **textured build GLB** (request GLB for relief
builds when that is the intended route), then use `multi-color-print --model-url` as in the multicolor
section of [printing](printing.md). Never feed an OBJ ZIP or lamp STL into the GLB/FBX multicolor input. A second build is a
separate paid operation, so choose the intended output up front.
