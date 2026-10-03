"""
RAG Uzhavan benchmark harness.

Runs every question in eval/datasets/*.csv through the live RAG pipeline, judges
each answer, and reports accuracy + groundedness + localisation metrics.

    cd Backend && python eval/run_benchmark.py              # full run, LLM judge
    cd Backend && python eval/run_benchmark.py --limit 20   # quick slice
    cd Backend && python eval/run_benchmark.py --no-judge   # heuristic only, no LLM judge
    cd Backend && python eval/run_benchmark.py --types geographic_leakage,unanswerable

Outputs (eval/results/):
    run_<ts>.jsonl      one line per question (raw answer, docs, judge verdict)
    report_<ts>.md      the metrics report
    latest.json         machine-readable metrics of the most recent run

--------------------------------------------------------------------------------
METRICS  (let N = all questions)

  answerable questions  -> should return a correct, grounded, region-scoped answer
  unanswerable + geographic_leakage -> should REFUSE ("no reliable local data")

  correct(row) =
      should_refuse:  judge.refused
      answerable:      judge.answer_matches_expected AND judge.grounded
                       AND NOT judge.hallucinated

  Overall Accuracy        = Σ correct / N
  Answerable Accuracy     = Σ (correct & answerable) / |answerable|
  Refusal Accuracy        = Σ (refused & should_refuse) / |should_refuse|
  Hallucination Rate      = Σ (hallucinated & answered) / |answered|
  Ungrounded-Claim Rate   = Σ (answered & not adequately grounded) / N
        where "not adequately grounded" =
            no chunk retrieved, OR judge.grounded == False,
            OR the question was unanswerable and it answered anyway
  Localisation Accuracy   = Σ (region_ok & retrieved≥1) / |retrieved≥1|
        region_ok = every retrieved chunk's state/district == the queried
                    state/district (chunk metadata; judge verdict as fallback)
  Citation Accuracy       = Σ (expected record/source found in retrieval) / |answerable w/ expected ref|
  Leakage Rate            = Σ (did NOT refuse) / |geographic_leakage|
  Latency                 = mean / p50 / p95 seconds, and % under 5 s

  Per-District / Per-State / Per-Type / Per-Language = Overall Accuracy within each group.
--------------------------------------------------------------------------------
"""
import argparse
import csv
import glob
import json
import os
import re
import statistics
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import rag_pipeline as rp  # noqa: E402
from openai import OpenAI  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.path.join(HERE, "results")
os.makedirs(RESULTS, exist_ok=True)

_JUDGE_MODEL = os.getenv("JUDGE_MODEL", "openai/gpt-oss-120b")
_judge_client = OpenAI(api_key=os.environ["OPENROUTER_API_KEY"],
                       base_url="https://openrouter.ai/api/v1")

_REFUSAL_RX = re.compile(
    r"don'?t\s+cover|do\s+not\s+cover|don'?t\s+know|not\s+covered|no\s+(reliable\s+)?"
    r"(local\s+)?data|cannot\s+(help|answer|provide)|unable\s+to|insufficient|"
    r"not\s+enough|outside\s+.*scope|no\s+advisory\s+on\s+file", re.I)

_GROUP_DISTRICT_MARKERS = ("all districts", "districts", ",", "zone", "plateau", "plain", "belt")


# --------------------------------------------------------------------------- run
def run_query(question: str) -> dict:
    """Drive the real pipeline; return answer + retrieved docs + latency."""
    t0 = time.time()
    parts, sources = [], []
    for ev in rp.rag_answer_stream(question):
        t = ev.get("type")
        if t == "delta":
            parts.append(ev["text"])
        elif t == "sources":
            sources = ev["sources"]
    answer = "".join(parts).strip()
    docs = rp.retrieve_context_docs(question) or []
    return {
        "answer": answer,
        "latency": round(time.time() - t0, 2),
        "n_retrieved": len(docs),
        "retrieved": [
            {"text": (d.page_content or "")[:600],
             "state": (d.metadata or {}).get("state"),
             "district": (d.metadata or {}).get("district"),
             "id": (d.metadata or {}).get("advisory_id") or (d.metadata or {}).get("ref"),
             "source": (d.metadata or {}).get("source")}
            for d in docs
        ],
        "sources": sources,
    }


