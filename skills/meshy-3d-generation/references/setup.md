# API Key Setup (meshy-3d-generation)

Read this when Step 0 (`check-env`) reports `READY: NO_KEY_FOUND`, or when you need extended environment diagnostics.

## Tell the user

> To use the Meshy API, you need an API key. Here's how to get one:
>
> 1. Go to **https://www.meshy.ai/settings/api**
> 2. Click **"Create API Key"**, give it a name, and copy the key (it starts with `msy_`)
> 3. The key is only shown once — save it somewhere safe
>
> **Note:** API access requires a **Pro plan or above**. Free-tier accounts cannot create API keys. If you see "Please upgrade to a premium plan to create API tasks", you'll need to upgrade at https://www.meshy.ai/pricing first.

## Set and verify the key

Once the user provides their key, set it for the **current session** and verify:

**macOS / Linux:**
```bash
export MESHY_API_KEY="msy_PASTE_KEY_HERE"

# Verify
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $MESHY_API_KEY" \
  https://api.meshy.ai/openapi/v1/balance)

if [ "$STATUS" = "200" ]; then
  BALANCE=$(curl -s -H "Authorization: Bearer $MESHY_API_KEY" https://api.meshy.ai/openapi/v1/balance)
  echo "Key valid. $BALANCE"
else
  echo "Key invalid (HTTP $STATUS). Check the key and try again."
fi
```

**Windows (PowerShell):**
```powershell
$env:MESHY_API_KEY = "msy_PASTE_KEY_HERE"

# Verify
$status = (Invoke-WebRequest -Uri "https://api.meshy.ai/openapi/v1/balance" -Headers @{Authorization="Bearer $env:MESHY_API_KEY"} -UseBasicParsing).StatusCode
if ($status -eq 200) {
    Write-Host "Key valid."
} else {
    Write-Host "Key invalid (HTTP $status). Check the key and try again."
}
```

**Do NOT persist the key yourself.** Never write the API key to shell profiles (`~/.zshrc`, `~/.bashrc`, …), Windows user environment variables, or any file outside the current working directory — the key would end up in shell history, the agent transcript, and long-lived config at once. The only file you may write it to is `.env` in the current working directory, and only when the user explicitly asks:

```bash
echo 'MESHY_API_KEY=msy_PASTE_KEY_HERE' >> .env
grep -q "^\.env" .gitignore 2>/dev/null || echo ".env" >> .gitignore
```

Once the key verifies, print these instructions so the **user** can persist it themselves:

> To keep the key across sessions, pick one:
>
> - **macOS / Linux:** add `export MESHY_API_KEY="msy_..."` to your shell profile (`~/.zshrc` or `~/.bashrc`) and restart your terminal.
> - **Windows:** Settings → "Edit environment variables for your account" → add a user variable `MESHY_API_KEY`, then restart your terminal.
> - **Any platform:** create a `.env` file in your project root containing `MESHY_API_KEY=msy_...` (remember to add `.env` to your `.gitignore`). If you ask me to, I can create this project-local `.env` for you.

## When the user insists a key is already configured

`check-env` reads the current session environment, then `.env` / `.env.local` in the working directory — and nothing else. **Do not scan home directories or shell profile files to find the key.** If the user believes a key is set but `check-env` reports `NO_KEY_FOUND`, the usual causes are:

- The key lives in a shell profile that this session never sourced → ask the user to open a new terminal, or to paste the key so it can be exported for this session.
- The `.env` file sits in a different directory than the current working directory → `cd` to the project root, or ask the user for the path.
- The key is set for a different user account or a GUI-launched app that inherited no shell environment → ask the user to run `echo ${MESHY_API_KEY:0:8}` themselves and report what they see.
