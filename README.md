# Meshy 3D Agent

Meshy skills for creating digital assets and preparing 3D prints. All three skills drive
**Meshy CLI 0.8** (0.8.5 or later, `meshy`) on **Node.js 22.12+**. They are instructions and references only —
no bundled runtime scripts. Current release: **0.9.6**.

**Requires a paid Meshy plan (Pro or above),** and generation spends Meshy credits. Sign in with
your Meshy account; no API key needed. A Free account can sign in, but creating tasks is refused
(HTTP 402 `plan_upgrade_required`, CLI exit 9). Plans and prices: <https://www.meshy.ai/pricing>.

## Let your agent install it

Paste this into Claude Code, Codex, Cursor, OpenClaw, Hermes Agent, Meta Muse or another agent:

> Help me install Meshy CLI and the meshy-3d-agent skills:
> https://raw.githubusercontent.com/meshy-dev/meshy-3d-agent/main/INSTALL.md

[INSTALL.md](INSTALL.md) walks the agent through the CLI, the skills for its host and one
browser sign-in.

## Start by asking for what you want

Once installed, say the thing, in your own words:

> Turn this photo into a textured GLB and save it to `./assets/chest.glb`. Set it up if it
> isn't yet.

The agent resolves the CLI, checks whether a session already exists and, if not, starts one
browser login and shows you a link and a code. You approve in the browser; nothing is pasted
into the chat, no API key is copied, and the agent then continues the request you actually
made. The file lands at the path you named — `./meshy_output` is only the fallback when you
name none — with a rendered preview alongside it and the task IDs for whatever you ask next
("make a 1500-face LOD", "now as FBX", "scale it to 150 mm").

Two more things worth knowing:

- **The agent installs the CLI.** With Node 22.12+ and no `meshy` (or an older one), it runs
  `npm install -g meshy-cli@0.8`. Where a global install is not allowed, or a newer CLI is
  already installed, it runs the pinned package temporarily instead
  (`npm exec --yes --package=meshy-cli@0.8.5 -- meshy …`).
- **Local print work needs no account.** Rescaling an OBJ or opening a 3MF in a slicer runs
  entirely on your machine — no login, no balance check, no credits.

### Doing it by hand instead

```bash
npm install -g meshy-cli@0.8
meshy --version
meshy auth login
meshy auth status --format json --no-update-check
```

Run `meshy auth login` from a desktop terminal and approve in your browser; in SSH, CI or
container sessions use `meshy auth login --device` and open the verification URL it prints.
Keep the login process alive until you have approved. The CLI stores and refreshes the session;
both skills reuse it under the same OS user and CLI configuration, in any directory. On the China
site add `--region cn` to the login; the CLI remembers the region for later commands.

An existing `MESHY_API_KEY` overrides the stored browser session — keep it if that is
intentional; `auth status` reports the effective source. Explicit key files need
`--api-key-file`; the CLI never searches `.env`. Never paste a key into a chat. The
self-contained [setup reference](skills/meshy-3d-generation/references/setup.md) has the
version, path and error handling in full.

## Skills

| Skill | Workflow |
|---|---|
| [meshy-3d-generation](skills/meshy-3d-generation/SKILL.md) | Text/image/2D/motion, textures, remesh, conversion, sizing, UV, rigging and animation |
| [meshy-3d-printing](skills/meshy-3d-printing/SKILL.md) | White models, multi-color 3MF, analysis/repair, Creative Lab products and slicers |
| [meshy-openclaw](skills/meshy-openclaw/SKILL.md) | Both workflows in one skill for OpenClaw, with its security manifest and install hint |

Printing installs independently and controls its generation parameters from the start.
Requested formats and already-approved budgets are preserved. Cost estimates come from
`meshy make --dry-run` or the published price list, never from your balance; the real charge is
the task's own `consumed_credits`. No live spending happens during install.

Install these directories with your host's skills installer, or copy each **whole directory**:

