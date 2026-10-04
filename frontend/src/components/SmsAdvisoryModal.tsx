"use client";

import { useState, useEffect, useRef } from "react";
import { Smartphone, CheckCircle2, AlertCircle, Loader2, X, ArrowRight } from "lucide-react";
import { useTranslation } from "@/i18n";
import { API_ENDPOINTS } from "@/lib/api";

interface SmsAdvisoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    defaultText: string;
    defaultPhone?: string | null;
    onSuccess?: (result: SmsResult) => void;
}

export interface SmsResult {
    success: boolean;
    sid: string;
    recipient: string;
    message_body: string;
    full_formatted_message?: string;
    whatsapp_url?: string;
    wa_me_url?: string;
    word_count: number;
    payload_bytes: number;
    payload_size_kb: number;
    latency_seconds: number;
    latency_ms: number;
    channel: string;
    meets_latency_criteria: boolean;
    meets_bandwidth_criteria: boolean;
    mode: string;
    details?: string;
}

/** Clean raw markdown to clean readable text for WhatsApp while preserving the entire message. */
function cleanMessage(raw: string): string {
    if (!raw) return "";
    return raw
        .replace(/```[\s\S]*?```/g, "")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, "$1: $2")
        .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

export default function SmsAdvisoryModal({
    isOpen,
    onClose,
    defaultText,
    defaultPhone,
    onSuccess,
}: SmsAdvisoryModalProps) {
    const { t } = useTranslation();
    const [phone, setPhone] = useState(defaultPhone || "");
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<SmsResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const autoSentRef = useRef(false);

    const fullText = cleanMessage(defaultText);

    // Sync phone from profile
    useEffect(() => {
        if (defaultPhone) setPhone(defaultPhone);
    }, [defaultPhone]);

    // Auto-send when modal opens and we already have a profile phone
    useEffect(() => {
        if (!isOpen) {
            autoSentRef.current = false;
            setResult(null);
            setError(null);
            return;
        }
        if (defaultPhone && fullText && !autoSentRef.current) {
            autoSentRef.current = true;
            doSend(defaultPhone, fullText);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const doSend = async (targetPhone: string, targetText: string) => {
        setError(null);
        setSending(true);
        try {
            const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
            const res = await fetch(API_ENDPOINTS.sendSmsAdvisory, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ text: targetText, phone: targetPhone }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Failed to dispatch advisory.");

            setResult(data);
            if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("profile-updated", { detail: { phone: targetPhone } }));
                if (data.whatsapp_url) window.open(data.whatsapp_url, "_blank");
            }
            if (onSuccess) onSuccess(data);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to dispatch advisory.");
        } finally {
            setSending(false);
        }
    };

    const handleManualSend = () => {
        if (!phone.trim()) {
            setError(t("sms.noPhone", "Please enter a valid mobile number or update your profile."));
            return;
        }
        if (!fullText) {
            setError("Advisory text is empty.");
            return;
        }
        doSend(phone.trim(), fullText);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="relative w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-overlay text-ink"
                style={{ animation: "scale-up 200ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
            >
                {/* Header */}
                <div className="flex items-start justify-between pb-3 border-b border-line">
                    <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
                            <Smartphone size={20} />
                        </div>
                        <div>
                            <h3 className="text-[15px] font-semibold tracking-tight text-ink">
                                {t("sms.title", "WhatsApp Advisory")}
                            </h3>
                            <p className="text-[11.5px] text-ink-3">
                                {sending
                                    ? t("sms.sending", "Dispatching to WhatsApp…")
                                    : t("sms.subtitle", "Dispatch critical advisory directly to farmer's WhatsApp")}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-ink-3 hover:bg-hover hover:text-ink transition-colors"
                        title={t("sms.close", "Close")}
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Sending spinner (auto-send in progress) */}
                {sending && (
                    <div className="mt-6 flex flex-col items-center gap-3 py-4">
                        <Loader2 size={32} className="animate-spin text-emerald-400" />
                        <p className="text-[13px] text-ink-2">
                            Opening WhatsApp for <span className="font-mono font-semibold text-emerald-400">{phone}</span>…
                        </p>
                        <p className="text-[11px] text-ink-3 text-center max-w-xs line-clamp-3">
                            &ldquo;{fullText}&rdquo;
                        </p>
                    </div>
                )}

                {/* Success state */}
                {!sending && result && (
                    <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                        <div className="flex items-center gap-2 text-emerald-400 font-semibold text-[14px]">
                            <CheckCircle2 size={18} />
                            {t("sms.delivered", "Advisory Dispatched to WhatsApp")}
                        </div>

                        <div className="mt-3 space-y-1.5 text-[12px] text-ink-2">
                            <div className="flex justify-between border-b border-white/5 pb-1">
                                <span className="text-ink-3">Sent to:</span>
                                <span className="font-mono font-semibold text-emerald-400">{result.recipient}</span>
                            </div>
                            <div className="flex justify-between border-b border-white/5 pb-1">
                                <span className="text-ink-3">Message:</span>
                                <span className="text-[11.5px] text-ink max-w-[240px] text-right truncate">&ldquo;{result.message_body}&rdquo;</span>
                            </div>
                            <div className="flex justify-between border-b border-white/5 pb-1">
                                <span className="text-ink-3">Words:</span>
                                <span className="font-mono text-ink">{result.word_count} words</span>
                            </div>
                            <div className="flex justify-between border-b border-white/5 pb-1">
                                <span className="text-ink-3">Payload:</span>
                                <span className="font-mono text-cyan-400">{result.payload_size_kb} KB</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-ink-3">Latency:</span>
                                <span className="font-mono text-emerald-400">{result.latency_seconds}s</span>
                            </div>
                        </div>

                        <p className="mt-3 text-[11px] text-emerald-300 leading-relaxed">
                            ✓ Phone <span className="font-mono">{result.recipient}</span> saved to your farmer profile. WhatsApp opened with the full advisory pre-filled.
                        </p>

                        <div className="mt-4 flex items-center justify-end gap-2">
                            {result.whatsapp_url && (
                                <a
                                    href={result.whatsapp_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3.5 py-1.5 text-[12.5px] font-semibold text-white shadow transition-all"
                                >
                                    <span>Open WhatsApp</span>
                                    <ArrowRight size={13} />
                                </a>
                            )}
                            <button
                                onClick={onClose}
                                className="rounded-lg border border-line px-3.5 py-1.5 text-[12.5px] font-medium text-ink-2 hover:bg-hover transition-colors"
                            >
                                {t("sms.close", "Close")}
                            </button>
                        </div>
                    </div>
                )}

                {/* Fallback manual form (only shown if no profile phone yet) */}
                {!sending && !result && (
                    <div className="mt-4 space-y-3.5">
                        {/* Full message preview */}
                        <div className="rounded-xl border border-line bg-field p-3 text-[12.5px] text-ink leading-relaxed">
                            <span className="text-[10.5px] font-medium text-ink-3 uppercase tracking-wide">Advisory message to send</span>
                            <p className="mt-1 font-medium max-h-36 overflow-y-auto whitespace-pre-wrap">&ldquo;{fullText || "—"}&rdquo;</p>
                        </div>

                        {/* Phone number */}
                        <div>
                            <label className="block text-[12px] font-medium text-ink-2 mb-1">
                                {t("sms.recipient", "Recipient Mobile Number")}
                            </label>
                            <div className="relative flex items-center">
                                <span className="absolute left-3 text-ink-3 text-[13px]">
                                    <Smartphone size={15} />
                                </span>
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder={t("sms.phonePlaceholder", "e.g. +91 9444542079")}
                                    className="w-full rounded-xl border border-line bg-field pl-9 pr-3 py-2 text-[13px] text-ink placeholder:text-ink-3 focus:outline-none focus:border-emerald-500/50"
                                />
                            </div>
                            <p className="mt-1 text-[11px] text-ink-3">
                                💡 Set your number once in Profile → it will auto-send next time.
                            </p>
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-2.5 text-[12px] text-red-400">
                                <AlertCircle size={15} className="shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="mt-4 flex items-center justify-end gap-2 pt-2 border-t border-line">
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-xl border border-line px-3.5 py-2 text-[12.5px] font-medium text-ink-2 hover:bg-hover transition-colors"
                            >
                                {t("common.cancel", "Cancel")}
                            </button>
                            <button
                                type="button"
                                onClick={handleManualSend}
                                disabled={!phone.trim() || !fullText}
                                className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 text-[12.5px] font-semibold text-white shadow-lg transition-all"
                            >
                                {t("sms.sendBtn", "Send to WhatsApp")}
                                <ArrowRight size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
