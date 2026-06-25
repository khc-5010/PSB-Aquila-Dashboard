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
- [ ] **COMBINED CHECKPOINT (Kyle, on preview — test everything at once):** open a prospect → "Ask AI" → run the three questions; confirm grounded answers + sensible `toolsUsed`. Egress block only affects this sandbox; the deployed function reaches Together fine. If DeepSeek-V3 tool-calling is unreliable, swap `ASSISTANT_MODEL` to `meta-llama/Llama-3.3-70B-Instruct-Turbo` (one-line change).

## Notes / gotchas (from recon)
- Auth already enforced at `api/prospects.js:861-864` for every non-digest action → no extra auth code.
- List arm uses `sql.query(text, params)` with `$N` placeholders for dynamic WHERE; tagged-template for fixed shape.
- `ontology-neighborhood` takes an entity_id (not prospect_id) → NOT wired as a tool; use `ontology-similar`.
- `add-activity` auto-overwrites `suggested_next_step` — irrelevant here (no writes in Phase 1).
- Provider is Together.ai (OpenAI-compatible chat completions), model DeepSeek-V3, env `TOGETHER_AI_API`. Plumbing: system = first message, tools = `{type:'function',...}`, tool calls on `choices[0].message.tool_calls`, results = `{role:'tool',...}`. The five SQL executors are unchanged (provider-agnostic).
- `TOGETHER_AI_API` not in this build env (live loop runs on the preview only); DATABASE_URL set (smoke-tested the SELECTs).
