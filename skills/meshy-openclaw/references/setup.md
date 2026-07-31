# API Key Setup (meshy-openclaw)

Read this when Step 0 (`check-env`) reports `READY: NO_KEY_FOUND`.

## Tell the user

> To use the Meshy API, you need an API key:
>
> 1. Go to **https://www.meshy.ai/settings/api**
> 2. Click **"Create API Key"**, name it, and copy the key (starts with `msy_`)
> 3. The key is shown **only once** — save it somewhere safe
>
> **Note:** API access requires a **Pro plan or above**. Free-tier accounts cannot create API keys.

## Set and verify the key

Once the user provides the key, set it for the current session and verify:

```bash
# Set for current session only
export MESHY_API_KEY="msy_PASTE_KEY_HERE"

# Verify the key
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $MESHY_API_KEY" \
  https://api.meshy.ai/openapi/v1/balance)

if [ "$STATUS" = "200" ]; then
  BALANCE=$(curl -s -H "Authorization: Bearer $MESHY_API_KEY" https://api.meshy.ai/openapi/v1/balance)
  echo "Key valid. $BALANCE"
else
  echo "Key invalid (HTTP $STATUS). Please check the key and try again."
fi
```

**To persist the key (current project only):**

```bash
# Write to .env in current working directory
echo 'MESHY_API_KEY=msy_PASTE_KEY_HERE' >> .env
echo "Saved to .env"

# IMPORTANT: add .env to .gitignore to avoid leaking the key
grep -q "^\.env" .gitignore 2>/dev/null || echo ".env" >> .gitignore
echo ".env added to .gitignore"
```

> **Security reminder:** The key is stored only in `.env` in your current project directory. Never commit this file to version control. `.env` has been automatically added to `.gitignore`.
