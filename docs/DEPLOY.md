# Put PROXIMA online with Vercel: click by click

Time: about **20 minutes**. Cost: Vercel's free **Hobby** plan is enough to start (it's meant for
personal, non-commercial projects; switch to Pro if you start making money from the site).

**Before you start, you need:**

- ✅ The code on GitHub (`main` branch), which you already have.
- ✅ Your **Neon** database working (docs/ACCOUNTS.md → A) and the tables created
  (`npm run db:deploy`, docs/DATABASE.md).
- ✅ Your **Google login** keys (docs/ACCOUNTS.md → B).
- ✅ Your `.env.local` file open, because you'll copy values from it.

> **What happens automatically on every deploy** (already set up in the code):
>
> - New database tables/changes are applied first (via `scripts/migrate-deploy.mjs`, which checks
>   `DATABASE_URL`/`DIRECT_URL` and then runs `prisma migrate deploy`). If that fails, the deploy
>   stops and the old site stays online.
> - The servers run in **Singapore** (`vercel.json` → `sin1`), next to your Neon database and close to Nepal.
> - Security headers, the sitemap, robots.txt, share image and app manifest are all built in.

---

## Step 1: Create the Vercel project (5 min)

1. Go to **https://vercel.com/signup** → choose **Hobby** → type your name → **Continue with GitHub**
   → allow access.
2. On the dashboard click **Add New…** → **Project**.
3. Under **Import Git Repository** find **Proxima** → click **Import**.
   _(Don't see it? Click **Adjust GitHub App Permissions** → choose your account → **Only select
   repositories** → pick **Proxima** → **Save**, then go back.)_
4. On the **Configure Project** screen:
   - **Project Name:** `proxima` (your address becomes `https://proxima.vercel.app` if that name is
     free; otherwise Vercel adds a few letters).
   - **Framework Preset:** **Next.js** (detected automatically).
   - **Root Directory:** leave as `./`.
   - **Build and Output Settings:** leave everything as it is.
5. Open **Environment Variables** and add these one by one (**Key** on the left, **Value** on
   the right, then **Add**):

   | Key                  | Value                                                                |
   | -------------------- | -------------------------------------------------------------------- |
   | `DATABASE_URL`       | copy from `.env.local` (the Neon string **with** `-pooler`)          |
   | `DIRECT_URL`         | copy from `.env.local` (the Neon string **without** `-pooler`)       |
   | `AUTH_SECRET`        | a **new** random string. Run the command below and paste the result. |
   | `AUTH_GOOGLE_ID`     | copy from `.env.local`                                               |
   | `AUTH_GOOGLE_SECRET` | copy from `.env.local`                                               |
   | `AI_PROVIDER`        | `nvidia` (the engine; Render stays as automatic fallback)            |
  | `NVIDIA_API_KEY`     | your key from https://build.nvidia.com (server only)                 |

   New secret for production (run in your project folder):

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

   > ⚠️ **Don't add** `NEXT_PUBLIC_SITE_URL` now. Vercel tells the site its own address
   > automatically. You only need it later if you connect your own domain (Step 5).
   > Never paste `AI_PROVIDER="mock"` here, or the live site will give fake answers.

6. Click **Deploy**. Wait 1–3 minutes until you see **Congratulations!**
7. Click **Continue to Dashboard**. Under **Domains** you'll see your address, for example
   `proxima.vercel.app`. **Copy it**, because you need it in Step 2.

> 🔴 **Build failed?** Click the failed deployment → **Building** to read the log. The two most
> common causes: a missing/misspelled variable (fix it in **Settings → Environment Variables**,
> then **Deployments → ⋯ → Redeploy**), or `DIRECT_URL` pointing to the wrong database.
>
> The most common one by far is `P1001: Can't reach database server at not-set:5432` — see the
> section [Build failed: P1001 at not-set](#build-failed-p1001-at-not-set) below.


## Build failed: P1001 at not-set

You saw something like:

```
Datasource "db": PostgreSQL database "not-set", schema "public" at "not-set:5432"
Error: P1001: Can't reach database server at `not-set:5432`
Error: [BUILD_UTILS_SPAWN_1] Command "npm run vercel-build" exited with 1
```

**Translation:** `not-set` is not your database. It is the placeholder Prisma uses when
`DATABASE_URL` and `DIRECT_URL` are **empty in the build environment**. The database itself is fine;
the build simply doesn't know its address. (The build runs `scripts/migrate-deploy.mjs`, which now
stops earlier and prints these steps directly in the Vercel log.)

