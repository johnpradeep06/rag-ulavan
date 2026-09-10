"use client";

/* Knowledge graph — deterministic radial layout with a designed look:
 * layered core glow, radar rings, curved links with a flowing data pulse,
 * gradient nodes, staggered entrance. No physics sim — positions are computed
 * once and the SVG viewBox is fitted to the content, so it always renders
 * correctly at any container size. Click any node for its details. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    FileText, Database, Globe, Github, Table, ScrollText, Sprout,
    ZoomIn, ZoomOut, Crosshair, X,
} from "lucide-react";
import { API_ENDPOINTS } from "@/lib/api";

type Src = {
    id: number;
    title: string;
    source_type: string;
    origin: string;
    chunk_count: number;
    created_at: string | null;
};

type Node = {
    id: string;
    kind: "core" | "group" | "source";
    label: string;
    x: number;
    y: number;
    r: number;
    color: string;
    type?: string;
    src?: Src;
    count?: number;
};

const TYPES: Record<string, { label: string; color: string; Icon: typeof FileText }> = {
    advisory: { label: "Advisories", color: "#38bdf8", Icon: ScrollText },
    csv: { label: "Datasets (CSV)", color: "#34d399", Icon: Table },
    xlsx: { label: "Spreadsheets", color: "#34d399", Icon: Table },
    json: { label: "JSON records", color: "#a78bfa", Icon: Database },
    pdf: { label: "Documents", color: "#f59e0b", Icon: FileText },
    text: { label: "Text", color: "#94a3b8", Icon: FileText },
    url: { label: "Web pages", color: "#22d3ee", Icon: Globe },
    github: { label: "Repositories", color: "#e2e8f0", Icon: Github },
};
const typeMeta = (t: string) => TYPES[t] ?? { label: t || "Other", color: "#64748b", Icon: FileText };

function layout(sources: Src[]): { nodes: Node[]; links: [Node, Node][] } {
    const nodes: Node[] = [];
    const core: Node = { id: "core", kind: "core", label: "RAG Uzhavan", x: 0, y: 0, r: 44, color: "#60a5fa" };
    nodes.push(core);

    const byType = new Map<string, Src[]>();
    for (const s of sources) byType.set(s.source_type, [...(byType.get(s.source_type) ?? []), s]);

    const groups = [...byType.entries()];
    const n = Math.max(1, groups.length);
    const ringR = 180;
    const links: [Node, Node][] = [];

    groups.forEach(([type, rows], gi) => {
        // evenly around the circle, started at 12 o'clock, nudged off the axes
        const a = -Math.PI / 2 + (gi / n) * Math.PI * 2 + (n === 2 ? Math.PI / 5 : 0);
        const g: Node = {
            id: `g:${type}`, kind: "group", type, label: typeMeta(type).label,
            x: Math.cos(a) * ringR, y: Math.sin(a) * ringR, r: 24,
            color: typeMeta(type).color, count: rows.length,
        };
        nodes.push(g);
        links.push([core, g]);

        // leaves fan out AWAY from the core so clusters look like sprays
        const leafR = 108;
        const span = Math.min(Math.PI * 1.15, 0.55 + rows.length * 0.32);
        rows.forEach((row, k) => {
            const t = rows.length > 1 ? k / (rows.length - 1) - 0.5 : 0;
            const la = a + t * span;
            const dist = leafR + (k % 3) * 30;
            const leaf: Node = {
                id: `s:${row.id}`, kind: "source", type,
                label: row.title.length > 26 ? row.title.slice(0, 24) + "…" : row.title,
                x: g.x + Math.cos(la) * dist, y: g.y + Math.sin(la) * dist,
                r: Math.min(18, 11 + Math.log2((row.chunk_count || 1) + 1) * 1.3),
                color: typeMeta(type).color, src: row,
            };
            nodes.push(leaf);
            links.push([g, leaf]);
        });
    });
    return { nodes, links };
}

/** gentle arc between two points, bowed toward the origin */
function arc(a: Node, b: Node): string {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const k = 0.12; // pull the midpoint toward centre
    return `M ${a.x} ${a.y} Q ${mx - mx * k} ${my - my * k} ${b.x} ${b.y}`;
}

