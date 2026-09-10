"use client";

/* Interactive Knowledge Graph Explorer.
 * Cytoscape.js canvas + zoom/pan/fit/reset/fullscreen, node drag, hover/select
 * highlighting, neighbourhood focus, client-side search & metadata filters,
 * collapsible filter + inspector panels, legend. Reads GET /graph/full only.
 * This file owns all of the page's styling — nothing global is touched. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import cytoscape, { type Core, type ElementDefinition, type NodeSingular, type EdgeSingular, type LayoutOptions } from "cytoscape";
import fcose from "cytoscape-fcose";
import {
    Search, ZoomIn, ZoomOut, Maximize2, Minimize2, RotateCcw, Frame,
    PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, X,
    Crosshair, Layers, ExternalLink, Loader2, TriangleAlert, ChevronRight,
} from "lucide-react";
import { API_ENDPOINTS } from "@/lib/api";

cytoscape.use(fcose);

// ---------------------------------------------------------------- data model
type GNode = { id: string; label: string; type: string; metadata: Record<string, unknown> };
type GEdge = { id: string; source: string; target: string; relationship: string };
type Stats = { sources: number; chunks: number; nodes: number; relationships: number; advisories: number };
type Filters = { types: string[]; states: string[]; crops: string[]; districts: string[]; seasons: string[]; advisory_types: string[] };
type Graph = { nodes: GNode[]; edges: GEdge[]; stats: Stats; filters: Filters };

const TYPE: Record<string, { label: string; color: string; shape: string; size: number; hub?: boolean }> = {
    advisory: { label: "Advisory", color: "#38bdf8", shape: "round-rectangle", size: 32 },
    crop: { label: "Crop", color: "#34d399", shape: "ellipse", size: 40, hub: true },
    district: { label: "District", color: "#f59e0b", shape: "round-diamond", size: 32 },
    state: { label: "State", color: "#f472b6", shape: "round-hexagon", size: 48, hub: true },
    season: { label: "Season", color: "#a78bfa", shape: "round-tag", size: 28 },
    stage: { label: "Growth stage", color: "#22d3ee", shape: "round-pentagon", size: 28 },
    source: { label: "Source", color: "#e2e8f0", shape: "star", size: 44, hub: true },
    dataset: { label: "Dataset", color: "#94a3b8", shape: "barrel", size: 46, hub: true },
};
const meta = (t: string) => TYPE[t] ?? { label: t, color: "#64748b", shape: "ellipse", size: 30 };

// light metadata grouping for the inspector — anything unmapped falls under "Details"
const META_GROUPS: { title: string; keys: string[] }[] = [
    { title: "Classification", keys: ["advisory_type", "problem_addressed", "weather_condition", "temporal_status"] },
    { title: "Location", keys: ["state", "state_code", "district", "district_code"] },
    { title: "Crop & timing", keys: ["crop", "crop_code", "full_name", "season", "crop_stage", "publication_date", "language"] },
    { title: "Source", keys: ["source_name", "organization", "source_url", "license"] },
    { title: "Index", keys: ["source_type", "origin", "chunk_count", "ref", "added"] },
];

/* eslint-disable @typescript-eslint/no-explicit-any */
const LAYOUTS: Record<string, LayoutOptions> = {
    Force: { name: "fcose", quality: "proof", animate: true, animationDuration: 550, randomize: true, nodeSeparation: 95, idealEdgeLength: 100, nodeRepulsion: 9500, padding: 40 } as any,
    Hierarchical: { name: "breadthfirst", directed: true, animate: true, animationDuration: 450, spacingFactor: 1.3, padding: 40 } as any,
    Radial: { name: "concentric", animate: true, animationDuration: 450, minNodeSpacing: 45, padding: 40, concentric: (n: NodeSingular) => n.degree(false), levelWidth: () => 2 } as any,
};

