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
| `auto` (default) | configured providers, with fallbacks | ✅ | ✅ | — |
| `pollinations`   | Pollinations image API             |   ✅   |  ✅  | `POLLINATIONS_API_KEY`              |
| `nvidia`         | NVIDIA FLUX.1 dev + FLUX.1 Kontext |   ✅   |  ✅  | `IMAGE_GENERATION`, `IMAGE_EDITING` |
| `openai`         | OpenAI Images (`gpt-image-1`)      |   ✅   |  ✅  | `OPENAI_API_KEY`                    |
| `mock`           | Offline preview (SVG card)         |   ✅   |  ✅  | —                                   |

NVIDIA uses **two models**, each with its own key so they can live on different
NVIDIA accounts:

| Role   | Default model                          | Key                |
| ------ | -------------------------------------- | ------------------ |
| Create | `black-forest-labs/flux.1-dev`         | `IMAGE_GENERATION` |
| Edit   | `black-forest-labs/flux.1-kontext-dev` | `IMAGE_EDITING`    |

The app sends the source picture inline as a `data:` URL. **NVIDIA’s hosted
Kontext preview currently documents only predefined example images, not arbitrary
uploads** ([API reference](https://build.nvidia.com/black-forest-labs/flux_1-kontext-dev/apireference)).
An editing key alone does not remove that restriction. For your own images,
use OpenAI (`IMAGE_PROVIDER="openai"` and `OPENAI_API_KEY`) or configure a
self-hosted NVIDIA Kontext NIM: set `IMAGE_EDITING_URL` to its full inference
URL (for example, `https://your-nim.example/v1/infer`) and `IMAGE_EDITING` to
a credential accepted by that server. The server must be reachable from the
application. FLUX.1 dev is text-to-image in base mode; the sample code for it
does not edit an image. Leave `IMAGE_EDITING` empty to reuse
`IMAGE_GENERATION` when both models are on one account. Override either model
with `IMAGE_GENERATION_MODEL` / `IMAGE_EDITING_MODEL`.

With `auto`, configured real engines are tried in order: **Pollinations → NVIDIA → OpenAI**.
The offline preview is used only if no real engine is configured (or you explicitly
select `mock`). Errors are shown when configured engines fail, so a bad key is
not silently replaced by a fake picture. NVIDIA’s hosted FLUX.1 dev API documents
only 1024 × 1024 output; other studio sizes produce a square with that engine.

### Adding the keys

```bash
# Add these server-side in .env.local, or in Vercel Environment Variables.
# Pollinations: a server-side secret key (sk_), with model access and credits.
# This is also used by Pollinations speech when enabled.
POLLINATIONS_API_KEY="sk_…"
# POLLINATIONS_IMAGE_MODEL="black-forest-labs/flux.1-schnell"
# POLLINATIONS_EDIT_MODEL="black-forest-labs/flux.2-klein-4b"
# NVIDIA FLUX — use fresh keys; do not commit or share them.
IMAGE_GENERATION="nvapi-…"
IMAGE_EDITING="nvapi-…"
# IMAGE_GENERATION_MODEL="black-forest-labs/flux.1-dev"
# IMAGE_EDITING_MODEL="black-forest-labs/flux.1-kontext-dev"
# IMAGE_EDITING_URL="https://your-nim.example/v1/infer" # optional self-hosted Kontext

# OpenAI (the other create + edit engine)
OPENAI_API_KEY="sk-…"
OPENAI_IMAGE_MODEL="gpt-image-1"

# Optional
IMAGE_PROVIDER="auto"
IMAGE_TIMEOUT_MS="90000"
IMAGE_SIGNING_SECRET=""              # defaults to AUTH_SECRET
```

Keys are read on the server only, never logged, and never sent to the browser.
Leave `IMAGE_PROVIDER` unset or set it to `auto` to prefer Pollinations when its
key is present. Set `IMAGE_PROVIDER="pollinations"` to use it exclusively;
explicit `mock`, `nvidia`, or `openai` selections override automatic selection. Restart locally or redeploy on Vercel after changes.
The status page reports configuration only, not whether NVIDIA accepts the keys.

### How editing gets your picture

Pollinations receives the original PNG/JPEG/WebP bytes as a multipart upload to
`/v1/images/edits`; creation uses `/v1/images/generations`. No image or key is
put in a URL. Edits resize requested output dimensions to the default model's
supported range. The strength slider is not supported by this provider. Models,
key permissions, available credits, and pricing can change; see the
[Pollinations API documentation](https://github.com/pollinations/pollinations/blob/main/APIDOCS.md).
A `pk_` app key does not authenticate server requests; use a secret `sk_` key.

NVIDIA FLUX.1 Kontext and OpenAI receive the picture bytes directly
(Kontext as an inline `data:` URL, OpenAI as an upload), without exposing
`/api/images/:id` to the internet. NVIDIA’s hosted preview has the input
restriction described above; self-hosted Kontext supports real image inputs. A short-lived signed
`/api/images/:id/source` link remains available for future engines that fetch
the source by URL.

## Let the chat _see_ pictures

Attached pictures always reach the AI. The default answering model is text-only,
so Proxima first has `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` read the
picture — OCR, screenshots, UI state, charts and tables — and passes its
description to the main model. The reader runs with private thinking **off** so
the description arrives quickly and its token budget is spent on observations.
No configuration is required.

For follow-up questions, the app sends the pictures from the most recent
image-bearing user turn in the current conversation's recent history window to
the configured AI provider again, even if the new message does not attach a
picture. This lets the reader inspect details not mentioned in its earlier
answer, but adds latency and provider usage. New attachments take precedence;
older image turns outside the window are not recalled. If a picture was deleted
or the reader is unavailable, reattach it or restore the reader as appropriate.

Temporary chat keeps the conversation and image references only in the browser;
existing picture uploads themselves are still stored in the account's image
library and can be deleted from the studio. Guests cannot attach pictures.

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
