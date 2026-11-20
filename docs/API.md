# PROXIMA API — what each endpoint does

All endpoints live under `/api`. They return JSON, apart from the chat stream and file downloads.
Every error has the same shape, so the app can show a friendly toast:

```json
{ "error": { "code": "rate_limited", "message": "You're sending messages quickly — please wait a moment." } }
```

| Code                     | HTTP | Meaning                                                          |
| ------------------------ | ---- | ---------------------------------------------------------------- |
| `validation_error`       | 400  | Input broke a rule (message empty or too long, file too big…)    |
| `bad_request`            | 400  | Broken JSON, missing `?confirm=all`, …                           |
| `unauthorized`           | 401  | You need to sign in                                              |
| `sign_in_required`       | 401  | Feature needs login (e.g. attaching files in the demo)           |
| `forbidden`              | 403  | Request came from another website (blocked)                      |
| `not_found`              | 404  | Doesn't exist **or isn't yours** (we don't say which)            |
| `too_large`              | 413  | Request body too big                                             |
| `unsupported_media_type` | 415  | Body must be JSON                                                |
| `rate_limited`           | 429  | Too many requests; see the `Retry-After` header (seconds)        |
| `service_unavailable`    | 503  | Database not reachable right now                                 |
| `internal_error`         | 500  | Bug on our side; the message includes a `ref` to find it in logs |

**Security on every endpoint:**

- POST, PATCH and DELETE requests must come from our own site. Other websites get `403`, and they can never read our responses.
- Inputs are checked with zod (`src/lib/validation.ts`).
- Users can only ever see or change their own data.
- The AI API address and all keys stay on the server.

---

## `POST /api/chat`: send a message, stream the reply

**Body**

```json
{
  "message": "Write a clean Python script", // required, 1–4000 characters
  "conversationId": "cm3…", // optional: continue this chat (signed in)
  "attachments": [{ "name": "app.py", "content": "print('hi')" }], // optional, ≤3 text files, ≤100 KB each
  "demoSessionId": "uuid", // optional: guest demo memory
  "retry": true // optional: "Try again" after a failed reply (see below)
}
```

| Who          | Saved?                                             | Limit         | Extra rules                                         |
| ------------ | -------------------------------------------------- | ------------- | --------------------------------------------------- |
| Signed in    | Yes. Creates the conversation on the first message | 20 per minute | Can attach files                                    |
| Guest (demo) | No                                                 | 5 per minute  | Up to 500 characters, no files, no `conversationId` |

**Reply:** a live stream ([Server-Sent Events](https://developer.mozilla.org/docs/Web/API/Server-sent_events)).
Events arrive in this order:

```
event: meta     data: {"mode":"user","conversationId":"cm3…","title":"Write a clean Python scri…","userMessageId":"cm3…"}
event: status   data: {"state":"thinking"}
event: status   data: {"state":"waking","message":"Waking up the PROXIMA engine…"}   ← only if the engine is slow to start (>4 s)
event: delta    data: {"text":"Here's "}                                               ← many of these
event: delta    data: {"text":"a clean script…"}
event: done     data: {"messageId":"cm3…","latencyMs":2140,"source":"sujan-core"}
```

If the AI fails, you get one `error` event instead of `done`. Your own message stays saved, so you can retry:

```
event: error    data: {"code":"timeout","message":"The PROXIMA engine took too long to answer. Please try again.","retryable":true}
```

**Notes:**

- Identity questions (for example "Who made you?" or "How old are you?") are answered from `src/config/identity.ts` without calling the AI. `done.source` is then `"identity"`.
- File contents go to the AI inside code blocks. Only each file's **name, size and language** are stored.
- If you close the tab mid-reply, whatever text has already arrived is still saved.
- **`retry: true`** is what the **Try again** button sends. If the last saved message in that chat is
  your same question, the server reuses it instead of saving it twice (`meta.userMessageId` is the old
  message). If the text is different, it's saved as a normal new message.

## Sessions (the sidebar)

| Method & path                      | What it does                                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/sessions`                | Your chats, newest first: `{ sessions:[{id,title,messageCount,…}], nextCursor }`. 50 per page; pass `?cursor=<nextCursor>` for more                           |
| `POST /api/sessions`               | New empty chat. Body `{ "title"?: "…" }` → `201 { session }`                                                                                                  |
| `GET /api/sessions/:id`            | One chat with its messages, oldest first: `{ session, messages, hasMore, nextBefore }`. For long chats, `?before=<nextBefore>&limit=100` loads older messages |
| `PATCH /api/sessions/:id`          | Rename. Body `{ "title": "My project" }` (1–120 characters)                                                                                                   |
| `DELETE /api/sessions/:id`         | Delete this chat and its messages → `204`                                                                                                                     |
| `DELETE /api/sessions?confirm=all` | Delete **all your** chats → `{ deleted: 7 }`. This fixes the original file, which wiped the whole localStorage.                                               |

## Export

| Method & path                              | What it does                                   |
| ------------------------------------------ | ---------------------------------------------- |
| `GET /api/sessions/:id/export?format=md`   | Download one chat as Markdown                  |
| `GET /api/sessions/:id/export?format=json` | Download one chat as JSON                      |
| `GET /api/export?format=md\|json`          | Download **all** your chats (max 5 per minute) |

## Profile and settings

| Method & path    | What it does                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/me`    | `{ profile: { displayName, age, theme, particles, onboarded, email, image, … } }`                                                                |
| `PATCH /api/me`  | Any of `{ displayName (1–40), age (1–120), theme: "dark"\|"light"\|"system", particles: true\|false, completeOnboarding: true }`                 |
| `DELETE /api/me` | Body `{ "confirm": "DELETE" }` → deletes the account **and all its chats** forever → `{ deleted: true }`. Used by **Settings → Delete account**. |

## Engine status

`GET /api/status` → `{ "ai": { "status": "online" | "waking" | "offline", "latencyMs": 312 }, "version": "V2.81 CORE" }`

`GET /api/status?setup=1` → `{ setup: { ok, checks: [{ name, ok, detail }] } }`: a sign-in doctor. It checks the login keys, asks Google whether the Client ID + secret match, tests the database, and shows the exact Google redirect URI to register. It never shows a key.

This replaces the fake "ENGINE ONLINE / 42ms" label with a real one. Calling it also **wakes the Render
server**, so `/app` will call it as soon as it opens (Phase 4), and your first message is answered faster.

---

## Switching to a different AI later

1. Copy `src/lib/ai/providers/sujan-core.ts` to `src/lib/ai/providers/my-ai.ts`. Change the request and response to match the new API.
   - If the API returns the whole answer at once, implement `complete()`.
   - If it streams, implement `stream()` (an async generator that yields text pieces).
2. Register it in `src/lib/ai/index.ts`: `"my-ai": createMyAiProvider,`
3. Add it to the `AI_PROVIDER` list in `src/lib/env.ts`, then set `AI_PROVIDER=my-ai` in `.env.local` and on Vercel.

Put any API key in an environment variable (for example `MY_AI_KEY`) and read it **inside the provider file**.
It must not start with `NEXT_PUBLIC_`, so it never reaches the browser.

For development without internet, set `AI_PROVIDER=mock` to use a fake AI that answers instantly with sample Markdown and code.
