"""
graph_service.py — GRAPH-ONLY adapter for the Knowledge Graph explorer page.

Read-only. Derives an entity/relationship graph from:
  * the knowledge_sources table   (SQLAlchemy — same DB the app already uses)
  * the Chroma chunk metadata     (opened with its OWN read-only client)

It never writes anything, never touches rag_pipeline / retrieval / embeddings /
generation. If the Chroma store is unavailable the graph still returns the
dataset/source layer from SQL.

Exposed via:  GET /graph/full   (see app.py)
"""
import os
import re
from datetime import datetime

from database import SessionLocal, KnowledgeSource

# same convention as the rest of the app (DATA_DIR is the Railway volume in prod)
_DEFAULT_CHROMA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "chroma_db")
CHROMA_PERSIST_DIR = os.getenv("DATA_DIR") or (_DEFAULT_CHROMA if os.path.exists(_DEFAULT_CHROMA) else os.path.join(".", "chroma_db"))
_COLLECTION = os.getenv("CHROMA_COLLECTION", "langchain")

# in-process cache, invalidated when the source/chunk counts change
_CACHE: dict = {"key": None, "data": None}


# --------------------------------------------------------------------------- io
def _chunk_metadatas() -> list[dict]:
    """All Chroma chunk metadata dicts, or [] if the store can't be read."""
    try:
        import chromadb  # local import — keep this module importable without it
        client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)
        col = client.get_collection(_COLLECTION)
        got = col.get(include=["metadatas"])
        return [m or {} for m in (got.get("metadatas") or [])]
    except Exception as e:  # noqa: BLE001 - graph degrades gracefully to the SQL layer
        print(f"[graph_service] chroma read skipped: {e}")
        return []


def _chunk_count() -> int:
    try:
        import chromadb
        client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)
        return client.get_collection(_COLLECTION).count()
    except Exception:
        return -1


# ---------------------------------------------------------------- graph builder
def _slug(*parts) -> str:
    return re.sub(r"[^a-z0-9]+", "-", "-".join(str(p) for p in parts if p).lower()).strip("-")


def _short_crop(name: str) -> str:
    return re.sub(r"\s*\(.*?\)\s*", "", name or "").strip() or name


def _clean_advisory_label(m: dict, adv_id: str) -> str:
    """Creates a human-readable title for advisory cards instead of technical IDs."""
    crop = _short_crop(m.get("crop") or "")
    prob = m.get("problem_addressed") or ""
    prob_clean = re.sub(r"\(.*?\)", "", prob).strip()
    prob_clean = re.sub(r"\s+", " ", prob_clean)
    if " and " in prob_clean:
        prob_clean = prob_clean.split(" and ")[0].strip()
    if "," in prob_clean:
        prob_clean = prob_clean.split(",")[0].strip()
    prob_clean = re.sub(r"Nutrient uptake optimization", "Nutrient Optimization", prob_clean, flags=re.IGNORECASE)
    district = m.get("district") or ""

    parts = []
    if crop:
        parts.append(crop)
    if prob_clean:
        parts.append(prob_clean)
    parts.append("Advisory")
    base = " ".join(parts)
    if district:
        return f"{base} ({district})"
    return base or adv_id


def _clean_dataset_label(ref: str, title: str | None) -> str:
    if title and not title.endswith((".json", ".csv")):
        return title
    name = re.sub(r"\.(json|csv)$", "", ref or "").replace("_", " ").replace("-", " ").title()
    name = re.sub(r"\bRag Ready\b", "(RAG Ready)", name, flags=re.IGNORECASE)
    return name or ref


class _G:
    """Tiny node/edge accumulator with de-duplication."""

    def __init__(self):
        self.nodes: dict[str, dict] = {}
        self.edges: dict[str, dict] = {}

    def node(self, nid: str, *, label: str, ntype: str, **meta):
        n = self.nodes.get(nid)
        if n is None:
            self.nodes[nid] = {"id": nid, "label": label, "type": ntype,
                               "metadata": {k: v for k, v in meta.items() if v not in (None, "")}}
        else:  # merge any new metadata we learn later
            for k, v in meta.items():
                if v not in (None, "") and k not in n["metadata"]:
                    n["metadata"][k] = v
        return nid

    def edge(self, src: str, rel: str, tgt: str):
        if not src or not tgt or src == tgt:
            return
        eid = f"{src}__{rel}__{tgt}"
        self.edges.setdefault(eid, {"id": eid, "source": src, "target": tgt, "relationship": rel})


