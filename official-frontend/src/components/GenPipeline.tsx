import { useEffect, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";

export type GenStep = { label: string; detail?: string };

/**
 * Animated AI generation pipeline visualizer.
 * Steps advance one-by-one with a "thinking" loader on the active step
 * and a check on completed ones. Calls onDone when all steps complete.
 */
export function GenPipeline({
  steps,
  stepMs = 700,
  onDone,
  title = "AI 正在生成…",
  compact = false,
}: {
  steps: GenStep[];
  stepMs?: number;
  onDone?: () => void;
  title?: string;
  compact?: boolean;
}) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (active >= steps.length) {
      const t = setTimeout(() => onDone?.(), 350);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setActive((a) => a + 1), stepMs);
    return () => clearTimeout(t);
  }, [active, steps.length, stepMs, onDone]);

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {!compact && (
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-primary">
          <Sparkles className="h-3.5 w-3.5 animate-pulse" />
          {title}
        </div>
      )}
      <div className={compact ? "space-y-1.5" : "space-y-2"}>
        {steps.map((s, i) => {
          const done = i < active;
          const current = i === active;
          return (
            <div
              key={s.label}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2 transition ${
                done
                  ? "border-primary/30 bg-primary/5"
                  : current
                    ? "border-primary/60 bg-primary/10"
                    : "border-border bg-background/20 opacity-50"
              }`}
            >
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-background/60">
                {done ? (
                  <Check className="h-3 w-3 text-primary" />
                ) : current ? (
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                ) : (
                  <span className="text-[10px] text-muted-foreground">{i + 1}</span>
                )}
              </div>
              <div className="flex-1">
                <div
                  className={`text-xs font-medium ${done || current ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {s.label}
                </div>
                {s.detail && (current || done) && (
                  <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                    {s.detail}
                  </div>
                )}
              </div>
              {done && <span className="text-[10px] text-primary">done</span>}
              {current && <span className="text-[10px] text-primary">running…</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Full-screen overlay variant for user-facing page auto-generation. */
export function GenOverlay({
  steps,
  onDone,
  title,
  subtitle,
}: {
  steps: GenStep[];
  onDone: () => void;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-6 backdrop-blur-md animate-in fade-in duration-200">
      <div className="glass w-full max-w-md rounded-2xl p-8">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-primary">
          <Sparkles className="h-3.5 w-3.5 animate-pulse" /> Buyna AI
        </div>
        <h2 className="mt-3 text-xl font-semibold">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
        <div className="mt-6">
          <GenPipeline steps={steps} stepMs={600} onDone={onDone} compact />
        </div>
      </div>
    </div>
  );
}
