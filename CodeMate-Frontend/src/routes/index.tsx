import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Braces,
  BriefcaseBusiness,
  Gauge,
  Menu,
  MessagesSquare,
  Route as RouteIcon,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import { CodeMateMark } from "@/components/brand/CodeMateLogo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CodeMate — Think in Algorithms" },
      {
        name: "description",
        content:
          "Write better code, understand your solutions, and prepare for the interviews that matter with CodeMate.",
      },
      { property: "og:title", content: "CodeMate — Think in Algorithms" },
      {
        property: "og:description",
        content: "Code intelligence and interview preparation, connected in one workspace.",
      },
    ],
  }),
  component: LandingPage,
});

/* ── Navigation ── */

const NAV_LINKS = [
  { to: "#features-strip", label: "Features", isAnchor: true },
  { to: "/optimizer", label: "Solutions", isAnchor: false },
  { to: "/roadmap", label: "Roadmap", isAnchor: false },
  { to: "/benchmark", label: "Pricing", isAnchor: false },
  { to: "/history", label: "Blog", isAnchor: false },
] as const;

const FEATURE_STRIP_ITEMS = [
  { to: "/analyzer", label: "Code Analyzer", icon: Terminal },
  { to: "/optimizer", label: "Solution Optimizer", icon: Sparkles },
  { to: "/converter", label: "Language Converter", icon: Braces },
  { to: "/roadmap", label: "DSA Roadmap", icon: RouteIcon },
  { to: "/interview", label: "Mock Interview", icon: MessagesSquare },
  { to: "/progress", label: "Progress & DNA", icon: Activity },
] as const;

/* ── Existing section data (preserved) ── */

const FEATURE_LINKS = [
  { to: "/analyzer", label: "Code Analyzer" },
  { to: "/optimizer", label: "Solution Optimizer" },
  { to: "/converter", label: "Language Converter" },
  { to: "/benchmark", label: "Benchmark" },
  { to: "/career", label: "Job Analyzer" },
  { to: "/roadmap", label: "DSA Roadmap" },
  { to: "/interview", label: "Mock Interview" },
  { to: "/progress", label: "Progress & DNA" },
] as const;

const CODE_TOOLS = [
  {
    to: "/analyzer",
    label: "Code Analyzer",
    description: "Trace patterns, complexity, and line-level issues in your code.",
    icon: Terminal,
  },
  {
    to: "/optimizer",
    label: "Solution Optimizer",
    description: "Compare alternative approaches and verify candidate solutions.",
    icon: Sparkles,
  },
  {
    to: "/converter",
    label: "Language Converter",
    description: "Translate code between supported languages with useful context.",
    icon: Braces,
  },
  {
    to: "/benchmark",
    label: "Benchmark",
    description: "Run code comparisons and inspect the resulting performance data.",
    icon: Gauge,
  },
] as const;

const CAREER_TOOLS = [
  {
    to: "/career",
    label: "Job Analyzer",
    description: "Compare a role with your resume and identify relevant skill gaps.",
    icon: BriefcaseBusiness,
  },
  {
    to: "/roadmap",
    label: "DSA Roadmap",
    description: "Build and track a structured preparation plan.",
    icon: RouteIcon,
  },
  {
    to: "/interview",
    label: "Mock Interview",
    description: "Practise technical interviews in a live, adaptive voice call.",
    icon: MessagesSquare,
  },
  {
    to: "/progress",
    label: "Progress & DNA",
    description: "Review your activity, topic mastery, and algorithm patterns.",
    icon: Activity,
  },
] as const;

type WorkbenchTab = "analyzer" | "optimizer" | "converter" | "benchmark";

const WORKBENCH_DEMOS: Record<
  WorkbenchTab,
  { label: string; path: string; summary: string; code?: string; to: string }
