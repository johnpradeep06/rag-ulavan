"use client";

/* Interactive Knowledge Graph Explorer.
 * Cytoscape.js canvas + zoom/pan/fit/reset/fullscreen, node drag, hover/select
 * highlighting, neighborhood focus, client-side search & metadata filters,
 * collapsible filter + detail panels, legend. Reads GET /graph/full only. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import cytoscape, { type Core, type ElementDefinition, type NodeSingular, type EdgeSingular, type LayoutOptions } from "cytoscape";
import fcose from "cytoscape-fcose";
import {
    Search, ZoomIn, ZoomOut, Maximize2, Minimize2, RotateCcw, Frame,
    PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, X,
    Crosshair, Layers, ExternalLink, Loader2, TriangleAlert,
} from "lucide-react";
import { API_ENDPOINTS } from "@/lib/api";

cytoscape.use(fcose);

// ---------------------------------------------------------------- data model
type GNode = { id: string; label: string; type: string; metadata: Record<string, unknown> };
type GEdge = { id: string; source: string; target: string; relationship: string };
type Stats = { sources: number; chunks: number; nodes: number; relationships: number; advisories: number };
type Filters = { types: string[]; states: string[]; crops: string[]; districts: string[]; seasons: string[]; advisory_types: string[] };
type Graph = { nodes: GNode[]; edges: GEdge[]; stats: Stats; filters: Filters };

const TYPE: Record<string, { label: string; color: string; shape: string; size: number }> = {
    advisory: { label: "Advisory", color: "#38bdf8", shape: "round-rectangle", size: 34 },
    crop: { label: "Crop", color: "#34d399", shape: "ellipse", size: 40 },
    district: { label: "District", color: "#f59e0b", shape: "round-diamond", size: 34 },
    state: { label: "State", color: "#f472b6", shape: "round-hexagon", size: 46 },
    season: { label: "Season", color: "#a78bfa", shape: "round-tag", size: 30 },
    stage: { label: "Growth stage", color: "#22d3ee", shape: "round-pentagon", size: 30 },
    source: { label: "Source", color: "#e2e8f0", shape: "star", size: 42 },
    dataset: { label: "Dataset", color: "#94a3b8", shape: "barrel", size: 44 },
};
const meta = (t: string) => TYPE[t] ?? { label: t, color: "#64748b", shape: "ellipse", size: 32 };

/* eslint-disable @typescript-eslint/no-explicit-any */
const LAYOUTS: Record<string, LayoutOptions> = {
    Force: { name: "fcose", quality: "proof", animate: true, animationDuration: 600, randomize: true, nodeSeparation: 90, idealEdgeLength: 95, nodeRepulsion: 9000, padding: 40 } as any,
    Hierarchical: { name: "breadthfirst", directed: true, animate: true, animationDuration: 500, spacingFactor: 1.25, padding: 40 } as any,
    Radial: { name: "concentric", animate: true, animationDuration: 500, minNodeSpacing: 40, padding: 40, concentric: (n: NodeSingular) => n.degree(false), levelWidth: () => 2 } as any,
};

