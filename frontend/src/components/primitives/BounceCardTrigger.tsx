"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { Sparkles } from "lucide-react";

export interface PhotoItem {
  img: string;
  alt: string;
  title: string;
  borderColor: string;   // e.g. "border-emerald-500/40"
  shadowColor: string;   // e.g. "shadow-[0_20px_45px_rgba(0,0,0,0.85),0_0_25px_rgba(16,185,129,0.25)]"
  textColor: string;     // e.g. "text-emerald-300"
  x: number;             // Horizontal offset from center
  y: number;             // Vertical elevation above the card
  rotate: number;        // Fan angle in degrees
  delay: number;         // Stagger delay in seconds
}

export function BounceCardTrigger({
  badge,
  title,
  description,
  photos,
  gradient = "from-emerald-500/20 via-emerald-950/10 to-transparent",
  onClick,
}: {
  badge?: string;
  title: string;
  description: string;
  photos: PhotoItem[];
  gradient?: string;
  onClick?: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      className={`relative p-[1px] rounded-xl bg-gradient-to-br ${gradient} transition-all duration-300 ${
        isHovered ? "z-40" : "z-10"
      }`}
    >
      {/* =================================================================== */}
      {/* FLOATING BOUNCE CARDS CONTAINER */}
      {/* =================================================================== */}
      <AnimatePresence>
        {isHovered && (
          <div className="absolute inset-x-0 top-0 pointer-events-none flex justify-center">
            {photos.map((photo, idx) => (
              <motion.div
                key={idx}
                // Starts collapsed inside the box
                initial={{ opacity: 0, scale: 0.15, y: 30, x: 0, rotate: 0 }}
                // Pops out with spring physics
                animate={{
                  opacity: 1,
                  scale: 1,
                  y: photo.y,
                  x: photo.x,
                  rotate: photo.rotate,
                  transition: {
                    type: "spring",
                    stiffness: 350,
                    damping: 21,
                    mass: 0.8,
                    delay: photo.delay,
                  },
                }}
                // Retracts smoothly back into the box
                exit={{
                  opacity: 0,
                  scale: 0.2,
                  y: 20,
                  x: 0,
                  rotate: 0,
                  transition: {
                    duration: 0.22,
                    ease: [0.32, 0, 0.67, 0],
                  },
                }}
                // Direct hover on card: straightens and zooms for inspection
                whileHover={{
                  scale: 1.15,
                  rotate: 0,
                  y: photo.y - 18,
                  zIndex: 60,
                  transition: { duration: 0.18 },
                }}
                className="absolute pointer-events-auto origin-bottom cursor-pointer"
              >
                <div
                  className={`w-32 sm:w-44 p-1.5 rounded-xl bg-zinc-950/95 border ${photo.borderColor} ${photo.shadowColor} backdrop-blur-md`}
                >
                  <div className="relative w-full h-22 sm:h-28 overflow-hidden rounded-lg bg-black/60">
                    <Image
                      src={photo.img}
                      alt={photo.alt}
                      fill
                      sizes="(max-width: 640px) 128px, 176px"
                      className="object-cover hover:scale-105 transition-transform duration-300"
                      priority
                    />
                  </div>
                  <div className="mt-1.5 px-1 pb-0.5 flex items-center justify-center text-center">
                    <span className={`text-[10px] sm:text-[11px] font-mono font-medium ${photo.textColor} tracking-tight truncate`}>
                      {photo.title}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* =================================================================== */}
      {/* TRIGGER CARD BODY */}
      {/* =================================================================== */}
      <div className="h-full p-6 bg-surface/90 backdrop-blur-sm rounded-[11px] group cursor-default flex flex-col justify-between relative overflow-visible border border-line">
        <div>
          <div className="flex items-center justify-between mb-4">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
              <Sparkles size={10} className="text-emerald-400 animate-pulse" />
              {badge || "Hover to inspect"}
            </span>
          </div>
          <h3 className="text-base text-ink font-medium mb-2 leading-snug tracking-tight">{title}</h3>
          <p className="text-xs text-ink-3 leading-relaxed font-light">{description}</p>
        </div>
      </div>
    </motion.div>
  );
}

export default BounceCardTrigger;
