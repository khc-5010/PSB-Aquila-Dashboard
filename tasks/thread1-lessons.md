# Thread 1 Lessons (Phase 1 → Phase 3, 2026-05-28/29)

Patterns and pitfalls captured while building the typed parent/FKA model.

## SQL / Postgres

### NULL semantics in derived booleans break CTE filters silently
The first dryrun returned 59 candidates with **zero** `absorbed_into`. Root cause: in
`classified_2`, the expression `(pe_hit = 'pattern' OR (pe_hit = 'ending' AND ...))`
evaluates to **NULL** (not FALSE) when `pe_hit IS NULL`. Then
`WHERE NOT added_to_a` becomes `WHERE NOT NULL` → also NULL → row filtered out.
Fix: wrap the boolean expression in `COALESCE(..., FALSE)` so it normalizes.
**Lesson:** any time a CTE column is a boolean derived from possibly-null inputs and
later used in a WHERE clause, COALESCE it. Don't trust that `NOT NULL` will "do the
right thing" — Postgres treats NULL as not-satisfied in WHERE.

### Neon serverless handles TEXT[] parameters transparently
Passing a JS array to a TEXT[] column via the tagged-template `sql\`UPDATE … SET
former_names = ${arr}\`` works without explicit casting. The apply endpoint round-trip
(POST → UPDATE → SELECT) returned proper Postgres arrays rendered as JSON arrays.
The dynamic-`sql.query(queryText, values)` path also handled arrays correctly.
**Lesson:** trust the driver for arrays; no `::text[]` cast needed in this pattern.

### One JSON cell per round-trip beats many separate result sets
The diagnostic established the pattern, Thread 1 doubled down. Neon's SQL Editor shows
one result set per run, and large multi-statement blocks are awkward. Use
`json_build_object` + `json_agg` to bundle everything into a single result cell.
A 153-row, ~80 KB JSON cell is one copy-paste — way better UX than 20 separate runs.

## Vercel / container network policy

### Cloud container egress is allowlist-based
This Claude Code container can `git push` to GitHub but cannot `curl` arbitrary Vercel
preview domains — returns `Host not in allowlist`. **Lesson:** for any "fire a POST at
a deployed endpoint" workflow, plan for browser-side execution. The static-HTML-page-
in-`public/` pattern (one-click button, embedded payload, same-origin fetch) is the
clean workaround. Browser console fetch from the preview URL works too — same-origin
to the API.

## Schema migration phasing

### Additive Phase 1 lets data flow before reads change
Adding `parent_relationship_kind`, `financial_sponsor`, `former_names` as nullable
columns and updating PATCH `allowedFields` + import UPSERT/INSERT first — without
touching the UI — let the apply happen safely. Phase 3 (read-path) consumed the
already-written data. **Lesson:** when introducing a new column that the UI doesn't
yet know about, write paths first → data migrates → read paths follow. The hard
checkpoint between data-write and UI-read prevents inconsistency windows.

### "Snapshot before write" pattern
Before the apply POST, we captured all 153 rows' pre-state into
`docs/diagnostics/parent-type-pre-apply-snapshot.json` via a SELECT. The snapshot
gives a deterministic rollback reference: for any row, the pre-write values of every
field the apply touches are recorded with a timestamp. Trivial to convert into rollback
UPDATEs if needed. **Lesson:** for any non-trivial bulk write, capture the pre-state
in a file on the same branch. Cost is one SELECT + one commit; the safety net is
large.

## Heuristic design

### Bias toward false negatives over false positives
The dryrun heuristic flagged only multi-signal candidates as "high" confidence (e.g.,
PE pattern in parent name AND ownership_type='PE'). Single-signal hits got "medium".
Patterns prone to noise (`Group`, `Holdings` as bare suffixes) were explicitly
excluded. Result: the 153 candidates were all real (no spurious false positives in
the high-confidence band), and the medium band gave Brett a digestible review surface.
**Lesson:** when generating candidates for human review, the cost of a false negative
(missed candidate) is lower than the cost of a false positive (wasted review attention
and risk of bad write).

### Orthogonal dimensions over alternative classifications
The original Option A spec implicitly treated subsidiary / absorbed / PE-sponsored as
**alternative** classifications. The candidate review surfaced ~27 rows where a row
was *both* PE-owned *and* an absorbed brand (SyBridge = Crestview-sponsored + absorbed
X-Cell). Treating these as alternatives loses information. **Lesson:** when a
classification system is showing strain at the boundaries, check whether the dimensions
are actually orthogonal. Adding a new combined category (`financial_sponsor + absorbed_into`)
turned out cleaner than forcing rows into one of the existing buckets.

## Apply endpoint pattern

### Dynamic UPDATE via `sql.query(text, values)` for flexible per-row writes
The apply endpoint accepts an array of `{id, suggested}` and builds an UPDATE per row
where the SET clauses come from whatever fields are in `suggested`. This means each
row can write a different subset of columns (some rows clear `also_known_as`, others
don't; some set `financial_sponsor`, others set `parent_relationship_kind`). The
existing PATCH handler in `api/prospects.js` uses the same pattern (`sql.query` +
dynamic SET clauses) so this fits the codebase convention.
**Lesson:** when a single endpoint needs to apply heterogeneous writes, the dynamic
SET pattern via `sql.query(text, values)` is the right tool. Stick with neon's
tagged-template syntax for fixed-shape queries; switch to `sql.query` when the
columns to write are computed at request time.

## Ontology / graph

### Intentional inconsistency between UI grouping and ontology fallback
The locked Phase 3 rule restricts UI grouping to rows where
`parent_relationship_kind IN ('subsidiary','absorbed_into')`. But the ontology rebuild
*still* emits `subsidiary_of` for rows with `parent_company` set but `kind=NULL`
(unclassified, legacy fallback). Why the asymmetry? UI grouping is a strict
data-presentation rule; the ontology is a data warehouse. Losing graph edges for
unclassified rows would impoverish the Knowledge Graph and prevent users from
exploring those relationships at all. Keeping them as fallback edges preserves the
data; when manual classification fills in `kind`, the rebuild upgrades the edge to
the correct typed vocabulary.
**Lesson:** UI views and graph views can have different strictness rules. The graph
should preserve data the UI chooses to hide; the UI can be strict without sacrificing
the underlying knowledge.

## Documentation discipline

### Implementation-notes.html as a running log
Maintained continuously through the build — design decisions, deviations, tradeoffs,
open questions resolved at checkpoint, Thread 4 follow-ups. This was useful during
the build (forced articulating tradeoffs in writing) and is now the artifact a future
session would read to understand "why does the codebase look this way." **Lesson:**
the implementation notes file is more valuable as a running log than as a final
write-up — keep editing it as the work proceeds.
