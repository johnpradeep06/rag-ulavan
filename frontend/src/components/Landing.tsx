"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Sprout, MapPin, FileCheck2, ShieldOff, ArrowRight,
    MessageSquare, SlidersHorizontal, Gauge, ExternalLink,
    Shield, Wifi, WifiOff,
} from "lucide-react";
import BlurText from "@/components/primitives/BlurText";
import BounceCardTrigger, { type PhotoItem } from "@/components/primitives/BounceCardTrigger";
import GlobalCinematicBackground from "@/components/GlobalCinematicBackground";
import { useTranslation, LanguageToggle } from "@/i18n";

const IRRIGATION_PHOTOS: PhotoItem[] = [
    { img: "/images/irrigation_paddy.jpg",  alt: "Irrigation channel flow in paddy field",  title: "Canal Infiltration", borderColor: "border-emerald-500/40",  shadowColor: "shadow-[0_20px_45px_rgba(0,0,0,0.85),0_0_25px_rgba(16,185,129,0.25)]",  textColor: "text-emerald-300", x: -76, y: -138, rotate: -10, delay: 0.02 },
    { img: "/images/farm_hero_dawn.jpg",    alt: "Terraced water levels",                   title: "Paddy Submersion",  borderColor: "border-teal-500/40",     shadowColor: "shadow-[0_20px_45px_rgba(0,0,0,0.85),0_0_25px_rgba(20,184,166,0.25)]",  textColor: "text-teal-300",    x:   0, y: -152, rotate:   0, delay: 0.08 },
    { img: "/images/crop_inspection.jpg",   alt: "Soil moisture inspection",                title: "Moisture Sensor",  borderColor: "border-emerald-400/40",  shadowColor: "shadow-[0_20px_45px_rgba(0,0,0,0.85),0_0_25px_rgba(52,211,153,0.25)]",  textColor: "text-emerald-400", x:  76, y: -138, rotate:  10, delay: 0.14 },
];
const PEST_PHOTOS: PhotoItem[] = [
    { img: "/images/crop_inspection.jpg",   alt: "Foliar disease inspection",               title: "Leaf Blast ID",    borderColor: "border-amber-500/40",   shadowColor: "shadow-[0_20px_45px_rgba(0,0,0,0.85),0_0_25px_rgba(245,158,11,0.25)]",  textColor: "text-amber-300",  x: -76, y: -138, rotate: -10, delay: 0.02 },
    { img: "/images/farm_hero_dawn.jpg",    alt: "Canopy field assessment",                 title: "Stem Borer Risk",  borderColor: "border-orange-500/40",  shadowColor: "shadow-[0_20px_45px_rgba(0,0,0,0.85),0_0_25px_rgba(249,115,22,0.25)]",  textColor: "text-orange-300", x:   0, y: -152, rotate:   0, delay: 0.08 },
    { img: "/images/irrigation_paddy.jpg",  alt: "Organic neem spray regime",               title: "TNAU Protocol",   borderColor: "border-emerald-500/40",  shadowColor: "shadow-[0_20px_45px_rgba(0,0,0,0.85),0_0_25px_rgba(16,185,129,0.25)]",  textColor: "text-emerald-300", x: 76, y: -138, rotate:  10, delay: 0.14 },
];
const MANDI_PHOTOS: PhotoItem[] = [
    { img: "/images/mandi_produce.jpg",     alt: "Fresh harvest market produce",            title: "Tomato APMC",     borderColor: "border-rose-500/40",    shadowColor: "shadow-[0_20px_45px_rgba(0,0,0,0.85),0_0_25px_rgba(244,63,94,0.25)]",   textColor: "text-rose-300",   x: -76, y: -138, rotate: -10, delay: 0.02 },
    { img: "/images/mandi_produce.jpg",     alt: "Onion produce sorting",                   title: "Onion Modal Rate",borderColor: "border-amber-500/40",   shadowColor: "shadow-[0_20px_45px_rgba(0,0,0,0.85),0_0_25px_rgba(245,158,11,0.25)]",  textColor: "text-amber-300",  x:   0, y: -152, rotate:   0, delay: 0.08 },
    { img: "/images/crop_inspection.jpg",   alt: "Quality grading check",                   title: "Grade A Pricing", borderColor: "border-emerald-500/40",  shadowColor: "shadow-[0_20px_45px_rgba(0,0,0,0.85),0_0_25px_rgba(16,185,129,0.25)]",  textColor: "text-emerald-300", x: 76, y: -138, rotate:  10, delay: 0.14 },
];

