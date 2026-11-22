# AI providers: NVIDIA + Render fallback

PROXIMA can answer with **NVIDIA NIM** (default) and quietly falls back to the
old **Render** API if NVIDIA fails. Everything happens on the server: the
browser never sees a key, a URL or a model name.

```
browser ──POST /api/chat──▶ Next.js route ──▶ NVIDIA (primary)
                                   └──────▶ Render (fallback, only if NVIDIA fails
                                             before it has written anything)
```

## 1. Add your key (2 minutes)

1. Copy the template:

   ```bash
   cp .env.example .env.local          # Windows: Copy-Item .env.example .env.local
   ```

2. Get a key at <https://build.nvidia.com> (top right → **Get API Key**).
3. Open `.env.local` and paste it after `NVIDIA_API_KEY=`.
   Leave the quotes off. Never commit `.env.local` — it is already in `.gitignore`.
4. Restart the dev server (`npm run dev`).

`.env.example` is committed on purpose and contains **no** keys.

## 2. Test it before touching the app

```bash
npm run ai:check
```

This sends one tiny streamed request through the same code path and prints:

```
Model:  nvidia/nemotron-3-ultra-550b-a55b
Base:   https://integrate.api.nvidia.com/v1
Sending one streamed test message…

First token: 780 ms
Reasoning:   412 characters (hidden in the app)

Answer:
A GPU is a processor built to run thousands of simple calculations in parallel.

Total: 2210 ms · PASS
```

**Curl equivalent** (needs `NVIDIA_API_KEY` exported in your shell):

```bash
export NVIDIA_API_KEY="nvapi-…"   # never paste a key into a file you commit

curl -sS https://integrate.api.nvidia.com/v1/chat/completions \
  -H "Authorization: Bearer $NVIDIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nvidia/nemotron-3-ultra-550b-a55b",
    "messages": [{"role":"user","content":"Write a limerick about GPU computing."}],
    "temperature": 1,
    "top_p": 0.95,
    "max_tokens": 256,
    "chat_template_kwargs": {"enable_thinking": true},
    "stream": false
  }'
```

A `401` means the key is wrong; a `404` means the model name is wrong.

## 3. Settings

| Variable                 | Default                                    | What it does                                                |
| ------------------------ | ------------------------------------------ | ----------------------------------------------------------- |
| `AI_PROVIDER`            | `nvidia`                                   | `nvidia`, `render` or `mock`                                |
| `NVIDIA_API_KEY`         | —                                          | Your key. Server only.                                      |
| `OPENROUTER_API_KEY`     | —                                          | Enables OpenRouter for Coding mode. Server only.            |
| `NVIDIA_VISION_API_KEY`  | —                                          | Optional: the picture reader's key on a second account.     |
| `NVIDIA_MODEL`           | `nvidia/nemotron-3-ultra-550b-a55b`        | Which model answers                                         |
| `NVIDIA_VISION_MODEL`    | `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` | Reads attached pictures (OCR, screenshots, charts) for a text-only main model. `off` disables |
| `NVIDIA_MAX_TOKENS`      | `16384`                                    | Ceiling for one answer, including reasoning                 |
| `NVIDIA_ENABLE_THINKING` | `true`                                     | Let the model reason privately (`chat_template_kwargs`)     |
| `NVIDIA_TIMEOUT_MS`      | `45000`                                    | Switch to Render if NVIDIA produces no first token in time; a live answer may run on |
| `AI_API_URL`             | `https://sujancoreapi.onrender.com/chat`   | Render fallback address                                     |
| `AI_TIMEOUT_MS`          | `110000`                                   | Total budget for non-coding replies                          |
| `AI_CODING_TIMEOUT_MS`   | `290000`                                   | Per-request Coding deadline in ms (capped at 295000)         |
| `AI_CODING_IDLE_TIMEOUT_MS` | `180000`                                | No-output coding timeout in ms (capped at 275000)            |
| `OPENROUTER_TIMEOUT_MS`  | `150000`                                   | OpenRouter first-token deadline in ms (capped at 275000)     |

Request shape (`src/lib/ai/providers/nvidia.ts`): `stream: true`; `temperature`,
`top_p` and `max_tokens` come from the selected answer mode (Thinking, Fast,
Coding, Analyze — see `src/lib/ai/modes.ts`), capped by `NVIDIA_MAX_TOKENS`.
Without OpenRouter, NVIDIA Coding is capped at 16,384 tokens per call. If the
model reports `finish_reason: "length"`, the provider can request continuations
(up to eight, subject to the overall deadline).

### OpenRouter for Coding

