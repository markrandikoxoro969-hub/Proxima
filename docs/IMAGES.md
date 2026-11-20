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
browser shrinks every upload to at most 1280 px / WebP before sending it, and an
account keeps its newest 120 pictures.

## Choose an engine

Set `IMAGE_PROVIDER` on the server (or in `.env.local`):

| Value            | Engine                          | Create | Edit | Key needed       |
| ---------------- | ------------------------------- | :----: | :--: | ---------------- |
| `auto` (default) | best available, with fallbacks  |   ✅   |  ✅  | —                |
| `openai`         | OpenAI Images (`gpt-image-1`)   |   ✅   |  ✅  | `OPENAI_API_KEY` |
| `nvidia`         | NVIDIA NIM / Stability SDXL     |   ✅   |  —   | `NVIDIA_API_KEY` |
| `pollinations`   | Pollinations (free, no account) |   ✅   | ✅*  | —                |
| `mock`           | Offline preview (SVG card)      |   ✅   |  ✅  | —                |

\* The free editor fetches the source picture from the internet, so it needs a
public address: set `NEXT_PUBLIC_SITE_URL=https://your-site` (it doesn't work on
`localhost`). OpenAI editing works anywhere.

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

# Optional
IMAGE_PROVIDER="auto"
IMAGE_TIMEOUT_MS="90000"
```

Keys are read on the server only, never logged, and never sent to the browser.

## Let the chat _see_ pictures

Attached pictures reach the AI as image parts only when the chat model can see
them. With NVIDIA, either switch the model or say so explicitly:

```bash
NVIDIA_MODEL="meta/llama-3.2-90b-vision-instruct"
# or, if the model name doesn't contain "vision":
NVIDIA_VISION="true"
```

The default Nemotron model is text-only; it receives a note that a picture was
attached and asks you to describe it, instead of making something up.

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
