---
name: meshy-3d-generation
description: "Generates and edits digital 3D assets with the Meshy CLI: text-to-3D and image-to-3D models, texturing, remeshing and LODs, UV unwrapping, format conversion (GLB, FBX, OBJ, USDZ, STL, 3MF, Blender), rigging, animation, motion clips from text and reference images. Use when the user asks to make, texture, rig, animate or convert a 3D model or game asset. For physical 3D printing use meshy-3d-printing."
license: MIT
compatibility: "Needs Node.js 22.12+ and the Meshy CLI 0.7.x, 0.7.3 or later (npm install -g meshy-cli@0.7); network access to the Meshy API."
---

# Meshy 3D Generation

Use Meshy CLI **0.7** (0.7.3 or later) to turn the user's request into a delivered asset. Completion means
saving the requested files in the requested location, inspecting an available preview, and
finishing any project integration the user requested. Login or task submission alone is not
completion. Choose the shortest suitable pipeline and reuse existing assets for follow-ups.

## Read what this request needs

| Need | Reference |
|---|---|
| CLI runner, credentials, or output location | [Setup](references/setup.md) |
| Generation, texturing, remeshing, conversion, scale, or 2D images | [Pipelines](references/pipelines.md) |
| Rigging, animation, or generated motion | [Animation](references/animation.md) |
| Cost, waiting, preview, delivery, or finding a previous model | [Delivery](references/delivery.md) |
| Failed or uncertain operation | [Troubleshooting](references/troubleshooting.md) |

Read the relevant section when needed; recipes are examples to adapt to the requested result,
not a requirement to execute every stage. An untextured model skips texture generation; an
existing GLB needs no extra format conversion. Use command help when parameters are uncertain.

## First use and authorization

Before the first command run `meshy --version`; no need to ask. When `meshy` is missing or
older than 0.7.3, install the newest 0.7.x with `npm install -g meshy-cli@0.7` and say so in
one line; Setup covers a refused install and a CLI of 0.8 or newer. Reuse a verified session. If login is
needed, follow Setup and run `auth login --device` (adding `--region cn` for a user in mainland
China) in a persistent tool session. Show its
verification URL and user code in **commentary/progress, not a final answer**. Await that same
session in this turn until it exits, verify `auth status`, then continue the original request.
A background process cannot resume a finished turn; do not require a "done" chat message, except in
Setup's two-step sign-in for a user on a remote chat (a phone through a chat bot).
Browser approval stays with the user; credentials never belong in chat.

## Execution boundaries

- Run API, upload, download and mesh operations through the CLI. Local inputs have a 50 MiB
  limit, and a local model must be GLB or glTF (rigging, UV unwrap and multicolor: GLB); use the supported
  URL input route for anything else.
- Use `--format json --no-update-check` on every command: stdout is one `meshy.cli/v1` envelope,
  auth included. Resolve `WORKSPACE` from the user's output
  path and pass it to writes.
- Submit once with `create --async`, retain the owning resource and ID, then `wait` on that
  task. Keep the agent turn active while awaiting a running command. Follow Troubleshooting
  on timeout or unknown submission; these do not authorize another paid create.
- Continue work within the user's approved scope and budget. Propose additional paid stages
  or reruns before spending; Delivery specifies estimates and balance checks.

## Deliver

Download only needed assets. Inspect and show a preview when available; a missing preview
must not prevent delivery or be described as inspected. Delivery covers earlier-stage preview
lookup, actual charges, and existing-project integration. Report the result and any concrete
limitation; a rendered image does not establish topology quality or provide a 3D viewer.
