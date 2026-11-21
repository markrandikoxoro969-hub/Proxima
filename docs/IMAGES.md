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

| Value            | Engine                         | Create | Edit | Key needed       |
| ---------------- | ------------------------------ | :----: | :--: | ---------------- |
| `auto` (default) | best available, with fallbacks |   ✅   |  ✅  | —                |
| `openai`         | OpenAI Images (`gpt-image-1`)  |   ✅   |  ✅  | `OPENAI_API_KEY` |
| `nvidia`         | NVIDIA NIM / Stability SDXL    |   ✅   |  —   | `NVIDIA_API_KEY` |
| `pollinations`   | Pollinations                   |   ✅   |  ✅  | free key (below) |
| `mock`           | Offline preview (SVG card)     |   ✅   |  ✅  | —                |

Pollinations needs no account at all, so the studio works on the first deploy.
Two things only become true once you add a **free key** (no card,
[enter.pollinations.ai](https://enter.pollinations.ai) → API key):

|                     | No key (anonymous)               | With `POLLINATIONS_API_KEY`      |
| ------------------- | -------------------------------- | -------------------------------- |
| Watermark           | a small logo is always added     | gone (`nologo=true` is honoured) |
| Editing (`kontext`) | throttled, often refused         | reliable                         |
| Speed               | about 1 picture every 15 seconds | normal limits                    |

The studio always says which engine answered, and repeats the watermark note
under the picture, so nobody is surprised by a branded image.

### How editing reaches your picture

Image-to-image services fetch the source picture themselves, but
`/api/images/:id` is owner-only — an engine can't log in. So before calling the
engine the server signs a **temporary link**:

```
https://your-site/api/images/<id>/source?exp=<time>&sig=<hmac>
```

- signed with `AUTH_SECRET` (or `IMAGE_SIGNING_SECRET`), so it can't be pointed
  at a different picture;
- expires after **10 minutes**, then answers 404;
- reveals nothing about the owner, and is marked `noindex, nofollow`.

The address comes from `NEXT_PUBLIC_SITE_URL`, or from the request itself
(`x-forwarded-host`) when that is unset, so a preview deployment works too. A
`localhost` address can't be reached from the internet — editing then says so
plainly instead of hanging.

With `auto` the order is: **OpenAI → NVIDIA → Pollinations → offline preview**.
If a key is wrong or a service is down, the next engine gets a turn, and the
studio labels offline results honestly ("Offline preview — add a key for real
art"). Nothing shows a dead button.

### Adding the keys

```bash
# OpenAI (create + edit, best quality)
OPENAI_API_KEY="sk-…"
OPENAI_IMAGE_MODEL="gpt-image-1"

# NVIDIA (create only). Any image model id from build.nvidia.com works.
NVIDIA_API_KEY="nvapi-…"
NVIDIA_IMAGE_MODEL="stabilityai/stable-diffusion-xl"

# Pollinations: watermark-free + reliable editing (free, no card)
POLLINATIONS_API_KEY="sk_…"
POLLINATIONS_IMAGE_MODEL="flux"      # default
POLLINATIONS_EDIT_MODEL="kontext"    # default

# Optional
IMAGE_PROVIDER="auto"
IMAGE_TIMEOUT_MS="90000"
IMAGE_SIGNING_SECRET=""              # defaults to AUTH_SECRET
```

Keys are read on the server only, never logged, and never sent to the browser.

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

1. Copy `src/lib/image/providers/pollinations.ts` to `providers/my-engine.ts`.
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
