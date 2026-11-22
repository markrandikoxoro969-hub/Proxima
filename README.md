# PROXIMA — Premium Core AI

A premium, full-stack AI assistant website: cinematic landing page + chat app.
Built with **Next.js 16 (App Router) · TypeScript · Tailwind CSS v4**, with Postgres (Neon) + Prisma,
Google login (Auth.js), Framer Motion, and server-side streaming from the PROXIMA Core API.

> ✅ **Status: all 6 phases complete.** Next step: put it online → **[docs/DEPLOY.md](docs/DEPLOY.md)**,
> then test on your phone → **[docs/PHONE-CHECKLIST.md](docs/PHONE-CHECKLIST.md)**.

**What's inside:** cinematic landing page with a live demo · `/app` chat (streaming replies,
four answer modes — Thinking, Fast, Coding, Analyze — markdown + code copy, voice input and
natural spoken replies in a girl or boy voice, hands-free voice mode, file + picture attach, export) ·
selectable themes, including
themes you build yourself · an image studio (AI create + AI edit) · `/settings` (profile,
appearance, download/delete data, delete account) · Privacy & Terms · 404 · installable phone app
with an offline page · Google login · Postgres storage · rate limits · security headers · SEO +
share image.

### Guides

| Guide                                              | What it's for                                         |
| -------------------------------------------------- | ----------------------------------------------------- |
| [docs/ACCOUNTS.md](docs/ACCOUNTS.md)               | Neon database + Google login keys, click by click     |
| [docs/DATABASE.md](docs/DATABASE.md)               | Database commands and troubleshooting                 |
| [docs/API.md](docs/API.md)                         | Every API endpoint, the chat stream, switching the AI |
| [docs/IMAGES.md](docs/IMAGES.md)                   | Image upload, AI create/edit engines and their keys   |
| [docs/VOICE.md](docs/VOICE.md)                     | Natural spoken voice, engines, keys, privacy          |
| [docs/DEPLOY.md](docs/DEPLOY.md)                   | Put the site online with Vercel (+ your own domain)   |
| [docs/PHONE-CHECKLIST.md](docs/PHONE-CHECKLIST.md) | Final test on a real phone                            |
| [docs/WEB-DESIGN-AUDIT.md](docs/WEB-DESIGN-AUDIT.md) | Accessibility, responsive and performance audit       |

---

## 1. What you need on your computer (one time)

| Tool                      | Why                  | Get it                                                        |
| ------------------------- | -------------------- | ------------------------------------------------------------- |
| **Node.js 22 LTS**        | Runs the project     | https://nodejs.org → download **LTS** → install with defaults |
| **Git**                   | Downloads/saves code | https://git-scm.com/downloads                                 |
| **VS Code** (recommended) | Edit files           | https://code.visualstudio.com                                 |

Check they work — open a terminal (macOS: _Terminal_, Windows: _PowerShell_) and run:

```bash
node -v    # should print v22.something (v20.9+ also works)
npm -v     # should print 10.something
git --version
```

## 2. Get the code and install

```bash
git clone https://github.com/markrandikoxoro969-hub/Proxima.git
cd Proxima
npm install
```

`npm install` downloads all libraries into a `node_modules` folder (takes 1–2 minutes).

## 3. Create your settings file

```bash
cp .env.example .env.local          # macOS / Linux / Git Bash
Copy-Item .env.example .env.local   # Windows PowerShell
```

Easiest: run `npm run env:setup`. It asks for each key (just paste and press Enter), checks it,
creates `AUTH_SECRET` for you and writes `.env.local`. Or fill it in by hand following
**[docs/ACCOUNTS.md](docs/ACCOUNTS.md)** (click-by-click: Neon database +
Google login). Then check it and create the database tables:

```bash
npm run env:check   # tells you exactly what's missing or wrong
npm run db:deploy   # creates the tables in Neon (once)
```

More database help: **[docs/DATABASE.md](docs/DATABASE.md)**.

**AI engine:** nothing to set up. The app calls the PROXIMA Core API from the server by default.
Want to work offline, or skip waiting for Render to wake up? Add this line to `.env.local`:

```env
AI_PROVIDER="mock"
```

All the API endpoints are explained in **[docs/API.md](docs/API.md)**.

## 4. Run it

```bash
npm run dev
```

Try the login: **http://localhost:3000/login** → _Continue with Google_ → you land on `/app`.
The first time, PROXIMA asks your name and age (onboarding), then the chat opens.

