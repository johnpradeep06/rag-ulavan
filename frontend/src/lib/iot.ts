"use client";

/* RagUzhavan ESP32 #2 "Control Node" — live field telemetry (read-only).
 *
 * Option A topology: the browser talks to the ESP32 directly over the LOCAL
 * Wi-Fi (`http://<device-ip>/data`). The device already sends `Access-Control-
 * Allow-Origin: *` + `Access-Control-Allow-Private-Network: true`, so this works
 * from a page served over http://localhost. On the deployed HTTPS site the
 * request is blocked as mixed content — callers must handle the error state
 * (the UI shows "device unreachable", it never throws to render).
 *
 * Nothing here touches the RAG backend or its API base URL. */

import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------- config
const DEFAULT_URL = (process.env.NEXT_PUBLIC_IOT_URL || "http://10.41.4.134").replace(/\/+$/, "");
const LS_KEY = "iot-device-url";

/** Current device base URL — a localStorage override wins over the build default
 *  so the IP can be changed without a rebuild (DHCP leases move). */
export function getIotUrl(): string {
    if (typeof window !== "undefined") {
        try {
            const v = localStorage.getItem(LS_KEY);
            if (v && /^https?:\/\//i.test(v)) return v.replace(/\/+$/, "");
        } catch {
            /* ignore */
        }
    }
    return DEFAULT_URL;
}

export function setIotUrl(url: string): void {
    try {
        localStorage.setItem(LS_KEY, url.trim().replace(/\/+$/, ""));
    } catch {
        /* ignore */
    }
}

// ---------------------------------------------------------------- shape
/** Exactly the JSON served by the ESP32 `GET /data`. */
export type Telemetry = {
    temperature: number;
    humidity: number;
    waterDistance: number;       // ultrasonic tank distance, cm
    waterSensorValue: number;    // soil water sensor raw ADC, 0..4095
    waterStatus: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN" | string;
    lightStatus: "DARK" | "BRIGHT" | "UNKNOWN" | string;
    timestamp: number;           // device millis() since boot
    relayOn: boolean;
    irrigationON: boolean;
    dryoutBlocked: boolean;      // pump locked, tank distance > 50 cm
    dataReceived: boolean;       // device has heard from ESP32 #1
};

export type FetchResult =
    | { ok: true; data: Telemetry }
    | { ok: false; error: string };

// ---------------------------------------------------------------- fetch
export async function fetchTelemetry(timeoutMs = 4000): Promise<FetchResult> {
    const url = `${getIotUrl()}/data`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: ctrl.signal, cache: "no-store", mode: "cors" });
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
        const raw = (await res.json()) as Partial<Telemetry>;
        return { ok: true, data: normalize(raw) };
    } catch (e) {
        // mixed-content block, DNS/route failure, timeout, CORS — all land here
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, error: /aborted/i.test(msg) ? "timeout" : msg };
    } finally {
        clearTimeout(timer);
    }
}

function num(v: unknown, d = 0): number {
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : d;
}

function normalize(r: Partial<Telemetry>): Telemetry {
    return {
        temperature: num(r.temperature),
        humidity: num(r.humidity),
        waterDistance: num(r.waterDistance),
        waterSensorValue: num(r.waterSensorValue),
        waterStatus: String(r.waterStatus ?? "UNKNOWN").toUpperCase(),
        lightStatus: String(r.lightStatus ?? "UNKNOWN").toUpperCase(),
        timestamp: num(r.timestamp),
        relayOn: !!r.relayOn,
        irrigationON: !!r.irrigationON,
        dryoutBlocked: !!r.dryoutBlocked,
        dataReceived: !!r.dataReceived,
    };
}

// ---------------------------------------------------------------- agronomic alerts
export type AlertLevel = "critical" | "warning" | "advisory" | "ok";
export type FieldAlert = { level: AlertLevel; title: string; detail: string };

/** Mirrors the ESP32's on-device decision ladder (order matters: >50 before >40
 *  before soil-LOW). Display only — the browser never actuates the pump. */
