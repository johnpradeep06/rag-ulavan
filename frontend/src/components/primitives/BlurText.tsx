"use client";

import { motion } from "framer-motion";

interface BlurTextProps {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
  as?: "h1" | "h2" | "h3" | "p" | "span";
}

export default function BlurText({
  text,
  className = "",
  delay = 0,
  stagger = 0.04,
  as: Component = "h1",
}: BlurTextProps) {
  const words = text.split(" ");

  return (
    <Component className={`inline-block ${className}`}>
      {words.map((word, index) => (
        <motion.span
          key={index}
          initial={{ opacity: 0, filter: "blur(8px)", y: 12 }}
          animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
          transition={{
            duration: 0.55,
            delay: delay + index * stagger,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          className="inline-block mr-[0.28em] last:mr-0 will-change-[transform,opacity,filter]"
        >
          {word}
        </motion.span>
      ))}
    </Component>
  );
}
