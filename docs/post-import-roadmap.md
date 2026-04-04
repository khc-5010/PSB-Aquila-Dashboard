# PSB-Aquila Dashboard — Post-Import Roadmap

**Last updated:** April 3, 2026  
**Status:** Waiting on final state imports to complete before executing  
**Author:** Kyle Campbell (Alliance Coordinator)

---

## Prerequisites

Before executing anything below, confirm:

- [ ] All remaining state imports are complete (~694+ prospects across all target states)
- [ ] Neon SQL Editor is on the production branch (not a backup branch)
- [ ] `public/prompts/state-research-template.md` is intact (full ~4,000-word prompt below the `---` separator)

---

## Phase 1: Light the Knowledge Graph

**Effort:** 5 minutes  
**Dependencies:** All state imports complete  
**CC prompt needed:** No — already built and deployed

Run the Layer 1 ontology rebuild. This reads every prospect record and generates entities + relationships from structured fields (certifications, RJG status, medical device flag, ownership type, parent company).

**Action:**
```
POST https://psb-aquila-dashboard.vercel.app/api/prospects?action=rebuild-ontology-layer1
```

**Verify:**
- `GET /api/prospects?action=ontology-stats` → should show entity and relationship counts for all entity types
- Open National Map → click any state with prospects → Ontology Summary section should show real data (certification landscape, technology signals, ownership mix)
- Click several states to spot-check that counts look reasonable

**What this produces:**
- A Company entity for every prospect, linked via `prospect_company_id`
- Certification entities parsed from `key_certifications` (comma-separated) + `holds_certification` relationships
- "RJG Cavity Pressure Monitoring" technology entity for confirmed/likely RJG users
- "Medical Devices" market vertical entity for medical manufacturers
- Ownership Structure entities + relationships
- Parent Company entities + `subsidiary_of` relationships

---

## Phase 2: Auto-Trigger Ontology on Data Changes

**Effort:** ~1 hour CC session  
**Dependencies:** Phase 1 complete (so you can verify the auto-triggers work)  
**CC prompt:** `auto-trigger-ontology-rebuild.md` (delivered)

Extracts the rebuild logic into a reusable function and auto-triggers it:
- **Full rebuild** after bulk imports
- **Per-prospect rebuild** after single company creates
- **Conditional per-prospect rebuild** after edits to ontology-relevant fields (certifications, RJG, medical, ownership, parent company, category, tooling)

Key constraint: all rebuilds are `await`ed before the API response (Vercel serverless can freeze after `res.end()`).

After this, the ontology never silently goes stale.

---

## Phase 3: Manufacturing Corridors

**Effort:** ~1 hour CC session  
**Dependencies:** None (can run anytime)  
**CC prompt:** `replace-tiers-with-corridors.md` (delivered)

Replaces the obsolete Tier 1/2/3 geography chart with industry-meaningful Manufacturing Corridors:

| Corridor | States |
|----------|--------|
| Great Lakes Auto | MI, OH, IN, IL, WI |
| Northeast Tool | PA, NY, CT, NJ, MA, NH, VT, ME, RI, DC |
| Southeast Growth | NC, GA, FL, TN, SC, VA, AL, MS, KY |
| Gulf / Resin Belt | TX, LA, OK, AR |
| Upper Midwest Medical | MN |
| West Coast | CA, OR, WA |
| Mountain / Central | Everything else |

No database changes — corridors computed from `state` column via SQL CASE. Also updates the filter dropdown and renames "Tier 1 Local" preset to "Home Turf" (Northeast Tool corridor).

---

## Phase 4: Layer 2 Ontology Extraction

**Effort:** ~2 hour CC session  
**Dependencies:** Phase 1 complete, Phase 2 recommended (so extractions auto-persist)  
**CC prompt:** `phase5-layer2-ontology-extraction.md` (delivered — named "Phase 5" in the National Map numbering)

Builds the manual-first workflow for extracting rich intelligence from research brief narrative text:

1. User opens a prospect with a saved research brief
2. Clicks "Extract Ontology" → generates a prompt pre-loaded with brief text + existing entities
3. Copies to clipboard, runs in a separate Claude session
4. Claude returns structured JSON (entities + relationships)
5. User clicks "Import Extraction" → pastes JSON → preview → confirm
6. Layer 2 data saved to ontology tables

This captures what Layer 1 can't: specific software platforms, equipment brands, quality methods, materials, supplier relationships, workforce credentials. This is where Fabexco's 4-state operations, B.F. Goodrich lineage, and CA→NV migration pattern become queryable.

**New components:** ExtractionPromptModal, ImportOntologyModal, extraction prompt template  
**New API endpoints:** `?action=ontology-existing-entities`, `?action=import-ontology-extraction`

---

## Phase 5: Ontology Density Map Metric

**Effort:** ~1 hour CC session  
**Dependencies:** Phase 1 complete (needs ontology data to visualize)  
**CC prompt:** `phase6-ontology-density-metric.md` (delivered — named "Phase 6" in the National Map numbering)

Adds "Ontology Density" as the 6th metric on the National Map. States colored by relationships-per-prospect — incentivizes running Layer 2 extractions since those drive the number up.

Also enhances the OntologySummary in StateDetailPanel with:
- Layer 1 vs Layer 2 proportion bar
- Entity type distribution mini-bars

---