def _build() -> dict:
    g = _G()
    db = SessionLocal()
    try:
        sources = db.query(KnowledgeSource).order_by(KnowledgeSource.created_at.asc()).all()
    finally:
        db.close()

    total_chunks = 0
    for s in sources:
        total_chunks += s.chunk_count or 0
        ds_label = _clean_dataset_label(s.ref, s.title)
        g.node(f"ds:{s.ref}", label=ds_label, ntype="dataset",
               technical_id=s.ref,
               source_type=s.source_type, origin=s.origin, ref=s.ref,
               chunk_count=s.chunk_count,
               added=s.created_at.isoformat() if s.created_at else None)

    # ---- rich layer from advisory chunk metadata -------------------------------
    seen_adv: set[str] = set()
    for m in _chunk_metadatas():
        if m.get("source_type") != "advisory":
            continue
        adv_id = m.get("advisory_id") or m.get("title")
        if not adv_id or adv_id in seen_adv:
            continue
        seen_adv.add(adv_id)

        human_label = _clean_advisory_label(m, adv_id)
        a = g.node(
            f"adv:{adv_id}", label=human_label, ntype="advisory",
            technical_id=adv_id,
            advisory_id=adv_id,
            advisory_type=m.get("advisory_type"),
            problem_addressed=m.get("problem_addressed"),
            weather_condition=m.get("weather_condition"),
            crop=m.get("crop"), state=m.get("state"), district=m.get("district"),
            season=m.get("season"), crop_stage=m.get("crop_stage"),
            language=m.get("language"),
            temporal_status=m.get("temporal_status"),
            publication_date=m.get("publication_date"),
            source_name=m.get("source_name"),
            organization=m.get("organization"),
            source_url=m.get("source_url"),
            license=m.get("license"),
        )

        # dataset the advisory chunk lives in
        if m.get("ref"):
            g.edge(a, "from_dataset", f"ds:{m['ref']}")

        # publisher / source
        org = m.get("organization") or m.get("source_name")
        if org:
            o = g.node(f"org:{_slug(org)}", label=org, ntype="source",
                       source_name=m.get("source_name"), organization=m.get("organization"),
                       source_url=m.get("source_url"), license=m.get("license"))
            g.edge(a, "issued_by", o)

        # crop
        if m.get("crop"):
            c = g.node(f"crop:{m.get('crop_code') or _slug(m['crop'])}",
                       label=_short_crop(m["crop"]), ntype="crop",
                       full_name=m["crop"], crop_code=m.get("crop_code"))
            g.edge(a, "applies_to", c)

        # state + district
        st = None
        if m.get("state"):
            st = g.node(f"state:{m.get('state_code') or _slug(m['state'])}",
                        label=m["state"], ntype="state", state_code=m.get("state_code"))
        if m.get("district"):
            d = g.node(f"dist:{m.get('district_code') or _slug(m['district'])}",
                       label=m["district"], ntype="district",
                       district_code=m.get("district_code"), state=m.get("state"))
            g.edge(a, "for_district", d)
            if st:
                g.edge(d, "located_in", st)
        elif st:
            g.edge(a, "in_state", st)

        # season
        if m.get("season"):
            se = g.node(f"season:{_slug(m['season'])}", label=m["season"], ntype="season")
            g.edge(a, "during", se)

        # growth stage
        if m.get("crop_stage"):
            sg = g.node(f"stage:{_slug(m['crop_stage'])}", label=m["crop_stage"], ntype="stage")
            g.edge(a, "at_stage", sg)

    nodes = list(g.nodes.values())
    edges = list(g.edges.values())

    def _facet(ntype, key="label"):
        return sorted({n[key] if key == "label" else n["metadata"].get(key)
                       for n in nodes if n["type"] == ntype and (key == "label" or n["metadata"].get(key))})

    now = datetime.now().isoformat() + "Z"
    stats = {
        "sources": len(sources),
        "chunks": total_chunks,
        "nodes": len(nodes),
        "relationships": len(edges),
        "advisories": len(seen_adv),
        "generated_at": now,
    }
    filters = {
        "types": sorted({n["type"] for n in nodes}),
        "states": _facet("state"),
        "crops": _facet("crop"),
        "districts": _facet("district"),
        "seasons": _facet("season"),
        "advisory_types": sorted({n["metadata"].get("advisory_type")
                                  for n in nodes if n["type"] == "advisory" and n["metadata"].get("advisory_type")}),
    }
    return {"nodes": nodes, "edges": edges, "stats": stats, "filters": filters}


def build_graph(force: bool = False) -> dict:
    """Cached graph; rebuilds only when the source/chunk counts move."""
    db = SessionLocal()
    try:
        ks_count = db.query(KnowledgeSource).count()
    finally:
        db.close()
    key = (ks_count, _chunk_count())
    if force or _CACHE["key"] != key or _CACHE["data"] is None:
        _CACHE["data"] = _build()
        _CACHE["key"] = key
    return _CACHE["data"]


