import io
import os
import re
import csv
import time
import json
import shutil
import tarfile
import tempfile
from urllib.parse import urljoin, urlparse
import bs4
import requests
from dotenv import load_dotenv
from openai import OpenAI


from langchain_core.documents import Document
from langchain_core.prompts import PromptTemplate
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import (
    WebBaseLoader, PyPDFLoader, TextLoader, Docx2txtLoader,
)
from langchain_community.vectorstores import Chroma
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from langchain_openai import ChatOpenAI
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from google import genai
from google.genai import types

# =========================================================
# LOAD ENV
# =========================================================

load_dotenv()
# =========================================================
# LANGSMITH CONFIG
# =========================================================

os.environ["LANGCHAIN_TRACING_V2"] = "true"
os.environ["LANGCHAIN_ENDPOINT"] = "https://api.smith.langchain.com"

# =========================================================
# CONFIG
# =========================================================

# Cosine-relevance floor for a retrieved chunk. Embedder-dependent: 0.15 suited
# ada-002; gemini-embedding-001 scores a strong match ~0.6-0.7 and noise ~0.3, so
# the floor is lower and tunable. Retune against eval/run_benchmark.py.
RELEVANCE_THRESHOLD = float(os.getenv("RELEVANCE_THRESHOLD", "0.05"))
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")   # chat model
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")           # embeddings
# Same DATA_DIR convention as database.py — a persistent volume in production.
CHROMA_PERSIST_DIR = os.path.join(os.getenv("DATA_DIR", "."), "chroma_db")

if not OPENROUTER_API_KEY:
    raise ValueError("OPENROUTER_API_KEY not found in .env file")
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY not found in .env file")

# =========================================================
# INDEXING & STORAGE
# =========================================================

# Gemini embeddings — free tier, no per-request token cap (OpenRouter's free tier
# rejects any embed request over a few thousand tokens). gemini-embedding-001 is
# 3072-dim; the chroma_db collection is fixed at that dim once created, so swapping
# the embedding model means wiping and rebuilding chroma_db.
embedding_func = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001",
    google_api_key=GEMINI_API_KEY,
)

vectorstore = Chroma(
    persist_directory=CHROMA_PERSIST_DIR,
    embedding_function=embedding_func
)

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200,
)

def _invalidate_bm25():
    """Tell the opt-in retrieval module its lexical index is stale. No-op unless
    retrieval.py is importable (RETRIEVAL_V2 workflow)."""
    try:
        import retrieval
        retrieval.reset_bm25()
    except Exception:
        pass


def _tag_and_store(docs, *, source_type: str, title: str, origin: str, ref: str,
                   split: bool = True) -> int:
    """Stamp normalized metadata on every doc, chunk (prose only), and index.
    Returns the number of chunks written."""
    clean = []
    for d in docs:
        text = (d.page_content or "").strip()
        if not text:
            continue
        md = d.metadata or {}
        d.metadata = {
            **md,
            "source_type": source_type,
            "title": md.get("title") or title,   # per-doc title wins (e.g. a CVE id)
            "origin": origin,
            "ref": ref,
        }
        clean.append(d)
    if not clean:
        return 0
    chunks = text_splitter.split_documents(clean) if split else clean
    vectorstore.add_documents(documents=chunks)
    _invalidate_bm25()
    return len(chunks)


def _load_file_docs(path: str):
    """Return (list[Document], source_type, split?) for a local file, by extension."""
    ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
    if ext == "pdf":
        return PyPDFLoader(path).load(), "pdf", True
    if ext == "docx":
        return Docx2txtLoader(path).load(), "docx", True
    if ext == "csv":
        return _csv_docs(path), "csv", False
    if ext in ("xlsx", "xlsm"):
        return _xlsx_docs(path), "xlsx", False
    if ext == "json":
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            return _json_docs(fh.read()), "json", False
    if ext == "log":
        return _log_docs(path), "log", True
    # txt / md / rst / yaml / yml / anything else -> plain text
    st = "text"
    try:
        docs = TextLoader(path, autodetect_encoding=True).load()
    except Exception:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            docs = [Document(page_content=fh.read(), metadata={"source": path})]
    return docs, st, True


def _csv_docs(path: str):
    out = []
    with open(path, "r", encoding="utf-8", errors="replace", newline="") as fh:
        for i, row in enumerate(csv.DictReader(fh)):
            body = "\n".join(f"{k}: {v}" for k, v in row.items() if v not in (None, ""))
            if body:
                out.append(Document(page_content=body, metadata={"row": i + 1}))
    return out


def _xlsx_docs(path: str):
    import openpyxl
    out = []
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    for sheet in wb.worksheets:
        rows = sheet.iter_rows(values_only=True)
        header = next(rows, None)
        if not header:
            continue
        header = [str(h) if h is not None else f"col{j}" for j, h in enumerate(header)]
        for i, row in enumerate(rows):
            body = "\n".join(
                f"{header[j]}: {v}" for j, v in enumerate(row)
                if j < len(header) and v not in (None, "")
            )
            if body:
                out.append(Document(page_content=body,
                                    metadata={"sheet": sheet.title, "row": i + 2}))
    wb.close()
    return out


def _json_docs(text: str, cap: int = 2000):
    data = json.loads(text)
    items = data if isinstance(data, list) else [data]
    out = []
    for i, item in enumerate(items[:cap]):
        body = json.dumps(item, indent=2, ensure_ascii=False) if not isinstance(item, str) else item
        out.append(Document(page_content=body, metadata={"index": i}))
    return out


def _log_docs(path: str, max_bytes: int = 2 * 1024 * 1024):
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        raw = fh.read(max_bytes)
    # collapse runs of identical lines: "<line>  (xN)"
    lines, prev, count, kept = raw.splitlines(), None, 0, []
    for ln in lines:
        if ln == prev:
            count += 1
            continue
        if prev is not None:
            kept.append(prev if count == 1 else f"{prev}  (x{count})")
        prev, count = ln, 1
    if prev is not None:
        kept.append(prev if count == 1 else f"{prev}  (x{count})")
    return [Document(page_content="\n".join(kept),
                     metadata={"source": path, "line_range": f"1-{len(lines)}"})]


