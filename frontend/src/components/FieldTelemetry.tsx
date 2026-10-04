"use client";

/* Live field telemetry from the RagUzhavan ESP32 #2 control node (READ-ONLY).
 * Polls http://<device-ip>/data directly from the browser — see lib/iot.ts.
 * No pump control here by design. */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Thermometer, Droplets, Wind, Ruler, Sprout, Sun, Power,
    Wifi, WifiOff, RefreshCw, Settings2, TriangleAlert, CheckCircle2, Info, X, MessageSquarePlus,
} from "lucide-react";
import { useTranslation } from "@/i18n";
import { useTelemetry, deriveAlerts, tankBand, captureReadings, type AlertLevel } from "@/lib/iot";

const LEVEL_TONE: Record<AlertLevel, string> = {
    critical: "text-rose-400 border-rose-500/30 bg-rose-500/10",
    warning: "text-amber-400 border-amber-500/30 bg-amber-500/10",
    advisory: "text-sky-400 border-sky-500/30 bg-sky-500/10",
    ok: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
};
const LEVEL_ICON = { critical: TriangleAlert, warning: TriangleAlert, advisory: Info, ok: CheckCircle2 };

function Reading({
    icon: Icon, label, value, unit, tone = "text-ink",
}: { icon: typeof Thermometer; label: string; value: string; unit?: string; tone?: string }) {
    return (
        <div className="rounded-xl border border-line bg-surface/80 p-4 shadow-sm backdrop-blur-sm">
            <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-ink-3">
                <Icon size={13} className="text-accent-ink" /> {label}
            </div>
            <div className={`mt-1.5 text-[24px] font-semibold tracking-tight ${tone}`}>
                {value}
                {unit && <span className="ml-1 text-[13px] font-normal text-ink-3">{unit}</span>}
            </div>
        </div>
    );
}