const stylesheet: any[] = [
    {
        selector: "node",
        style: {
            "background-color": "#0f172a",
            "border-width": 2,
            "border-color": ((n: NodeSingular) => meta(n.data("type")).color) as any,
            shape: ((n: NodeSingular) => meta(n.data("type")).shape) as any,
            width: ((n: NodeSingular) => n.data("size")) as any,
            height: ((n: NodeSingular) => n.data("size")) as any,
            label: "data(label)",
            color: "#cbd5e1",
            "font-size": 9,
            "font-weight": 500,
            "text-valign": "bottom",
            "text-margin-y": 4,
            "text-max-width": "120px",
            "text-wrap": "ellipsis",
            "text-background-color": "#0b1120",
            "text-background-opacity": 0.75,
            "text-background-padding": "2px",
            "text-background-shape": "roundrectangle",
            "transition-property": "border-width, opacity, border-color",
            "transition-duration": 120,
        },
    },
    { selector: "node.dim", style: { opacity: 0.12, "text-opacity": 0.05 } },
    { selector: "node.hl", style: { "border-width": 3.5, color: "#f1f5f9" } },
    {
        selector: "node:selected",
        style: {
            "border-width": 4,
            "border-color": ((n: NodeSingular) => meta(n.data("type")).color) as any,
            "overlay-color": ((n: NodeSingular) => meta(n.data("type")).color) as any,
            "overlay-opacity": 0.18,
            "overlay-padding": 8,
            color: "#f8fafc",
            "z-index": 20,
        },
    },
    {
        selector: "edge",
        style: {
            width: 1,
            "line-color": "#334155",
            "curve-style": "bezier",
            "target-arrow-color": "#334155",
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.7,
            opacity: 0.55,
            label: "data(relationship)",
            "font-size": 8,
            color: "#94a3b8",
            "text-opacity": 0,
            "text-background-color": "#0b1120",
            "text-background-opacity": 0.85,
            "text-background-padding": "2px",
            "transition-property": "opacity, width, line-color, text-opacity",
            "transition-duration": 120,
        },
    },
    { selector: "edge.dim", style: { opacity: 0.05, "text-opacity": 0 } },
    {
        selector: "edge.hl",
        style: {
            width: 2.4, opacity: 1, "text-opacity": 1,
            "line-color": ((e: EdgeSingular) => meta(e.target().data("type")).color) as any,
            "target-arrow-color": ((e: EdgeSingular) => meta(e.target().data("type")).color) as any,
            "z-index": 15,
        },
    },
    { selector: "edge:selected", style: { width: 2.6, opacity: 1, "text-opacity": 1, "line-color": "#e2e8f0", "target-arrow-color": "#e2e8f0" } },
    { selector: ".filtered", style: { display: "none" } },
];

