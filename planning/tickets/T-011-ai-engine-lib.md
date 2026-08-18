# T-011 — M6a-1 Deterministic AI engine lib

status: open
module: M6 AI layer
assignee: —
owns: src/lib/ai/** (engine subpackage), tests/unit/ai* (or tests/ai/)
depends-on: T-002

> Read `planning/tickets/README.md` first. Pure computation, no network,
> no endpoints — those are T-012. Zero new npm deps: implement the
> algorithms directly (they are small: MinHash 128 perms, LSH 16×8 bands,
  TF-IDF + kNN k=5, TextRank over BM25 sentence graph, template drafts).

## docs-to-read
- architecture.md §6 (all — binding), §2.10 (FTS5 helpers you build on)
- acceptance-tests.md AT-073…083 (behavioral targets)

## Deliverables

`src/lib/ai/` implementing the AIProvider interface from architecture
§6.1 as provider #0 (`id: "local"`, label "Local engine"):

- nlq: controlled-vocabulary parser → filter AST; ambiguity → clarifying
  chips; never guesses silently.
- dedup: char-trigram MinHash (128 perms, fixed seed) + LSH (16 bands × 8
  rows) over open/recent (≤90d) issues; true-Jaccard verify on bucket
  hits; stack-trace SHA-256 short-circuit; propose-only payload.
- triage: rule engine + kNN (k=5) over TF-IDF of labeled issues +
  severity lexicon; feedback rows adjust weights; suggestion-only.
- summarize: TextRank (BM25 sentence similarity graph → PageRank top-k);
  every sentence carries sourceRef; extractive-only.
- ask: FTS5 top-8 chunks → re-rank → cited extractive sentences;
  confidence = retrieval score; below threshold → "no confident match".
- draft: template engine (prd/story/spec) from structured fields; every
  entity reference validated against workspace schema.
- related: TF-IDF cosine vs FTS candidates, shared terms, age decay.
- hygiene: staleness rules → itemized digest + undo-token payload.
- meeting: date/person/task regex + cue verbs → review tray items with
  entity validation.
- cluster: agglomerative over TF-IDF of open issues; editable payloads.
- Input hardening per §6.4-5: 10k caps, NFKC, zero-width strip, timeouts.

## Acceptance
Vitest per feature with seeded fixtures (reuse scripts/seed data shapes):
MinHash/LSH recall on planted near-dupes, kNN suggestions include planted
labels, TextRank picks planted topic sentences, ask cites + sub-threshold
fallback, entity validation rejects unknown refs. All four gates green.
