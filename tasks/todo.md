# Task: Phase 1 — read-only reasoning assistant (`POST ?action=assistant`)

**Branch:** `claude/loving-allen-ubj6j4`
**Type:** Backend (Prompt 1). UI (Prompt 2) is gated behind live verification.
**Goal:** Add one `POST ?action=assistant` arm to `api/prospects.js` running an Anthropic
Messages API tool-use loop over five **read-only** tools that wrap existing endpoints.
No new files, no schema changes, no DB writes, no SDK (plain `fetch`).

## Contract (must match Prompt 2)
- `POST /api/prospects?action=assistant`, Bearer auth (file-level `requireAuth`).
- Body `{ messages:[{role,content}], prospectId|null }`.
- 200 `{ answer, toolsUsed[] }`; 400 malformed; 401 auth; 500 safe message (never leak key/stack).

## Checklist
- [x] Plan mode + grounding subagents (verbatim SELECTs, POST insertion point, auth, env)
- [x] Consult `claude-api` skill for Messages API tool-use contract (`x-api-key`, `anthropic-version`, stop_reason)
- [x] Module-scope block (constants, `ASSISTANT_SYSTEM`, `ASSISTANT_TOOLS`, 5 SELECT-only executors, dispatcher)
- [x] New `if (action === 'assistant')` arm in POST block (after `rebuild-ontology-layer1`, before final 405)
- [x] Body validation → 400; prospect-context line when `prospectId` set
- [x] Tool-use loop: fetch `/v1/messages`, MAX_TURNS=8, max_tokens=2048, token-bounded tool_results, `toolsUsed`
- [x] Zero INSERT/UPDATE/DELETE anywhere in the path; all awaited before `res.json()`
- [x] `node --check api/prospects.js` (syntax) + `npm run build` — both PASS
- [x] Read-only SQL smoke test of all 5 executors against `DATABASE_URL` — all PASS (real data, all columns resolve)
- [x] `implementation-notes.html` (design decisions / deviations / tradeoffs / open questions)
- [x] Update `CLAUDE.md` (assistant arm, `ANTHROPIC_API_KEY`, plain-`fetch` Anthropic pattern)
- [x] Commit + push to `claude/loving-allen-ubj6j4`
- [x] **Pivot:** switch LLM provider Anthropic → Together.ai (OpenAI-compatible), model `deepseek-ai/DeepSeek-V3`, env `TOGETHER_AI_API` — `node --check` PASS, commit + push
- [x] **(Kyle)** Add `TOGETHER_AI_API` to Vercel Preview (done — confirmed in dashboard)
- [x] Prompt 1 merged into `main` (PR #136).

## Prompt 2 — UI chat panel (branch `claude/assistant-ui-panel`, separate PR)
- [x] `src/components/prospects/AssistantModal.jsx` — `z-[60]` sub-modal (ExportJsonModal family); message list, textarea (Enter to send / Shift+Enter newline), suggested starters, `ReportMarkdownRenderer` answers, `toolsUsed` tags, thinking indicator, error + Retry, read-only framing.
- [x] ProspectDetail wiring — "Ask AI" button (`Sparkles`) in header cluster; `showAssistantModal` state added to `anySubModalOpen` Escape guard + deps; modal rendered alongside ExportJsonModal.
- [x] Contract verified against merged backend: sends `{ messages:[{role,content}], prospectId }` via `authFetch`; reads `{ answer, toolsUsed }` / `{ error }`. Backend reads `body.prospectId` (camelCase) — matches.
- [x] `npm run build` PASS. Update CLAUDE.md UI line.
- [x] Commit + push `claude/assistant-ui-panel`.
- [x] Prompt 2 (UI) merged into `main` (PR #137). UI confirmed good.

## Bug fix — assistant 500 "temporarily unavailable" (branch `claude/fix-assistant-model`, PR #__)
- [x] **Root cause:** `ASSISTANT_MODEL = 'deepseek-ai/DeepSeek-V3'` is a stale Together model id (Together serves DeepSeek V3 as `deepseek-ai/DeepSeek-V3-0324` now). Unknown model id → Together 4xx → `!r.ok` (`callModel`, ~3573) → `err.isLlm` → catch returns 500 "The assistant is temporarily unavailable." (Confirmed model strings via web search; couldn't reproduce live — sandbox egress still blocks `api.together.xyz` this session.)
- [x] **Fix:** switch to `meta-llama/Llama-3.3-70B-Instruct-Turbo` — current, tool-calling-capable, **stable id** (date-stamped DeepSeek ids rotate and re-break). One constant (`api/prospects.js:865`).
- [x] **Ripple/regression:** `ASSISTANT_MODEL` used only at `:3559` (model-agnostic payload). Tool schemas, the turn loop, `tool_calls`/`finish_reason` parsing, `tool_choice`, `toolsUsed` — all standard OpenAI tool-calling, identical across models → no plumbing change. No `src/` refs (UI calls the endpoint, model-blind). CLAUDE.md model line updated. `node --check` + `npm run build` PASS.
- [x] **Verified working** — assistant calls tools and answers (PR #138 merged).

## UX clarity pass (branch `claude/assistant-ux-clarity`, PR #__)
Kyle's feedback on the working assistant: (1) the `find_similar_prospects` chip with the wrench icon is jargon and *looks* clickable but isn't; (2) an answer trailed off with "I will retrieve their prospect records" and stopped.
- [x] **Tool tags → plain English, clearly non-interactive.** `AssistantModal.jsx`: `TOOL_LABELS`/`TOOL_TIPS` maps (e.g. `find_similar_prospects` → "Similar companies"), caption changed to "Based on:" with a `Search` icon (was a bare wrench), tags now muted `cursor-default` pills with hover tooltips — read as a data-source footnote, not buttons. (No onClick existed; the bordered/mono styling just implied one.)
- [x] **Self-contained answers.** System prompt (`api/prospects.js`): added a rule that the reply IS the finished answer — never end by saying it "will" look something up; call the tool now (runs automatically) or finish. Also tightened the compare instruction (find_similar → get_prospect → then write).
- [x] `node --check` + `npm run build` PASS.
- [x] Merged (PR #139). Tags clear + answers self-contained — confirmed.

## Bug fix — get_prospect "tool not functioning" (branch `claude/fix-get-prospect-param`, PR #__)
Compare question: find_similar worked but get_prospect kept "erroring" (consistent across 3 tries).
- [x] **Root cause:** tool param-name inconsistency. `find_similar_prospects` takes `prospect_id`; `get_prospect`/`get_research_brief` took `id`. The model carries `prospect_id` over → `get_prospect({prospect_id})` → executor read only `input.id` (undefined) → `NaN` → returns `{ error: 'A numeric prospect id is required.' }`, which the model relays as "tool not functioning." NOT a SQL error — verified all 6 get_prospect sub-queries run clean against the live DB for ids 1/3/6/7/10/926 (DB reachable from sandbox; Together is not). Earlier smoke test only validated replicated copies, so the shipped mismatch slipped through.
- [x] **Fix:** standardize all id-taking tools on `prospect_id` (schemas for get_prospect + get_research_brief), and read `input.prospect_id ?? input.id` in all three id-taking executors (get_prospect, get_research_brief, find_similar) — defensive against either name.
- [x] **Ripple:** search_prospects (filter params) and query_ontology (capability arrays) take no id → untouched. Loop/dispatcher pass args through unchanged. `node --check` + `npm run build` PASS. CLAUDE.md param-convention note added.
- [x] **Verified working** — compare question now pulls each company's details and gives a real grounded comparison (Kyle's screenshot).
- [x] **Terminology fix (folded into this PR per Kyle):** the question/answer said "pipeline," but the assistant only reads prospects (no `opportunities` access). Confirmed via code (5 executors read `prospect_companies`/ontology/`prospect_attachments`, never `opportunities`). De-"pipeline"d the suggested prompt, empty-state copy, and `find_similar_prospects` description; added a system-prompt rule to treat "pipeline" as the prospect list and never call results "in the pipeline." Kyle chose to keep it prospect-scoped (vs. adding a live-Pipeline tool). CLAUDE.md scope note added. `npm run build` PASS.

## AI roadmap + Phases 1–4 (branch `claude/ai-integration-roadmap`, one bundled PR)
Per Kyle: bundle the roadmap with Phase 1, then execute Phases 2–4 with the same cadence/caution. All in one branch (phases share code → separate branches would conflict), one commit per phase. **LLM behavior is preview-tested by Kyle (Together egress blocked in sandbox); everything else verified here (build, node --check, live-DB SQL smoke, adversarial subagent review).**
- [x] **Roadmap** `docs/ai-integration-roadmap.md` + **Phase 1 ripple/spec** `docs/ai-phase1-spec.md`.
- [x] **Phase 1 — whole-app analyst (L0):** `search_pipeline` / `get_opportunity` / `get_state_report` tools; system prompt reads prospects + pipeline + state reports (kept distinct); global header "Ask AI" (AssistantModal global mode). Gateway extraction DEFERRED (documented). Smoke-tested all 3 tool queries. (commit `4583221`)
- [x] **Phase 2 — drafting (L1):** `mode:'draft'` → `ASSISTANT_DRAFT_GUIDANCE`; "Draft" buttons in ProspectDetail (outreach) + OpportunityDetail (stakeholder note, routed by project type); AssistantModal auto-send seed + per-message Copy; copy-to-clipboard only (no send). (commit `2f4ae3a`)
- [x] **Phase 3 — proactive triage (L0/L1):** CallSheet "Prep" (per-call talking points) + "Brief my day" (global priorities); both inherit into Today view. In-email digest narration DEFERRED (cron ~10s budget; same value on-demand via Brief my day). (commit `3507c83`)
- [x] **Phase 4a — server-side ontology extraction (L1):** read-only `?action=ai-extract-ontology` (Together once, 9.5s abort, robust JSON parse, type-validated) → "Extract with AI" in ImportOntologyModal feeds the existing validate→preview→import (write path unchanged). 4b (AI editing canonical fields) DEFERRED. (commit `2891e8b`)
- [x] **Adversarial review** (2 parallel subagents over the full diff: backend + frontend) — **zero correctness findings to fix.** Backend confirmed scope/TDZ, `$N` param alignment (no injection), extract-arm guards + AbortController finally + no key/stack leak, `parseExtractionJson` unit-tested, no chat-path regression, function count 10. Frontend confirmed imports, auto-send hoisting + StrictMode guard, optional-prop back-compat, CallSheet fragment balance + no double-modal, no hook/crash risks. Two pre-existing non-bug notes (unused `prospectId` param in `validateImportData`, index keys on append-only list) — left as-is.
- [ ] **(Kyle) Preview-test the live LLM:** global Ask AI (pipeline Qs), Draft buttons, Brief my day / Prep, Extract with AI. Add `TOGETHER_AI_API` to Production env if promoting past Preview.

## Notes / gotchas (from recon)
- Auth already enforced at `api/prospects.js:861-864` for every non-digest action → no extra auth code.
- List arm uses `sql.query(text, params)` with `$N` placeholders for dynamic WHERE; tagged-template for fixed shape.
- `ontology-neighborhood` takes an entity_id (not prospect_id) → NOT wired as a tool; use `ontology-similar`.
- `add-activity` auto-overwrites `suggested_next_step` — irrelevant here (no writes in Phase 1).
- Provider is Together.ai (OpenAI-compatible chat completions), model `meta-llama/Llama-3.3-70B-Instruct-Turbo` (was DeepSeek-V3 — stale id, see bug-fix section), env `TOGETHER_AI_API`. Plumbing: system = first message, tools = `{type:'function',...}`, tool calls on `choices[0].message.tool_calls`, results = `{role:'tool',...}`. The five SQL executors are unchanged (provider-agnostic).
- `TOGETHER_AI_API` not in this build env (live loop runs on the preview only); DATABASE_URL set (smoke-tested the SELECTs).
