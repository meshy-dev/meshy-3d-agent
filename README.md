# Meshy 3D Agent

AI agent skills for the [Meshy AI](https://www.meshy.ai) 3D generation platform. Enables AI coding assistants (Cursor, Claude Code, OpenClaw) to generate 3D models, textures, images, rig characters, animate them, and prepare models for 3D printing — no MCP server required.

**New Updates**: For new web agent experience, come to try out our new [Meshy Workspace Agent](https://meshy.ai/workspace)! It supports:
- :brain: Brainstorm with you, pitching directions first
- :art: Generate visuals in batches, refined through chat
- :ice_cube: Turn your favorite into 3D — print, download, anywhere
- :books: Answer your 3D questions in-line

## How It Works

These are **agent skills** — no server, no MCP process. Each skill bundles a small Python CLI (`scripts/`) plus on-demand markdown references (`references/`), and your AI assistant reads the skill files and drives the Meshy API directly through the bundled scripts.

## Skills

### [`meshy-3d-generation`](skills/meshy-3d-generation/) (core)

Full 3D generation lifecycle: API key setup, task creation, polling, downloading, and multi-step pipelines.

| Capability | Description | Credits |
|-----------|-------------|---------|
| Text to 3D | Generate 3D models from text descriptions | 20-30 |
| Image to 3D | Convert single or multiple images to 3D | 20-30 |
| Retexture | Apply new textures to existing models | 10 |
| Remesh | Change topology, polycount, or export format | 5 |
| Convert | Convert a model to other formats (glb/fbx/obj/usdz/blend/stl/3mf) without remeshing | 1 |
| Resize | Rescale to a real-world size (height / longest-side / auto) | 1 |
| UV Unwrap | Generate a clean UV layout for external texturing (GLB, ≤40k faces) | 5 |
| Auto-Rigging | Add skeleton to **textured** humanoid characters, ≤300k faces (includes walking + running) | 5 |
| Animation | Apply custom animations to rigged characters (`action_id` from the [public Animation Library](https://api.meshy.ai/web/public/animations/resources)) | 3 |
| Text to Image | Generate 2D images from text (recommended pre-step before image-to-3d) | 3-9 |
| Image to Image | Optimize/edit reference images (recommended pre-step before image-to-3d) | 3-12 |

### [`meshy-3d-printing`](skills/meshy-3d-printing/) (optional)

3D printing workflow: slicer detection, automated printability analysis & repair, white model printing, multicolor printing via API.

| Capability | Description | Credits |
|-----------|-------------|---------|
| White Model Print | Generate → OBJ download → coordinate fix → slicer launch | 20 |
| Multicolor Print | Generate → texture → multi-color API → 3MF → slicer launch | 40 |
| Creative Lab | One tool: photo or text → finished printable product (figure / lamp / keychain / fridge-magnet); prototype→build end-to-end | 36 |
| Slicer Detection | Auto-detect 7 slicers: OrcaSlicer, Bambu Studio, Creality Print, Elegoo Slicer, Anycubic Slicer Next, PrusaSlicer, UltiMaker Cura | 0 |
| Analyze Printability | Automated FDM check via `/openapi/v1/print/analyze` (watertight / volume / non-manifold / degenerate / holes) | **0 (free)** |
| Repair Printability | Fix non-manifold edges, degenerate faces, holes via `/openapi/v1/print/repair` (output format mirrors input) | 10 |

> The printing skill bundles the same task-runner CLI as the generation skill and shares its environment setup.

### [`meshy-openclaw`](skills/meshy-openclaw/) (OpenClaw / ClawHub)

A single unified skill for the [OpenClaw](https://clawhub.ai) ecosystem. Combines generation + printing into one self-contained skill, with OpenClaw-compatible `metadata.clawdbot` frontmatter and a full SECURITY MANIFEST.

| Capability | Description | Credits |
|-----------|-------------|---------|
| All generation | Text/Image to 3D, Creative Lab, Retexture, Remesh, Convert, Resize, UV Unwrap, Rig, Animate, Text/Image to Image | 1–36 |
| 3D printing | White model (OBJ) + multicolor (3MF via API) + slicer detection | 0–35 |

> Designed for ClawHub publishing. API key is stored only in `.env` in the current working directory — no shell profile access.

## Quick Install

One command to install all skills:

```bash
npx skills add meshy-dev/meshy-3d-agent
```

Then set your API key (pick any method below):

> Or simply start using the skill — when the agent loads it, it will detect that no API key is configured, ask you for it, and set it up for the current session (it never writes your key anywhere except `.env` on your request).

<details>
<summary>macOS / Linux</summary>

**Option A: Global (recommended)** — add to your shell profile so it persists across sessions:

```bash
nano ~/.zshrc
```

Add this line at the end, save and exit (`Ctrl+O`, `Enter`, `Ctrl+X`):

```bash
export MESHY_API_KEY="msy_YOUR_API_KEY"
```

Then reload:

```bash
source ~/.zshrc
```

**Option B: Project-local** — create a `.env` file in your project root:

```bash
echo 'MESHY_API_KEY=msy_YOUR_API_KEY' > .env
```

> Remember to add `.env` to your `.gitignore` to avoid committing your key.

</details>

<details>
<summary>Windows</summary>

**Option A: Permanent (recommended)** — set via System Environment Variables:

1. Open Settings → search for **"Edit environment variables for your account"**
2. Add a new user variable named `MESHY_API_KEY` with your key as the value
3. Restart your terminal for it to take effect

**Option B: Current session only:**

```powershell
$env:MESHY_API_KEY = "msy_YOUR_API_KEY"
```

**Option C: Project-local** — create a `.env` file in your project root:

```
MESHY_API_KEY=msy_YOUR_API_KEY
```

</details>

### Prerequisites

- A Meshy API key ([get one here](https://www.meshy.ai/settings/api) — requires Pro plan or above)
- Python 3 with `requests` package (`pip install requests`)

### Manual Installation

<details>
<summary>OpenClaw</summary>

**Option A: Via ClawHub**

```bash
npx clawhub install meshy-dev/meshy-3d-agent
```

**Option B: Manual** — copy the `skills/meshy-openclaw/` folder to your OpenClaw skills directory.

</details>

<details>
<summary>Cursor</summary>

```bash
mkdir -p .cursor/skills

# Core (required)
cp -R skills/meshy-3d-generation .cursor/skills/

# 3D Printing (optional)
cp -R skills/meshy-3d-printing .cursor/skills/
```

</details>

<details>
<summary>Claude Code</summary>

```bash
mkdir -p .claude/skills

# Core (required)
cp -R skills/meshy-3d-generation .claude/skills/

# 3D Printing (optional)
cp -R skills/meshy-3d-printing .claude/skills/
```

</details>

<details>
<summary>Codex</summary>

Codex reads skills from `.agents/skills` — per repository, or from `~/.agents/skills` to make them available everywhere.

```bash
mkdir -p .agents/skills

# Core (required)
cp -R skills/meshy-3d-generation .agents/skills/

# 3D Printing (optional)
cp -R skills/meshy-3d-printing .agents/skills/
```

`.agents/skills` is the cross-editor convention, so Cursor picks these up as well.

</details>

## Skill vs MCP Server

| Feature | Agent Skill (this repo) | [MCP Server](https://github.com/meshy-dev/meshy-mcp-server) |
|---------|------------------------|-------------------------------------------------------------|
| Setup | Copy a skill directory | `npx meshy-mcp-server` |
| Dependencies | Python 3 + requests | Node.js >= 18 |
| How it works | AI reads instructions, makes API calls directly | Dedicated server process with structured tools |
| IDE support | Amp, Cline, Codex, Cursor, Gemini CLI, Claude Code, OpenCode and 20+ more | Any MCP-compatible client |
| File management | Via skill instructions | Built-in auto-save with project folders |

Both approaches provide the same Meshy API capabilities. Choose based on your preference and setup.

## Security & Data

These skills run entirely on your machine and talk to a single service — the Meshy API. No telemetry, no third-party endpoints.

**Your API key**
- Read from the current session environment, or from `.env` / `.env.local` in the current working directory. Home directories and shell profiles are **never scanned**.
- Sent only in the HTTP `Authorization: Bearer` header to `https://api.meshy.ai`. It is **never logged in full** — scripts print at most a `msy_1234...` prefix.
- **Never persisted by the scripts.** The key is written to `.env` in the current working directory *only* when you explicitly ask, and that `.env` is added to `.gitignore` automatically. It is never written to shell profiles, Windows user variables, or any path outside the working directory. Persisting it globally is offered to **you** as instructions to run yourself — the skill never does it silently.
- System proxies are bypassed (`requests` session `trust_env = False`), so the key is never handed to an environment-configured proxy.

**What leaves your machine**
- Only what a generation request needs: your API key, text prompts, and image URLs/data (for image-to-3D) — all to `api.meshy.ai`.
- Generated assets are downloaded and saved locally under `./meshy_output/`; nothing else is uploaded.

**Filesystem footprint**
- Reads: `.env` / `.env.local` in the working directory, and any input files you explicitly pass (e.g. local images), at the exact path you provide.
- Writes: `./meshy_output/` (models, thumbnails, `metadata.json`, `history.json`) and — on request — `.env` in the working directory.
- The 3D-printing skill additionally launches an **already-installed** slicer with your model file; it never downloads or installs software.

## For Maintainers

Single sources of truth — edit these, never the generated copies:

| Source | Generated outputs |
|---|---|
| `reference/source.md` | `skills/*/reference.md` (the OpenClaw build also injects the SECURITY MANIFEST extracted from `skills/meshy-openclaw/SKILL.md`) |
| `scripts/src/meshy_task.py` | `skills/*/scripts/meshy_task.py` |
| `skills/meshy-3d-printing/scripts/slicers.py`, `fix_obj.py` | `skills/meshy-openclaw/scripts/slicers.py`, `fix_obj.py` |

After editing a source, regenerate and verify:

```bash
python3 scripts/build.py          # regenerate all targets
python3 scripts/build.py --check  # CI mode: fail if outputs are stale, a SKILL.md exceeds 300 lines, or a references/*.md is unlinked
```

Generated files carry a `GENERATED` marker comment. CI runs `python3 scripts/build.py --check` to reject edits that bypass the sources.

## License

[MIT](LICENSE)
