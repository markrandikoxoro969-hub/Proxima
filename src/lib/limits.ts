/**
 * Input limits shared by the server (enforced in validation.ts) and the
 * browser (friendly messages before sending). No dependencies on purpose:
 * importing this in the browser stays tiny.
 */
export const LIMITS = {
  messageMax: 4000,
  demoMessageMax: 500,
  /**
   * Earlier turns are context, not the thing being sent. A saved assistant
   * reply can be much longer than a new message, so this is deliberately
   * larger — and anything beyond it is trimmed rather than rejected.
   */
  historyMessageMax: 6000,
  attachmentsMax: 3,
  attachmentBytesMax: 100 * 1024, // 100 KB per file
  attachmentNameMax: 200,
  titleMax: 120,
  displayNameMax: 40,
  /**
   * Voice: the browser reads long replies in pieces. The server refuses one
   * piece above `speechChunkMax`; `speechChunkChars` leaves room for the
   * sentence splitter to pack a chunk close to the limit without going over.
   */
  speechChunkMax: 1200,
  speechChunkChars: 900,
  /** Hard cap for one spoken reply (about 15 minutes of speech). */
  speechReplyMax: 12_000,
} as const;
