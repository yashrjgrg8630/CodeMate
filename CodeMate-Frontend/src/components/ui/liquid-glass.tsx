import { useCallback, useRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface LiquidGlassProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: "nav" | "surface" | "elevated" | "pill";
  /** Enable cursor-tracking specular light reflection */
  interactiveLight?: boolean;
  /** Enable convex edge-lens refraction layer */
  refract?: boolean;
}

/**
 * Apple iOS-inspired Liquid Glass optical lens surface.
 *
 * Layered architecture:
 * 1. Optical lens distortion layer (`url(#liquid-glass-refract)`) on an isolated backdrop plane
 * 2. Clarity & saturation frost layer (`blur(10px) saturate(210%) brightness(1.1)`) so underlying
 *    shapes remain recognizably magnified & bent rather than smeared into flat grey
 * 3. Prismatic curved crescent specular rim + subtle chromatic edge dispersion
 * 4. Cursor-reactive liquid caustic reflection
 */
export function LiquidGlass({
  children,
  className,
  variant = "surface",
  interactiveLight = true,
  refract = false,
  onPointerMove,
  onPointerLeave,
  style,
  ...props
}: LiquidGlassProps) {
  const ref = useRef<HTMLDivElement>(null);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (interactiveLight && ref.current) {
        const rect = ref.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        ref.current.style.setProperty("--lg-mx", `${x.toFixed(1)}%`);
        ref.current.style.setProperty("--lg-my", `${y.toFixed(1)}%`);
        ref.current.style.setProperty("--lg-active", "1");
      }
      onPointerMove?.(e);
    },
    [interactiveLight, onPointerMove],
  );

  const handlePointerLeave = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (interactiveLight && ref.current) {
        ref.current.style.setProperty("--lg-active", "0");
      }
      onPointerLeave?.(e);
    },
    [interactiveLight, onPointerLeave],
  );

  const variantClass =
    variant === "nav"
      ? "liquid-glass-nav"
      : variant === "elevated"
        ? "liquid-glass-elevated"
        : variant === "pill"
          ? "liquid-glass-pill"
          : "liquid-glass";

  const frostBackdrop =
    variant === "nav"
      ? "blur(10px) saturate(220%) contrast(1.06) brightness(1.1)"
      : variant === "elevated"
        ? "blur(16px) saturate(210%) contrast(1.04) brightness(1.07)"
        : variant === "pill"
          ? "blur(10px) saturate(200%) brightness(1.08)"
          : "blur(14px) saturate(200%) brightness(1.06)";

  return (
    <div
      ref={ref}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{
        backdropFilter: frostBackdrop,
        WebkitBackdropFilter: frostBackdrop,
        ...style,
      }}
      className={cn("relative overflow-hidden", variantClass, className)}
      {...props}
    >
      {/* Layer 1: Dedicated optical convex-lens edge refraction plane */}
      {refract ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{
            backdropFilter: "url(#liquid-glass-refract)",
            WebkitBackdropFilter: "url(#liquid-glass-refract)",
          }}
        />
      ) : null}

      {/* Layer 2: Curved specular rim (single clean optical edge catchlight) */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{
          padding: "1px",
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.06) 30%, rgba(255,255,255,0.02) 65%, rgba(52,211,153,0.2) 100%)",
          WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
        }}
      />

      {/* Layer 3: Cursor-reactive liquid caustic reflection */}
      {interactiveLight ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
          style={{
            opacity: "var(--lg-active, 0)",
            background:
              "radial-gradient(240px circle at var(--lg-mx, 50%) var(--lg-my, 20%), rgba(255,255,255,0.24), rgba(52,211,153,0.12) 38%, rgba(56,189,248,0.06) 62%, transparent 78%)",
          }}
        />
      ) : null}

      <div className="relative z-10">{children}</div>
    </div>
  );
}
