# PROXIMA — Product Overhaul & Premium Glass UI Progress

> Persistent architecture audit, implementation checklist, and verification log.
> Updated after every completed batch so work resumes cleanly from the last verified checkpoint.

## 1. Verified Technology Stack (Inspected from Source)
- **Framework:** Next.js `16.4.6` (App Router + Turbopack + `src/proxy.ts`), React `19.3.0`, TypeScript `5`
- **Styling & Motion:** Tailwind CSS `4.3.3`, Motion `14.14.0`, Phosphor Icons `2.1.10`, Lenis `1.3.27`
- **Database:** Prisma `7.10.1` + Neon PostgreSQL (`@prisma/adapter-neon` / `@prisma/adapter-pg`), 6 safe additive migrations
- **Auth:** Auth.js v5 (`next-auth@5.0.0-beta.32`) with JWT sessions & server-side `requireUser()` / `requireApiUserId()`
- **AI & Voice:** NVIDIA / OpenRouter / Render provider chain (`src/lib/ai/providers/`), SSE streaming (`/api/chat`), resumable multi-file coding checkpoints (`src/lib/ai/coding-task.ts`), Edge TTS / OpenAI speech (`/api/speech`)
- **Testing:** Vitest `5.1.1`, Testing Library, PGlite DB integration tests, bundle budget checker (`scripts/check-bundle.mjs`)

---

## 2. Complete Codebase Audit Findings

### Critical
- *None blocking production.* Security & ownership audit confirmed:
  - `/api/sessions/[id]`, `/api/memory/[id]`, `/api/images/[id]`, `/api/export`, `/api/skills` all enforce `requireApiUserId()`, strict `userId` scoping (`404` on foreign IDs), `assertSameOrigin()`, Zod validation, and DB-backed rate limits.
  - `prisma/schema.prisma` has `onDelete: Cascade` on all foreign keys and composite indexes for every primary read path (`[userId, updatedAt(sort: Desc)]`, `[conversationId, createdAt]`, `[userId, createdAt]`, `[userId, enabled]`).
  - `public/sw.js` safely caches only `/offline.html` for navigation fallbacks (never caches `/api/*` or Next.js chunks).

### High
1. **Mobile 3-Line Menu UX (`src/components/chat/sidebar.tsx`)** — Previously opened as a bottom-anchored sheet (`bottom-0 rounded-t-3xl`) mixing settings & history, without search or date grouping. **Fix:** Replace with a left-side sliding navigation drawer (`inset-y-0 left-0`, swipe-left dismiss, body scroll lock) + searchable chat history grouped by date (`Today`, `Yesterday`, `Previous 7 Days`, `Previous 30 Days`, `Older`).
2. **Fragmented Glass Surfaces (`src/app/globals.css`, `src/components/ui/*`)** — `.glass` and `.glass-solid` existed without unified layered glass tokens (specular top highlights, optical reflections, elevated dialogs/dropdowns/inputs/pills, or accent-tinted adaptation). **Fix:** Establish cohesive CSS custom properties (`--glass-*`), utilities (`.glass-panel`, `.glass-card`, `.glass-dialog`, `.glass-dropdown`, `.glass-nav`, `.glass-input`, `.glass-pill`, `.glass-button`), reusable `<Glass*>` primitives (`src/components/ui/glass.tsx`), and `.agents/skills/premium-glass-ui/SKILL.md`.
3. **Autonomous Multi-Step Agent Foundation (`src/lib/ai/agent/`)** — Resumable multi-file coding existed (`coding-task.ts` + `Message.generationProgress`), but lacked a generalized **Plan → Act → Observe → Evaluate → Continue → Verify** agent architecture with Zod-validated tool registry, approval policies, and native/fallback tool calling. **Fix:** Implement typed agent architecture, safe tool registry, checkpoint state machine, and unit tests.

