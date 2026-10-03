"use client";

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import { en, Translations } from "./translations/en";
import { ta } from "./translations/ta";

export type Language = "en" | "ta";

const STORAGE_KEY = "app-language";

const translationDicts: Record<Language, Translations> = {
    en,
    ta,
};

const FALLBACK_LABELS: Record<string, string> = {
    "chat.newChat": "New Chat",
    "chat.searchChats": "Search Chats",
    "chat.welcome": "Welcome to RAG Uzhavan",
    "chat.welcomeSub": "Ask questions about crop diseases, fertilizers, weather, schemes, or mandi prices grounded in verified agricultural bulletins.",
    "chat.farmer": "Farmer",
    "chat.districtSupport": "District Advisory Support",
    "chat.jumpToLatest": "Jump to latest",
    "chat.send": "Send message",
    "chat.stop": "Stop generation",
    "chat.newLine": "New line",
    "chat.noPreviousChats": "No previous chats",
    "nav.graphExplorer": "Knowledge Graph",
    "nav.agriMap": "Agriculture Map",
    "nav.benchmark": "Benchmark",
    "nav.newChat": "New Consultation",
    "nav.searchChats": "Search chats",
    "nav.farmer": "Farmer",
    "map.activeMode": "Active Mode",
    "map.overview": "Overview",
    "map.rainfall": "Rainfall Status",
    "map.warnings": "Weather Warnings",
    "map.market": "Market Rates",
    "map.soil": "Soil Health",
    "map.india": "All India",
    "map.advisories": "Advisories",
    "map.provenance": "Provenance",
    "map.crops": "Crops",
    "map.districts": "Districts",
    "landing.appName": "RAG UZHAVAN",
    "landing.subtitle": "District Advisory Support",
    "landing.tagline": "Region-Aware Agrarian Intelligence",
    "landing.getStarted": "Get Started",
    "landing.viewBenchmark": "View Benchmark",
    "graph.knowledgeEntities": "Knowledge Entities",
    "graph.clearFilters": "Clear Filters",
    "graph.noMatchingRelationships": "No matching relationships found for active filters.",
    "common.na": "N/A",
    "common.retry": "Retry",
};

const KEY_ALIASES: Record<string, string> = {
    "chat.newChat": "nav.newChat",
    "chat.searchChats": "nav.searchChats",
    "nav.graphExplorer": "nav.knowledgeGraph",
    "nav.agriMap": "nav.agricultureMap",
    "nav.benchmark": "nav.evaluation",
    "chat.farmer": "nav.farmer",
    "landing.appName": "common.appName",
    "landing.subtitle": "common.appSubtitle",
    "landing.tagline": "common.appTagline",
    "map.overview": "map.views.overview",
    "map.rainfall": "map.views.rainfall",
    "map.warnings": "map.views.warnings",
    "map.market": "map.views.market",
    "map.soil": "map.views.soil",
};

function humanizeKey(key: string): string {
    const leaf = key.includes(".") ? key.split(".").pop() || key : key;
    return leaf
        .replace(/([A-Z])/g, " $1")
        .replace(/[-_]/g, " ")
        .replace(/^./, (s) => s.toUpperCase())
        .trim();
}

function resolveTranslation(
    dict: Record<string, unknown>,
    fallbackDict: Record<string, unknown>,
    key: string,
    fallbackText?: string
): string {
    // 1. Direct match in active dictionary
    let val = getNestedValue(dict, key);
    if (val) return val;

    // 2. Direct match in fallback dictionary (en)
    val = getNestedValue(fallbackDict, key);
    if (val) return val;

    // 3. Normalized alias lookup
    const canonicalKey = KEY_ALIASES[key];
    if (canonicalKey) {
        val = getNestedValue(dict, canonicalKey) || getNestedValue(fallbackDict, canonicalKey);
        if (val) return val;
    }

    // 4. Hardcoded curated fallbacks table
    if (FALLBACK_LABELS[key]) {
        return FALLBACK_LABELS[key];
    }
    if (canonicalKey && FALLBACK_LABELS[canonicalKey]) {
        return FALLBACK_LABELS[canonicalKey];
    }

    // 5. Explicit developer-provided fallbackText
    if (fallbackText && fallbackText.trim() && fallbackText !== key) {
        return fallbackText;
    }

    // 6. Safe humanizer - NEVER return raw dot-notation keys
    return humanizeKey(key);
}

export interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    toggleLanguage: () => void;
    t: (
        key: string,
        fallbackOrParams?: string | Record<string, string | number | unknown>,
        params?: Record<string, string | number | unknown>
    ) => string;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
    if (!obj || typeof obj !== "object") return undefined;
    const parts = path.split(".");
    let curr: unknown = obj;
    for (const p of parts) {
        if (curr == null || typeof curr !== "object") return undefined;
        curr = (curr as Record<string, unknown>)[p];
    }
    return typeof curr === "string" ? curr : undefined;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [language, setLanguageState] = useState<Language>(() => {
        if (typeof window !== "undefined") {
            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved === "en" || saved === "ta") return saved;
            } catch {
                // ignore
            }
        }
        return "en";
    });

    // Sync html lang attribute
    useEffect(() => {
        if (typeof document !== "undefined") {
            document.documentElement.lang = language;
        }
    }, [language]);

    // 2. Setter that persists to localStorage
    const setLanguage = useCallback((newLang: Language) => {
        setLanguageState(newLang);
        try {
            localStorage.setItem(STORAGE_KEY, newLang);
            document.documentElement.lang = newLang;
        } catch {
            // ignore
        }
    }, []);

    const toggleLanguage = useCallback(() => {
        setLanguageState((prev) => {
            const next = prev === "en" ? "ta" : "en";
            try {
                localStorage.setItem(STORAGE_KEY, next);
                document.documentElement.lang = next;
            } catch {
                // ignore
            }
            return next;
        });
    }, []);

    // 3. Multi-tier safe translation resolver
    const t = useCallback(
        (
            key: string,
            fallbackOrParams?: string | Record<string, unknown>,
            paramsArg?: Record<string, unknown>
        ): string => {
            const fallbackText = typeof fallbackOrParams === "string" ? fallbackOrParams : undefined;
            const params = typeof fallbackOrParams === "object" && fallbackOrParams !== null ? fallbackOrParams : paramsArg;

            const currentDict = translationDicts[language] || en;
            let str = resolveTranslation(currentDict, en, key, fallbackText);

            // Interpolate params if supplied e.g. {count}
            if (params) {
                str = str.replace(/\{(\w+)\}/g, (_, k) => {
                    return params[k] != null ? String(params[k]) : `{${k}}`;
                });
            }

            return str;
        },
        [language]
    );

    const value = useMemo(
        () => ({
            language,
            setLanguage,
            toggleLanguage,
            t,
        }),
        [language, setLanguage, toggleLanguage, t]
    );

    return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useTranslation() {
    const ctx = useContext(LanguageContext);
    if (!ctx) {
        // Safe fallback if used outside Provider
        return {
            language: "en" as Language,
            setLanguage: () => {},
            toggleLanguage: () => {},
            t: (
                key: string,
                fallbackOrParams?: string | Record<string, string | number>,
                paramsArg?: Record<string, string | number>
            ) => {
                const fallbackText = typeof fallbackOrParams === "string" ? fallbackOrParams : undefined;
                const params = typeof fallbackOrParams === "object" && fallbackOrParams !== null ? fallbackOrParams : paramsArg;

                let str = resolveTranslation(en, en, key, fallbackText);
                if (params) {
                    str = str.replace(/\{(\w+)\}/g, (_, k) => (params[k] != null ? String(params[k]) : `{${k}}`));
                }
                return str;
            },
        };
    }
    return ctx;
}
