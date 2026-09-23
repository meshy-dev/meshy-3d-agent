---
name: meshy-openclaw
description: "Create 3D models, textures, reference images, rigging and animation with Meshy, and prepare models for physical 3D printing: white or multicolor prints, Creative Lab products, sizing and slicer handoff. Drives the Meshy CLI; signs in through the browser, no API key required."
license: MIT-0
metadata:
  openclaw:
    emoji: "🧊"
    homepage: https://github.com/meshy-dev/meshy-3d-agent
    primaryEnv: MESHY_API_KEY
    requires:
      anyBins:
        - meshy
        - npm
    install:
      - id: node
        kind: node
        package: meshy-cli
        bins:
          - meshy
        label: Install Meshy CLI (npm)
---

# Meshy 3D — Generation + Printing

Use Meshy CLI **0.4.0** to turn the user's request into a delivered asset: the requested files
in the requested location, an inspected preview when one exists, and — for prints — the
intended size, analysis/repair results and a slicer handoff when asked. Login or task
submission alone is not completion. Choose the shortest suitable pipeline and reuse existing
assets for follow-ups.

## SECURITY MANIFEST

**Executables:** only the Meshy CLI — `meshy`, or the pinned temporary package
`npm exec --yes --package=meshy-cli@0.4.0 -- meshy`. No Python, no `curl`, no bundled scripts.

**Credentials:** the CLI's own browser sign-in (OAuth device flow) stores and refreshes a
session in `~/.config/meshy/credentials.json` (mode 0600). An existing `MESHY_API_KEY`, or an
explicit `--api-key-file`, is honoured and takes precedence. The skill never reads, prints or
copies a token, device code or key, and never asks for one in chat. `MESHY_API_KEY` is optional.

**Network:** the Meshy API (`api.meshy.ai`) and its sign-in page (`www.meshy.ai`); the media
hosts of assets being downloaded or input URLs being checked, without the credential; the npm
registry when the CLI is installed or run as a temporary package.

**Files:** writes only inside one workspace per job — the directory the user named, or
`./meshy_output` — and the CLI refuses paths that escape it, including through symlinks.
Existing files are not overwritten unless the user asked for it. Reads only input files the
user pointed at. Slicer handoff launches an already-installed slicer application.

**Data leaving this machine:** prompts, input images/models and task requests sent to Meshy.

## Read what this request needs

| Need | Reference |
|---|---|
| CLI runner, sign-in, or output location | [Setup](references/setup.md) |
| Digital assets: generation, texturing, rigging, animation, conversion, images | [Pipelines](references/pipelines.md) |
| Physical prints: local preparation, print generation, Creative Lab, slicers | [Printing recipes](references/printing.md) |
| Cost, waiting, preview, delivery, or finding a previous model | [Delivery](references/delivery.md) |
| Failed or uncertain operation | [Troubleshooting](references/troubleshooting.md) |

Read the relevant section when needed; recipes are examples to adapt, not stages to run in
full. An untextured model skips texturing; an existing GLB needs no conversion. Use command
`--help` when parameters are uncertain.

## Digital asset or physical print

Anything meant to be printed — a print, slicer, 3MF, STL, Bambu/Orca/Prusa/Cura, multicolor,
a desk toy or a physical figure — follows [Printing recipes](references/printing.md) **from the
first command**, so generation parameters fit the print. Everything else follows
[Pipelines](references/pipelines.md).

| Print request | Route |
|---|---|
| Scale, orient or ground an existing OBJ | Local `mesh prepare-print`; no sign-in or balance |
| Open an existing STL or 3MF | Local `slicer detect` and `slicer open`; no sign-in or balance |
| White model from text or photo | Geometry without textures; analyze/repair as needed; prepare the file |
| Multicolor model | Generate/reuse geometry; analyze/repair as needed; texture; multi-color-print |
| Creative Lab lamp, keychain, fridge magnet or figure template | Prototype → review → build → select product artifacts |

A figurine alone does not imply Creative Lab. Ask about size, color or style only when the
missing choice materially changes the result.

## First use and sign-in on OpenClaw

Resolve the runner as Setup describes: a compatible `meshy`, otherwise the pinned temporary
package. Local-only print work stops there. Everything else reuses a verified `auth status`
session; only when there is none, sign in:

1. Start `meshy auth login --device --format json --no-update-check` with `exec` and a short
   `yieldMs` (about 3000) and `timeoutSeconds: 900`, so it keeps running in the background and
   returns a `sessionId`.
2. The CLI prints `Enter code … at https://www.meshy.ai/device` on stderr within seconds. If the
   first output holds only npm notices, `process poll` that same `sessionId`. Send the user the
   URL as a link and the code **verbatim**, plus what to do: open it, sign in to Meshy if asked,
   type the code, approve. Nothing needs to be sent back in chat.
3. Do not start a second login, kill the session, or poll HTTP yourself; the CLI waits for the
   approval. When it exits, OpenClaw wakes this session; collect the result with `process poll`
   (a subagent, which gets no wake, polls before yielding). Then verify `auth status` and
   **continue the original request** with the inputs, path and budget already given.

A background session must not be detached with `&` or `nohup`. An expired or denied code means
running the same login again; it never justifies re-running a paid task. Long `wait` commands
behave the same way: let `exec` background them and resume from the completion wake, rather
than re-submitting or looping on `sleep`.

## Execution boundaries

- Run API, upload, download and mesh operations through the CLI. Local inputs have a 50 MiB
  limit; use the supported URL input route where appropriate.
- Business commands use `--output-schema v1 --format json --no-update-check`; auth has its own
  JSON shape. Resolve `WORKSPACE` from the user's output path and pass it to every write.
- Submit once with `create --async`, keep the owning resource and task ID, then `wait` on that
  task. Timeouts and unknown submissions follow Troubleshooting; they never authorize another
  paid create.
- Work within the approved scope and budget; propose additional paid stages or reruns before
  spending. Local preparation and printability analysis are free; Delivery covers estimates.
- Repair changes geometry and drops textures: use the repaired geometry downstream and
  retexture before multicolor output. Prepare a Y-up OBJ once, as a new file; never apply that
  transform to STL, 3MF or relief product output.

## Deliver

Download only the needed assets. Send the user an available rendered preview as an image; a
missing preview is stated, never implied, and a rendered PNG is not a 3D viewer. Report file
paths, task IDs for follow-ups, and the actual charge. For prints also report dimensions and
analysis/repair status; launch a detected slicer only when requested, and note that
`launch_requested` does not prove the model was imported. Mention relevant remaining checks,
such as supports and wall thickness, without calling an untested model guaranteed printable.
