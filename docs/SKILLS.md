# PROXIMA Skills

PROXIMA's `/skills` page is a user-facing marketplace for the app's bundled, trusted instruction packs. It is deliberately not a remote code/plugin loader.

## How the skill contract works

- `src/lib/skills/catalog.ts` is the public catalog: stable Agent Skills-style `name`/`description` metadata, compatibility notes, visible permissions, and category/capability summaries.
- `src/lib/skills/runtime.ts` contains the trusted instruction text. It is server-only and is not returned by the catalog API.
- `src/lib/skills/validation.ts` validates catalog IDs and caps a request at three unique skills.
- `UserSkill` stores only each account's installed/enabled state. Uninstall removes that user's row; disabling preserves the installation.
- `POST /api/chat` resolves selected IDs against the static catalog and the signed-in user's enabled rows before building a bounded system-prompt section. The browser cannot submit skill instructions, code, permissions, or tool implementations.

The skill context is an opt-in text-only prompt capability. PROXIMA currently exposes no executable skill tools, internet browsing, shell, filesystem, calendar, or external-account access. This keeps untrusted skill sources from executing and avoids claiming integrations the app does not have. Web research helps assess sources the person supplies; it does not browse the live web. Image understanding requires an attached image and a configured vision-capable provider.

## Standard and design references

The catalog follows the [Agent Skills specification](https://agentskills.io/specification) where it fits this app: lowercase kebab-case names, descriptions that say what the skill does and when to use it, compatibility notes, and metadata-first discovery with instructions resolved only after selection. Catalog tests enforce the name and field-length constraints. The standard permits bundled scripts and resources, but PROXIMA intentionally does not load them.

The [AI SDK tool-calling model](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling) validates tool inputs against schemas and makes execution/approval policy explicit. PROXIMA keeps its existing provider abstraction instead of adding a second AI runtime; until a reviewed, server-side allowlist and approval flow exist, `allowedTools` stays empty and skills only contribute app-authored text. The marketplace reuses the project's accessible buttons, responsive layout, reduced-motion conventions, and existing icon package rather than adding a paid service or a new UI dependency.

## Storage and deployment

The `20261121100000_user_skills` migration creates the per-user installation table. For a local database, run `npm run db:deploy` (or apply migrations through your normal Prisma workflow) before exercising the marketplace. Vercel deployments use the existing `vercel-build` migration step; no new environment variables or paid services are required.

## Adding a built-in skill

1. Add a stable lowercase kebab-case ID and complete user-facing metadata in `catalog.ts`.
2. Add a server-authored instruction string under the same ID in `runtime.ts`.
3. Keep its permission list within the current chat-only scope and `allowedTools` empty unless a separately reviewed, allowlisted tool implementation is added.
4. Add catalog/selection tests. Never load executable code or instructions from a client request, arbitrary URL, or an unverified external source.
