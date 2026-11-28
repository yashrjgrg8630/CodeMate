import { useId } from "react";
import { cn } from "@/lib/utils";

export interface CodeMateMarkProps {
  /** Pixel size of the mark container (square). Defaults to 32. */
  size?: number;
  /** Visual tone to match dark workspace/auth surfaces or light landing surfaces. */
  tone?: "dark" | "light";
  /** Whether to render the architectural framed badge around the symbol. Defaults to true. */
  framed?: boolean;
  className?: string;
}

/**
 * Custom geometric CodeMate AI brand mark:
 * Precision code chevrons interlocking around a faceted emerald algorithmic core.
 */
export function CodeMateMark({
  size = 32,
  tone = "dark",
  framed = true,
  className,
}: CodeMateMarkProps) {
  const uid = useId().replace(/:/g, "");
  const gradId = `cm-core-${uid}`;
  const isDark = tone === "dark";
  const iconSize = framed ? Math.round(size * 0.58) : size;

  const svg = (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <defs>
        <linearGradient id={gradId} x1="12" y1="6.5" x2="12" y2="17.5" gradientUnits="userSpaceOnUse">
          {isDark ? (
            <>
              <stop offset="0%" stopColor="#6ee7b7" />
              <stop offset="55%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#047857" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="55%" stopColor="#15803d" />
              <stop offset="100%" stopColor="#064e3b" />
            </>
          )}
        </linearGradient>
      </defs>

      {/* Precision architectural code brackets */}
      <path
        d="M8.25 6.75L3.5 12L8.25 17.25"
        stroke={isDark ? "#f3f4f2" : "#16191d"}
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15.75 6.75L20.5 12L15.75 17.25"
        stroke={isDark ? "#f3f4f2" : "#16191d"}
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Faceted algorithmic / neural prism core */}
      <path
        d="M12 6.8L15.3 12L12 17.2L8.7 12L12 6.8Z"
        fill={`url(#${gradId})`}
      />
      <path
        d="M12 6.8L15.3 12H12V6.8Z"
        fill={isDark ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.28)"}
      />
      <circle
        cx="12"
        cy="12"
        r="1.1"
        fill={isDark ? "#ecfdf5" : "#f0fdf4"}
      />
    </svg>
  );

  if (!framed) {
    return (
      <span
        className={cn("inline-flex shrink-0 items-center justify-center", className)}
        style={{ width: size, height: size }}
      >
        {svg}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden transition-colors duration-150",
        isDark
          ? "border border-white/[0.11] bg-[#141917] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          : "border border-emerald-950/15 bg-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_1px_3px_rgba(15,23,42,0.06)]",
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(6, Math.round(size * 0.26)),
      }}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0",
          isDark
            ? "bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.16),transparent_65%)]"
            : "bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.12),transparent_65%)]",
        )}
      />
      {svg}
    </span>
  );
}

export interface CodeMateLogoProps {
  tone?: "dark" | "light";
  size?: number;
  subtitle?: string;
  compact?: boolean;
  className?: string;
}

/**
 * Full CodeMate AI brand lockup with geometric mark, wordmark, and optional workspace subtitle.
 */
export function CodeMateLogo({
  tone = "dark",
  size = 32,
  subtitle,
  compact = false,
  className,
}: CodeMateLogoProps) {
  const isDark = tone === "dark";

  return (
    <span className={cn("inline-flex items-center gap-2.5 min-w-0", className)}>
      <CodeMateMark size={size} tone={tone} />
      {!compact ? (
        <span className="flex flex-col min-w-0 leading-none">
          <span
            className={cn(
              "font-display text-[14.5px] font-semibold tracking-[-0.025em] truncate",
              isDark ? "text-[#f3f4f2]" : "text-[#16191d]",
            )}
          >
            CodeMate
            <span
              className={cn(
                "ml-1 font-medium",
                isDark ? "text-emerald-400/90" : "text-[#1a6b3c]",
              )}
            >
              AI
            </span>
          </span>
          {subtitle ? (
            <span
              className={cn(
                "mt-1 font-sans text-[11px] font-normal tracking-[0.01em] truncate",
                isDark ? "text-[#7a828a]" : "text-[#5a6069]",
              )}
            >
              {subtitle}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
