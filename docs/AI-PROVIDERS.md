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
| `NVIDIA_MODEL`           | `nvidia/nemotron-3-ultra-550b-a55b`        | Which model answers                                         |
| `NVIDIA_VISION_MODEL`    | `meta/llama-3.2-90b-vision-instruct`       | Reads attached pictures for a text-only main model. `off` disables |
| `NVIDIA_MAX_TOKENS`      | `8192`                                     | Ceiling for one answer, including reasoning                 |
| `NVIDIA_ENABLE_THINKING` | `true`                                     | Let the model reason privately (`chat_template_kwargs`)     |
| `NVIDIA_TIMEOUT_MS`      | `45000`                                    | Switch to Render if NVIDIA hasn't answered by then          |
| `AI_API_URL`             | `https://sujancoreapi.onrender.com/chat`   | Render fallback address                                     |
| `AI_TIMEOUT_MS`          | `110000`                                   | Total budget (route limit: 120 s)                           |

Request shape (`src/lib/ai/providers/nvidia.ts`): `stream: true`; `temperature`,
`top_p` and `max_tokens` come from the selected answer mode (Thinking, Fast,
Coding, Analyze — see `src/lib/ai/modes.ts`), capped by `NVIDIA_MAX_TOKENS`.

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