const stylesheet: any[] = [
    {
        selector: "node",
        style: {
            "background-color": "#0e1626",
            "border-width": 1.75,
            "border-color": ((n: NodeSingular) => meta(n.data("type")).color) as any,
            "border-opacity": 0.9,
            shape: ((n: NodeSingular) => meta(n.data("type")).shape) as any,
            width: ((n: NodeSingular) => n.data("size")) as any,
            height: ((n: NodeSingular) => n.data("size")) as any,
            label: "data(label)",
            color: "#94a3b8",
            "font-size": ((n: NodeSingular) => (meta(n.data("type")).hub ? 10 : 8.5)) as any,
            "font-weight": 500,
            "min-zoomed-font-size": ((n: NodeSingular) => (meta(n.data("type")).hub ? 6 : 9)) as any,
            "text-valign": "bottom",
            "text-margin-y": 4,
            "text-max-width": "130px",
            "text-wrap": "ellipsis",
            "text-background-color": "#080d18",
            "text-background-opacity": 0.7,
            "text-background-padding": "2px",
            "text-background-shape": "roundrectangle",
            "transition-property": "border-width, border-color, opacity, background-color",
            "transition-duration": 130,
        },
    },
    { selector: "node.nb", style: { "border-width": 2.5, "border-opacity": 1, color: "#cbd5e1", "min-zoomed-font-size": 4 } },
    { selector: "node.hl", style: { "border-width": 3, "border-opacity": 1, color: "#f1f5f9", "min-zoomed-font-size": 0, "font-size": 10.5, "z-index": 22 } },
    { selector: "node.dim", style: { opacity: 0.1, "text-opacity": 0.02 } },
    {
        selector: "node:selected",
        style: {
            "border-width": 4.5,
            "border-color": ((n: NodeSingular) => meta(n.data("type")).color) as any,
            "border-opacity": 1,
            "background-color": "#111c30",
            "overlay-color": ((n: NodeSingular) => meta(n.data("type")).color) as any,
            "overlay-opacity": 0.16,
            "overlay-padding": 12,
            color: "#f8fafc",
            "font-size": 11.5,
            "font-weight": 600,
            "min-zoomed-font-size": 0,
            "text-background-opacity": 0.92,
            "z-index": 30,
        },
    },
    {
        selector: "edge",
        style: {
            width: 0.7,
            "line-color": "#1e293b",
            "line-opacity": 0.5,
            "curve-style": "bezier",
            "target-arrow-color": "#1e293b",
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.6,
            label: "data(relationship)",
            "font-size": 7.5,
            color: "#94a3b8",
            "text-opacity": 0,
            "text-background-color": "#080d18",
            "text-background-opacity": 0.9,
            "text-background-padding": "2px",
            "min-zoomed-font-size": 11,
            "transition-property": "width, line-color, line-opacity, text-opacity",
            "transition-duration": 130,
        },
    },
    { selector: "edge.dim", style: { "line-opacity": 0.04, "text-opacity": 0 } },
    {
        selector: "edge.linked",
        style: {
            width: 1.5, "line-opacity": 0.8,
            "line-color": ((e: EdgeSingular) => meta(e.target().data("type")).color) as any,
            "target-arrow-color": ((e: EdgeSingular) => meta(e.target().data("type")).color) as any,
            "z-index": 12,
        },
    },
    {
        selector: "edge.hl",
        style: {
            width: 2.2, "line-opacity": 1, "text-opacity": 1,
            "line-color": ((e: EdgeSingular) => meta(e.target().data("type")).color) as any,
            "target-arrow-color": ((e: EdgeSingular) => meta(e.target().data("type")).color) as any,
            "z-index": 16,
        },
    },
    { selector: "edge:selected", style: { width: 2.4, "line-opacity": 1, "text-opacity": 1, "line-color": "#e2e8f0", "target-arrow-color": "#e2e8f0", "z-index": 16 } },
    { selector: ".filtered", style: { display: "none" } },
];

