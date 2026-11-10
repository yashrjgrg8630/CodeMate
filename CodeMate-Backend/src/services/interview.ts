import { notFound } from "../lib/errors.js";
import type { Db } from "../lib/prisma.js";
import { clampInt, fence, newId } from "../lib/util.js";
import type { InterviewEvaluation, InterviewReport, InterviewSession } from "../schemas/domain.js";
import { recordActivity } from "./activity.js";
import type { AIService } from "./ai/ai-service.js";
import { aiEvaluationSchema, aiInterviewQuestionsSchema, aiReportSchema } from "./ai/schemas.js";

const QUESTION_SYSTEM = `You are a senior engineer running a technical mock interview.
Write 5 interview questions for the given role, ordered from warm-up to hardest, mixing data structures & algorithms with problem-solving/design reasoning appropriate to the role.
Each question must be self-contained, answerable in 10-15 minutes, and have a "followUp" probing a deeper trade-off. Do not include answers or hints. Vary topics (no duplicates).`;

export async function startInterview(
  deps: { db: Db; ai: AIService },
  userId: string,
  input: { role: string },
): Promise<InterviewSession> {
  const ai = await deps.ai.generateJson({
    userId,
    feature: "interview.start",
    system: QUESTION_SYSTEM,
    prompt: `Role: ${fence("role", input.role)}`,
    schema: aiInterviewQuestionsSchema,
    maxOutputTokens: 6144,
    temperature: 0.7,
  });

  const sessionId = newId("int");
  const total = ai.questions.length;
  const questions = ai.questions.map((q, i) => ({
    id: newId("q"),
    index: i + 1,
    total,
    topic: q.topic,
    difficulty: q.difficulty,
    prompt: q.prompt,
    followUp: q.followUp,
  }));

  const session = await deps.db.interviewSession.create({
    data: {
      id: sessionId,
      userId,
      role: input.role,
      questions: {
        create: questions.map((q) => ({
          id: q.id,
          position: q.index,
          topic: q.topic,
          difficulty: q.difficulty,
          prompt: q.prompt,
          followUp: q.followUp,
        })),
      },
    },
  });

  return { id: session.id, role: session.role, startedAt: session.startedAt.toISOString(), questions };
}

const EVAL_SYSTEM = `You are a strict but fair technical interviewer scoring a candidate's answer.
Score 0-100 against what a strong candidate would say for THIS question: correctness, completeness (edge cases), stated time/space complexity, clarity of reasoning, and code quality if code is provided.
Calibration: 90+ is excellent and complete; 70-89 is solid with small gaps; 50-69 is partially correct or shallow; below 50 is largely incorrect or missing the key idea. An empty or irrelevant answer scores under 20.
"feedback" must be specific: say what was right, what was missing or wrong, and the single most valuable improvement. "followUp" is the next probing question, adapted to the answer's weakest point.`;

export async function evaluateAnswer(
  deps: { db: Db; ai: AIService },
  userId: string,
  input: { questionId: string; answer: string; code: string },
): Promise<InterviewEvaluation> {
  const question = await deps.db.interviewQuestion.findFirst({
    where: { id: input.questionId, session: { userId } },
    include: { session: true },
  });
  if (!question) throw notFound("Question not found.");

  const ai = await deps.ai.generateJson({
    userId,
    feature: "interview.evaluate",
    system: EVAL_SYSTEM,
    prompt: [
      `Role: ${question.session.role}`,
      `Topic: ${question.topic} (${question.difficulty})`,
      `Question: ${question.prompt}`,
      fence("answer", input.answer),
      input.code.trim() ? fence("user_code", input.code) : "The candidate submitted no code.",
    ].join("\n\n"),
    schema: aiEvaluationSchema,
    maxOutputTokens: 4096,
  });

  const score = clampInt(ai.score, 0, 100);
  const previous = await deps.db.interviewAnswer.findUnique({ where: { questionId: question.id } });
  await deps.db.interviewAnswer.upsert({
    where: { questionId: question.id },
    create: { questionId: question.id, answer: input.answer, code: input.code, score, feedback: ai.feedback },
    update: { answer: input.answer, code: input.code, score, feedback: ai.feedback },
  });

  const meta = {
    label: `Answered: ${question.topic}`,
    detail: `Score ${score}/100 · ${question.difficulty}`,
    questionId: question.id,
    sessionId: question.sessionId,
  };
  if (previous) {
    // Re-answering replaces the earlier event so activity is not double-counted.
    await deps.db.activityEvent.updateMany({
      where: { userId, kind: "INTERVIEW_ANSWER", meta: { path: ["questionId"], equals: question.id } },
      data: { score, topic: question.topic, meta },
    });
  } else {
    await recordActivity(deps.db, userId, { kind: "INTERVIEW_ANSWER", topic: question.topic, score, meta });
  }

  return { questionId: question.id, score, feedback: ai.feedback, followUp: ai.followUp };
}

