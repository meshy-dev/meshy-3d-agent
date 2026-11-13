# Changelog

## [Unreleased]

### Added

- After delivering a GLB or glTF, the generation skill opens the model in a panel beside the chat
  when the host can show a web page there (Cursor, with browser tools enabled), so the user can
  orbit and zoom it. The agent saves a short Node script from the delivery reference into the job
  folder. It serves the output folder read-only on 127.0.0.1 (models, buffers and textures, never
  the sidecars) with a `<model-viewer>` page, and stops after an hour without requests. The model
  never leaves the computer; the page loads `<model-viewer>` 4.4.0 from jsDelivr, pinned with a
  subresource-integrity hash. Hosts without such a panel skip the step.

## [0.9.6] - 2026-11-11

### Changed

- A 3D model from a description now starts with a recommended reference image. The generation,
  printing and OpenClaw skills propose making an image first (text-to-image, or image-to-image
  from a sketch, silhouette or logo), show it for approval, and build the model from that image
  task with image-to-3d. When proportions, depth or the back of the object matter, they offer
  multi-view images and multi-image-to-3d. Text-to-3d stays available as the quicker
  alternative. A white print from text follows the same route, with recipes for each step.
- The skills are shorter. They drop guidance that is not about Meshy (wiring a model into an
  app, revealing a file in the file manager, extracting archives, per-host process tools), notes
  about older CLI and skill versions, and passages repeated across files. Setup now states the sign-in wait once for every host, and the
  two-step sign-in applies to any host that cannot wait within a turn.

### Removed