> 💡 No AI needed to try it: put `AI_PROVIDER="mock"` in `.env.local` and you get instant fake
> replies (with markdown and code) — perfect for testing the design. Remove the line (or set
> `AI_PROVIDER="sujan-core"`) to use the real engine.

Open **http://localhost:3000**. Edit any file and the page updates by itself.
Stop the server with **Ctrl + C**.

### Test on your phone (same Wi-Fi)

```bash
npm run dev:phone
```

The terminal prints a **Network** address. Find your computer's IP:
macOS → _System Settings → Wi-Fi → Details → IP address_; Windows → run `ipconfig` → _IPv4 Address_.
On your phone open `http://YOUR-IP:3000` (for example `http://192.168.1.5:3000`).
Google login can't work on a Wi-Fi address (Google only allows `localhost` or `https://` sites),
so test login on your phone after deploying (docs/DEPLOY.md).

## 5. Quality checks

| Command                | What it does                                                           |
| ---------------------- | ---------------------------------------------------------------------- |
| `npm test`             | Runs automated tests (Vitest)                                          |
| `npm run lint`         | Finds code problems (ESLint)                                           |
| `npm run typecheck`    | Checks TypeScript types                                                |
| `npm run build`        | Makes the optimized production version                                 |
| `npm run check:bundle` | After a build: checks JavaScript size per page vs `bundle-budget.json` |
| `npm run check`        | All of the above in one go — run before every deploy                   |
| `npm start`            | Runs the production build locally (after `npm run build`)              |
| `npm run format`       | Auto-formats all code (Prettier)                                       |

---

## 6. Put it online

Follow **[docs/DEPLOY.md](docs/DEPLOY.md)** (about 20 minutes): import the GitHub repo into Vercel,
paste 6 environment variables, deploy, add the live address to Google, publish the Google app.
After that, every merge into `main` goes live automatically. Then run through
**[docs/PHONE-CHECKLIST.md](docs/PHONE-CHECKLIST.md)**.

## Folder structure

