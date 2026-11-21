-- Skills selected in Settings are applied automatically to new chat replies.
-- Keep selection separate from installation/enabled state so installing a skill
-- does not add its instructions to every chat without an explicit choice.
ALTER TABLE "UserSkill"
    ADD COLUMN "selected" BOOLEAN NOT NULL DEFAULT false;
