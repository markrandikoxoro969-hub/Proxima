# PROXIMA — Premium Core AI

A premium, full-stack AI assistant website: cinematic landing page + chat app.
Built with **Next.js 16 (App Router) · TypeScript · Tailwind CSS v4**, with Postgres (Neon) + Prisma,
Google login (Auth.js), Framer Motion, and server-side streaming from the PROXIMA Core API.

> 🚧 **Status: Phase 5 of 6 complete (landing page + motion).** See [Build progress](#build-progress).

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

Fill it in by following **[docs/ACCOUNTS.md](docs/ACCOUNTS.md)** (click-by-click: Neon database +
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
Google login can't work on a Wi-Fi address (Google only allows `localhost` or `https://` sites) —
test login on your phone after deploying to Vercel in Phase 6.

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

## Folder structure (so far)

```
Proxima/
├─ docs/
│  ├─ ACCOUNTS.md          ← click-by-click: Neon, Google login, Vercel, Resend
│  ├─ API.md               ← every API endpoint, the chat stream format, how to switch AI
│  └─ DATABASE.md          ← database setup, commands, troubleshooting
├─ prisma/
│  ├─ schema.prisma        ← database tables (User, Conversation, Message, …)
│  └─ migrations/          ← SQL that creates/updates the tables (commit these)
├─ scripts/
│  ├─ check-bundle.mjs     ← bundle-size check
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
│  │  │  ├─ composer.tsx        ← message box: Enter to send, files, voice, 4000 counter
│  │  │  ├─ empty-state.tsx     ← "HOW CAN I HELP?" + suggestions
│  │  │  ├─ settings-dialog.tsx ← name, age, theme, particles, clear logs, sign out
│  │  │  ├─ onboarding.tsx      ← typing logo → name → age → loading
│  │  │  └─ particles.tsx       ← background stars (fewer on phones, pauses when hidden)
│  │  ├─ landing/          ← ⭐ the landing page:
│  │  │  ├─ site-header.tsx     ← floating glass bar + section links
│  │  │  ├─ hero.tsx            ← blur → sharp headline, stars, orbit rings
│  │  │  ├─ skills.tsx          ← the six skills grid
│  │  │  ├─ how-it-works.tsx    ← 3 steps
│  │  │  ├─ slides.tsx          ← full-screen slides (swipe, arrow keys, dots)
│  │  │  ├─ live-demo.tsx       ← real chat without login (not saved, 5 msgs/min)
│  │  │  ├─ faq.tsx             ← questions (works without JavaScript) + Google FAQ data
│  │  │  ├─ site-footer.tsx     ← final call-to-action + links
│  │  │  ├─ landing-effects.tsx ← ONE script for all motion: reveals, parallax, smooth
│  │  │  │                        scroll (Lenis), magnetic buttons, glow, custom cursor
│  │  │  └─ magnetic.tsx        ← magnetic button wrapper + section headings
│  │  ├─ motion/           ← Framer Motion setup (small bundle, honours reduced motion)
│  │  ├─ theme/            ← dark/light theme provider + toggle button
│  │  └─ ui/               ← buttons (44px touch targets), spinner, toasts, dialogs
│  ├─ generated/prisma/    ← auto-generated database client (not in git)
│  ├─ lib/
│  │  ├─ ai/               ← ⭐ swappable AI provider (providers/sujan-core.ts, providers/mock.ts)
│  │  ├─ api/              ← API helpers: errors, same-origin check, SSE stream
│  │  ├─ auth/             ← safe redirects + "who is signed in" helpers
│  │  ├─ chat/             ← attachments → prompt, titles, export, database queries
│  │  │  └─ client/        ← browser side: reading the stream, chat state (useChat),
│  │  │                       files, voice input, code highlighting
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
| `data-magnetic`        | button follows the mouse a little                                           | ❌ desktop |
| `class="spotlight"`    | card glow follows the mouse                                                 | ❌ desktop |
| `class="vblur"`        | tiny blur (max 3px) only while scrolling **fast**                           | ❌ desktop |

- Smooth scrolling (Lenis) and the custom cursor are **desktop only** and are downloaded only
  on desktop — phones keep their natural scrolling.
- With "reduce motion" switched on (phone/computer accessibility setting) everything simply
  appears, with no movement.
- Content is only hidden for the reveal when JavaScript runs (`html.js`), so nothing is ever
  stuck invisible.
- The hero headline animates with pure CSS, so it paints immediately (measured LCP ≈ 0.9 s
  on a simulated slow phone, layout shift 0).

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

## Build progress

- [x] **Phase 1 — Foundation:** Next.js 16 + TS + Tailwind v4, self-hosted fonts, design tokens,
      no-flash dark/light theme, security headers, ESLint, Prettier, Vitest, bundle-size check
- [x] **Phase 2 — Database + login:** Prisma 7 + Neon, Auth.js Google login (email magic-link ready
      but off), `/login`, protected `/app` + `/settings`, setup doctor, DB integration tests
- [x] **Phase 3 — Backend API:** swappable AI provider, identity config, `/api/chat` (SSE streaming,
      cold-start "waking up" status, Postgres rate limits), sessions, export, profile, status, API tests
- [x] **Phase 4 — `/app` chat:** onboarding, sidebar, streaming markdown + code copy, settings, voice,
      files, export, toasts, virtual scrolling, retry, keyboard shortcuts
- [x] **Phase 5 — Landing + motion:** cinematic hero, skills, how it works, swipeable slides
      (touch + keyboard), live demo (guest, not saved), FAQ, footer; reveals, parallax, Lenis, magnetic
      buttons, glow, custom cursor, velocity blur, page transitions — all reduced-motion aware
- [ ] **Phase 6 — Polish + ship:** settings/legal/404 pages, SEO/OG/sitemap/PWA, a11y + performance, Vercel deploy