```
Proxima/
├─ docs/
│  ├─ ACCOUNTS.md          ← click-by-click: Neon, Google login, Resend
│  ├─ API.md               ← every API endpoint, the chat stream format, how to switch AI
│  ├─ IMAGES.md            ← pictures: upload, AI create/edit, engines, limits, privacy
│  ├─ VOICE.md             ← natural voice: engines, voices, keys, fallback, privacy
│  ├─ DATABASE.md          ← database setup, commands, troubleshooting
│  ├─ DEPLOY.md            ← put it online with Vercel, click by click
│  └─ PHONE-CHECKLIST.md   ← final test on a real phone
├─ prisma/
│  ├─ schema.prisma        ← database tables (User, Conversation, Message, …)
│  └─ migrations/          ← SQL that creates/updates the tables (commit these)
├─ public/
│  ├─ icons/               ← app icons for phones (made by scripts/generate-icons.mjs)
│  ├─ offline.html         ← "You're offline" page
│  └─ sw.js                ← tiny service worker: shows offline.html when there's no internet
├─ scripts/
│  ├─ check-bundle.mjs     ← bundle-size check
│  ├─ generate-icons.mjs   ← re-creates the app icons if you change the logo
│  └─ check-env.mjs        ← setup doctor (npm run env:check)
├─ src/
│  ├─ auth.config.ts       ← login rules (which pages are protected) — light, used by proxy
│  ├─ auth.ts              ← full Auth.js setup: Google (+ email when enabled) + database
│  ├─ proxy.ts             ← runs before /app, /settings, /login: redirects guests to /login
│  ├─ instrumentation.ts   ← checks .env at server start
│  ├─ app/                 ← pages (each folder = a URL)
│  │  ├─ api/
│  │  │  ├─ auth/          ← Auth.js endpoints (Google callback etc.)
│  │  │  ├─ chat/          ← POST /api/chat: validate → rate-limit → save → AI → stream (SSE)
│  │  │  ├─ sessions/      ← list/create/rename/delete chats, + [id]/export
│  │  │  ├─ export/        ← download all your chats
│  │  │  ├─ me/            ← your profile (name, age, theme, particles)
│  │  │  └─ status/        ← real "engine online" + latency (also wakes Render)
│  │  ├─ app/              ← /app chat page (server loads your chats, then shows the chat UI)
│  │  ├─ login/            ← /login page, Google button, email form (hidden until enabled)
│  │  ├─ settings/         ← /settings page (signed in only)
│  │  ├─ privacy/, terms/  ← legal pages (plain language; update the date in src/lib/legal.ts)
│  │  ├─ not-found.tsx     ← 404 "Lost in space" page
│  │  ├─ error.tsx         ← friendly "Something went wrong" + Try again (global-error.tsx = last resort)
│  │  ├─ manifest.ts       ← makes PROXIMA installable on phones (name, icons, colours)
│  │  ├─ sitemap.ts, robots.ts ← tell Google which pages to show (private pages are hidden)
│  │  ├─ opengraph-image.tsx   ← the share picture for WhatsApp/Facebook/X (drawn at build time)
│  │  ├─ apple-icon.png    ← iPhone home-screen icon
│  │  ├─ fonts/            ← self-hosted Montserrat + JetBrains Mono (OFL licence)
│  │  ├─ fonts.ts          ← font setup (next/font/local)
│  │  ├─ globals.css       ← design system: colours, glass, easing, reduced motion
│  │  ├─ icon.svg          ← favicon
│  │  ├─ layout.tsx        ← wraps every page: fonts, theme, metadata, viewport
│  │  ├─ page.tsx          ← landing page (static HTML; puts the sections below in order)
│  │  └─ template.tsx      ← soft blur fade when moving between pages (not on first load)
│  ├─ config/
│  │  └─ identity.ts       ← Proxima's identity answers (developer, age, gender) — edit freely
│  ├─ components/
│  │  ├─ brand/logo.tsx    ← PROXIMA planet + wordmark
│  │  ├─ chat/             ← ⭐ the /app chat screen:
│  │  │  ├─ chat-app.tsx        ← puts everything together (shortcuts, engine status, dialogs)
│  │  │  ├─ sidebar.tsx         ← chats list, rename/delete, engine status, profile, theme
│  │  │  ├─ chat-header.tsx     ← "Proxima ✦", latency, Export menu
│  │  │  ├─ message-list.tsx    ← virtual scrolling (only visible messages are drawn)
│  │  │  ├─ message-item.tsx    ← one message: thinking dots, errors + Try again, copy
│  │  │  ├─ markdown.tsx        ← safe markdown (no HTML runs), tables, links
│  │  │  ├─ code-block.tsx      ← code colours (Prism) + Copy button
│  │  │  ├─ composer.tsx        ← message box: Enter to send, files, voice, hands-free status
│  │  │  ├─ mode-menu.tsx       ← Thinking / Fast / Coding / Analyze picker + Show thinking
│  │  │  ├─ voice-menu.tsx      ← girl/boy, natural/device quality, speed, preview, hands-free
│  │  │  ├─ empty-state.tsx     ← greeting + one line of guidance (no cards)
│  │  │  ├─ settings-dialog.tsx ← name, age, theme, particles, clear logs, sign out
│  │  │  ├─ onboarding.tsx      ← typing logo → name → age → loading
│  │  │  └─ particles.tsx       ← background stars (fewer on phones, pauses when hidden)
│  │  ├─ landing/          ← ⭐ the landing page:
│  │  │  ├─ site-header.tsx     ← floating glass bar + section links
│  │  │  ├─ hero.tsx            ← blur → sharp headline, stars, orbit rings
│  │  │  ├─ skills.tsx          ← the six skills grid
│  │  │  ├─ how-it-works.tsx    ← 3 steps
│  │  │  ├─ live-demo.tsx       ← real chat without login (not saved, 5 msgs/min, Hear this)
│  │  │  ├─ faq.tsx             ← questions (works without JavaScript) + Google FAQ data
│  │  │  ├─ site-footer.tsx     ← final call-to-action + links
│  │  │  ├─ landing-effects.tsx ← ONE script for all motion: reveals, parallax, smooth
│  │  │  │                        scroll (Lenis), magnetic buttons, glow, custom cursor
│  │  │  └─ magnetic.tsx        ← magnetic button wrapper + section headings
│  │  ├─ motion/           ← Framer Motion setup (small bundle, honours reduced motion)
│  │  ├─ settings/         ← /settings screen + form pieces shared with the Settings pop-up
│  │  ├─ legal/, layout/   ← legal page layout, simple header/footer for small pages
│  │  ├─ pwa/              ← registers the service worker (production only)
│  │  ├─ theme/            ← dark/light theme provider + toggle button
│  │  └─ ui/               ← buttons (44px touch targets), spinner, toasts, dialogs
│  ├─ generated/prisma/    ← auto-generated database client (not in git)
│  ├─ lib/
│  │  ├─ ai/               ← ⭐ swappable AI provider (providers/sujan-core.ts, providers/mock.ts)
│  │  │  └─ modes.ts       ← the four answer modes: prompts + model settings (browser + server)
│  │  ├─ api/              ← API helpers: errors, same-origin check, SSE stream
│  │  ├─ auth/             ← safe redirects + "who is signed in" helpers
│  │  ├─ chat/             ← attachments → prompt, titles, export, database queries
│  │  │  └─ client/        ← browser side: reading the stream, chat state (useChat),
│  │  │                       answer mode (use-mode), files, voice input, code highlighting,
│  │  │                       voice output (natural audio + device fallback) + voice prefs
│  │  ├─ speech/           ← ⭐ natural-voice engines (Edge free, OpenAI, Pollinations)
│  │  ├─ identity.ts       ← detects identity questions, cleans leaks in AI replies
│  │  ├─ rate-limit.ts     ← limits stored in Postgres (20/min signed in, 5/min demo)
│  │  ├─ validation.ts     ← all input rules (zod): 4000 chars, 100 KB files, …
│  │  ├─ db.ts             ← the database connection (Neon, or local Postgres on localhost)
│  │  ├─ env.ts            ← checks environment variables with zod
│  │  ├─ cn.ts             ← merges Tailwind class names
│  │  ├─ site.ts           ← public site info (name, URL, links)
│  │  └─ theme.ts          ← theme logic + no-flash script
│  └─ test/                ← test setup + in-memory Postgres for tests
├─ .env.example            ← template of all settings (no secrets)
├─ bundle-budget.json      ← max JavaScript size per page
├─ next.config.ts          ← security headers, images, dev origins
├─ vercel.json             ← Vercel settings: servers in Singapore (sin1)
├─ prisma.config.ts        ← Prisma CLI settings (reads DIRECT_URL)
└─ vitest.config.mts       ← test runner config
```

