# PROXIMA — design brief (v3: quiet precision)

Written before code, following the `frontend-design` skill: a short token system
plus the principles every screen must obey.

## Subject and job

PROXIMA is a private, premium chat assistant. The job of every screen is to get
out of the way of the answer: a calm surface, one clear action, and motion that
only appears when it explains something (a reply arriving, a panel opening).

Audience: one person, often on a phone, often at night.

## Colour (4 core values + 2 accents)

| Token        | Dark (default)              | Light                       | Role                          |
| ------------ | --------------------------- | --------------------------- | ----------------------------- |
| `--bg`       | `#050505`                   | `#f8fafc`                   | page                          |
| `--fg`       | `#f8fafc`                   | `#0f172a`                   | text, inverse buttons         |
| `--muted`    | `rgb(248 250 252 / 0.68)`   | `#475569`                   | body copy                     |
| `--line`     | `rgb(255 255 255 / 0.07)`   | `rgb(15 23 42 / 0.09)`      | hairlines                     |
| `--glow`     | `rgb(255 255 255 / 0.10)`   | `rgb(15 23 42 / 0.08)`      | single soft light source      |
| `--accent`   | `#a78bfa` (violet, 1 use)   | `#6d28d9`                   | "thinking" orb only           |

No third hue. The violet accent exists only for the thinking orb, so it reads as
"the machine is working", not as decoration.

## Type

- Display + UI: **Montserrat** (variable, self-hosted) — geometric, confident, already loaded.
- Data, timestamps, code: **JetBrains Mono** (variable, self-hosted).
- Scale: 12 / 13 / 15 / 18 / 24 / clamp(2.4rem, 8vw, 5rem). Headlines ≤ 6 words,
  tracking `-0.02em` to `-0.04em`, weight 800–900.
- Body line length ≤ 68 characters; line-height 1.75 in replies.

## Layout

- Chat: sidebar 288 px on ≥1024 px, conversation column max 768 px, composer
  floating inside the column. On phones the sidebar is a bottom sheet (86 % height)
  that drags down to dismiss.
- Landing: full-bleed dark stage, centred hero, content max 1152 px. One
  spotlight per screen; everything else is a hairline.
- Empty state: a violet-to-transparent gradient mesh behind the headline, a
  3 % noise layer, no cards, no example buttons.

## Motion

- Two springs only: `soft` (stiffness 210, damping 26) for UI, `gentle`
  (stiffness 120, damping 20) for large panels.
- One easing: `cubic-bezier(0.16, 1, 0.3, 1)`.
- blur ≤ 12 px on phones, ≤ 8 px on text, never animated on `backdrop-filter`.
- Animate `transform`, `opacity`, `filter` only. `will-change` is added only
  while an animation runs.
- Words of a headline arrive one at a time, blur → sharp. Lists stagger by 60 ms.
- Motion answers an action: open, close, send, stop, scroll. No ambient loops
  except the thinking orb (which is paused when reduced motion is on).

## Voice

Plain verbs, sentence case, no filler, no emoji. Every string does one job.
Errors say what happened and what to do next.
