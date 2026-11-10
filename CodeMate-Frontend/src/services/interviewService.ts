import type {
  InterviewEvaluation,
  InterviewQuestion,
  InterviewReport,
  InterviewSession,
} from "@/types/domain";
import { apiRequest } from "./client";

export async function startInterview(role = "Software Engineer"): Promise<InterviewSession> {
  return apiRequest<InterviewSession>("/api/interview/start", {
    method: "POST",
    body: JSON.stringify({ role }),
  });
}

export async function evaluateAnswer(input: {
  questionId: string;
  answer: string;
  code: string;
}): Promise<InterviewEvaluation> {
  return apiRequest<InterviewEvaluation>("/api/interview/evaluate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getInterviewReport(
  scores: number[],
  sessionId?: string,
): Promise<InterviewReport> {
  return apiRequest<InterviewReport>("/api/interview/report", {
    method: "POST",
    body: JSON.stringify({ scores, ...(sessionId ? { sessionId } : {}) }),
  });
}