def ingest_document(file_path: str) -> int:
    """Back-compat synchronous file ingest (used by the legacy /upload endpoint)."""
    docs, st, split = _load_file_docs(file_path)
    return _tag_and_store(docs, source_type=st, title=os.path.basename(file_path),
                          origin="file", ref=os.path.basename(file_path), split=split)

# =========================================================
# RETRIEVAL
# =========================================================

def retrieve_context(question: str) -> str | None:
    results = vectorstore.similarity_search_with_relevance_scores(
        question,
        k=4,
    )

    relevant_docs = [
        doc for doc, score in results if score >= RELEVANCE_THRESHOLD
    ]

    if not relevant_docs:
        return None

    return "\n\n".join(doc.page_content for doc in relevant_docs)

# =========================================================
# GREETING DETECTOR
# =========================================================

def is_greeting(text: str) -> bool:
    greetings = {
        "hi",
        "hello",
        "hey",
        "hai",
        "hii",
        "good morning",
        "good afternoon",
        "good evening",
        "whats up",
        "what's up",
    }

    text = text.lower().strip()
    return any(text == g or text.startswith(g) for g in greetings)


# =========================================================
# SMALL-TALK / IDENTITY PRE-ROUTER
# =========================================================
# Greetings and "what are you / what can you do" questions must NOT go through
# retrieval — otherwise the model answers them from whatever security docs came
# back. Caught here and answered with a fixed reply (also skips a round trip).

_GREETING_REPLY = (
    "Hello — I'm **RAG Uzhavan**, a region-aware farm advisory assistant. Ask me "
    "about irrigation, pests and diseases, sowing dates, soil, weather or mandi "
    "prices for your district, and I'll answer only from official indexed sources "
    "with the source and its date."
)

_CAPABILITY_REPLY = (
    "I'm **RAG Uzhavan**, a region-aware agricultural decision-support assistant. "
    "I don't guess — I answer from official data indexed for your district.\n\n"
    "- **Region-aware** — I filter to your state and district first, then search "
    "the advisories, so I never hand you another district's recommendation.\n"
    "- **Grounded & cited** — every answer comes from the indexed sources "
    "(state/university advisories, crop calendars, soil and weather records, mandi "
    "prices), with the source name and its publication date.\n"
    "- **Refuses when unsure** — if there is no reliable local data for your "
    "question, I say so instead of guessing.\n\n"
    "Ask about a crop problem, an irrigation or fertiliser question, a sowing "
    "window, or a mandi price for a named district."
)

_IDENTITY_RX = re.compile(
    r"^\s*(who\s+are\s+you|what\s+are\s+you|what\s+is\s+this|what('?s| is)\s+"
    r"(rag\s+uzhavan|uzhavan)|what\s+can\s+you\s+do|what\s+do\s+you\s+do|"
    r"what\s+are\s+you\s+capable\s+of|what\s+are\s+your\s+(capabilities|features)|"
    r"your\s+capabilities|how\s+do\s+you\s+work|introduce\s+yourself|help|"
    r"what\s+can\s+i\s+ask)\s*\??\s*$",
    re.I,
)


def smalltalk_reply(text: str) -> str | None:
    """Fixed reply for a greeting / identity / capability question, else None."""
    t = (text or "").strip()
    if not t:
        return None
    if is_greeting(t) and len(t) <= 40:
        return _GREETING_REPLY
    if _IDENTITY_RX.match(t):
        return _CAPABILITY_REPLY
    return None


# =========================================================
# PROMPT
# =========================================================

prompt = PromptTemplate(
    input_variables=["context", "question"],
    template="""
You are RAG Uzhavan, a region-aware agricultural advisory assistant for farmers.
Answer ONLY from the context passages below. Each passage begins with a tag:
[source · date · district / state · crop].

Region rule: the question names a location (district / block). Some passages may
be for other districts. Answer from the passage(s) whose district / state matches
the asked location; ignore the rest. As long as ONE passage matches, answer from
it — only refuse if NOT ONE passage matches the asked location and crop.

Structure the answer with these headings, in this order:

**What to do** — if the question is about a process or practice, the numbered
steps the farmer should take, in order. Omit this heading for a pure fact lookup
(price, weather, a date).
**How much** — the exact numbers from the context: doses, rates, spray intervals,
quantities, dates, prices. Copy them verbatim. Never invent or round a number,
chemical, variety or date.
**Why** — one or two lines on the reason for the recommendation.
**Source** — the source name and its publication date, taken from a passage tag.
If a passage has no date, write "date not stated".

If no passage matches the asked location and crop, reply with EXACTLY this line
and nothing else:
no current data for your location (district / block)
Do not guess and do not use general knowledge.
If the question is about your identity or capabilities, answer directly instead.

Context:
{context}

Question:
{question}

Answer:
"""
)

# `prompt` above is the strict Metrics-mode template.
PROMPT_METRICS = prompt

# Normal mode — generic grounded answer, no rigid headings, no slot gate.
PROMPT_NORMAL = PromptTemplate(
    input_variables=["context", "question"],
    template="""
You are RAG Uzhavan, an agricultural assistant for farmers. Answer the question
using ONLY the context passages below (each tagged [source · date · district / state · crop]).

- Prefer passages for any place named in the question. Do not present another
  district's data as if it were the asked district's.
- Give specifics — quantities, chemicals, dates, prices — exactly as written in
  the context. Never invent or round them.
- Be concise and practical: bullets or short steps.
- Name the source and its date at the end.
- If the context does not cover the question, reply with EXACTLY this line and
  nothing else:
  no current data for your location (district / block)
  Do not use general knowledge.
- If the question is about your identity or capabilities, answer directly.

Context:
{context}

Question:
{question}

Answer:
"""
)