## Design rules (keep these when editing)

- Easing everywhere: `ease-premium` = `cubic-bezier(0.16, 1, 0.3, 1)`.
- Animate only **transform, opacity, filter**. Never `transition: all` — list properties,
  e.g. `transition-[transform,opacity]`.
- `glass` (real backdrop blur) on a **few** big surfaces only; use `glass-solid` for repeated cards.
- Colours via tokens: `bg-bg`, `text-fg`, `text-muted`, `text-subtle`, `border-line`,
  `bg-inverse text-on-inverse`. They switch automatically in dark/light.
- Interactive elements get the `tap` class (≥ 44×44px).
- Animations are disabled automatically when the device asks for reduced motion.

### Landing page motion — how it works

The landing page is plain, fast HTML. Sections just carry **labels**, and one small script
(`landing-effects.tsx`) brings them to life:

| Label in the HTML      | What happens                                                                | Phones?    |
| ---------------------- | --------------------------------------------------------------------------- | ---------- |
| `data-reveal`          | blurs/fades in when scrolled into view (`style={{"--d": "120ms"}}` = delay) | ✅         |
| `data-parallax="0.15"` | drifts slightly while scrolling                                             | ❌ desktop |
| `class="spotlight"`    | card glow follows the mouse                                                 | ❌ desktop |
| `class="vblur"`        | tiny blur (max 3px) only while scrolling **fast**                           | ❌ desktop |

- New sections are built from the shared motion primitives: `Reveal`, `Stagger`/`StaggerItem`,
  `Headline` (word-by-word blur → sharp) and `Parallax` — all in `src/components/motion/`, all
  reading their timings from `src/lib/motion/tokens.ts`. They use `motion/react` with
  `LazyMotion` + `domAnimation`, and `MotionConfig reducedMotion="user"` follows the device setting.
- Smooth scrolling (Lenis) and the custom cursor are **desktop only** and are downloaded only
  on desktop — phones keep their natural scrolling.
- With "reduce motion" switched on (phone/computer accessibility setting) everything simply
  appears, with no movement.
- Content is only hidden for the reveal when JavaScript runs (`html.js`), so nothing is ever
  stuck invisible.
- The hero headline animates with pure CSS, so it paints immediately (measured LCP ≈ 0.9 s
  on a simulated slow phone, layout shift 0).

## Chat behaviour worth knowing

- **Answer modes.** The composer has a small mode button (or ⌘K → “Answer mode: …”) with four choices:

  | Mode | What it does | Private thinking | Token budget |
  | --- | --- | --- | --- |
  | **Thinking** (default) | Reasons before answering; checks edge cases | On | 4096 |
  | **Fast** | One to three sentences, no private thinking | Off | 1024 |
  | **Coding** | Complete, runnable code with the right language tag | On | 8192 |
  | **Analyze** | Known vs assumed, a comparison, then a recommendation | On | 6144 |

  Each mode swaps the system-prompt section **and** the model settings (temperature, top_p,
  history length), so it changes how the engine actually answers — not just a label. The choice is
  remembered on that device, and the reply shows a small mode chip. `NVIDIA_MAX_TOKENS` still caps
  the budget. The landing-page demo uses Thinking unless changed in the app.
