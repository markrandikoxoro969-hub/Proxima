# VOICE — natural spoken replies

Proxima can read answers aloud in a **girl** voice or a **boy** voice. There are two quality levels in
the speaker menu:

| Quality     | What speaks                                 | Needs internet? | Best for                           |
| ----------- | ------------------------------------------- | --------------- | ---------------------------------- |
| **Natural** | a neural voice from our `/api/speech` route | Yes             | everyday listening — the default   |
| **Device**  | the browser's own `speechSynthesis` voices  | No              | offline, instant, or as a fallback |

**Natural is the default.** With no configuration at all it uses Microsoft's free Edge neural
voices — the same family Edge uses for “Read Aloud”. They sound human, not robotic. If a natural
voice cannot be reached, Proxima automatically finishes the reply with the device voice and the
menu says so. Nothing ever silently does nothing.

On a phone, browsers only allow sound after a real gesture. The page quietly unlocks **one reusable
audio player** on your first tap or keypress, so a reply that arrives a minute later still plays
automatically. This is the difference between working on an iPhone and looking broken there.

> Grok's exact voices are not a public API. This uses the same class of technology (neural TTS)
> and gives you a girl/boy choice; it does not clone Grok.

---

## 1. Nothing to set up

Deploy the app as usual. `SPEECH_PROVIDER` defaults to `auto`, which uses:

1. **OpenAI** — if `OPENAI_API_KEY` is set
2. **Pollinations / ElevenLabs** — if `POLLINATIONS_API_KEY` is set
3. **Microsoft Edge neural voices** — free, no key

Any failure (missing key, outage, timeout, rate limit) falls through to the next one. The browser
never talks to a voice vendor: it calls our own `/api/speech`, so keys stay on the server.

### Where do the girl and boy voices come from?

| Engine       | Girl              | Boy                  |
| ------------ | ----------------- | -------------------- |
| Edge (free)  | `en-US-AvaNeural` | `en-US-AndrewNeural` |
| OpenAI       | `marin`           | `cedar`              |
| Pollinations | `nova`            | `onyx`               |

Every id can be changed with an environment variable (below) — useful when a catalogue adds a
better voice.

---

## 2. Optional: best quality with a key

Both keys are shared with the image studio; you do not need new accounts.

### OpenAI (paid, very natural)

```bash
OPENAI_API_KEY="sk-…"
SPEECH_OPENAI_MODEL="gpt-4o-mini-tts"   # optional, this is the default
```

`gpt-4o-mini-tts` also receives delivery instructions (“warm, thoughtful friend; never an
announcer”), which is what makes it sound conversational rather than like a narrator.

### Pollinations / ElevenLabs (free tier + credits)

```bash
POLLINATIONS_API_KEY="sk_…"             # enter.pollinations.ai
SPEECH_POLLINATIONS_MODEL="tts-1"       # optional
```

The speech endpoint is OpenAI-compatible and runs on ElevenLabs voices. A key is **required**;
without one this engine is skipped.

### Force one engine, or switch natural voice off

```bash
SPEECH_PROVIDER="auto"        # default
SPEECH_PROVIDER="openai"
SPEECH_PROVIDER="pollinations"
SPEECH_PROVIDER="edge"
SPEECH_PROVIDER="off"         # device voice only
```

### All voice settings

| Variable                         | Default                       | What it does                                    |
| -------------------------------- | ----------------------------- | ----------------------------------------------- |
| `SPEECH_PROVIDER`                | `auto`                        | `auto`, `openai`, `pollinations`, `edge`, `off` |
| `SPEECH_EDGE_VOICE_GIRL`         | `en-US-AvaNeural`             | Edge female voice id                            |
| `SPEECH_EDGE_VOICE_BOY`          | `en-US-AndrewNeural`          | Edge male voice id                              |
| `SPEECH_OPENAI_VOICE_GIRL`       | `marin`                       | OpenAI female voice                             |
| `SPEECH_OPENAI_VOICE_BOY`        | `cedar`                       | OpenAI male voice                               |
| `SPEECH_POLLINATIONS_VOICE_GIRL` | `nova`                        | Pollinations female voice                       |
| `SPEECH_POLLINATIONS_VOICE_BOY`  | `onyx`                        | Pollinations male voice                         |
| `SPEECH_OPENAI_MODEL`            | `gpt-4o-mini-tts`             | OpenAI speech model                             |
| `SPEECH_POLLINATIONS_MODEL`      | `tts-1`                       | Pollinations speech model                       |
| `SPEECH_POLLINATIONS_URL`        | `https://gen.pollinations.ai` | Base address (proxy override)                   |
| `SPEECH_TIMEOUT_MS`              | `25000`                       | Give up and use the device voice after this     |
| `SPEECH_EDGE`                    | _(unset)_                     | `off` disables the unofficial Edge endpoint     |