### Fix it (2 minutes)

1. Vercel → your project → **Settings** → **Environment Variables**.
2. Neon → your project → **Connect** → copy the connection string with **pooling ON**
   (the host contains `-pooler`). Paste it as `DATABASE_URL`.
3. Go back to Connect, switch **pooling OFF**, copy that string, paste it as `DIRECT_URL`.
4. For **each** variable, tick **Production**, **Preview** and **Development**, then **Save**.
5. **Deployments** → newest deployment → **⋯** → **Redeploy**. (Saving a variable does not
   rebuild by itself.)

Two details that catch people:

- **Do the values have quotes?** Vercel keeps them if you paste `"postgresql://…"`. Paste the bare
  string, or leave it — PROXIMA strips stray quotes itself.
- **Wrong variable name?** It must be exactly `DATABASE_URL` and `DIRECT_URL`. Vercel's Neon
  integration sometimes adds `POSTGRES_URL` / `DATABASE_URL_UNPOOLED` instead; either copy those
  into our two names or add ours by hand.

### If you just want the site online now

Add `SKIP_DB_MIGRATE` = `1` in **Settings → Environment Variables**, redeploy, and the build will
skip migrations. The landing page, privacy and terms pages will work; **sign-in and chat will not**
until you add the two database URLs and redeploy without the flag.

### Branch (Preview) deploys fail with the same error

Production works, but every branch/PR deploy dies with
`Command "npm run vercel-build" exited with 1`: the database URLs were saved with only the
**Production** box ticked, so a Preview build sees no `DATABASE_URL` at all.

1. **Settings → Environment Variables** → open `DATABASE_URL` → tick **Preview** (and
   **Development**) → **Save**. Same for `DIRECT_URL`.
2. Values of `sensitive` variables **cannot be copied for you** — not by the dashboard, not by the
   Vercel API. Re-paste the two Neon strings; that is the only way to widen the targets.
3. **Deployments** → the branch deploy → **⋯** → **Redeploy**.

If you only want the branch link to load (no login, no chats), add `SKIP_DB_MIGRATE` = `1` scoped to
**Preview** instead: the build then skips migrations and succeeds. This project already has that
Preview flag set, so branch builds are green while the real URLs stay Production-only.

### Checking from your computer first

```bash
npm run env:check     # checks both URLs, the connection and the tables
npm run db:deploy     # applies migrations using the same script Vercel runs
```

If those pass locally, the same two values will work on Vercel.

---

## Step 2: Let Google sign people in on the live site (5 min)

1. Open **https://console.cloud.google.com** → pick the **Proxima** project at the top.
2. ☰ menu → **APIs & Services** → **Credentials** → under **OAuth 2.0 Client IDs** click
   **Proxima Web** (or open **Google Auth Platform → Clients → Proxima Web**).
3. **Authorized JavaScript origins** → **+ Add URI** → `https://proxima.vercel.app`
   _(your address from Step 1, starting with `https://`, no slash at the end)._
4. **Authorized redirect URIs** → **+ Add URI** →
   `https://proxima.vercel.app/api/auth/callback/google`