- **Reasoning is private by default.** Newer models (NVIDIA Nemotron) stream their thinking in a
  separate field. PROXIMA never shows it and never saves it. While the model thinks you see a
  wordless orb and a shimmer line (the label follows the mode: Thinking / Writing code / Analyzing).
  The mode menu's **Show thinking** switch (or Settings → **Show reasoning**, off by default) reveals
  it in a collapsed block for that browser only, for debugging.
- **The reply is cleaned, then streamed.** The server removes openers like "Great question" before
  the first sentence is shown, so what you read is exactly what gets saved.
- **Voice mode talks back.** The speaker button in the chat header opens **Voice mode**: choose a
  **girl** or **boy** voice, a speed, and hear a preview before turning it on. With _Read replies
  aloud_ on, each new answer is spoken once it finishes (never while it is still streaming).
  **Hands-free** opens the mic after the answer finishes, and closes it again while Proxima talks.
  Every finished reply also has a speaker button for a one-off replay, and **Stop reading** is always
  one tap away. **Quality → Natural** uses a neural voice from our own server (free Edge voices by
  default, or OpenAI / ElevenLabs with a key); **Device** uses the browser and works offline. If the
  natural voice is unavailable, Proxima continues with the device voice automatically. Markdown,
  links and code fences are cleaned before speaking, and long answers are split into sentence-sized
  chunks that download ahead of playback. The preference is remembered on that device. The
  landing-page demo has a small **Hear this** button under each answer, so voice works before
  signing in. Engine details, keys and privacy: **[docs/VOICE.md](docs/VOICE.md)**.
- **Quick follow-ups on a reply.** _Simplify_ asks for the same answer in plainer words with an
  example; _Make a checklist_ turns it into a short, practical list. Both send a normal follow-up,
  so they work with the same history and answer mode.
- **⌘K / Ctrl+K** opens the command palette in the chat (new chat, voice mode, theme, copy last reply,
  settings). `?` isn't used; `/` jumps to the message box.
- Mobile sidebar is a **bottom sheet**: drag the handle down, tap outside or press Escape to close.

## Security notes

- Secrets live **only** in `.env.local` (local) and Vercel environment variables (production).
  Only variables starting with `NEXT_PUBLIC_` reach the browser — never put secrets in those.
- Security headers (CSP, nosniff, referrer policy, permissions policy, frame blocking, HSTS on
  Vercel) are set in `next.config.ts`.
- Zoom is allowed (the original file blocked it — an accessibility failure).
- The AI API is called **only from the server**. The browser talks to `/api/chat` and never sees the
  AI address. The API refuses POST/PATCH/DELETE requests coming from other websites (CSRF/CORS protection).
