# AI Integration Roadmap — PSB-Aquila Dashboard

**Status:** Proposed (working spec — phases are independently shippable, each its own PR)
**Owner:** Kyle · **Last updated:** 2026-06-25
**Prereq shipped:** Phase 0 — the read-only reasoning assistant (PRs #136–#141)

---

## Purpose & philosophy

The dashboard exists to **reduce dropped balls** and move companies from *prospect → pipeline → revenue* across a 179-company database that four people manage. AI's job here is **leverage**: triage, synthesis, and drafting that amplify the team's judgment — especially Brett's domain expertise — not replace it.

Three rules govern everything below:

1. **Maximum value, zero gimmick.** Every capability must save real time or surface a real decision. No chatbot personality, no "summarize this for fun," no AI-generated data without provenance.
2. **Augment, don't automate-away judgment.** The team decides; AI does the legwork and proposes.
3. **Earn trust incrementally.** We climb a deliberate ladder from read-only insight → drafting → human-approved writes. We do not skip rungs.

---

## 0. Where we are today (shipped foundation)

The read-only assistant (`POST /api/prospects?action=assistant`) is live and working:

- **Runtime:** a server-side tool-use loop against Together.ai (OpenAI-compatible), model `meta-llama/Llama-3.3-70B-Instruct-Turbo`, plain `fetch`, `requireAuth`-gated, all work awaited before response.
- **Five SELECT-only tools** mirroring existing endpoints: `search_prospects`, `get_prospect`, `find_similar_prospects`, `query_ontology`, `get_research_brief`. Zero writes anywhere in the path.
- **UI:** an "Ask AI" panel in `ProspectDetail`; grounded answers with plain-English "Based on:" source tags; prospect-scoped.

**What this proves (the reusable kit):** the tool-loop pattern, grounded/cited answers, transparency tags, the `prospect_id` param convention, and the model/provider plumbing all work. Everything below reuses this kit rather than inventing new patterns.

**What it can't do yet:** see the live Pipeline (opportunities), draft anything, act, run proactively, or be reached from anywhere but a prospect.

---

## 1. Principles & guardrails (the non-gimmick backbone)

| Principle | What it means in practice |
|-----------|---------------------------|
| **Grounded & cited** | Every factual claim ties to a tool result. Missing data is stated plainly, never invented. Drafts cite the specific hooks/fields they used. |
| **Read-only by default** | New capability starts read-only. Writes are added only behind the trust-ladder (§2), always human-in-the-loop. |
| **Reversible & audited** | Every AI-originated write goes through an existing logged path (`prospect_activity_log`, `stage_transitions`) and is attributed (`"AI-assisted · approved by {user}"`). Nothing happens that can't be seen and undone. |
| **One proven pattern** | Reuse the tool-loop + plain `fetch` + `requireAuth` + token-bounding. No new frameworks, no SDKs. |
| **Function-count & cost discipline** | Vercel Hobby caps at 12 functions (currently 10). Consolidate AI into one gateway, not scattered files. Llama-3.3-70B Turbo is cheap; keep turn caps and token bounds. |
| **Provenance on data** | AI may *propose* field values, never silently write them. Proposed values carry a source + confidence and require human approval (same bar as the FDA-confirm flow). |

### Non-goals (explicit anti-gimmick line — we will NOT)
- Send email or any external message autonomously. Outreach is **draft → human edits → human sends**.
- Change `priority_score`, `ai_readiness`, stage, or any record silently. AI proposes; the human commits.
- Fabricate contacts, numbers, or research. No web claim without a citation.
- Add "AI" to a surface that doesn't have a concrete job-to-be-done.
- Build a general-purpose chatbot. This is a focused analyst/co-pilot for *this* pipeline.

---

## 2. The write trust-ladder (how "agent behavior" stays safe)

| Level | Capability | Example | Approval | Status |
|-------|-----------|---------|----------|--------|
| **L0** | Read & reason | "How does this prospect compare to similar ones?" | none (read-only) | ✅ shipped |
| **L1** | Draft text | Draft a first-touch outreach email; summarize an opportunity's history | human copies/edits; no write | Phase 2 |
| **L2** | Propose-and-approve a single write | "Create this follow-up task" / "log this activity" / "advance to Channel Routing" | one-click confirm, logged & attributed | Phase 4–5 |
| **L3** | Propose a batch | "Draft follow-up tasks for all 6 stalled prospects" | bulk review + confirm | Phase 5 |
| **L4** | Autonomous write/send | — | **not in scope** | ❌ deliberately excluded |

Every L2+ action: reversible, attributed, logged, and never touches money/contracts/external sends. The human is always the actor of record.

---

## 3. Architecture foundation

### 3.1 Promote the assistant to a domain-agnostic gateway
Today the assistant is one arm inside `api/prospects.js` (already ~4,100 lines) and its tools only read prospect data. The long-term target is a dedicated **`api/assistant.js`** gateway:

- Houses the tool-loop, the system prompt, the tool **registry**, and the provider plumbing.
- Tools call into each domain's existing query logic (prospects, opportunities, ontology, state reports, tasks).
- **Function budget:** this would take us from 10 → **11 / 12**. Acceptable, but pure plumbing.

> **DEFERRED (decided during Phase 1 ripple analysis — see `ai-phase1-spec.md` §1.1).** The extraction drags along `buildCategoryCondition`/`CATEGORY_PARENT_RULES`, changes the `?action=assistant` URL contract, and means moving ~400 lines of an LLM loop that **can't be live-tested from the build sandbox** (Together egress is blocked) — all for zero user value. So Phases 1–4 **augment the assistant in place** inside `api/prospects.js` (function count stays **10/12**). The gateway extraction becomes its own isolated PR when a second AI surface needs the shared file *and* the live model is testable. Discipline rule still holds: AI capability is added as arms/tools, never a new serverless function per feature.

### 3.2 Tool registry (grows by phase)
- **Read tools (L0):** the five shipped + `get_opportunity` / `search_pipeline` (opportunities), `get_state_report`, `list_tasks`, `get_contacts`.
- **Write tools (L2+):** `create_task`, `log_activity`, `set_follow_up`, `flag_for_review`, `propose_stage_change`, `propose_field_update` — each wrapping the *existing* logged write path, each returning a "proposed action" the UI renders for confirmation rather than executing blind.

### 3.3 Entry points
- **Global "Ask AI"** in the header (available on every tab) — the whole-app analyst.
- **Contextual** launches that pre-load context: `ProspectDetail` (shipped), `OpportunityDetail` (new), Today view, Call Sheet.
- Same component family / z-stack as the shipped `AssistantModal`.

### 3.4 Model strategy
- Default: `meta-llama/Llama-3.3-70B-Instruct-Turbo` (tool-use + synthesis; **stable id** — keep the no-date-stamped-snapshot discipline that bit us with DeepSeek).
- Make the model **env-overridable** (`ASSISTANT_MODEL` fallback to the constant) so a swap never needs a code deploy.
- Drafting (Phase 2) may warrant a stronger instruct model per call; keep it a per-task constant so we can tune voice quality without touching the loop.

---

## 4. Phased roadmap

Each phase is independently shippable and PR-sized. Effort is rough: **S** ≈ ½–1 day, **M** ≈ 1–2 days, **L** ≈ 3–5 days of focused work.

### Phase 1 — Whole-app analyst *(foundation, L0)* · **M** · ✅ SHIPPED (this PR)
**Value:** one place to ask anything about the business — prospects *and* the live pipeline — instead of a prospect-only widget.
**What it does:** "Which medical molders in the Northeast haven't we contacted?" · "What's in the pipeline right now and what's stalled?" · "Who owns the C&J opportunity and what's the next step?"
**Approach (as built):** augment the assistant in place (gateway extraction deferred — §3.1 / `ai-phase1-spec.md`); add read tools for **opportunities** (`search_pipeline`, `get_opportunity`), **state reports** (`get_state_report`); revise the system prompt to read prospects *and* pipeline while keeping them distinct; add the global header "Ask AI" entry (`AssistantModal` gains a global mode). Function count stays 10/12.
**Guardrails:** still strictly read-only. Clear scoping in answers (prospects vs. live pipeline).
**Success signal:** team uses the global Ask AI for cross-domain questions; "where does X stand?" answered in one query instead of clicking through tabs.

### Phase 2 — Communication drafting *(L1 — the biggest daily win)* · **M** · ✅ SHIPPED (this PR)
**As built:** `mode:'draft'` on the `?action=assistant` arm appends `ASSISTANT_DRAFT_GUIDANCE` (outreach voice + stakeholder-routing matrix + no-fabrication/`[placeholder]` rules). "Draft" buttons in ProspectDetail (outreach) and OpportunityDetail (stakeholder note, routed by project type) open `AssistantModal` in draft mode with an auto-sent seed; per-message Copy button; copy-to-clipboard only (no send). Iterative refinement is free (it's the chat panel). Still read-only on data.
**Value:** collapses the gap between *research done* and *first contact made* — today's slowest manual step. Turns a rich brief + hooks + CWP warmth into a ready-to-edit message.
**What it does:**
- **Draft outreach** (ProspectDetail): a tailored first-touch email/LinkedIn note in the team's voice, grounded in the prospect's hooks (`buildHookLine`), research brief, certifications, RJG signal, and PSB connection notes — citing *why* each point was included. Routes by project-type context where known.
- **Draft stakeholder notification** (pipeline): routing-aware (Research Agreement → Alicyn/Jennifer, Senior Design → Dean Lewis + Aug-15 deadline, Strategic Membership → Amy Bridger) using the existing stakeholder matrix.
**Approach:** a `draft` mode on the gateway (read tools + a drafting system prompt); output rendered with copy/edit. **No sending** — copy-to-clipboard (sending via Resend-with-approval is a Phase-5 option, behind explicit confirm).
**Guardrails:** L1 — generates text only, never sends or writes. Drafts flag any field they're unsure of rather than inventing it.
**Success signal:** time from `Research Complete` → first logged outreach drops; drafts are used (lightly edited) rather than written from scratch.

### Phase 3 — Proactive triage *(L0/L1 — recurring value)* · **M** · ✅ SHIPPED (this PR, with one deferral)
**As built:** **Call Sheet "Prep"** (per-call talking points — seeded prospect-scoped assistant) and **"Brief my day"** (header button → global assistant seeded to rank today's priorities across prospects + pipeline with reasons). Both reuse the assistant; zero new endpoints; appear in the Call Sheet sub-view AND the Today view (which embeds CallSheet). The **stalled-deal scan** is answerable today via global Ask AI ("what's stalled?"). **DEFERRED — in-email digest narration:** narrating inside the `daily-digest` cron would add an LLM call per user to an unattended path under the function's ~10s budget; sequential calls risk breaking the digest, and it can't be live-tested from the sandbox. The same value is available on-demand via "Brief my day." Revisit when the cron `maxDuration` is raised (a plan/config decision) or via a parallelized, tight-timeout, fail-safe pass.

**Value:** tells the team what to do each day, in priority order, with the reasoning — instead of making them assemble it.
**What it does:**
- **AI-narrated daily digest:** the existing cron digest gains a short "Your 3 priorities today and why" synthesis (ranked by the team's logic: PE windows closing, overdue follow-ups, stalled research, hot CWP leads).
- **Call Sheet briefing:** for each ranked call, 2–3 talking points pulled from hooks/brief/signals — couch-mode-ready.
- **Stalled-deal scan:** "what's parked and why" across prospects + pipeline.
**Approach:** read tools + synthesis prompt; the digest piece runs inside the existing `daily-digest` cron path (no new function). Call Sheet briefing is an on-demand gateway call.
**Guardrails:** read-only synthesis over existing data; the digest stays opt-in per the existing preference system.
**Success signal:** digest → action rate; Call Sheet used as the morning plan.

### Phase 4 — Close the copy-paste loops *(L2 — automate the tedious)* · **M–L** · ◑ PARTIAL (4a shipped this PR; 4b deferred)
**As built (4a — server-side ontology extraction):** `GET ?action=ai-extract-ontology&id=X` reads the saved brief + existing entities (for dedup), calls Together once (9.5s abort + robust JSON parse + validation against the canonical type lists), and **returns** `{entities, relationships}` — it does **not** write. An **"Extract with AI"** button in `ImportOntologyModal` pipes the result into the existing validate → preview → **import** flow, so the human still confirms and the write goes through the unchanged, tested `import-ontology-extraction` path. The copy-paste flow (`ExtractionPromptModal`) stays as a fallback. This makes 4a effectively L1 (AI proposes; human commits via the existing write).
**Deferred (4b — AI-assisted brief→field intake):** auto-proposing edits to canonical `prospect_companies` fields is higher-stakes, needs a new field-by-field approval-diff UI, and warrants live-testable LLM verification before it touches the scored record. Its own pass.

**Value:** removes two manual external-Claude round-trips that exist today.
**What it does:**
- **Server-side Ontology Layer-2 extraction:** replace the `ExtractionPromptModal → ImportOntologyModal` copy-paste with a one-click "Extract from brief" that runs the extraction prompt server-side, validates the JSON against entity/relationship types, and imports via the *existing* `import-ontology-extraction` path. (No web search needed — extraction is from brief text.)
- **AI-assisted brief intake:** when a brief is attached, AI proposes structured field updates (signals, certs, ownership, press count, contacts) as a **diff the user approves field-by-field** — same bar as the FDA-confirm flow. Feeds the score/ontology recalc for free on approval.
**Approach:** gateway `extract` mode reusing the current extraction template + import validation; brief-intake produces `propose_field_update` actions (L2).
**Guardrails:** L2 — every proposed field change is shown with its source (the brief sentence) + confidence; nothing writes without per-field approval; never overwrites a non-null human-edited field without flagging the conflict.
**Success signal:** ontology Layer-2 coverage grows without manual copy-paste; data-audit gap counts drop.

### Phase 5 — Guarded actions *(L2/L3 — true agent behavior, carefully)* · **L**
**Value:** the assistant stops just answering and starts *doing the safe, reversible chores* — on approval.
**What it does:** from any answer, AI can propose and (on one-click confirm) execute: **create follow-up task**, **log activity**, **set follow-up date**, **flag for review**, **advance/justify a stage change** (logs `stage_transitions` with rationale), and batch versions ("draft tasks for all stalled prospects" → review list → confirm).
**Approach:** the write tools from §3.2 return *proposed actions*; the UI renders an approve/cancel card per action; confirmation calls the existing logged endpoints. Meeting-minutes integration: extract action items → propose tasks.
**Guardrails:** L2/L3 — human is always the actor of record; every write attributed + logged + reversible; no money/contract/external-send actions; standing "draft, don't do" default with explicit opt-in per action type.
**Success signal:** fewer dropped follow-ups; tasks/logs created in-flow instead of forgotten.

### Phase 6 — In-house research *(optional, dependency-gated)* · **L+**
**Value:** brings the deep-research and data-gap-filling workflows in-house instead of copy-paste to external Claude.
**Dependency & cost:** requires a **web-search tool** (e.g., Brave/Serper API) added to the registry, plus the associated API cost and rate limits — Llama itself has no browsing. This is the heaviest lift and the only phase with a new external dependency.
**Recommendation:** defer. The copy-paste research flow works and produces excellent briefs; only build this if the team finds the manual loop is the bottleneck after Phases 1–5.

---

## 5. Function-count & cost budget

| # | Function | Note |
|---|----------|------|
| 1–10 | existing (`health`, `opportunities`, `opportunities/[id]`, `activities`, `analytics`, `stage-transitions`, `key-dates`, `meeting-minutes`, `prospects`, `auth`) | unchanged |
| 11 | **`api/assistant.js`** (new gateway) | hosts ALL AI features as internal tools/modes — never one function per feature |

→ **11 / 12** after Phase 1. Headroom of 1 retained. If pressure grows, consolidate `opportunities/[id].js` into `opportunities.js` (method/param routing) or move to a paid Vercel tier.

**Cost:** Llama-3.3-70B Turbo is inexpensive per call; with 4 users, 8-turn caps, and token bounding, monthly spend is modest. Phase 6's search API is the only cost step-change. Keep the per-task model constants so we can right-size.

---

## 6. Open decisions (for the team to settle during review)

1. **How far up the trust-ladder?** Stop at L1 (drafting only), or enable L2/L5 guarded writes? (Recommendation: ship through L2 — the reversible chores are where the dropped-ball reduction lives.)
2. **Email sending:** copy-to-clipboard only (safest), or Resend-with-explicit-approval send in Phase 5? (Recommendation: clipboard first; revisit sending once drafting quality is trusted.)
3. **In-house research (Phase 6):** worth a web-search API dependency + cost, or keep the copy-paste flow? (Recommendation: defer.)
4. **Drafting model:** is Llama-3.3-70B's voice good enough for outreach, or do we want a stronger model for Phase 2 drafts? (Decide after a Phase-2 spike.)

---

## 7. Recommended sequencing

```
Phase 1  Whole-app analyst (foundation + pipeline-aware + global)   ← do first; unlocks everything
Phase 2  Communication drafting                                     ← biggest daily time-save
Phase 3  Proactive triage (AI digest + call-sheet briefing)          ← recurring, low-risk value
Phase 4  Close the copy-paste loops (ontology extract, brief intake) ← first L2 writes, contained
Phase 5  Guarded actions (tasks/logs/stage moves, batched)           ← true agent behavior
Phase 6  In-house research (web search)                              ← optional, only if needed
```

**Rationale:** Phase 1 turns the prospect widget into a real co-pilot and is the platform for all the rest. Phase 2 is the single highest day-to-day payoff (research → action). Phase 3 compounds daily with near-zero risk. Phases 4–5 introduce writes gradually, each fully reversible and audited. Phase 6 waits until there's proven demand.

Build one phase per PR, verify on preview, merge, iterate — the exact loop that got Phase 0 across the line.