export default function KnowledgeGraph({ onCount }: { onCount?: (n: number) => void }) {
    const [sources, setSources] = useState<Src[] | null>(null);
    const [error, setError] = useState("");
    const [selected, setSelected] = useState<Node | null>(null);
    const [hover, setHover] = useState<string | null>(null);

    const [view, setView] = useState({ z: 1, x: 0, y: 0 });
    const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const token = localStorage.getItem("token");
                const res = await fetch(API_ENDPOINTS.sourcesGraph, { headers: { Authorization: `Bearer ${token}` } });
                if (!res.ok) throw new Error(`Failed to load sources (${res.status})`);
                const data: Src[] = await res.json();
                setSources(data);
                onCount?.(data.length);
            } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
            }
        })();
    }, [onCount]);

    const { nodes, links } = useMemo(() => (sources ? layout(sources) : { nodes: [], links: [] }), [sources]);

    // Centred window big enough to hold the layout with comfortable breathing room.
    // Fixed (not shrink-to-fit) so nodes always render at a readable size; pan/zoom
    // explores. Half-height/width padded to the widest reach of any node.
    const box = useMemo(() => {
        const reach = nodes.length
            ? Math.max(220, ...nodes.map((n) => Math.hypot(n.x, n.y) + n.r + 40))
            : 320;
        const w = reach * 2.1, h = reach * 1.55;
        return { x: -w / 2, y: -h / 2, w, h };
    }, [nodes]);

    const onWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        setView((v) => ({ ...v, z: Math.min(3, Math.max(0.4, v.z * (e.deltaY > 0 ? 0.9 : 1.1))) }));
    }, []);
    const onDown = (e: React.MouseEvent) => { drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; };
    const onMove = (e: React.MouseEvent) => {
        if (!drag.current) return;
        setView((v) => ({ ...v, x: drag.current!.vx + (e.clientX - drag.current!.x), y: drag.current!.vy + (e.clientY - drag.current!.y) }));
    };
    const endDrag = () => { drag.current = null; };
    const recenter = () => setView({ z: 1, x: 0, y: 0 });

    const totalChunks = sources?.reduce((n, s) => n + s.chunk_count, 0) ?? 0;

    return (
        <div className="relative h-full w-full select-none overflow-hidden bg-[#070a12]">
            <style>{`
                @keyframes kg-in { from { opacity: 0; transform: scale(.6) } to { opacity: 1; transform: scale(1) } }
                @keyframes kg-flow { to { stroke-dashoffset: -24 } }
                @keyframes kg-pulse { 0%,100% { opacity:.5; transform: scale(1) } 50% { opacity:0; transform: scale(1.9) } }
                .kg-node { animation: kg-in .5s cubic-bezier(.22,1,.36,1) both }
                .kg-flow { animation: kg-flow 1.1s linear infinite }
                .kg-pulse { animation: kg-pulse 3.2s ease-in-out infinite; transform-origin: center }
            `}</style>

            {/* ambient */}
            <div className="pointer-events-none absolute inset-0"
                style={{ background: "radial-gradient(700px 480px at 50% 42%, rgba(96,165,250,.14), transparent 62%), radial-gradient(500px 400px at 82% 88%, rgba(52,211,153,.08), transparent 60%)" }} />

            {error && (
                <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
                    <div className="rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-center text-[13px] text-red-400">{error}</div>
                </div>
            )}
            {!error && sources && sources.length === 0 && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 text-center">
                    <Sprout size={26} className="text-blue-400" />
                    <p className="text-[14px] font-medium text-slate-200">No knowledge sources yet</p>
                    <p className="max-w-sm text-[12.5px] text-slate-500">Ingest advisories or datasets from the Knowledge Base to build the graph.</p>
                </div>
            )}

            <svg
                className="h-full w-full cursor-grab active:cursor-grabbing"
                viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
                preserveAspectRatio="xMidYMid meet"
                onWheel={onWheel}
                onMouseDown={onDown}
                onMouseMove={onMove}
                onMouseUp={endDrag}
                onMouseLeave={endDrag}
                onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}
            >
                <defs>
                    <filter id="kg-glow" x="-80%" y="-80%" width="260%" height="260%">
                        <feGaussianBlur stdDeviation="6" result="b" />
                        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                    <radialGradient id="kg-core" cx="50%" cy="42%" r="65%">
                        <stop offset="0%" stopColor="#1e293b" />
                        <stop offset="100%" stopColor="#0b1120" />
                    </radialGradient>
                    <pattern id="kg-grid" width="46" height="46" patternUnits="userSpaceOnUse">
                        <circle cx="1" cy="1" r="1" fill="#1e293b" opacity="0.5" />
                    </pattern>
                </defs>

                <g transform={`translate(${view.x / view.z} ${view.y / view.z}) scale(${view.z})`}>
                    <rect x={box.x - 400} y={box.y - 400} width={box.w + 800} height={box.h + 800} fill="url(#kg-grid)" />

                    {/* radar rings */}
                    {[250, 410].map((r) => (
                        <circle key={r} r={r} fill="none" stroke="#1e293b" strokeWidth="1" strokeDasharray="2 8" opacity="0.7" />
                    ))}

                    {/* links */}
                    {links.map(([a, b], i) => {
                        const on = hover === a.id || hover === b.id || selected?.id === a.id || selected?.id === b.id;
                        const d = arc(a, b);
                        return (
                            <g key={i}>
                                <path d={d} fill="none" stroke={on ? b.color : "#1e293b"} strokeWidth={on ? 2 : 1.1} strokeOpacity={on ? 0.9 : 0.55} />
                                <path d={d} fill="none" stroke={b.color} strokeWidth={on ? 2 : 1.4}
                                    strokeOpacity={on ? 0.95 : 0.35} strokeDasharray="1 11" strokeLinecap="round" className="kg-flow" />
                            </g>
                        );
                    })}

                    {/* nodes */}
                    {nodes.map((n, i) => {
                        const Icon = n.kind === "core" ? Sprout : typeMeta(n.type ?? "").Icon;
                        const active = hover === n.id || selected?.id === n.id;
                        return (
                            <g
                                key={n.id}
                                transform={`translate(${n.x} ${n.y})`}
                                className="kg-node cursor-pointer"
                                style={{ animationDelay: `${i * 45}ms` }}
                                onMouseEnter={() => setHover(n.id)}
                                onMouseLeave={() => setHover(null)}
                                onClick={(e) => { e.stopPropagation(); setSelected(n); }}
                            >
                                {n.kind === "core" && (
                                    <>
                                        <circle r={n.r} className="kg-pulse" fill="none" stroke={n.color} strokeWidth="2" />
                                        <circle r={n.r + 22} fill={n.color} opacity="0.06" />
                                        <circle r={n.r + 11} fill={n.color} opacity="0.10" />
                                    </>
                                )}
                                <circle r={n.r + (active ? 10 : 7)} fill={n.color} opacity={active ? 0.22 : 0.12} />
                                <circle
                                    r={n.r}
                                    fill={n.kind === "core" ? "url(#kg-core)" : "#0d1526"}
                                    stroke={n.color}
                                    strokeWidth={n.kind === "core" ? 2.6 : active ? 2.4 : 1.7}
                                    style={{ filter: active ? "url(#kg-glow)" : undefined, transition: "r .15s" }}
                                />
                                <foreignObject x={-n.r * 0.6} y={-n.r * 0.6} width={n.r * 1.2} height={n.r * 1.2} className="pointer-events-none">
                                    <div className="flex h-full w-full items-center justify-center" style={{ color: n.color }}>
                                        <Icon size={n.r} strokeWidth={2} />
                                    </div>
                                </foreignObject>
                                {(n.kind !== "source" || active) && (
                                    <g transform={`translate(0 ${n.r + 15})`} className="pointer-events-none">
                                        <rect
                                            x={-(n.label.length * 3.3 + (n.kind === "group" ? 14 : 6))}
                                            y={-9}
                                            width={n.label.length * 6.6 + (n.kind === "group" ? 28 : 12)}
                                            height={17}
                                            rx={8}
                                            fill="#0b1120"
                                            opacity={0.85}
                                            stroke={active ? n.color : "#1e293b"}
                                            strokeWidth="0.8"
                                        />
                                        <text textAnchor="middle" y={3} className="text-[10px] font-medium" fill={active ? "#e2e8f0" : "#94a3b8"}>
                                            {n.label}{n.kind === "group" ? ` · ${n.count}` : ""}
                                        </text>
                                    </g>
                                )}
                            </g>
                        );
                    })}
                </g>
            </svg>

            {/* zoom controls */}
            <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1 rounded-xl border border-slate-700/70 bg-slate-900/80 p-1 backdrop-blur">
                {[
                    { t: "Zoom in", Icon: ZoomIn, on: () => setView((v) => ({ ...v, z: Math.min(3, v.z * 1.2) })) },
                    { t: "Zoom out", Icon: ZoomOut, on: () => setView((v) => ({ ...v, z: Math.max(0.4, v.z / 1.2) })) },
                    { t: "Recenter", Icon: Crosshair, on: recenter },
                ].map(({ t, Icon, on }) => (
                    <button key={t} title={t} onClick={on} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100">
                        <Icon size={15} />
                    </button>
                ))}
            </div>

            {/* legend */}
            {sources && sources.length > 0 && (
                <div className="absolute left-4 top-4 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 py-2 text-[11px] backdrop-blur">
                    <span className="font-medium text-slate-200">{sources.length} sources</span>
                    <span className="text-slate-500">·</span>
                    <span className="text-slate-400">{totalChunks.toLocaleString()} chunks</span>
                </div>
            )}

            {/* detail panel */}
            {selected && selected.kind !== "core" && (
                <div className="absolute bottom-4 left-4 z-20 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-700/70 bg-slate-900/90 p-4 shadow-2xl backdrop-blur-xl">
                    <div className="flex items-start justify-between gap-2">
                        <span
                            className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
                            style={{ backgroundColor: `${selected.color}22`, color: selected.color }}
                        >
                            {selected.kind === "group" ? "SOURCE TYPE" : typeMeta(selected.type ?? "").label}
                        </span>
                        <button onClick={() => setSelected(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
                            <X size={15} />
                        </button>
                    </div>

                    <h4 className="mt-3 text-[13.5px] font-semibold leading-snug break-words text-slate-100">
                        {selected.kind === "source" ? selected.src!.title : selected.label}
                    </h4>

                    {selected.kind === "group" && (
                        <p className="mt-2 text-[12px] text-slate-400">{selected.count} source{selected.count === 1 ? "" : "s"} of this type.</p>
                    )}

                    {selected.kind === "source" && selected.src && (
                        <dl className="mt-3.5 space-y-2 border-t border-slate-800/80 pt-3 text-[12px]">
                            <div className="flex justify-between text-slate-400"><dt>Type</dt><dd className="font-medium text-slate-200">{typeMeta(selected.src.source_type).label}</dd></div>
                            <div className="flex justify-between text-slate-400"><dt>Origin</dt><dd className="font-mono text-[11px] text-slate-300">{selected.src.origin}</dd></div>
                            <div className="flex justify-between text-slate-400"><dt>Indexed chunks</dt><dd className="font-mono font-medium text-slate-200">{selected.src.chunk_count.toLocaleString()}</dd></div>
                            {selected.src.created_at && (
                                <div className="flex justify-between text-slate-400"><dt>Added</dt><dd className="text-[11.5px] text-slate-300">
                                    {new Date(selected.src.created_at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                </dd></div>
                            )}
                            <div className="flex justify-between text-slate-400"><dt>Source ID</dt><dd className="font-mono text-slate-300">#{selected.src.id}</dd></div>
                        </dl>
                    )}
                </div>
            )}
        </div>
    );
}
