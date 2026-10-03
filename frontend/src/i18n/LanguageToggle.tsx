"use client";

import React from "react";
import { useTranslation } from "./LanguageContext";
import { Languages } from "lucide-react";

interface LanguageToggleProps {
    className?: string;
    showIcon?: boolean;
}

export default function LanguageToggle({ className = "", showIcon = true }: LanguageToggleProps) {
    const { language, setLanguage } = useTranslation();

    return (
        <div
            className={`inline-flex items-center gap-0.5 rounded-lg border border-line/80 bg-surface/90 p-0.5 shadow-sm backdrop-blur-md transition-all ${className}`}
            role="group"
            aria-label="Language Selector / மொழி தேர்வு"
        >
            {showIcon && (
                <span className="flex size-5 items-center justify-center text-ink-3 pl-1 pr-0.5">
                    <Languages size={12} className="text-emerald-400/90" />
                </span>
            )}

            <button
                type="button"
                onClick={() => setLanguage("en")}
                className={`rounded-[5px] px-2 py-0.5 text-[11px] font-semibold transition-all ${
                    language === "en"
                        ? "border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 shadow-xs"
                        : "text-ink-3 hover:bg-hover hover:text-ink"
                }`}
                aria-label="Switch to English"
                aria-pressed={language === "en"}
            >
                EN
            </button>

            <span className="text-ink-4 text-[10px] select-none font-mono px-0.5 opacity-40">|</span>

            <button
                type="button"
                onClick={() => setLanguage("ta")}
                className={`rounded-[5px] px-2 py-0.5 text-[11px] font-semibold transition-all ${
                    language === "ta"
                        ? "border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 shadow-xs"
                        : "text-ink-3 hover:bg-hover hover:text-ink"
                }`}
                aria-label="தமிழுக்கு மாறவும்"
                aria-pressed={language === "ta"}
            >
                தமிழ்
            </button>
        </div>
    );
}
