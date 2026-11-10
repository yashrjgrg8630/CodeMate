-- CreateEnum
CREATE TYPE "HistoryStatus" AS ENUM ('analyzed', 'optimized', 'converted', 'benchmarked');

-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('ANALYSIS', 'OPTIMIZATION', 'CONVERSION', 'BENCHMARK', 'CAREER', 'INTERVIEW_ANSWER', 'INTERVIEW_REPORT', 'ROADMAP_PROGRESS', 'VERIFICATION');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "oauthProvider" TEXT,
    "oauthSubject" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Optimization" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "original" JSONB NOT NULL,
    "recommendedId" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Optimization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptimizationCandidate" (
    "id" TEXT NOT NULL,
    "optimizationId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "approach" TEXT NOT NULL,
    "timeComplexity" TEXT NOT NULL,
    "spaceComplexity" TEXT NOT NULL,
    "readability" INTEGER NOT NULL,
    "confidence" INTEGER NOT NULL,
    "improvement" INTEGER NOT NULL,
    "rationale" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "verifiedPassed" INTEGER,
    "verifiedTotal" INTEGER,
    "verifiedAt" TIMESTAMP(3),
    CONSTRAINT "OptimizationCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceLanguage" TEXT NOT NULL,
    "targetLanguage" TEXT NOT NULL,
    "optimize" BOOLEAN NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Conversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Benchmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optimizationId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Benchmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoryItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "HistoryStatus" NOT NULL,
    "title" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HistoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobAnalysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "jobDescription" TEXT NOT NULL,
    "resumeText" TEXT,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "overall" INTEGER,
    CONSTRAINT "InterviewSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewQuestion" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "topic" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "followUp" TEXT NOT NULL,
    CONSTRAINT "InterviewQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewAnswer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "feedback" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InterviewAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Roadmap" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetRole" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "weeks" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Roadmap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadmapProblem" (
    "roadmapId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "topicName" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "inRevision" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RoadmapProblem_pkey" PRIMARY KEY ("roadmapId", "problemId")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ActivityKind" NOT NULL,
    "topic" TEXT,
    "score" INTEGER,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCallLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_oauthProvider_oauthSubject_key" ON "User"("oauthProvider", "oauthSubject");
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");
CREATE INDEX "Analysis_userId_createdAt_idx" ON "Analysis"("userId", "createdAt");
CREATE INDEX "Optimization_userId_createdAt_idx" ON "Optimization"("userId", "createdAt");
CREATE INDEX "OptimizationCandidate_optimizationId_idx" ON "OptimizationCandidate"("optimizationId");
CREATE INDEX "Conversion_userId_createdAt_idx" ON "Conversion"("userId", "createdAt");
CREATE INDEX "Benchmark_userId_createdAt_idx" ON "Benchmark"("userId", "createdAt");
CREATE INDEX "HistoryItem_userId_createdAt_idx" ON "HistoryItem"("userId", "createdAt");
CREATE INDEX "JobAnalysis_userId_inputHash_idx" ON "JobAnalysis"("userId", "inputHash");
CREATE INDEX "JobAnalysis_userId_createdAt_idx" ON "JobAnalysis"("userId", "createdAt");
CREATE INDEX "InterviewSession_userId_startedAt_idx" ON "InterviewSession"("userId", "startedAt");
CREATE INDEX "InterviewQuestion_sessionId_idx" ON "InterviewQuestion"("sessionId");
CREATE UNIQUE INDEX "InterviewAnswer_questionId_key" ON "InterviewAnswer"("questionId");
CREATE INDEX "Roadmap_userId_createdAt_idx" ON "Roadmap"("userId", "createdAt");
CREATE INDEX "ActivityEvent_userId_createdAt_idx" ON "ActivityEvent"("userId", "createdAt");
CREATE INDEX "ActivityEvent_userId_kind_idx" ON "ActivityEvent"("userId", "kind");
CREATE INDEX "AiCallLog_userId_createdAt_idx" ON "AiCallLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Optimization" ADD CONSTRAINT "Optimization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OptimizationCandidate" ADD CONSTRAINT "OptimizationCandidate_optimizationId_fkey" FOREIGN KEY ("optimizationId") REFERENCES "Optimization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversion" ADD CONSTRAINT "Conversion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Benchmark" ADD CONSTRAINT "Benchmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Benchmark" ADD CONSTRAINT "Benchmark_optimizationId_fkey" FOREIGN KEY ("optimizationId") REFERENCES "Optimization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HistoryItem" ADD CONSTRAINT "HistoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobAnalysis" ADD CONSTRAINT "JobAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewQuestion" ADD CONSTRAINT "InterviewQuestion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewAnswer" ADD CONSTRAINT "InterviewAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "InterviewQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Roadmap" ADD CONSTRAINT "Roadmap_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoadmapProblem" ADD CONSTRAINT "RoadmapProblem_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "Roadmap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiCallLog" ADD CONSTRAINT "AiCallLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
