-- Themes people can choose from (built-in ids like "midnight", or "custom-…"
-- for themes they create) plus the stored custom themes themselves.
ALTER TABLE "User" ADD COLUMN "themePalette" VARCHAR(40) NOT NULL DEFAULT 'proxima';
ALTER TABLE "User" ADD COLUMN "customThemes" JSONB;

-- Images: uploads attached to a chat, AI creations and AI edits.
CREATE TABLE "ImageAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mime" VARCHAR(64) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "source" VARCHAR(16) NOT NULL DEFAULT 'upload',
    "prompt" VARCHAR(1200),
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImageAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImageAsset_userId_createdAt_idx" ON "ImageAsset"("userId", "createdAt" DESC);

ALTER TABLE "ImageAsset" ADD CONSTRAINT "ImageAsset_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
