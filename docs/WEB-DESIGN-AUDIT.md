# PROXIMA web-design-guidelines audit

This is a **source/code audit**, not a claim that the live pages were visually inspected in a browser. The sandbox does not provide Chrome, Lighthouse or a screen reader; follow the production-build matrix in the README and check the items marked “device check”.

## Findings

| Guideline | Result | Evidence / follow-up |
| --- | --- | --- |
| Preserve the established product identity | Pass | Default theme remains the existing Montserrat + JetBrains Mono pairing; alternate theme fonts apply only with their palette. No #14 font swap or new font file is introduced. |
| Responsive layout and phone-safe controls | Code pass; device check needed | Existing responsive Tailwind layouts remain in place; composer actions keep 44px touch targets; `safe-area-inset-*` padding is used on app/settings screens. Check at 360, 390, 768 and 1280px plus a real phone. |
| Keyboard and screen-reader access | Code pass; assistive-tech check needed | Native buttons/inputs, labels, status/error roles, and reduced-motion preference are retained. Decorative backdrops/cursor are hidden from assistive tech; temporary switch uses `aria-pressed`. Test Tab/Shift+Tab, Enter/Space, and a screen reader. |
| Text selection and context menu | Pass by source inspection | Only interface chrome is unselectable; chat text and code remain selectable. No global right-click handler or selection JavaScript was added. Test drag-select and mobile long-press on actual devices. |
| Contrast | Automated token pass; scene-overlays need visual check | Theme tests check body text at ≥7:1 and muted, subtle and new `accentText` at ≥4.5:1 against each palette's base background. Raw accent remains decorative. Verify text over the translucent scene gradient and focus rings in a browser. |
| Motion and reduced motion | Code pass; device check needed | CSS honors `prefers-reduced-motion`; the theme backdrop freezes on low-power devices; hidden tabs pause animations; chat motion is under the existing reduced-motion MotionConfig. Confirm the visual result with OS reduced motion enabled. |
| Performance budget | 6 of 8 pages pass; device trace still needed | A production build measures six pages under budget (`/login` 154.5, `/privacy` 152.4, `/terms` 152.4, `/settings` 182.2, `/settings/memory` 169.6, `/login/verify` 141.2 KB gzip); `/` is 211.5/210 and `/app` 292.1/260. Theme toggle and toasts are now CSS-only, so pages that do not run chat/landing motion skip its JavaScript. Cursor writes are rAF-coalesced; stream callbacks batch into steady ~30ms ticks; messages are memoized/virtualized; Lenis is landing-only. A real Chrome trace, INP <200ms and <50ms tasks still need a device measurement. No fabricated Lighthouse/FPS numbers are reported. |
| Privacy and user control | Pass by code inspection | Memory is off by default; first enable uses a consent dialog; individual edit/delete, export, delete-all, account cascade, Temporary mode, and “Forget this” are wired. Verify each action with an authenticated account and Neon migration applied. |
| Theme and image assets | Pass | Theme scenes use procedural CSS, no media download or external license dependency; all theme animation is still/fallback-capable. Existing public brand assets are unchanged. |
| Build and deployment safety | Automated checks below | The migration is additive and sets existing accounts to memory-off. Rehearse against a Neon branch before production deployment. |

## Final run

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

Then use the five-part viewport test in `README.md` at **360 / 390 / 768 / 1280px and desktop**. To close the measurement gap, save Chrome Performance and Lighthouse reports from a real phone/desktop and add their actual before/after figures here; do not substitute estimates for device measurements.
