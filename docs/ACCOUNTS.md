# Accounts & keys — click-by-click

You need **3 free accounts**: Neon (A), Google Cloud (B), Vercel (C, in Phase 6).
Section D (email login via Resend) is optional — skip it for now.

When A + B are done, run `npm run env:check` — it checks every value and tells you what to fix.

Everything you copy goes into **one file on your computer: `.env.local`** in the project folder.
That file is secret: it's listed in `.gitignore`, so it never gets uploaded to GitHub.

Create it once (in the project folder):

```bash
# macOS / Linux / Git Bash
cp .env.example .env.local
```

```powershell
# Windows PowerShell
Copy-Item .env.example .env.local
```

Open `.env.local` in VS Code. Each line looks like `NAME=value`. Don't add spaces around `=`, and
wrap values in double quotes `"…"` if they contain special characters like `&`.

---

## A. Neon (the database) — ~5 minutes

1. Go to **https://neon.tech** → click **Sign up** → choose **Continue with Google** (or GitHub).
2. You'll land on **Create project** (if not, click **New Project**). Fill in:
   - **Project name:** `proxima`
   - **Postgres version:** leave the default.
   - **Cloud provider:** **AWS**
   - **Region:** **Asia Pacific (Singapore)** — the closest to Nepal. (We'll put the Vercel servers
     in Singapore too in Phase 6, so database calls stay fast.)
   - Click **Create project**.
3. On the project dashboard click the **Connect** button (top right).
4. In the popup keep **Branch: main**, **Database: neondb**, **Role: neondb_owner**.
5. Make sure **Connection pooling** is **ON**. Click **Copy snippet** / the copy icon next to the
   connection string. It contains `-pooler` and looks like:
   `postgresql://neondb_owner:AbC123@ep-cool-name-123456-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
   Paste it into `.env.local`:
   ```env
   DATABASE_URL="postgresql://...-pooler...neon.tech/neondb?sslmode=require"
   ```
6. Now switch **Connection pooling OFF** and copy the string again (it no longer contains `-pooler`):
   ```env
   DIRECT_URL="postgresql://...neon.tech/neondb?sslmode=require"
   ```
   _Why two?_ The app uses the pooled one (handles many visitors). Database setup commands
   (migrations) need the direct one.
7. If the copied string doesn't end with `?sslmode=require`, add it.

> ⚠️ The connection string includes your database password. Never post it in chat or on GitHub.
> If it ever leaks: Neon → **Roles** → `neondb_owner` → **Reset password**, then copy both strings again.

---

## B. Google login — ~10 minutes

1. Go to **https://console.cloud.google.com** and sign in with your Google account.
   Accept the terms if asked.
2. **Create a project:** click the project picker at the top-left (next to "Google Cloud") →
   **New project** → Project name: `Proxima` → **Create**. Wait for the notification, then
   select **Proxima** in the project picker.
3. **Consent screen (what users see when they log in):**
   - Open the ☰ menu → **APIs & Services** → **OAuth consent screen**
     (this opens the **Google Auth Platform** page) → click **Get started**.
   - **App information:** App name `PROXIMA`, User support email = your Gmail → **Next**.
   - **Audience:** choose **External** → **Next**.
   - **Contact information:** your Gmail → **Next**.
   - Tick **I agree…** → **Continue** → **Create**.
4. **Allow yourself to log in while testing:** in the left menu click **Audience** →
   under **Test users** click **+ Add users** → type your Gmail → **Save**.
   _(While the app is in "Testing" mode, only test users can sign in. After deploying you'll click
   **Publish app** so anyone can (docs/DEPLOY.md → Step 3). Basic login (name, email, photo) needs no Google review.)_
5. **Create the login keys:** left menu → **Clients** → **+ Create client**:
   - **Application type:** **Web application**
   - **Name:** `Proxima Web`
   - **Authorized JavaScript origins** → **+ Add URI** → `http://localhost:3000`
   - **Authorized redirect URIs** → **+ Add URI** →
     `http://localhost:3000/api/auth/callback/google`
     (type it exactly — no trailing slash)
   - Click **Create**.
