import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  ArrowRight,
  BriefcaseBusiness,
  Braces,
  Gauge,
  MessagesSquare,
  Sparkles,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CodeMate AI — Code intelligence & interview preparation" },
      {
        name: "description",
        content:
          "Analyze, optimize, convert and benchmark your code, then close your interview skill gaps with a guided DSA roadmap and mock interviews.",
      },
      { property: "og:title", content: "CodeMate AI" },
      {
        property: "og:description",
        content:
          "One workspace for code analysis, optimization, conversion, benchmarking and interview preparation.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: Terminal,
    title: "Code Analyzer",
    body: "Detect bugs, complexity and the underlying algorithm pattern in seconds.",
  },
  {
    icon: Sparkles,
    title: "Optimizer",
    body: "Compare optimization candidates side by side with rationale and confidence.",
  },
  {
    icon: ArrowLeftRight,
    title: "Converter",
    body: "Translate solutions across Python, Java, C, C++, JavaScript and TypeScript.",
  },
  {
    icon: Gauge,
    title: "Benchmark",
    body: "See original vs optimized runtime, memory and verification results.",
  },
  {
    icon: BriefcaseBusiness,
    title: "Job Analyzer",
    body: "Turn a job description into a precise skill-gap report.",
  },
  {
    icon: MessagesSquare,
    title: "Mock Interview",
    body: "Practise scored technical questions and get a readiness report.",
  },
];

function Landing() {
  return (
    <div className="grid-backdrop min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Braces className="size-4" />
          </span>
          <span className="font-display text-xl">CodeMate AI</span>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link to="/register">Create account</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto w-full max-w-6xl px-4 pb-16 pt-12 text-center md:pt-20">
        <h1 className="font-display text-4xl leading-tight md:text-6xl">
          Write better code. Walk into interviews ready.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground md:text-lg">
          CodeMate AI brings code analysis, optimization, language conversion and benchmarking
          together with a personalised DSA roadmap and mock interviews.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/register">
              Get started
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/analyzer">Try the analyzer</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-24">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title}>
              <CardHeader className="pb-2">
                <span className="mb-2 flex size-9 items-center justify-center rounded-md bg-muted text-primary">
                  <f.icon className="size-4" />
                </span>
                <CardTitle className="text-base">{f.title}</CardTitle>
                <CardDescription>{f.body}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
