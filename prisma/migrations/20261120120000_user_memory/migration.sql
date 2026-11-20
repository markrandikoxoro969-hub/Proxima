-- What PROXIMA remembers about a person between chats (short note list).
ALTER TABLE "User" ADD COLUMN "memoryNotes" TEXT;
ALTER TABLE "User" ADD COLUMN "memoryUpdatedAt" TIMESTAMP(3);

-- Optional one-off: keep this query fast when scanning who has memories.
-- (It is a text column; no index is needed for per-user reads by primary key.)