export function deriveAlerts(t: Telemetry): FieldAlert[] {
    if (!t.dataReceived) {
        return [{ level: "warning", title: "No sensor data", detail: "The control node has not received a packet from the field sensor node yet." }];
    }
    const out: FieldAlert[] = [];
    if (t.waterDistance > 50) {
        out.push({ level: "critical", title: "Critical dryout — tank > 50 cm", detail: "Pump is auto-blocked to prevent burnout. Refill the reservoir." });
    } else if (t.waterDistance > 40) {
        out.push({ level: "warning", title: "Tank level low — > 40 cm", detail: "Approaching dryout. Stop irrigation soon." });
    } else if (t.waterStatus === "LOW") {
        out.push({ level: "advisory", title: "Field water low", detail: "Soil moisture sensor reads LOW — irrigation should be started." });
    }
    if (t.temperature > 40) {
        out.push({ level: "warning", title: "High temperature", detail: `Ambient ${t.temperature.toFixed(1)} °C — check the field.` });
    }
    if (t.humidity < 40 && t.waterStatus !== "LOW" && t.waterDistance <= 40) {
        out.push({ level: "advisory", title: "Low humidity", detail: `Relative humidity ${t.humidity.toFixed(0)} % — monitor crop stress.` });
    }
    if (out.length === 0) out.push({ level: "ok", title: "All systems normal", detail: "Field conditions are within optimal range." });
    return out;
}

/** Colour band for the tank distance reading. */
export function tankBand(cm: number): AlertLevel {
    if (cm > 50) return "critical";
    if (cm > 40) return "warning";
    return "ok";
}

// ---------------------------------------------------------------- capture -> chat
/** A frozen snapshot the Live Field page hands to the chat composer. Consume-once. */
export type FieldCapture = {
    temperature: number;
    humidity: number;
    waterDistance: number;
    waterStatus: string;
    capturedAt: number; // epoch ms
};

const CAPTURE_KEY = "field-capture";

export function captureReadings(t: Telemetry): void {
    try {
        const c: FieldCapture = {
            temperature: t.temperature,
            humidity: t.humidity,
            waterDistance: t.waterDistance,
            waterStatus: t.waterStatus,
            capturedAt: Date.now(),
        };
        localStorage.setItem(CAPTURE_KEY, JSON.stringify(c));
    } catch {
        /* ignore */
    }
}

/** Returns the pending capture if it exists and is fresh; null otherwise. */
export function readFieldCapture(maxAgeMs = 10 * 60_000): FieldCapture | null {
    try {
        const raw = localStorage.getItem(CAPTURE_KEY);
        if (!raw) return null;
        const c = JSON.parse(raw) as FieldCapture;
        if (!c || typeof c.capturedAt !== "number" || Date.now() - c.capturedAt > maxAgeMs) return null;
        return c;
    } catch {
        return null;
    }
}

export function clearFieldCapture(): void {
    try {
        localStorage.removeItem(CAPTURE_KEY);
    } catch {
        /* ignore */
    }
}

/** One-line, model-readable summary of a capture. */
export function summarizeCapture(c: FieldCapture): string {
    return [
        `temperature ${c.temperature.toFixed(1)} °C`,
        `humidity ${c.humidity.toFixed(0)} %`,
        `tank water distance ${c.waterDistance.toFixed(1)} cm`,
        `soil moisture ${c.waterStatus}`,
    ].join(", ");
}

// ---------------------------------------------------------------- poll hook
export type TelemetryState = {
    data: Telemetry | null;
    error: string | null;
    /** true until the first response (ok or error) arrives */
    loading: boolean;
    /** epoch ms of the last successful read, or null */
    lastOkAt: number | null;
    url: string;
    refresh: () => void;
    changeUrl: (u: string) => void;
};

export function useTelemetry(pollMs = 2500, enabled = true): TelemetryState {
    const [data, setData] = useState<Telemetry | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastOkAt, setLastOkAt] = useState<number | null>(null);
    const [url, setUrl] = useState<string>(() => getIotUrl());
    const tick = useRef(0);

    const run = useCallback(async () => {
        const r = await fetchTelemetry();
        setLoading(false);
        if (r.ok) {
            setData(r.data);
            setError(null);
            setLastOkAt(Date.now());
        } else {
            setError(r.error);
        }
    }, []);

    useEffect(() => {
        if (!enabled) return;
        let alive = true;
        const loop = () => { if (alive && !document.hidden) void run(); };
        void run();
        const id = setInterval(loop, Math.max(1000, pollMs));
        const onVis = () => { if (!document.hidden) void run(); };
        document.addEventListener("visibilitychange", onVis);
        return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
        // re-arm when the target URL changes (tick bump) or cadence/enabled change
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [run, pollMs, enabled, tick.current]);

    const refresh = useCallback(() => { void run(); }, [run]);
    const changeUrl = useCallback((u: string) => {
        setIotUrl(u);
        setUrl(getIotUrl());
        setLoading(true);
        setData(null);
        setError(null);
        tick.current += 1;
        void run();
    }, [run]);

    return { data, error, loading, lastOkAt, url, refresh, changeUrl };
}