- Every API input is checked with zod. Users can only see or change their **own** chats (anyone
  else's chat answers "not found"). Rate limits are stored in Postgres, and guests are identified by a
  hashed IP (raw IPs are never stored).
- Login uses encrypted cookies (JWT). Protected pages are checked twice: in `src/proxy.ts`
  and again on the server page itself. After-login redirects only go to pages on this site.
- Deleting an account (Settings) needs the word `DELETE` typed in and a same-site request; the
  database then removes the user's Google link, chats and messages together.
- The service worker (`public/sw.js`) caches **only** the offline page, so chats, login and the API
  are never served from an old copy.

## Legal pages

`/privacy` and `/terms` are written in plain language to match what the code really does (what's
stored, what's sent to the AI, which services are used). They're a solid starting point, **not legal
advice**. Read them before launch and adjust if your situation differs (for example, if you add
analytics, payments or another AI provider). When you change them, update the date in `src/lib/legal.ts`.

## Previous quality snapshot (simulated mid-range phone; pre-upgrade)

| Page                 | Accessibility | Best practices | SEO               | LCP       | Layout shift |
| -------------------- | ------------- | -------------- | ----------------- | --------- | ------------ |
| `/` (landing)        | 100           | 100            | 100               | 0.9 s     | 0            |
| `/privacy`, `/terms` | 100           | 100            | 100               | 0.8–2.0 s | 0            |
| `/login`             | 100           | 100            | hidden on purpose | 0.8 s     | 0            |
| `/app`, `/settings`  | 100           | 100            | hidden on purpose | 0.6–0.8 s | 0            |

This was a prior simulated-device snapshot, not a repeatable local Chrome measurement and not the result of this upgrade. Do not use it as the current before/after claim. Capture fresh reports after deployment; the current workspace has no browser runner, as noted in the performance audit below.

## Build progress

- [x] **Phase 1 — Foundation:** Next.js 16 + TS + Tailwind v4, self-hosted fonts, design tokens,
      no-flash dark/light theme, security headers, ESLint, Prettier, Vitest, bundle-size check
- [x] **Phase 2 — Database + login:** Prisma 7 + Neon, Auth.js Google login (email magic-link ready
      but off), `/login`, protected `/app` + `/settings`, setup doctor, DB integration tests
- [x] **Phase 3 — Backend API:** swappable AI provider, identity config, `/api/chat` (SSE streaming,
      cold-start "waking up" status, Postgres rate limits), sessions, export, profile, status, API tests
- [x] **Phase 4 — `/app` chat:** onboarding, sidebar, streaming markdown + code copy, settings, voice,
      files, export, toasts, virtual scrolling, retry, keyboard shortcuts
- [x] **Phase 5 — Landing + motion:** cinematic hero, skills, how it works, live demo
      (guest, not saved), FAQ, footer; reveals, parallax, Lenis, magnetic
      buttons, glow, custom cursor, page transitions — all reduced-motion aware
- [x] **Phase 6 — Polish + ship:** `/settings` (download/delete data, delete account), Privacy, Terms,
      404 + error pages, SEO metadata, share image, sitemap, robots, installable app + offline page,
      accessibility/performance pass, Vercel setup + deploy guide, phone checklist

### Upgrade pass (November 2026)

- [x] **NVIDIA provider:** `openai` client pointed at `https://integrate.api.nvidia.com/v1`, chosen by
      `AI_PROVIDER=nvidia`; Render stays as an automatic fallback. Check it with `npm run ai:check`.
- [x] **Silent reasoning:** `reasoning_content` is dropped server-side unless you switch it on for
      display, and it is never stored.
- [x] **Copy cleanup:** generic AI phrasing and emoji removed across landing, chat, errors and share
      text; headlines are six words or fewer.
- [x] **Motion v2:** shared motion tokens, `LazyMotion`/`m`, stagger + word reveal + `layoutId`
      (sidebar pill, theme tabs), `AnimatePresence` view/panel transitions, magnetic buttons,
      parallax, velocity blur, mobile sheet drag, send → stop morph.
- [x] **Chat UX:** gradient-mesh empty state with film grain, shimmer skeletons, ⌘K palette,
      copy/regenerate, jump-to-latest, steady token reveal with a fading growing edge.

### Voice mode (November 2026)

- [x] **Proxima talks back:** natural neural voices (**girl** and **boy**), three speeds, a preview,
      read-each-reply and a per-message replay button. Free Edge voices work with no key; OpenAI and
      Pollinations / ElevenLabs are one environment variable away. The browser voice remains the
      offline fallback instead of the default.
- [x] **Hands-free loop:** when the answer finishes speaking, the mic opens for the next question;
      it never listens while Proxima is talking, and it sends the transcript straight away.
- [x] **Safe by default:** speech never starts mid-stream, stops on send, chat switch or stop, and
      the choice is stored per device. Keys stay server-side; the answer text goes to the chosen
      voice service only to be spoken, and audio is cached in the tab (never in the database).
- [x] **Clean pronunciation:** Markdown emphasis, links, tables and code fences are stripped, and
      long replies are chunked so browsers don't cut them off.

### Themes + pictures (November 2026)

- [x] **Themes:** 12 built-in themes (Proxima, Daylight, Midnight, Ocean, Ember, Paper, Aurora,
      Sakura, Graphite, Neon, Sky, Nature) chosen in Settings and the chat top bar, plus a builder for your own theme from three
      colours. Colours are derived (and contrast-checked) from those three, synced to the account,
      and painted before the first frame — no flash. The sun/moon button keeps a theme's character
      (Midnight ⇄ Ocean).
- [x] **Upload:** attach up to 4 pictures to a message; the browser shrinks them to ≤1280 px JPEG,
      the server re-checks the real type and size, and the chat shows the actual picture.
- [x] **Image studio:** create a picture from a prompt (style + shape presets) and edit one with
      AI. NVIDIA FLUX.1 dev creates and FLUX.1 Kontext edits, each with its own key
      (`IMAGE_GENERATION` / `IMAGE_EDITING`). NVIDIA’s hosted editing preview currently limits input images;
      OpenAI or a self-hosted endpoint can edit uploads. See
      [docs/IMAGES.md](docs/IMAGES.md).

---

## Performance, themes and memory upgrade

These are incremental upgrades to the existing PROXIMA app; the default face stays **Montserrat + JetBrains Mono**. The other theme voices only apply while that scene is active. The backgrounds are procedural CSS (no downloaded image or font files).

### Performance audit (what changed, and what was not measured)

| Hot path | Before | After in code | What this number means |
| --- | --- | --- | --- |
| Landing cursor | 2 transform writes and up to 4 attribute toggles per `pointermove`; style invalidation could happen at raw pointer rate | pointer events only update refs; transform writes are coalesced in one `requestAnimationFrame`; hover/text attributes only change when their state changes; there is no React state update | Source-level work count, **not** an FPS measurement |
| Scroll reveals | Hero/footer could re-rasterise `filter: blur(...)` on scroll | velocity blur removed; reveal animates opacity/transform, not filter | Removes a repeated full-layer blur pass |
| Glass surfaces | blur radius was 20px; up to 4 surfaces could stack | 12px desktop, 8px phone; dialogs, toasts and cards use solid glass; active blurred surfaces are budgeted at 3 or fewer | CSS design limits, not a GPU trace |
| Long/streaming chat | Each message can update independently | existing `MessageItem` memo + virtual list + `FrameBatcher` (one small text callback per ~30ms tick) retained; chat scroll has `data-lenis-prevent` | Protects older rows and prevents Lenis from taking chat scrolling |
| Motion when not visible | background tabs could continue CSS animation | `PerfGuards` pauses CSS animations while hidden; reduced-motion/low-core devices get still theme scenes | Browser CSS behavior; verify on your device |
| Background particles | a 60fps full-screen canvas on every screen, 60 dots on desktop / 28 on phones | the canvas is **desktop-only**, 42 dots, **30fps**, and still pauses off-screen / on a hidden tab | Cuts the canvas work by ~half and removes it entirely on phones |
| Theme scenes | four promoted layers (`will-change` on each); phone clouds animated `background-position` = full-layer repaint every frame | no forced `will-change`; the drift is a transform again; phones freeze the busy detail layer and drop the far layer | Removes a per-frame full-screen repaint |
| Landing below the fold | every section's DOM and the live demo's state were built on first load | `content-visibility: auto` on Skills / How it works / FAQ; the live demo mounts near the viewport | Less DOM and hydration before the first scroll |
| Streaming on phones | the growing reply carried a full-layer `mask-image` reset every frame | the mask is disabled ≤767px (the caret still shows progress) | Fewer composites while text streams |
| Phone inputs | fields under 16px make iOS zoom on focus; a stray element could scroll the page sideways | 16px fields on phones, `overflow-x: clip`, `touch-action: manipulation`; `interactiveWidget=resizes-content` keeps the composer above the keyboard | Prevents two of the most common mobile annoyances |

**Honesty note:** this workspace has no Chrome/Lighthouse browser, so no real trace, INP, React Profiler, Lighthouse score or before/after FPS was captured. We won't invent those figures. To get device measurements, use Chrome DevTools → **Performance**: record 10 seconds of scrolling and 10 seconds of streaming; inspect long tasks (over 50ms), frame time (16.7ms budget), and event handlers. In **React DevTools → Profiler**, record a stream and check that earlier message rows do not commit. Run Lighthouse with **Mobile** selected and record Performance + INP. Target: 60fps, INP under 200ms, no typing/streaming task over 50ms.

**Bundle check (production build, gzip):** the optimization pass moved the lightweight pages below their budgets without raising them. Measured before → after: `/login` 206.1→**154.5**/170 KB, `/privacy` 204.1→**152.4**/170 KB, `/terms` 204.1→**152.4**/170 KB, `/settings` 233.8→**182.2**/200 KB, `/settings/memory` 221.3→**169.6**/170 KB. `/login/verify` stays at 141.2/170 KB. The landing page is 213.5→**211.5**/210 KB and `/app` is 291.6→**292.1**/260 KB, so those two still fail (the chat screen keeps the motion and virtual-list code that makes streaming smooth). This is gzip JS size, not a frame-rate metric. The local sandbox cannot download Prisma's schema engine, so these figures came from a production build with a type-only generated-client stub (server-side, no client JavaScript); the budgets were not edited. Optimize/lazy-load further rather than raising a budget just to turn the check green.

### Optimization pass (November 2026)

- **Lighter simple pages:** the theme toggle and toasts no longer import the motion library; both use small CSS animations. Legal pages, login and both settings screens dropped roughly 50 KB of first-load JavaScript each.
- **Fewer database round-trips:** image serving no longer loads the same (full-byte) row twice and deleting a picture is a single delete; opening a saved chat merges the ownership and metadata queries; each chat message reuses the turns already read with the conversation instead of running a second history query.
- **Phone audio:** the voice player is created once and unlocked with a silent WAV on the first tap/keypress, so iOS Safari and Android Chrome don't block the neural reply audio that starts after the network response. A persistent element also avoids allocating a new `Audio` per sentence.
- **Streaming re-renders:** the composer voice object and header voice menu are memoized, and copying the last reply no longer rebuilds the command palette on every streamed token.
- **Image decode:** chat pictures and studio thumbnails decode off the main thread (`decoding="async"`), keeping scrolling smoother while images appear.

### Themes

The top bar and `/settings` offer Default/Light plus Sky (geometric), Ocean (rounded system font), and Nature (PROXIMA's normal font). Sky, Ocean and Nature are light CSS gradients/layers, with a static low-power / reduced-motion fallback and fewer scene layers on phones. Ocean's font stack asks the OS for rounded faces and falls back to the already-loaded Montserrat; no new font/media download is needed. Theme scenes use no third-party media or font assets, so there is no new asset license/attribution to list. The theme tests check muted/subtle/`accentText` contrast against palette backgrounds; still verify actual contrast on scene surfaces, especially text over a translucent backdrop.

### Optional memory and Temporary chat

Memory starts **off**. After a person accepts the Settings consent card, completed replies can save a few short, keyword-matchable facts/preferences; memory reads and writes stop when the switch is off. `/settings/memory` lists, edits, exports and deletes notes. Replies that used notes show a **Memory used · Forget this** chip. **Temporary** in the composer starts a fresh local chat: nothing from it is saved and memory is not read or written. Notes are separate from chat history; deleting a chat does not delete a note. Deleting an account cascades to notes.

### Production-build and responsive test (repeat after each upgrade)

Use the production server, not `next dev`, for the acceptance check:

```bash
# Terminal 1: build, then run the production app
npm run build
npm start
```

Open `http://localhost:3000`. For local signed-in chat, use your configured Neon + Google settings; for a no-login visual test, the landing page works without signing in. If you want a local fake answer engine, set `AI_PROVIDER="mock"` in `.env.local`, run the commands above, and remove that setting before testing the real NVIDIA provider. Stop the production server with **Ctrl+C**.

In Chrome DevTools → device toolbar, test each viewport below. Repeat the same checks in a real phone browser for touch/selection:

| Width | Device-toolbar setup |
| ---: | --- |
| 360px | choose Responsive, set width to `360`, height `800` |
| 390px | choose Responsive, set width to `390`, height `844` |
| 768px | choose Responsive, set width to `768`, height `1024` |
| 1280px | choose Responsive, set width to `1280`, height `800` |
| Desktop | resize to `1440 × 900` or larger and test keyboard/mouse |

Run this checklist at each width:

1. **Lag:** drag the landing cursor / scroll the landing page; no cursor hiding after tab-switch; chat scrolls naturally without page-wide Lenis; rapidly send messages and confirm older bubbles don't visibly blink/re-render. Capture the Performance trace and Profiler figures described above.
2. **Selection:** drag-select the logo/navigation/button labels (they should not select); select and copy a chat answer and code block; long-press a chat answer on phone; right-click still opens the normal browser menu; keyboard tab/Enter works.
3. **Thinking/reply:** send a message with the mock engine; see orb, shimmer, three dots and live seconds, then “Thought for Ns”; observe the answer sharpen/slide in and the caret; scroll upward before a long answer and confirm auto-scroll doesn't pull you down. Enable OS reduced motion and repeat.
4. **Themes:** in `/settings` and the top bar select Light, Sky, Ocean and Nature. Refresh and check the choice stays without a flash. Confirm Nature uses Montserrat, no new font request appears, and scene motion stops with reduced motion or low-power fallback.
5. **Memory:** verify switch is off on a fresh account; accept consent; say “I'm training for a half marathon”; verify a note appears in `/settings/memory`; ask a related question and see the chip; use “Forget this”; test edit/export/delete-all. Turn memory off and verify it is neither retrieved nor updated. Turn on Temporary and verify the URL/history isn't added to the sidebar or database and no memory chip appears.

Database migration and Neon notes: see **[docs/DEPLOY.md → Memory migration](docs/DEPLOY.md#memory-migration)**. The additive migration is safe for existing users: the new boolean defaults to false, and it does not alter chats.
