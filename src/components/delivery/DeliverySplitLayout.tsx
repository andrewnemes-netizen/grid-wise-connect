import { useEffect, useRef, useState } from "react";

/**
 * Resizable two-pane layout used across Delivery pages.
 * - Desktop: horizontal split with drag handle, ratio persisted in localStorage.
 * - Mobile: stacked. Left pane collapses into a header card, right pane fills below.
 */
export function DeliverySplitLayout({
  left,
  right,
  storageKey = "delivery.split.ratio",
  minLeft = 260,
  minRight = 420,
  defaultRatio = 0.4,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  storageKey?: string;
  minLeft?: number;
  minRight?: number;
  defaultRatio?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState<number>(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0.15 && n < 0.85 ? n : defaultRatio;
  });
  const [dragging, setDragging] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);

  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 900);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const raw = (e.clientX - rect.left) / rect.width;
      const maxRatio = 1 - minRight / rect.width;
      const minRatio = minLeft / rect.width;
      const clamped = Math.min(Math.max(raw, minRatio), Math.max(minRatio, maxRatio));
      setRatio(clamped);
    };
    const onUp = () => {
      setDragging(false);
      try { localStorage.setItem(storageKey, String(ratio)); } catch {}
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, minLeft, minRight, ratio, storageKey]);

  if (mobile) {
    return (
      <div className="flex flex-col h-[calc(100vh-3.5rem)]">
        <button
          onClick={() => setMobileMapOpen((v) => !v)}
          className="flex items-center justify-between border-b border-border/60 bg-card px-4 py-2 text-xs font-medium text-muted-foreground"
        >
          <span>Programme map & sites</span>
          <span className="text-accent">{mobileMapOpen ? "Hide" : "Show"}</span>
        </button>
        {mobileMapOpen && <div className="h-56 border-b border-border/60 overflow-hidden">{left}</div>}
        <div className="flex-1 overflow-auto">{right}</div>
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="grid h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-background"
      style={{ gridTemplateColumns: `${(ratio * 100).toFixed(3)}% 6px 1fr` }}
    >
      <div className="min-w-0 overflow-hidden border-r border-border/60 bg-card/40">{left}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={() => setDragging(true)}
        className={`relative cursor-col-resize select-none transition-colors ${dragging ? "bg-accent/40" : "bg-transparent hover:bg-accent/30"}`}
      >
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-1 rounded-full bg-border" />
      </div>
      <div className="min-w-0 overflow-auto">{right}</div>
    </div>
  );
}