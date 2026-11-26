---
name: premium-glass-ui
description: Design and engineering system for PROXIMA's layered, theme-aware premium glassmorphism UI. Teaches agents how to build translucent glass surfaces, specular edge highlights, calibrated depth, accessible contrast, and GPU-safe animations across dark, light, colorful, and live-media themes.
---

# Premium Glass UI — PROXIMA Design System

Build calm, tactile, next-generation glass interfaces that feel crafted from real optical materials rather than loud neon overlays. Every glass surface in PROXIMA must harmonize with the active theme (dark smoked glass, light frosted glass, subtle accent-tinted glass, and performance-safe live-media glass).

## Core Material Principles

1. **Optical Restraint Over Heavy Blur**
   - Limit real `backdrop-filter: blur(...)` to focal chrome (navigation rails, floating headers, dialogs, dropdowns, composer) — never stack nested blur layers over each other.
   - Keep blur radius calibrated (`14px` desktop panels, `10px` mobile sheets, `18px` elevated dialogs) and **never animate `backdrop-filter`**.
2. **Specular Top-Edge Reflection (The Signature Detail)**
   - Real glass catches ambient light along its top bevel. Use a crisp `1px` inner highlight (`inset 0 1px 0 var(--glass-highlight)`) paired with a thin translucent perimeter (`1px solid var(--glass-border)`) and a soft vertical specular sheen (`var(--glass-reflection)`).
3. **Theme-Aware Material Adaptation**
   - **Dark themes**: Deep smoked obsidian (`--glass-bg`), subtle white top rim (`rgb(255 255 255 / 0.10)`), grounded ambient shadow.
   - **Light themes**: Soft frosted ceramic glass (`rgb(255 255 255 / 0.76)`), bright crisp top rim (`rgb(255 255 255 / 0.9)`), soft slate drop shadow.
   - **Colorful / accent themes**: Mix a trace (`8–14%`) of `--accent` into `--glass-tint` and focus rings so surfaces belong to the scene without turning into neon soup.
   - **Live video / Animated WebP themes (`html[data-scene="media"]`)**: Disable expensive per-frame `backdrop-filter` shaders over playing video/WebP so scrolling stays locked at 60fps; preserve the glass look via calibrated translucency (`color-mix(in srgb, var(--surface-solid) 82%, transparent)`), specular top bevels, and crisp borders.
4. **Legibility & WCAG AA First**
   - Never sacrifice text contrast for translucency. Body text stays `>= 7:1`; muted labels `>= 4.5:1`.
   - Dense reading surfaces (message bubbles, code blocks, long forms) use elevated higher-opacity glass (`--glass-bg-elevated`) rather than thin crystal layers.

## Shared Tokens (`src/app/globals.css`)

Always consume the central CSS custom properties — never invent one-off `rgba()` glass formulas inside individual components:

- `--glass-bg` — Primary translucent glass fill (nav rails, panels, composer).
- `--glass-bg-elevated` — Higher-opacity optical glass for dialogs, dropdowns, and tooltips.
- `--glass-bg-subtle` — Quiet interactive glass fill for pills, search bars, and secondary buttons.
- `--glass-border` — Thin translucent outer rim.
- `--glass-border-strong` — Focused/hovered rim.
- `--glass-highlight` — Specular inner top-edge reflection (`inset 0 1px 0`).
- `--glass-reflection` — Subtle top-to-bottom optical gradient sheen.
- `--glass-shadow` / `--glass-shadow-elevated` — Ambient depth shadows.
- `--glass-blur` / `--glass-blur-elevated` — Calibrated blur radii.

## Utility Classes & Reusable Primitives (`src/components/ui/glass.tsx`)

Use the shared utilities and React primitives everywhere:

- `.glass-panel` / `<GlassPanel>` — Structural containers (settings cards, studio workspace, rail panels).
- `.glass-card` / `<GlassCard>` — Interactive content cards with gentle hover elevation.
- `.glass-dialog` — Native `<dialog>` surfaces with specular top highlight and deep ambient shadow.
- `.glass-dropdown` / `<GlassMenu>` — Floating menus, popovers, command palettes, and tooltips.
- `.glass-nav` — Persistent desktop sidebar rail and mobile left-side navigation drawer.
- `.glass-input` / `<GlassInput>` — Translucent search bars and form fields with accent focus rim.
- `.glass-pill` / `<GlassPill>` — Quiet frosted status chips, shortcuts, and badges.
- `.glass-button` — Tactile secondary glass buttons with `active:scale-[0.97]`.

## Motion & Performance Guardrails

- Animate only GPU-composited properties: `transform` and `opacity`. Never `transition: all`.
- Use PROXIMA's easing (`--ease-premium: cubic-bezier(0.16, 1, 0.3, 1)`) and spring tokens (`src/lib/motion/tokens.ts`).
- Respect `@media (prefers-reduced-motion: reduce)` and `html[data-fx="static"]`.
- Keep mobile drawer gestures smooth (`x` translate + backdrop fade + `overflow: hidden` scroll lock while open).
- Maintain minimum `44×44px` (`tap`) touch targets on mobile and clear `:focus-visible` rings on keyboard navigation.
