import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { IS_MOCK_BACKEND } from "@/services/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
      <div className="space-y-1">
        <h1 className="font-display text-3xl md:text-4xl">{title}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="metric text-3xl font-semibold">{value}</p>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {icon ? <div className="rounded-md bg-muted p-2 text-primary">{icon}</div> : null}
      </CardContent>
    </Card>
  );
}

export function LoadingState({ label = "Working…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin text-primary" />
      {label}
    </div>
  );
}

export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/50 p-12 text-center">
      <h3 className="font-display text-xl">{title}</h3>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}

export function MockBadge({ className }: { className?: string }) {
  if (!IS_MOCK_BACKEND) return null;
  return (
    <Badge variant="outline" className={cn("border-warning/50 text-warning", className)}>
      Mock data
    </Badge>
  );
}

export function CodeBlock({ code, className }: { code: string; className?: string }) {
  return (
    <pre
      className={cn(
        "max-h-[420px] overflow-auto rounded-lg border border-border bg-muted/40 p-4 text-xs leading-relaxed",
        className,
      )}
    >
      <code>{code}</code>
    </pre>
  );
}

export function ScoreBar({ label, value }: { label: string; value: number }) {
  const tone = value >= 70 ? "bg-success" : value >= 45 ? "bg-warning" : "bg-destructive";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="metric text-muted-foreground">{value}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
