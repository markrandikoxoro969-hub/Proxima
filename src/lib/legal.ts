/**
 * Dates shown on the legal pages. Change these whenever you edit
 * src/app/privacy/page.tsx or src/app/terms/page.tsx.
 */
export const LEGAL_UPDATED = {
  privacy: "2026-11-20",
  terms: "2026-11-19",
} as const;

export function formatLegalDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
