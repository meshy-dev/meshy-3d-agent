---
name: meshy-3d-generation
description: "Generates and edits digital 3D assets with the Meshy CLI: text-to-3D and image-to-3D models, texturing, remeshing and LODs, UV unwrapping, format conversion (GLB, FBX, OBJ, USDZ, STL, 3MF, Blender), rigging, animation, motion clips from text and reference images. Use when the user asks to make, texture, rig, animate or convert a 3D model or game asset. For physical 3D printing use meshy-3d-printing. Before the first command that spends credits, ask what the model is for, offer the routes with their credits and wait for the answer."
license: MIT
compatibility: "Needs Node.js 22.12+ and the Meshy CLI 0.8.x, 0.8.5 or later (npm install -g meshy-cli@0.8); network access to the Meshy API."
---

# Meshy 3D Generation

Use Meshy CLI **0.8** (0.8.5 or later) to turn the user's request into a delivered asset. Completion means
saving the requested files in the requested location and inspecting an available preview.
Login or task submission alone is not completion. Choose the shortest suitable pipeline and
reuse existing assets for follow-ups.

## Stop before the first paid command

Every `create`, every `make` without `--dry-run`, and every `api POST` spends the user's credits.
Before the first one in a conversation, unless the user has already said what the model is for and
picked a route:

1. Check the CLI and sign-in, then run `meshy make "<prompt>" --dry-run --format json` for an estimate.
2. Ask once what the model is for (a render or hero prop, a game asset, a character to rig, a 3D print)
   and offer the routes with their credits ([Pipelines](references/pipelines.md)). Without a usable
   photo, recommend a reference image first and building the model from it; text-to-3d is the
   quicker alternative. A game asset or a face-count budget means smart topology, not a standard
   model remeshed down.
3. End your turn there and wait for the answer. Use the host's question tool when it has one.

"Make me a model" is a request, not an answer to this question. Ask even when the request seems
clear; skip it only when the user has named the use and the route, or tells you to go ahead with
your recommendation.

## Read what this request needs

| Need | Reference |
|---|---|
| CLI runner, credentials, or output location | [Setup](references/setup.md) |
| Generation and the models to pair for a project, texturing, remeshing, conversion, scale, or 2D images | [Pipelines](references/pipelines.md) |
| Rigging, animation, or generated motion | [Animation](references/animation.md) |
| Cost, waiting, preview, delivery, or finding a previous model | [Delivery](references/delivery.md) |
| Failed or uncertain operation | [Troubleshooting](references/troubleshooting.md) |

Read the relevant section when needed; recipes are examples to adapt to the requested result,
not a requirement to execute every stage. An untextured model skips texture generation; an
existing GLB needs no extra format conversion. Use command help when parameters are uncertain.

## First use and authorization

In DeepSeek Harness with the Meshy plugin (`DSH_MESHY_CLI` is set) run every command as
`"$DSH_MESHY_NODE" "$DSH_MESHY_CLI" …`, never a `meshy` on PATH, install nothing, and sign in with
the `meshy_sign_in` tool. Everywhere else run `meshy --version` before the first command, without
asking; when it is missing or older than 0.8.5, install it with `npm install -g meshy-cli@0.8`
and say so in one line ([Setup](references/setup.md), section 1).

Reuse a verified session. If login is needed, run `auth login --device` (with `--region cn` for a
user in mainland China) as Setup, section 3 describes: show its URL and user code in
**commentary/progress, not a final answer**, wait on that same command in this turn, verify
`auth status`, then continue the original request. Browser approval stays with the user;
credentials never belong in chat, and only the CLI touches its config directory.

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
lookup and actual charges. Report the result and any concrete
limitation; a rendered image does not establish topology quality or provide a 3D viewer.
