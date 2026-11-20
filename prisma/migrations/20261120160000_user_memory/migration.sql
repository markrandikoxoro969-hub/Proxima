-- Memory (Settings → Memory). OFF by default: nothing is written until the
-- person turns it on, which records memoryConsentAt.
ALTER TABLE "User"
  ADD COLUMN "memoryEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "memoryConsentAt" TIMESTAMP(3);

-- One row per durable fact, in short human-readable sentences.
CREATE TABLE "UserMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" VARCHAR(240) NOT NULL,
    "category" VARCHAR(24) NOT NULL,
    "key" VARCHAR(240) NOT NULL,
    "sourceSessionId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMemory_pkey" PRIMARY KEY ("id")
);

-- Deleting a person deletes their memories (same rule as their chats).
CREATE UNIQUE INDEX "UserMemory_userId_key_key" ON "UserMemory"("userId", "key");
CREATE INDEX "UserMemory_userId_createdAt_idx" ON "UserMemory"("userId", "createdAt");

ALTER TABLE "UserMemory"
  ADD CONSTRAINT "UserMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