> = {
  analyzer: {
    label: "Analyzer",
    path: "examples / window_sum.py",
    summary:
      "Understand the work hidden inside a loop. The Analyzer can identify repeated slice sums and explain their complexity.",
    code: `def max_window_sum(values, width):
    best = float("-inf")
    for start in range(len(values) - width + 1):
        best = max(best, sum(values[start:start + width]))
    return best`,
    to: "/analyzer",
  },
  optimizer: {
    label: "Optimizer",
    path: "examples / sliding_window.py",
    summary:
      "A running total avoids recalculating the overlapping part of each window. Explore alternatives in the Optimizer.",
    code: `window = sum(values[:width])
best = window
for right in range(width, len(values)):
    window += values[right] - values[right - width]
    best = max(best, window)
return best`,
    to: "/optimizer",
  },
  converter: {
    label: "Converter",
    path: "examples / window_sum.cpp",
    summary:
      "Carry the same algorithm across languages, then review the translation in the Converter.",
    code: `int windowSum(const vector<int>& values, int width) {
    int current = accumulate(values.begin(),
        values.begin() + width, 0);
    int best = current;
    for (int right = width; right < values.size(); ++right) {
        current += values[right] - values[right - width];
        best = max(best, current);
    }
    return best;
}`,
    to: "/converter",
  },
  benchmark: {
    label: "Benchmark",
    path: "your code / measured results",
    summary:
      "Benchmark results come from running your own code in CodeMate. No sample timings are shown here.",
    to: "/benchmark",
  },
};

/* ── Helpers ── */

function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const { ref, visible } = useScrollReveal<HTMLDivElement>(0.12);
  return (
    <div ref={ref} className={`${visible ? "reveal-visible" : "reveal-hidden"} ${className ?? ""}`}>
      {children}
    </div>
  );
}

/* ── Redesigned Navbar ── */

function LandingHeader() {
  const [compact, setCompact] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    let rafId = 0;
    let lastCompact = window.scrollY > 48;
    setCompact(lastCompact);

    const updateScrollState = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        const next = window.scrollY > 48;
        if (next !== lastCompact) {
          lastCompact = next;
          setCompact(next);
        }
      });
    };

    window.addEventListener("scroll", updateScrollState, { passive: true });
    return () => {
      window.removeEventListener("scroll", updateScrollState);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <header className={`landing-nav${compact ? " landing-nav--compact" : ""}`}>
      <div className="landing-nav__inner">
        <div className="landing-nav__brand">
          <Link to="/" className="landing-brand" aria-label="CodeMate home">
            <CodeMateMark size={28} tone="light" />
            <span>
              CodeMate<span className="landing-brand__suffix"> AI</span>
            </span>
          </Link>
          <nav className="landing-nav__links" aria-label="Product navigation">
            {NAV_LINKS.map((item) =>
              item.isAnchor ? (
                <a key={item.to} href={item.to}>
                  {item.label}
                </a>
              ) : (
                <Link key={item.to} to={item.to}>
                  {item.label}
                </Link>
              ),
            )}
          </nav>
        </div>

        <div className="landing-nav__actions">
          <Link className="landing-nav__signin" to="/login">
            Log in
          </Link>
          <Link className="landing-nav__cta" to="/dashboard">
            <span>Open CodeMate</span>
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
          <button
            type="button"
            className="landing-nav__menu"
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="landing-mobile-menu"
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {mobileMenuOpen ? (
        <nav
          id="landing-mobile-menu"
          className="landing-mobile-menu"
          aria-label="Mobile navigation"
        >
          {[
            ...NAV_LINKS.filter((n) => !n.isAnchor),
            { to: "/analyzer", label: "Code Analyzer", isAnchor: false },
            { to: "/progress", label: "Progress & DNA", isAnchor: false },
            { to: "/history", label: "History", isAnchor: false },
          ].map((item) => (
            <Link key={item.to} to={item.to} onClick={() => setMobileMenuOpen(false)}>
              {item.label}
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          ))}
          <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
            Sign in
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </nav>
      ) : null}
    </header>
  );
}

/* ── 3D Hanging Objects Scene ── */

