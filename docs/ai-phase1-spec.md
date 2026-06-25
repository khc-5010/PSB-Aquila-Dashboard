# Phase 1 — Whole-app analyst: ripple analysis + implementation spec

**Status:** Executed in this PR (bundled with the roadmap).
**Goal:** make the assistant aware of the **live Pipeline (opportunities)** and **state research reports**, and reachable **globally** from the header — not just from a prospect. Strictly read-only (L0).

---

## 1. Regression / ripple analysis

### 1.1 Architecture decision: augment in place, defer the gateway extraction
The roadmap's Phase 1 proposed extracting the assistant into a new `api/assistant.js`. Grounded in the code, that is **higher risk for zero user value right now**:

- **Local dependency** — `assistantSearchProspects` calls `buildCategoryCondition()` (`api/prospects.js:963`), which depends on the SYNC-tracked `CATEGORY_PARENT_RULES`. Extraction would have to carry/duplicate that logic.
- **Breaking contract** — the frontend calls `/api/prospects?action=assistant` (`AssistantModal.jsx:71`). Extraction changes the URL.
- **Untestable move** — ~400 lines of the tool-loop would move; the live LLM round-trip **cannot be exercised from the build sandbox** (egress to `api.together.xyz` is blocked), so a verbatim move can't be live-verified here.
- **No user value** — it's pure plumbing.

**Decision:** keep the assistant in `api/prospects.js` and add Phase 1 capability **additively**. Function count stays **10/12**. The gateway extraction is deferred to a dedicated, isolated PR to be done when (a) a second AI surface needs the shared file and (b) the live model is testable.

### 1.2 Blast radius of the chosen approach (all additive)
| Area | Change | Regression risk |
|------|--------|-----------------|
| `api/prospects.js` | + 3 SELECT-only executors, + 3 tool defs, + 3 dispatcher cases | **none to existing tools** — additive; existing 5 untouched |
| `ASSISTANT_SYSTEM` | revise the scope paragraph (was "no pipeline access" from #141 → now reads prospects **and** pipeline **and** state reports) | low — improves model behavior; the #141 wording is intentionally superseded |
| `AssistantModal.jsx` | optional `prospect` (global mode): variant title/subtitle/placeholder/suggestions + 3 new TOOL_LABELS/TOOL_TIPS | low — already null-`prospect`-safe; ProspectDetail path unchanged when `prospect` is passed |
| `Header.jsx` | + "Ask AI" button + `showAssistant` state + bottom render (no `prospect` → global) | low — mirrors existing Bell/Admin modal pattern; no `App.jsx` change |
| endpoint URL | **unchanged** (`/api/prospects?action=assistant`) | **none** — no contract break |

### 1.3 What the new tools read (zero writes — L0 preserved)
- `search_pipeline` → `opportunities` (+ `source_prospect_name` join, `last_activity_at` subquery), optional filters (free-text company, `stage`, `owner`, `outcome`, `lead_type`), capped 50.
- `get_opportunity` → one `opportunities` row by `opportunity_id` (or `id`) + last ~10 `activities` rows (token-bounded).
- `get_state_report` → current `state_research_reports` row for a 2-letter state, `content` capped ~8000 chars.

All mirror existing read paths; all `SELECT`-only; same token-bounding discipline as the shipped tools.

### 1.4 Scope-distinction guardrail
#141 made the assistant say "I have no pipeline access." Phase 1 **deliberately reverses** that. The system prompt is updated to: read both, and **distinguish "prospects" (companies being qualified) from "opportunities / the live Pipeline" (active deals with stages/owners)** so it never conflates them. CLAUDE.md updated to match.

---

## 2. Implementation (this PR)

**Backend — `api/prospects.js`:**
1. `assistantSearchPipeline(sql, input)`, `assistantGetOpportunity(sql, input)`, `assistantGetStateReport(sql, input)` (module-scope, SELECT-only).
2. Three entries appended to `ASSISTANT_TOOLS` (`search_pipeline`, `get_opportunity`, `get_state_report`).
3. Three `case` arms added to `runAssistantTool`.
4. `ASSISTANT_SYSTEM` scope paragraph revised (prospects + pipeline + state reports; keep them distinct).

**Frontend:**
5. `AssistantModal.jsx` — optional `prospect`; global-mode copy + suggestions; `TOOL_LABELS`/`TOOL_TIPS` for the 3 new tools.
6. `Header.jsx` — `Sparkles` "Ask AI" button (right cluster) + `showAssistant` state + bottom-rendered `<AssistantModal />` (global).

**Docs:** this spec; roadmap Phase 1 / §3.1 updated (extraction deferred); CLAUDE.md assistant section (new tools, expanded scope, global entry).

---

## 3. Verification

- `node --check api/prospects.js` + `npm run build` — must pass.
- **Live-DB smoke test** of the 3 new executors' SQL (opportunities, activities, state_research_reports) against `DATABASE_URL` — confirms columns/joins resolve on real data.
- **Cannot** verify from sandbox: the live LLM tool round-trip (Together egress blocked). Mitigation: new tools follow the proven pattern, SQL is smoke-tested, and changes are additive. Final check is Kyle on the PR preview: global Ask AI → "What's in the pipeline and what's stalled?" should call `search_pipeline`/`get_opportunity`; a prospect-scoped question still works as before.

## 4. Rollback
Fully additive — revert the commit. No schema changes, no data writes, no endpoint/URL change, no migration.
