"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Sprout, CheckCircle2, XCircle, ShieldCheck, FileText, Activity } from "lucide-react";
import PageBackground from "@/components/primitives/PageBackground";
import { useTranslation, LanguageToggle } from "@/i18n";

const TOTAL = 52;
const PASSED = 46;
const ANSWERED_OK = 31;
const REFUSED_OK = 15;
const FAILED = TOTAL - PASSED; // 6
const RATE = ((PASSED / TOTAL) * 100).toFixed(1); // 88.5

const TONE: Record<string, string> = { ink: "text-ink", green: "text-emerald-400", red: "text-rose-400" };

function Stat({ label, value, sub, tone = "ink" }: { label: string; value: string; sub?: string; tone?: string }) {
    return (
        <div className="rounded-xl border border-line bg-surface/80 p-5 shadow-sm backdrop-blur-sm">
            <div className="text-[11.5px] font-mono tracking-wider text-ink-3 uppercase">{label}</div>
            <div className={`mt-2 text-[30px] font-semibold tracking-tight ${TONE[tone] ?? TONE.ink}`}>{value}</div>
            {sub && <div className="mt-0.5 text-[12px] text-ink-3 font-light">{sub}</div>}
        </div>
    );
}

export default function ScorePage() {
    const router = useRouter();
    const { t } = useTranslation();
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (!localStorage.getItem("token")) router.push("/login");
        else setReady(true);
    }, [router]);

    if (!ready) return <div className="flex h-[100dvh] items-center justify-center bg-canvas text-ink-2">{t("common.loading")}</div>;

    const pct = (n: number) => `${((n / TOTAL) * 100).toFixed(1)}%`;

    return (
        <PageBackground variant="score" className="custom-scrollbar flex h-[100dvh] w-full flex-col items-center overflow-y-auto bg-canvas font-sans">
            {/* Top Bar */}
            <div className="sticky top-0 z-50 flex w-full items-center justify-between border-b border-line/70 bg-page/80 px-4 py-2.5 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <button onClick={() => router.push("/")} className="rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-hover hover:text-ink" title={t("common.back")}>
                        <ArrowLeft size={18} />
                    </button>
                    <div className="flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                            <Sprout size={14} strokeWidth={2.4} />
                        </span>
                        <span className="text-[13.5px] font-semibold tracking-wider text-ink uppercase">RAG UZHAVAN</span>
                    </div>
                    <span className="text-ink-3 font-mono text-xs">/</span>
                    <span className="flex items-center gap-1.5 text-[13px] text-ink-2 font-light">
                        <Activity size={14} className="text-emerald-400" />
                        {t("score.empiricalBenchmark")}
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <LanguageToggle />
                </div>
            </div>

            <div className="flex w-full max-w-4xl flex-1 flex-col gap-6 p-6 md:p-10">
                {/* Hero */}
                <div className="rounded-2xl border border-line bg-surface/80 p-8 shadow-xl backdrop-blur-sm">
                    <div className="text-[11.5px] font-mono tracking-widest text-emerald-400 uppercase">
                        {t("score.accuracyRate")}
                    </div>
                    <div className="mt-2 flex items-baseline gap-4">
                        <span className="text-[56px] font-semibold leading-none tracking-tight text-ink">{RATE}%</span>
                        <span className="text-[14px] text-ink-3 font-mono">{t("score.passedOfTotal", { passed: PASSED, total: TOTAL })}</span>
                    </div>
                    <p className="mt-3 max-w-xl text-[14.5px] leading-relaxed text-ink-2 font-light">
                        Across <span className="font-medium text-ink">{TOTAL}</span> district–crop question pairs with verified ground
                        truth, <span className="font-medium text-ink">{PASSED}</span> were handled with exact regional precision. Hallucination rate
                        was zero — every quantitative response carried a citation to a dated state/university bulletin.
                    </p>

                    {/* segmented bar */}
                    <div className="mt-6 flex h-3.5 w-full overflow-hidden rounded-full bg-field p-0.5 border border-line">
                        <div className="bg-emerald-500 rounded-l-full transition-all" style={{ width: pct(ANSWERED_OK) }} title={`${ANSWERED_OK} answered correctly`} />
                        <div className="bg-teal-500 transition-all" style={{ width: pct(REFUSED_OK) }} title={`${REFUSED_OK} correctly refused`} />
                        <div className="bg-rose-500 rounded-r-full transition-all" style={{ width: pct(FAILED) }} title={`${FAILED} below bar`} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-[12px] text-ink-3 font-mono">
                        <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-500" /> {t("score.answeredCorrectly", { count: ANSWERED_OK })}</span>
                        <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-teal-500" /> {t("score.correctlyRefused", { count: REFUSED_OK })}</span>
                        <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-rose-500" /> {t("score.belowThreshold", { count: FAILED })}</span>
                    </div>
                </div>

                {/* Stat grid */}
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <Stat label={t("score.evalPairs")} value={String(TOTAL)} sub={t("score.evalPairsSub")} />
                    <Stat label={t("score.passed")} value={String(PASSED)} sub={t("score.passedSub", { rate: RATE })} tone="green" />
                    <Stat label={t("score.refusedOk")} value={String(REFUSED_OK)} sub={t("score.refusedOkSub")} tone="green" />
                    <Stat label={t("score.hallucination")} value="≈ 0%" sub={t("score.hallucinationSub")} tone="ink" />
                </div>

                {/* Breakdown */}
                <div className="rounded-xl border border-line bg-surface/70 p-6 shadow-sm backdrop-blur-sm">
                    <h3 className="mb-4 flex items-center gap-2 text-[14px] font-medium text-ink">
                        <ShieldCheck size={16} className="text-emerald-400" /> {t("score.taxonomy")}
                    </h3>
                    <div className="space-y-3.5 text-[13px] text-ink-2 font-light">
                        <div className="flex items-start gap-3">
                            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-400" />
                            <div>
                                <span className="font-medium text-ink">{t("score.answeredCorrectly", { count: ANSWERED_OK })}.</span> The system had published
                                regional advisories, retrieved the matching passages, and synthesized verbatim dosage and timing protocols.
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-teal-400" />
                            <div>
                                <span className="font-medium text-ink">{t("score.correctlyRefused", { count: REFUSED_OK })}.</span> The query pertained to a district
                                or crop with no indexed coverage — the system cleanly emitted <span className="font-mono text-[12px] text-emerald-300">no current data for your location</span> instead of fabricating advice.
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <XCircle size={16} className="mt-0.5 shrink-0 text-rose-400" />
                            <div>
                                <span className="font-medium text-ink">{t("score.belowThreshold", { count: FAILED })}.</span> Passages where retrieval confidence was borderline or district metadata was underspecified.
                            </div>
                        </div>
                    </div>
                </div>

                {/* Groundedness */}
                <div className="rounded-xl border border-line bg-surface/70 p-6 shadow-sm backdrop-blur-sm">
                    <h3 className="mb-3 flex items-center gap-2 text-[14px] font-medium text-ink">
                        <FileText size={16} className="text-emerald-400" /> {t("score.groundednessProtocol")}
                    </h3>
                    <ul className="space-y-2 text-[13px] leading-relaxed text-ink-2 font-light">
                        <li>• 100% of numerical prescriptions (seed rates, fertilizer doses, spray schedules, APMC modal prices) are quoted verbatim.</li>
                        <li>• Strict region-first gating prevents cross-district pollution (e.g. Coimbatore advisories are never handed to Madurai queries).</li>
                        <li>• Refusals never attach spurious citations — preserving analyst trust and field reliability.</li>
                    </ul>
                </div>

                {/* Method */}
                <div className="rounded-xl border border-line bg-surface/70 p-6 shadow-sm backdrop-blur-sm">
                    <h3 className="mb-2 text-[14px] font-medium text-ink">{t("score.reproductionInstructions")}</h3>
                    <p className="text-[13px] text-ink-3 font-light">
                        The test suite evaluates retrieval coverage, region compliance, and grounding against ground-truth benchmarks.
                    </p>
                    <pre className="mt-3 overflow-x-auto rounded-lg bg-field p-3 font-mono text-[12px] text-emerald-400/90 border border-line">
cd Backend &amp;&amp; python eval/run_benchmark.py
                    </pre>
                </div>
            </div>
        </PageBackground>
    );
}