function HeroObjectScene() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

    let rafId = 0;
    const onScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        const wrap = sceneRef.current?.parentElement;
        if (!wrap) return;
        const clamped = Math.min(window.scrollY, 500);
        wrap.style.setProperty("--scene-scroll-y", `${-clamped * 0.08}px`);
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  const toggleTouchTile = useCallback((id: string) => {
    setHovered((prev) => (prev === id ? null : id));
  }, []);

  const moveScene = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    const style = event.currentTarget.style;
    style.setProperty("--scene-rotate-x", `${-y * 3}deg`);
    style.setProperty("--scene-rotate-y", `${x * 4.5}deg`);
    style.setProperty("--scene-shift-x", `${x * 4}px`);
    style.setProperty("--scene-shift-y", `${y * 3}px`);
    style.setProperty("--swing-left", `${x * 2.8}deg`);
    style.setProperty("--swing-right", `${-x * 2.2}deg`);
    style.setProperty("--swing-center", `${x * 1.6}deg`);
    style.setProperty("--highlight-x", `${50 + x * 24}%`);
    style.setProperty("--highlight-y", `${35 + y * 18}%`);
  }, []);

  const resetScene = useCallback(() => {
    const style = sceneRef.current?.style;
    if (!style) return;
    style.setProperty("--scene-rotate-x", "0deg");
    style.setProperty("--scene-rotate-y", "0deg");
    style.setProperty("--scene-shift-x", "0px");
    style.setProperty("--scene-shift-y", "0px");
    style.setProperty("--swing-left", "0deg");
    style.setProperty("--swing-right", "0deg");
    style.setProperty("--swing-center", "0deg");
    style.setProperty("--highlight-x", "50%");
    style.setProperty("--highlight-y", "35%");
    setHovered(null);
  }, []);

  return (
    <div
      ref={sceneRef}
      className="hero-object-scene"
      onPointerMove={moveScene}
      onPointerLeave={resetScene}
      aria-hidden="true"
    >
      <div className="hero-object-scene__aura" />
      <div className="hero-object-scene__shadow" />
      <div className="hero-keyring" />

      {/* Central sculpted 3D emerald brackets — main focus */}
      <div className="hero-pendant hero-pendant--center">
        <div className="hero-chain hero-chain--thick">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <div
          className={`hero-bracket-sculpture${hovered === "center" ? " hero-tile--hovered" : ""}`}
          onPointerEnter={(e) => e.pointerType !== "touch" && setHovered("center")}
          onPointerLeave={(e) => e.pointerType !== "touch" && setHovered(null)}
          onClick={() => toggleTouchTile("center")}
        >
          <span className="hero-bracket-sculpture__back" aria-hidden="true">
            {"{ }"}
          </span>
          <span className="hero-bracket-sculpture__mid" aria-hidden="true">
            {"{ }"}
          </span>
          <span className="hero-bracket-sculpture__front">{"{ }"}</span>
        </div>
      </div>

      {/* Code tile — left */}
      <div className="hero-pendant hero-pendant--code">
        <div className="hero-chain">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <div
          className={`hero-code-tile${hovered === "code" ? " hero-tile--hovered" : ""}`}
          onPointerEnter={(e) => e.pointerType !== "touch" && setHovered("code")}
          onPointerLeave={(e) => e.pointerType !== "touch" && setHovered(null)}
          onClick={() => toggleTouchTile("code")}
        >
          <span className="hero-code-tile__reflection" />
          <span className="hero-code-tile__symbol">{"</>"}</span>
        </div>
      </div>

      {/* AI tile — left-center */}
      <div className="hero-pendant hero-pendant--ai">
        <div className="hero-chain">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <div
          className={`hero-metal-tile${hovered === "ai" ? " hero-tile--hovered" : ""}`}
          onPointerEnter={(e) => e.pointerType !== "touch" && setHovered("ai")}
          onPointerLeave={(e) => e.pointerType !== "touch" && setHovered(null)}
          onClick={() => toggleTouchTile("ai")}
        >
          <span className="hero-metal-tile__shine" />
          <span className="hero-metal-tile__letters">AI</span>
        </div>
      </div>

      {/* Processor chip — right-center */}
      <div className="hero-pendant hero-pendant--chip">
        <div className="hero-chain hero-chain--fine">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <div
          className={`hero-processor${hovered === "chip" ? " hero-tile--hovered" : ""}`}
          onPointerEnter={(e) => e.pointerType !== "touch" && setHovered("chip")}
          onPointerLeave={(e) => e.pointerType !== "touch" && setHovered(null)}
          onClick={() => toggleTouchTile("chip")}
        >
          <div className="hero-processor__pins" />
          <div className="hero-processor__body">
            <div className="hero-processor__core">
              <div className="hero-processor__dots">
                <i /><i /><i /><i />
                <i /><i /><i /><i />
                <i /><i /><i /><i />
                <i /><i /><i /><i />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Play button tile — far right */}
      <div className="hero-pendant hero-pendant--play">
        <div className="hero-chain hero-chain--fine">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <div
          className={`hero-play-tile${hovered === "play" ? " hero-tile--hovered" : ""}`}
          onPointerEnter={(e) => e.pointerType !== "touch" && setHovered("play")}
          onPointerLeave={(e) => e.pointerType !== "touch" && setHovered(null)}
          onClick={() => toggleTouchTile("play")}
        >
          <span className="hero-play-tile__glow" />
          <span className="hero-play-tile__icon">▶</span>
        </div>
      </div>
    </div>
  );
}

