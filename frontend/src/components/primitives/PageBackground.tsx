"use client";

import Image from "next/image";
import { ReactNode } from "react";

interface PageBackgroundProps {
  variant?: "landing" | "chat" | "auth" | "graph" | "admin" | "score";
  children?: ReactNode;
  className?: string;
}

export default function PageBackground({
  variant = "landing",
  children,
  className = "",
}: PageBackgroundProps) {
  return (
    <div className={`relative w-full overflow-hidden ${className}`}>
      {/* Background imagery according to page variant */}
      {variant === "landing" && (
        <div className="pointer-events-none fixed inset-0 -z-10 select-none">
          <div className="relative h-full w-full">
            <Image
              src="/images/farm_hero_dawn.jpg"
              alt="Terraced agricultural dawn"
              fill
              priority
              className="object-cover object-center opacity-30 brightness-[0.7] contrast-[1.1]"
            />
            {/* Multi-layered cinematic vignette & dark mask */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#080b09]/80 via-[#0c0f0d]/92 to-[#080b09]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(16,185,129,0.07),transparent_70%)]" />
          </div>
        </div>
      )}

      {variant === "auth" && (
        <div className="pointer-events-none absolute inset-0 -z-10 select-none">
          <div className="relative h-full w-full">
            <Image
              src="/images/farm_dark_mood.jpg"
              alt="Atmospheric farmland at blue hour"
              fill
              priority
              className="object-cover object-center opacity-40 brightness-[0.6] contrast-[1.15]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#080b09] via-[#0c0f0d]/85 to-[#080b09]/90" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(5,150,105,0.06),transparent_65%)]" />
          </div>
        </div>
      )}

      {variant === "chat" && (
        <div className="pointer-events-none absolute inset-0 -z-10 select-none">
          {/* Subtle agronomy field coordinate grid & soft ambient glow */}
          <div
            className="absolute inset-0 opacity-[0.035]"
            style={{
              backgroundImage:
                "linear-gradient(to right, #10b981 1px, transparent 1px), linear-gradient(to bottom, #10b981 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(16,185,129,0.08),transparent_70%)]" />
        </div>
      )}

      {variant === "graph" && (
        <div className="pointer-events-none absolute inset-0 -z-10 select-none">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(16,185,129,0.06),transparent_60%)]" />
        </div>
      )}

      {variant === "score" && (
        <div className="pointer-events-none absolute inset-0 -z-10 select-none">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.05),transparent_50%)]" />
        </div>
      )}

      {variant === "admin" && (
        <div className="pointer-events-none absolute inset-0 -z-10 select-none">
          <div
            className="absolute inset-0 opacity-[0.025]"
            style={{
              backgroundImage:
                "linear-gradient(to right, #34d399 1px, transparent 1px), linear-gradient(to bottom, #34d399 1px, transparent 1px)",
              backgroundSize: "64px 64px",
            }}
          />
        </div>
      )}

      {/* Subtle tactile film grain overlay */}
      <div className="grain-overlay pointer-events-none fixed inset-0 -z-5 select-none" />

      {children}
    </div>
  );
}
