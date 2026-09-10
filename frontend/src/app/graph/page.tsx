"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Sprout, Waypoints } from "lucide-react";
import KnowledgeGraph from "@/components/KnowledgeGraph";
import PageBackground from "@/components/primitives/PageBackground";

export default function GraphPage() {
    const router = useRouter();
    const [ready, setReady] = useState(false);
    const [count, setCount] = useState<number | null>(null);

    useEffect(() => {
        if (!localStorage.getItem("token")) router.push("/login");
        else setReady(true);
    }, [router]);

    const onCount = useCallback((n: number) => setCount(n), []);

    if (!ready) {
        return <div className="flex h-[100dvh] items-center justify-center bg-canvas text-ink-2">Loading…</div>;
    }

    return (
        <PageBackground variant="graph" className="flex h-[100dvh] w-full flex-col overflow-hidden bg-canvas">
            <div className="flex shrink-0 items-center justify-between border-b border-line/70 bg-page/80 backdrop-blur-md px-4 py-2.5">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.back()}
                        className="rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-hover hover:text-ink"
                        title="Back"
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
                    <span className="flex items-center gap-1.5 text-[13px] text-ink-2 font-light">
                        <Waypoints size={14} className="text-emerald-400" />
                        Agronomic Knowledge Graph
                    </span>
                </div>
                {count != null && (
                    <span className="rounded-full border border-emerald-500/20 bg-emerald-950/20 px-3 py-1 font-mono text-[11px] text-emerald-300">
                        <span className="font-semibold text-emerald-400">{count}</span> indexed bulletin{count === 1 ? "" : "s"}
                    </span>
                )}
            </div>

            <div className="min-h-0 flex-1">
                <KnowledgeGraph onCount={onCount} />
            </div>
        </PageBackground>
    );
}