/* ── Feature Strip ── */

function FeatureStrip() {
  return (
    <div className="feature-strip" id="features-strip">
      <div className="feature-strip__inner">
        <p className="feature-strip__tagline">Everything you need to grow as a developer.</p>
        <div className="feature-strip__items">
          {FEATURE_STRIP_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.to} to={item.to} className="feature-strip__item">
                <Icon size={14} className="feature-strip__icon" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Existing Sections (preserved) ── */

function FeatureMarquee() {
  return (
    <div className="feature-marquee" aria-label="CodeMate features">
      <div className="feature-marquee__track">
        {[...FEATURE_LINKS, ...FEATURE_LINKS].map((item, index) => {
          const duplicate = index >= FEATURE_LINKS.length;
          return (
            <Link
              key={`${item.to}-${index}`}
              to={item.to}
              tabIndex={duplicate ? -1 : undefined}
              aria-hidden={duplicate || undefined}
              className="feature-marquee__item"
            >
              <span className="feature-marquee__symbol" aria-hidden="true">
                {"{}"}
              </span>
              {item.label}
              <span className="feature-marquee__separator" aria-hidden="true">
                /
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function CodeWorkbench() {
  const [activeTab, setActiveTab] = useState<WorkbenchTab>("optimizer");
  const demo = WORKBENCH_DEMOS[activeTab];

  return (
    <div className="code-workbench">
      <div className="code-workbench__topbar">
        <div className="code-workbench__file">
          <span className="code-workbench__indicator" />
          <span>{demo.path}</span>
        </div>
        <div className="code-workbench__tabs" role="tablist" aria-label="CodeMate tool preview">
          {(Object.keys(WORKBENCH_DEMOS) as WorkbenchTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`workbench-tab-${tab}`}
              aria-selected={activeTab === tab}
              aria-controls="workbench-panel"
              onClick={() => setActiveTab(tab)}
            >
              {WORKBENCH_DEMOS[tab].label}
            </button>
          ))}
        </div>
      </div>
      <div
        id="workbench-panel"
        role="tabpanel"
        aria-labelledby={`workbench-tab-${activeTab}`}
        className="code-workbench__panel"
      >
        <div className="code-workbench__editor">
          {demo.code ? (
            <pre>
              <code>{demo.code}</code>
            </pre>
          ) : (
            <div className="code-workbench__empty">
              <Gauge size={23} aria-hidden="true" />
              <span>Run your own comparison to see measured results.</span>
            </div>
          )}
          <span className="code-workbench__caption">
            Illustrative code only — run your own code for analysis and results.
          </span>
        </div>
        <aside className="code-workbench__note">
          <p className="eyebrow eyebrow--quiet">Inside CodeMate</p>
          <h3>{demo.label}</h3>
          <p>{demo.summary}</p>
          <Link to={demo.to} className="text-link">
            Open {demo.label}
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </aside>
      </div>
    </div>
  );
}

type MotionTile = {
  left: number;
  top: number;
  width: number;
  height: number;
  dx: number;
  dy: number;
  scaleX: number;
  scaleY: number;
  label: string;
};

const FLOW_LABELS = ["pattern", "trade-off", "solution"];

function StatementFlow() {
  const sectionRef = useRef<HTMLElement>(null);
  const sourceRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const targetRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const arrivedRef = useRef(false);
  const [arrived, setArrived] = useState(false);
  const [flights, setFlights] = useState<MotionTile[]>([]);
  const [flightComplete, setFlightComplete] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    let isVisible = false;
    let isMoving = false;
    let timer: number | undefined;
    let frame: number | undefined;

    const finishMotion = (next: boolean) => {
      window.clearTimeout(timer);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      setFlights([]);
      setFlightComplete(false);
      setArrived(next);
      arrivedRef.current = next;
      isMoving = false;
    };

    const moveTiles = (next: boolean) => {
      isVisible = next;
      if (isMoving || arrivedRef.current === next) return;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reducedMotion) {
        finishMotion(next);
        return;
      }

      const tiles = FLOW_LABELS.flatMap((label, index) => {
        const source = sourceRefs.current[index];
        const target = targetRefs.current[index];
        if (!source || !target) return [];
        const start = (next ? source : target).getBoundingClientRect();
        const end = (next ? target : source).getBoundingClientRect();
        if (!start.width || !start.height || !end.width || !end.height) return [];
        return [
          {
            left: start.left,
            top: start.top,
            width: start.width,
            height: start.height,
            dx: end.left - start.left,
            dy: end.top - start.top,
            scaleX: end.width / start.width,
            scaleY: end.height / start.height,
            label,
          },
        ];
      });

      if (!tiles.length) {
        finishMotion(next);
        return;
      }

      isMoving = true;
      setFlightComplete(false);
      setFlights(tiles);
      frame = window.requestAnimationFrame(() => setFlightComplete(true));
      timer = window.setTimeout(() => {
        finishMotion(next);
        if (isVisible !== next) moveTiles(isVisible);
      }, 780);
    };

    const observer = new IntersectionObserver(
      ([entry]) => moveTiles(entry?.isIntersecting ?? false),
      { threshold: 0.15, rootMargin: "-18% 0px -18% 0px" },
    );
    observer.observe(section);

    const onResize = () => {
      if (isMoving) finishMotion(isVisible);
    };
    window.addEventListener("resize", onResize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      window.clearTimeout(timer);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, []);

  const anchorsHidden = arrived || flights.length > 0;

  return (
    <section className="statement-section" ref={sectionRef} aria-label="From code to understanding">
      <div className="statement-section__inner">
        <div className="statement-editor">
          <div className="statement-editor__header">
            <div className="statement-editor__file">
              <span className="statement-editor__dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>reasoning.ts</span>
            </div>
            <span className="statement-editor__mode">A way to think</span>
          </div>
          <pre className="statement-editor__code">
            <code>
              <span className="code-muted">{"// Start with the shape of the problem\n"}</span>
              <span className="code-purple">function</span> solve(input) {"{\n"}
              {"  "}
              <span className="code-blue">const</span> state ={" "}
              <span className="code-orange">derive</span>(input);{"\n"}
              {"  "}
              <span className="code-purple">while</span> (state.hasNext) {"{\n"}
              {"    "}state.advance();{"\n"}
              {"  }\n"}
              {"  "}
              <span className="code-purple">return</span> state.result;{"\n"}
              {"}"}
            </code>
          </pre>
          <div className="statement-editor__labels" aria-label="A few useful questions">
            {FLOW_LABELS.map((label, index) => (
              <span
                key={label}
                ref={(element) => {
                  sourceRefs.current[index] = element;
                }}
                className="flow-chip"
                style={{ visibility: anchorsHidden ? "hidden" : "visible" }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="statement-copy">
          <p className="eyebrow eyebrow--quiet">From first read to clear reasoning</p>
          <h2>
            Understand the{" "}
            <span
              ref={(element) => {
                targetRefs.current[0] = element;
              }}
              className="flow-anchor"
            >
              <span className="flow-anchor__placeholder">pattern</span>
              {arrived && !flights.length ? <span className="flow-chip">pattern</span> : null}
            </span>
            .
            <br />
            See the{" "}
            <span
              ref={(element) => {
                targetRefs.current[1] = element;
              }}
              className="flow-anchor"
            >
              <span className="flow-anchor__placeholder">trade-off</span>
              {arrived && !flights.length ? <span className="flow-chip">trade-off</span> : null}
            </span>
            .
            <br />
            Explain the{" "}
            <span
              ref={(element) => {
                targetRefs.current[2] = element;
              }}
              className="flow-anchor"
            >
              <span className="flow-anchor__placeholder">solution</span>
              {arrived && !flights.length ? <span className="flow-chip">solution</span> : null}
            </span>
            .
          </h2>
          <p className="statement-copy__body">
            CodeMate connects the work of understanding a solution with the practice of explaining
            one. Use the tools that fit the problem in front of you.
          </p>
          <Link to="/analyzer" className="text-link text-link--dark">
            Find your next step
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>

      {flights.map((tile, index) => (
        <span
          key={`${tile.label}-${index}`}
          className="flow-chip flow-flight"
          aria-hidden="true"
          style={{
            left: tile.left,
            top: tile.top,
            width: tile.width,
            height: tile.height,
            transform: flightComplete
              ? `translate(${tile.dx}px, ${tile.dy}px) scale(${tile.scaleX}, ${tile.scaleY})`
              : "translate(0, 0) scale(1, 1)",
          }}
        >
          {tile.label}
        </span>
      ))}
    </section>
  );
}

function ToolList({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: typeof CODE_TOOLS | typeof CAREER_TOOLS;
}) {
  return (
    <div className="tool-list">
      <div className="tool-list__intro">
        <p className="eyebrow eyebrow--quiet">{title}</p>
        <p>{description}</p>
      </div>
      <div className="tool-list__items">
        {items.map((item, index) => {
          const Icon = item.icon;
          return (
            <Link key={item.to} to={item.to} className="tool-row">
              <span className="tool-row__index">0{index + 1}</span>
              <span className="tool-row__icon">
                <Icon size={18} aria-hidden="true" />
              </span>
              <span className="tool-row__body">
                <span className="tool-row__title">{item.label}</span>
                <span className="tool-row__description">{item.description}</span>
              </span>
              <ArrowUpRight className="tool-row__arrow" size={18} aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main Landing Page ── */

function LandingPage() {
  return (
    <div className="landing-page">
      <LandingHeader />
      <main>
        {/* ── Hero Section ── */}
        <section className="landing-hero">
          <div className="landing-hero__grain" aria-hidden="true" />

          {/* Hero content: hanging 3D artwork top-center, headline left, CTA right */}
          <div className="landing-hero__content">
            <div className="landing-hero__scene-wrap">
              <HeroObjectScene />
            </div>

            <div className="landing-hero__text">
              <div className="landing-hero__headline">
                <h1>
                  Think in
                  <br />
                  <span>Algorithms.</span>
                </h1>
              </div>
              <div className="landing-hero__aside">
                <p className="landing-hero__description">
                  Write better code, understand your solutions, and prepare for the interviews that
                  matter.
                </p>
                <div className="landing-hero__actions">
                  <Link to="/dashboard" className="button-primary">
                    Open CodeMate
                    <ArrowRight size={17} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Feature strip at the bottom of hero */}
          <FeatureStrip />
        </section>

        <section id="capabilities" className="capabilities-section">
          <Reveal className="capabilities-section__heading">
            <div>
              <p className="eyebrow eyebrow--quiet">The CodeMate workspace</p>
              <h2>One thought leads to the next.</h2>
            </div>
            <p>
              Move from understanding a problem to improving a solution, then carry that clarity
              into interview practice.
            </p>
          </Reveal>
          <FeatureMarquee />
          <div className="capabilities-section__foot">
            <span>Eight connected tools</span>
            <span>Scroll to explore</span>
          </div>
        </section>

        <section className="workbench-section">
          <Reveal className="workbench-section__heading">
            <div>
              <p className="eyebrow">From pattern to practice</p>
              <h2>See the thinking behind the code.</h2>
            </div>
            <p>
              A small algorithm example, not a generated result. Try a CodeMate tool with your own
              code and inspect its actual output.
            </p>
          </Reveal>
          <CodeWorkbench />
        </section>

        <StatementFlow />

        <section className="tools-section">
          <Reveal className="tools-section__heading">
            <p className="eyebrow eyebrow--quiet">Built around real work</p>
            <h2>
              Choose a direction.
              <br />
              Keep your momentum.
            </h2>
            <p>
              Every tool opens the existing CodeMate workspace, using your account and its real
              backend features.
            </p>
          </Reveal>
          <div className="tools-section__columns">
            <ToolList
              title="Code intelligence"
              description="Inspect, transform, and compare the code you are working on."
              items={CODE_TOOLS}
            />
            <ToolList
              title="Interview preparation"
              description="Connect your practice with the roles and topics that matter to you."
              items={CAREER_TOOLS}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