# Sensor mode — Normal + live field readings folded into the reasoning.
PROMPT_SENSOR = PromptTemplate(
    input_variables=["context", "question", "sensors"],
    template="""
You are RAG Uzhavan, an agricultural assistant for farmers. Answer using ONLY the
context passages below (each tagged [source · date · district / state · crop]) AND
the live field sensor readings.

{sensors}

- Use the readings to judge timing and immediate action — e.g. low water level ->
  irrigate now; high humidity at a susceptible stage -> disease risk. State plainly
  what the readings imply.
- Keep every agronomic specific (dose, chemical, spray interval, variety) grounded
  in the context passages, quoted exactly. Never invent a number.
- Prefer passages for any place named in the question.
- Name the source and its date at the end.
- If the context does not cover the crop or practice asked, say so, but still give
  the reading-based timing guidance you safely can.

Context:
{context}

Question:
{question}

Answer:
"""
)

_SENSOR_UNITS = {"water_level": "cm", "temperature": "°C", "humidity": "%",
                 "soil_moisture": "%", "ph": "pH", "rainfall": "mm"}


def _format_sensors(sensors) -> str:
    """{'water_level': 4, 'temperature': 32, ...} -> a one-line readings block."""
    parts = []
    for k, v in (sensors or {}).items():
        if v in (None, "", "null"):
            continue
        parts.append(f"{k.replace('_', ' ')} {v} {_SENSOR_UNITS.get(k, '')}".strip())
    return "Current field sensor readings: " + ", ".join(parts) + "." if parts else ""


# =========================================================
# LLM
# =========================================================

llm = ChatOpenAI(
    api_key=OPENROUTER_API_KEY,
    base_url="https://openrouter.ai/api/v1",
    model="openai/gpt-oss-120b",
    max_tokens=1000
)

# =========================================================
# REFUSAL
# =========================================================
# No web / general-knowledge fallback: the problem statement requires the system
# to refuse when there is no reliable local data rather than guess.

NO_LOCAL_DATA_MSG = "no current data for your location (district / block)"

# =========================================================
# RAG FUNCTION
# =========================================================

FALLBACK_TRIGGERS = [
    "no current data for your location",
    "no reliable local data",
    "indexed sources don't cover this",
    "indexed sources don’t cover this",
    "don't know based on the given context",
    "don’t know based on the given context",
]


def _is_refusal(text: str) -> bool:
    """True when the whole reply is a 'no local data' notice (not a real answer)."""
    t = (text or "").strip().lower()
    return len(t) < 160 and any(trigger in t for trigger in FALLBACK_TRIGGERS)


# =========================================================
# SHORT-TERM CONVERSATION MEMORY
# =========================================================
# The caller (app.py) passes `history` = recent [{role, content}] for the session,
# oldest first, already windowed. Two uses:
#   1. condense a follow-up into a standalone question for retrieval
#   2. give the generator a short transcript so the answer stays coherent
# Both degrade to "no memory" on any error.

MEMORY_WINDOW = int(os.getenv("MEMORY_WINDOW", "6"))


def _memory_on() -> bool:
    return os.getenv("CONVERSATION_MEMORY_ENABLED", "true").strip().lower() in (
        "1", "true", "yes", "on")


def _history_block(history) -> str:
    if not history:
        return ""
    lines = []
    for m in history:
        who = "User" if m.get("role") == "user" else "Assistant"
        c = " ".join((m.get("content") or "").split())[:500]
        if c:
            lines.append(f"{who}: {c}")
    return "\n".join(lines)


def _condense_question(history, question: str) -> str:
    """Rewrite a follow-up into a standalone question using recent turns.
    Returns `question` unchanged when there is no history or on any error."""
    block = _history_block(history)
    if not block:
        return question
    try:
        r = _stream_client.chat.completions.create(
            model="openai/gpt-oss-120b", max_tokens=160, temperature=0.0,
            messages=[{"role": "user", "content":
                       "Given the conversation and a follow-up question, rewrite the "
                       "follow-up as a standalone question that makes sense on its own. "
                       "Keep it faithful and do NOT answer it. If it is already "
                       "standalone, return it unchanged.\n\n"
                       f"Conversation:\n{block}\n\nFollow-up: {question}\n\n"
                       "Standalone question:"}],
            # gpt-oss-120b always reasons; `exclude` keeps that out of `content`.
            extra_body={"reasoning": {"effort": "low", "exclude": True}},
        )
        return (r.choices[0].message.content or "").strip() or question
    except Exception as e:  # noqa: BLE001
        print(f"[memory] condense failed, using raw question: {e}")
        return question


# =========================================================
# QUERY UNDERSTANDING — slot filling + clarification gate
# =========================================================
# Every question must carry location, crop, growth stage and season. If any is
# missing we ask the farmer for it and DO NOT run retrieval / generation.

REQUIRED_SLOTS = ("location", "crop", "growth_stage", "season")

_SLOT_LABELS = {
    "location": "your district (or block / village)",
    "crop": "the crop",
    "growth_stage": "the crop's growth stage",
    "season": "the season",
}

_SLOT_PROMPT = """Extract these fields from the farmer's question. Use the \
conversation for any field that was given in an earlier turn. Return ONLY a JSON \
object, no prose:
{{"location": <district or block/village name; a state or country alone is NOT enough, use null>,
 "crop": <crop name, else null>,
 "growth_stage": <crop / growth stage e.g. nursery, tillering, flowering, boll formation, sowing; else null>,
 "season": <season e.g. Kharif, Rabi, Zaid, Samba, Kuruvai, Rangada, Boro; else null>}}

Conversation:
{history}

Question: {question}

JSON:"""


