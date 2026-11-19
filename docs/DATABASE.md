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
| `RateLimit`                               | Request counters for rate limiting (cleaned automatically)                                          |
| `Account`, `Session`, `VerificationToken` | Used by Auth.js for Google login and the future email login. Don't rename.                          |

Deleting a user automatically deletes their conversations and messages.

## Everyday commands

| Command                                     | When to use it                                                                                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run db:deploy`                         | Apply migrations that exist in `prisma/migrations` (first setup, after `git pull`, production)                                                             |
| `npm run db:migrate -- --name what_changed` | **After you edit `prisma/schema.prisma`**: creates a new migration file, applies it, regenerates the client. Commit the new folder in `prisma/migrations`. |
| `npm run db:status`                         | Shows which migrations are applied                                                                                                                         |
| `npm run db:studio`                         | Browse/edit data in your browser                                                                                                                           |
| `npm run db:generate`                       | Regenerate the TypeScript client (runs automatically on `npm install`)                                                                                     |

## Troubleshooting

| Problem                                          | Fix                                                                                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `P1001: Can't reach database server`             | Neon may be "sleeping" (free tier) — run the command again. Check `DIRECT_URL` has no `-pooler`.                           |
| `P1000: Authentication failed`                   | Password changed/wrong — copy both connection strings again from Neon → Connect.                                           |
| `The table "public.User" does not exist`         | You skipped `npm run db:deploy`.                                                                                           |
| `Cannot find module '@/generated/prisma/client'` | Run `npm run db:generate` (or `npm install`).                                                                              |
| `prisma migrate dev` warns about "drift"         | Someone changed the database by hand. On a fresh project you can reset: `npx prisma migrate reset` (**deletes all data**). |

## Production (Vercel)

Covered in Phase 6. Short version: Vercel uses the same Neon database variables, and
`npm run db:deploy` runs before each deploy so new tables are created automatically.
