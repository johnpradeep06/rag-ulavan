"use client";

import { ReactNode } from "react";

interface PageBackgroundProps {
  variant?: "landing" | "chat" | "auth" | "graph" | "admin" | "score";
  children?: ReactNode;
  className?: string;
  hideBg?: boolean;
}

// ─── Firefly seed data ───────────────────────────────────────────────────────
// 16 ambient particles (harvest gold + rice-paddy emerald) drifting across the field
const PARTICLES = [
  { x: 6,  y: 16, dx:  14, dy: -20, dur: 5.0, gold: true  },
  { x: 14, y: 68, dx: -16, dy: -14, dur: 6.5, gold: false },
  { x: 25, y: 32, dx:  10, dy: -24, dur: 4.8, gold: true  },
  { x: 38, y: 78, dx: -12, dy:  16, dur: 7.2, gold: false },
  { x: 48, y: 22, dx:  16, dy: -10, dur: 5.6, gold: true  },
  { x: 58, y: 58, dx: -18, dy: -18, dur: 6.4, gold: false },
  { x: 67, y: 38, dx:  12, dy:  14, dur: 5.1, gold: true  },
  { x: 78, y: 24, dx: -16, dy: -12, dur: 7.0, gold: false },
  { x: 88, y: 65, dx:  14, dy: -22, dur: 5.4, gold: true  },
  { x: 94, y: 30, dx: -12, dy: -16, dur: 6.8, gold: false },
  { x: 20, y: 86, dx:  18, dy: -15, dur: 6.1, gold: true  },
  { x: 32, y: 50, dx: -14, dy:  18, dur: 7.5, gold: false },
  { x: 52, y: 88, dx:  12, dy: -22, dur: 5.8, gold: true  },
  { x: 74, y: 82, dx: -15, dy: -12, dur: 6.6, gold: false },
  { x: 84, y: 48, dx:  16, dy: -18, dur: 5.2, gold: true  },
  { x: 10, y: 42, dx: -10, dy:  12, dur: 6.9, gold: false },
] as const;

export default function PageBackground({
  variant = "landing",
  children,
  className = "",
  hideBg = false,
}: PageBackgroundProps) {
  // Landing page renders GlobalCinematicBackground with scroll-driven zoom/dim
  const skipBg = variant === "landing";

  return (
    <div className={`relative w-full overflow-hidden ${className}`}>

      {/* ── Cinematic hero field background — consistent across every page ── */}
      {!skipBg && (
        <div
          className={`pointer-events-none fixed inset-0 -z-10 select-none overflow-hidden transition-opacity duration-500 ease-in-out ${
            hideBg ? "opacity-0" : "opacity-100"
          }`}
        >
          {/* Panoramic landscape: elevated brightness, positioned so top sky & mountains are crystal clear */}
          <div
            className="absolute inset-0 origin-center"
            style={{
              backgroundImage:    "url('/images/hero_field.jpg')",
              backgroundPosition: "center 18%",
              backgroundSize:     "cover",
              backgroundRepeat:   "no-repeat",
              filter:             "brightness(0.92) saturate(1.18)",
            }}
          />

          {/* 
            Vertical clarity gradient:
            - Top 0% - 28%: completely transparent / crystal clear so mountain peaks & golden dusk sky shine through
            - Middle 28% - 65%: gentle progressive deepening for comfortable text readability
            - Bottom 65% - 100%: rich dark soil tint grounding inputs, cards, and tables
          */}
          <div
            className="absolute inset-0"
            style={{
              background: [
                "linear-gradient(to bottom, transparent 0%, rgba(14, 18, 15, 0.05) 20%, rgba(14, 18, 15, 0.35) 45%, rgba(14, 18, 15, 0.68) 75%, rgba(14, 18, 15, 0.85) 100%)",
              ].join(", "),
            }}
          />

          {/* Edge vignette: keeps the top 100% open and clear, gently vignetting only the bottom and side edges */}
          <div
            className="absolute inset-0"
            style={{
              background: [
                // Soft bottom ground fade
                "linear-gradient(to top, rgba(14, 18, 15, 0.82) 0%, rgba(14, 18, 15, 0.25) 30%, transparent 60%)",
                // Subtle side darkening to frame center content without touching the top
                "linear-gradient(to right, rgba(14, 18, 15, 0.50) 0%, transparent 12%, transparent 88%, rgba(14, 18, 15, 0.50) 100%)",
              ].join(", "),
            }}
          />

          {/* Grain texture overlay */}
          <div
            className="animate-grain absolute inset-[-10%] opacity-[0.035]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
              backgroundSize: "128px 128px",
            }}
          />

          {/* Bio-luminescent firefly particles drifting across the field */}
          {PARTICLES.map((p, i) => {
            const col = p.gold
              ? "oklch(0.85 0.19 78)"
              : "oklch(0.76 0.20 148)";
            return (
              <div
                key={i}
                className="animate-firefly absolute rounded-full"
                style={{
                  left:       `${p.x}%`,
                  top:        `${p.y}%`,
                  width:      "5px",
                  height:     "5px",
                  background: col,
                  boxShadow:  `0 0 6px ${col}, 0 0 14px ${col}`,
                  "--drift-x":  `${p.dx}px`,
                  "--drift-y":  `${p.dy}px`,
                  "--drift-dur":`${p.dur}s`,
                  animationDelay: `${(i * 0.39) % p.dur}s`,
                } as React.CSSProperties}
              />
            );
          })}
        </div>
      )}

      {/* Grain fallback for landing page (GlobalCinematicBackground handles the hero canvas) */}
      {skipBg && (
        <div className="grain-overlay pointer-events-none fixed inset-0 -z-5 select-none" />
      )}

      {children}
    </div>
  );
}