Set the same variables on Vercel → Project → Settings → Environment Variables, then redeploy.

---

## 3. How a reply is spoken

1. Markdown is cleaned (`toSpeechText`) — emphasis, links, tables and code fences are not read.
2. Long answers are split at sentence boundaries into pieces of at most 900 characters
   (`splitForSpeech`). The server refuses anything over 1,200 characters per request.
3. The first piece is requested; while it plays, the next one downloads behind it.
4. Each returned MP3 is cached as a blob in the tab (24 pieces), so replaying a reply is instant.
5. Stop (or sending a new message, switching chats, turning voice off) aborts the request, pauses
   the audio and cancels the browser voice. A single piece that takes longer than 10 seconds is
   abandoned, so a slow provider cannot leave the reply silent.
6. Any natural-voice failure continues with the **device** voice from the first unheard piece —
   it does not restart the answer from the beginning.

Only completed replies are ever read. Opening an old chat does not replay its history.

### Server route

`POST /api/speech` → `audio/mpeg`

```json
{ "text": "A short piece of the answer.", "voice": "girl", "speed": 1 }
```

- Same-origin only (other websites get `403`).
- Signed in: 90 pieces/minute. Guest demo: 20/minute. The limit fails open if the database is
  down (voice is free and should not be silenced by a DB outage).
- Text is capped at 1,200 characters and the route stops after 30 seconds.
- Errors are the normal JSON shape; the client treats any non-audio reply as “use the device voice”.

---

## 4. Privacy and cost

- The answer text is sent from the browser to **our** server, then to the selected voice vendor so
  it can be spoken. Proxima does not store the audio or the text on the voice side.
- No keys reach the browser. The route returns audio bytes only.
- **Edge** is free. **OpenAI** is paid per character. **Pollinations** uses your Pollinations
  credits/free tier. The browser voice is free and on-device.
- Audio blobs live only in the tab and disappear when it is closed.
- `SPEECH_PROVIDER=off` makes the app behave exactly as before natural voice: browser only.

---

## 5. Troubleshooting

| What you hear / see                               | What it means / fix                                                                     |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Natural sounds like the old robotic browser voice | The server could not reach an engine. Check the deployment logs for `[speech]`.         |
| Menu says “Natural voice couldn't be reached”     | The route failed (offline, key, provider outage). Switch to Device or try later.        |
| `401` / `402` in logs from Pollinations           | Missing/invalid `POLLINATIONS_API_KEY`, or the free credits are used up.                |
| Edge fails after a Microsoft change               | Set a keyed provider (`SPEECH_PROVIDER=openai` or `pollinations`) or `SPEECH_EDGE=off`. |
| Voice plays but hands-free never opens            | The reply must finish speaking first; a failed voice does not open the mic.             |
| Preview works, automatic read is silent           | Make one tap or keypress on the page first, then try again. If it stays silent, tap the speaker under the reply once. |

Microsoft's Edge endpoint is **unofficial** and can change without notice; that is why it is only
one link in the chain and the browser voice is always available. The `msedge-tts` package used
server-side is MIT-licensed, but the endpoint itself is not a supported Microsoft API. For a
commercial deployment where vendor terms matter, use OpenAI or Pollinations and set
`SPEECH_EDGE="off"`.

---

## 6. Adding another voice service

1. Copy `src/lib/speech/providers/openai.ts` (or `pollinations.ts`).
2. Return a `SpeechProvider` with an `id`, a `label` and `synthesize()`.
3. Register it in `src/lib/speech/index.ts` (the `create` map and `speechProviderOrder`).
4. Add its name to `KNOWN_SPEECH_PROVIDERS` in `src/lib/speech/settings.ts`.
5. Set `SPEECH_PROVIDER=<id>` (or add it to the `auto` order).

The rest of the app — the menu, chunks, cache, stop, hands-free and fallback — needs no changes.