export default function Landing() {
    const router = useRouter();
    const { t } = useTranslation();
    const [scrolled, setScrolled] = useState(false);
    const [online,   setOnline]   = useState(true);
    const [bw,       setBw]       = useState<"good" | "low">("good");
    const containerRef = useRef<HTMLDivElement>(null);

    // Sticky nav scroll detection (container-level since body overflow is hidden)
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const handler = () => setScrolled(el.scrollTop > 40);
        el.addEventListener("scroll", handler, { passive: true });
        return () => el.removeEventListener("scroll", handler);
    }, []);

    // Connection quality sniff
    useEffect(() => {
        const nav = navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number; addEventListener?: (evt: string, fn: () => void) => void; removeEventListener?: (evt: string, fn: () => void) => void } };
        const conn = nav.connection;
        if (conn) {
            const check = () => {
                const effectiveType = conn.effectiveType ?? "4g";
                const downlink = conn.downlink ?? 10;
                setBw(effectiveType === "2g" || effectiveType === "slow-2g" || downlink < 0.5 ? "low" : "good");
            };
            check();
            conn.addEventListener?.("change", check);
            return () => conn.removeEventListener?.("change", check);
        }
    }, []);

    return (
        <>
            {/* ── Global cinematic background (fixed, behind everything) ── */}
            <GlobalCinematicBackground />

            {/* ── Low-bandwidth blur indicator overlay ─────────────────── */}
            {bw === "low" && (
                <div className="pointer-events-none fixed inset-0 z-40"
                     style={{ backdropFilter: "blur(8px) brightness(0.7)", WebkitBackdropFilter: "blur(8px) brightness(0.7)" }}>
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-950/60 px-4 py-2 text-[11px] font-mono tracking-widest text-amber-300 uppercase backdrop-blur-lg">
                        <WifiOff size={12} />
                        LOW BANDWIDTH — Reduced Quality Mode
                    </div>
                </div>
            )}

            {/* ── Sticky nav bar ────────────────────────────────────────── */}
            <header
                className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3 transition-all duration-500"
                style={{
                    background:   scrolled ? "rgba(14,18,15,0.88)" : "transparent",
                    backdropFilter: scrolled ? "blur(20px)" : "none",
                    borderBottom: scrolled ? "1px solid rgba(255,255,255,0.07)" : "1px solid transparent",
                }}
            >
                {/* Brand */}
                <div className="flex items-center gap-2.5">
                    <span className="flex size-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                        <Sprout size={15} strokeWidth={2.2} />
                    </span>
                    <span className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/70">
                        RAG UZHAVAN<span className="text-emerald-400"> / உழவன்</span>
                    </span>
                </div>

                {/* Nav pills (visible when scrolled) */}
                <nav className={`hidden lg:flex items-center gap-1 transition-opacity duration-300 ${scrolled ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
                    {["COMMAND", "TELEMETRY", "WATER", "ALERTS", "REGIONAL", "RECS"].map((item) => (
                        <button key={item}
                            onClick={() => router.push("/")}
                            className="rounded-full px-3 py-1 text-[10.5px] font-mono tracking-widest text-white/50 uppercase transition-colors hover:bg-white/8 hover:text-white/90">
                            {item}
                        </button>
                    ))}
                </nav>

                {/* Right controls */}
                <div className="flex items-center gap-2">
                    {/* Live status pill */}
                    <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-mono tracking-widest uppercase transition-colors ${
                        online
                          ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-400"
                          : "border-red-500/30 bg-red-950/40 text-red-400"
                    }`}>
                        {online
                          ? <><Wifi size={10} /><span className="animate-live inline-block size-1.5 rounded-full bg-emerald-400" /> ONLINE</>
                          : <><WifiOff size={10} /> LINK ERROR</>}
                    </div>
                    <LanguageToggle />
                    <button onClick={() => router.push("/login")}
                        className="rounded-full border border-white/12 bg-white/5 px-3.5 py-1.5 text-[11.5px] font-medium text-white/70 backdrop-blur-sm transition-all hover:bg-white/10 hover:text-white">
                        {t("landing.signIn")}
                    </button>
                    <button onClick={() => router.push("/register")}
                        className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1.5 text-[11.5px] font-semibold text-white shadow-lg transition-all hover:bg-emerald-500 active:scale-[0.97]">
                        {t("landing.getStarted")} <ArrowRight size={13} />
                    </button>
                </div>
            </header>

            {/* ── Scrollable page container ─────────────────────────────── */}
            <div ref={containerRef} className="relative h-[100dvh] w-full overflow-y-auto overflow-x-hidden">

                {/* ══════════════════════════════════════════════════════
                    HERO SECTION — Full-viewport cinematic header
                ══════════════════════════════════════════════════════ */}
                <section className="relative flex h-[100dvh] min-h-[640px] flex-col overflow-hidden">

                    {/* Four-corner coordinate tags */}
                    {/* Top-left */}
                    <div className="absolute top-20 left-6 z-10 coord-tag text-white/55 leading-[1.8]">
                        RAGUZHAVAN FIELD INTELLIGENCE<br />
                        // COPYRIGHT © 2026<br />
                        NODE 01 · ESP32
                    </div>
                    {/* Top-right */}
                    <div className="absolute top-20 right-6 z-10 coord-tag text-right text-white/55 leading-[1.8]">
                        ////// COMMAND CENTER<br />
                        LIVE SENSOR TELEMETRY<br />
                        FROM YOUR FIELD NODE
                    </div>
                    {/* Bottom-right */}
                    <div className="absolute bottom-16 right-6 z-10 coord-tag text-right text-white/40 leading-[1.8]">
                        LAST PACKET: —<br />
                        <span className={online ? "text-emerald-400/70" : "text-red-400/70"}>
                            {online ? "● ONLINE" : "○ IDLE"}
                        </span>
                    </div>

                    {/* Central hero text */}
                    <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
                        {/* Live badge */}
                        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-black/30 px-4 py-1.5 backdrop-blur-md text-[10.5px] font-mono tracking-[0.2em] text-emerald-300 uppercase mb-10">
                            <span className="animate-live inline-block size-1.5 rounded-full bg-emerald-400" />
                            FIELD OPERATIONS · ACTIVE
                        </div>

                        {/* Giant editorial headline */}
                        <div className="space-y-2">
                            <BlurText
                                text="Grounded"
                                as="h1"
                                className="font-display editorial-title text-[64px] font-medium tracking-[-0.03em] text-white sm:text-[88px] md:text-[110px] leading-[0.95]"
                                delay={0.05}
                            />
                            <h2
                                className="font-display editorial-title text-[64px] font-semibold tracking-[-0.03em] sm:text-[88px] md:text-[110px] leading-[0.95] text-gradient-harvest"
                                style={{ fontStyle: "italic" }}
                            >
                                Intelligence.
                            </h2>
                        </div>

                        {/* Monospace subtitle */}
                        <p className="mt-8 font-mono text-[10px] tracking-[0.26em] text-white/45 uppercase">
                            DATA · EVIDENCE · LOCAL CONTEXT · BETTER DECISIONS
                        </p>

                        {/* CTA row */}
                        <div className="mt-12 flex flex-col items-center gap-3 sm:flex-row">
                            <button
                                onClick={() => router.push("/register")}
                                className="flex items-center gap-2 rounded-full bg-emerald-600 px-7 py-3 text-[13.5px] font-semibold text-white shadow-xl shadow-emerald-900/40 transition-all hover:bg-emerald-500 hover:shadow-emerald-800/50 active:scale-[0.98]"
                            >
                                {t("landing.startConsultation")}
                                <ArrowRight size={16} />
                            </button>
                            <button
                                onClick={() => router.push("/score")}
                                className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-[13.5px] font-medium text-white/70 backdrop-blur-sm transition-all hover:bg-white/10 hover:text-white"
                            >
                                {t("landing.viewBenchmark")}
                                <ExternalLink size={14} className="text-white/40" />
                            </button>
                        </div>
                    </div>

                    {/* Critical alert card — pinned above fold bottom */}
                    <div className="relative z-10 mx-auto mb-12 w-full max-w-md px-6">
                        <div className="alert-glass-critical flex items-start gap-3 p-4">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-red-400">
                                <Shield size={18} />
                            </div>
                            <div>
                                <p className="text-[9.5px] font-mono tracking-[0.22em] text-red-500 uppercase mb-0.5">CRITICAL</p>
                                <p className="text-[14px] font-semibold text-white leading-tight">SENSOR OFFLINE</p>
                                <p className="text-[12px] text-white/50 mt-0.5">No recent telemetry received from Field Node 01.</p>
                            </div>
                        </div>
                    </div>

                    {/* Scroll gradient at bottom */}
                    <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-[#080b09] to-transparent" />
                </section>

                {/* ══════════════════════════════════════════════════════
                    REST OF LANDING — dark canvas background sections
                ══════════════════════════════════════════════════════ */}
                <div className="relative bg-[#0a0e0b]">

                    {/* Precision Domains */}
                    <section className="mx-auto max-w-6xl px-6 py-24">
                        <div className="mb-12 text-center">
                            <p className="font-mono text-[10px] tracking-[0.25em] text-emerald-400 uppercase">PRECISION DOMAINS</p>
                            <h2 className="mt-3 text-[28px] font-medium tracking-tight text-white md:text-[36px]">
                                Hover to inspect localized intelligence
                            </h2>
                            <p className="mx-auto mt-2 max-w-xl text-[14px] text-white/40 font-light">
                                Explore how RAG Uzhavan retrieves and parses authenticated evidence for farmers.
                            </p>
                        </div>

                        <div className="grid gap-6 md:grid-cols-3 pt-28 overflow-visible">
                            <BounceCardTrigger badge="Water Dynamics" title="Region-First Irrigation"
                                description="Calculates water-layer depth, drainage intervals, and dry-spell contingency directly from district soil surveys and crop calendars."
                                photos={IRRIGATION_PHOTOS} gradient="from-emerald-500/20 via-teal-950/20 to-transparent"
                                onClick={() => router.push("/register")} />
                            <BounceCardTrigger badge="Pathology" title="Grounded Disease ID"
                                description="Identifies blast, blight, and stem borer with university-approved chemical dosages, biological antagonists, and spray safety windows."
                                photos={PEST_PHOTOS} gradient="from-amber-500/20 via-orange-950/20 to-transparent"
                                onClick={() => router.push("/register")} />
                            <BounceCardTrigger badge="Market Intel" title="Mandi Price Analytics"
                                description="Quotes daily APMC wholesale modal prices, commodity arrivals, and seasonal grade margins with explicit dates and markets."
                                photos={MANDI_PHOTOS} gradient="from-rose-500/20 via-emerald-950/20 to-transparent"
                                onClick={() => router.push("/register")} />
                        </div>
                    </section>

                    {/* Input Protocols */}
                    <section className="mx-auto max-w-6xl px-6 pb-24">
                        <div className="rounded-2xl border border-white/7 bg-white/3 p-8 shadow-2xl backdrop-blur-sm md:p-12">
                            <div className="max-w-2xl">
                                <span className="font-mono text-[10px] tracking-[0.25em] text-emerald-400 uppercase">INPUT PROTOCOLS</span>
                                <h2 className="mt-3 text-[26px] font-medium tracking-tight text-white md:text-[32px]">
                                    Designed for how farmers communicate
                                </h2>
                                <p className="mt-2 text-[14px] text-white/40 leading-relaxed font-light">
                                    Whether asking a direct question in voice/text, detailing field metrics, or streaming IoT telemetry.
                                </p>
                            </div>

                            <div className="mt-8 grid gap-4 md:grid-cols-3">
                                {[
                                    { icon: MessageSquare, color: "text-emerald-400", title: "Natural Dialogue",
                                      desc: "Ask plainly in colloquial language. Slot extraction identifies district and crop context to ground the response." },
                                    { icon: SlidersHorizontal, color: "text-amber-400", title: "Metrics Guided",
                                      desc: "Provide location, crop, growth stage, and season to produce a structured What to do / How much / Why advisory." },
                                    { icon: Gauge, color: "text-teal-400", title: "Sensor Ingestion",
                                      desc: "Input field water level, ambient temperature, and humidity to cross-reference with agronomic thresholds." },
                                ].map(({ icon: Icon, color, title, desc }) => (
                                    <div key={title} className="rounded-xl border border-white/8 bg-white/3 p-5 transition-colors hover:border-emerald-500/30">
                                        <div className={`flex items-center gap-2.5 text-[14px] font-medium text-white`}>
                                            <Icon size={17} className={color} /> <span>{title}</span>
                                        </div>
                                        <p className="mt-2.5 text-[13px] leading-relaxed text-white/40 font-light">{desc}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    {/* Evidence & Integrity */}
                    <section className="mx-auto max-w-6xl px-6 pb-24">
                        <div className="grid gap-4 sm:grid-cols-3">
                            {[
                                { icon: MapPin, color: "text-emerald-400", bg: "bg-emerald-500/10", title: "Region-First Boundary",
                                  desc: "Strict district-level filtering prevents recommendations meant for another geography from ever being served." },
                                { icon: FileCheck2, color: "text-emerald-400", bg: "bg-emerald-500/10", title: "Verbatim Numerics",
                                  desc: "Fertilizer dosages, sowing dates, spray dilutions, and prices are quoted verbatim from dated source passages." },
                                { icon: ShieldOff, color: "text-rose-400", bg: "bg-rose-500/10", title: "Refusal Gate",
                                  desc: "If no verified bulletin matches your district and crop, it states no current data rather than hallucinating." },
                            ].map(({ icon: Icon, color, bg, title, desc }) => (
                                <div key={title} className="rounded-xl border border-white/7 bg-white/3 p-6 backdrop-blur-sm">
                                    <span className={`flex size-8 items-center justify-center rounded-lg ${bg} ${color} mb-3`}>
                                        <Icon size={16} />
                                    </span>
                                    <h3 className="text-[14px] font-medium text-white">{title}</h3>
                                    <p className="mt-1.5 text-[13px] text-white/40 leading-relaxed font-light">{desc}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Footer */}
                    <footer className="border-t border-white/7 px-6 py-8 text-[12px] text-white/30">
                        <div className="mx-auto max-w-6xl flex flex-col items-center justify-between gap-4 sm:flex-row">
                            <div className="flex items-center gap-2">
                                <span className="size-2 rounded-full bg-emerald-500" />
                                <span className="font-mono text-[11px] tracking-wide text-white/40">
                                    RAG UZHAVAN · Agricultural Decision-Support System
                                </span>
                            </div>
                            <div className="flex items-center gap-6 text-white/30">
                                <button onClick={() => router.push("/score")} className="hover:text-white transition-colors">Benchmark</button>
                                <button onClick={() => router.push("/login")} className="hover:text-white transition-colors">Account</button>
                                <button onClick={() => router.push("/campus_admin")} className="hover:text-white transition-colors">Admin</button>
                            </div>
                        </div>
                    </footer>
                </div>
            </div>
        </>
    );
}
