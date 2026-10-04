"use client";

import { useEffect, useRef, useCallback } from "react";

// ─── Firefly seed data ─────────────────────────────────────────────────────
// 20 particles alternating harvest gold and emerald green
const FIREFLIES = [
  { x: 8,  y: 18, dx:  14, dy: -22, dur: 4.8, color: "gold"    },
  { x: 15, y: 72, dx: -18, dy: -15, dur: 6.2, color: "emerald" },
  { x: 23, y: 35, dx:  10, dy: -28, dur: 5.1, color: "gold"    },
  { x: 31, y: 60, dx: -12, dy:  18, dur: 7.4, color: "emerald" },
  { x: 40, y: 14, dx:  20, dy: -10, dur: 4.3, color: "gold"    },
  { x: 48, y: 80, dx: -16, dy: -24, dur: 6.8, color: "emerald" },
  { x: 55, y: 45, dx:  12, dy:  20, dur: 5.5, color: "gold"    },
  { x: 62, y: 25, dx: -20, dy: -12, dur: 7.0, color: "emerald" },
  { x: 70, y: 68, dx:  18, dy: -18, dur: 4.6, color: "gold"    },
  { x: 78, y: 38, dx: -10, dy:  14, dur: 6.4, color: "emerald" },
  { x: 84, y: 55, dx:  16, dy: -20, dur: 5.8, color: "gold"    },
  { x: 90, y: 22, dx: -22, dy: -16, dur: 7.2, color: "emerald" },
  { x: 12, y: 85, dx:  10, dy: -30, dur: 4.9, color: "emerald" },
  { x: 27, y: 90, dx: -14, dy: -20, dur: 6.6, color: "gold"    },
  { x: 43, y: 92, dx:  18, dy: -14, dur: 5.3, color: "emerald" },
  { x: 58, y: 88, dx: -10, dy: -25, dur: 7.6, color: "gold"    },
  { x: 73, y: 82, dx:  12, dy: -18, dur: 4.7, color: "emerald" },
  { x: 88, y: 78, dx: -20, dy: -10, dur: 6.1, color: "gold"    },
  { x: 6,  y: 50, dx:  22, dy: -12, dur: 5.9, color: "emerald" },
  { x: 95, y: 42, dx: -15, dy:  16, dur: 7.3, color: "gold"    },
] as const;

const GOLD_COLOR    = "oklch(0.85 0.19 78)";
const EMERALD_COLOR = "oklch(0.76 0.20 148)";

export default function GlobalCinematicBackground() {
  const bgImgRef   = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const ticking    = useRef(false);

  const onScroll = useCallback(() => {
    if (ticking.current) return;
    ticking.current = true;
    requestAnimationFrame(() => {
      const progress = Math.min(window.scrollY / 650, 1);

      if (bgImgRef.current) {
        const scale      = 1.0  + progress * 0.07;                    // 1.0 → 1.07
        const brightness = 0.92 - progress * 0.55;                    // 0.92 (clear on top) → 0.37
        const blur       = progress * 6;                               // 0 → 6px
        bgImgRef.current.style.transform = `scale(${scale})`;
        bgImgRef.current.style.filter    = `brightness(${brightness}) saturate(${1.18 - progress * 0.15}) blur(${blur}px)`;
      }

      if (overlayRef.current) {
        const overlayAlpha = 0.08 + progress * 0.76;                  // 0.08 → 0.84
        overlayRef.current.style.opacity = String(overlayAlpha);
      }

      ticking.current = false;
    });
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll(); // init
    return () => window.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 select-none overflow-hidden">
      {/* ── Panoramic landscape image: clear on top, centered on mountain skyline ─ */}
      <div
        ref={bgImgRef}
        className="absolute inset-0 origin-center"
        style={{
          backgroundImage:    "url('/images/hero_field.jpg')",
          backgroundPosition: "center 18%",
          backgroundSize:     "cover",
          backgroundRepeat:   "no-repeat",
          willChange:         "transform, filter",
          filter:             "brightness(0.92) saturate(1.18)",
          transform:          "scale(1.0)",
          transition:         "none",
        }}
      />

      {/* ── Dark soil overlay (scroll-controlled opacity, clear at top) ──── */}
      <div
        ref={overlayRef}
        className="absolute inset-0"
        style={{
          background: "linear-gradient(to bottom, transparent 0%, rgba(14, 18, 15, 0.15) 30%, rgba(14, 18, 15, 0.70) 75%, rgba(14, 18, 15, 0.90) 100%)",
          opacity:    0.08,
          willChange: "opacity",
        }}
      />

      {/* ── Vignette: leaves top wide open and clear ───────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            "linear-gradient(to top, rgba(14, 18, 15, 0.80) 0%, rgba(14, 18, 15, 0.20) 30%, transparent 60%)",
            "linear-gradient(to right, rgba(14, 18, 15, 0.50) 0%, transparent 12%, transparent 88%, rgba(14, 18, 15, 0.50) 100%)",
          ].join(", "),
        }}
      />

      {/* ── Grain overlay ──────────────────────────────────────── */}
      <div
        className="animate-grain absolute inset-[-10%] opacity-[0.035]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundSize:  "128px 128px",
        }}
      />

      {/* ── Bio-luminescent firefly particles ──────────────────── */}
      {FIREFLIES.map((f, i) => {
        const col = f.color === "gold" ? GOLD_COLOR : EMERALD_COLOR;
        return (
          <div
            key={i}
            className="animate-firefly absolute size-1.5 rounded-full"
            style={{
              left:       `${f.x}%`,
              top:        `${f.y}%`,
              background: col,
              boxShadow:  `0 0 6px ${col}, 0 0 14px ${col}`,
              "--drift-x": `${f.dx}px`,
              "--drift-y": `${f.dy}px`,
              "--drift-dur": `${f.dur}s`,
              animationDelay: `${(i * 0.37) % f.dur}s`,
            } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}
