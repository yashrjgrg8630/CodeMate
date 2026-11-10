import type { InterviewEvaluation, InterviewReport, InterviewSession } from "@/types/domain";
import { api } from "./client";

let currentSessionId: string | undefined;

export async function startInterview(role = "Software Engineer"): Promise<InterviewSession> {
  const session = await api<InterviewSession>("/api/interview/start", { body: { role } });
  currentSessionId = session.id;
  return session;
}

export async function evaluateAnswer(input: {
  questionId: string;
  answer: string;
  code: string;
}): Promise<InterviewEvaluation> {
  return api<InterviewEvaluation>("/api/interview/evaluate", { body: input });
}

/** Passing the active session lets the server ground the report in the stored answers and feedback. */
export async function getInterviewReport(scores: number[]): Promise<InterviewReport> {
  return api<InterviewReport>("/api/interview/report", {
    body: { scores, sessionId: currentSessionId },
  });
}