// ------------------------------------------------------------------ component
export default function KnowledgeGraph({ onCount }: { onCount?: (n: number) => void }) {
    const boxRef = useRef<HTMLDivElement>(null);
    const cyRef = useRef<Core | null>(null);

    const [graph, setGraph] = useState<Graph | null>(null);
    const [error, setError] = useState<string>("");
    const [loading, setLoading] = useState(true);

    const wide = typeof window !== "undefined" && window.innerWidth >= 1024;
    const [leftOpen, setLeftOpen] = useState(wide);
    const [rightOpen, setRightOpen] = useState(wide);
    const [fullscreen, setFullscreen] = useState(false);

    const [selected, setSelected] = useState<{ kind: "node" | "edge"; data: GNode | GEdge; degree?: number } | null>(null);
    const [focusId, setFocusId] = useState<string | null>(null);

    const [layoutName, setLayoutName] = useState<keyof typeof LAYOUTS>("Force");
    const [nodeScale, setNodeScale] = useState(1);
    const [showLabels, setShowLabels] = useState(true);

    const [q, setQ] = useState("");
    const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
    const [facet, setFacet] = useState<{ state: string; crop: string; season: string; district: string }>({
        state: "", crop: "", season: "", district: "",
    });

    // -------------------------------------------------------------- fetch
    const load = useCallback(async () => {
        setLoading(true); setError("");
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(API_ENDPOINTS.graphFull, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const g: Graph = await res.json();
            setGraph(g);
            onCount?.(g.stats.nodes);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [onCount]);
    useEffect(() => { load(); }, [load]);

    const elements = useMemo<ElementDefinition[]>(() => {
        if (!graph) return [];
        const ids = new Set(graph.nodes.map((n) => n.id));
        return [
            ...graph.nodes.map((n) => ({ data: { id: n.id, label: n.label, type: n.type, size: meta(n.type).size, raw: n } })),
            ...graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target))
                .map((e) => ({ data: { id: e.id, source: e.source, target: e.target, relationship: e.relationship, raw: e } })),
        ];
    }, [graph]);

    // -------------------------------------------------------------- mount cy
    useEffect(() => {
        if (!boxRef.current || !elements.length) return;
        const cy = cytoscape({
            container: boxRef.current,
            elements,
            style: stylesheet,
            minZoom: 0.15,
            maxZoom: 4,
            wheelSensitivity: 0.25,
            boxSelectionEnabled: false,
        });
        cyRef.current = cy;
        cy.layout(LAYOUTS[layoutName]).run();
        // container often has no size on first paint (flex) — resize + fit once it does
        const settle = () => { cy.resize(); cy.fit(undefined, 45); };
        cy.ready(() => requestAnimationFrame(settle));
        const ro = new ResizeObserver(() => cy.resize());
        if (boxRef.current) ro.observe(boxRef.current);
        const t0 = setTimeout(settle, 350);

        const clearHl = () => { cy.elements().removeClass("hl"); };
        cy.on("mouseover", "node", (ev) => {
            const n = ev.target as NodeSingular;
            clearHl();
            n.addClass("hl");
            n.connectedEdges().addClass("hl");
            n.connectedEdges().connectedNodes().addClass("hl");
        });
        cy.on("mouseout", "node", clearHl);
        cy.on("mouseover", "edge", (ev) => { clearHl(); ev.target.addClass("hl"); });
        cy.on("mouseout", "edge", clearHl);

        cy.on("tap", "node", (ev) => {
            const n = ev.target as NodeSingular;
            setSelected({ kind: "node", data: n.data("raw"), degree: n.degree(false) });
        });
        cy.on("tap", "edge", (ev) => setSelected({ kind: "edge", data: ev.target.data("raw") }));
        cy.on("tap", (ev) => { if (ev.target === cy) { setSelected(null); } });

        return () => { clearTimeout(t0); ro.disconnect(); cy.destroy(); cyRef.current = null; };
        // re-mount only when the underlying element set changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [elements]);

    // -------------------------------------------------------------- reactive styling
    useEffect(() => {
        const cy = cyRef.current;
        if (!cy) return;
        cy.batch(() => {
            cy.nodes().forEach((n) => { n.style({ width: n.data("size") * nodeScale, height: n.data("size") * nodeScale }); });
            cy.style().selector("node").style("text-opacity", showLabels ? 1 : 0).update();
        });
    }, [nodeScale, showLabels, elements]);

    // filters -> add/remove .filtered, keep selection valid, re-fit
    useEffect(() => {
        const cy = cyRef.current;
        if (!cy || !graph) return;
        const active = new Set(
            graph.nodes.filter((n) => {
                if (typeFilter.size && !typeFilter.has(n.type)) return false;
                const m = n.metadata as Record<string, string>;
                if (facet.state && n.type === "state" && n.label !== facet.state) return false;
                if (facet.state && m.state && m.state !== facet.state && n.type !== "state") {
                    if (["advisory", "district"].includes(n.type)) return false;
                }
                if (facet.crop && n.type === "crop" && n.label !== facet.crop) return false;
                if (facet.crop && n.type === "advisory" && m.crop && !String(m.crop).startsWith(facet.crop) && m.crop !== facet.crop) return false;
                if (facet.season && n.type === "season" && n.label !== facet.season) return false;
                if (facet.season && n.type === "advisory" && m.season && m.season !== facet.season) return false;
                if (facet.district && n.type === "district" && n.label !== facet.district) return false;
                if (facet.district && n.type === "advisory" && m.district && m.district !== facet.district) return false;
                return true;
            }).map((n) => n.id),
        );
        const anyFilter = typeFilter.size || facet.state || facet.crop || facet.season || facet.district;
        cy.batch(() => {
            cy.nodes().forEach((n) => { n.toggleClass("filtered", !!anyFilter && !active.has(n.id())); });
            cy.edges().forEach((e) => { e.toggleClass("filtered", e.source().hasClass("filtered") || e.target().hasClass("filtered")); });
        });
        const vis = cy.elements(":visible");
        if (vis.length) cy.animate({ fit: { eles: vis, padding: 45 }, duration: 250 });
    }, [typeFilter, facet, graph]);

    // focus mode
    useEffect(() => {
        const cy = cyRef.current;
        if (!cy) return;
        cy.batch(() => {
            cy.elements().removeClass("dim");
            if (focusId) {
                const n = cy.$id(focusId);
                if (n.nonempty()) {
                    const keep = n.closedNeighborhood();
                    cy.elements().not(keep).addClass("dim");
                    cy.animate({ fit: { eles: keep, padding: 60 }, duration: 350 });
                }
            }
        });
    }, [focusId]);

    // resize cy on panel / fullscreen changes
    useEffect(() => {
        const cy = cyRef.current;
        if (!cy) return;
        const t = setTimeout(() => { cy.resize(); }, 260);
        return () => clearTimeout(t);
    }, [leftOpen, rightOpen, fullscreen]);

    // -------------------------------------------------------------- actions
    const zoomBy = (f: number) => { const cy = cyRef.current; if (cy) cy.animate({ zoom: Math.min(4, Math.max(0.15, cy.zoom() * f)), center: { eles: cy.elements(":visible") } }, { duration: 150 }); };
    const fit = () => cyRef.current?.animate({ fit: { eles: cyRef.current.elements(":visible"), padding: 45 }, duration: 250 });
    const relayout = (name: keyof typeof LAYOUTS) => { setLayoutName(name); cyRef.current?.layout(LAYOUTS[name]).run(); };
    const reset = () => {
        setQ(""); setTypeFilter(new Set()); setFacet({ state: "", crop: "", season: "", district: "" });
        setFocusId(null); setSelected(null); setNodeScale(1); setShowLabels(true);
        cyRef.current?.$(":selected").unselect();
        relayout("Force");
        setTimeout(fit, 400);
    };
    const centerSelected = () => {
        const cy = cyRef.current;
        if (cy && selected?.kind === "node") cy.animate({ center: { eles: cy.$id((selected.data as GNode).id) }, zoom: 1.4 }, { duration: 250 });
    };
    const toggleFullscreen = () => setFullscreen((v) => !v);

    // search
    const results = useMemo(() => {
        if (!graph || q.trim().length < 1) return [];
        const s = q.toLowerCase();
        return graph.nodes
            .filter((n) => n.label.toLowerCase().includes(s) || Object.values(n.metadata).some((v) => String(v).toLowerCase().includes(s)))
            .slice(0, 12);
    }, [graph, q]);

    const pick = (n: GNode) => {
        const cy = cyRef.current;
        if (!cy) return;
        const el = cy.$id(n.id);
        if (el.empty()) return;
        cy.$(":selected").unselect();
        el.select();
        setSelected({ kind: "node", data: n, degree: (el as NodeSingular).degree(false) });
        cy.animate({ center: { eles: el }, zoom: 1.5 }, { duration: 300 });
        setQ("");
    };

    // ---------------------------------------------------------------- render
    const st = graph?.stats;
    const shellCls = fullscreen
        ? "fixed inset-0 z-[100] flex flex-col bg-[#070a12]"
        : "absolute inset-0 flex flex-col bg-[#070a12]";

    return (
        <div className={shellCls}>
            {/* header: counts + search */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-800/70 bg-slate-950/60 px-3 py-2 backdrop-blur">
                <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
                    {st ? (
                        <>
                            <span><b className="text-slate-200">{st.sources}</b> sources</span>
                            <span className="text-slate-600">·</span>
                            <span><b className="text-slate-200">{st.chunks.toLocaleString()}</b> chunks</span>
                            <span className="text-slate-600">·</span>
                            <span><b className="text-emerald-400">{st.nodes}</b> nodes</span>
                            <span className="text-slate-600">·</span>
                            <span><b className="text-emerald-400">{st.relationships}</b> relationships</span>
                        </>
                    ) : <span>Knowledge graph</span>}
                </div>
                <div className="relative ml-auto w-full max-w-xs">
                    <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search the knowledge graph…"
                        className="w-full rounded-lg border border-slate-700/70 bg-slate-900/80 py-1.5 pl-8 pr-3 text-[12.5px] text-slate-200 outline-none placeholder:text-slate-500 focus:border-emerald-500/50"
                    />
                    {results.length > 0 && (
                        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-700/70 bg-slate-900/95 py-1 shadow-2xl backdrop-blur">
                            {results.map((n) => (
                                <li key={n.id}>
                                    <button onClick={() => pick(n)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-slate-300 hover:bg-slate-800/80">
                                        <span className="size-2 shrink-0 rounded-full" style={{ background: meta(n.type).color }} />
                                        <span className="truncate">{n.label}</span>
                                        <span className="ml-auto shrink-0 text-[10px] text-slate-500">{meta(n.type).label}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    {q.trim() && results.length === 0 && (
                        <div className="absolute z-30 mt-1 w-full rounded-lg border border-slate-700/70 bg-slate-900/95 px-3 py-2 text-[12px] text-slate-500">No nodes match “{q}”.</div>
                    )}
                </div>
            </div>

            <div className="relative flex min-h-0 flex-1">
                {/* mobile scrim behind an open overlay panel */}
                {(leftOpen || rightOpen) && (
                    <div className="absolute inset-0 z-20 bg-black/50 md:hidden" onClick={() => { setLeftOpen(false); setRightOpen(false); }} />
                )}

                {/* LEFT — filters + legend */}
                {leftOpen ? (
                    <aside className="absolute inset-y-0 left-0 z-30 flex w-[82vw] max-w-[15rem] shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-800/70 bg-slate-950/95 p-3 backdrop-blur md:relative md:z-20 md:w-60 md:max-w-none md:bg-slate-950/70">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Filters</span>
                            <button onClick={() => setLeftOpen(false)} title="Hide panel" className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"><PanelLeftClose size={14} /></button>
                        </div>

                        <div>
                            <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wide text-slate-500">Node type</div>
                            <div className="flex flex-wrap gap-1.5">
                                {(graph?.filters.types ?? []).map((t) => {
                                    const on = typeFilter.has(t);
                                    return (
                                        <button
                                            key={t}
                                            onClick={() => setTypeFilter((s) => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n; })}
                                            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors ${on ? "border-transparent text-slate-950" : "border-slate-700/70 text-slate-300 hover:border-slate-600"}`}
                                            style={on ? { background: meta(t).color } : undefined}
                                        >
                                            <span className="size-2 rounded-full" style={{ background: on ? "#0b1120" : meta(t).color }} />
                                            {meta(t).label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {([
                            ["state", "State", graph?.filters.states],
                            ["crop", "Crop", graph?.filters.crops],
                            ["district", "District", graph?.filters.districts],
                            ["season", "Season", graph?.filters.seasons],
                        ] as const).map(([k, label, opts]) => (opts && opts.length > 0) ? (
                            <label key={k} className="block">
                                <div className="mb-1 text-[10.5px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
                                <select
                                    value={(facet as Record<string, string>)[k]}
                                    onChange={(e) => setFacet((f) => ({ ...f, [k]: e.target.value }))}
                                    className="w-full rounded-md border border-slate-700/70 bg-slate-900/80 px-2 py-1.5 text-[12px] text-slate-200 outline-none focus:border-emerald-500/50"
                                >
                                    <option value="">All {label.toLowerCase()}s</option>
                                    {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                                </select>
                            </label>
                        ) : null)}

                        <div className="border-t border-slate-800/70 pt-3">
                            <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-slate-500"><Layers size={11} /> Legend</div>
                            <ul className="space-y-1">
                                {(graph?.filters.types ?? Object.keys(TYPE)).map((t) => (
                                    <li key={t} className="flex items-center gap-2 text-[11.5px] text-slate-300">
                                        <span className="inline-block size-2.5 rounded-[3px]" style={{ background: meta(t).color }} />
                                        {meta(t).label}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="mt-auto border-t border-slate-800/70 pt-3 text-[11px]">
                            <div className="mb-1 flex items-center justify-between text-slate-400"><span>Node size</span></div>
                            <input type="range" min={0.6} max={1.8} step={0.1} value={nodeScale} onChange={(e) => setNodeScale(Number(e.target.value))} className="w-full accent-emerald-500" />
                            <label className="mt-2 flex items-center gap-2 text-slate-300">
                                <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} className="accent-emerald-500" /> Show labels
                            </label>
                        </div>
                    </aside>
                ) : (
                    <button onClick={() => setLeftOpen(true)} title="Show filters" className="absolute left-2 top-2 z-20 rounded-lg border border-slate-700/70 bg-slate-900/80 p-1.5 text-slate-400 backdrop-blur hover:text-slate-100"><PanelLeftOpen size={14} /></button>
                )}

                {/* CENTER — canvas + toolbar */}
                <div className="relative flex min-w-0 flex-1 flex-col">
                    <div ref={boxRef} className="h-full w-full flex-1" />

                    {/* toolbar */}
                    <div className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-xl border border-slate-700/70 bg-slate-900/85 p-1 backdrop-blur">
                        {([
                            [ZoomIn, "Zoom in", () => zoomBy(1.25)],
                            [ZoomOut, "Zoom out", () => zoomBy(0.8)],
                            [Frame, "Fit graph", fit],
                            [RotateCcw, "Reset view", reset],
                        ] as const).map(([Icon, tip, fn]) => (
                            <button key={tip} title={tip} onClick={fn} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"><Icon size={15} /></button>
                        ))}
                        <span className="mx-0.5 h-5 w-px bg-slate-700" />
                        <select
                            value={layoutName}
                            onChange={(e) => relayout(e.target.value as keyof typeof LAYOUTS)}
                            title="Layout"
                            className="rounded-lg bg-transparent px-1.5 py-1.5 text-[12px] text-slate-300 outline-none hover:text-slate-100"
                        >
                            {Object.keys(LAYOUTS).map((l) => <option key={l} value={l} className="bg-slate-900">{l}</option>)}
                        </select>
                        <span className="mx-0.5 h-5 w-px bg-slate-700" />
                        <button title={fullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={toggleFullscreen} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100">
                            {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                        </button>
                    </div>

                    {focusId && (
                        <button onClick={() => setFocusId(null)} className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-emerald-500/40 bg-emerald-950/70 px-3.5 py-1.5 text-[12px] font-medium text-emerald-300 backdrop-blur hover:bg-emerald-900/70">
                            Show full graph
                        </button>
                    )}

                    {/* overlays */}
                    {loading && (
                        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-[#070a12]/80 text-slate-400">
                            <Loader2 size={22} className="animate-spin text-emerald-400" />
                            <p className="text-[13px]">Loading knowledge graph…</p>
                        </div>
                    )}
                    {!loading && error && (
                        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[#070a12]/90 text-center">
                            <TriangleAlert size={24} className="text-amber-400" />
                            <p className="text-[13.5px] font-medium text-slate-200">Unable to load the knowledge graph.</p>
                            <p className="text-[12px] text-slate-500">{error}</p>
                            <button onClick={load} className="mt-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-1.5 text-[12.5px] text-slate-200 hover:bg-slate-700">Retry</button>
                        </div>
                    )}
                    {!loading && !error && graph && graph.nodes.length === 0 && (
                        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 text-slate-500">
                            <p className="text-[13.5px] font-medium text-slate-300">The knowledge graph is empty.</p>
                            <p className="text-[12px]">Ingest advisories or datasets to build it.</p>
                        </div>
                    )}
                    {!loading && !error && graph && cyRef.current && cyRef.current.elements(":visible").length === 0 && (
                        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                            <p className="rounded-lg border border-slate-700/70 bg-slate-900/90 px-4 py-2 text-[12.5px] text-slate-400">No nodes match your current filters.</p>
                        </div>
                    )}
                </div>

                {/* RIGHT — details */}
                {rightOpen ? (
                    <aside className="absolute inset-y-0 right-0 z-30 flex w-[86vw] max-w-[18rem] shrink-0 flex-col overflow-y-auto border-l border-slate-800/70 bg-slate-950/95 p-3 backdrop-blur md:relative md:z-20 md:w-72 md:max-w-none md:bg-slate-950/70">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Inspector</span>
                            <button onClick={() => setRightOpen(false)} title="Hide panel" className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"><PanelRightClose size={14} /></button>
                        </div>

                        {!selected && (
                            <p className="mt-4 text-[12px] leading-relaxed text-slate-500">
                                Click a node to inspect it — its type, metadata, connections, and a button to explore its neighbourhood. Click an edge to see the relationship.
                            </p>
                        )}

                        {selected?.kind === "node" && (() => {
                            const n = selected.data as GNode;
                            const m = n.metadata as Record<string, string>;
                            const rows = Object.entries(m).filter(([, v]) => v !== null && v !== "" && v !== undefined);
                            return (
                                <div className="mt-3 space-y-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <span className="rounded-md px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${meta(n.type).color}22`, color: meta(n.type).color }}>{meta(n.type).label}</span>
                                        <button onClick={() => setSelected(null)} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"><X size={14} /></button>
                                    </div>
                                    <h3 className="text-[14px] font-semibold leading-snug text-slate-100 break-words">{n.label}</h3>

                                    <div className="flex items-center gap-2 text-[12px] text-slate-400">
                                        <span className="rounded-md bg-slate-800/80 px-2 py-1 font-mono text-slate-300"><b className="text-slate-100">{selected.degree ?? 0}</b> connections</span>
                                    </div>

                                    <div className="flex gap-2">
                                        <button onClick={() => setFocusId(focusId === n.id ? null : n.id)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-600/20 py-1.5 text-[12px] font-medium text-emerald-300 hover:bg-emerald-600/35">
                                            <Crosshair size={13} /> {focusId === n.id ? "Unfocus" : "Explore connections"}
                                        </button>
                                        <button onClick={centerSelected} title="Center node" className="rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 text-slate-300 hover:bg-slate-700"><Frame size={13} /></button>
                                    </div>

                                    {rows.length > 0 ? (
                                        <dl className="space-y-1.5 border-t border-slate-800/70 pt-3 text-[12px]">
                                            {rows.map(([k, v]) => (
                                                <div key={k} className="flex gap-2">
                                                    <dt className="w-24 shrink-0 text-slate-500">{k.replace(/_/g, " ")}</dt>
                                                    <dd className="min-w-0 flex-1 break-words text-slate-300">
                                                        {/^https?:\/\//.test(String(v))
                                                            ? <a href={String(v)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-400 hover:underline">{String(v).replace(/^https?:\/\//, "").slice(0, 40)} <ExternalLink size={10} /></a>
                                                            : String(v)}
                                                    </dd>
                                                </div>
                                            ))}
                                        </dl>
                                    ) : (
                                        <p className="border-t border-slate-800/70 pt-3 text-[12px] text-slate-500">No additional information is available.</p>
                                    )}
                                    {n.type === "advisory" && !m.publication_date && (
                                        <p className="text-[11.5px] text-slate-500">Publication date unavailable.</p>
                                    )}
                                </div>
                            );
                        })()}

                        {selected?.kind === "edge" && (() => {
                            const e = selected.data as GEdge;
                            const srcN = graph?.nodes.find((x) => x.id === e.source);
                            const tgtN = graph?.nodes.find((x) => x.id === e.target);
                            return (
                                <div className="mt-3 space-y-3">
                                    <div className="flex items-start justify-between">
                                        <span className="rounded-md bg-slate-800/80 px-2 py-0.5 text-[11px] font-semibold text-slate-300">RELATIONSHIP</span>
                                        <button onClick={() => setSelected(null)} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"><X size={14} /></button>
                                    </div>
                                    <div className="rounded-lg border border-slate-800/70 bg-slate-900/60 p-3 text-center">
                                        <div className="text-[13px] font-medium text-slate-200">{srcN?.label}</div>
                                        <div className="my-1 font-mono text-[12px] text-emerald-400">↓ {e.relationship} ↓</div>
                                        <div className="text-[13px] font-medium text-slate-200">{tgtN?.label}</div>
                                    </div>
                                    <button
                                        onClick={() => { const c = cyRef.current; if (c && srcN) pick(srcN); }}
                                        className="w-full rounded-lg border border-slate-700 bg-slate-800/80 py-1.5 text-[12px] text-slate-300 hover:bg-slate-700"
                                    >Inspect {meta(srcN?.type ?? "").label || "source"}</button>
                                </div>
                            );
                        })()}
                    </aside>
                ) : (
                    <button onClick={() => setRightOpen(true)} title="Show inspector" className="absolute right-2 top-14 z-20 rounded-lg border border-slate-700/70 bg-slate-900/80 p-1.5 text-slate-400 backdrop-blur hover:text-slate-100"><PanelRightOpen size={14} /></button>
                )}
            </div>
        </div>
    );
}
