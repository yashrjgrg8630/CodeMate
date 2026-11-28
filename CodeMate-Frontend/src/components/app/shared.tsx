import { useState, type ReactNode } from "react";
import { Check, Copy, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CodeMateMark } from "@/components/brand/CodeMateLogo";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  eyebrow?: string | undefined;
}) {
  return (
    <div className="flex flex-col gap-3 pb-5 border-b border-white/[0.06] md:flex-row md:items-end md:justify-between">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-white sm:text-[28px]">
          {title}
        </h1>
        <p className="max-w-2xl text-sm text-zinc-400 leading-relaxed">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group relative rounded-xl border border-white/[0.075] bg-[#0e1117]/90 p-5 transition-colors duration-200 hover:border-white/[0.14]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          <p className="font-code text-[11px] font-medium uppercase tracking-wider text-zinc-400">
            {label}
          </p>
          <p className="metric text-3xl font-semibold text-white">{value}</p>
          {hint ? <p className="text-xs text-zinc-400 truncate">{hint}</p> : null}
        </div>
        {icon ? (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-zinc-400 transition-colors group-hover:text-emerald-400">
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function LoadingState({ label = "Working…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-white/[0.08] bg-[#121619]/95 px-5 py-4 text-sm text-[#f3f4f2] shadow-[0_12px_32px_rgba(0,0,0,0.36)]">
      <div className="relative flex items-center justify-center">
        <CodeMateMark size={30} tone="dark" />
        <span
          aria-hidden="true"
          className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full border border-[#121619] bg-[#162820]"
        >
          <Loader2 className="size-2.5 animate-spin text-emerald-400" />
        </span>
      </div>
      <div className="space-y-0.5">
        <p className="font-medium text-sm text-[#f3f4f2]">{label}</p>
        <p className="font-code text-[11px] text-[#7a828a]">
          Running in the background — feel free to switch pages.
        </p>
      </div>
    </div>
  );
}

export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-20 w-full rounded-2xl border border-white/[0.06] bg-white/[0.03]"
        />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.02] backdrop-blur-xl px-6 py-14 text-center">
      {icon ? (
        <div className="flex size-11 items-center justify-center rounded-xl border border-white/[0.12] bg-white/[0.05] text-emerald-400 shadow-inner">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
        <p className="max-w-md text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

export function RequestError({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      title="Could not load this page"
      description="The backend request failed. Check the connection and try again."
      action={
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="size-3.5" />
          Try again
        </Button>
      }
    />
  );
}

export function BackendBadge(_props: { className?: string }) {
  return null;
}

export function CodeBlock({
  code,
  className,
  label,
}: {
  code: string;
  className?: string | undefined;
  label?: string | undefined;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-white/[0.1] bg-[#07090d]/90 text-[#e6edf3] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-white/[0.07] bg-white/[0.025] px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
          </div>
          {label ? <span className="font-code text-[11px] text-zinc-400">{label}</span> : null}
        </div>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-code text-[11px] text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-white"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check className="size-3 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="size-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="min-w-0 max-h-[420px] overflow-auto whitespace-pre-wrap break-words p-4 font-code text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function ScoreBar({ label, value }: { label: string; value: number }) {
  const clamped = Math.min(100, Math.max(0, value));
  const tone =
    clamped >= 70
      ? "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.45)]"
      : clamped >= 45
        ? "bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.35)]"
        : "bg-rose-400 shadow-[0_0_12px_rgba(251,113,133,0.35)]";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-zinc-300">{label}</span>
        <span className="metric font-semibold text-foreground">{clamped}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className={cn("h-full rounded-full transition-all duration-500 ease-out", tone)}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
