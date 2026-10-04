"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Sprout, Radio } from "lucide-react";
import PageBackground from "@/components/primitives/PageBackground";
import FieldTelemetry from "@/components/FieldTelemetry";
import { useTranslation, LanguageToggle } from "@/i18n";

export default function FieldPage() {
    const router = useRouter();
    const { t } = useTranslation();
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (!localStorage.getItem("token")) router.push("/login");
        else setReady(true);
    }, [router]);

    if (!ready) return <div className="flex h-[100dvh] items-center justify-center bg-canvas text-ink-2">{t("common.loading")}</div>;

    return (
        <PageBackground variant="chat" className="custom-scrollbar flex h-[100dvh] w-full flex-col items-center overflow-y-auto font-sans">
            <div className="sticky top-0 z-50 flex w-full items-center justify-between border-b border-line/70 bg-page/80 px-4 py-2.5 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <button onClick={() => router.push("/")} className="rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-hover hover:text-ink" title={t("common.back")}>
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
                        <Radio size={14} className="text-emerald-400" />
                        {t("field.title", "Live Field")}
                    </span>
                </div>
                <LanguageToggle />
            </div>

            <div className="flex w-full flex-1 flex-col">
                <div className="mx-auto w-full max-w-3xl px-4 pt-6">
                    <h1 className="text-[20px] font-semibold tracking-tight text-ink">{t("field.title", "Live Field")}</h1>
                    <p className="mt-1 text-[13.5px] font-light text-ink-2">
                        {t("field.subtitle", "Real-time readings from the RagUzhavan control node on your local Wi-Fi.")}
                    </p>
                </div>
                <FieldTelemetry />
            </div>
        </PageBackground>
    );
}
