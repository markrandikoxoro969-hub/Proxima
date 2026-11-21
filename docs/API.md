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
| `speech_unavailable`     | 503  | Natural voice is off or no engine could speak                    |
| `speech_timeout`         | 504  | The voice service took too long; the client uses the device voice |
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
  "images": [{ "id": "cm3…" }], // optional, ≤4 pictures already uploaded (signed in)
  "temporary": true, // optional: do not save this turn or use memory
  "demoSessionId": "uuid", // optional: guest demo memory
  "retry": true, // optional: "Try again" after a failed reply (see below)
  "mode": "thinking", // optional: "thinking" | "fast" | "coding" | "analyze" (default: thinking)
  "showReasoning": true, // optional, default false: also stream the model's private reasoning
  "history": [{ "role": "user", "content": "…" }] // optional, guest demo only (max 20)
}
```

| Who          | Saved?                                             | Limit         | Extra rules                                         |
| ------------ | -------------------------------------------------- | ------------- | --------------------------------------------------- |
| Signed in    | Yes. Creates the conversation on the first message | 20 per minute | Can attach files                                    |
| Guest (demo) | No                                                 | 5 per minute  | Up to 500 characters, no files, no `conversationId` |

**Reply:** a live stream ([Server-Sent Events](https://developer.mozilla.org/docs/Web/API/Server-sent_events)).
Events arrive in this order:

```
event: meta       data: {"mode":"user","answerMode":"coding","conversationId":"cm3…","title":"Write a clean Python scri…","userMessageId":"cm3…"}
event: status     data: {"state":"thinking"}
event: status     data: {"state":"waking","message":"Waking up the engine…"}   ← only if the engine is slow to start (>4 s)
event: reasoning  data: {"text":"The user wants a script…"}                     ← ONLY if showReasoning:true
event: token      data: {"text":"Here is"}                                       ← many of these
event: token      data: {"text":" a clean script…"}
event: done       data: {"messageId":"cm3…","latencyMs":2140,"source":"nvidia+render","mode":"coding","text":"Here is a clean script…"}
```

If the AI fails, you get one `error` event instead of `done`. Your own message stays saved, so you can retry:

```
event: error      data: {"code":"timeout","message":"The engine took too long to answer. Please try again.","retryable":true}
```

**Notes:**

- Identity questions (for example "Who made you?" or "How old are you?") are answered from `src/config/identity.ts` without calling the AI. `done.source` is then `"identity"`.
- File contents go to the AI inside code blocks. Only each file's **name, size and language** are stored.
- If you close the tab mid-reply, whatever text has already arrived is still saved.
- **Answer modes** (`mode`): `thinking` (default), `fast`, `coding`, `analyze`. The server appends
  that mode's rules to the system prompt and tunes the model (private thinking on/off, temperature,
  top_p, token budget, history length) — see `src/lib/ai/modes.ts`. Unknown values are rejected with
  `validation_error`; old clients that omit `mode` get `thinking`. The mode the server actually used
  comes back as `meta.answerMode` and `done.mode`.
- **Reasoning** (`reasoning_content` from the model) is never stored and is not sent at all unless the
  request asks for it. `done.text` is the final, cleaned answer — the client swaps it in if trailing
  filler ("I hope this helps") was removed after streaming.
- **Context**: signed-in requests send the system prompt, the last 20 stored messages and the new
  message. The browser cannot rewrite that history. Guests may send up to 20 of their own recent turns
  (nothing is stored on the server). Earlier turns are trimmed to 6,000 characters each rather than
  rejected, so one long reply can't make the next message fail.
- **Pictures** are uploaded first (`POST /api/images`) and sent by id. A text-only chat model gets a
  description from the Omni vision reader (OCR, screenshots, charts), so the main model can answer
  questions about what the picture shows.
- **Fallback**: when `AI_PROVIDER=nvidia`, a failure _before any text_ is retried automatically on the
  Render API. You only see an `error` event if both fail.
- **Long code**: if the model reaches its token limit, the server asks it to continue from the exact
  character where it stopped (up to twice) instead of leaving an unclosed code block.
- **`retry: true`** is what the **Try again** button sends. If the last saved message in that chat is
  your same question, the server reuses it instead of saving it twice (`meta.userMessageId` is the old
  message). If the text is different, it's saved as a normal new message.

## `POST /api/speech`: speak one piece of a reply

**Body**

```json
{
  "text": "A short piece of the answer.", // required, 1–1200 characters, no Markdown needed
  "voice": "girl", // "girl" | "boy"
  "speed": 1 // optional, 0.5–2 (default 1)
}
```

**Reply:** raw `audio/mpeg` bytes, **not JSON**. The browser splits long answers at sentence
boundaries (900 characters) and caches each returned blob, so replay is instant.

| Who          | Limit             | Notes                                              |
| ------------ | ----------------- | -------------------------------------------------- |
| Signed in    | 90 pieces/minute  | Fails open if the database is down                 |
| Guest (demo) | 20 pieces/minute  | The landing demo uses the same route              |

- The same-origin rule applies: another website gets `403`.
- `SPEECH_PROVIDER` chooses the engine: `auto` (OpenAI → Pollinations → free Edge), `openai`,
  `pollinations`, `edge`, or `off`. Keys stay server-side — see [VOICE.md](VOICE.md).
- Any failure returns the normal JSON error. The client treats it as a signal to use the browser's
  built-in voice, so the speaker button still works offline.
- No text or audio is stored in the database.

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

1. Copy `src/lib/ai/providers/nvidia.ts` to `src/lib/ai/providers/my-ai.ts`. Change the request and response to match the new API.
   - If the API returns the whole answer at once, implement `complete()`.
   - If it streams, implement `stream()` — an async generator that yields `{ type: "text" | "reasoning", text }`.
2. Register it in `src/lib/ai/index.ts` (`create`) and in `KNOWN_AI_PROVIDERS` in `src/lib/ai/settings.ts`.
3. Set `AI_PROVIDER=my-ai` in `.env.local` and on Vercel.

See `docs/AI-PROVIDERS.md` for the NVIDIA + Render setup and the curl test.

Put any API key in an environment variable (for example `MY_AI_KEY`) and read it **inside the provider file**.
It must not start with `NEXT_PUBLIC_`, so it never reaches the browser.

For development without internet, set `AI_PROVIDER=mock` to use a fake AI that answers instantly with sample Markdown and code.

---

## Pictures: upload, create, edit

Pictures are stored in the database (`ImageAsset`) and served by id, so a chat
message only carries a reference — never megabytes of base64. Everything below
is **signed in only** and rate limited to **6 AI pictures per minute**.

| Method & path                            | What it does                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| `GET /api/images`                        | Your newest pictures (max 24): `{ images: [{ id, url, width, height, … }] }` |
| `POST /api/images`                       | Upload one: `{ "dataUrl": "data:image/png;base64,…", "name": "photo.png" }`  |
| `GET /api/images/:id`                    | The bytes. Owner only; other people get `404`. Long-lived private cache.     |
| `DELETE /api/images/:id`                 | Delete one of yours → `204`                                                  |
| `GET /api/images/:id/source?exp=…&sig=…` | Temporary signed link (10 min) so an AI engine can fetch the picture.        |
| `POST /api/images/generate`              | `{ "prompt": "…", "width"?, "height"?, "style"? }` → a new picture           |
| `POST /api/images/:id/edit`              | `{ "prompt": "make it snowy", "strength"?: 0.55 }` → an edited copy          |

Uploads accept **PNG, JPEG and WebP** only (SVG can run scripts, so it's refused),
are re-checked by their first bytes, and must decode to **4 MB or less**. The
browser shrinks a photo to 1280 px / JPEG before uploading, so real requests are
usually 100–400 KB.

`generate` and `:id/edit` answer:

```json
{
  "image": {
    "id": "cm…",
    "url": "/api/images/cm…",
    "width": 1024,
    "height": 1024,
    "source": "generated",
    "prompt": "a red boat. photorealistic, …"
  },
  "engine": {
    "id": "nvidia",
    "label": "NVIDIA flux.1-dev",
    "note": null
  },
  "offline": false
}
```

`engine.note` is `null` when there is nothing worth saying; the studio prints it
under the picture. `GET /api/images` returns the same `engine` object, so the
note can be shown before the first picture is made.

`offline: true` means the built-in preview drew a placeholder (no key configured):
the studio says so instead of pretending it's real art. See
[docs/IMAGES.md](IMAGES.md) for the engines and their keys.

### Pictures in a chat message

`POST /api/chat` accepts up to 4 picture ids:

```json
{
  "message": "What is in this picture?",
  "images": [{ "id": "cm…" }]
}
```

The server looks the ids up (only your own), hands the bytes to the AI, and
saves `{ kind: "image", imageId, url, width, height }` in the message's
attachments. Guests get `sign_in_required` — attaching files or pictures needs
an account. Vision models see the picture; text-only models (the default
Nemotron) get a short note saying a picture was attached, so they ask you to
describe it instead of inventing what it shows.

### Theme settings

`PATCH /api/me` also accepts the theme fields:

```json
{
  "theme": "dark",
  "themePalette": "midnight",
  "customThemes": [
    {
      "id": "custom-1a2b3c4d5e",
      "name": "Mine",
      "mode": "dark",
      "colors": { "bg": "#101418", "fg": "#e8f0ff", "accent": "#22d3ee" }
    }
  ]
}
```

`themePalette` is a built-in id (`proxima`, `daylight`, `midnight`, `ocean`,
`ember`, `paper`, `aurora`, `sakura`, `graphite`, `neon`) or one of your own.
Only the three source colours are trusted: the server rebuilds every other
colour (muted text, hairlines, glass) and refuses themes whose text would be
unreadable. Up to 4 custom themes per account.