- The combined OpenClaw skill moved to its own repository,
  [meshy-openclaw](https://github.com/meshy-dev/meshy-openclaw), so an agent installing from this
  repository gets the generation and printing skills once, without a third copy of both. The
  ClawHub listing and `openclaw skills install @arlieeee/meshy-3d-agent` are unchanged. The
  `meshy-openclaw` plugin is gone from this marketplace: on Claude Code, install
  `meshy-3d-generation` and `meshy-3d-printing` instead.

## [0.9.5] - 2026-11-09

### Changed

- Meshy CLI 0.8.5 or later (still the `meshy-cli@0.8` range); the temporary package names
  `meshy-cli@0.8.5` exactly. A machine that already has an older 0.8.x upgrades on the skill's
  version check, as with earlier minimums. Two CLI changes come with it:
  - 0.8.4 names the AI agent running a command (Cursor, Claude Code, Codex and others, from the
    variables each agent sets) in the User-Agent of its requests to Meshy, so Meshy can tell
    usage apart by agent.
  - 0.8.5 honors `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY` on every Node it supports, so the
    CLI works inside sandboxes that allow the network only through a proxy, such as Cursor's,
    without starting it under `NODE_USE_ENV_PROXY=1`.

## [0.9.4] - 2026-11-06

### Added

- Ask what the model is for. Before the first paid create, the generation and OpenClaw skills
  find out whether the user wants a game asset, a character to rig, a render or a 3D print, and
  ask once when the request doesn't say. A game asset or a face-count budget goes to smart
  topology, not a standard model remeshed down.

### Changed

- The route table offers a remesh only for a standard model the user already has.
- The plugin description leads with what the plugin does, so marketplace tiles that truncate
  after a few words show "Generate 3D models, textures, images…" instead of the plan
  requirement. The Meshy account, Pro-or-above plan and credit spend still follow in the same
  sentence pair, in every manifest.
- README: the Cursor sandbox allowlist for the China site adds `assets.meshy.cn`, where
  results download from. `validate_skills.py` checks the README's current release.

## [0.9.3] - 2026-11-05

### Added

- Choose the models by project. The pipelines reference carries the Models page's geometry +
  texture guide (the same six rows as the Meshy CLI's help and the MCP servers), with its link,
  and says how the CLI reaches each pair: standard mode for `meshy-7.1`,
  `--model-type smart-topology` for `meshy-t2.5` or `meshy-t2`, `--data` for `meshy-6-lite`, and
  `--texture-model` for the texture. It lists what each texture model takes and that the CLI
  refuses the rest before sending.
- Recipes for the game rows and drafts: a character to rig (`meshy-t2.5` with `meshy-n1`, in an
  A-pose), many props or user-generated content (`meshy-t2` with `meshy-n1`), and many low-cost
  drafts (`meshy-6-lite` with `meshy-6-lite`). The hero and multi-image recipes name `meshy-7`,
  and the route table sends game characters, props and drafts to these recipes.
- Delivery: the texture model does not change the price at a given resolution; Meshy 6 Lite is
  priced from the list. Printing: the CLI's default texture is already the color-print pair.

### Changed

- Meshy CLI 0.8.3 or later (still the `meshy-cli@0.8` range), the first with `--texture-model`;
  the temporary package names `meshy-cli@0.8.3` exactly.

## [0.9.2] - 2026-11-04

### Changed

- The plugin descriptions, README and INSTALL say up front that creating tasks needs a paid
  Meshy plan (Pro or above) and spends credits, with a link to plans and prices and no upgrade
  prompt. A Free account can sign in, but its first task is refused (HTTP 402
  `plan_upgrade_required`, CLI exit 9). The README also says setup installs the Meshy CLI from
  npm as a separate tool under its own license.
- The Cursor manifest lists only `meshy-3d-generation` and `meshy-3d-printing`, so
  `meshy-openclaw`, which repeats both, no longer loads beside them in Cursor. It adds the
  display name "Meshy", the publisher, a support email and tags. The README covers installing
  it as a Cursor plugin, plus terms, privacy and support.
- All three skills now say up front that only the CLI touches its config directory
  (`~/.config/meshy` by default): an agent never reads, copies, edits or deletes a credential file
  there, an older `credentials.json` included.
  Found in a Cursor test, where an agent whose sign-in had failed read the old store's token
  fields and wrote a copy of it to `credentials.v2.json`. The rule was in Setup, section 5,
  past the part the agent read.
- A sign-in that fails because a sandbox blocks the network (`oauth_network`, `fetch failed`)
  has its own recovery in Setup: run the same command again with network access or outside the
  sandbox. The agent no longer follows the error's `--with-key` hint, probes with `curl`, or
  looks for another credential. In the Cursor test, the agent's sandbox blocked the network.
- Exit 9 with `error.details.body.code` `plan_upgrade_required` (HTTP 402) is read as a plan
  refusal, not an empty balance, even when the CLI's hint says out of credits and suggests a
  top-up: credits don't lift it. When the refused task used a model that needs Pro or above
  (`nano-banana-pro`, or `--pose-mode` on an older nano-banana model), the agent retries once on
  `gpt-image-2-5-flare`. Otherwise it tells the user that creating tasks needs Pro or above, links
  plans and prices, and doesn't suggest a top-up or an upgrade.

### Added

- `.cursor-plugin/marketplace.json`, listing the one Cursor plugin at the repository root. Without
  it, adding the repository to a Cursor team marketplace by link read
  `.claude-plugin/marketplace.json` and offered the plugin three times, once per Claude Code entry,
  all named `meshy-3d-agent`. `validate_skills.py` checks the file against Cursor's
  marketplace schema. It also requires a single entry whose name matches `.cursor-plugin/plugin.json` and whose source
  is the repository root.
- A Cursor logo, `assets/logo.png`: the Meshy app icon from Meshy's brand assets, scaled to
  512 × 512. Its dark background keeps it legible on light and dark themes. Before this, the
  Marketplace tile showed Cursor's generic box. `validate_skills.py` requires the logo to be a
  square PNG of at least 512 px.
- `category` "design" in the Cursor manifest. Cursor places listings in its Marketplace sections
  itself; Design is where 3D and media generation plugins appear.
- README: how to let the Meshy CLI through Cursor's terminal sandbox with a `sandbox.json`
  network allowlist (`api.meshy.ai`, `www.meshy.ai`, `assets.meshy.ai`). A plugin can't ship
  that allowlist itself.
- `minClientVersions.cursor` 3.28.0 in the Cursor manifest, the oldest Cursor the plugin was
  tested on. Grok Bot is left unset until the plugin is tested there.
- `validate_skills.py` downloads Cursor's plugin and marketplace schemas from cursor/plugins at
  a pinned commit (5229aad) and checks their SHA-256, instead of keeping copies in `scripts/`.
  cursor/plugins has no license, and everything in this repository ships in the plugin package.

## [0.9.1] - 2026-11-03

### Changed

- Meshy CLI 0.8.3 or later (still the `meshy-cli@0.8` range); the temporary package names
  `meshy-cli@0.8.3` exactly. `npm exec` users also get 0.8.1's sign-in fixes: one process's
  refresh no longer ends another's token.

### Added

- Retexture with Meshy N1 (`--ai-model meshy-n1`): a 2K base color texture from a style image
  (read as the front view) or 1–4 views, with no text prompt and no PBR maps. The pipelines
  reference says which recipe flags to drop and what the CLI refuses with it.

## [0.9.0] - 2026-11-03

### Changed

- Meshy CLI 0.8 (`meshy-cli@0.8`; the temporary package is `meshy-cli@0.8.0`). 0.8 encrypts the
  stored sign-in under a key the OS keeps (Keychain, DPAPI or the Secret Service) in
  `credentials.v2.json`, and moves a 0.7 login over on its first write; a 0.7 CLI on the same
  machine then signs in once on its own. Setup describes the new store.
- A shell that cannot write the CLI's store (a sandbox) no longer loses the login: 0.8 skips the
  refresh there and says the directory is not writable. Setup says to run the command outside the
  sandbox rather than sign in again inside it.

### Added

- DeepSeek Harness with the Meshy plugin: the plugin ships the CLI and keeps the sign-in. Setup
  checks `DSH_MESHY_CLI` first, runs recipes as `"$DSH_MESHY_NODE" "$DSH_MESHY_CLI" …`, installs
  nothing, and signs in through the `meshy_sign_in` tool (or Settings → Meshy) instead of
  `auth login` in the shell.
- `auth status` reports `result.account`, who is signed in, when the site reports it.
- The skills say that the China site is the same account with the same credits.

## [0.8.1] - 2026-10-30

### Changed

- Meshy CLI 0.7.3 or later (still the `meshy-cli@0.7` range). 0.7.3 keeps the device code out of
  `auth login --no-wait`, which the two-step sign-in below relies on.
- The temporary package names `meshy-cli@0.7.3` exactly: `npm exec` with the `0.7` range kept
  reusing whichever 0.7.x it had cached first (0.7.1 on a machine that ran it before). The global
  install keeps the range and resolves the newest 0.7.x.
- The runner installs the CLI at most once: a version still too old afterwards means the
  registry the machine uses lags npm, and the agent reports that instead of looping.

### Added

- Remote chat sign-in. A user on a phone, talking to the agent through a chat bot, never saw the
  link while the login waited in the same turn. Setup now signs in across two turns:
  `meshy auth login --device --no-wait` returns the link (code included) and a flow id, the agent
  ends the turn with it, and `meshy auth login --device-flow FLOW_ID` finishes on the user's
  reply. A host whose question tool reaches the user (dsh's `ask_user_question`) can wait in the
  same turn instead. Contract test against the published CLI.
- A host with a file-delivery tool (dsh's `present`) also gets the delivered model through it.

## [0.8.0] - 2026-10-30

### Changed

- All three skills now target **Meshy CLI 0.7** (0.7.1 or later), moving from an exact 0.4.3 pin.
  Package specs are the range `meshy-cli@0.7` (install, temporary package, OpenClaw install hint,
  CI), so a 0.7.x patch release needs no skill release; the validator and contract tests accept
  any 0.7.x from 0.7.1 and pass against the published 0.7.1. `INSTALL.md` matches `setup.md`: keep
  a 0.7.x from 0.7.1, install the newest 0.7.x when the CLI is missing or older, and use the
  temporary 0.7 package rather than downgrade a CLI of 0.8 or newer.
- **No project store.** `meshy project`, `--project` and `--stage` are gone from the CLI (0.7.0
  refuses them as unknown, exit 2), and with them `metadata.json`, `history.json` and the
  `task_<id>.json` snapshots. The recipes no longer carry a project folder: the lineage is the
  `{resource, task_id, parent_task_id}` you keep, `JOB_DIR` (a fresh `<job>` folder inside the
  workspace) holds previews and intermediate downloads, `download --resource RESOURCE --task-id
  TASK_ID` fetches the files again instead of reading a snapshot, and `create` and `wait` no
  longer carry `--workspace` because they write nothing. A `metadata.json` from an older version is
  not read; take the task IDs from it by hand.
- Delivery is `RESOURCE get TASK_ID -o "OUTPUT_FILE"`: the one asset of the requested format plus a
  `<name>_meta.json` sidecar beside it (`meta.json` in a directory) recording the resource, task
  and saved files. That sidecar is the task trail for follow-ups ("rig the one from before"), found
  with the host's file tools or, failing that, `RESOURCE list`. `meshy download` stays for picking
  specific assets and writes no sidecar.
- Rerunning `-o` for the same task replaces its own files instead of exiting 11, and a part-way
  failure writes its sidecar and prints the same `get … -o …` as `error.recovery.command`. Files at
  the target that are not that task's own are refused before anything downloads. Troubleshooting
  and Delivery describe this; exit 11 now says to choose another path.
- `--output-schema` is gone. CLI 0.5.0 made every command print the `meshy.cli/v1` envelope and
  refuses the flag as an unknown option, so no recipe passes it any more and the validator rejects
  it. Every command keeps `--format json --no-update-check`.
- Auth commands print the envelope too. Read `result.authenticated`, `result.verified`,
  `result.source` and `result.hint` from `auth status` (an unauthenticated or unverified answer is
  `ok: true` with exit 3) and `result.status: "logged_in"` after a login; a failed login is an
  error envelope with `error.details.oauth_error`. `auth status` still ignores `--api-key-file`:
  verify that source with `balance`.
- `image-to-3d` and `multi-image-to-3d` texture by default, as the API does, and the CLI also asks
  for full PBR maps and a 4k base colour. A draft needs `--should-texture false`, and texture settings are refused together with
  it. The white-print recipe keeps `--should-texture false` explicitly.
- Smart Topology defaults to `meshy-t2.5` (100-30,000 triangles, default 15,000);
  `--ai-model meshy-t2` keeps 100-15,000 with a 10,000 default.
- The face-count gates for UV unwrap and rigging download the GLB and measure it with
  `inspect faces --model`. The API reports no face count, so a task response alone answers
  unknown; the "no local face counter" caveat is gone.
- Rigging: `--texture-image-url` is deprecated. The recipes say to leave it out, because it replaces
  the model's own textures and drops its PBR maps.
- Printability analysis and repair take a model URL of up to 400 MB; local files and inline data
  stay within the CLI's 50 MiB limit.

- **Smaller references.** Rigging, animation and generated motion moved from `pipelines.md` to
  `animation.md`, and Creative Lab from `printing.md` to `creative-lab.md`, so an ordinary model
  or print reads less. Repeated recovery rules now live once in Troubleshooting, the printing
  "Cost and recovery" section that repeated Delivery is gone, and references over 100 lines open
  with a contents line. The three `description` fields say when to use each skill.
- Fixed contradictions: OpenClaw's background login and wait no longer clash with the
  keep-the-turn-alive rule in Setup; a runner is used only when it reports exactly 0.7.0; partial
  files are not deleted without asking; the OpenClaw security manifest lists what the skill
  actually runs and reads.
- 2D images default to `gpt-image-2-5-flare`. `nano-banana-pro` needs a Pro plan and otherwise
  fails like an empty balance (exit 9). `--generate-multi-view` drops `--aspect-ratio`, and a
  multi-view image task feeds `multi-image-to-3d`, not `image-to-3d`.
- Keychain names print as a flat coloured detail, not engraving; a lamp's `base_stl` is the
  fixture mount (the default preset puts the base plate in `lamp_stl`); an unreadable split prompt
  falls back to the model's reference image.

- The runner installs the CLI (`npm install -g meshy-cli@0.7`) when `meshy` is missing or older;
  the temporary `npm exec` package is the fallback when the install is refused or a CLI of 0.8 or
  newer must stay. Each SKILL.md declares the requirement in `compatibility` and checks
  `meshy --version` without asking.

### Added

- Asset retention: Meshy keeps a task's files for at most 3 days, after which a follow-up uses the
  delivered local GLB instead of the task ID. The handover names the `-o` sidecar and what deleting
  it costs.
- Routes for multi-view images of one object, a new look on an existing model (including
  `--multiview-image-urls`), a UV white model, a motion clip without a character, checking or
  fixing an existing print model in any format, and resizing an STL/3MF/GLB; a note telling the
  three colour routes apart.
- Printing: cloud print files are scaled in the slicer; repair output is GLB, so OBJ for local
  preparation comes from a convert; a default-textured image-to-3d task goes straight to
  multicolor; the 8,000,000-face limit on multicolor and split; the `--options` fields of the
  Creative Lab builds; Prusa MMU via `--printer-brand prusa`.
- Checked against the API docs: exit 9 also covers a Free plan, a key's monthly credit limit and
  a plan-gated model; a create refused with `NoMorePendingTasks` (exit 6) made no task; a wait is
  resumed for about an hour from creation; retexture after a repair takes the repair task ID
  rather than a signed URL.
- From a fresh-agent China-site run: every SKILL.md and the first-login step name `--region cn`;
  Setup says how Claude Code keeps the login running; signed URLs in task results and sidecars
  stay out of chat; the price list's Smart Topology column and its Markdown URL.
- `--data` carries an API field the CLI has no flag for; `make --dry-run` prices only the same
  settings; a FAILED task is refunded; rigging limits (320,000 faces, +Z facing for a model URL).
- China site: `meshy auth login --device --region cn` signs in at `meshy.cn` and the CLI remembers
  the region, so later commands call `api.meshy.cn`; `--region global` switches back, and
  `MESHY_REGION=cn` covers an API-key session. The OpenClaw security manifest lists the China
  hosts, and the setup reference notes that DeepSeek Harness strips credential-shaped variables
  such as `MESHY_API_KEY`, so use the stored login or `--api-key-file` there.
- Troubleshooting: close out an unknown submission with `meshy operations` (`resolve --task-id`
  binds the task the list showed, `--not-created` releases the ID), exit 130 for SIGTERM and SIGHUP
  as well as Ctrl-C, and a `get` of a FAILED task being a successful query (exit 0).
- Delivery: `-o PATH` and `--all-assets`, what `-o` leaves on the server (`result.downloads.skipped`)
  and how to take specific files with `download`.
- 2D images: a pose on a nano-banana model renders at 3:4 whatever `--aspect-ratio` says, and the
  envelope carries a `pose_aspect_ratio` warning.
- The validator also pins the OpenClaw install hint and rejects `--project`, `--stage` and
  `meshy project`. New contract tests cover the sidecar and rerun, part-way recovery, the local face
  gates, default texturing, `-o`/`--all-assets`, the pose warning, `operations resolve`, the
  denied-login envelope, the China-site login and the rejected stale flags.

## [0.7.0] - 2026-10-15

### Changed

- All three skills now pin **Meshy CLI 0.4.3** (setup, SKILL.md, INSTALL.md, README, validator,
  CI and contract tests). The auth JSON shapes and the runner contract are unchanged; the
  contract suite passes against the published 0.4.3 package.
- Animation follows the order the API offers: rigging's bundled walking/running clips first,
  then the preset animation library (`animation-catalog list` with `--search`, `--category` and
  `--sub-category`; one action with `animate --action-id`, or 1–10 actions in one file with
  `--action-ids`), and only when no preset fits, a text-to-motion clip applied to the rig with
  `animate --motion-task-id` (biped rigs, within 3 days). The skills no longer say a
  text-to-motion clip cannot animate the user's character.
- Exit code 14 (`conflict`) is documented: a running task cannot be deleted, keeps running and
  keeps its charge. The skills tell the agent to wait for the result instead, and describe a
  Creative Lab delete as a cancel.
- A local `--model-url` must be GLB or glTF (a local GLB for multicolor); STL, OBJ and FBX go in
  as an http(s) URL. The CLI refuses a local one before sending it, and the skills no longer
  suggest it.
- Refine without `--texture-resolution` now uses the server's 2k; the recipes still pass 4k and
  note that a meshy-6-lite preview refuses 4k/8k.
- A rate limit, server error or slow response on a status check no longer ends `wait`;
  troubleshooting says to keep waiting on the same task.
- Analysis accepts a repair result by ID, and repair accepts the analysis by ID (except an
  analysis of an STL, FBX or glTF URL); re-analysis no longer goes through the repaired model URL.
- Creative Lab cancel semantics and its own `delete` command are spelled out; `meshy delete` does
  not reach Creative Lab tasks.

### Added

- Printing: Auto Split (`auto-split`: automatic, by named parts or by colour, on-plate layout,
  connectors); wall-thickness checks and thickening with `--printer-type` and the intended print
  size; multicolor `--style realistic|cartoon` and `--printer-brand`.
- Creative Lab: vinyl figure, brick figure, keycap (`--candidate-id`), pixel fidget board
  (`--type person|other`, 3MF) and the single-stage collapsible fidget (STL); keychain engraving
  with `--name-text`.
- Generation: Smart Topology on text-to-3d preview, and `--ai-model meshy-t2.5` for up to 30,000
  triangles, currently priced like meshy-t2; `--geometry-resolution` for the paid high-detail pass;
  `--remove-background` on images; image-to-image from a finished image task with
  `--input-task-id`.
- Delivery: the balance's monthly/permanent split and `meshy usage tasks` for Studio and
  Enterprise teams.

## [0.6.0] - 2026-09-23

### Added

- `INSTALL.md`: install steps written for an agent. The CLI, the skills for its host (OpenClaw,
  any agent through `npx skills add`, including Hermes Agent, or Meta Muse), one browser sign-in and a
  verification. The website points agents at it:
  "Help me install Meshy CLI and the meshy-3d-agent skills: <raw INSTALL.md URL>".

### Changed (OpenClaw)

- `meshy-openclaw` is rebuilt on the Meshy CLI. The 0.4.1 Python client (`scripts/*.py`,
  `reference.md`, the legacy `reference/source.md` and `scripts/src/meshy_task.py`) is removed.
  The skill now carries the generation and printing references verbatim, synced by
  `scripts/build.py`, and is checked by `validate_skills.py` like the other two.
- Its OpenClaw gate was `requires.env: [MESHY_API_KEY]`, which hid the skill from anyone without
  a key. That also made its own key-setup step unreachable, and keys need a Pro plan. It is now
  eligible when `meshy` or `npm` is on `PATH` and offers `npm` installation of `meshy-cli`. Sign-in
  is the CLI's browser device flow, and an existing `MESHY_API_KEY` still works.
- The security manifest describes what the CLI actually touches, and the skill says how to wait
  on a login or task with OpenClaw's `exec` / `process` tools.

### Changed

- Generation and printing now pin **Meshy CLI 0.4.0** (runner, setup, troubleshooting, validator,
  CI and contract tests). Every command still passes `--output-schema v1 --format json
  --no-update-check` and reads only stdout JSON and the `Enter code … at …` stderr line; 0.4.0
  changes the terminal view only, and the auth shapes, `auth status` ignoring `--api-key-file`,
  and the exit codes are unchanged (verified against the published package).
- The Node.js floor is **22.12**, not 24 — the CLI's own `engines` since 0.3.2. Agents on Node 22
  no longer stop and ask the user to upgrade. CI now runs the suite on Node 22.12.

## [0.5.0] - Not released separately (shipped in 0.6.0)

### Added (first-run and delivery experience)

- One sentence starts the job: the skills resolve the runner, reuse an existing session, and —
  when there is none — run `meshy auth login --device` as a live process, show the verification
  URL and code as soon as the CLI prints them, and resume the original request once the session
  verifies. No API key, token or task ID is ever copied by hand.
- No global CLI required: with Node 24+ the pinned package runs temporarily through
  `npm exec --yes --package=meshy-cli@0.3.0 -- meshy …`, verified for entry point, flag and
  exit-code forwarding, and credential reuse across working directories.
- The user's requested path wins. `WORKSPACE`/`PROJECT_ROOT` are resolved from the request and
  `./meshy_output` is only the default; every writing command still carries the workspace
  boundary, and out-of-boundary, symlink and overwrite protection is unchanged.
- Previews are part of delivery: the task's thumbnail is downloaded, looked at and shown, an
  earlier stage's preview is reused when a post-processing task has none, and a missing preview
  is stated rather than implied. A rendered PNG is never called an interactive 3D viewer.
- Follow-ups ("a 1500-face LOD", "now as FBX") locate the existing task or asset through the
  session, the project index or a resource listing, and run only the missing step.
- Estimates come from `meshy make --dry-run` or the dated published price list — never from the
  balance, and never from an invented command.
- Printing gained a local-only route: preparing an existing OBJ or opening a 3MF triggers no
  authentication, no balance check and no generation, and "figurine" alone no longer implies
  Creative Lab.

### Changed

- Rebuilt generation and printing from the 0.4.1 baseline around Meshy CLI 0.3.0;
  removed their bundled Python runtime and duplicated API manuals.
- Prefer one browser login, shared CLI profiles and automatic token refresh. Existing
  API-key environments remain supported. Printing is independently installable.
- Use async task IDs, resource-specific waits, explicit workspaces and selective downloads.
- Added isolated auth, runner and recipe tests against the real CLI on loopback. No live-host
  certification is implied.
- SKILL.md frontmatter carries only name, description and license; the release version lives
  in the plugin manifests.
- OpenClaw remains the separate 0.4.1 Python skill; its runtime is outside this change.

## [Unreleased — historical 0.4.1 baseline notes]

### Fixed (API facts that were making agents do the wrong thing)

Every change below is sourced from the public docs at `docs.meshy.ai` or from the public, unauthenticated Animation Library endpoint. Verified 2026-08-08.

- **Animation was a dead end.** The Animation recipe said `"action_id": 1  # from Animation Library` and gave no way to find a real ID, so an agent asked for "make it wave" had nowhere to go. The reference and the pipeline recipe now point at the public catalog — `GET https://api.meshy.ai/web/public/animations/resources`, no API key, 680 actions, `?category=` (`WalkAndRun` / `BodyMovements` / `DailyActions` / `Fighting` / `Dancing`) to keep the payload small — with a working lookup snippet and the fields carried on each entry (`id` = `action_id`, `name`, `subCategory`, `previewUrl` GIF, …). The docs' own Animation Library Reference page points at this same endpoint. Also flagged: IDs are **not** a `1..N` range (the catalog contains `-2`, `-1`, `0`), so the old hardcoded `1` was never "the first animation" — don't guess one.
- **`model_type: "lowpoly"` is deprecated; `"smart-topology"` was missing entirely.** Image to 3D now documents `standard` / `smart-topology` / `lowpoly` (deprecated — "We recommend using `smart-topology` instead"), the `ai_model` values that go with each (`meshy-t2`, default and recommended, honours `target_polycount`; `meshy-t1` does not), and both mutual-exclusion rules including the previously missing `save_pre_remeshed_model`. Scoped correctly: `smart-topology` exists on **Image to 3D only** — Text to 3D still has just `standard`/`lowpoly`, and Multi-Image to 3D has no `model_type` parameter at all.
- **`hd_texture` is deprecated.** Replaced with `texture_resolution` (`"2k"` default / `"4k"` / `"8k"`) across text-to-3d refine, image-to-3d, multi-image-to-3d, and retexture, including the precedence rule (`texture_resolution` wins when both are set), the `meshy-5` restriction, and the no-emission-map-at-`8k` caveat.
- **Rigging examples fed it untextured meshes.** The docs support *textured* humanoid models and list untextured meshes as unsupported, but the recipe rigged a bare `TASK_ID` with a text-to-3d **preview** in scope. The rigging section now leads with a preconditions block (textured input, bipedal humanoid, ≤300k faces via `input_task_id` else `400 Face count exceeded`, `model_url` models must face **+Z**, t-pose decided at generation time) and a source→"rig this task ID" table that routes text-to-3d through **refine**. The 300k limit and the humanoid restriction are now in SKILL.md, not only in the reference.
- **`multi_view_thumbnails` was invisible where it mattered.** It appeared only in `reference.md`, so agents downloaded a 50–200 MB GLB just to look at a result. It is now in every SKILL.md as the default inspection move, with what it returns (`thumbnail_urls`: front / right / back / left, 512×512 PNG) and its ~3s latency cost.
- **Failed tasks are free.** `consumed_credits` returns `0` for `FAILED` tasks — credits are refunded — so a transient failure is a lost wait, not lost money, and can be retried without re-asking the user to approve the spend. Documented in the reference, the error-handling section, and both SKILL.md files.
- **Error codes now name the rigging cases**: `400` covers `Face count exceeded`, and `422` is pose estimation failing (non-humanoid, untextured, or not facing +Z).

### Changed (internal restructure — no behavior or content changes for end users)

- **SKILL.md split**: all three skills (`meshy-3d-generation`, `meshy-3d-printing`, `meshy-openclaw`) now have a ≤300-line `SKILL.md` (frontmatter, flow overview, decision trees, per-round UX rules) with detail moved into per-skill `references/` docs (`setup.md`, `pipelines.md`, `printing.md`, `troubleshooting.md` as applicable). Content was moved verbatim.
- **Bundled scripts**: the inline Python template (`create_task` / `poll_task` / `download` / `get_project_dir` / `record_task` / `save_thumbnail`) is now a real CLI, `scripts/meshy_task.py`, inside each skill. The printing slicer detection / OBJ-fix snippets are `scripts/slicers.py` and `scripts/fix_obj.py`. SKILL.md files now state the explicit rule: never retype or reconstruct bundled scripts from memory.
- **Single-source `reference.md`**: the three hand-drifted copies are merged into `reference/source.md`; `scripts/build.py` regenerates each skill's `reference.md` (the OpenClaw build injects the SECURITY MANIFEST extracted from its SKILL.md). `python3 scripts/build.py --check` validates freshness, the ≤300-line limit, and that every `references/*.md` is linked from its SKILL.md. Drift resolved in the merge: kept the model-specific `aspect_ratio` notes, the retexture alias note, the fuller analyze/repair JSON examples, and the `model_url` option for multi-color; dropped the redundant trailing "Print Automation APIs" section.
- The OpenClaw SECURITY MANIFEST now reads `.env` / `.env.local` (was: `.env` only), matching the bundled CLI's key lookup.

## [0.4.1] - 2026-07-31

### Fixed

- **README manual install no longer breaks relative links.** The Claude Code / Cursor steps previously copied `SKILL.md` and `reference.md` as two unrelated flat files (`.claude/skills/meshy-3d-generation.md` + `.claude/skills/meshy-reference.md`), which broke the `[reference.md](reference.md)` links inside the skill. The steps now install each skill as a directory (`.claude/skills/meshy-3d-generation/{SKILL.md,reference.md}`, same for Cursor), matching the current Agent Skills directory convention so every relative link resolves.
- **Skills no longer write the API key to shell profiles or system env.** `meshy-3d-generation` Step 0a previously had the agent append the key to `~/.zshrc` / `~/.bashrc` and set Windows user environment variables — putting the key into shell history, the agent transcript, and long-lived config simultaneously, and contradicting the `meshy-openclaw` SECURITY MANIFEST ("No access to home directories, shell profiles"). All three skills now share the openclaw posture: the agent sets the key for the current session only, may write `.env` in the current working directory only on explicit user request, and otherwise prints persistence instructions for the user to apply themselves. Step 0 detection no longer scans shell profile files.
- **Version drift pinned.** All three SKILL.md frontmatters now declare the same version (`meshy-openclaw` previously had no `version` field and its `name` did not match its directory), aligned with the top of this CHANGELOG and with every plugin manifest. The README Windows setup no longer shows a `setx` command for the key; it points at the Environment Variables GUI instead.

### Added

- **Plugin manifests for Claude Code and Cursor.** `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` and `.cursor-plugin/plugin.json`. Each marketplace entry pins an exclusive `skills` path so any single skill directory can be installed on its own. `.gitignore` previously ignored `.claude-plugin/`, which would have made the manifests uncommittable. Verified by installing all three skills through `claude plugin marketplace add` / `claude plugin install`: each plugin exposes exactly its own skill.
- **Codex install documented via `.agents/skills`.** Codex discovers skills from `.agents/skills` (per repo) and `~/.agents/skills` (user-wide) — the cross-editor convention Cursor also reads — so the directory install in the README covers it. A `.codex-plugin/plugin.json` was written and then removed: Codex's plugin marketplace only accepts a plugin root in a subdirectory carrying its own real `skills/` tree, and both cheap workarounds (a `skills` symlink, or a `"../skills"` path in the manifest) install **zero** skills while still reporting success. Shipping that manifest would have meant either committing a second copy of every skill or leaving users with a plugin that reports "installed" and does nothing.
- **`validate-skills` CI (`scripts/validate_skills.py`), five checks on every PR and push to `main`:** ① frontmatter `name` matches the directory, `metadata.version` is semver, and `description` carries both a trigger phrase and a routing boundary; ② version stays in sync across both manifests, every `SKILL.md`, and the top CHANGELOG entry; ③ the marketplace and Codex skill lists cover exactly the `skills/` directory set; ④ references are bidirectional — every relative link resolves and every non-`SKILL.md` markdown file is reachable from `SKILL.md`; ⑤ no `..` path segments, so each skill directory stays independently installable. Check ④ is what would have caught the broken-install-link bug above.

## [0.4.0] - 2026-06-24

### Added

- **New API endpoints** documented across `meshy-3d-generation`, `meshy-3d-printing`, and `meshy-openclaw` (SKILL.md + reference.md):
  - `POST /openapi/v1/convert` (1 credit) — convert a model to other formats (glb/fbx/obj/usdz/blend/stl/3mf) without remeshing. Cheapest way to get an STL/3MF.
  - `POST /openapi/v1/resize` (1 credit) — rescale to a real-world size: exactly one of `resize_height` / `resize_longest_side` / `auto_size`, optional `origin_at`.
  - `POST /openapi/v1/uv-unwrap` (5 credits, GA) — generate fresh UVs for a GLB (≤ 40,000 faces, else 400 → remesh first); outputs a GLB "UV white model" for external texturing.
  - **Creative Lab** (`POST /openapi/creative-lab/{product}/v1/prototype` 6 credits → `.../build` 30 credits) for figure / lamp / keychain / fridge-magnet. Documented primarily in `meshy-3d-printing` (physical products) and in `meshy-openclaw`. Build requires an API-created prototype of the same product (web-app prototypes return 404).
- **New generation parameters** in the reference tables: `hd_texture` (4K base color, meshy-6/latest only), `decimation_mode` (1–4 adaptive polycount), `auto_size` + `origin_at`, `alpha_thumbnail` (RGBA preview → `alpha_thumbnail_url`), `multi_view_thumbnails` (image/multi-image only), and `input_task_id` chaining for image-to-3d / multi-image-to-3d off a text-to-image / image-to-image result.
- **New 2D image models**: text-to-image and image-to-image now list `nano-banana-2` and `gpt-image-2` alongside `nano-banana` / `nano-banana-pro`.
- Every task GET response now documents `consumed_credits` so agents can report real spend.

### Changed

- **Refine fact-fix**: refine works with `meshy-5`, `meshy-6`, or `latest` (= Meshy 6); pick the same family as your preview for consistency. Removed contradictory claims (the old "meshy-6 previews do NOT support refine" / mismatch caveats). Refine is 10 credits regardless of model.
- **3MF fact-fix**: 3MF is supported but NOT included by default — request it via `target_formats: ["3mf"]`, the Convert API, or the Multi-Color Print API (always 3MF).
- **Pricing sync** to the authoritative price list: Text-to-Image (nano-banana 3 / nano-banana-2 6 / nano-banana-pro 9 / gpt-image-2 9), Image-to-Image (3 / 6 / 9 / 12), Convert 1, Resize 1, UV Unwrap 5, Creative Lab prototype 6 / build 30.
- **Deprecations** noted where the params appear: `symmetry_mode` no longer affects output; `art_style` is ignored by Meshy-6; `is_a_t_pose` superseded by `pose_mode`; `meshy-4` is retired (returns 400).

### Internal

- Frontmatter version bumped to `0.4.0` on `meshy-3d-generation` (was 1.0.0) and `meshy-3d-printing` (was 0.3.0). `meshy-openclaw` has no frontmatter `version` field, so only its content was updated.

## [0.3.0] - 2026-05-09

### Added

- **Printability automation suite** across all three skills (`meshy-3d-generation`, `meshy-3d-printing`, `meshy-openclaw`):
  - `POST /openapi/v1/print/analyze` (FREE) — FDM printability check (watertightness, volume, non-manifold edges, degenerate faces, holes)
  - `POST /openapi/v1/print/repair` (10 credits) — topology repair; output format mirrors input
  - `POST /openapi/v1/print/multi-color` (10 credits) — now accepts `model_url` in addition to `input_task_id`
- **2D optimization pre-step** — recommended workflow before image-to-3d when the user supplies low-quality references or a text-only prompt: `text-to-image` (`nano-banana-pro`, optional `generate_multi_view` + `pose_mode` for characters) or `image-to-image` (background removal / upscale / lighting normalization / style transfer). 3–9 extra credits typically buy a meaningful 3D-quality lift; documented in all three SKILL.md files.

### Changed

- `meshy-3d-printing` SKILL frontmatter version bumped 0.2.0 → 0.3.0; print pipeline rewritten as `generate → analyze (FREE) → repair? → multicolor? → download → send_to_slicer` to leverage the new automated printability check
- The "Printability Checklist (Manual Review)" + "Coming Soon: Printability Analysis & Fix API" sections in `meshy-3d-printing` are replaced by the real automated check; the manual checklist now covers only print-quality concerns the API doesn't (wall thickness, overhangs, base stability)
- `meshy-openclaw` printing section adds analyze/repair steps while preserving the SECURITY MANIFEST and `metadata.openclaw` frontmatter
- Intent-mapping table in `meshy-3d-generation` and `meshy-openclaw` lists the three new print endpoints
- Pricing summary in all three `reference.md` files lists `analyze` (FREE) and `repair` (10 credits)
- Retexture section in all three `reference.md` files clarifies that the historical "text-to-texture" name redirects to retexture and there is no separate `/openapi/v1/text-to-texture` endpoint

### Internal

- Bumped repo version to v0.3.0 (the `meshy-3d-generation` skill keeps its 1.0.0 internal version since its own surface area didn't change beyond doc updates)
- This is the first time skill release ships a CHANGELOG; future entries will follow the same semver-style structure as the MCP server release CHANGELOG

## [0.2.0] - prior

Initial multi-skill release (meshy-3d-generation, meshy-3d-printing, meshy-openclaw) with multicolor printing, slicer detection, and OpenClaw / ClawHub bundle.