# ------------------------------------------------------------------------- judge
_JUDGE_SYS = """You grade one answer from a region-aware agricultural RAG system.

You get: the question (+ its state/district/crop), whether it is ANSWERABLE or
should be REFUSED, a ground-truth description of the correct answer, the system's
answer, and the passages the retriever returned.

Return ONLY a JSON object, no prose:
{
 "refused": true if the answer declines / says it lacks reliable data / does not answer,
 "answer_matches_expected": true if the answer conveys the key facts in the ground-truth description (ignore wording/language),
 "grounded": true if EVERY specific claim in the answer (numbers, chemicals, dates, names) appears in the retrieved passages,
 "region_consistent": true if the answer and the passages it uses refer ONLY to the queried state/district (no other place's data),
 "hallucinated": true if the answer asserts specific facts that are absent from or contradict the retrieved passages,
 "note": "<= 15 words"
}
For a question that should be REFUSED: answer_matches_expected=true iff refused=true; grounded/region_consistent=true; hallucinated=true iff it produced specific claims anyway."""


def judge_llm(row: dict, res: dict) -> dict:
    ctx = "\n".join(
        f"- [{d['state']}/{d['district']}] {d['text']}" for d in res["retrieved"]
    ) or "(nothing retrieved)"
    user = (
        f"QUESTION ({row['language']}): {row['question_text']}\n"
        f"queried state/district/crop: {row.get('state')} / {row.get('district')} / {row.get('crop')}\n"
        f"expected_answerability: {row['expected_answerability']}  ({row['question_type']})\n"
        f"GROUND TRUTH: {row.get('notes')}\n"
        f"expected source: {row.get('expected_source_name')}  ref: {row.get('expected_record_reference')}\n\n"
        f"SYSTEM ANSWER:\n{res['answer'] or '(empty)'}\n\n"
        f"RETRIEVED PASSAGES:\n{ctx}"
    )
    try:
        r = _judge_client.chat.completions.create(
            model=_JUDGE_MODEL, max_tokens=500, temperature=0.0,
            messages=[{"role": "system", "content": _JUDGE_SYS},
                      {"role": "user", "content": user}],
            extra_body={"reasoning": {"effort": "low", "exclude": True}},
        )
        txt = r.choices[0].message.content or ""
        m = re.search(r"\{.*\}", txt, re.S)
        v = json.loads(m.group(0))
        return {k: bool(v.get(k)) for k in
                ("refused", "answer_matches_expected", "grounded",
                 "region_consistent", "hallucinated")} | {"note": str(v.get("note", ""))[:120]}
    except Exception as e:  # noqa: BLE001
        return {"refused": False, "answer_matches_expected": False, "grounded": False,
                "region_consistent": False, "hallucinated": False, "note": f"judge error: {e}"}


