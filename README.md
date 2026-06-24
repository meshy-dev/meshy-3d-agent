# Meshy 3D Agent

AI agent skills for the [Meshy AI](https://www.meshy.ai) 3D generation platform. Enables AI coding assistants (Cursor, Claude Code, OpenClaw) to generate 3D models, textures, images, rig characters, animate them, and prepare models for 3D printing — no MCP server required.

**New Updates**: For new web agent experience, come to try out our new [Meshy Workspace Agent](https://meshy.ai/workspace)! It supports:
- :brain: Brainstorm with you, pitching directions first
- :art: Generate visuals in batches, refined through chat
- :ice_cube: Turn your favorite into 3D — print, download, anywhere
- :books: Answer your 3D questions in-line

## How It Works

These are **pure Markdown skills** — no server, no dependencies, no build step. Your AI assistant reads the skill files and gains the ability to interact with the Meshy API directly using shell commands and Python scripts.

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
| Auto-Rigging | Add skeleton to humanoid characters (includes walking + running) | 5 |
| Animation | Apply custom animations to rigged characters | 3 |
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

> The printing skill depends on the generation skill's script template and environment setup.

### [`meshy-openclaw`](skills/meshy-openclaw/) (OpenClaw / ClawHub)

A single unified skill for the [OpenClaw](https://clawhub.ai) ecosystem. Combines generation + printing into one file, with OpenClaw-compatible `metadata.clawdbot` frontmatter and a full SECURITY MANIFEST.

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

> Or simply start using the skill — when the agent loads it, it will detect that no API key is configured, ask you for it, and set it up automatically.

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

```powershell
setx MESHY_API_KEY "msy_YOUR_API_KEY"
```

Restart your terminal after running this command.

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
# Core (required)
mkdir -p .cursor/skills
cp skills/meshy-3d-generation/SKILL.md .cursor/skills/meshy-3d-generation.md
cp skills/meshy-3d-generation/reference.md .cursor/skills/meshy-reference.md

# 3D Printing (optional)
cp skills/meshy-3d-printing/SKILL.md .cursor/skills/meshy-3d-printing.md
```

</details>

<details>
<summary>Claude Code</summary>

```bash
# Core (required)
mkdir -p .claude/skills
cp skills/meshy-3d-generation/SKILL.md .claude/skills/meshy-3d-generation.md
cp skills/meshy-3d-generation/reference.md .claude/skills/meshy-reference.md

# 3D Printing (optional)
cp skills/meshy-3d-printing/SKILL.md .claude/skills/meshy-3d-printing.md
```

</details>

## Skill vs MCP Server

| Feature | Agent Skill (this repo) | [MCP Server](https://github.com/meshy-dev/meshy-mcp-server) |
|---------|------------------------|-------------------------------------------------------------|
| Setup | Copy Markdown files | `npx meshy-mcp-server` |
| Dependencies | Python 3 + requests | Node.js >= 18 |
| How it works | AI reads instructions, makes API calls directly | Dedicated server process with structured tools |
| IDE support | Amp, Cline, Codex, Cursor, Gemini CLI, Claude Code, OpenCode and 20+ more | Any MCP-compatible client |
| File management | Via skill instructions | Built-in auto-save with project folders |

Both approaches provide the same Meshy API capabilities. Choose based on your preference and setup.

## License

[MIT](LICENSE)