Add `OPENROUTER_API_KEY` to `.env.local` or the deployment's server-side
environment variables and restart or redeploy. No other provider setting is
required. Coding mode, including multi-file planning and file generation, uses
`nvidia/nemotron-3-ultra-550b-a55b:free` through OpenRouter with
`max_tokens: 65536` and reasoning disabled. The existing OpenAI-compatible SDK
streams the response; no OpenRouter SDK installation is needed. NVIDIA's
`NVIDIA_MAX_TOKENS` does not cap OpenRouter. Other modes continue to use the
configured normal provider. Explicit `AI_PROVIDER=mock` keeps all modes offline.

If the OpenRouter key is absent, or OpenRouter fails before sending answer text,
the normal provider is used instead. Once answer text has streamed, the app
will not mix in another provider's answer; interrupted work can be resumed.
OpenRouter's free endpoint can rate-limit requests or be unavailable, and the
fallback may have a smaller token limit. `GET /api/status?setup=1` reports
whether the key is configured, not whether it or the quota works. OpenRouter
receives the prompt and conversation context; attached pictures still use the
separate NVIDIA vision reader if configured, otherwise the model is told it
cannot see them.

65,536 is the requested **per-call ceiling**, not a guaranteed response length.
The default Coding deadline is 290 seconds per request and this route requests a
300-second hosting limit; your hosting plan can impose a shorter limit. Signed-in
saved projects checkpoint each file, and the browser automatically starts a new
request with a fresh deadline for the next file. It also retries a timed-out file
up to twice from the last saved checkpoint. A single file can still exceed the
request limit; its unverified draft is not resumed across requests. OpenRouter
can change model availability and limits, and multiple requests consume quota.

Coding mode first produces a planned folder tree, then outputs each file with
its relative path and a separate code block. The tree is a plan, not a claim
that every file has already been written. Signed-in non-temporary chats save
completed files and can resume after an interruption. Temporary and guest chats
are not saved, so retrying starts again. A malformed file gets up to two
format-repair attempts; unfinished attempts are not marked complete. Up to
400,000 characters of completed output are included as context for later files;
older content is marked as omitted. Plans are limited to 12 files. Generated
code should still be reviewed and run before use. While a file
is being generated, a live draft may be shown separately; it is unverified and
is not saved until the whole file passes the completion check. A silent coding
stream is stopped after 180 seconds without model output or internal continuation
activity by default; OpenRouter's SSE keep-alive comments alone do not reset this
limit. A saved chat can then retry from its last completed file. The overall request and hosting
deadlines still apply, even if the model is actively generating.

### The two-model setup (default)

Proxima uses two NVIDIA models, automatically:

| Role | Default model | Setting |
| --- | --- | --- |
| Normal answers (text, analysis, code without OpenRouter) | `nvidia/nemotron-3-ultra-550b-a55b` | `NVIDIA_MODEL` |
| Reading attached pictures (OCR, screenshots, charts) | `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` | `NVIDIA_VISION_MODEL` |

A text-only message never calls the vision model. A message with a picture
calls the Omni reader first (thinking off, 2048-token observation), then the
normal model answers with that observation. `/api/status?setup=1` now shows a
**Picture reader** line with both model ids, so you can confirm the deployment
without sending a picture.

The two models can sit on different NVIDIA accounts. Set
`NVIDIA_VISION_API_KEY` to the reader's key; `NVIDIA_API_KEY` keeps answering
text. Leave it empty (or unset) and both roles share `NVIDIA_API_KEY`, so a
single-account setup needs no change. The setup check reports
`separate vision key` when the second key is in use; keys themselves are never
returned, logged, or cached.

## 4. Reasoning is private

Nemotron streams two things:

| Stream field            | Where it goes                                                      |
| ----------------------- | ------------------------------------------------------------------ |
| `delta.reasoning_content` | Nowhere by default. Sent as an SSE `reasoning` event only when the browser asks (Settings → **Show reasoning**). Never stored in the database. |
| `delta.content`         | The answer: streamed to the screen, cleaned of filler, saved once complete. |

If the model fails after reasoning but before writing text, the fallback still
answers — reasoning is not counted as an answer.

## 5. Check the live app

1. `npm run dev`
2. Open <http://localhost:3000/app> and send a message.
3. The dot in the sidebar footer shows the engine status (`/api/status`).
4. `http://localhost:3000/api/status?setup=1` runs one real test message and
   reports which engine answered — without showing any key.

If NVIDIA is down you will see the reply arrive slightly later (from Render) and
a single line in the server log:

```
[ai] nvidia failed (unavailable); switching to render
```