5. Keep the `http://localhost:3000` entries (they're for your computer). Click **Save**.
   Google says changes can take **5 minutes to a few hours**; usually it's a few minutes.

---

## Step 3: Let everyone sign in, not just test users (3 min)

Right now only the Gmail addresses you added as **Test users** can sign in.

1. **Google Auth Platform** → **Branding**:
   - **Application home page:** `https://proxima.vercel.app`
   - **Application privacy policy link:** `https://proxima.vercel.app/privacy`
   - **Application terms of service link:** `https://proxima.vercel.app/terms`
   - Click **Save**. _(If Google complains about an unauthorized domain, add your domain under
     **Authorized domains** first. These links are optional for basic sign-in, so you can also
     leave them empty.)_
2. **Google Auth Platform** → **Audience** → **Publish app** → **Confirm**.
   Status changes to **In production**.

PROXIMA only asks Google for name, email and profile picture (“basic” information), so Google
normally lets you publish **without a review**.

---

## Step 4: Check the live site (5 min)

Open your address and go through this list:

- [ ] Home page loads, and the headline animates in.
- [ ] **Live demo** answers a question (the first answer can take up to a minute while the AI
      engine wakes up).
- [ ] `https://YOUR-ADDRESS/api/status` shows `"status":"online"` (or `"waking"`, then try again in a minute).
- [ ] **Sign in** with Google → you arrive at `/app` → onboarding → send a message → it streams.
- [ ] Refresh the page → your chat is still in the sidebar (it's saved in Neon).
- [ ] **Settings** → change your name → **Save changes** → message “Settings saved.”
- [ ] `https://YOUR-ADDRESS/sitemap.xml` and `/robots.txt` show your real address, not `localhost`.
- [ ] Paste your address into a WhatsApp/Facebook message: the black PROXIMA preview card appears.
- [ ] Then do the **phone checklist**: [docs/PHONE-CHECKLIST.md](./PHONE-CHECKLIST.md).

---

## Step 5 (optional): Your own domain, e.g. `proxima.com`

1. Buy a domain from any registrar (Namecheap, Cloudflare, GoDaddy…).
2. Vercel → your project → **Settings** → **Domains** → type the domain → **Add** → follow the
   DNS instructions shown (copy the records into your registrar's DNS page). Wait until it says
   **Valid Configuration**.
3. **Settings → Environment Variables** → add `NEXT_PUBLIC_SITE_URL` = `https://proxima.com` →
   **Save**.
4. Google Cloud → **Proxima Web** client → add `https://proxima.com` to **Authorized JavaScript
   origins** and `https://proxima.com/api/auth/callback/google` to **Authorized redirect URIs** → **Save**.
   Update the three **Branding** links too.
5. Vercel → **Deployments** → newest → **⋯** → **Redeploy** (needed so the new address is built in).

---

## Everyday use after setup

| You want to…                  | Do this                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Publish changes               | Merge into `main` on GitHub. Vercel deploys automatically in ~2 min.                                                                 |
| Try changes before publishing | Open a Pull Request. Vercel posts a **Preview** link in the PR. _(Google login only works on your main address, not preview links.)_ |
| Undo a bad deploy             | Vercel → **Deployments** → pick the last good one → **⋯** → **Promote to Production** (or **Instant Rollback**).                     |
| Change a setting/secret       | **Settings → Environment Variables** → edit → then **Redeploy** the latest deployment.                                               |
| See errors                    | Vercel → your project → **Logs** (filter by **Error**).                                                                              |
| Switch the AI                 | Add your provider (docs/API.md → “Switching to a different AI”), set `AI_PROVIDER`, redeploy.                                        |

> ℹ️ Preview deployments use the **same** database as production, and their database migrations run
> on it too. That's fine for one person. When others start using the site, create a Neon **branch**
> for testing (Neon → **Branches** → **Create branch**) and put its strings into the **Preview**
> environment variables on Vercel.

---

## Troubleshooting

| What you see                                    | Fix                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Google: **Error 400: redirect_uri_mismatch**    | The redirect URI in Step 2 doesn't exactly match. It must be `https://YOUR-ADDRESS/api/auth/callback/google`: `https`, no `www` unless you use it, no slash at the end.                                                                                                                                                                    |
| Login page: _“Sign-in isn't set up correctly…”_ | Open `https://YOUR-ADDRESS/api/status?setup=1`. It tests each login key, asks Google whether your Client ID + secret match, and tests the database, then says exactly what to fix. After changing a variable on Vercel, always **Redeploy**. Paste values **without quotes** (the site removes stray quotes itself, but tidy them anyway). |
| Login page: _“Access was denied…”_              | The app is still in Testing mode → Step 3 (**Publish app**), or add the Gmail as a test user.                                                                                                                                                                                                                                              |
| `/app` shows _“Couldn't load PROXIMA”_          | Database problem: check `DATABASE_URL` on Vercel. In Neon, make sure the project isn't suspended.                                                                                                                                                                                                                                          |
| Chat says the engine is waking up / timed out   | The free Render AI server was asleep. Wait a minute and press **Try again**.                                                                                                                                                                                                                                                               |
| Chat never answers / AI errors                  | Open `https://YOUR-ADDRESS/api/status?setup=1` → **AI engine** sends one real test message and says what's wrong. `AI_PROVIDER` must be the **name** `sujan-core` (not a web address) or simply deleted. The web address, if you want to set it, goes in `AI_API_URL`. Then **Redeploy**.                                                  |
| Build log: `P1001: Can't reach database server` | `DIRECT_URL` is wrong or missing on Vercel (copy it again from Neon → **Connect**, with pooling **off**).                                                                                                                                                                                                                                  |
| Share preview shows an old picture              | Facebook caches previews: open https://developers.facebook.com/tools/debug → paste your address → **Scrape Again**.                                                                                                                                                                                                                        |
