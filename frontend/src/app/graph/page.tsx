"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Sprout, Waypoints } from "lucide-react";
import KnowledgeGraph from "@/components/KnowledgeGraph";
import PageBackground from "@/components/primitives/PageBackground";
import { useTranslation, LanguageToggle } from "@/i18n";

export default function GraphPage() {
    const router = useRouter();
    const { t } = useTranslation();
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (!localStorage.getItem("token")) router.push("/login");
        else setReady(true);
    }, [router]);

    if (!ready) {
        return <div className="flex h-[100dvh] items-center justify-center bg-canvas text-ink-2">{t("common.loading")}</div>;
    }

    return (
        <PageBackground variant="graph" className="flex h-[100dvh] w-full flex-col overflow-hidden bg-canvas">
            <div className="flex shrink-0 items-center justify-between border-b border-line/70 bg-page/80 px-4 py-2.5 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.push("/")}
                        className="rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-hover hover:text-ink"
                        title={t("common.back")}
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div className="flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                            <Sprout size={14} strokeWidth={2.4} />
                        </span>
                        <span className="text-[13.5px] font-semibold uppercase tracking-wider text-ink">RAG UZHAVAN</span>
                    </div>
                    <span className="font-mono text-xs text-ink-3">/</span>
                    <span className="flex items-center gap-1.5 text-[13px] font-light text-ink-2">
                        <Waypoints size={14} className="text-emerald-400" />
                        {t("nav.graphExplorer")}
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <LanguageToggle />
                </div>
            </div>

            <div className="relative min-h-0 flex-1">
                <KnowledgeGraph />
            </div>
        </PageBackground>
    );
}
