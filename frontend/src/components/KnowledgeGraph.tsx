"use client";

/* Agronomic Knowledge Graph — NOVA-style interactive entity/relationship explorer.
 *
 * Designed for READABILITY:
 * - Defaults to a small, focused 1-hop neighborhood (Rice / featured entity + direct neighbors).
 * - Unrelated nodes are hidden completely rather than cluttering the background.
 * - Unified rounded-rectangle node language with icons, readable labels, and type tags.
 * - Technical IDs (e.g. ADV-CROP-RICE-01-THA) are moved to the inspector metadata.
 * - Category-aware sector layout: Top=Season, Left=District/State, Right=Advisory/Dataset, Bottom=Crop/Stage/Source.
 * - Simple edges: thin, subtle, low-opacity lines with interactive hover triples.
 * - Exploration navigation: clicking any node centers that entity, reveals its neighborhood, and updates history.
 * - Progressive disclosure: [1-Hop] [2-Hop] toggle, [Show more connections], and opt-in [Show Full Graph].
 * - Scoped dark scrollbars (.kg-scroll) — zero global CSS side effects.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import cytoscape, {
    type Core,
    type ElementDefinition,
    type NodeSingular,
    type EdgeSingular,
    type LayoutOptions,
} from "cytoscape";
import fcose from "cytoscape-fcose";
import {
    Search, ZoomIn, ZoomOut, Maximize2, Minimize2, RotateCcw, Frame,
    PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, X,
    Layers, ExternalLink, Loader2, TriangleAlert, ChevronRight, ChevronDown,
    FileText, Sprout, MapPin, Map as MapIcon, CalendarDays, Leaf, Building2, Database,
    Circle, ArrowLeft, ArrowRight, Eye, Focus,
} from "lucide-react";
import { API_ENDPOINTS } from "@/lib/api";
import { useTranslation } from "@/i18n";

cytoscape.use(fcose);

// ---------------------------------------------------------------- data model
export type GNode = {
    id: string;
    label: string;
    type: string;
    metadata: Record<string, unknown>;
};

export type GEdge = {
    id: string;
    source: string;
    target: string;
    relationship: string;
};

export type Stats = {
    sources: number;
    chunks: number;
    nodes: number;
    relationships: number;
    advisories: number;
};

export type Filters = {
    types: string[];
    states: string[];
    crops: string[];
    districts: string[];
    seasons: string[];
    advisory_types: string[];
};

export type GraphData = {
    nodes: GNode[];
    edges: GEdge[];
    stats: Stats;
    filters: Filters;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export const TYPE_CONFIG: Record<string, { label: string; color: string; emoji: string; Icon: any; hub?: boolean }> = {
    crop: { label: "Crop", color: "#34d399", emoji: "🌾", Icon: Sprout, hub: true },
    advisory: { label: "Advisory", color: "#38bdf8", emoji: "📋", Icon: FileText },
    district: { label: "District", color: "#f59e0b", emoji: "📍", Icon: MapPin },
    state: { label: "State", color: "#f472b6", emoji: "🏛️", Icon: MapIcon, hub: true },
    season: { label: "Season", color: "#a78bfa", emoji: "🗓️", Icon: CalendarDays },
    stage: { label: "Growth stage", color: "#22d3ee", emoji: "🌱", Icon: Leaf },
    source: { label: "Source", color: "#cbd5e1", emoji: "🏢", Icon: Building2, hub: true },
    dataset: { label: "Dataset", color: "#94a3b8", emoji: "🗄️", Icon: Database, hub: true },
};

const getMeta = (t: string) =>
    TYPE_CONFIG[t] ?? { label: t, color: "#64748b", emoji: "●", Icon: Circle };

// Metadata grouping for the inspector
const META_GROUPS: { title: string; keys: string[] }[] = [
    { title: "Classification", keys: ["advisory_type", "problem_addressed", "weather_condition", "temporal_status"] },
    { title: "Location", keys: ["state", "state_code", "district", "district_code"] },
    { title: "Crop & timing", keys: ["crop", "crop_code", "full_name", "season", "crop_stage", "publication_date", "language"] },
    { title: "Source", keys: ["source_name", "organization", "source_url", "license"] },
    { title: "Index", keys: ["source_type", "origin", "chunk_count", "ref", "added"] },
];

// ---------------------------------------------------------------- sector layout
function computeSectorPositions(
    centerId: string,
    neighbors: GNode[],
): Record<string, { x: number; y: number }> {
    const positions: Record<string, { x: number; y: number }> = {};
    positions[centerId] = { x: 0, y: 0 };

    const sectors: Record<"top" | "left" | "right" | "bottom", GNode[]> = {
        top: [],
        left: [],
        right: [],
        bottom: [],
    };

    for (const n of neighbors) {
        if (n.type === "season") {
            sectors.top.push(n);
        } else if (n.type === "district" || n.type === "state") {
            sectors.left.push(n);
        } else if (n.type === "advisory" || n.type === "dataset") {
            sectors.right.push(n);
        } else {
            sectors.bottom.push(n);
        }
    }

    const baseAngles = {
        top: -Math.PI / 2,     // -90 deg
        left: Math.PI,          // 180 deg
        right: 0,              // 0 deg
        bottom: Math.PI / 2,   // 90 deg
    };

    const sectorSpread = {
        top: Math.PI / 3,       // 60 deg
        left: Math.PI / 2.2,    // 80 deg
        right: Math.PI / 2.2,   // 80 deg
        bottom: Math.PI / 2.5,  // 72 deg
    };

    const radius = 230;

    for (const [secKey, nodes] of Object.entries(sectors) as [keyof typeof sectors, GNode[]][]) {
        if (nodes.length === 0) continue;
        const base = baseAngles[secKey];
        const spread = sectorSpread[secKey];

        if (nodes.length === 1) {
            positions[nodes[0].id] = {
                x: Math.round(Math.cos(base) * radius),
                y: Math.round(Math.sin(base) * radius),
            };
        } else {
            const step = spread / Math.max(1, nodes.length - 1);
            const start = base - spread / 2;
            nodes.forEach((n, idx) => {
                const angle = start + idx * step;
                const r = radius + (idx % 2 === 1 && nodes.length > 3 ? 45 : 0);
                positions[n.id] = {
                    x: Math.round(Math.cos(angle) * r),
                    y: Math.round(Math.sin(angle) * r),
                };
            });
        }
    }

    return positions;
}

const LAYOUTS: Record<string, LayoutOptions> = {
    Sector: { name: "preset" } as any,
    Force: {
        name: "fcose",
        quality: "proof",
        animate: true,
        animationDuration: 400,
        randomize: false,
        nodeSeparation: 90,
        idealEdgeLength: 120,
        nodeRepulsion: 8000,
        padding: 50,
    } as any,
    Radial: {
        name: "concentric",
        animate: true,
        animationDuration: 350,
        minNodeSpacing: 50,
        padding: 50,
        concentric: (n: NodeSingular) => (n.hasClass("center-anchor") ? 10 : 2),
        levelWidth: () => 2,
    } as any,
    Hierarchical: {
        name: "breadthfirst",
        directed: true,
        animate: true,
        animationDuration: 350,
        spacingFactor: 1.4,
        padding: 50,
    } as any,
};

// ---------------------------------------------------------------- cytoscape styles
const stylesheet: any[] = [
    {
        selector: "node",
        style: {
            shape: "round-rectangle",
            "corner-radius": 8,
            width: 148,
            height: 48,
            "background-color": "#0d1527",
            "border-width": 1.5,
            "border-color": ((n: NodeSingular) => getMeta(n.data("type")).color) as any,
            "border-opacity": 0.65,
            label: ((n: NodeSingular) => {
                const icon = getMeta(n.data("type")).emoji;
                const lbl = n.data("label") || "";
                const truncated = lbl.length > 22 ? lbl.slice(0, 20) + "…" : lbl;
                const typeName = (getMeta(n.data("type")).label || n.data("type")).toUpperCase();
                return `${icon}  ${truncated}\n${typeName}`;
            }) as any,
            color: "#e2e8f0",
            "font-size": 10.5,
            "font-weight": 500,
            "font-family": "Inter, system-ui, sans-serif",
            "text-valign": "center",
            "text-halign": "center",
            "text-wrap": "wrap",
            "text-max-width": "138px",
            "line-height": 1.35,
            "transition-property": "border-width, border-color, opacity, background-color, width, height",
            "transition-duration": 150,
        },
    },
    {
        selector: "node.center-anchor",
        style: {
            width: 172,
            height: 56,
            "border-width": 2.75,
            "border-color": "#22d3ee",
            "border-opacity": 1,
            "background-color": "#111d33",
            "overlay-color": "#22d3ee",
            "overlay-opacity": 0.16,
            "overlay-padding": 8,
            color: "#ffffff",
            "font-size": 11.5,
            "font-weight": 600,
            "z-index": 30,
        },
    },
    {
        selector: "node:selected",
        style: {
            "border-width": 2.5,
            "border-color": "#38bdf8",
            "overlay-color": "#38bdf8",
            "overlay-opacity": 0.18,
            "overlay-padding": 8,
            "z-index": 35,
        },
    },
    {
        selector: "node.hl",
        style: {
            "border-width": 2.2,
            "border-opacity": 1,
            color: "#ffffff",
            "z-index": 25,
        },
    },
    {
        selector: "node.hidden-unrelated",
        style: {
            display: "none",
        },
    },
    {
        selector: "edge",
        style: {
            width: 1.2,
            "line-color": "#334155",
            "line-opacity": 0.45,
            "curve-style": "bezier",
            "target-arrow-color": "#475569",
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.65,
            label: "data(relationship)",
            "font-size": 8.5,
            color: "#94a3b8",
            "text-opacity": 0,
            "text-background-color": "#090d16",
            "text-background-opacity": 0.9,
            "text-background-padding": "2px",
            "text-background-shape": "roundrectangle",
            "transition-property": "width, line-color, line-opacity, text-opacity",
            "transition-duration": 130,
        },
    },
    {
        selector: "edge.incident-center",
        style: {
            width: 1.8,
            "line-color": ((e: EdgeSingular) => getMeta(e.target().data("type")).color) as any,
            "line-opacity": 0.85,
            "target-arrow-color": ((e: EdgeSingular) => getMeta(e.target().data("type")).color) as any,
            "z-index": 15,
        },
    },
    {
        selector: "edge.hl",
        style: {
            width: 2.5,
            "line-opacity": 1,
            "text-opacity": 1,
            "line-color": "#22d3ee",
            "target-arrow-color": "#22d3ee",
            "z-index": 20,
        },
    },
    {
        selector: "edge.hidden-unrelated",
        style: {
            display: "none",
        },
    },
];

const PAGE_CSS = `
.kg-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
.kg-scroll::-webkit-scrollbar-track { background: transparent; }
.kg-scroll::-webkit-scrollbar-thumb { background: #1f2937; border-radius: 6px; border: 2px solid transparent; background-clip: content-box; }
.kg-scroll::-webkit-scrollbar-thumb:hover { background: #374151; background-clip: content-box; }
.kg-scroll::-webkit-scrollbar-corner { background: transparent; }
.kg-scroll { scrollbar-width: thin; scrollbar-color: #1f2937 transparent; }
.kg-btn:focus-visible { outline: none; box-shadow: 0 0 0 1.5px rgba(34,211,238,0.55); }
.kg-range { accent-color: #22d3ee; }
.kg-canvas-wrap { background: radial-gradient(ellipse 65% 60% at 50% 45%, rgba(34,211,238,0.04), transparent 75%); }
.kg-dots {
  background-image: radial-gradient(circle at center, rgba(148,163,184,0.09) 1px, transparent 1.6px);
  background-size: 24px 24px;
  -webkit-mask-image: radial-gradient(ellipse 78% 78% at 50% 45%, #000 38%, transparent 100%);
  mask-image: radial-gradient(ellipse 78% 78% at 50% 45%, #000 38%, transparent 100%);
}
`;

// ---------------------------------------------------------------- component
export default function KnowledgeGraph() {
    const { t } = useTranslation();
    const boxRef = useRef<HTMLDivElement>(null);
    const cyRef = useRef<Core | null>(null);
    const layoutTimerRef = useRef<NodeJS.Timeout | null>(null);

    const [graph, setGraph] = useState<GraphData | null>(null);
    const [error, setError] = useState<string>("");
    const [loading, setLoading] = useState(true);

    const wide = typeof window !== "undefined" && window.innerWidth >= 1024;
    const [leftOpen, setLeftOpen] = useState(wide);
    const [rightOpen, setRightOpen] = useState(wide);
    const [fullscreen, setFullscreen] = useState(false);
    const [refineOpen, setRefineOpen] = useState(false);
    const [legendOpen, setLegendOpen] = useState(false);

    // Focused Explorer State
    const [focusId, setFocusId] = useState<string | null>(null);
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState<number>(-1);

    const [hop, setHop] = useState<1 | 2>(1);
    const [connectionLimit, setConnectionLimit] = useState<number>(10);
    const [fullGraphMode, setFullGraphMode] = useState<boolean>(false);

    const [selected, setSelected] = useState<{ kind: "node" | "edge"; data: GNode | GEdge; degree?: number } | null>(null);
    const [hoverEdge, setHoverEdge] = useState<GEdge | null>(null);

    const [layoutName, setLayoutName] = useState<keyof typeof LAYOUTS>("Sector");
    const [q, setQ] = useState("");
    const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
    const [facet, setFacet] = useState<{ state: string; crop: string; season: string; district: string }>({
        state: "", crop: "", season: "", district: "",
    });

    // -------------------------------------------------------------- fetch
    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(API_ENDPOINTS.graphFull, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const g: GraphData = await res.json();
            setGraph(g);

            // Default focus on Rice or first available crop node
            const riceNode = g.nodes.find((n) => n.id === "crop:CROP-RICE" || n.label.toLowerCase() === "rice");
            const firstCrop = riceNode || g.nodes.find((n) => n.type === "crop") || g.nodes[0];
            if (firstCrop) {
                setFocusId(firstCrop.id);
                setHistory([firstCrop.id]);
                setHistoryIndex(0);
                setSelected({ kind: "node", data: firstCrop });
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    // -------------------------------------------------------------- derived maps
    const nodeById = useMemo(() => new Map((graph?.nodes ?? []).map((n) => [n.id, n])), [graph]);

    const degreeById = useMemo(() => {
        const d = new Map<string, number>();
        for (const e of graph?.edges ?? []) {
            d.set(e.source, (d.get(e.source) ?? 0) + 1);
            d.set(e.target, (d.get(e.target) ?? 0) + 1);
        }
        return d;
    }, [graph]);

    const adjacency = useMemo(() => {
        const a = new Map<string, Set<string>>();
        const add = (x: string, y: string) => { (a.get(x) ?? a.set(x, new Set()).get(x)!).add(y); };
        for (const e of graph?.edges ?? []) {
            add(e.source, e.target);
            add(e.target, e.source);
        }
        return a;
    }, [graph]);

    const typeCounts = useMemo(() => {
        const c: Record<string, number> = {};
        for (const n of graph?.nodes ?? []) c[n.type] = (c[n.type] ?? 0) + 1;
        return c;
    }, [graph]);

    const matchNode = useCallback((n: GNode) => {
        if (typeFilter.size && !typeFilter.has(n.type)) return false;
        const m = n.metadata as Record<string, string>;
        if (facet.state && n.type === "state" && n.label !== facet.state) return false;
        if (facet.state && m.state && m.state !== facet.state && ["advisory", "district"].includes(n.type)) return false;
        if (facet.crop && n.type === "crop" && n.label !== facet.crop) return false;
        if (facet.crop && n.type === "advisory" && m.crop && !String(m.crop).startsWith(facet.crop) && m.crop !== facet.crop) return false;
        if (facet.season && n.type === "season" && n.label !== facet.season) return false;
        if (facet.season && n.type === "advisory" && m.season && m.season !== facet.season) return false;
        if (facet.district && n.type === "district" && n.label !== facet.district) return false;
        if (facet.district && n.type === "advisory" && m.district && m.district !== facet.district) return false;
        return true;
    }, [typeFilter, facet]);

    const anyFilter = typeFilter.size > 0 || !!facet.state || !!facet.crop || !!facet.season || !!facet.district;

    // Entity browser list
    const entityList = useMemo(() => {
        if (!graph) return [];
        const s = q.trim().toLowerCase();
        return graph.nodes
            .filter(matchNode)
            .filter((n) => !s || n.label.toLowerCase().includes(s) || Object.values(n.metadata).some((v) => String(v).toLowerCase().includes(s)))
            .sort((a, b) => (degreeById.get(b.id) ?? 0) - (degreeById.get(a.id) ?? 0) || a.label.localeCompare(b.label));
    }, [graph, matchNode, q, degreeById]);

    // Search dropdown quick jump
    const searchResults = useMemo(() => {
        if (!graph || q.trim().length < 1) return [];
        const s = q.toLowerCase();
        return graph.nodes
            .filter((n) => n.label.toLowerCase().includes(s) || Object.values(n.metadata).some((v) => String(v).toLowerCase().includes(s)))
            .slice(0, 10);
    }, [graph, q]);

    // -------------------------------------------------------------- focused visible set
    const focusedNeighborhood = useMemo(() => {
        if (!graph || !focusId) return { visibleNodeIds: new Set<string>(), totalDirect: 0, directNeighbors: [] as GNode[] };

        const directEdges = graph.edges.filter((e) => e.source === focusId || e.target === focusId);
        const totalDirect = directEdges.length;

        // Group direct neighbors by entity type for balanced diversity
        const byType: Record<string, GNode[]> = {};
        for (const e of directEdges) {
            const nId = e.source === focusId ? e.target : e.source;
            const node = nodeById.get(nId);
            if (node) {
                (byType[node.type] ??= []).push(node);
            }
        }

        const selectedIds = new Set<string>();
        const typeOrder = ["district", "season", "crop", "source", "state", "stage", "dataset", "advisory"];
        const allTypes = [...typeOrder.filter((t) => t in byType), ...Object.keys(byType).filter((t) => !typeOrder.includes(t))];

        // Pass 1: balanced selection (up to 2 per category)
        for (const t of allTypes) {
            const list = byType[t] || [];
            for (const n of list) {
                if (selectedIds.size >= connectionLimit) break;
                const count = Array.from(selectedIds).filter((id) => nodeById.get(id)?.type === t).length;
                if (count < 2) {
                    selectedIds.add(n.id);
                }
            }
            if (selectedIds.size >= connectionLimit) break;
        }

        // Pass 2: fill remaining slots up to connectionLimit
        if (selectedIds.size < connectionLimit) {
            for (const t of allTypes) {
                for (const n of byType[t] || []) {
                    if (selectedIds.size >= connectionLimit) break;
                    selectedIds.add(n.id);
                }
                if (selectedIds.size >= connectionLimit) break;
            }
        }

        // Opt-in 2-Hop additions
        if (hop === 2) {
            const hop2Cap = Math.min(24, connectionLimit * 2);
            for (const h1Id of Array.from(selectedIds)) {
                if (selectedIds.size >= hop2Cap) break;
                const h2Set = adjacency.get(h1Id) ?? new Set<string>();
                for (const h2Id of h2Set) {
                    if (h2Id !== focusId && !selectedIds.has(h2Id)) {
                        selectedIds.add(h2Id);
                        if (selectedIds.size >= hop2Cap) break;
                    }
                }
            }
        }

        const directNeighborNodes = Array.from(selectedIds)
            .map((id) => nodeById.get(id))
            .filter((n): n is GNode => Boolean(n));

        const allVisible = new Set<string>(selectedIds);
        allVisible.add(focusId);

        return {
            visibleNodeIds: allVisible,
            totalDirect,
            directNeighbors: directNeighborNodes,
        };
    }, [graph, focusId, connectionLimit, hop, nodeById, adjacency]);

    // Elements definition for Cytoscape
    const elements = useMemo<ElementDefinition[]>(() => {
        if (!graph) return [];
        const ids = new Set(graph.nodes.map((n) => n.id));
        return [
            ...graph.nodes.map((n) => ({
                data: {
                    id: n.id,
                    label: n.label,
                    type: n.type,
                    raw: n,
                },
            })),
            ...graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => ({
                data: {
                    id: e.id,
                    source: e.source,
                    target: e.target,
                    relationship: e.relationship,
                    raw: e,
                },
            })),
        ];
    }, [graph]);

    // -------------------------------------------------------------- navigation actions
    const navigateToEntity = useCallback((id: string, pushHistory = true) => {
        const node = nodeById.get(id);
        if (!node) return;

        setFocusId(id);
        setSelected({ kind: "node", data: node, degree: degreeById.get(id) });
        setFullGraphMode(false);

        if (pushHistory) {
            setHistory((prev) => {
                const next = prev.slice(0, historyIndex + 1);
                next.push(id);
                return next;
            });
            setHistoryIndex((prev) => prev + 1);
        }
    }, [nodeById, degreeById, historyIndex]);

    const goBack = useCallback(() => {
        if (historyIndex > 0) {
            const prevId = history[historyIndex - 1];
            setHistoryIndex((idx) => idx - 1);
            navigateToEntity(prevId, false);
        }
    }, [history, historyIndex, navigateToEntity]);

    const goForward = useCallback(() => {
        if (historyIndex < history.length - 1) {
            const nextId = history[historyIndex + 1];
            setHistoryIndex((idx) => idx + 1);
            navigateToEntity(nextId, false);
        }
    }, [history, historyIndex, navigateToEntity]);

    // -------------------------------------------------------------- mount cytoscape
    useEffect(() => {
        if (!boxRef.current || !elements.length) return;

        const cy = cytoscape({
            container: boxRef.current,
            elements,
            style: stylesheet,
            minZoom: 0.15,
            maxZoom: 3.5,
            wheelSensitivity: 0.25,
            boxSelectionEnabled: false,
        });
        cyRef.current = cy;

        const clearHl = () => { cy.elements().removeClass("hl"); };

        cy.on("mouseover", "node", (ev) => {
            const n = ev.target as NodeSingular;
            if (n.hasClass("hidden-unrelated")) return;
            clearHl();
            n.addClass("hl");
            n.connectedEdges().not(".hidden-unrelated").addClass("hl");
        });

        cy.on("mouseout", "node", clearHl);

        cy.on("mouseover", "edge", (ev) => {
            const e = ev.target as EdgeSingular;
            if (e.hasClass("hidden-unrelated")) return;
            clearHl();
            e.addClass("hl");
            setHoverEdge(e.data("raw"));
        });

        cy.on("mouseout", "edge", () => {
            clearHl();
            setHoverEdge(null);
        });

        cy.on("tap", "node", (ev) => {
            const n = ev.target as NodeSingular;
            if (n.hasClass("hidden-unrelated")) return;
            navigateToEntity(n.id());
        });

        cy.on("tap", "edge", (ev) => {
            const e = ev.target as EdgeSingular;
            if (e.hasClass("hidden-unrelated")) return;
            setSelected({ kind: "edge", data: e.data("raw") });
        });

        return () => {
            if (layoutTimerRef.current) {
                clearTimeout(layoutTimerRef.current);
                layoutTimerRef.current = null;
            }
            if (cy && !cy.destroyed()) {
                try {
                    cy.destroy();
                } catch (err) {
                    // Safe guard during teardown
                }
            }
            cyRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [elements]);

    // -------------------------------------------------------------- layout & visibility update
    const applyCurrentLayout = useCallback(() => {
        const cy = cyRef.current;
        if (!cy || cy.destroyed() || !focusId) return;

        if (layoutTimerRef.current) {
            clearTimeout(layoutTimerRef.current);
            layoutTimerRef.current = null;
        }

        const visibleIds = fullGraphMode
            ? new Set(graph?.nodes.filter(matchNode).map((n) => n.id))
            : focusedNeighborhood.visibleNodeIds;

        cy.batch(() => {
            cy.nodes().forEach((n) => {
                const isVis = visibleIds.has(n.id()) && matchNode(n.data("raw"));
                n.toggleClass("hidden-unrelated", !isVis);
                n.toggleClass("center-anchor", n.id() === focusId);
            });

            cy.edges().forEach((e) => {
                const srcVis = visibleIds.has(e.source().id()) && matchNode(e.source().data("raw"));
                const tgtVis = visibleIds.has(e.target().id()) && matchNode(e.target().data("raw"));
                const isVis = srcVis && tgtVis;
                e.toggleClass("hidden-unrelated", !isVis);
                e.toggleClass("incident-center", isVis && (e.source().id() === focusId || e.target().id() === focusId));
            });
        });

        const activeEles = cy.elements(":visible");
        if (!activeEles.length) return;

        if (layoutName === "Sector" && !fullGraphMode) {
            const pos = computeSectorPositions(focusId, focusedNeighborhood.directNeighbors);
            cy.layout({
                name: "preset",
                positions: (n: NodeSingular) => pos[n.id()] ?? { x: 0, y: 0 },
                animate: true,
                animationDuration: 320,
            } as any).run();
        } else {
            const targetLayout = fullGraphMode ? LAYOUTS.Force : LAYOUTS[layoutName];
            cy.layout({
                ...targetLayout,
                eles: activeEles,
                animate: true,
                animationDuration: 350,
            } as any).run();
        }

        layoutTimerRef.current = setTimeout(() => {
            if (!cy || cy.destroyed() || cyRef.current !== cy) return;
            try {
                const currentVis = cy.elements(":visible");
                if (currentVis && currentVis.nonempty()) {
                    cy.animate({
                        fit: { eles: currentVis, padding: 50 },
                        duration: 250,
                    });
                }
            } catch (err) {
                // Safeguard against teardown / race condition
            }
        }, 360);
    }, [focusId, fullGraphMode, graph, matchNode, focusedNeighborhood, layoutName]);

    useEffect(() => {
        applyCurrentLayout();
    }, [applyCurrentLayout]);

    // Highlight selected element
    useEffect(() => {
        const cy = cyRef.current;
        if (!cy || cy.destroyed()) return;
        try {
            cy.batch(() => {
                cy.$(":selected").unselect();
                if (selected?.kind === "node") {
                    cy.$id((selected.data as GNode).id).select();
                } else if (selected?.kind === "edge") {
                    cy.$id((selected.data as GEdge).id).select();
                }
            });
        } catch (err) {
            // ignore
        }
    }, [selected]);

    // Handle panel resize
    useEffect(() => {
        const cy = cyRef.current;
        if (!cy) return;
        const t = setTimeout(() => {
            if (cy && !cy.destroyed() && cyRef.current === cy) {
                try {
                    cy.resize();
                } catch (err) {
                    // ignore
                }
            }
        }, 260);
        return () => clearTimeout(t);
    }, [leftOpen, rightOpen, fullscreen]);

    // -------------------------------------------------------------- toolbar actions
    const zoomBy = (factor: number) => {
        const cy = cyRef.current;
        if (!cy || cy.destroyed()) return;
        try {
            cy.animate({ zoom: Math.min(3.5, Math.max(0.15, cy.zoom() * factor)) }, { duration: 150 });
        } catch (err) {
            // ignore
        }
    };

    const fitView = () => {
        const cy = cyRef.current;
        if (!cy || cy.destroyed()) return;
        try {
            const vis = cy.elements(":visible");
            if (vis && vis.nonempty()) {
                cy.animate({ fit: { eles: vis, padding: 50 }, duration: 250 });
            }
        } catch (err) {
            // ignore
        }
    };

    const resetView = () => {
        setQ("");
        setTypeFilter(new Set());
        setFacet({ state: "", crop: "", season: "", district: "" });
        setHop(1);
        setConnectionLimit(10);
        setFullGraphMode(false);
        setLayoutName("Sector");

        const riceNode = graph?.nodes.find((n) => n.id === "crop:CROP-RICE" || n.label.toLowerCase() === "rice");
        const center = riceNode || graph?.nodes.find((n) => n.type === "crop") || graph?.nodes[0];
        if (center) {
            navigateToEntity(center.id);
        }
    };

    const toggleFullscreen = () => setFullscreen((v) => !v);

    // -------------------------------------------------------------- inspector data
    const selNode = selected?.kind === "node" ? (selected.data as GNode) : null;

    const relGroups = useMemo(() => {
        if (!graph || !selNode) return [];
        const id = selNode.id;
        const list: { other: GNode; rel: string; dir: "out" | "in" }[] = [];
        for (const e of graph.edges) {
            if (e.source === id) {
                const o = nodeById.get(e.target);
                if (o) list.push({ other: o, rel: e.relationship, dir: "out" });
            } else if (e.target === id) {
                const o = nodeById.get(e.source);
                if (o) list.push({ other: o, rel: e.relationship, dir: "in" });
            }
        }
        const by: Record<string, { other: GNode; rel: string; dir: "out" | "in" }[]> = {};
        for (const item of list) (by[item.other.type] ??= []).push(item);

        return Object.entries(by)
            .sort((a, b) => (getMeta(a[0]).hub ? -1 : 0) - (getMeta(b[0]).hub ? -1 : 0))
            .map(([type, items]) => ({
                type,
                items: items.sort((a, b) => a.other.label.localeCompare(b.other.label)),
            }));
    }, [graph, selNode, nodeById]);

    // -------------------------------------------------------------- render
    const st = graph?.stats;
    const shellCls = fullscreen
        ? "fixed inset-0 z-[100] flex flex-col bg-[#070a12]"
        : "absolute inset-0 flex flex-col bg-[#070a12]";
    const iconBtn = "kg-btn rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100";
    const facetSelect = "kg-btn h-8 w-full rounded-md border border-slate-800 bg-slate-900/70 px-2 text-[12px] text-slate-200 outline-none transition-colors focus:border-cyan-500/50";

    const focusedCenterNode = focusId ? nodeById.get(focusId) : null;
    const focusedName = focusedCenterNode ? focusedCenterNode.label : "Interactive Explorer";

    return (
        <div className={shellCls}>
            <style>{PAGE_CSS}</style>

            {/* ── top header + stats ─────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-slate-800/60 bg-slate-950/80 px-4 py-2 backdrop-blur">
                <div className="min-w-0">
                    <h1 className="text-[13.5px] font-semibold tracking-tight text-slate-100">
                        Agronomic Knowledge Graph
                    </h1>
                    <p className="hidden text-[11px] text-slate-400 sm:block">
                        Interactive Entity Explorer — Focused neighborhood navigation
                    </p>
                </div>
                {st && (
                    <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-slate-400">
                        <span><b className="text-slate-200">{st.sources}</b> sources</span>
                        <span className="text-slate-700">·</span>
                        <span><b className="text-slate-200">{st.chunks.toLocaleString()}</b> chunks</span>
                        <span className="text-slate-700">·</span>
                        <span><b className="text-cyan-300">{st.nodes}</b> nodes</span>
                        <span className="text-slate-700">·</span>
                        <span><b className="text-cyan-300">{st.relationships}</b> relationships</span>
                    </div>
                )}
            </div>

            {/* ── search + type filter chips bar ─────────────────────────────── */}
            <div className="flex flex-col gap-2 border-b border-slate-800/60 bg-slate-950/60 px-4 py-2">
                <div className="relative max-w-xl">
                    <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={(e) => e.key === "Escape" && setQ("")}
                        aria-label={t("graph.searchPlaceholder")}
                        placeholder={t("graph.searchPlaceholder")}
                        className="kg-btn w-full rounded-lg border border-slate-800 bg-slate-900/70 py-1.5 pl-8 pr-3 text-[12.5px] text-slate-200 outline-none transition-colors placeholder:text-slate-500 focus:border-cyan-500/50"
                    />
                    {searchResults.length > 0 && (
                        <ul className="kg-scroll absolute z-50 mt-1.5 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/95 py-1 shadow-xl shadow-black/50 backdrop-blur">
                            {searchResults.map((n) => {
                                const M = getMeta(n.type);
                                return (
                                    <li key={n.id}>
                                        <button
                                            onClick={() => {
                                                navigateToEntity(n.id);
                                                setQ("");
                                            }}
                                            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] text-slate-200 transition-colors hover:bg-slate-800"
                                        >
                                            <span className="text-sm">{M.emoji}</span>
                                            <span className="truncate font-medium">{n.label}</span>
                                            <span className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase font-mono tracking-wider" style={{ background: `${M.color}18`, color: M.color }}>
                                                {M.label}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                <div className="kg-scroll -mb-1 flex items-center gap-1.5 overflow-x-auto pb-1">
                    <button
                        aria-pressed={typeFilter.size === 0}
                        onClick={() => setTypeFilter(new Set())}
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${typeFilter.size === 0
                            ? "border-cyan-500/50 bg-cyan-500/15 font-medium text-cyan-300"
                            : "border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700 hover:text-slate-200"}`}
                    >
                        {t("graph.allTypes")} <span className="ml-1 text-slate-500">{st?.nodes ?? 0}</span>
                    </button>
                    {(graph?.filters.types ?? []).map((tName) => {
                        const on = typeFilter.has(tName);
                        const c = getMeta(tName).color;
                        return (
                            <button
                                key={tName}
                                aria-pressed={on}
                                onClick={() => setTypeFilter((s) => {
                                    const next = new Set(s);
                                    next.has(tName) ? next.delete(tName) : next.add(tName);
                                    return next;
                                })}
                                className={`kg-btn flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${on
                                    ? "font-medium"
                                    : "border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700 hover:text-slate-200"}`}
                                style={on ? { background: `${c}1f`, borderColor: c, color: c } : undefined}
                            >
                                <span>{getMeta(tName).emoji}</span>
                                {getMeta(tName).label} <span className="text-slate-500 font-mono text-[10px]">{typeCounts[tName] ?? 0}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── main workspace: left browser | center graph | right inspector ── */}
            <div className="relative flex min-h-0 flex-1">
                {(leftOpen || rightOpen) && (
                    <div
                        className="absolute inset-0 z-20 bg-black/50 backdrop-blur-[1px] md:hidden"
                        onClick={() => { setLeftOpen(false); setRightOpen(false); }}
                    />
                )}

                {/* LEFT PANEL: entity browser */}
                {leftOpen ? (
                    <aside className="absolute inset-y-0 left-0 z-30 flex w-[82vw] max-w-[16rem] shrink-0 flex-col overflow-hidden border-r border-slate-800/60 bg-slate-950/95 backdrop-blur md:relative md:z-20 md:w-[16rem] md:max-w-none md:bg-slate-950/60">
                        <div className="flex shrink-0 items-center justify-between px-3 py-2.5">
                            <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                {t("graph.knowledgeEntities")} <span className="ml-1 font-mono text-slate-500">{entityList.length}</span>
                            </div>
                            <button onClick={() => setLeftOpen(false)} aria-label="Hide panel" className={iconBtn}>
                                <PanelLeftClose size={13} />
                            </button>
                        </div>

                        {/* refine accordion */}
                        <div className="shrink-0 border-b border-slate-800/60 px-3 pb-2.5">
                            <button
                                onClick={() => setRefineOpen((v) => !v)}
                                aria-expanded={refineOpen}
                                className="kg-btn flex w-full items-center gap-1.5 rounded-md py-1 text-[10px] font-medium uppercase tracking-wider text-slate-400 hover:text-slate-200"
                            >
                                {refineOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {t("graph.filters")}
                                {anyFilter && <span className="ml-1 size-1.5 rounded-full bg-cyan-400" />}
                            </button>
                            {refineOpen && (
                                <div className="mt-2 space-y-2">
                                    {([
                                        ["state", "State", graph?.filters.states],
                                        ["crop", "Crop", graph?.filters.crops],
                                        ["district", "District", graph?.filters.districts],
                                        ["season", "Season", graph?.filters.seasons],
                                    ] as const).map(([k, label, opts]) => (opts && opts.length > 0) ? (
                                        <label key={k} className="block">
                                            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</span>
                                            <select
                                                value={(facet as Record<string, string>)[k]}
                                                onChange={(e) => setFacet((f) => ({ ...f, [k]: e.target.value }))}
                                                className={facetSelect}
                                            >
                                                <option value="">All {label.toLowerCase()}s</option>
                                                {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                                            </select>
                                        </label>
                                    ) : null)}
                                    {anyFilter && (
                                        <button
                                            onClick={() => {
                                                setTypeFilter(new Set());
                                                setFacet({ state: "", crop: "", season: "", district: "" });
                                            }}
                                            className="kg-btn text-[11px] text-cyan-400 hover:underline"
                                        >
                                            {t("graph.clearFilters")}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* entity cards list */}
                        <div className="kg-scroll min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
                            {!graph && <p className="px-1 py-4 text-[12px] text-slate-500">{t("common.loading")}</p>}
                            {graph && entityList.length === 0 && (
                                <p className="px-1 py-4 text-[12px] text-slate-400">{t("graph.noMatchingRelationships")}</p>
                            )}
                            <div className="grid grid-cols-1 gap-1.5">
                                {entityList.slice(0, 180).map((n) => {
                                    const M = getMeta(n.type);
                                    const isCenter = focusId === n.id;
                                    const deg = degreeById.get(n.id) ?? 0;
                                    return (
                                        <button
                                            key={n.id}
                                            onClick={() => navigateToEntity(n.id)}
                                            aria-pressed={isCenter}
                                            className={`kg-btn group flex items-center gap-2.5 rounded-lg border p-2 text-left transition-colors ${isCenter
                                                ? "border-cyan-500/70 bg-cyan-500/12 ring-1 ring-cyan-500/30"
                                                : "border-slate-800/70 bg-slate-900/30 hover:border-slate-700 hover:bg-slate-800/40"}`}
                                        >
                                            <span
                                                className="flex size-7 shrink-0 items-center justify-center rounded-md border text-sm"
                                                style={{ borderColor: `${M.color}45`, background: `${M.color}14` }}
                                            >
                                                {M.emoji}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-[12px] font-medium text-slate-200">
                                                    {n.label}
                                                </span>
                                                <span className="mt-0.5 block text-[9.5px] uppercase tracking-wide text-slate-500">
                                                    {M.label} · {deg} {deg === 1 ? "relation" : "relations"}
                                                </span>
                                            </span>
                                            <ChevronRight size={12} className="shrink-0 text-slate-600 transition-colors group-hover:text-slate-300" />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* legend toggle */}
                        <div className="shrink-0 border-t border-slate-800/60 px-3 py-2.5">
                            <button
                                onClick={() => setLegendOpen((v) => !v)}
                                aria-expanded={legendOpen}
                                className="kg-btn flex w-full items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-400 hover:text-slate-200"
                            >
                                {legendOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                <Layers size={11} /> {t("graph.legend")}
                            </button>
                            {legendOpen && (
                                <ul className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1.5 animate-in fade-in duration-100">
                                    {(graph?.filters.types ?? Object.keys(TYPE_CONFIG)).map((t) => (
                                        <li key={t} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                            <span>{getMeta(t).emoji}</span>
                                            <span className="truncate">{getMeta(t).label}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </aside>
                ) : (
                    <button
                        onClick={() => setLeftOpen(true)}
                        aria-label="Show entity panel"
                        title="Show entities"
                        className="kg-btn absolute left-3 top-14 z-20 rounded-md border border-slate-800 bg-slate-900/80 p-1.5 text-slate-400 backdrop-blur transition-colors hover:text-slate-100"
                    >
                        <PanelLeftOpen size={13} />
                    </button>
                )}

                {/* CENTER CANVAS: focused relational graph */}
                <div className="relative flex min-w-0 flex-1 flex-col">
                    {/* Navigation bar with history & 1-hop toggle */}
                    <div className="flex flex-wrap items-center gap-2 border-b border-slate-800/60 bg-slate-950/70 px-3 py-1.5">
                        {/* History Back / Forward */}
                        <div className="flex items-center gap-0.5 rounded-md border border-slate-800/80 bg-slate-900/60 p-0.5">
                            <button
                                onClick={goBack}
                                disabled={historyIndex <= 0}
                                title="Back to previous entity"
                                aria-label="Back to previous entity"
                                className="kg-btn rounded p-1 text-slate-400 disabled:opacity-30 hover:text-slate-100"
                            >
                                <ArrowLeft size={13} />
                            </button>
                            <button
                                onClick={goForward}
                                disabled={historyIndex >= history.length - 1}
                                title="Forward"
                                aria-label="Forward"
                                className="kg-btn rounded p-1 text-slate-400 disabled:opacity-30 hover:text-slate-100"
                            >
                                <ArrowRight size={13} />
                            </button>
                        </div>

                        {/* Breadcrumbs */}
                        <div className="kg-scroll flex max-w-[45%] items-center gap-1.5 overflow-x-auto text-[11.5px]">
                            <span className="text-slate-500 font-medium shrink-0">Focus:</span>
                            <span className="flex items-center gap-1 font-semibold text-cyan-300 truncate">
                                {focusedCenterNode && <span>{getMeta(focusedCenterNode.type).emoji}</span>}
                                {focusedName}
                            </span>
                        </div>

                        {/* Hover edge triple badge */}
                        {hoverEdge && (
                            <div className="ml-auto hidden max-w-[40%] items-center gap-1.5 truncate rounded-md border border-cyan-500/30 bg-slate-900/90 px-2 py-0.5 font-mono text-[10.5px] text-slate-300 lg:flex">
                                <span className="truncate text-slate-200">{nodeById.get(hoverEdge.source)?.label}</span>
                                <span className="text-cyan-400 font-semibold">→ {hoverEdge.relationship} →</span>
                                <span className="truncate text-slate-200">{nodeById.get(hoverEdge.target)?.label}</span>
                            </div>
                        )}

                        {/* 1-Hop / 2-Hop control & connection indicator */}
                        <div className={hoverEdge ? "hidden lg:hidden" : "ml-auto flex items-center gap-2"}>
                            <div className="flex items-center overflow-hidden rounded-md border border-slate-800 bg-slate-900/70 text-[10.5px]">
                                <button
                                    aria-pressed={hop === 1}
                                    onClick={() => setHop(1)}
                                    className={`px-2 py-1 font-medium transition-colors ${hop === 1
                                        ? "bg-cyan-500/20 text-cyan-300"
                                        : "text-slate-400 hover:text-slate-200"}`}
                                >
                                    {t("graph.oneHop")}
                                </button>
                                <button
                                    aria-pressed={hop === 2}
                                    onClick={() => setHop(2)}
                                    className={`px-2 py-1 font-medium transition-colors ${hop === 2
                                        ? "bg-violet-500/20 text-violet-300"
                                        : "text-slate-400 hover:text-slate-200"}`}
                                >
                                    {t("graph.twoHop")}
                                </button>
                            </div>

                            {!fullGraphMode && focusedNeighborhood.totalDirect > 0 && (
                                <span className="hidden sm:inline font-mono text-[10.5px] text-slate-500">
                                    Showing <b className="text-slate-300">{focusedNeighborhood.directNeighbors.length}</b> of <b className="text-slate-300">{focusedNeighborhood.totalDirect}</b>
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Interactive Canvas */}
                    <div className="kg-canvas-wrap relative min-h-0 flex-1">
                        <div className="kg-dots pointer-events-none absolute inset-0 z-0" />
                        <div ref={boxRef} className="relative z-[1] h-full w-full" />

                        {/* Top-Right Toolbar */}
                        <div className="absolute right-3 top-3 z-20 flex items-center gap-0.5 rounded-lg border border-slate-800 bg-slate-900/85 p-1 shadow-lg shadow-black/40 backdrop-blur">
                            {([
                                [ZoomIn, "Zoom in", () => zoomBy(1.25)],
                                [ZoomOut, "Zoom out", () => zoomBy(0.8)],
                                [Frame, t("graph.fitView"), fitView],
                                [RotateCcw, t("graph.resetView"), resetView],
                            ] as const).map(([Icon, tip, fn]) => (
                                <button key={tip} aria-label={tip} title={tip} onClick={fn} className={iconBtn}>
                                    <Icon size={14} />
                                </button>
                            ))}
                            <span className="mx-1 h-4 w-px bg-slate-700/60" />
                            <select
                                value={layoutName}
                                onChange={(e) => setLayoutName(e.target.value as keyof typeof LAYOUTS)}
                                aria-label={t("graph.layout")}
                                title={t("graph.layout")}
                                className="kg-btn rounded-md bg-transparent px-1 py-1 text-[11.5px] text-slate-300 outline-none transition-colors hover:text-slate-100"
                            >
                                <option value="Sector" className="bg-slate-900">{t("graph.layouts.sector")}</option>
                                <option value="Force" className="bg-slate-900">{t("graph.layouts.force")}</option>
                                <option value="Radial" className="bg-slate-900">{t("graph.layouts.radial")}</option>
                                <option value="Hierarchical" className="bg-slate-900">{t("graph.layouts.hierarchy")}</option>
                            </select>
                            <span className="mx-1 h-4 w-px bg-slate-700/60" />
                            <button
                                aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
                                title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
                                onClick={toggleFullscreen}
                                className={iconBtn}
                            >
                                {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                            </button>
                        </div>

                        {/* Full Graph vs Focused Toggle Banner */}
                        <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2 flex items-center gap-2">
                            {fullGraphMode ? (
                                <button
                                    onClick={() => setFullGraphMode(false)}
                                    className="kg-btn flex items-center gap-1.5 rounded-full border border-amber-500/50 bg-amber-950/80 px-3 py-1 text-[11.5px] font-medium text-amber-300 shadow-md backdrop-blur transition-colors hover:bg-amber-900/60"
                                >
                                    <Focus size={13} /> {t("graph.focusedView")}
                                </button>
                            ) : (
                                <button
                                    onClick={() => setFullGraphMode(true)}
                                    title={t("graph.showFullGraph")}
                                    className="kg-btn flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/80 px-3 py-1 text-[11.5px] font-medium text-slate-400 shadow-md backdrop-blur transition-colors hover:border-slate-700 hover:text-slate-200"
                                >
                                    <Eye size={13} /> {t("graph.showFullGraph")}
                                </button>
                            )}
                        </div>

                        {/* Loading / Error States */}
                        {loading && (
                            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-[#070a12]/80 text-slate-400">
                                <Loader2 size={22} className="animate-spin text-cyan-400" />
                                <p className="text-[13px]">{t("common.loading")}</p>
                            </div>
                        )}
                        {!loading && error && (
                            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[#070a12]/90 text-center">
                                <TriangleAlert size={24} className="text-amber-400" />
                                <p className="text-[13.5px] font-medium text-slate-200">Unable to load the knowledge graph.</p>
                                <p className="text-[12px] text-slate-500">{error}</p>
                                <button
                                    onClick={load}
                                    className="kg-btn mt-1 rounded-md border border-slate-700 bg-slate-800 px-4 py-1.5 text-[12.5px] text-slate-200 transition-colors hover:bg-slate-700"
                                >
                                    {t("common.retry")}
                                </button>
                            </div>
                        )}
                        {!loading && !error && graph && graph.nodes.length === 0 && (
                            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 text-slate-500">
                                <p className="text-[13.5px] font-medium text-slate-300">The knowledge graph is empty.</p>
                                <p className="text-[12px]">Ingest advisories or datasets to populate.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT PANEL: metadata & relationships inspector */}
                {rightOpen ? (
                    <aside className="kg-scroll absolute inset-x-0 bottom-0 z-30 flex max-h-[62vh] shrink-0 flex-col overflow-y-auto rounded-t-2xl border-t border-slate-800/60 bg-slate-950/95 p-3.5 backdrop-blur md:relative md:inset-x-auto md:bottom-auto md:inset-y-0 md:max-h-none md:w-[20rem] md:rounded-none md:border-l md:border-t-0 md:bg-slate-950/60">
                        <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-slate-700 md:hidden" />
                        <div className="flex items-center justify-between">
                            <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                {t("graph.inspector")}
                            </span>
                            <button onClick={() => setRightOpen(false)} aria-label="Hide inspector" className={iconBtn}>
                                <PanelRightClose size={13} />
                            </button>
                        </div>

                        {!selected && (
                            <p className="mt-4 text-[12px] leading-relaxed text-slate-500">
                                {t("graph.selectPrompt")}
                            </p>
                        )}

                        {selNode && (() => {
                            const M = getMeta(selNode.type);
                            const m = selNode.metadata as Record<string, string>;
                            const technicalId = (m.technical_id || m.advisory_id || selNode.id) as string;

                            const present = Object.entries(m).filter(
                                ([k, v]) => v !== null && v !== "" && v !== undefined && !["technical_id"].includes(k)
                            );
                            const used = new Set<string>();
                            const groups = META_GROUPS
                                .map((g) => ({ title: g.title, rows: present.filter(([k]) => g.keys.includes(k)) }))
                                .filter((g) => g.rows.length > 0);
                            groups.forEach((g) => g.rows.forEach(([k]) => used.add(k)));
                            const extra = present.filter(([k]) => !used.has(k));
                            if (extra.length) groups.push({ title: "Details", rows: extra });

                            const Row = ([k, v]: [string, string]) => (
                                <div key={k} className="flex gap-2">
                                    <dt className="w-[92px] shrink-0 text-slate-500 font-normal">{k.replace(/_/g, " ")}</dt>
                                    <dd className="min-w-0 flex-1 break-words text-slate-300">
                                        {/^https?:\/\//.test(String(v)) ? (
                                            <a
                                                href={String(v)}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-1 text-cyan-400 hover:underline"
                                            >
                                                {String(v).replace(/^https?:\/\//, "").slice(0, 36)} <ExternalLink size={10} />
                                            </a>
                                        ) : (
                                            String(v)
                                        )}
                                    </dd>
                                </div>
                            );

                            const isCurrentCenter = focusId === selNode.id;
                            const totalConnections = degreeById.get(selNode.id) ?? 0;

                            return (
                                <div className="mt-3 space-y-3.5">
                                    <div className="flex items-start justify-between gap-2">
                                        <span
                                            className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide"
                                            style={{ background: `${M.color}1f`, color: M.color }}
                                        >
                                            <span>{M.emoji}</span> {M.label}
                                        </span>
                                        <button
                                            onClick={() => { setSelected(null); }}
                                            aria-label="Clear selection"
                                            className={iconBtn}
                                        >
                                            <X size={13} />
                                        </button>
                                    </div>

                                    <div>
                                        <h2 className="break-words text-[14.5px] font-semibold leading-snug text-slate-100">
                                            {selNode.label}
                                        </h2>
                                        {technicalId && technicalId !== selNode.label && (
                                            <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-slate-500">
                                                <span>ID:</span>
                                                <span className="truncate rounded bg-slate-900 px-1.5 py-0.5 text-slate-400 border border-slate-800">
                                                    {technicalId}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex gap-2">
                                        {!isCurrentCenter ? (
                                            <button
                                                onClick={() => navigateToEntity(selNode.id)}
                                                className="kg-btn flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-cyan-500/50 bg-cyan-500/15 py-1.5 text-[12px] font-medium text-cyan-300 transition-colors hover:bg-cyan-500/25"
                                            >
                                                <Focus size={13} /> Center in Explorer
                                            </button>
                                        ) : (
                                            <div className="flex-1 rounded-lg border border-cyan-500/30 bg-cyan-950/30 py-1.5 text-center text-[11.5px] font-medium text-cyan-300">
                                                ● Active Explorer Center
                                            </div>
                                        )}
                                        <button
                                            onClick={fitView}
                                            aria-label="Center view"
                                            title="Center view"
                                            className="kg-btn rounded-lg border border-slate-700 bg-slate-800/70 px-2.5 text-slate-300 transition-colors hover:bg-slate-700"
                                        >
                                            <Frame size={13} />
                                        </button>
                                    </div>

                                    {/* Connection disclosure badge */}
                                    {isCurrentCenter && (
                                        <div className="flex flex-wrap items-center justify-between gap-1 rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 font-mono text-[11px] text-slate-400">
                                            <span>
                                                <b className="text-slate-200">{focusedNeighborhood.directNeighbors.length}</b> of <b className="text-slate-200">{totalConnections}</b> connections
                                            </span>
                                            {totalConnections > connectionLimit && (
                                                <button
                                                    onClick={() => setConnectionLimit((l) => l + 8)}
                                                    className="kg-btn text-cyan-400 hover:underline font-sans text-[11px]"
                                                >
                                                    Show more (+8)
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {/* Relationships group list */}
                                    {relGroups.length > 0 && (
                                        <div className="border-t border-slate-800/60 pt-3">
                                            <div className="mb-2 flex items-center justify-between text-[9.5px] font-medium uppercase tracking-wider text-slate-400">
                                                <span>Relationships ({totalConnections})</span>
                                                <span className="text-slate-500 lowercase">click to navigate</span>
                                            </div>
                                            <div className="space-y-2.5">
                                                {relGroups.map((g) => (
                                                    <div key={g.type}>
                                                        <div className="mb-1 flex items-center gap-1.5 text-[10.5px] text-slate-400 font-medium">
                                                            <span>{getMeta(g.type).emoji}</span>
                                                            {getMeta(g.type).label} <span className="text-slate-500 font-mono">({g.items.length})</span>
                                                        </div>
                                                        <ul className="space-y-1">
                                                            {g.items.slice(0, 10).map(({ other, rel, dir }, idx) => (
                                                                <li key={other.id + idx}>
                                                                    <button
                                                                        onClick={() => navigateToEntity(other.id)}
                                                                        className="kg-btn group w-full rounded-md border border-slate-800/70 bg-slate-900/40 px-2 py-1.5 text-left transition-colors hover:border-cyan-500/50 hover:bg-slate-800/60"
                                                                    >
                                                                        <div className="font-mono text-[9.5px] text-cyan-400/80">
                                                                            {dir === "out" ? `→ ${rel} →` : `← ${rel} ←`}
                                                                        </div>
                                                                        <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-slate-200">
                                                                            <span className="truncate">{other.label}</span>
                                                                            <ChevronRight size={11} className="ml-auto shrink-0 text-slate-600 transition-colors group-hover:text-cyan-300" />
                                                                        </div>
                                                                    </button>
                                                                </li>
                                                            ))}
                                                            {g.items.length > 10 && (
                                                                <p className="text-[10px] text-slate-500 pl-1">
                                                                    +{g.items.length - 10} more in database
                                                                </p>
                                                            )}
                                                        </ul>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Entity Metadata */}
                                    <div className="border-t border-slate-800/60 pt-3">
                                        <div className="mb-2 text-[9.5px] font-medium uppercase tracking-wider text-slate-400">
                                            Entity Metadata
                                        </div>
                                        {groups.length > 0 ? (
                                            <div className="space-y-3">
                                                {groups.map((g) => (
                                                    <div key={g.title}>
                                                        <div className="mb-1 text-[9px] font-medium uppercase tracking-wider text-slate-500">{g.title}</div>
                                                        <dl className="space-y-1.5 text-[11.5px]">{g.rows.map((r) => Row(r as [string, string]))}</dl>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-[12px] text-slate-500">No additional attributes available.</p>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}

                        {selected?.kind === "edge" && (() => {
                            const e = selected.data as GEdge;
                            const srcN = nodeById.get(e.source);
                            const tgtN = nodeById.get(e.target);
                            return (
                                <div className="mt-3 space-y-3">
                                    <div className="flex items-start justify-between">
                                        <span className="rounded-md bg-slate-800/70 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-300">
                                            Relationship Triple
                                        </span>
                                        <button onClick={() => setSelected(null)} aria-label="Clear selection" className={iconBtn}>
                                            <X size={13} />
                                        </button>
                                    </div>
                                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-center space-y-2">
                                        <button
                                            onClick={() => srcN && navigateToEntity(srcN.id)}
                                            className="kg-btn block w-full truncate rounded p-1 text-[12.5px] font-medium text-slate-200 hover:text-cyan-300 hover:bg-slate-800"
                                        >
                                            {srcN?.label}
                                        </button>
                                        <div className="font-mono text-[11px] text-cyan-400 font-semibold">
                                            ↓ {e.relationship} ↓
                                        </div>
                                        <button
                                            onClick={() => tgtN && navigateToEntity(tgtN.id)}
                                            className="kg-btn block w-full truncate rounded p-1 text-[12.5px] font-medium text-slate-200 hover:text-cyan-300 hover:bg-slate-800"
                                        >
                                            {tgtN?.label}
                                        </button>
                                    </div>
                                </div>
                            );
                        })()}
                    </aside>
                ) : (
                    <button
                        onClick={() => setRightOpen(true)}
                        aria-label="Show inspector"
                        title="Show inspector"
                        className="kg-btn absolute right-3 top-14 z-20 rounded-md border border-slate-800 bg-slate-900/80 p-1.5 text-slate-400 backdrop-blur transition-colors hover:text-slate-100"
                    >
                        <PanelRightOpen size={13} />
                    </button>
                )}
            </div>
        </div>
    );
}
