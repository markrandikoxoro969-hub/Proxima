# Pictures in PROXIMA

Three things live here:

1. **Upload** — attach a picture to a chat and ask about it.
2. **Create** — type a prompt and get a new picture.
3. **Edit** — upload or pick a picture and describe the change.

Open the studio from the ✦ button in the message box (or ⌘K → “Create or edit a
picture”). Results are private to your account, can be downloaded, edited again,
or attached to a message with **Use in chat**.

## Where the files go

There is nothing extra to configure: picture bytes are stored in Postgres in the
`ImageAsset` table and served by `/api/images/:id` (owner only). That keeps the
feature working on the free plan, with no S3/Cloudinary account to set up. The
browser shrinks every upload to at most 1280 px / JPEG before sending it, and an
account keeps its newest 120 pictures.

## Choose an engine

Set `IMAGE_PROVIDER` on the server (or in `.env.local`):

| Value            | Engine                             | Create | Edit | Key needed                          |
| ---------------- | ---------------------------------- | :----: | :--: | ----------------------------------- |
| `auto` (default) | best available, with fallbacks     |   ✅   |  ✅  | —                                   |
| `nvidia`         | NVIDIA FLUX.1 dev + FLUX.1 Kontext |   ✅   |  ✅  | `IMAGE_GENERATION`, `IMAGE_EDITING` |
| `openai`         | OpenAI Images (`gpt-image-1`)      |   ✅   |  ✅  | `OPENAI_API_KEY`                    |
| `mock`           | Offline preview (SVG card)         |   ✅   |  ✅  | —                                   |

NVIDIA uses **two models**, each with its own key so they can live on different
NVIDIA accounts:

| Role   | Default model                          | Key                |
| ------ | -------------------------------------- | ------------------ |
| Create | `black-forest-labs/flux.1-dev`         | `IMAGE_GENERATION` |
| Edit   | `black-forest-labs/flux.1-kontext-dev` | `IMAGE_EDITING`    |

The edit model takes the source picture inline as a `data:` URL, so nothing has
to be publicly reachable. Leave `IMAGE_EDITING` empty to reuse
`IMAGE_GENERATION` when both models are on one account. Override either model
with `IMAGE_GENERATION_MODEL` / `IMAGE_EDITING_MODEL`.

With `auto` the order is: **NVIDIA → OpenAI → offline preview**. If a key is
wrong or a service is down, the next engine gets a turn, and the studio labels
offline results honestly ("Offline preview — add a key for real art"). Nothing
shows a dead button.

### Adding the keys

```bash
# NVIDIA FLUX — create and edit can be separate accounts
IMAGE_GENERATION="nvapi-…"
IMAGE_EDITING="nvapi-…"
# IMAGE_GENERATION_MODEL="black-forest-labs/flux.1-dev"
# IMAGE_EDITING_MODEL="black-forest-labs/flux.1-kontext-dev"

# OpenAI (the other create + edit engine)
OPENAI_API_KEY="sk-…"
OPENAI_IMAGE_MODEL="gpt-image-1"

# Optional
IMAGE_PROVIDER="auto"
IMAGE_TIMEOUT_MS="90000"
IMAGE_SIGNING_SECRET=""              # defaults to AUTH_SECRET
```

Keys are read on the server only, never logged, and never sent to the browser.

### How editing gets your picture

NVIDIA FLUX.1 Kontext and OpenAI both receive the picture bytes directly
(Kontext as an inline `data:` URL, OpenAI as an upload), so editing works
without exposing `/api/images/:id` to the internet. A short-lived signed
`/api/images/:id/source` link remains available for future engines that fetch
the source by URL.

## Let the chat _see_ pictures

Attached pictures always reach the AI. The default answering model is text-only,
so Proxima first has `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` read the
picture — OCR, screenshots, UI state, charts and tables — and passes its
description to the main model. The reader runs with private thinking **off** so
the description arrives quickly and its token budget is spent on observations.
No configuration is required.

To change or disable the reader:

```bash
# Older Llama vision reader (no reasoning model; can be slower on OCR):
NVIDIA_VISION_MODEL="meta/llama-3.2-90b-vision-instruct"
# Smaller/faster Llama reader (less accurate on small text):
NVIDIA_VISION_MODEL="meta/llama-3.2-11b-vision-instruct"
# Turn the reader off; the AI will honestly ask you to describe the picture:
NVIDIA_VISION_MODEL="off"
```

You can also put a vision model in `NVIDIA_MODEL` and the picture is sent to it
directly. Omni, "vision", "vl", "llava" and similar names are recognised
automatically; add `NVIDIA_VISION="true"` for a model whose name does not say so.

## Limits

| Thing                         | Limit                      |
| ----------------------------- | -------------------------- |
| Pictures per message          | 4                          |
| File you can pick             | 12 MB (shrunk to ≤1280 px) |
| Stored per picture            | 4 MB                       |
| Prompt for creating / editing | 1000 characters            |
| AI pictures per minute        | 6                          |
| Pictures kept per account     | 120 (oldest removed first) |
| Accepted upload types         | PNG, JPEG, WebP            |

## Adding another engine

1. Copy `src/lib/image/providers/nvidia.ts` to `providers/my-engine.ts`.
2. Return `{ bytes, mime, width, height }` from `generate` (and `edit` if the
   service supports it). Throw `ImageProviderError` with a `code` on failure.
3. Register it in `src/lib/image/index.ts` and in `KNOWN_IMAGE_PROVIDERS`
   (`src/lib/image/settings.ts`).
4. Set `IMAGE_PROVIDER=my-engine`.

## Privacy

- A picture is visible only to the account that uploaded or created it.
- `GET /api/images/:id` is owner-only and cacheable privately for a year (the
  bytes for an id never change).
- SVG previews are served with a locked-down `Content-Security-Policy` and
  `sandbox`, so even opened in their own tab they can't run anything.
- Deleting a chat does not delete its pictures; delete them in the studio, or
  delete the account (that removes everything).