def extract_slots(question: str, history=None):
    """Return (slots dict, missing list). On any extraction error returns
    ([], []) i.e. 'proceed' — a transient blip must not block a good question."""
    block = _history_block(history) if history else ""
    try:
        r = _stream_client.chat.completions.create(
            model="openai/gpt-oss-120b", max_tokens=300, temperature=0.0,
            messages=[{"role": "user", "content": _SLOT_PROMPT.format(
                history=block or "(none)", question=question)}],
            extra_body={"reasoning": {"effort": "low", "exclude": True}},
        )
        m = re.search(r"\{.*\}", r.choices[0].message.content or "", re.S)
        raw = json.loads(m.group(0)) if m else {}
    except Exception as e:  # noqa: BLE001 - fail open
        print(f"[slots] extraction failed, proceeding: {e}")
        return {}, []
    slots = {k: (str(raw.get(k)).strip()
                 if raw.get(k) not in (None, "", "null", "None") else None)
             for k in REQUIRED_SLOTS}
    missing = [k for k in REQUIRED_SLOTS if not slots[k]]
    return slots, missing


def clarify_message(missing) -> str:
    ask = ", ".join(_SLOT_LABELS[k] for k in missing)
    return ("To give you a reliable answer for your area I still need "
            f"{ask}. Please add {'that' if len(missing) == 1 else 'those'} and ask again.")


def _doc_for_prompt(doc) -> str:
    """One passage, tagged with its provenance so the model can cite it and
    respect the region."""
    m = doc.metadata or {}
    tag = " · ".join(x for x in (
        m.get("source_name") or m.get("source") or m.get("title"),
        m.get("publication_date"),
        " / ".join(y for y in (m.get("district"), m.get("state")) if y) or None,
        m.get("crop"),
    ) if x)
    body = doc.page_content or ""
    return f"[{tag}]\n{body}" if tag else body


def rag_answer(question: str, history=None, mode: str = "normal", sensors=None) -> str:
    """Non-streaming counterpart of rag_answer_stream (legacy /ask). Same three
    modes."""
    small = smalltalk_reply(question)
    if small:
        return small

    mem = bool(history) and _memory_on()
    block = _history_block(history) if mem else ""

    district = None
    if mode == "metrics":
        slots, missing = extract_slots(question, history)
        if missing:
            return clarify_message(missing)
        district = slots.get("location")

    search_q = _condense_question(history, question) if mem else question
    docs = retrieve_context_docs(search_q, district=district)
    if not docs:
        return NO_LOCAL_DATA_MSG
    context = "\n\n---\n\n".join(_doc_for_prompt(d) for d in docs)

    if mode == "metrics":
        pt = PROMPT_METRICS.format(context=context, question=question)
    elif mode == "sensor" and sensors:
        pt = PROMPT_SENSOR.format(context=context, question=question,
                                  sensors=_format_sensors(sensors))
    else:
        pt = PROMPT_NORMAL.format(context=context, question=question)
    if block:
        pt = f"Conversation so far:\n{block}\n\n{pt}"
    return _generate_once(pt) or NO_LOCAL_DATA_MSG


# =========================================================
# STREAMING RAG  (SSE)  — real token stream + reasoning + structured sources
# =========================================================
#
# langchain-openai 1.x drops OpenRouter's `delta.reasoning`, so the generation
# step uses the raw openai client. Retrieval stays on langchain/Chroma.

_stream_client = OpenAI(
    api_key=OPENROUTER_API_KEY,
    base_url="https://openrouter.ai/api/v1",
)


def retrieve_context_docs(question: str, district: str | None = None):
    """Retrieve Document objects (with metadata). When `district` is given, keep
    only passages tagged for that district (passages with no district tag — e.g.
    weather/price CSV rows — are kept and left for the prompt's region rule).
    This is the region-first filter: another district's advisory is never used.

    With RETRIEVAL_V2 set, delegates to the opt-in hybrid/rerank pipeline."""
    if os.getenv("RETRIEVAL_V2", "").strip().lower() in ("1", "true", "yes", "on"):
        try:
            import retrieval
            return retrieval.retrieve(question)
        except Exception as e:  # noqa: BLE001 - baseline is always a safe fallback
            print(f"[retrieve_context_docs] v2 unavailable, using baseline: {e}")
    results = vectorstore.similarity_search_with_relevance_scores(question, k=8)
    docs = [doc for doc, score in results if score >= RELEVANCE_THRESHOLD]
    if district:
        dl = _norm_place(district)
        docs = [d for d in docs
                if not (d.metadata or {}).get("district")
                or _place_match(dl, _norm_place((d.metadata or {})["district"]))]
    return docs[:4] or None


_PLACE_SUFFIX = re.compile(r"\b(district|dist|block|taluk|taluka|tehsil|mandal|division)\b", re.I)


def _norm_place(s: str) -> str:
    return _PLACE_SUFFIX.sub("", str(s or "")).strip().lower().strip(" ,.-")


def _place_match(a: str, b: str) -> bool:
    return bool(a) and bool(b) and (a == b or a in b or b in a)


def _source_from_doc(doc, i: int) -> dict:
    meta = doc.metadata or {}
    ref = meta.get("ref")
    raw = meta.get("title") or meta.get("source") or meta.get("file_path") or "document"
    page = meta.get("page")
    url = ref if isinstance(ref, str) and ref.startswith("http") else None
    return {
        "id": f"doc-{i}",
        "title": os.path.basename(str(raw)),
        "snippet": " ".join((doc.page_content or "").split())[:220],
        "page": (page + 1) if isinstance(page, int) else None,
        "kind": "web" if url else "doc",
        "url": url,
        "source_type": meta.get("source_type", "doc"),
    }


def _typewriter(text: str, size: int = 18):
    # ponytail: naive server-side typewriter for canned / non-streamed text
    for i in range(0, len(text), size):
        yield {"type": "delta", "text": text[i : i + size]}
        time.sleep(0.015)