### Medium
4. **Unified In-App Settings & Dedicated Studio Route** — *(Completed in PR #53)*: Tabbed `SettingsDialog` (General / Memory / Skills), collapsible desktop sidebar (`⌘B`), header `Search ⌘K` button, dedicated `/studio` route, route error/loading boundaries for `/skills`, `/settings/memory`, `/studio`, and removed duplicate `agent/` folder.
5. **Media Theme Performance & Device Matching** — *(Completed in PRs #51 & #52)*: Decoupled video-only `.mp4` + standalone `.m4a` Web Audio low-pass graph (preserving 460 Hz Settings muffling), zero-lag mobile Animated WebP loops, uncropped Crimson Velvet, and portrait-for-mobile / landscape-for-PC theme partitioning.
6. **Consistent Glass Polish Across All Views** — Apply the new glass tokens across dialogs, header, menus, composer, message cards, settings views, skills marketplace, studio, and onboarding without exceeding `bundle-budget.json` or regressing live-media 60fps performance.

### Low
7. **Bundle Headroom Monitoring** — Keep `/app` comfortably under `260 KB` gzip and all routes within `bundle-budget.json` by dynamically loading secondary dialogs and using lean inline SVGs in shared chrome.

---

## 3. Phase Execution Tracker

- **Phase 1 — Full Codebase Audit & Persistent Tracker:** ✅ Complete (`docs/PROXIMA_UPGRADE_PROGRESS.md`)
- **Phase 2 — Critical Bugs, Security & Route Boundaries:** ✅ Complete (verified API ownership/CSRF/indexes/SW; added missing error/loading boundaries & `/studio` route in PR #53)
- **Phase 3 — Premium Glass UI Skill + Design Tokens & Primitives:** ✅ Complete (`.agents/skills/premium-glass-ui/SKILL.md`, theme-aware `--glass-*` tokens & `.glass-*` utilities in `src/app/globals.css`, `src/components/ui/glass.tsx`, `dialog.tsx`, `button.tsx`, `toast.tsx`)
- **Phase 4 — Navigation, Left-Side Mobile Drawer, Searchable Date-Grouped History:** ✅ Complete (`src/lib/chat/client/group-sessions.ts` + tests, `src/components/chat/sidebar.tsx` left-side swipe-dismiss drawer + body scroll lock + search + date groups, `src/components/chat/chat-header.tsx`, `src/components/chat/command-palette.tsx`)
- **Phase 5 — Cohesive Glass Polish Across Chat, Composer, Menus, Settings, Studio, Skills:** ✅ Complete (`composer.tsx`, `mode-menu.tsx`, `voice-menu.tsx`, `composer-vibes.tsx`, `empty-state.tsx`, `theme-menu.tsx`, `settings-view.tsx`, `memory-view.tsx`, `skill-preferences.tsx`, `skills-marketplace.tsx`, `studio-page-view.tsx`, `app/error.tsx`)
- **Phase 6 — Theme-Aware Glass & Preserved Spatial Ambient Audio:** ✅ Verified & Preserved (light/dark/accent-tinted glass tokens, GPU-safe `html[data-scene="media"]` overrides, preserved 460 Hz low-pass spatial muffling in Settings, drawers, voice/vibe/theme menus)
- **Phase 7 — Skills Marketplace & Studio Polish:** ✅ Complete (`skills-marketplace.tsx`, `skill-preferences.tsx`, `studio-page-view.tsx` upgraded to unified `.glass-panel` / `.glass-card` / `.glass-pill` / `.glass-input`)
- **Phase 8 — Database & Backend Reliability Audit:** ✅ Verified (schema indexes, cascades, ownership checks, rate limits, abort cleanup)
- **Phase 9 — Universal Autonomous AI Agent Architecture:** ✅ Complete (`src/lib/ai/agent/{types,tools,planner,index}.ts` + `agent.test.ts` covering Plan → Act → Observe → Evaluate → Continue → Verify, Zod-validated sandboxed tool registry, destructive approval gating, JSON fallback parser, bounded retries)
- **Phase 10 — Long-Running Persistent Task Recovery Integration:** ✅ Complete (`src/lib/ai/agent/runner.ts` + `runner.test.ts`, `/api/chat` durable `AgentCheckpoint` persistence in `Message.generationProgress`, `agent-continue` & `agent-approval` SSE events, automatic client checkpoint continuation in `stream-chat.ts` & `use-chat.ts`, `409 stale_checkpoint` guard, PGlite end-to-end API tests in `src/test/api/agent-chat-api.test.ts`)
- **Phase 11 — Full Verification, Live Preview & QA:** ✅ Complete (`npm run check` passing 100% — 65/65 files, 567/567 tests, 28/28 routes, all 10 bundle budgets; live preview verified)

---

## 4. Verification Log

| Batch | Scope | Checks Run | Result |
|---|---|---|---|
| PR #51–#53 | Decoupled audio, mobile WebP, device-matched themes, collapsible rail, `⌘K`, tabbed Settings, `/studio`, route boundaries | `npm run check` | ✅ 61 files / 553 tests, 28 routes, all budgets pass |
| Batch 1 & 2 (`826d698`) | `premium-glass-ui` skill, unified theme-aware glass tokens/utilities/primitives, cohesive glass polish across all views/menus/dialogs/toasts/errors, left-side mobile drawer + swipe + scroll lock + searchable date-grouped history, `src/lib/ai/agent/` autonomous agent foundation | `npm run check` (`eslint`, `next typegen && tsc --noEmit`, `vitest run`, `next build`, `check:bundle`) | ✅ 0 lint/TS errors, **63/63 files (559/559 tests)**, 28/28 routes, all 10 budgets pass (`/app` 257.1/260 KB) |
| Batch 3 — Phase 10 (Current) | Server-side agent runner (`src/lib/ai/agent/runner.ts`), durable `/api/chat` `AgentCheckpoint` persistence + timeout recovery + `409 stale_checkpoint` protection, SSE `agent-continue` / `agent-approval`, client auto-continuation in `stream-chat.ts` & `use-chat.ts`, real PGlite integration tests | `npm run check` (`eslint`, `next typegen && tsc --noEmit`, `vitest run`, `next build`, `check:bundle`) + live HTTP smoke checks | ✅ 0 lint/TS errors, **65/65 files (567/567 tests)**, 28/28 routes, all 10 budgets pass (`/app` 257.4/260 KB) |