- Claude Code: `.claude/skills/` (the repository also retains its Claude plugin manifest).
- Cursor: `.cursor/skills/`, or the whole repository as a plugin (see [Cursor plugin](#cursor-plugin)).
- Codex: `.agents/skills/`.

Replace a prior managed skill directory rather than merging files, so old `scripts/` files are
removed. Back up personal edits before replacement. Do not remove model projects or CLI state.
Host discovery and browser interaction require a real host smoke test; local contract tests
alone do not certify a host or operating system.

### Cursor plugin

The repository is also a Cursor plugin. [`.cursor-plugin/plugin.json`](.cursor-plugin/plugin.json)
loads `meshy-3d-generation` and `meshy-3d-printing` from the dedicated `cursor/skills/` root,
and leaves out `meshy-openclaw`, which repeats both. `scripts/build.py` generates these
byte-identical copies from the canonical `skills/` directories; edit the canonical files only.
The same plugin supports Grok Bot, with no `grokbot` or `sand` exclusion in its manifest. To load it from a clone instead of the marketplace:

```bash
git clone https://github.com/meshy-dev/meshy-3d-agent.git ~/.cursor/plugins/local/meshy-3d-agent
```

Restart Cursor or run **Developer: Reload Window**, then check under **Customize** that both
skills are listed. Clone into that folder rather than symlinking to it: Cursor skips a symlink
that points outside `~/.cursor/plugins/local`. On Enterprise plans an admin has to allow local
plugin imports first.

You need Node.js 22.12+ and the paid Meshy plan described at the top of this page. The skills
quote an estimate in credits and stay within the budget you approve before starting a paid task.

Cursor's agent runs terminal commands in a sandbox that blocks most network access, so the first
sign-in or task asks to run outside it. To let the Meshy CLI through, add Meshy's domains to
`.cursor/sandbox.json` in your project (or `~/.cursor/sandbox.json` for every project):

```json
{
  "networkPolicy": {
    "allow": ["api.meshy.ai", "www.meshy.ai", "assets.meshy.ai"]
  }
}
```

On the China site, use `api.meshy.cn`, `meshy.cn` and `assets.meshy.cn` instead. A team admin can set the same
allowlist for everyone in Cursor's dashboard. See
[Cursor's sandbox reference](https://cursor.com/docs/reference/sandbox).

### OpenClaw and Hermes Agent

OpenClaw installs one skill per listing, so `meshy-openclaw` carries both workflows and the same
references as the other two (kept byte-identical by `scripts/build.py`). It is published on
ClawHub as [Meshy 3D Agent](https://clawhub.ai/arlieeee/skills/meshy-3d-agent):
`openclaw skills install @arlieeee/meshy-3d-agent`. It is eligible whenever `meshy` or `npm` is on
`PATH` and offers the npm install of the CLI; `MESHY_API_KEY` is optional, not a gate.

Hermes Agent reads the same skills from skills.sh, ClawHub or GitHub:
`hermes skills install meshy-dev/meshy-3d-agent/skills/meshy-3d-generation`, or
`npx skills add … -a hermes-agent` as in [INSTALL.md](INSTALL.md).

Until the 0.6.0 skills release the OpenClaw skill was a separate Python client that called the
REST API with an API key. It is gone; its task IDs remain usable from the CLI.

## Data and local effects

The CLI sends prompts, media and task requests to the resolved Meshy API origins (normally
`api.meshy.ai`, or `api.meshy.cn` on the China site); OAuth opens Meshy's browser page. Asset downloads and input URL preflights
contact their media hosts without the API credential. npm is contacted when the CLI is installed
or run as a temporary package; workflow commands disable the update notifier. An unexpected
custom API or login origin must be resolved before credentials are sent.

CLI profiles normally live in `~/.config/meshy/credentials.v2.json` with mode 0600, their keys
and tokens encrypted under a key the OS keeps (Keychain, DPAPI or the Secret Service).
`MESHY_CONFIG_DIR` moves the config root, including operation and device-flow state;
`MESHY_CREDENTIALS_PATH` overrides only the credential file. The skills never read or copy tokens,
and never print a token, device code or signed URL.
`auth use` changes the shared active profile, so concurrent tasks should not switch accounts
independently. Profile sharing is local, not automatic across machines or containers.

Models, previews and the small `_meta.json` sidecar that records each delivered task are written
inside one workspace per job: the directory you named, or `./meshy_output` when you named none.
Every writing command carries that boundary explicitly, so a path outside it — including through
a symlink — is refused rather than written. Downloads are selected, not fetched in every format;
existing files are not overwritten, and `download` replaces one only with `--overwrite`. OBJ preparation writes a new file. Slicer integration launches a detected
installed application; a launch request is not proof the model was imported.

## Development and validation

Only maintainers need Python 3.11+, PyYAML and jsonschema. None of these tools ships in the CLI
skill folders.

```bash
python3 scripts/build.py
python3 scripts/build.py --check
python3 scripts/validate_skills.py
MESHY_CLI_BIN=/absolute/path/to/meshy node --test tests/*.test.mjs
```

`build.py` copies shared references between the canonical skills, then copies generation and
printing into `cursor/skills/` so Cursor and Grok load a single root with exactly two skills; `--check` fails when a copy is stale.
`validate_skills.py` checks frontmatter, link closure, the absence of bundled runtime files, the
JSON envelope and resolved workspace placeholder on every documented CLI command, and the plugin
manifests, for all three skills. It also checks the Cursor manifests against Cursor's plugin and
marketplace schemas, downloaded from a pinned commit of cursor/plugins and checked by hash (set
`CURSOR_SCHEMA_CACHE` to keep them in a folder of your choice), and requires the plugin manifest
to use the dedicated root with exactly the generation and printing skills, matching their canonical copies.

Tests use a loopback API, synthetic credentials and temporary config/workspace directories.
`tests/runner-contract.test.mjs` additionally runs the documented `npm exec` entry point, so it
populates an isolated npm cache from the registry on its first run and needs no `MESHY_CLI_BIN`.
CI installs the pinned CLI into a temporary prefix; tests never contact production or spend
credits. Without `MESHY_CLI_BIN`, the CLI contract tests skip explicitly — a skip is not a pass,
so set it.

## Upgrade and rollback

Old task IDs remain usable: `get` or `wait` on the original resource by its ID; never recreate a
task just to migrate. CLI 0.7.0 removed the project store (`meshy project`, `--project` and `--stage`
are gone), so a `metadata.json` or `history.json` left by an older version is not read: take the
task IDs from it by hand. Returning to an old Python skill requires its old runtime and API-key
setup; it cannot use the CLI OAuth store. Keep the CLI for inspecting in-flight tasks rather than
submitting again.

## Terms, privacy and support

Using Meshy through these skills is covered by Meshy's
[Terms of Use](https://www.meshy.ai/terms-of-use) and
[Privacy Policy](https://www.meshy.ai/privacy-policy).
[Data and local effects](#data-and-local-effects) lists what the CLI sends and writes. For account
or billing help, email support@meshy.ai. Report problems with the skills in
[GitHub issues](https://github.com/meshy-dev/meshy-3d-agent/issues).

## License

[MIT](LICENSE)

This repository contains only skills and references; it does not include the Meshy CLI or any of
its dependencies. Setup installs the [Meshy CLI](https://www.npmjs.com/package/meshy-cli) from npm
as a separate tool, under its own MIT license.
