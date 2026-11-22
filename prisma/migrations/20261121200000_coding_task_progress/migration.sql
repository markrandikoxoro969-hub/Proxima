-- Persist in-progress assistant output so completed files survive timeouts
-- and can be resumed without regenerating prior files.
ALTER TABLE "Message"
    ADD COLUMN "generationProgress" JSONB;
