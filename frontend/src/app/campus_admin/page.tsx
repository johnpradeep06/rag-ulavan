"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Sprout, Cpu, Filter, Layers, Waypoints } from "lucide-react";
import { API_ENDPOINTS } from "@/lib/api";
import type { KnowledgeSource } from "@/lib/ingestStream";
import IngestPanel from "@/components/admin/IngestPanel";
import SourceList from "@/components/admin/SourceList";
import GuardrailToggle from "@/components/admin/GuardrailToggle";
import PageBackground from "@/components/primitives/PageBackground";

export default function AdminPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [sources, setSources] = useState<KnowledgeSource[]>([]);

    const fetchSources = useCallback(async () => {
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(API_ENDPOINTS.sources, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) setSources(await res.json());
        } catch (error) {
            console.error("Failed to fetch sources", error);
        }
    }, []);

    useEffect(() => {
        const token = localStorage.getItem("token");
        const role = localStorage.getItem("role");
        if (!token || role !== "admin") {
            router.push("/");
        } else {
            setLoading(false);
            fetchSources();
        }
    }, [router, fetchSources]);

    if (loading) {
        return <div className="flex min-h-[100dvh] items-center justify-center bg-canvas text-ink-2">Loading admin…</div>;
    }

    const totalChunks = sources.reduce((n, s) => n + s.chunk_count, 0);

    return (
        <PageBackground variant="admin" className="custom-scrollbar flex h-[100dvh] w-full flex-col items-center overflow-y-auto bg-canvas font-sans">
            {/* Nav */}
            <div className="sticky top-0 z-50 flex w-full items-center justify-between border-b border-line/70 bg-page/80 px-4 py-2.5 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.push("/")}
                        className="rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-hover hover:text-ink"
                        title="Back to consultation"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div className="flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                            <Sprout size={14} strokeWidth={2.4} />
                        </span>
                        <span className="text-[13.5px] font-semibold tracking-wider text-ink uppercase">RAG UZHAVAN</span>
                    </div>
                    <span className="text-ink-3 font-mono text-xs">/</span>
                    <span className="text-[13px] text-ink-2 font-light">Corpus Operations</span>
                </div>
                <button
                    onClick={() => router.push("/graph")}
                    className="flex items-center gap-2 rounded-lg border border-line bg-surface/80 px-3 py-1.5 text-[12.5px] font-medium text-ink-2 shadow-sm backdrop-blur-sm transition-all hover:bg-hover hover:text-ink hover:border-emerald-500/40"
                >
                    <Waypoints size={14} className="text-emerald-400" />
                    Knowledge Graph
                </button>
            </div>

            {/* Content */}
            <div className="flex w-full max-w-5xl flex-1 flex-col gap-6 p-6 md:p-10">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="text-[24px] font-medium tracking-tight text-ink">Corpus Ingestion & Operations</h1>
                        <p className="mt-1 text-[13.5px] text-ink-3 font-light">
                            The agricultural knowledge base RAG Uzhavan retrieves from. Ingest university bulletins, district price sheets, and IoT feeds.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3.5 py-1.5 text-[12px] shadow-sm backdrop-blur-sm">
                        <Layers size={13} className="text-emerald-400" />
                        <span className="font-medium text-ink">{sources.length}</span>
                        <span className="text-ink-3">source{sources.length === 1 ? "" : "s"}</span>
                        {totalChunks > 0 && (
                            <span className="font-mono text-[11px] text-emerald-400/80">· {totalChunks.toLocaleString()} chunks</span>
                        )}
                    </div>
                </div>

                <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="flex flex-col gap-6 lg:col-span-2">
                        <IngestPanel onIngested={() => fetchSources()} />
                        <SourceList sources={sources} onChanged={fetchSources} />
                    </div>

                    <div className="flex flex-col gap-6">
                        <GuardrailToggle />

                        <div className="rounded-xl border border-line bg-surface/80 p-5 shadow-sm backdrop-blur-sm">
                            <h3 className="mb-4 flex items-center gap-2 text-[13.5px] font-medium text-ink">
                                <Cpu size={15} className="text-emerald-400" />
                                Agronomic Pipeline Status
                            </h3>
                            <div className="space-y-3 text-[13px] font-light">
                                <div className="flex items-center justify-between">
                                    <span className="text-ink-3">Vector Database</span>
                                    <span className="flex items-center gap-1.5 font-medium text-emerald-400 font-mono text-xs">
                                        <span className="inline-block size-1.5 rounded-full bg-emerald-400 animate-pulse" /> ChromaDB (3072-dim)
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-ink-3">Embeddings Model</span>
                                    <span className="font-mono text-[12px] text-ink-2">gemini-embedding-001</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-ink-3">Relevance Floor</span>
                                    <span className="font-mono text-[12px] text-ink-2">≥ 0.05</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-ink-3">Groundedness Gate</span>
                                    <span className="font-mono text-[12px] text-emerald-400">Strict Refusal</span>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-xl border border-line bg-surface/80 p-5 shadow-sm backdrop-blur-sm">
                            <h3 className="mb-3 flex items-center gap-2 text-[13.5px] font-medium text-ink">
                                <Filter size={15} className="text-amber-400" />
                                Regional Metadata Notice
                            </h3>
                            <p className="text-[12.5px] leading-relaxed text-ink-3 font-light">
                                Ingested files automatically extract or inherit district tags (<code className="font-mono text-[11px] text-emerald-300">district: "coimbatore"</code>). 
                                Retrieval will only serve passages matching the farmer's queried district.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </PageBackground>
    );
}