def _stream_llm(prompt_text: str, *, reasoning_effort: str = "low", max_tokens: int = 1500):
    """Stream one completion from OpenRouter. Yields {type:'reasoning'} and
    {type:'delta'} events as they arrive; returns the full answer text.

    gpt-oss-120b's hidden reasoning counts against max_tokens — with 'medium'
    effort and a tight budget it sometimes spends the whole budget thinking and
    emits no answer. 'low' + 1500 keeps the answer inside the budget and inside
    the 5 s target."""
    buf = []
    try:
        stream = _stream_client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[{"role": "user", "content": prompt_text}],
            max_tokens=max_tokens,
            stream=True,
            extra_body={"reasoning": {"effort": reasoning_effort}},
        )
    except Exception as e:  # noqa: BLE001 - surface any transport error to the UI
        yield {"type": "delta", "text": f"(model error: {e})"}
        return ""

    for ev in stream:
        delta = ev.choices[0].delta
        r = getattr(delta, "reasoning", None) or getattr(delta, "reasoning_content", None)
        if r:
            yield {"type": "reasoning", "delta": r}
        c = getattr(delta, "content", None)
        if c:
            buf.append(c)
            yield {"type": "delta", "text": c}
    return "".join(buf)


def _generate_once(prompt_text: str):
    """Non-streaming completion — used to retry when the streamed attempt
    returned reasoning but no answer text."""
    try:
        r = _stream_client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[{"role": "user", "content": prompt_text}],
            max_tokens=1200,
            extra_body={"reasoning": {"effort": "low", "exclude": True}},
        )
        return (r.choices[0].message.content or "").strip()
    except Exception as e:  # noqa: BLE001
        print(f"[_generate_once] retry failed: {e}")
        return ""


def _answer_from_docs(docs, build_prompt_text):
    """Shared tail: stream the LLM, retry once if it came back empty, and emit
    the source list ONLY when a real answer was produced — a refusal / no-data
    reply carries no citations. `build_prompt_text(context)` -> str."""
    yield {"type": "step", "id": "draft",
           "label": "Drafting answer from context", "state": "active"}

    context = "\n\n---\n\n".join(_doc_for_prompt(d) for d in docs)
    prompt_text = build_prompt_text(context)
    full = yield from _stream_llm(prompt_text)

    if not full.strip():                    # model spent the budget reasoning — retry
        retry = _generate_once(prompt_text)
        if retry:
            full = retry
            yield from _typewriter(retry)

    if not full.strip():
        yield from _typewriter(NO_LOCAL_DATA_MSG)
        yield {"type": "step", "id": "draft", "label": "No answer produced", "state": "done"}
    elif _is_refusal(full):
        yield {"type": "step", "id": "draft",
               "label": "No local data for this", "state": "done"}
    else:
        yield {"type": "sources",
               "sources": [_source_from_doc(d, i) for i, d in enumerate(docs)]}
        yield {"type": "step", "id": "draft", "label": "Answer complete", "state": "done"}


def _stream_metrics(question, history, hist_block, use_memory):
    """Mode 2 — strict: require location, crop, growth stage, season; clarify if
    any is missing; region-filter retrieval; answer in the fixed framework."""
    yield {"type": "step", "id": "understand",
           "label": "Reading location, crop, stage and season", "state": "active"}
    slots, missing = extract_slots(question, history)
    if missing:
        yield {"type": "step", "id": "understand",
               "label": f"Need more detail: {', '.join(missing)}", "state": "done"}
        yield from _typewriter(clarify_message(missing))
        return
    yield {"type": "step", "id": "understand",
           "label": f"{slots.get('crop')} · {slots.get('growth_stage')} · "
                    f"{slots.get('season')} · {slots.get('location')}", "state": "done"}

    search_q = _condense_question(history, question) if use_memory else question
    yield {"type": "step", "id": "retrieve",
           "label": f"Searching {slots.get('location')} data", "state": "active"}
    docs = retrieve_context_docs(search_q, district=slots.get("location"))
    if not docs:
        yield {"type": "step", "id": "retrieve",
               "label": "No matching local data", "state": "done"}
        yield from _typewriter(NO_LOCAL_DATA_MSG)
        return
    yield {"type": "step", "id": "retrieve",
           "label": f"Retrieved {len(docs)} passage(s)", "state": "done"}

    def _build(context):
        pt = PROMPT_METRICS.format(context=context, question=question)
        return f"Conversation so far:\n{hist_block}\n\n{pt}" if hist_block else pt

    yield from _answer_from_docs(docs, _build)


def rag_answer_stream(question: str, history=None, mode: str = "normal", sensors=None):
    """Generator of SSE content events. `mode` selects the pipeline:
      normal  — generic grounded Q&A, no slot gate  (default)
      metrics — strict: all four slots required, fixed answer framework
      sensor  — normal + live water-level / temperature / humidity readings
    `sensors` is {water_level, temperature, humidity, ...} for sensor mode.
    """
    small = smalltalk_reply(question)
    if small:
        yield {"type": "step", "id": "answer", "label": "Answering directly", "state": "done"}
        yield from _typewriter(small)
        return

    use_memory = bool(history) and _memory_on()
    hist_block = _history_block(history) if use_memory else ""

    if mode == "metrics":
        yield from _stream_metrics(question, history, hist_block, use_memory)
        return

    # normal / sensor — no slot gate, always attempt an answer
    search_q = _condense_question(history, question) if use_memory else question
    yield {"type": "step", "id": "retrieve",
           "label": "Searching the knowledge base", "state": "active"}
    docs = retrieve_context_docs(search_q)
    if not docs:
        yield {"type": "step", "id": "retrieve", "label": "No matching data", "state": "done"}
        yield from _typewriter(NO_LOCAL_DATA_MSG)
        return
    yield {"type": "step", "id": "retrieve",
           "label": f"Retrieved {len(docs)} passage(s)", "state": "done"}

    sensor_block = _format_sensors(sensors) if mode == "sensor" else ""
    if sensor_block:
        yield {"type": "step", "id": "sensor",
               "label": sensor_block.replace("Current field sensor readings: ", "Readings: ").rstrip("."),
               "state": "done"}

    def _build(context):
        if sensor_block:
            pt = PROMPT_SENSOR.format(context=context, question=question, sensors=sensor_block)
        else:
            pt = PROMPT_NORMAL.format(context=context, question=question)
        return f"Conversation so far:\n{hist_block}\n\n{pt}" if hist_block else pt

    yield from _answer_from_docs(docs, _build)


