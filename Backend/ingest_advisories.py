"""Ingest the region-tagged advisory corpus into the vector store.

    cd Backend && python ingest_advisories.py <path/to/advisories_rag_ready.json>
    cd Backend && python ingest_advisories.py <path> --demo

Reads the `documents[]` array (NOT the generic Upload path — that mis-parses the
{advisory_index_metadata, documents} shape into one blob). Each advisory's `text`
is embedded; state / district / crop / source / publication_date are stamped as
Chroma metadata so retrieval can filter by region BEFORE the semantic search.
"""
import argparse
import json
import sys

try:  # advisories carry Tamil crop names; don't die on a cp1252 console
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from langchain_core.documents import Document

from database import SessionLocal, KnowledgeSource
from rag_pipeline import vectorstore, delete_source

REF = "advisories_rag_ready.json"           # Chroma delete key + KnowledgeSource.ref
_META = (                                    # scalar advisory fields -> Chroma metadata
    "advisory_id", "language", "crop", "crop_code", "season", "crop_stage",
    "advisory_type", "problem_addressed", "weather_condition",
    "state", "state_code", "district", "district_code", "block", "subdistrict",
    "village", "source_name", "organization", "source_url", "publication_date",
    "license", "temporal_status", "content_hash",
)


def _load(path: str) -> list[Document]:
    data = json.load(open(path, encoding="utf-8"))
    docs = data["documents"] if isinstance(data, dict) else data
    out = []
    for d in docs:
        text = (d.get("text") or d.get("advisory_text") or "").strip()
        if not text:
            continue
        md = {k: d[k] for k in _META if d.get(k) not in (None, "", [])}
        md.update(source_type="advisory",
                  title=d.get("advisory_id") or d.get("document_id") or "advisory",
                  origin="file", ref=REF)
        out.append(Document(page_content=text, metadata=md))
    return out


def ingest(path: str) -> int:
    docs = _load(path)
    delete_source(REF)                       # idempotent: drop any prior copy first
    vectorstore.add_documents(docs)

    db = SessionLocal()
    try:
        db.query(KnowledgeSource).filter(KnowledgeSource.ref == REF).delete()
        db.add(KnowledgeSource(source_type="advisory", title="Extension Crop Advisories",
                               origin="file", ref=REF, chunk_count=len(docs)))
        db.commit()
    finally:
        db.close()
    return len(docs)


def demo() -> None:
    """Same question, three districts — show the answers stay region-scoped."""
    q = "advisory for rice pest and disease management"
    for dist in ("Thanjavur", "Coimbatore", "Erode"):
        hits = vectorstore.similarity_search(q, k=1, filter={"district": dist})
        h = hits[0] if hits else None
        print(f"\n{dist} ->")
        if h:
            m = h.metadata
            print(f"  {m.get('title')} | {m.get('crop')} | {m.get('source_name')} "
                  f"({m.get('publication_date')})")
            print(f"  {h.page_content[:180]}...")
        else:
            print("  (no advisory on file for this district — system refuses, does not guess)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("path", nargs="?", help="advisories_rag_ready.json")
    ap.add_argument("--demo", action="store_true", help="run the 3-district retrieval demo")
    args = ap.parse_args()

    if args.path:
        n = ingest(args.path)
        print(f"ingested {n} advisories -> vector store (ref={REF})")
    elif not args.demo:
        sys.exit("give a path to advisories_rag_ready.json, or --demo against what's indexed")
    if args.demo:
        demo()
