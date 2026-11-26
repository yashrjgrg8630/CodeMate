ALTER TABLE "InterviewSession"
ADD COLUMN "domain" TEXT,
ADD COLUMN "difficulty" TEXT,
ADD COLUMN "durationMinutes" INTEGER,
ADD COLUMN "durationSeconds" INTEGER,
ADD COLUMN "transcript" JSONB,
ADD COLUMN "report" JSONB;
