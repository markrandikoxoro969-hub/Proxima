# Database guide (Neon + Prisma)

Plain words: **Neon** is the Postgres database in the cloud. **Prisma** is the tool our code uses to
talk to it, and it also creates/updates the tables for us ("migrations").

## First-time setup (do this once)

You need `DATABASE_URL` and `DIRECT_URL` in `.env.local` first → [ACCOUNTS.md, section A](ACCOUNTS.md#a-neon-the-database--5-minutes).

```bash
# 1. Check your settings + connection
npm run env:check

# 2. Create all the tables in your Neon database
npm run db:deploy

# 3. Check again — step "3) Database tables" should now be ✓
npm run env:check
```

`db:deploy` prints something like `Applying migration 20261119000000_init … All migrations have been
successfully applied.` That's it — your database is ready.

## Look inside your database

```bash
npm run db:studio
```

Opens **Prisma Studio** in your browser (http://localhost:5555). Click **User** to see everyone who
signed in. You can also browse tables in the Neon dashboard → **Tables**.

## The tables

| Table                                     | What's in it                                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `User`                                    | One row per person: Google name/email/photo + PROXIMA profile (display name, age, theme, particles) |
| `Conversation`                            | Chat sessions shown in the sidebar (title, owner)                                                   |
| `Message`                                 | Every message (user or assistant), attachments info, AI response time                               |
| `ImageAsset`                              | Pictures you uploaded or made with AI (bytes, size, prompt, which picture it was edited from)       |
| `RateLimit`                               | Request counters for rate limiting (cleaned automatically)                                          |
| `Account`, `Session`, `VerificationToken` | Used by Auth.js for Google login and the future email login. Don't rename.                          |

Deleting a user automatically deletes their conversations, messages and pictures.
An account keeps its newest 120 pictures; older ones are removed automatically
(see `docs/IMAGES.md`).

Two migrations matter for themes + pictures: `20261120000000_themes_and_images`
adds `User.themePalette` / `User.customThemes` and the `ImageAsset` table. Run
`npm run db:migrate` locally and `npx prisma migrate deploy` in production (the
Vercel build does it for you).

`20261120120000_user_memory` adds `User.memoryNotes` / `User.memoryUpdatedAt`:
the short "- 2026-11-19: going to the gym" list that lets an answer days later
still know what you told PROXIMA before. It is written by
`src/lib/ai/memory-store.ts` (one select per message, one small update when the
message contains a new first-person fact) and can be wiped in
Settings → Memory or with `DELETE /api/memory`.

## Everyday commands

| Command                                     | When to use it                                                                                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run db:deploy`                         | Apply migrations that exist in `prisma/migrations` (first setup, after `git pull`, production)                                                             |
| `npm run db:migrate -- --name what_changed` | **After you edit `prisma/schema.prisma`**: creates a new migration file, applies it, regenerates the client. Commit the new folder in `prisma/migrations`. |
| `npm run db:status`                         | Shows which migrations are applied                                                                                                                         |
| `npm run db:studio`                         | Browse/edit data in your browser                                                                                                                           |
| `npm run db:generate`                       | Regenerate the TypeScript client (runs automatically on `npm install`)                                                                                     |

## Troubleshooting

| Problem                                                    | Fix                                                                                                                                                                                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P1001: Can't reach database server`                       | Neon may be "sleeping" (free tier) — run the command again. Check `DIRECT_URL` has no `-pooler`.                                                                                                                      |
| `P1001 … at "not-set:5432"` (or `database-url-is-not-set`) | The settings are missing, not the database. Vercel: add `DATABASE_URL` + `DIRECT_URL` to **all** environments, then redeploy. Locally: fill `.env.local`. See [DEPLOY.md](./DEPLOY.md#build-failed-p1001-at-not-set). |
| `P1000: Authentication failed`                             | Password changed/wrong — copy both connection strings again from Neon → Connect.                                                                                                                                      |
| `The table "public.User" does not exist`                   | You skipped `npm run db:deploy`.                                                                                                                                                                                      |
| `Cannot find module '@/generated/prisma/client'`           | Run `npm run db:generate` (or `npm install`).                                                                                                                                                                         |
| `prisma migrate dev` warns about "drift"                   | Someone changed the database by hand. On a fresh project you can reset: `npx prisma migrate reset` (**deletes all data**).                                                                                            |

## Optional: a database on your own computer

Neon is the easy path. If you'd rather work offline, any normal Postgres works too — PROXIMA
automatically uses the standard driver when the address is `localhost`. With
[Docker](https://www.docker.com/products/docker-desktop/) installed:

```bash
docker run --name proxima-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:17
```

Then in `.env.local` set **both** lines to:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/postgres"
```

and run `npm run db:deploy` and `npm run env:check`. (Production on Vercel still uses Neon.)

## Production (Vercel)

Vercel uses the same Neon variables (`DATABASE_URL` + `DIRECT_URL`, added in
**Vercel → Settings → Environment Variables**). On every deploy Vercel runs the `vercel-build`
script (`node scripts/migrate-deploy.mjs && next build`). That script first checks that both URLs
are real, explains exactly what to paste if they aren't, and only then runs
`prisma migrate deploy`. New tables and changes are applied before the new version goes live. If a
migration fails, the deploy stops and the old version keeps running. Full guide:
[DEPLOY.md](./DEPLOY.md).