const PANEL_CSS = `
.kg-scroll::-webkit-scrollbar { width: 9px; height: 9px; }
.kg-scroll::-webkit-scrollbar-track { background: transparent; }
.kg-scroll::-webkit-scrollbar-thumb { background: #1f2937; border-radius: 6px; border: 2px solid transparent; background-clip: content-box; }
.kg-scroll::-webkit-scrollbar-thumb:hover { background: #374151; background-clip: content-box; }
.kg-scroll::-webkit-scrollbar-corner { background: transparent; }
.kg-scroll { scrollbar-width: thin; scrollbar-color: #1f2937 transparent; }
.kg-btn:focus-visible { outline: none; box-shadow: 0 0 0 1px rgba(16,185,129,0.5); }
.kg-range { accent-color: #10b981; }
`;

// ------------------------------------------------------------------ component
export default function KnowledgeGraph() {
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
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, []);
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
            cy.style().selector("node:selected").style("text-opacity", 1).update();
        });
    }, [nodeScale, showLabels, elements]);

    // selection -> persistent neighbour + linked-edge highlight
    useEffect(() => {
        const cy = cyRef.current;
        if (!cy) return;
        cy.batch(() => {
            cy.elements().removeClass("linked nb");
            if (selected?.kind === "node") {
                const el = cy.$id((selected.data as GNode).id);
                if (el.nonempty()) {
                    el.connectedEdges().addClass("linked");
                    el.connectedEdges().connectedNodes().addClass("nb");
                }
            } else if (selected?.kind === "edge") {
                cy.$id((selected.data as GEdge).id).addClass("linked");
            }
        });
    }, [selected]);

    // filters -> add/remove .filtered, re-fit
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

    // connections of the selected node, grouped by neighbour type
    const connGroups = useMemo(() => {
        if (!graph || selected?.kind !== "node") return [] as { type: string; items: { other: GNode; rel: string }[] }[];
        const id = (selected.data as GNode).id;
        const byId = new Map(graph.nodes.map((n) => [n.id, n]));
        const flat: { other: GNode; rel: string }[] = [];
        for (const e of graph.edges) {
            if (e.source === id) { const o = byId.get(e.target); if (o) flat.push({ other: o, rel: e.relationship }); }
            else if (e.target === id) { const o = byId.get(e.source); if (o) flat.push({ other: o, rel: e.relationship }); }
        }
        const by: Record<string, { other: GNode; rel: string }[]> = {};
        for (const c of flat) (by[c.other.type] ??= []).push(c);
        return Object.entries(by)
            .sort((a, b) => (meta(a[0]).hub ? -1 : 0) - (meta(b[0]).hub ? -1 : 0))
            .map(([type, items]) => ({ type, items: items.sort((a, b) => a.other.label.localeCompare(b.other.label)) }));
    }, [graph, selected]);

    // ---------------------------------------------------------------- render
    const st = graph?.stats;
    const shellCls = fullscreen
        ? "fixed inset-0 z-[100] flex flex-col bg-[#070a12]"
        : "absolute inset-0 flex flex-col bg-[#070a12]";

    const iconBtn = "kg-btn rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100";

    const Stat = ({ v, l, accent }: { v: string; l: string; accent?: boolean }) => (
        <div className="flex flex-col leading-none">
            <span className={`font-mono text-[13px] font-semibold ${accent ? "text-emerald-400" : "text-slate-200"}`}>{v}</span>
            <span className="mt-0.5 text-[9px] uppercase tracking-wider text-slate-500">{l}</span>
        </div>
    );

    return (
        <div className={shellCls}>
            <style>{PANEL_CSS}</style>

            {/* header: stats + search */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 border-b border-slate-800/60 bg-slate-950/70 px-4 py-2.5 backdrop-blur">
                {st ? (
                    <div className="flex items-center gap-4">
                        <Stat v={String(st.sources)} l="sources" />
                        <span className="h-6 w-px bg-slate-800" />
                        <Stat v={st.chunks.toLocaleString()} l="chunks" />
                        <span className="h-6 w-px bg-slate-800" />
                        <Stat v={String(st.nodes)} l="nodes" accent />
                        <span className="h-6 w-px bg-slate-800" />
                        <Stat v={String(st.relationships)} l="relationships" accent />
                    </div>
                ) : <span className="text-[12px] text-slate-500">Knowledge graph</span>}

                <div className="relative ml-auto w-full max-w-xs">
                    <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={(e) => e.key === "Escape" && setQ("")}
                        aria-label="Search the knowledge graph"
                        placeholder="Search the knowledge graph…"
                        className="kg-btn w-full rounded-lg border border-slate-800 bg-slate-900/70 py-1.5 pl-8 pr-3 text-[12.5px] text-slate-200 outline-none transition-colors placeholder:text-slate-500 focus:border-emerald-500/50"
                    />
                    {results.length > 0 && (
                        <ul className="kg-scroll absolute z-40 mt-1.5 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/95 py-1 shadow-xl shadow-black/40 backdrop-blur animate-in fade-in slide-in-from-top-1 duration-100">
                            {results.map((n) => (
                                <li key={n.id}>
                                    <button onClick={() => pick(n)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-slate-300 transition-colors hover:bg-slate-800/70">
                                        <span className="size-2 shrink-0 rounded-full" style={{ background: meta(n.type).color }} />
                                        <span className="truncate">{n.label}</span>
                                        <span className="ml-auto shrink-0 text-[10px] text-slate-500">{meta(n.type).label}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    {q.trim() && results.length === 0 && (
                        <div className="absolute z-40 mt-1.5 w-full rounded-lg border border-slate-800 bg-slate-900/95 px-3 py-2 text-[12px] text-slate-500">No nodes match “{q}”.</div>
                    )}
                </div>
            </div>

            <div className="relative flex min-h-0 flex-1">
                {/* scrim behind an open overlay panel */}
                {(leftOpen || rightOpen) && (
                    <div className="absolute inset-0 z-20 bg-black/50 backdrop-blur-[1px] md:hidden" onClick={() => { setLeftOpen(false); setRightOpen(false); }} />
                )}

                {/* LEFT — filters + legend */}
                {leftOpen ? (
                    <aside className="kg-scroll absolute inset-y-0 left-0 z-30 flex w-[80vw] max-w-[15rem] shrink-0 flex-col gap-3.5 overflow-y-auto border-r border-slate-800/60 bg-slate-950/95 p-3.5 backdrop-blur animate-in fade-in slide-in-from-left-2 duration-150 md:relative md:z-20 md:w-[15rem] md:max-w-none md:bg-slate-950/60">
                        <div className="flex items-center justify-between">
                            <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">Filters</span>
                            <button onClick={() => setLeftOpen(false)} aria-label="Hide filters" title="Hide filters" className={iconBtn}><PanelLeftClose size={13} /></button>
                        </div>

                        <div>
                            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">Node type</div>
                            <div className="flex flex-wrap gap-1.5">
                                {(graph?.filters.types ?? []).map((t) => {
                                    const on = typeFilter.has(t);
                                    const c = meta(t).color;
                                    return (
                                        <button
                                            key={t}
                                            aria-pressed={on}
                                            onClick={() => setTypeFilter((s) => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n; })}
                                            className={`kg-btn flex items-center gap-1.5 rounded-md border px-2 py-[3px] text-[11px] transition-colors ${on
                                                ? "font-medium"
                                                : "border-slate-700/50 bg-slate-900/40 text-slate-400 hover:border-slate-600 hover:bg-slate-800/50 hover:text-slate-200"}`}
                                            style={on ? { background: `${c}1f`, borderColor: c, color: c } : undefined}
                                        >
                                            <span className="size-[7px] rounded-full" style={{ background: c }} />
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
                                <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</div>
                                <select
                                    value={(facet as Record<string, string>)[k]}
                                    onChange={(e) => setFacet((f) => ({ ...f, [k]: e.target.value }))}
                                    className="kg-btn h-8 w-full rounded-md border border-slate-800 bg-slate-900/70 px-2 text-[12px] text-slate-200 outline-none transition-colors focus:border-emerald-500/50"
                                >
                                    <option value="">All {label.toLowerCase()}s</option>
                                    {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                                </select>
                            </label>
                        ) : null)}

                        <div className="border-t border-slate-800/60 pt-3">
                            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500"><Layers size={11} /> Legend</div>
                            <ul className="grid grid-cols-2 gap-x-2 gap-y-1">
                                {(graph?.filters.types ?? Object.keys(TYPE)).map((t) => (
                                    <li key={t} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                        <span className="inline-block size-2 rounded-[3px]" style={{ background: meta(t).color }} />
                                        {meta(t).label}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="mt-auto space-y-2 border-t border-slate-800/60 pt-3">
                            <div className="text-[11px] text-slate-400">Node size</div>
                            <input type="range" min={0.6} max={1.8} step={0.1} value={nodeScale} onChange={(e) => setNodeScale(Number(e.target.value))} className="kg-range kg-btn w-full" aria-label="Node size" />
                            <label className="flex cursor-pointer items-center gap-2 text-[11.5px] text-slate-400">
                                <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} className="kg-range" /> Show labels
                            </label>
                        </div>
                    </aside>
                ) : (
                    <button onClick={() => setLeftOpen(true)} aria-label="Show filters" title="Show filters" className="kg-btn absolute left-3 top-3 z-20 rounded-md border border-slate-800 bg-slate-900/80 p-1.5 text-slate-400 backdrop-blur transition-colors hover:text-slate-100"><PanelLeftOpen size={13} /></button>
                )}

                {/* CENTER — canvas + toolbar */}
                <div className="relative flex min-w-0 flex-1 flex-col">
                    <div ref={boxRef} className="h-full w-full flex-1" />

                    {/* toolbar */}
                    <div className="absolute right-3 top-3 z-20 flex items-center gap-0.5 rounded-lg border border-slate-800 bg-slate-900/80 p-1 shadow-lg shadow-black/30 backdrop-blur">
                        {([
                            [ZoomIn, "Zoom in", () => zoomBy(1.25)],
                            [ZoomOut, "Zoom out", () => zoomBy(0.8)],
                            [Frame, "Fit graph", fit],
                            [RotateCcw, "Reset view", reset],
                        ] as const).map(([Icon, tip, fn]) => (
                            <button key={tip} aria-label={tip} title={tip} onClick={fn} className={iconBtn}><Icon size={14} /></button>
                        ))}
                        <span className="mx-1 h-4 w-px bg-slate-700/60" />
                        <select
                            value={layoutName}
                            onChange={(e) => relayout(e.target.value as keyof typeof LAYOUTS)}
                            aria-label="Graph layout"
                            title="Layout"
                            className="kg-btn rounded-md bg-transparent px-1 py-1 text-[11.5px] text-slate-300 outline-none transition-colors hover:text-slate-100"
                        >
                            {Object.keys(LAYOUTS).map((l) => <option key={l} value={l} className="bg-slate-900">{l}</option>)}
                        </select>
                        <span className="mx-1 h-4 w-px bg-slate-700/60" />
                        <button aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"} title={fullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={toggleFullscreen} className={iconBtn}>
                            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                        </button>
                    </div>

                    {focusId && (
                        <button onClick={() => setFocusId(null)} className="kg-btn absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-emerald-500/40 bg-emerald-950/70 px-3.5 py-1.5 text-[12px] font-medium text-emerald-300 backdrop-blur transition-colors hover:bg-emerald-900/70 animate-in fade-in slide-in-from-top-1 duration-150">
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
                            <button onClick={load} className="kg-btn mt-1 rounded-md border border-slate-700 bg-slate-800 px-4 py-1.5 text-[12.5px] text-slate-200 transition-colors hover:bg-slate-700">Retry</button>
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
                            <p className="rounded-md border border-slate-800 bg-slate-900/90 px-4 py-2 text-[12.5px] text-slate-400">No nodes match your current filters.</p>
                        </div>
                    )}
                </div>

                {/* RIGHT — inspector (right drawer on desktop, bottom sheet on mobile) */}
                {rightOpen ? (
                    <aside className="kg-scroll absolute inset-x-0 bottom-0 z-30 flex max-h-[62vh] shrink-0 flex-col overflow-y-auto rounded-t-2xl border-t border-slate-800/60 bg-slate-950/95 p-3.5 backdrop-blur animate-in fade-in slide-in-from-bottom-3 duration-150 md:relative md:inset-x-auto md:bottom-auto md:inset-y-0 md:max-h-none md:w-[18rem] md:rounded-none md:border-l md:border-t-0 md:bg-slate-950/60 md:slide-in-from-right-2">
                        <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-slate-700 md:hidden" />
                        <div className="flex items-center justify-between">
                            <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">Inspector</span>
                            <button onClick={() => setRightOpen(false)} aria-label="Hide inspector" title="Hide inspector" className={iconBtn}><PanelRightClose size={13} /></button>
                        </div>

                        {!selected && (
                            <p className="mt-4 text-[12px] leading-relaxed text-slate-500">
                                Select a node to inspect its type, grouped metadata and connections — or click a connection to jump to it. Click an edge to see the relationship.
                            </p>
                        )}

                        {selected?.kind === "node" && (() => {
                            const n = selected.data as GNode;
                            const m = n.metadata as Record<string, string>;
                            const present = Object.entries(m).filter(([, v]) => v !== null && v !== "" && v !== undefined);
                            const used = new Set<string>();
                            const groups = META_GROUPS
                                .map((g) => ({ title: g.title, rows: present.filter(([k]) => g.keys.includes(k)) }))
                                .filter((g) => g.rows.length > 0);
                            groups.forEach((g) => g.rows.forEach(([k]) => used.add(k)));
                            const extra = present.filter(([k]) => !used.has(k));
                            if (extra.length) groups.push({ title: "Details", rows: extra });

                            const Row = ([k, v]: [string, string]) => (
                                <div key={k} className="flex gap-2">
                                    <dt className="w-[92px] shrink-0 text-slate-500">{k.replace(/_/g, " ")}</dt>
                                    <dd className="min-w-0 flex-1 break-words text-slate-300">
                                        {/^https?:\/\//.test(String(v))
                                            ? <a href={String(v)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-400 hover:underline">{String(v).replace(/^https?:\/\//, "").slice(0, 42)} <ExternalLink size={10} /></a>
                                            : String(v)}
                                    </dd>
                                </div>
                            );

                            return (
                                <div className="mt-3 space-y-3.5 animate-in fade-in duration-150">
                                    <div className="flex items-start justify-between gap-2">
                                        <span className="rounded-md px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide" style={{ background: `${meta(n.type).color}1f`, color: meta(n.type).color }}>{meta(n.type).label}</span>
                                        <button onClick={() => setSelected(null)} aria-label="Clear selection" className={iconBtn}><X size={13} /></button>
                                    </div>
                                    <h3 className="text-[14.5px] font-semibold leading-snug text-slate-100 break-words">{n.label}</h3>

                                    <div className="flex items-center gap-2">
                                        <span className="rounded-md bg-slate-800/70 px-2 py-1 font-mono text-[11.5px] text-slate-300"><b className="text-slate-100">{selected.degree ?? 0}</b> connections</span>
                                    </div>

                                    <div className="flex gap-2">
                                        <button onClick={() => setFocusId(focusId === n.id ? null : n.id)} className="kg-btn flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-600/15 py-1.5 text-[12px] font-medium text-emerald-300 transition-colors hover:bg-emerald-600/30">
                                            <Crosshair size={13} /> {focusId === n.id ? "Unfocus" : "Explore connections"}
                                        </button>
                                        <button onClick={centerSelected} aria-label="Center node" title="Center node" className="kg-btn rounded-lg border border-slate-700 bg-slate-800/70 px-2.5 text-slate-300 transition-colors hover:bg-slate-700"><Frame size={13} /></button>
                                    </div>

                                    {groups.length > 0 ? groups.map((g) => (
                                        <div key={g.title} className="border-t border-slate-800/60 pt-3">
                                            <div className="mb-1.5 text-[9.5px] font-medium uppercase tracking-wider text-slate-500">{g.title}</div>
                                            <dl className="space-y-1.5 text-[12px]">{g.rows.map((r) => Row(r as [string, string]))}</dl>
                                        </div>
                                    )) : (
                                        <p className="border-t border-slate-800/60 pt-3 text-[12px] text-slate-500">No additional information is available.</p>
                                    )}
                                    {n.type === "advisory" && !m.publication_date && (
                                        <p className="text-[11px] text-slate-500">Publication date unavailable.</p>
                                    )}

                                    {connGroups.length > 0 && (
                                        <div className="border-t border-slate-800/60 pt-3">
                                            <div className="mb-1.5 text-[9.5px] font-medium uppercase tracking-wider text-slate-500">Connected to</div>
                                            <div className="space-y-2">
                                                {connGroups.map((g) => (
                                                    <div key={g.type}>
                                                        <div className="mb-1 flex items-center gap-1.5 text-[10.5px] text-slate-400">
                                                            <span className="size-[7px] rounded-full" style={{ background: meta(g.type).color }} />
                                                            {meta(g.type).label}
                                                        </div>
                                                        <ul className="space-y-0.5">
                                                            {g.items.map(({ other, rel }) => (
                                                                <li key={other.id}>
                                                                    <button onClick={() => pick(other)} className="kg-btn group flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11.5px] text-slate-300 transition-colors hover:bg-slate-800/70">
                                                                        <span className="truncate">{other.label}</span>
                                                                        <span className="ml-auto shrink-0 font-mono text-[9.5px] text-slate-600">{rel}</span>
                                                                        <ChevronRight size={11} className="shrink-0 text-slate-600 transition-colors group-hover:text-slate-300" />
                                                                    </button>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {selected?.kind === "edge" && (() => {
                            const e = selected.data as GEdge;
                            const srcN = graph?.nodes.find((x) => x.id === e.source);
                            const tgtN = graph?.nodes.find((x) => x.id === e.target);
                            return (
                                <div className="mt-3 space-y-3 animate-in fade-in duration-150">
                                    <div className="flex items-start justify-between">
                                        <span className="rounded-md bg-slate-800/70 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-300">Relationship</span>
                                        <button onClick={() => setSelected(null)} aria-label="Clear selection" className={iconBtn}><X size={13} /></button>
                                    </div>
                                    <div className="rounded-lg border border-slate-800/60 bg-slate-900/50 p-3 text-center">
                                        <button onClick={() => srcN && pick(srcN)} className="kg-btn block w-full truncate rounded px-1 text-[12.5px] font-medium text-slate-200 hover:text-emerald-300">{srcN?.label}</button>
                                        <div className="my-1 font-mono text-[11.5px] text-emerald-400">↓ {e.relationship} ↓</div>
                                        <button onClick={() => tgtN && pick(tgtN)} className="kg-btn block w-full truncate rounded px-1 text-[12.5px] font-medium text-slate-200 hover:text-emerald-300">{tgtN?.label}</button>
                                    </div>
                                </div>
                            );
                        })()}
                    </aside>
                ) : (
                    <button onClick={() => setRightOpen(true)} aria-label="Show inspector" title="Show inspector" className="kg-btn absolute right-3 top-3 z-20 rounded-md border border-slate-800 bg-slate-900/80 p-1.5 text-slate-400 backdrop-blur transition-colors hover:text-slate-100 md:top-16"><PanelRightOpen size={13} /></button>
                )}
            </div>
        </div>
    );
}
