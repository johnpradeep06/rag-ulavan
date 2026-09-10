# Benchmark metrics & formulas

`python eval/run_benchmark.py` runs every question in `eval/datasets/*.csv`
through the live RAG pipeline, has an LLM judge grade each answer, and reports
the metrics below. Raw per-question rows land in `eval/results/run_<ts>.jsonl`.

## Question classes

| `expected_answerability` in the CSV | what the system SHOULD do |
|---|---|
| `answerable` | return a **correct, grounded, region-scoped** answer |
| `unanswerable` | **refuse** — "no reliable local data" |
| `geographic_leakage` (answerability = unanswerable) | **refuse** — must not serve another district's record |

## Per-question judge flags (LLM judge, temperature 0)

- `refused` — the answer declines / says it lacks reliable data
- `answer_matches_expected` — conveys the key facts in the CSV `notes` (language-agnostic)
- `grounded` — every specific claim (numbers, chemicals, dates, names) appears in the retrieved passages
- `region_consistent` — answer + passages used refer only to the queried state/district
- `hallucinated` — asserts specific facts absent from or contradicting the passages

`region_ok` is computed separately from **chunk metadata** (`state`/`district`),
using the judge flag only as a fallback when chunks carry no region metadata.

## Correctness

```
correct(row) =
    should_refuse:      refused
    answerable, refused: False
    answerable, answered: answer_matches_expected AND grounded AND NOT hallucinated
```

## Aggregate metrics  (N = total questions)

| Metric | Formula |
|---|---|
| **Overall accuracy** | Σ correct / N |
| **Answerable accuracy** | Σ (correct ∧ answerable) / \|answerable\| |
| **Refusal accuracy** | Σ (refused ∧ should_refuse) / \|should_refuse\| |
| **Hallucination rate** | Σ (hallucinated ∧ answered) / \|answered\| |
| **Ungrounded-claim rate** | Σ (answered ∧ ¬adequately_grounded) / N |
| **Localisation accuracy** | Σ (region_ok ∧ retrieval_hit) / \|retrieval_hit\| |
| **Citation accuracy** | Σ (expected record/source found in retrieval) / \|answerable with an expected ref\| |
| **Leakage rate** | Σ (did NOT refuse) / \|geographic_leakage\| |
| **Latency** | mean / p50 / p95 wall-seconds per query; % under 5 s |

`adequately_grounded = answered ∧ grounded ∧ (chunks retrieved > 0) ∧ ¬should_refuse`.
So **ungrounded** = answered with no retrieval, or with unsupported claims, or
answered a question that should have been refused.

`retrieval_hit` = the query returned ≥1 chunk **and** we could judge its region
(from metadata or text). Queries with no retrieval are excluded from the
localisation denominator (they can't leak) but count against accuracy.

## Breakdowns

`per_question_type`, `per_language`, `per_state`, `per_district`, `per_file` —
each is Overall accuracy restricted to that group, with the group's n.
`per_district` is the PS-4 "Per-District Accuracy".