def get_neighbors(entity_id: str, depth: int = 1, limit: int = 12) -> dict:
    """Read-only neighborhood query for focused interactive exploration.
    Prioritizes connection type diversity without fabricating relevance values."""
    graph = build_graph()
    node_map = {n["id"]: n for n in graph["nodes"]}
    center = node_map.get(entity_id)
    if not center:
        return {
            "center": None,
            "nodes": [],
            "edges": [],
            "total_connections": 0,
            "shown_connections": 0,
            "has_more": False,
        }

    # Direct 1-hop incident edges
    edges_1 = [e for e in graph["edges"] if e["source"] == entity_id or e["target"] == entity_id]
    total_connections = len(edges_1)

    # Group direct neighbors by entity type to ensure diversity (districts, season, source, advisories)
    type_buckets: dict[str, list[tuple[str, dict]]] = {}
    for e in edges_1:
        nbr_id = e["target"] if e["source"] == entity_id else e["source"]
        nbr_node = node_map.get(nbr_id)
        if not nbr_node:
            continue
        ntype = nbr_node.get("type", "other")
        type_buckets.setdefault(ntype, []).append((nbr_id, e))

    selected_node_ids: set[str] = set()
    selected_edge_ids: set[str] = set()

    # Preferred order of connection types for agronomic clarity
    types_order = ["district", "season", "crop", "source", "state", "stage", "dataset", "advisory"]
    all_types = [t for t in types_order if t in type_buckets] + [t for t in type_buckets if t not in types_order]

    # Pass 1: balanced distribution (up to 2 per type)
    effective_limit = max(4, min(limit, total_connections))
    for t in all_types:
        for nbr_id, e in type_buckets[t]:
            if nbr_id not in selected_node_ids and len(selected_node_ids) < effective_limit:
                selected_node_ids.add(nbr_id)
                selected_edge_ids.add(e["id"])
                type_count = sum(1 for nid in selected_node_ids if node_map.get(nid, {}).get("type") == t)
                if type_count >= 2:
                    break
        if len(selected_node_ids) >= effective_limit:
            break

    # Pass 2: fill up to limit if slots remain
    if len(selected_node_ids) < effective_limit:
        for t in all_types:
            for nbr_id, e in type_buckets[t]:
                if nbr_id not in selected_node_ids and len(selected_node_ids) < effective_limit:
                    selected_node_ids.add(nbr_id)
                    selected_edge_ids.add(e["id"])
                if len(selected_node_ids) >= effective_limit:
                    break
            if len(selected_node_ids) >= effective_limit:
                break

    # If depth >= 2, opt-in fetch of second-degree connections (capped at 24)
    if depth >= 2:
        hop2_limit = min(24, effective_limit * 2)
        hop1_ids = set(selected_node_ids)
        hop2_count = 0
        for h1_id in list(hop1_ids):
            if hop2_count >= hop2_limit:
                break
            h2_edges = [
                e for e in graph["edges"]
                if (e["source"] == h1_id or e["target"] == h1_id)
                and e["source"] != entity_id and e["target"] != entity_id
            ]
            for e in h2_edges:
                h2_id = e["target"] if e["source"] == h1_id else e["source"]
                if h2_id != entity_id and h2_id not in selected_node_ids:
                    selected_node_ids.add(h2_id)
                    selected_edge_ids.add(e["id"])
                    hop2_count += 1
                    if hop2_count >= hop2_limit:
                        break

    all_node_ids = selected_node_ids | {entity_id}
    out_nodes = [node_map[nid] for nid in all_node_ids if nid in node_map]
    out_edges = [e for e in graph["edges"] if e["id"] in selected_edge_ids or (e["source"] in all_node_ids and e["target"] in all_node_ids)]

    return {
        "center": center,
        "nodes": out_nodes,
        "edges": out_edges,
        "total_connections": total_connections,
        "shown_connections": len(selected_node_ids),
        "has_more": total_connections > len(selected_node_ids),
    }


def search_entities(q: str = "", ntype: str | None = None, limit: int = 20) -> list[dict]:
    """Read-only entity search across node labels and metadata."""
    graph = build_graph()
    q_lower = (q or "").strip().lower()
    results = []
    for n in graph["nodes"]:
        if ntype and n.get("type") != ntype:
            continue
        if not q_lower:
            results.append(n)
        elif q_lower in n["label"].lower() or any(q_lower in str(v).lower() for v in n.get("metadata", {}).values()):
            results.append(n)
        if len(results) >= limit:
            break
    return results


def get_entity(entity_id: str) -> dict | None:
    """Read-only lookup for a single entity by ID."""
    graph = build_graph()
    for n in graph["nodes"]:
        if n["id"] == entity_id:
            return n
    return None


if __name__ == "__main__":
    import json
    out = build_graph(force=True)
    print(json.dumps(out["stats"], indent=2))
    print("node types:", {t: sum(1 for n in out["nodes"] if n["type"] == t)
                           for t in out["filters"]["types"]})
    print("sample edges:", [f'{e["source"]} -{e["relationship"]}-> {e["target"]}' for e in out["edges"][:6]])
    sample_nbrs = get_neighbors("crop:CROP-RICE", depth=1, limit=10)
    print(f"Rice sample 1-hop: {len(sample_nbrs['nodes'])} nodes, {len(sample_nbrs['edges'])} edges, total={sample_nbrs['total_connections']}")

