/**
 * Input limits shared by the server (enforced in validation.ts) and the
 * browser (friendly messages before sending). No dependencies on purpose:
 * importing this in the browser stays tiny.
 */
export const LIMITS = {
  messageMax: 4000,
  demoMessageMax: 500,
  attachmentsMax: 3,
  attachmentBytesMax: 100 * 1024, // 100 KB per file
  attachmentNameMax: 200,
  titleMax: 120,
  displayNameMax: 40,
} as const;
