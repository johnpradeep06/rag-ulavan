"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import {
    Sprout, MapPin, FileCheck2, ShieldOff, ArrowRight, MessageSquare,
    SlidersHorizontal, Gauge, Sparkles, ExternalLink,
} from "lucide-react";
import BlurText from "@/components/primitives/BlurText";
import PageBackground from "@/components/primitives/PageBackground";
import BounceCardTrigger, { type PhotoItem } from "@/components/primitives/BounceCardTrigger";

const IRRIGATION_PHOTOS: PhotoItem[] = [
    {
        img: "/images/irrigation_paddy.jpg",
        alt: "Irrigation channel flow in paddy field",
        title: "Canal Infiltration",
        borderColor: "border-emerald-500/40",
        shadowColor: "shadow-[0_20px_45px_rgba(0,0,0,0.85),0_0_25px_rgba(16,185,129,0.25)]",
        textColor: "text-emerald-300",
        x: -76,
        y: -138,
        rotate: -10,
        delay: 0.02,
    },
    {
        img: "/images/farm_hero_dawn.jpg",
        alt: "Terraced water levels",
        title: "Paddy Submersion",
        borderColor: "border-teal-500/40",
        shadowColor: "shadow-[0_20px_45px_rgba(0,0,0,0.85),0_0_25px_rgba(20,184,166,0.25)]",
        textColor: "text-teal-300",
        x: 0,
        y: -152,
        rotate: 0,
        delay: 0.08,
    },
    {
        img: "/images/crop_inspection.jpg",
        alt: "Soil moisture inspection",
        title: "Moisture Sensor",
        borderColor: "border-emerald-400/40",
        shadowColor: "shadow-[0_20px_45px_rgba(0,0,0,0.85),0_0_25px_rgba(52,211,153,0.25)]",
        textColor: "text-emerald-400",
        x: 76,
        y: -138,
        rotate: 10,
        delay: 0.14,
    },
];

const PEST_PHOTOS: PhotoItem[] = [
    {
        img: "/images/crop_inspection.jpg",
        alt: "Foliar disease inspection",
        title: "Leaf Blast ID",
        borderColor: "border-amber-500/40",
        shadowColor: "shadow-[0_20px_45px_rgba(0,0,0,0.85),0_0_25px_rgba(245,158,11,0.25)]",
        textColor: "text-amber-300",
        x: -76,
        y: -138,
        rotate: -10,
        delay: 0.02,
    },
    {
        img: "/images/farm_hero_dawn.jpg",
        alt: "Canopy field assessment",
        title: "Stem Borer Risk",
        borderColor: "border-orange-500/40",
        shadowColor: "shadow-[0_20px_45px_rgba(0,0,0,0.85),0_0_25px_rgba(249,115,22,0.25)]",
        textColor: "text-orange-300",
        x: 0,
        y: -152,
        rotate: 0,
        delay: 0.08,
    },
    {
        img: "/images/irrigation_paddy.jpg",
        alt: "Organic neem spray regime",
        title: "TNAU Protocol",
        borderColor: "border-emerald-500/40",
        shadowColor: "shadow-[0_20px_45px_rgba(0,0,0,0.85),0_0_25px_rgba(16,185,129,0.25)]",
        textColor: "text-emerald-300",
        x: 76,
        y: -138,
        rotate: 10,
        delay: 0.14,
    },
];

const MANDI_PHOTOS: PhotoItem[] = [
    {
        img: "/images/mandi_produce.jpg",
        alt: "Fresh harvest market produce",
        title: "Tomato APMC",
        borderColor: "border-rose-500/40",
        shadowColor: "shadow-[0_20px_45px_rgba(0,0,0,0.85),0_0_25px_rgba(244,63,94,0.25)]",
        textColor: "text-rose-300",
        x: -76,
        y: -138,
        rotate: -10,
        delay: 0.02,
    },
    {
        img: "/images/mandi_produce.jpg",
        alt: "Onion produce sorting",
        title: "Onion Modal Rate",
        borderColor: "border-amber-500/40",
        shadowColor: "shadow-[0_20px_45px_rgba(0,0,0,0.85),0_0_25px_rgba(245,158,11,0.25)]",
        textColor: "text-amber-300",
        x: 0,
        y: -152,
        rotate: 0,
        delay: 0.08,
    },
    {
        img: "/images/crop_inspection.jpg",
        alt: "Quality grading check",
        title: "Grade A Pricing",
        borderColor: "border-emerald-500/40",
        shadowColor: "shadow-[0_20px_45px_rgba(0,0,0,0.85),0_0_25px_rgba(16,185,129,0.25)]",
        textColor: "text-emerald-300",
        x: 76,
        y: -138,
        rotate: 10,
        delay: 0.14,
    },
];

