# Accounts & keys — click-by-click

You need **3 free accounts** in total. Phase 1 needs none of them.
Do sections A and B any time before Phase 2. Section C (Vercel) comes in Phase 6.

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
   _(While the app is in "Testing" mode, only test users can sign in. In Phase 6 we'll click
   **Publish app** so anyone can. Basic login (name, email, photo) needs no Google review.)_
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

---

## C. Vercel (hosting) — Phase 6

Instructions arrive in Phase 6, together with the production Google redirect URL
(`https://YOUR-SITE.vercel.app/api/auth/callback/google`).

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