## Phase 6: Database Backup

**Effort:** ~1 hour CC session  
**Dependencies:** None (increasingly urgent — 694+ prospects + ontology tables)  
**CC prompt:** Needs to be generated

Brett requested regular backups to a location "wholly owned by us." Planned approach:

- API endpoint that dumps all tables (prospect_companies, opportunities, prospect_attachments, state_research_reports, ontology tables, users/sessions) as downloadable JSON
- Admin-only UI button in the dashboard (gear icon or settings area)
- One-click download produces a timestamped JSON file
- No external backup service needed — the JSON file is the backup

This has been deferred since March 31 pending schema stabilization. With ontology tables now in place, schema is largely stable. **This should be prioritized.**

---

## Phase 7: End-to-End Smoke Test

**Effort:** ~30 min CC session  
**Dependencies:** Phases 1-5 complete  
**CC prompt:** Needs to be generated

Browser-based regression sweep across all features:
- Prospect table: sorting, filtering, presets, inline editing, CSV export
- Prospect detail: all sections, cert badges, hook line, research workflow
- National Map: all 6 metrics, state detail panel, report upload, prompt builder, ontology summary
- Pipeline: Kanban drag-and-drop, promote from prospects, no-fit off-ramp
- Auth: login, session persistence, admin panel
- Ontology: Layer 1 rebuild, Layer 2 extraction + import, auto-triggers
- Hash routing: refresh persistence, back/forward

---

## Future: Cross-State Intelligence Alerts

**Effort:** ~2-3 hour CC session  
**Dependencies:** Phases 1 + 4 complete (needs populated ontology with Layer 2 data)  
**CC prompt:** Needs to be generated

Ontology graph traversal to surface patterns across state boundaries:
- Multi-state parent companies (engage the parent, not each subsidiary)
- Shared certifications clusters (3 companies in one corridor all hold ISO 13485)
- Technology adoption gaps (RJG users without simulation software)
- Migration patterns (CA companies opening NV/TX facilities)

Initial version: new API endpoint + "Connections to Other States" section in StateDetailPanel. Later: auto-trigger on brief upload to flag new cross-state links.

No AI needed — this is SQL joins on the ontology tables.

---

## Future: Brief-Aware Semantic Search

**Effort:** Multi-session project  
**Dependencies:** Research briefs saved for multiple states, ontology populated  
**CC prompt:** Needs architecture QPA first

A search box that queries research brief *content*, not just structured fields. "Which companies have California connections?" returns Fabexco even though it's filed under Nevada.

**Technical approach (needs evaluation):**
- Option A: Neon pgvector extension + embeddings generated via Anthropic API
- Option B: Full-text search with PostgreSQL `tsvector` (simpler, less semantic)
- Option C: Anthropic API call at search time against brief content (simplest, highest per-query cost)

Needs a QPA session to evaluate options before building.

---

## Future: In-Platform AI Reasoning

**Effort:** Multi-session project  
**Dependencies:** Ontology populated, Aquila token budget approved  
**CC prompt:** Needs architecture QPA first

An embedded Claude instance inside the dashboard with access to the prospect database, research briefs, and ontology graph. Brett clicks a prospect and asks "How does this compare to our last 3 medical device engagements?" and gets an answer grounded in actual pipeline data.

**Technical approach:**
- Anthropic Messages API (already documented in project instructions for artifact usage)
- System prompt injects relevant prospect data, ontology context, and brief excerpts
- Chat-style interface in the detail panel or as a floating assistant
- Rate limiting and cost tracking needed

**Blocker:** Aquila needs to establish a token budget for API calls. This should be discussed with Duane and Steve before building.

---

## Future: AI Readiness Stoplight Scoring

**Effort:** ~1 hour CC session (once weighting is defined)  
**Dependencies:** Brett's input on weighting logic  
**CC prompt:** Needs to be generated after Brett conversation

Green/yellow/red readiness indicator per prospect. The fields exist (RJG, medical, certs, press count, years in business, CWP, ownership). The UI is trivial. The weighting logic needs Brett's brain.

**Action needed:** Ask Brett: "If you rated companies green/yellow/red for AI readiness, what matters most? What makes a company green vs yellow?" Then encode his answer as a scoring function.

**Do not build without Brett's sign-off on the algorithm.**

---

## Execution Order (Recommended)

| Order | What | Time | Blocker |
|-------|------|------|---------|
| 1 | Layer 1 rebuild (one API call) | 5 min | State imports done |
| 2 | Auto-trigger ontology on data changes | 1 hr | — |
| 3 | Manufacturing Corridors | 1 hr | — |
| 4 | Database Backup | 1 hr | — |
| 5 | Layer 2 extraction workflow | 2 hr | Phase 1 |
| 6 | Ontology Density map metric | 1 hr | Phase 1 |
| 7 | Smoke test | 30 min | Phases 1-6 |
| 8 | Cross-state intelligence | 2-3 hr | Phases 1 + 5 |
| 9 | AI Readiness scoring | 1 hr | Brett's weighting input |
| 10 | Brief-aware search | Multi-session | Architecture QPA |
| 11 | In-platform AI reasoning | Multi-session | Aquila token budget |

Phases 2, 3, and 4 can run in parallel — no dependencies between them.

---

*This document lives at `docs/post-import-roadmap.md` in the GitHub repo. Update it as phases complete.*