6. A popup shows **Client ID** and **Client secret**.
   **Copy both right now** (or click **Download JSON**) — Google may not show the secret again.
   ```env
   AUTH_GOOGLE_ID="1234567890-abc123.apps.googleusercontent.com"
   AUTH_GOOGLE_SECRET="GOCSPX-xxxxxxxxxxxxxxxxxxxx"
   ```
   _(Lost the secret? Clients → Proxima Web → **Add secret**, then delete the old one.)_

### Auth secret (encrypts login cookies)

Run this in the project folder. It prints a random string:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Paste it into `.env.local`:

```env
AUTH_SECRET="the-random-string-you-just-generated"
```

Use a **different** `AUTH_SECRET` on Vercel (generate a new one) — never reuse dev secrets in production.

### Test the login

```bash
npm run env:check   # everything ✓ ?
npm run db:deploy   # creates the tables (once)
npm run dev
```

Open **http://localhost:3000/login** → **Continue with Google** → pick your (test-user) Gmail →
you land on `/app` and see your name and photo. 🎉

> **Phone note:** Google only allows login redirects to `localhost` or a real `https://` website,
> **not** to your Wi-Fi address (`http://192.168.x.x`). So on your phone you can test every page
> except Google login until Phase 6, when the site is on Vercel (`https://…vercel.app`).

### Common Google errors

| What you see                                                        | Fix                                                                                                                                                            |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google page: **Error 400: redirect_uri_mismatch**                   | The redirect URI in Google Cloud must be exactly `http://localhost:3000/api/auth/callback/google`. Open the site at `http://localhost:3000` (not `127.0.0.1`). |
| PROXIMA login page: _“Access was denied…”_                          | Add your Gmail under **Audience → Test users**.                                                                                                                |
| PROXIMA login page: _“Sign-in isn't set up correctly…”_             | A value in `.env.local` is wrong/missing → run `npm run env:check`, then restart `npm run dev`.                                                                |
| Google page: **Access blocked: app has not completed verification** | You're not a test user yet (see above), or publish the app (docs/DEPLOY.md → Step 3).                                                                          |

---

## C. Vercel (hosting)

Click-by-click guide: **[docs/DEPLOY.md](./DEPLOY.md)**. It covers creating the project, the environment
variables, the production Google redirect URL
(`https://YOUR-SITE.vercel.app/api/auth/callback/google`), publishing the Google app so everyone can
sign in, and your own domain.

---

## D. Email magic-link login (optional, later)

The code is ready; it switches on automatically when both values below exist.
You need a domain you own (e.g. `proxima.com`) to send email to everyone.

1. Go to **https://resend.com** → **Sign up**.
2. **Domains** → **Add Domain** → type your domain → follow the DNS steps shown (copy the records
   into your domain provider's DNS settings) → wait until it says **Verified**.
3. **API Keys** → **Create API Key** → Name `proxima`, Permission **Sending access** → **Add** →
   copy the key (starts with `re_`).
4. Add to `.env.local` (and later Vercel):
   ```env
   AUTH_RESEND_KEY="re_xxxxxxxxxxxx"
   AUTH_EMAIL_FROM="PROXIMA <login@your-domain.com>"
   ```
5. Restart `npm run dev`. The login page now shows **“Email me a sign-in link”** under the Google button.

---

## Your `.env.local` after A + B

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
DATABASE_URL="postgresql://...-pooler...neon.tech/neondb?sslmode=require"
DIRECT_URL="postgresql://...neon.tech/neondb?sslmode=require"
AUTH_SECRET="..."
AUTH_GOOGLE_ID="....apps.googleusercontent.com"
AUTH_GOOGLE_SECRET="GOCSPX-..."
```
