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
CHROMA_PERSIST_DIR = os.path.join(os.getenv("DATA_DIR", "."), "chroma_db")
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
        g.node(f"ds:{s.ref}", label=s.title or s.ref, ntype="dataset",
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

        a = g.node(
            f"adv:{adv_id}", label=adv_id, ntype="advisory",
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

    stats = {
        "sources": len(sources),
        "chunks": total_chunks,
        "nodes": len(nodes),
        "relationships": len(edges),
        "advisories": len(seen_adv),
        "generated_at": datetime.utcnow().isoformat() + "Z",
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


if __name__ == "__main__":
    import json
    out = build_graph(force=True)
    print(json.dumps(out["stats"], indent=2))
    print("node types:", {t: sum(1 for n in out["nodes"] if n["type"] == t)
                           for t in out["filters"]["types"]})
    print("sample edges:", [f'{e["source"]} -{e["relationship"]}-> {e["target"]}' for e in out["edges"][:6]])
