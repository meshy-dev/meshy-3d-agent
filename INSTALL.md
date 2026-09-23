# Install Meshy CLI and the Meshy 3D Agent skills

These steps are written for an AI agent. The user only has to approve one sign-in in their
browser. Do not ask the user for an API key, and never use `sudo`.

## Requirements

Node.js **22.12 or newer**, with `npm`:

```bash
node --version
npm --version
```

If Node.js is missing or older, stop and ask the user to install a current Node.js LTS from
<https://nodejs.org>. Do not try to install it yourself.

## Step 1: Install the CLI

```bash
meshy --version
```

- It prints `0.4.0` or newer: keep it. Never downgrade a newer CLI.
- Otherwise, install it:

```bash
npm install -g meshy-cli@0.4.0
```

If the global install is refused (permissions, a managed machine), leave it: the skills can
fall back to `npm exec --yes --package=meshy-cli@0.4.0 -- meshy …`. Use that as `meshy` in the
steps below.

## Step 2: Install the skills

On **OpenClaw**, install the single combined skill:

```bash
openclaw skills install @arlieeee/meshy-3d-agent
```

On any other agent (Claude Code, Codex, Cursor, Hermes Agent, Gemini CLI, and others), install
the generation and printing skills. The installer detects the agent it runs in; add
`-a <agent>` (for example `-a claude-code` or `-a hermes-agent`) to choose one explicitly:

```bash
npx -y skills add meshy-dev/meshy-3d-agent --skill meshy-3d-generation --skill meshy-3d-printing -g -y
```

Hermes Agent can also install the skills from its own hub:
`hermes skills install meshy-dev/meshy-3d-agent/skills/meshy-3d-generation` (and
`…/meshy-3d-printing`).

On **Meta Muse**, which runs in its own cloud machine, do Step 1 on that machine. Then save these
two skills as Muse skills, each together with the files in its `references/` folder:

- <https://github.com/meshy-dev/meshy-3d-agent/tree/main/skills/meshy-3d-generation>
- <https://github.com/meshy-dev/meshy-3d-agent/tree/main/skills/meshy-3d-printing>

The sign-in in Step 3 works from there too: the user approves on any device where they can open
the link.

## Step 3: Sign in

```bash
meshy auth status --format json --no-update-check
```

If it reports `"authenticated": true` and `"verified": true`, skip to Step 4. Otherwise, sign
in with the device flow:

```bash
meshy auth login --device --format json --no-update-check
```

Within a few seconds the CLI prints a line like this on stderr:

```text
Enter code WXYZ-1234 at https://www.meshy.ai/device
```

Send the user that link and code **exactly as printed**, and tell them to open the link, sign
in to Meshy, type the code and approve. Keep the command running and wait for it to exit on its
own. It finishes when the user approves, and the code expires after 10 minutes. Do not start a
second login, and do not ask the user to paste anything back. The CLI stores the session itself.

If the code expires, run the same login command again.

## Step 4: Verify

```bash
meshy auth status --format json --no-update-check
meshy balance --output-schema v1 --format json --no-update-check
```

Tell the user the setup is done and how many credits they have. Nothing has been spent. If your
agent loads skills only at startup, ask the user to start a new session. Then suggest a first
request, for example: *"Make a 3D model of a lovely baby husky"* or *"Help me 3D print a small
dragon figurine"*.
