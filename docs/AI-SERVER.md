# Fix the AI server on Render (OpenRouter key)

**Symptom:** `https://YOUR-SITE/api/status?setup=1` says
**AI engine: Couldn't get a reply … HTTP 500 … Unable to contact AI.**

**Why:** the Render server (`sujancoreapi.onrender.com`) is online, but it can't reach
**OpenRouter**, the service that runs the AI model. In the old `app.py` the OpenRouter key was
written directly in the code, in a **public** GitHub repository. OpenRouter and GitHub scan public
code for keys and switch leaked keys off automatically, so the AI stops answering.

The fixed server is in this repo: [`ai-server/`](../ai-server). It reads the key from Render's
settings instead of the code, can switch models without code changes, and explains failures.

Time: about **10 minutes**.

---

## Step 1: Make a new OpenRouter key (2 min)

1. Go to **https://openrouter.ai** → sign in (same account as before, if you know it).
2. Click your profile picture (top-right) → **Keys** (or open https://openrouter.ai/keys).
3. If you see the old key there, click **⋯ → Delete** (it's leaked, so it must never be used again).
4. Click **Create Key** → Name: `proxima-render` → Credit limit: leave empty → **Create**.
5. **Copy the key now** (it starts with `sk-or-v1-`). You won't see it again. Don't put it in any code
   file or chat; you'll paste it straight into Render in Step 3.

> Free models (names ending in `:free`) cost nothing but have daily limits. If you add a few dollars of
> credit on OpenRouter, the free limits get much higher.

## Step 2: Replace the server code on GitHub (3 min)

The AI server's code lives in the GitHub repository **SujanShresthaProject7/SujanCoreapi**
(the one Render deploys from). Sign in to GitHub with the account that owns it.

1. In **this** repo (Proxima), open [`ai-server/app.py`](../ai-server/app.py) on GitHub → click
   **Copy raw file** (the copy icon at the top-right of the file).
2. Go to **https://github.com/SujanShresthaProject7/SujanCoreapi** → click **app.py** → the
   **pencil** ✎ (Edit) → select everything (**Ctrl + A**) → paste (**Ctrl + V**).
3. Click **Commit changes…** → message `Read OpenRouter key from environment` → **Commit changes**.
4. Optional, same way: replace `render.yaml` with [`ai-server/render.yaml`](../ai-server/render.yaml).

The new code contains **no key**, so it's safe in a public repository.

## Step 3: Put the key and settings on Render (3 min)

1. Go to **https://dashboard.render.com** → click your AI service (the one at `sujancoreapi.onrender.com`).
2. Left menu → **Environment** → **Add Environment Variable** (or **Edit**) and add:

   | Key                  | Value                                    |
   | -------------------- | ---------------------------------------- |
   | `OPENROUTER_API_KEY` | the new `sk-or-v1-…` key from Step 1     |
   | `MODEL`              | `meta-llama/llama-3.3-70b-instruct:free` |

   If `MODEL` already exists with a different value (for example `openai/gpt-4o`, which is **paid**),
   change it to the free model above unless you've added credit on OpenRouter.

3. Click **Save, rebuild, and deploy** (or **Save Changes**).
4. Left menu → **Settings** → **Build & Deploy** → **Start Command** → make it:
   ```
   gunicorn app:app --timeout 120
   ```
   → **Save Changes**. (Without `--timeout 120`, slow AI answers are cut off after 30 seconds.)
5. Top-right → **Manual Deploy** → **Deploy latest commit**. Wait until it says **Live** (2–4 minutes).

## Step 4: Check it (1 min)

1. Open **https://sujancoreapi.onrender.com**. You should see `"key_configured": true`.
2. Open **https://YOUR-SITE/api/status?setup=1** → **AI engine** should say **Replied in X s**.
   (If it says “No reply within 20 s”, Render was asleep: reload in a minute.)
3. Send a message in PROXIMA's chat.

## If it still fails

The check page now shows the AI server's exact reason. The common ones:

| AI engine says…                                   | Fix                                                                                                                                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY is not set on Render`         | Step 3: add the key, save, wait for the redeploy.                                                                                                                                        |
| `OpenRouter 401: User not found` / `Unauthorized` | The key is wrong or deleted. Make a new one (Step 1) and paste it again on Render.                                                                                                       |
| `OpenRouter 402` / credits                        | The model isn't free. Set `MODEL` to one ending in `:free`, or add credit on OpenRouter.                                                                                                 |
| `OpenRouter 404: No endpoints found`              | That free model was removed. Pick a current free model at https://openrouter.ai/models?q=free and put its name in `MODEL`. Optional: add backups in `FALLBACK_MODELS` (comma separated). |
| `OpenRouter 429`                                  | Free daily limit reached or the model is busy. Wait, add backups in `FALLBACK_MODELS`, or add credit.                                                                                    |
| Still `HTTP 500` with no reason                   | Step 2 isn't live yet: check Render → **Events** shows the new commit, and look at Render → **Logs**.                                                                                    |
