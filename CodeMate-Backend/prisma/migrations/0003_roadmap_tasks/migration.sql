CREATE TABLE "RoadmapTask" (
  "roadmapId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "topicName" TEXT NOT NULL,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RoadmapTask_pkey" PRIMARY KEY ("roadmapId", "taskId")
);

ALTER TABLE "RoadmapTask"
ADD CONSTRAINT "RoadmapTask_roadmapId_fkey"
FOREIGN KEY ("roadmapId") REFERENCES "Roadmap"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