export default function Landing() {
    const router = useRouter();

    return (
        <PageBackground variant="landing" className="h-[100dvh] overflow-y-auto text-ink">
            <div className="mx-auto flex min-h-full max-w-6xl flex-col px-6 py-6 sm:px-8">
                {/* Refined Authorial Navigation (No AI Badge Cliché) */}
                <header className="flex items-center justify-between border-b border-line/60 pb-5">
                    <div className="flex items-center gap-3">
                        <span className="flex size-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-sm">
                            <Sprout size={18} strokeWidth={2.2} />
                        </span>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-[15px] font-semibold tracking-wider text-ink uppercase">
                                    RAG UZHAVAN
                                </span>
                                <span className="font-mono text-[10px] text-emerald-400/80 uppercase">
                                    / உழவன்
                                </span>
                            </div>
                            <p className="text-[11px] text-ink-3 font-mono tracking-tight">
                                Region-Aware Agrarian Intelligence
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => router.push("/login")}
                            className="rounded-control border border-line bg-surface/80 px-4 py-2 text-[13px] font-medium text-ink-2 backdrop-blur-sm transition-all hover:bg-hover hover:text-ink hover:border-line-strong"
                        >
                            Sign In
                        </button>
                        <button
                            onClick={() => router.push("/register")}
                            className="flex items-center gap-2 rounded-control bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-emerald-500 active:scale-[0.98]"
                        >
                            Get Started
                            <ArrowRight size={14} />
                        </button>
                    </div>
                </header>

                {/* Hero Section */}
                <section className="pt-16 pb-20 md:pt-24 md:pb-28">
                    <div className="mx-auto max-w-4xl text-center">
                        {/* Status Label */}
                        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-950/20 px-3.5 py-1 text-[11.5px] font-mono tracking-wide text-emerald-300 backdrop-blur-sm">
                            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            OFFICIAL REGIONAL DATA · TAMIL NADU & DISTRICT ADVISORIES · ZERO GUESSWORK
                        </div>

                        {/* Editorial Headline */}
                        <div className="mt-8">
                            <BlurText
                                text="Local answers for the farm, grounded in regional science."
                                as="h1"
                                className="editorial-title text-[38px] font-medium tracking-tight text-ink sm:text-[54px] md:text-[62px]"
                                delay={0.1}
                            />
                        </div>

                        {/* Editorial Subhead */}
                        <p className="mx-auto mt-6 max-w-2xl text-[15.5px] leading-relaxed text-ink-2 md:text-[17.5px] font-light">
                            Irrigation intervals, foliar disease management, sowing calendars, and mandi commodity prices — 
                            answered strictly from university research bulletins indexed for <strong className="font-medium text-ink">your district</strong>.
                            When reliable local evidence is absent, it refuses to guess.
                        </p>

                        {/* CTA Buttons */}
                        <div className="mt-10 flex flex-col items-center justify-center gap-3.5 sm:flex-row">
                            <button
                                onClick={() => router.push("/register")}
                                className="flex w-full items-center justify-center gap-2.5 rounded-control bg-emerald-600 px-6 py-3.5 text-[14.5px] font-medium text-white shadow-lg transition-all hover:bg-emerald-500 sm:w-auto active:scale-[0.98]"
                            >
                                Start Agronomic Consultation
                                <ArrowRight size={16} />
                            </button>
                            <button
                                onClick={() => router.push("/score")}
                                className="flex w-full items-center justify-center gap-2 rounded-control border border-line bg-surface/70 px-5 py-3.5 text-[14px] font-medium text-ink-2 backdrop-blur-sm transition-all hover:bg-hover hover:text-ink hover:border-line-strong sm:w-auto"
                            >
                                View 52-Test Benchmark
                                <ExternalLink size={14} className="text-ink-3" />
                            </button>
                        </div>
                    </div>

                    {/* Cinematic Farm Image Framing */}
                    <div className="mx-auto mt-16 max-w-5xl">
                        <div className="relative rounded-2xl border border-line bg-surface/60 p-2.5 shadow-2xl backdrop-blur-md">
                            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-black/40">
                                <Image
                                    src="/images/farm_hero_dawn.jpg"
                                    alt="RAG Uzhavan Agricultural Landscape"
                                    fill
                                    priority
                                    className="object-cover"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
                                
                                {/* Overlay Telemetry Badge */}
                                <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-2 text-[12px] font-mono text-white/90">
                                    <div className="flex items-center gap-2 rounded-lg bg-black/60 px-3 py-1.5 backdrop-blur-md border border-white/10">
                                        <MapPin size={13} className="text-emerald-400" />
                                        <span>Regional Filter: Active (District-Scoped)</span>
                                    </div>
                                    <div className="flex items-center gap-2 rounded-lg bg-black/60 px-3 py-1.5 backdrop-blur-md border border-white/10">
                                        <FileCheck2 size={13} className="text-emerald-400" />
                                        <span>Citations: TNAU / ICAR / IMD Agromet</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Interactive Spring-Physics Fanned Card Pop-Up Showcase */}
                <section className="pb-24">
                    <div className="mb-10 text-center">
                        <p className="text-[11px] font-mono tracking-widest text-emerald-400 uppercase">
                            PRECISION DOMAINS
                        </p>
                        <h2 className="mt-2 text-[26px] font-medium tracking-tight text-ink md:text-[32px]">
                            Hover to inspect localized intelligence
                        </h2>
                        <p className="mx-auto mt-2 max-w-xl text-[14px] text-ink-3 font-light">
                            Explore how RAG Uzhavan retrieves and parses authenticated evidence for farmers.
                        </p>
                    </div>

                    <div className="grid gap-6 md:grid-cols-3 pt-28 overflow-visible">
                        <BounceCardTrigger
                            badge="Water Dynamics"
                            title="Region-First Irrigation"
                            description="Calculates water-layer depth, drainage intervals, and dry-spell contingency directly from district soil surveys and crop calendars."
                            photos={IRRIGATION_PHOTOS}
                            gradient="from-emerald-500/20 via-teal-950/20 to-transparent"
                            onClick={() => router.push("/register")}
                        />

                        <BounceCardTrigger
                            badge="Pathology"
                            title="Grounded Disease ID"
                            description="Identifies blast, blight, and stem borer with university-approved chemical dosages, biological antagonists, and spray safety windows."
                            photos={PEST_PHOTOS}
                            gradient="from-amber-500/20 via-orange-950/20 to-transparent"
                            onClick={() => router.push("/register")}
                        />

                        <BounceCardTrigger
                            badge="Market Intel"
                            title="Mandi Price Analytics"
                            description="Quotes daily APMC wholesale modal prices, commodity arrivals, and seasonal grade margins with explicit dates and markets."
                            photos={MANDI_PHOTOS}
                            gradient="from-rose-500/20 via-emerald-950/20 to-transparent"
                            onClick={() => router.push("/register")}
                        />
                    </div>
                </section>

                {/* System Architecture: Three Ways to Ask */}
                <section className="pb-24">
                    <div className="rounded-2xl border border-line bg-surface/70 p-8 shadow-xl backdrop-blur-sm md:p-12">
                        <div className="max-w-2xl">
                            <span className="text-[11px] font-mono tracking-widest text-emerald-400 uppercase">
                                INPUT PROTOCOLS
                            </span>
                            <h2 className="mt-2 text-[24px] font-medium tracking-tight text-ink md:text-[30px]">
                                Designed for how farmers communicate
                            </h2>
                            <p className="mt-2 text-[14px] text-ink-3 leading-relaxed font-light">
                                Whether asking a direct question in voice/text, detailing field metrics, or streaming IoT telemetry.
                            </p>
                        </div>

                        <div className="mt-8 grid gap-4 md:grid-cols-3">
                            <div className="rounded-xl border border-line bg-field/60 p-5 transition-colors hover:border-emerald-500/40">
                                <div className="flex items-center gap-2.5 text-[14.5px] font-medium text-ink">
                                    <MessageSquare size={17} className="text-emerald-400" />
                                    <span>Natural Dialogue</span>
                                </div>
                                <p className="mt-2.5 text-[13px] leading-relaxed text-ink-3 font-light">
                                    Ask plainly in colloquial language. Slot extraction identifies district and crop context to ground the response.
                                </p>
                            </div>

                            <div className="rounded-xl border border-line bg-field/60 p-5 transition-colors hover:border-emerald-500/40">
                                <div className="flex items-center gap-2.5 text-[14.5px] font-medium text-ink">
                                    <SlidersHorizontal size={17} className="text-amber-400" />
                                    <span>Metrics Guided</span>
                                </div>
                                <p className="mt-2.5 text-[13px] leading-relaxed text-ink-3 font-light">
                                    Provide location, crop, growth stage, and season to produce a structured <strong className="font-normal text-ink">What to do / How much / Why</strong> advisory.
                                </p>
                            </div>

                            <div className="rounded-xl border border-line bg-field/60 p-5 transition-colors hover:border-emerald-500/40">
                                <div className="flex items-center gap-2.5 text-[14.5px] font-medium text-ink">
                                    <Gauge size={17} className="text-teal-400" />
                                    <span>Sensor Ingestion</span>
                                </div>
                                <p className="mt-2.5 text-[13px] leading-relaxed text-ink-3 font-light">
                                    Input field water level, ambient temperature, and humidity to cross-reference with agronomic thresholds.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Evidence & Integrity Banner */}
                <section className="pb-24">
                    <div className="grid gap-4 sm:grid-cols-3">
                        <div className="rounded-xl border border-line bg-surface/50 p-6 backdrop-blur-sm">
                            <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 mb-3">
                                <MapPin size={16} />
                            </span>
                            <h3 className="text-[14.5px] font-medium text-ink">Region-First Boundary</h3>
                            <p className="mt-1.5 text-[13px] text-ink-3 leading-relaxed font-light">
                                Strict district-level filtering prevents recommendations meant for another geography from ever being served.
                            </p>
                        </div>

                        <div className="rounded-xl border border-line bg-surface/50 p-6 backdrop-blur-sm">
                            <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 mb-3">
                                <FileCheck2 size={16} />
                            </span>
                            <h3 className="text-[14.5px] font-medium text-ink">Verbatim Numerics</h3>
                            <p className="mt-1.5 text-[13px] text-ink-3 leading-relaxed font-light">
                                Fertilizer dosages, sowing dates, spray dilutions, and prices are quoted verbatim from dated source passages.
                            </p>
                        </div>

                        <div className="rounded-xl border border-line bg-surface/50 p-6 backdrop-blur-sm">
                            <span className="flex size-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400 mb-3">
                                <ShieldOff size={16} />
                            </span>
                            <h3 className="text-[14.5px] font-medium text-ink">Refusal Gate</h3>
                            <p className="mt-1.5 text-[13px] text-ink-3 leading-relaxed font-light">
                                If no verified bulletin matches your district and crop, it states <span className="font-mono text-xs text-rose-300">no current data</span> rather than hallucinating.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Editorial Footer */}
                <footer className="mt-auto border-t border-line/60 pt-8 pb-10 text-[12.5px] text-ink-3">
                    <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
                        <div className="flex items-center gap-2">
                            <span className="size-2 rounded-full bg-emerald-500" />
                            <span className="font-mono text-[11.5px] tracking-wide text-ink-2">
                                RAG UZHAVAN · Agricultural Decision-Support System
                            </span>
                        </div>
                        <div className="flex items-center gap-6 text-ink-3">
                            <button onClick={() => router.push("/score")} className="hover:text-ink transition-colors">
                                Benchmark
                            </button>
                            <button onClick={() => router.push("/login")} className="hover:text-ink transition-colors">
                                Account
                            </button>
                            <button onClick={() => router.push("/campus_admin")} className="hover:text-ink transition-colors">
                                Admin
                            </button>
                        </div>
                    </div>
                </footer>
            </div>
        </PageBackground>
    );
}