const REPORT_SYSTEM = `You write the end-of-interview report for a technical mock interview.
You receive the per-question scores (and, when available, the questions with the candidate's answers and feedback). Produce five dimension scores (0-100) that are consistent with the evidence, plus concrete strengths, weaknesses and recommendations.
Rules: do not invent performance that is not supported by the scores/transcript; if only scores are available, keep statements general to what the scores imply and avoid naming specific topics. Recommendations must be actionable (what to practise, how).`;

export async function interviewReport(
  deps: { db: Db; ai: AIService },
  userId: string,
  input: { scores: number[]; sessionId?: string | undefined },
): Promise<InterviewReport> {
  let transcript = "";
  let role: string | undefined;
  if (input.sessionId) {
    const session = await deps.db.interviewSession.findFirst({
      where: { id: input.sessionId, userId },
      include: { questions: { orderBy: { position: "asc" }, include: { answer: true } } },
    });
    if (!session) throw notFound("Interview session not found.");
    role = session.role;
    transcript = session.questions
      .map((q) =>
        [
          `Q${q.position} [${q.topic}, ${q.difficulty}]: ${q.prompt}`,
          q.answer ? `Score: ${q.answer.score}\nFeedback: ${q.answer.feedback}` : "Not answered.",
        ].join("\n"),
      )
      .join("\n\n");
  }

  const scores = input.scores.map((s) => clampInt(s, 0, 100));
  const overall = clampInt(scores.reduce((a, b) => a + b, 0) / scores.length, 0, 100);

  const ai = await deps.ai.generateJson({
    userId,
    feature: "interview.report",
    system: REPORT_SYSTEM,
    prompt: [
      role ? `Role: ${role}` : "",
      `Per-question scores: ${JSON.stringify(scores)} (mean ${overall})`,
      transcript ? fence("transcript", transcript) : "No transcript available.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    schema: aiReportSchema,
    maxOutputTokens: 4096,
  });

  const report: InterviewReport = {
    scores: {
      technicalKnowledge: clampInt(ai.scores.technicalKnowledge, 0, 100),
      problemSolving: clampInt(ai.scores.problemSolving, 0, 100),
      communication: clampInt(ai.scores.communication, 0, 100),
      codeQuality: clampInt(ai.scores.codeQuality, 0, 100),
      complexityAnalysis: clampInt(ai.scores.complexityAnalysis, 0, 100),
    },
    overall,
    strengths: ai.strengths,
    weaknesses: ai.weaknesses,
    recommendations: ai.recommendations,
  };

  if (input.sessionId) {
    await deps.db.interviewSession.update({
      where: { id: input.sessionId },
      data: { completedAt: new Date(), overall },
    });
  }
  await recordActivity(deps.db, userId, {
    kind: "INTERVIEW_REPORT",
    topic: null,
    score: overall,
    meta: {
      label: "Completed mock interview",
      detail: `${role ? `${role} · ` : ""}overall ${overall}/100`,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    },
  });

  return report;
}
