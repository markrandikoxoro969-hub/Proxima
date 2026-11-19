# PROXIMA — Premium Core AI

A premium, full-stack AI assistant website: cinematic landing page + chat app.
Built with **Next.js 16 (App Router) · TypeScript · Tailwind CSS v4**, with Postgres (Neon) + Prisma,
Google login (Auth.js), Framer Motion, and server-side streaming from the PROXIMA Core API.

> 🚧 **Status: Phase 1 of 6 complete (foundation).** See [Build progress](#build-progress).

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

Phase 1 needs nothing else in it. For the database + Google login keys (Phase 2), follow
**[docs/ACCOUNTS.md](docs/ACCOUNTS.md)** — click-by-click.

## 4. Run it

```bash
npm run dev
```

Open **http://localhost:3000**. Edit any file and the page updates by itself.
Stop the server with **Ctrl + C**.

### Test on your phone (same Wi-Fi)

```bash
npm run dev:phone
```

The terminal prints a **Network** address. Find your computer's IP:
macOS → _System Settings → Wi-Fi → Details → IP address_; Windows → run `ipconfig` → _IPv4 Address_.
On your phone open `http://YOUR-IP:3000` (for example `http://192.168.1.5:3000`).

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
│  └─ ACCOUNTS.md          ← click-by-click: Neon, Google login, Vercel
├─ scripts/
│  └─ check-bundle.mjs     ← bundle-size check
├─ src/
│  ├─ app/                 ← pages (each folder = a URL)
│  │  ├─ fonts/            ← self-hosted Montserrat + JetBrains Mono (OFL licence)
│  │  ├─ fonts.ts          ← font setup (next/font/local)
│  │  ├─ globals.css       ← design system: colours, glass, easing, reduced motion
│  │  ├─ icon.svg          ← favicon
│  │  ├─ layout.tsx        ← wraps every page: fonts, theme, metadata, viewport
│  │  └─ page.tsx          ← home page (Phase 1 placeholder)
│  ├─ components/
│  │  ├─ theme/            ← dark/light theme provider + toggle button
│  │  └─ ui/button.tsx     ← reusable buttons (44px touch targets)
│  ├─ lib/
│  │  ├─ cn.ts             ← merges Tailwind class names
│  │  ├─ site.ts           ← public site info (name, URL, links)
│  │  └─ theme.ts          ← theme logic + no-flash script
│  └─ test/setup.ts        ← test environment setup
├─ .env.example            ← template of all settings (no secrets)
├─ bundle-budget.json      ← max JavaScript size per page
├─ next.config.ts          ← security headers, images, dev origins
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

## Security notes

- Secrets live **only** in `.env.local` (local) and Vercel environment variables (production).
  Only variables starting with `NEXT_PUBLIC_` reach the browser — never put secrets in those.
- Security headers (CSP, nosniff, referrer policy, permissions policy, frame blocking, HSTS on
  Vercel) are set in `next.config.ts`.
- Zoom is allowed (the original file blocked it — an accessibility failure).

## Build progress

- [x] **Phase 1 — Foundation:** Next.js 16 + TS + Tailwind v4, self-hosted fonts, design tokens,
      no-flash dark/light theme, security headers, ESLint, Prettier, Vitest, bundle-size check
- [ ] **Phase 2 — Database + login:** Prisma + Neon, Auth.js Google login, `/login`, protected routes
- [ ] **Phase 3 — Backend API:** AI provider, identity config, `/api/chat` (SSE + rate limits), sessions, export, tests
- [ ] **Phase 4 — `/app` chat:** onboarding, sidebar, streaming markdown, settings, voice, files, export, toasts
- [ ] **Phase 5 — Landing + motion:** hero, skills, how it works, slides, live demo, FAQ, Lenis, cursor
- [ ] **Phase 6 — Polish + ship:** settings/legal/404 pages, SEO/OG/sitemap/PWA, a11y + performance, Vercel deploy
