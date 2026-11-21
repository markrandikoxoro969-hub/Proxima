-- User-owned installs of trusted, application-bundled Skills.
-- Skill instructions are not stored in the database and are never user-executable.
CREATE TABLE "UserSkill" (
    "userId" TEXT NOT NULL,
    "skillId" VARCHAR(48) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSkill_pkey" PRIMARY KEY ("userId", "skillId")
);

CREATE INDEX "UserSkill_userId_enabled_idx" ON "UserSkill"("userId", "enabled");

ALTER TABLE "UserSkill"
    ADD CONSTRAINT "UserSkill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