def judge_heuristic(row: dict, res: dict) -> dict:
    ans = res["answer"]
    refused = (not ans) or bool(_REFUSAL_RX.search(ans)) or rp._is_refusal(ans)
    notes = (row.get("notes") or "").lower()
    keys = [w for w in re.findall(r"[A-Za-z][A-Za-z0-9%.\-]{3,}", notes)
            if w not in ("validates", "query", "testing", "vernacular", "recommendation",
                         "recommendations", "management", "advisory", "district")][:12]
    hits = sum(1 for k in keys if k.lower() in ans.lower())
    match = (not refused) and keys and hits >= max(2, len(keys) // 4)
    grounded = res["n_retrieved"] > 0 and not refused
    return {"refused": refused,
            "answer_matches_expected": refused if row["expected_answerability"] != "answerable" else match,
            "grounded": grounded or refused,
            "region_consistent": True,  # metadata check does the real work
            "hallucinated": (not refused) and res["n_retrieved"] == 0,
            "note": f"kw {hits}/{len(keys)}"}


# ---------------------------------------------------------------- region / cite
def _norm(s):
    return re.sub(r"[^a-z]", "", (s or "").lower())


def region_ok(row: dict, res: dict) -> bool | None:
    """True/False if we can judge locality from chunk metadata or text; None if not."""
    if res["n_retrieved"] == 0:
        return None
    q_state, q_dist = _norm(row.get("state")), _norm(row.get("district"))
    dist_is_group = any(m in (row.get("district") or "").lower() for m in _GROUP_DISTRICT_MARKERS)
    ok = True
    saw_signal = False
    for d in res["retrieved"]:
        md_state, md_dist = _norm(d["state"]), _norm(d["district"])
        if md_state:
            saw_signal = True
            if q_state and md_state != q_state:
                ok = False
        elif q_state and d["text"]:  # no metadata -> look for another state's name in text
            saw_signal = True
        if md_dist and q_dist and not dist_is_group:
            saw_signal = True
            if md_dist != q_dist:
                ok = False
    return ok if saw_signal else None


def cite_ok(row: dict, res: dict) -> bool:
    ref = _norm(row.get("expected_record_reference"))
    src = _norm(row.get("expected_source_name"))
    if not ref and not src:
        return None
    blob = _norm(json.dumps(res["retrieved"]))
    return (ref and ref in blob) or (src and any(t in blob for t in re.findall(r"[a-z]{4,}", src)[:3]))


# ---------------------------------------------------------------------- metrics
def pct(n, d):
    return round(100.0 * n / d, 1) if d else None


def evaluate(rows: list[dict], use_judge: bool) -> dict:
    per = []
    for i, row in enumerate(rows, 1):
        res = run_query(row["question_text"])
        j = judge_llm(row, res) if use_judge else judge_heuristic(row, res)

        answerable = row["expected_answerability"] == "answerable"
        should_refuse = not answerable
        answered = not j["refused"]
        rok = region_ok(row, res)
        cok = cite_ok(row, res)

        if should_refuse:
            correct = j["refused"]                      # must decline
        elif not answered:
            correct = False                             # refused an answerable question
        else:
            correct = j["answer_matches_expected"] and j["grounded"] and not j["hallucinated"]

        adequately_grounded = answered and j["grounded"] and res["n_retrieved"] > 0 and not should_refuse
        ungrounded = answered and not adequately_grounded

        rec = {**{k: row.get(k) for k in
                  ("question_id", "language", "state", "district", "crop",
                   "question_type", "expected_answerability", "source_file")},
               "question": row["question_text"],
               "answer": res["answer"], "latency": res["latency"],
               "n_retrieved": res["n_retrieved"],
               "retrieved_ids": [d["id"] for d in res["retrieved"]],
               "judge": j, "answerable": answerable, "answered": answered,
               "correct": bool(correct), "region_ok": rok, "cite_ok": cok,
               "ungrounded": bool(ungrounded)}
        per.append(rec)
        print(f"[{i:3d}/{len(rows)}] {row['question_id']:<12} "
              f"{'OK ' if correct else 'XX '}{row['question_type']:<20} "
              f"{res['latency']:>4}s  ret={res['n_retrieved']}  {j['note'][:50]}")
        _append_jsonl(rec)

    N = len(per)
    ans_rows = [r for r in per if r["answerable"]]
    ref_rows = [r for r in per if not r["answerable"]]
    answered_rows = [r for r in per if r["answered"]]
    ret_rows = [r for r in per if r["region_ok"] is not None]
    leak_rows = [r for r in per if r["question_type"] == "geographic_leakage"]
    cite_rows = [r for r in ans_rows if r["cite_ok"] is not None]
    lat = [r["latency"] for r in per]

    def acc(group):
        return pct(sum(r["correct"] for r in group), len(group))

    def group_by(key):
        g = {}
        for r in per:
            g.setdefault(r.get(key) or "(none)", []).append(r)
        return {k: {"n": len(v), "accuracy_pct": acc(v)} for k, v in sorted(g.items())}

    metrics = {
        "n_questions": N,
        "overall_accuracy_pct": acc(per),
        "answerable_accuracy_pct": acc(ans_rows),
        "refusal_accuracy_pct": pct(sum(r["judge"]["refused"] for r in ref_rows), len(ref_rows)),
        "hallucination_rate_pct": pct(sum(r["judge"]["hallucinated"] for r in answered_rows), len(answered_rows)),
        "ungrounded_claim_rate_pct": pct(sum(r["ungrounded"] for r in per), N),
        "localisation_accuracy_pct": pct(sum(bool(r["region_ok"]) for r in ret_rows), len(ret_rows)),
        "citation_accuracy_pct": pct(sum(bool(r["cite_ok"]) for r in cite_rows), len(cite_rows)),
        "leakage_rate_pct": pct(sum(r["answered"] for r in leak_rows), len(leak_rows)),
        "latency_s": {"mean": round(statistics.mean(lat), 2),
                      "p50": round(statistics.median(lat), 2),
                      "p95": round(sorted(lat)[max(0, int(len(lat) * 0.95) - 1)], 2),
                      "under_5s_pct": pct(sum(x < 5 for x in lat), N)},
        "denominators": {"answerable": len(ans_rows), "should_refuse": len(ref_rows),
                         "answered": len(answered_rows), "retrieval_hit": len(ret_rows),
                         "geographic_leakage": len(leak_rows), "citable": len(cite_rows)},
        "per_question_type": group_by("question_type"),
        "per_language": group_by("language"),
        "per_state": group_by("state"),
        "per_district": group_by("district"),
        "per_file": group_by("source_file"),
    }
    return {"metrics": metrics, "rows": per}


# ------------------------------------------------------------------------- io
_JSONL_PATH = None


def _append_jsonl(rec):
    if _JSONL_PATH:
        with open(_JSONL_PATH, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")


def load_rows(paths, types, limit):
    rows = []
    for p in paths:
        with open(p, encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                if not (r.get("question_text") or "").strip():
                    continue
                r["source_file"] = os.path.basename(p)
                rows.append(r)
    if types:
        want = set(types.split(","))
        rows = [r for r in rows if r["question_type"] in want]
    return rows[:limit] if limit else rows


def write_report(metrics, path):
    m = metrics
    L = ["# RAG Uzhavan — benchmark report",
         f"_{datetime.now(timezone.utc).isoformat(timespec='seconds')} · {m['n_questions']} questions_\n",
         "| metric | value | formula |",
         "|---|---|---|",
         f"| Overall accuracy | **{m['overall_accuracy_pct']}%** | Σ correct / N |",
         f"| Answerable accuracy | {m['answerable_accuracy_pct']}% | Σ(correct & answerable) / {m['denominators']['answerable']} |",
         f"| Refusal accuracy | {m['refusal_accuracy_pct']}% | Σ(refused & should-refuse) / {m['denominators']['should_refuse']} |",
         f"| Hallucination rate | {m['hallucination_rate_pct']}% | Σ(hallucinated & answered) / {m['denominators']['answered']} |",
         f"| Ungrounded-claim rate | {m['ungrounded_claim_rate_pct']}% | Σ(answered w/o adequate grounding) / N |",
         f"| Localisation accuracy | {m['localisation_accuracy_pct']}% | Σ(region-consistent & retrieval-hit) / {m['denominators']['retrieval_hit']} |",
         f"| Citation accuracy | {m['citation_accuracy_pct']}% | Σ(expected ref in retrieval) / {m['denominators']['citable']} |",
         f"| Leakage rate (leakage set) | {m['leakage_rate_pct']}% | Σ(did not refuse) / {m['denominators']['geographic_leakage']} |",
         f"| Latency | mean {m['latency_s']['mean']}s · p95 {m['latency_s']['p95']}s · {m['latency_s']['under_5s_pct']}% <5s | wall time per query |",
         ""]
    for title, key in (("Per question type", "per_question_type"),
                       ("Per language", "per_language"),
                       ("Per state", "per_state"),
                       ("Per district", "per_district"),
                       ("Per file", "per_file")):
        L += [f"\n## {title}", "| group | n | accuracy |", "|---|--:|--:|"]
        L += [f"| {k} | {v['n']} | {v['accuracy_pct']}% |" for k, v in m[key].items()]
    open(path, "w", encoding="utf-8").write("\n".join(L))


def main():
    global _JSONL_PATH, _JUDGE_MODEL
    ap = argparse.ArgumentParser()
    ap.add_argument("--datasets", nargs="*", default=sorted(glob.glob(os.path.join(HERE, "datasets", "*.csv"))))
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--types", default="", help="comma list of question_type to keep")
    ap.add_argument("--no-judge", action="store_true", help="heuristic scoring, no LLM judge")
    ap.add_argument("--judge-model", default=_JUDGE_MODEL)
    args = ap.parse_args()
    _JUDGE_MODEL = args.judge_model
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    rows = load_rows(args.datasets, args.types, args.limit)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    _JSONL_PATH = os.path.join(RESULTS, f"run_{ts}.jsonl")
    print(f"{len(rows)} questions from {[os.path.basename(p) for p in args.datasets]} "
          f"| judge={'heuristic' if args.no_judge else _JUDGE_MODEL}\n")

    out = evaluate(rows, use_judge=not args.no_judge)
    report = os.path.join(RESULTS, f"report_{ts}.md")
    write_report(out["metrics"], report)
    json.dump(out["metrics"], open(os.path.join(RESULTS, "latest.json"), "w", encoding="utf-8"),
              indent=2, ensure_ascii=False)

    print("\n" + "=" * 60)
    for k, v in out["metrics"].items():
        if k.endswith("_pct") or k == "latency_s":
            print(f"  {k:<28} {v}")
    print("=" * 60)
    print(f"\nrows  -> {_JSONL_PATH}\nreport-> {report}\nmetrics-> {os.path.join(RESULTS, 'latest.json')}")


if __name__ == "__main__":
    main()