# =========================================================
# MULTI-CHANNEL INGESTION  (SSE progress)
# =========================================================
#
# Each generator yields:
#   {"type": "meta", source_type, title, origin, ref}   -- once, identifies the source
#   {"type": "step", label}                             -- coarse phase
#   {"type": "progress", done, total, label}            -- fine progress
#   {"type": "done", chunk_count}                       -- terminal success
# The endpoint wraps this in SSE, writes a KnowledgeSource row on "done",
# and turns any exception into {"type": "error", message}.

_CODE_EXT = {".md", ".mdx", ".rst", ".txt", ".yaml", ".yml", ".py", ".json",
             ".yar", ".yara", ".rules", ".toml", ".cfg", ".conf", ".ini"}
_SKIP_DIRS = ("/.git/", "/node_modules/", "/dist/", "/build/", "/.venv/", "/vendor/", "/.github/")

_MITRE_STIX = ("https://raw.githubusercontent.com/mitre-attack/attack-stix-data/"
               "master/enterprise-attack/enterprise-attack.json")
_KEV_JSON = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
_CISA_RSS = "https://www.cisa.gov/cybersecurity-advisories/all.xml"


def _batched(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def _dig(obj, path: str):
    """Walk a dotted json_path ('data.items' / 'vulnerabilities[]'); '' -> obj itself."""
    for part in (path or "").replace("[]", "").split("."):
        part = part.strip()
        if not part:
            continue
        obj = obj.get(part) if isinstance(obj, dict) else None
    return obj


def ingest_file_stream(path: str):
    name = os.path.basename(path)
    yield {"type": "step", "label": f"Parsing {name}"}
    docs, st, split = _load_file_docs(path)
    yield {"type": "meta", "source_type": st, "title": name, "origin": "file", "ref": name}
    yield {"type": "step", "label": f"Indexing {name}"}
    n = _tag_and_store(docs, source_type=st, title=name, origin="file", ref=name, split=split)
    yield {"type": "done", "chunk_count": n}


_CVE_ID_RE = re.compile(r"CVE-\d{4}-\d{4,7}", re.I)
_UA = {"User-Agent": "rag-uzhavan/1.0"}


def _fetch_cve_record(cve_id: str) -> Document:
    """Pull a structured CVE record from MITRE's CVE Services API and render it
    as readable text. Works for any CVE id — no auth, clean JSON (unlike the
    JS-rendered cve.org / nvd.nist.gov pages, which scrape to nothing)."""
    r = requests.get(f"https://cveawg.mitre.org/api/cve/{cve_id}", timeout=30, headers=_UA)
    r.raise_for_status()
    d = r.json()
    meta = d.get("cveMetadata", {})
    cna = d.get("containers", {}).get("cna", {})

    lines = [cve_id]
    if cna.get("title"):
        lines.append(f"Title: {cna['title']}")
    if meta.get("datePublished"):
        lines.append(f"Published: {meta['datePublished']}")

    desc = " ".join(
        x.get("value", "") for x in cna.get("descriptions", [])
        if str(x.get("lang", "en")).lower().startswith("en")
    ).strip()
    if desc:
        lines.append(f"\nDescription:\n{desc}")

    affected = []
    for a in cna.get("affected", []):
        vendor, product = a.get("vendor", "?"), a.get("product", "?")
        vers = ", ".join(v.get("version", "") for v in a.get("versions", []) if v.get("version"))
        affected.append(f"- {vendor} {product}" + (f" ({vers})" if vers else ""))
    if affected:
        lines.append("\nAffected:\n" + "\n".join(affected))

    for m in cna.get("metrics", []):
        for key in ("cvssV4_0", "cvssV3_1", "cvssV3_0", "cvssV2_0"):
            c = m.get(key)
            if c:
                lines.append(f"\nCVSS: {c.get('baseScore')} {c.get('baseSeverity', '')} "
                             f"({c.get('vectorString', '')})".rstrip())
                break

    cwes = [x["description"] for pt in cna.get("problemTypes", [])
            for x in pt.get("descriptions", []) if x.get("description")]
    if cwes:
        lines.append("\nWeakness: " + "; ".join(cwes))

    refs = [x["url"] for x in cna.get("references", []) if x.get("url")]
    if refs:
        lines.append("\nReferences:\n" + "\n".join(f"- {u}" for u in refs[:20]))

    return Document(page_content="\n".join(lines), metadata={"title": cve_id, "cve_id": cve_id})


def _crawl_site(start: str, max_pages: int):
    """Breadth-first crawl of same-host pages from `start`. Yields Documents."""
    max_pages = max(1, min(int(max_pages or 20), 40))
    host = urlparse(start).netloc
    seen, queue, out = set(), [start], []
    while queue and len(out) < max_pages:
        u = queue.pop(0)
        if u in seen:
            continue
        seen.add(u)
        try:
            r = requests.get(u, timeout=20, headers=_UA)
            if r.status_code != 200 or "text/html" not in r.headers.get("content-type", ""):
                continue
        except Exception:
            continue
        soup = bs4.BeautifulSoup(r.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header", "noscript", "svg"]):
            tag.decompose()
        text = " ".join(soup.get_text(" ").split())
        if len(text) > 200:
            title = (soup.title.string.strip() if soup.title and soup.title.string else u)
            out.append((Document(page_content=text, metadata={"source": u, "title": title}), len(out) + 1))
            yield out[-1][0], len(out), max_pages
        for a in soup.find_all("a", href=True):
            nxt = urljoin(u, a["href"]).split("#")[0]
            if urlparse(nxt).netloc == host and nxt not in seen and nxt not in queue:
                queue.append(nxt)


def ingest_url_stream(url: str, crawl: bool = False, max_pages: int = 20):
    # --- CVE link -> structured record from the CVE API -------------------
    m = _CVE_ID_RE.search(url)
    if m and re.search(r"cve\.org|nvd\.nist\.gov|mitre\.org|first\.org", url, re.I):
        cid = m.group(0).upper()
        yield {"type": "step", "label": f"Fetching {cid} from the CVE API"}
        doc = _fetch_cve_record(cid)
        yield {"type": "meta", "source_type": "cve", "title": cid, "origin": "url", "ref": cid}
        yield {"type": "step", "label": "Indexing record"}
        n = _tag_and_store([doc], source_type="cve", title=cid, origin="url",
                           ref=cid, split=False)
        yield {"type": "done", "chunk_count": n}
        return

    # --- crawl the site -------------------------------------------------
    if crawl:
        yield {"type": "meta", "source_type": "url", "title": url, "origin": "url", "ref": url}
        yield {"type": "step", "label": f"Crawling {urlparse(url).netloc}"}
        docs = []
        for doc, done, total in _crawl_site(url, max_pages):
            docs.append(doc)
            yield {"type": "progress", "done": done, "total": total, "label": "Crawling pages"}
        if not docs:
            yield {"type": "error", "message": "crawl found no readable pages"}
            return
        yield {"type": "step", "label": f"Indexing {len(docs)} page(s)"}
        n = _tag_and_store(docs, source_type="url", title=url, origin="url", ref=url)
        yield {"type": "done", "chunk_count": n}
        return

    # --- single page (default) ---------------------------------------------
    yield {"type": "step", "label": f"Fetching {url}"}
    docs = WebBaseLoader(url).load()
    title = (docs[0].metadata.get("title") if docs else "") or url
    st = "advisory" if re.search(r"cisa\.gov|microsoft\.com|cisco\.com|advisor", url, re.I) else "url"
    yield {"type": "meta", "source_type": st, "title": title, "origin": "url", "ref": url}
    yield {"type": "step", "label": "Indexing page"}
    n = _tag_and_store(docs, source_type=st, title=title, origin="url", ref=url)
    yield {"type": "done", "chunk_count": n}


def ingest_api_stream(url: str, headers=None, json_path: str = "", title_key=None):
    import httpx
    yield {"type": "step", "label": f"GET {url}"}
    with httpx.Client(timeout=30, follow_redirects=True) as client:
        resp = client.get(url, headers=headers or {})
        resp.raise_for_status()
        data = resp.json()
    items = _dig(data, json_path)
    if isinstance(items, dict):
        items = [items]
    if not isinstance(items, list):
        yield {"type": "error", "message": f"json_path '{json_path}' did not resolve to a list"}
        return
    title = "API · " + url.split("//")[-1][:60]
    yield {"type": "meta", "source_type": "json", "title": title, "origin": "api", "ref": url}
    total, done, n = len(items), 0, 0
    yield {"type": "step", "label": f"Indexing {total} records"}
    for batch in _batched(items, 25):
        docs = []
        for it in batch:
            body = it if isinstance(it, str) else json.dumps(it, indent=2, ensure_ascii=False)
            md = {}
            if title_key and isinstance(it, dict) and it.get(title_key):
                md["title"] = str(it[title_key])
            docs.append(Document(page_content=body, metadata=md))
        n += _tag_and_store(docs, source_type="json", title=title, origin="api",
                            ref=url, split=False)
        done += len(batch)
        yield {"type": "progress", "done": done, "total": total, "label": "Indexing records"}
    yield {"type": "done", "chunk_count": n}


def _github_owner_repo(url: str):
    m = re.search(r"github\.com[/:]+([^/\s]+)/([^/#?\s]+)", url.strip())
    if not m:
        raise ValueError(f"not a GitHub repo URL: {url!r}")
    owner, repo = m.group(1), m.group(2)
    if repo.endswith(".git"):
        repo = repo[:-4]
    return owner, repo


def _download_repo_tarball(owner: str, repo: str, branch: str) -> bytes:
    """Fetch a repo snapshot as a .tar.gz over HTTP — no `git` binary, and
    codeload isn't API-rate-limited. Tries the given branch, then main/master."""
    candidates = []
    for b in dict.fromkeys([branch, "main", "master"]):
        candidates.append(f"https://codeload.github.com/{owner}/{repo}/tar.gz/refs/heads/{b}")
        candidates.append(f"https://codeload.github.com/{owner}/{repo}/tar.gz/{b}")
    candidates.append(f"https://api.github.com/repos/{owner}/{repo}/tarball/{branch}")
    last = "no response"
    for u in candidates:
        try:
            r = requests.get(u, timeout=60, headers=_UA)
            if r.status_code == 200 and r.content:
                return r.content
            last = f"HTTP {r.status_code} for {u}"
        except Exception as e:  # noqa: BLE001
            last = f"{type(e).__name__}: {e}"
    raise RuntimeError(f"could not download repo archive ({last})")


def ingest_github_stream(repo_url: str, branch: str = "main"):
    owner, repo = _github_owner_repo(repo_url)
    label = f"{owner}/{repo}"
    canonical = f"https://github.com/{owner}/{repo}"
    yield {"type": "meta", "source_type": "github", "title": label,
           "origin": "github", "ref": canonical}

    def _ff(p: str) -> bool:
        q = "/" + p.replace("\\", "/").lstrip("/")
        if any(s in q for s in _SKIP_DIRS):
            return False
        return os.path.splitext(q)[1].lower() in _CODE_EXT

    yield {"type": "step", "label": f"Downloading {label}"}
    raw = _download_repo_tarball(owner, repo, branch or "main")

    yield {"type": "step", "label": "Reading repository files"}
    cap = 1500  # keep a giant monorepo from blowing up the embed budget
    docs, capped = [], False
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as tar:
        for member in tar.getmembers():
            if len(docs) >= cap:
                capped = True
                break
            if not member.isfile() or member.size > 200_000:
                continue
            rel = member.name.split("/", 1)[1] if "/" in member.name else member.name
            if not _ff(rel):
                continue
            try:
                text = tar.extractfile(member).read().decode("utf-8", "replace")
            except Exception:  # noqa: BLE001
                continue
            if text.strip():
                docs.append(Document(page_content=text, metadata={"source": rel}))

    total, done, n = len(docs), 0, 0
    if total == 0:
        yield {"type": "error", "message": "no indexable text/config/rule files found in the repo"}
        return
    yield {"type": "step",
           "label": f"Indexing {total} files" + (f" (capped at {cap})" if capped else "")}
    for batch in _batched(docs, 20):
        n += _tag_and_store(batch, source_type="github", title=label,
                            origin="github", ref=canonical)
        done += len(batch)
        yield {"type": "progress", "done": done, "total": total, "label": "Indexing files"}
    yield {"type": "done", "chunk_count": n}


def import_feed_stream(feed: str, include_subtechniques: bool = False, limit: int = 25):
    if feed == "mitre_attack":
        yield from _import_mitre(include_subtechniques)
    elif feed == "cisa_kev":
        yield from _import_kev()
    elif feed == "cisa_advisories":
        yield from _import_cisa_advisories(limit)
    else:
        yield {"type": "error", "message": f"unknown feed '{feed}'"}


def _import_mitre(include_sub: bool):
    yield {"type": "meta", "source_type": "attack", "title": "MITRE ATT&CK (Enterprise)",
           "origin": "feed", "ref": "feed:mitre_attack"}
    yield {"type": "step", "label": "Downloading ATT&CK STIX bundle (~35 MB)"}
    data = requests.get(_MITRE_STIX, timeout=90).json()
    techniques = []
    for o in data.get("objects", []):
        if o.get("type") != "attack-pattern" or o.get("x_mitre_deprecated") or o.get("revoked"):
            continue
        tid = next((r.get("external_id") for r in o.get("external_references", [])
                    if r.get("source_name") == "mitre-attack"), None)
        if not tid or (not include_sub and "." in tid):
            continue
        techniques.append((tid, o))
    total, done, n = len(techniques), 0, 0
    yield {"type": "step", "label": f"Indexing {total} techniques"}
    for batch in _batched(techniques, 40):
        docs = []
        for tid, o in batch:
            tactics = ", ".join(p.get("phase_name", "") for p in o.get("kill_chain_phases", []))
            plats = ", ".join(o.get("x_mitre_platforms", []) or [])
            body = (f"{tid}  {o.get('name', '')}\n"
                    f"Tactics: {tactics}\nPlatforms: {plats}\n\n{o.get('description', '')}")
            docs.append(Document(page_content=body,
                                 metadata={"title": f"{tid} {o.get('name', '')}",
                                           "technique_id": tid}))
        n += _tag_and_store(docs, source_type="attack", title="MITRE ATT&CK",
                            origin="feed", ref="feed:mitre_attack", split=False)
        done += len(batch)
        yield {"type": "progress", "done": done, "total": total, "label": "Indexing techniques"}
    yield {"type": "done", "chunk_count": n}


def _import_kev():
    yield {"type": "meta", "source_type": "kev", "title": "CISA KEV Catalog",
           "origin": "feed", "ref": "feed:cisa_kev"}
    yield {"type": "step", "label": "Downloading CISA KEV catalog"}
    data = requests.get(_KEV_JSON, timeout=60).json()
    vulns = data.get("vulnerabilities", [])
    total, done, n = len(vulns), 0, 0
    yield {"type": "step", "label": f"Indexing {total} known-exploited CVEs"}
    for batch in _batched(vulns, 50):
        docs = []
        for v in batch:
            body = (f"{v.get('cveID', '')}  {v.get('vulnerabilityName', '')}\n"
                    f"Vendor: {v.get('vendorProject', '')}  Product: {v.get('product', '')}\n"
                    f"Added: {v.get('dateAdded', '')}  Due: {v.get('dueDate', '')}\n\n"
                    f"{v.get('shortDescription', '')}\n\n"
                    f"Required action: {v.get('requiredAction', '')}")
            docs.append(Document(page_content=body,
                                 metadata={"title": v.get("cveID", "CVE"),
                                           "cve_id": v.get("cveID")}))
        n += _tag_and_store(docs, source_type="kev", title="CISA KEV",
                            origin="feed", ref="feed:cisa_kev", split=False)
        done += len(batch)
        yield {"type": "progress", "done": done, "total": total, "label": "Indexing CVEs"}
    yield {"type": "done", "chunk_count": n}


def _import_cisa_advisories(limit: int):
    import feedparser
    yield {"type": "meta", "source_type": "advisory", "title": "CISA Advisories",
           "origin": "feed", "ref": "feed:cisa_advisories"}
    yield {"type": "step", "label": "Reading CISA advisory feed"}
    entries = feedparser.parse(_CISA_RSS).entries[: max(1, min(limit, 50))]
    total, done, n = len(entries), 0, 0
    for e in entries:
        link = e.get("link")
        try:
            docs = WebBaseLoader(link).load() if link else []
        except Exception:
            docs = []
        if not docs:
            docs = [Document(page_content=f"{e.get('title', '')}\n\n{e.get('summary', '')}",
                             metadata={"source": link})]
        for d in docs:
            d.metadata["title"] = e.get("title", "CISA advisory")
        n += _tag_and_store(docs, source_type="advisory",
                            title=e.get("title", "CISA advisory"),
                            origin="feed", ref="feed:cisa_advisories")
        done += 1
        yield {"type": "progress", "done": done, "total": total, "label": "Fetching advisories"}
    yield {"type": "done", "chunk_count": n}


def delete_source(ref: str) -> int:
    """Best-effort removal of a source's chunks from Chroma by the `ref` metadata key.
    ponytail: relies on Chroma `where=` delete; returns 0 (row still removed) if unsupported."""
    try:
        col = vectorstore._collection
        before = col.count()
        col.delete(where={"ref": ref})
        _invalidate_bm25()
        return max(0, before - col.count())
    except Exception:
        return 0