export default function FieldTelemetry() {
    const { t } = useTranslation();
    const router = useRouter();
    const { data, error, loading, lastOkAt, url, refresh, changeUrl } = useTelemetry(2500, true);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(url);

    const sendToChat = () => {
        if (!data) return;
        captureReadings(data);
        router.push("/");
    };

    const connected = !!data && !error;
    const alerts = useMemo(() => (data ? deriveAlerts(data) : []), [data]);
    const secsAgo = lastOkAt ? Math.round((Date.now() - lastOkAt) / 1000) : null;

    const StatusIcon = loading ? RefreshCw : connected ? Wifi : WifiOff;
    const statusText = loading
        ? t("field.connecting", "Connecting…")
        : connected
            ? t("field.connected", "Connected")
            : t("field.unreachable", "Device unreachable");
    const statusTone = loading ? "text-ink-3" : connected ? "text-emerald-400" : "text-rose-400";

    return (
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
            {/* ── connection bar ─────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface/80 px-4 py-3 shadow-sm backdrop-blur-sm">
                <span className={`flex items-center gap-1.5 text-[13px] font-medium ${statusTone}`}>
                    <StatusIcon size={15} className={loading ? "animate-spin" : ""} /> {statusText}
                </span>
                {connected && secsAgo !== null && (
                    <span className="text-[12px] text-ink-3">
                        {t("field.lastSeen", "updated")} {secsAgo}s {t("field.ago", "ago")}
                    </span>
                )}
                <code className="ml-auto rounded bg-inset px-1.5 py-0.5 font-mono text-[11px] text-ink-3">{url}</code>
                <button
                    onClick={() => { setDraft(url); setEditing((v) => !v); }}
                    className="rounded-control p-1.5 text-ink-3 transition-colors hover:bg-hover hover:text-ink"
                    title={t("field.deviceUrl", "Device address")}
                    aria-label={t("field.deviceUrl", "Device address")}
                >
                    <Settings2 size={14} />
                </button>
                <button
                    onClick={refresh}
                    className="rounded-control p-1.5 text-ink-3 transition-colors hover:bg-hover hover:text-ink"
                    title={t("common.retry", "Retry")}
                    aria-label={t("common.retry", "Retry")}
                >
                    <RefreshCw size={14} />
                </button>
            </div>

            {editing && (
                <form
                    onSubmit={(e) => { e.preventDefault(); if (/^https?:\/\//i.test(draft.trim())) { changeUrl(draft.trim()); setEditing(false); } }}
                    className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-surface/80 px-3 py-2.5 shadow-sm"
                >
                    <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="http://10.41.4.134"
                        aria-label={t("field.deviceUrl", "Device address")}
                        className="min-w-0 flex-1 rounded-control border border-line bg-canvas px-2.5 py-1.5 font-mono text-[12.5px] text-ink outline-none focus:border-line-strong"
                    />
                    <button type="submit" className="rounded-control border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink shadow-btn transition-colors hover:bg-hover">
                        {t("common.save", "Save")}
                    </button>
                    <button type="button" onClick={() => setEditing(false)} className="rounded-control p-1.5 text-ink-3 hover:bg-hover hover:text-ink" aria-label={t("common.cancel", "Cancel")}>
                        <X size={14} />
                    </button>
                </form>
            )}

            {/* ── unreachable guidance ───────────────────────────────────── */}
            {!connected && !loading && (
                <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-[13px] leading-relaxed text-amber-200/90">
                    <p className="font-medium text-amber-300">{t("field.unreachable", "Device unreachable")}{error ? ` — ${error}` : ""}</p>
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-amber-200/80">
                        <li>{t("field.help.sameWifi", "This computer and the ESP32 control node must be on the same Wi-Fi network.")}</li>
                        <li>{t("field.help.localOnly", "Open this page from http://localhost — a deployed HTTPS site cannot reach a local http device (mixed content).")}</li>
                        <li>{t("field.help.checkIp", "Confirm the device address above matches the IP printed on the OLED / serial monitor.")}</li>
                    </ul>
                </div>
            )}

            {/* ── readings ───────────────────────────────────────────────── */}
            {data && (
                <>
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <Reading icon={Thermometer} label={t("telemetry.temperature", "Temperature")} value={data.temperature.toFixed(1)} unit="°C"
                            tone={data.temperature > 40 ? "text-amber-400" : "text-ink"} />
                        <Reading icon={Wind} label={t("telemetry.humidity", "Humidity")} value={data.humidity.toFixed(0)} unit="%"
                            tone={data.humidity < 40 ? "text-sky-400" : "text-ink"} />
                        <Reading icon={Ruler} label={t("field.tankDistance", "Tank distance")} value={data.waterDistance.toFixed(1)} unit="cm"
                            tone={tankBand(data.waterDistance) === "critical" ? "text-rose-400" : tankBand(data.waterDistance) === "warning" ? "text-amber-400" : "text-ink"} />
                        <Reading icon={Droplets} label={t("field.soilWater", "Soil water")} value={data.waterStatus}
                            tone={data.waterStatus === "LOW" ? "text-sky-400" : data.waterStatus === "HIGH" ? "text-emerald-400" : "text-ink"} />
                        <Reading icon={Sprout} label={t("field.soilRaw", "Soil ADC")} value={String(data.waterSensorValue)} unit="/4095" />
                        <Reading icon={Sun} label={t("field.light", "Light")} value={data.lightStatus} />
                    </div>

                    {/* pump state (read-only) */}
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface/80 px-4 py-3 shadow-sm">
                        <Power size={15} className={data.relayOn ? "text-emerald-400" : "text-ink-3"} />
                        <span className="text-[13px] font-medium text-ink">
                            {t("field.pump", "Pump")}: {data.relayOn ? t("field.pumpOn", "RUNNING") : t("field.pumpOff", "IDLE")}
                        </span>
                        {data.dryoutBlocked && (
                            <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-400">
                                {t("field.dryoutBlocked", "DRYOUT — pump blocked")}
                            </span>
                        )}
                        {!data.dataReceived && (
                            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-400">
                                {t("field.noNodePacket", "awaiting sensor node")}
                            </span>
                        )}
                        <span className="ml-auto font-mono text-[11px] text-ink-3">
                            {t("field.uptime", "device uptime")} {Math.floor(data.timestamp / 1000)}s
                        </span>
                    </div>

                    {/* capture -> chat */}
                    <button
                        onClick={sendToChat}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-[13px] font-medium text-emerald-400 shadow-sm transition-colors hover:bg-emerald-500/20"
                    >
                        <MessageSquarePlus size={15} />
                        {t("field.sendToChat", "Send these readings to chat")}
                    </button>

                    {/* alerts */}
                    <div className="mt-4 space-y-2">
                        <div className="text-[11px] font-mono uppercase tracking-wider text-ink-3">{t("field.alerts", "Field alerts")}</div>
                        {alerts.map((a, i) => {
                            const AIcon = LEVEL_ICON[a.level];
                            return (
                                <div key={i} className={`flex items-start gap-2.5 rounded-xl border p-3 text-[13px] ${LEVEL_TONE[a.level]}`}>
                                    <AIcon size={15} className="mt-0.5 shrink-0" />
                                    <div>
                                        <div className="font-medium">{a.title}</div>
                                        <div className="text-ink-2/90">{a.detail}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
