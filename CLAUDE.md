# CLAUDE.md - Project Context

## Project Overview

PSB-Aquila Opportunity Tracker is a Kanban-style pipeline management tool for tracking university-industry partnership opportunities between Penn State Behrend (PSB) and Aquila. Four users (Kyle, Duane, Steve, Brett) use it to manage opportunities from initial lead through active project engagement.

## Tech Stack

- **Framework:** React 18 + Vite
- **Styling:** Tailwind CSS
- **Database:** Neon (PostgreSQL)
- **Hosting:** Vercel
- **Language:** JavaScript (TypeScript migration planned)

## Project Structure

```
src/
├── components/
│   ├── ui/              # Reusable UI components (Button, Card, Modal, etc.)
│   ├── pipeline/        # Kanban board, columns, opportunity cards
│   ├── prospects/       # Prospect pipeline table, detail panel, filters, outreach group badges, status badges, analytics charts
│   │   ├── charts/      # Chart components: GroupSummary, CategoryBreakdown, GeographyMap, SignalAnalysis, ReadinessScorecard, OwnershipProfile
│   │   ├── AddCompanyModal.jsx    # Single-company add form (POST /api/prospects)
│   │   ├── BulkImportModal.jsx    # Excel/CSV upload → preview → import (POST /api/prospects?action=import)
│   │   ├── ConvertToOpportunityModal.jsx  # Promote prospect → pipeline opportunity
│   │   └── FdaEnrichment.jsx     # Client-side FDA API enrichment (510k clearances, facilities)
│   ├── national-map/    # National Map tab: interactive US state choropleth
│   │   ├── NationalMap.jsx       # Main container (data fetch, metric selector, map, legend, detail panel)
│   │   ├── USMap.jsx             # SVG map component (state paths, hover/click, color fills)
│   │   ├── StateTooltip.jsx      # Cursor-following tooltip on state hover
│   │   ├── StateDetailPanel.jsx  # Right slide-out panel on state click
│   │   ├── StateReportSection.jsx # Condensed report preview in sidebar with "Open Full Report" button
│   │   ├── StateReportModal.jsx  # Near-full-screen modal for reading state research reports
│   │   ├── MapMetricSelector.jsx # Pill buttons for switching color metric
│   │   └── MapLegend.jsx         # Color scale legend
│   ├── shared/          # Shared components used across features
│   │   └── ReportMarkdownRenderer.jsx  # Custom ReactMarkdown renderer for research reports (company formatting)
│   ├── ontology/        # Knowledge Graph: ForceGraph D3 visualization, query panel, neighborhood
│   │   ├── ForceGraph.jsx           # Reusable D3 force-directed graph (shared component, supports compact mode)
│   │   ├── KnowledgeGraph.jsx       # Page component (top-level tab, hash param support)
│   │   ├── GraphExplorer.jsx        # Graph viewer with expand/collapse, type filters, search
│   │   ├── QueryPanel.jsx           # Query builder with filter chips and state dropdown
│   │   ├── QueryResults.jsx         # Result cards with "Find similar" button
│   │   ├── NeighborhoodPanel.jsx    # Compact graph for ProspectDetail (entity resolution + neighborhood)
│   │   └── ForceGraphTestPage.jsx   # Temporary test harness (remove after Session 2)
│   ├── notifications/   # DigestPrefsModal (daily digest email preferences)
│   ├── opportunities/   # Detail panel, forms, stakeholder alerts
│   └── layout/          # Header, sidebar, navigation
├── hooks/               # Custom React hooks
├── data/
│   └── us-states.js     # Static SVG path data for all 50 US states + DC (viewBox 960×600)
├── lib/
│   ├── db.js            # Database connection and queries
│   ├── api.js           # API client functions
│   └── utils.js         # Helper functions
├── pages/               # Route-level components
├── context/             # React context providers
├── utils/               # Shared utilities (categoryGroups.js)
├── constants/           # Project types, stages, stakeholder mappings
├── App.jsx
├── main.jsx
└── index.css            # Tailwind imports only
public/
api/                     # Vercel serverless functions (if needed)
```

## Key Commands

```bash
# Development
npm run dev              # Start Vite dev server (localhost:5173)
npm run build            # Production build
npm run preview          # Preview production build locally

# Database
npx prisma generate      # Generate Prisma client (if using Prisma)
npx prisma db push       # Push schema to Neon
npx prisma studio        # Open database GUI

# Auth Setup
node scripts/setup-admin.js        # Create admin user + auth tables (run once)
node scripts/setup-admin.js --reset # Reset admin PIN

# Deployment
vercel                   # Deploy to Vercel (preview)
vercel --prod            # Deploy to production
```

## Code Conventions

- **Components:** Functional components with hooks only (no class components)
- **Styling:** Tailwind CSS exclusively—no separate CSS files or CSS-in-JS
- **Component size:** Keep components small and focused (<100 lines preferred)
- **State:** Use React hooks (useState, useReducer) for local state; Context for shared state
- **Naming:** PascalCase for components, camelCase for functions/variables
- **Files:** One component per file, filename matches component name
- **Imports:** Group by: React → external libs → internal absolute → relative

## Domain Context

### What This Tracks

Partnership opportunities for the **Industrial AI Alliance**—a collaboration between PSB (university), Aquila (AI company), and Industry Partners. Each opportunity represents a potential project with a company.

### Alliance Client Journey (Pipeline Stages)

The pipeline maps to Stages 3-5 of the Alliance Client Journey (Stages 1-2 are handled in the Prospects tab):

1. **Channel Routing** (`channel_routing`) — Discovery meeting, determine project type and fit. 2-4 weeks. Gate: channel selected, stakeholders notified.
2. **Client Readiness** (`client_readiness`) — Client completes AI Readiness Modules (governance, data prep, internal alignment). 4-8 weeks. Gate: client passes readiness checklist.
3. **Project Setup** (`project_setup`) — SOW development, faculty matching, contract processing. 4-8 weeks. Gate: SOW signed, faculty/students assigned.
4. **Active** (`active`) — Project executing, solution scaling. 6-18 months. Gate: solution validated, data contributed to ontology.
5. **Complete** (`complete`) — Project delivered, marketplace listing approved. Gate: deliverables accepted, relationship preserved.

Stage constants defined in `src/constants/pipeline.js`.

### Project Types

| Project Type | Lead | Notes |
|--------------|------|-------|
| **Pilot Project** | Aquila-Led | Quick-start engagement |
| **Research Agreement** | Faculty-Led | Alicyn Rhoades (VC Research), Jennifer Surrena (contracts). 4-6 week processing time |
| **Senior Design** | Student-Led | Dean Lewis (dal16@psu.edu). **Aug 15 deadline** for fall semester |
| **Strategic Membership** | Partner Access | Amy Bridger for partnership structure |

Project type values: `'Pilot Project'`, `'Research Agreement'`, `'Senior Design'`, `'Strategic Membership'`

### Prospect-to-Pipeline Conversion

- **Promote to Pipeline** button appears on ProspectDetail when `prospect_status` is `'Outreach Ready'` or `'Converted'`
- Opens `ConvertToOpportunityModal` with company name pre-filled, project type and owner (dynamic from users table) required
- Creates opportunity with `source_prospect_id` linking back to the prospect, stage defaults to `'channel_routing'`
- Prospect status auto-updates to `'Converted'` (one prospect can generate multiple opportunities)
- `conversion_count` subquery included in prospects GET API response
- Purple badge on ProspectTable shows count of active opportunities per prospect

### No Fit Off-Ramp

- "No Fit" button on pipeline cards in Channel Routing stage
- Deletes the opportunity and sets the source prospect's status to `'Nurture'`
- Nurture prospects can be re-promoted later

### Stakeholder Routing

| Project Type | Primary PSB Contact | Notes |
|--------------|---------------------|-------|
| **Research Agreement** | Alicyn Rhoades (VC Research), Jennifer Surrena (contracts) | 4-6 week processing time |
| **Senior Design** | Dean Lewis (dal16@psu.edu) | **Aug 15 deadline** for fall semester |
| **Strategic Membership** | Amy Bridger | Revenue model discussions |

### Critical Constraints

- **Research agreements:** 4-6 week minimum processing time
- **Senior Design deadline:** August 15 for fall semester placement
- **Winter shutdown:** ~Dec 20 - Jan 6, no contract processing
- **Communication Matrix:** Defines full routing logic (see project files when available)

### Key Stakeholders

- **Kyle, Duane, Steve** - Primary users managing the pipeline
- **Brett Hyder** - Aquila industry expert (40 years in plastics), manages prospect outreach prioritization
- **Alicyn Rhoades** - PSB Vice Chancellor for Research
- **Jennifer Surrena** - PSB Contracts
- **Dean Lewis** - Senior Design coordinator (dal16@psu.edu)
- **Amy Bridger** - Partnership structure & alliance membership

## Database Schema

### Core Tables

- **`opportunities`** - Main opportunity records
  - `id` (UUID, PK) - Unique identifier
  - `company_name` - Company/organization name
  - `description` - Opportunity description
  - `project_type` - Type classification (Research Agreement, Senior Design, etc.)
  - `stage` - Pipeline stage (channel_routing, client_readiness, project_setup, active, complete)
  - `owner` - Assigned team member (Kyle, Duane, Steve)
  - `estimated_value` - Estimated deal value
  - `source` - Lead source
  - `psb_relationship` - Existing PSB relationship
  - `next_action` - Next action to take
  - `outcome` - Deal outcome (won, lost, abandoned) - set when closed
  - `source_prospect_id` (FK → prospect_companies.id) - Links to source prospect if converted from Prospects tab
  - `closed_at` - Timestamp when opportunity was closed
  - `created_at`, `updated_at` - Timestamps

- **`activities`** - Activity log entries
  - `id`, `opportunity_id` (FK), `activity_date`, `description`, `created_by`

- **`contacts`** - Contact info per opportunity
  - Links stakeholders to specific opportunities

- **`stakeholder_alerts`** - Routing rules by project type
  - Defines which stakeholders need to be notified based on project type and stage

- **`key_dates`** - Key dates calendar
  - `id`, `name`, `date_type`, `fixed_date`, `recurring_month/day`
  - `applies_to` (project_type array), `warn_days_*`, `warning_message`

### Analytics Tables

- **`stage_transitions`** - Logs every stage change for funnel/velocity analysis
  - `id` (UUID, PK)
  - `opportunity_id` (FK) - Reference to opportunity
  - `from_stage` - Previous stage (nullable for initial creation)
  - `to_stage` - New stage
  - `transitioned_at` - Timestamp of transition
  - `transitioned_by` - User who made the change

- **`deadlines`** - Key dates for analytics dashboard
  - `id`, `name`, `description`, `deadline_date`
  - `applies_to` (project_type array) - Which project types this applies to

### Auth Tables

- **`users`** - Dashboard user accounts (4 users)
  - `id` (SERIAL, PK), `name`, `email` (unique), `pin_hash`, `color`, `role` (admin/member), `is_active`, `created_at`, `last_login_at`
  - `digest_enabled` (BOOLEAN, default true) — master toggle for daily digest emails
  - `digest_preferences` (JSONB, default `{"overdue": true, "due_soon": true, "stale": true, "pe_windows": true}`) — per-section toggles

- **`sessions`** - Active login sessions (persist until logout)
  - `id` (TEXT, PK — random UUID token), `user_id` (FK), `created_at`

### Prospect Tables

- **`prospect_companies`** - 179-company prospect database for alliance outreach
  - `id` (SERIAL, PK)
  - Core: `company`, `also_known_as`, `website`, `category`, `in_house_tooling`, `city`, `state`, `geography_tier`, `source_report`, `priority`
  - Metrics: `employees_approx`, `year_founded`, `years_in_business`, `revenue_known`, `revenue_est_m`, `press_count`, `site_count`, `acquisition_count`
  - Signals: `signal_count`, `top_signal`, `rjg_cavity_pressure`, `medical_device_mfg` (values: `'Yes'`, `'Yes (confirmed)'`, `'No'`, or NULL), `key_certifications`
  - Relationships: `ownership_type`, `recent_ma`, `parent_company`, `decision_location`, `cwp_contacts`, `psb_connection_notes`
  - Planning: `engagement_type`, `suggested_next_step`, `legacy_data_potential`, `notes`
  - Dashboard-managed (editable): `outreach_group`, `outreach_rank`, `group_notes`, `last_edited_by`
  - Provenance: `added_by` — set on INSERT only (never overwritten on update/upsert), sourced from authenticated user's name
  - Status: `prospect_status` — Identified, Prioritized, Research Complete, Outreach Ready, Converted, Nurture
  - Follow-up: `follow_up_date` (DATE, nullable) — user-set follow-up date for CRM tracking
  - Timestamps: `created_at`, `updated_at`

### State Research Tables

- **`state_research_reports`** - State-level research reports for National Map
  - `id` (SERIAL, PK)
  - `state_code` (TEXT) — 2-letter abbreviation (PA, OH, TX, etc.)
  - `state_name` (TEXT) — Full name
  - `title` (TEXT) — Report title
  - `content` (TEXT) — Full markdown content (3,000-10,000+ words)
  - `parameters_used` (JSONB) — Future use
  - `prospect_count_at_time` (INTEGER) — Snapshot at save time
  - `researched_at` (TIMESTAMPTZ) — When research was conducted (user-specified)
  - `researched_by` (TEXT), `uploaded_at` (TIMESTAMPTZ), `uploaded_by` (TEXT)
  - `is_current` (BOOLEAN) — Soft-archive: only one current report per state (enforced by unique partial index)
  - `created_at` (TIMESTAMPTZ)

## Prospect Pipeline Architecture

### API Routes (consolidated — single file per feature)
- `GET /api/prospects` — List all (with optional filter query params)
- `GET /api/prospects?id=X` — Get single prospect
- `POST /api/prospects` — Create new prospect
- `POST /api/prospects?action=import` — Upsert from Excel. Keys on company name (case-insensitive). Updates research columns but **preserves** user-edited fields (`outreach_group`, `outreach_rank`, `group_notes`, `last_edited_by`)
- `PATCH /api/prospects?id=X` — Update prospect fields
- `GET /api/prospects?action=analytics` — Aggregated analytics data for charts (accepts same filter params as list endpoint)
- `GET /api/prospects?action=attachments&id=X` — List attachments for a prospect
- `POST /api/prospects?action=attach` — Create attachment + auto-advance status
- `POST /api/prospects?action=update-attachment` — Update attachment content in place (no status auto-advancement). Body: `{ attachment_id, content, updated_by }`
- `DELETE /api/prospects?action=delete-attachment&attachmentId=X` — Delete attachment
- `GET /api/prospects?action=data-audit` — Data quality audit: runs 16 diagnostic rules and returns counts, severity, examples, state signal health, and ontology health

### Frontend Components
- `ProspectTable` — Main sortable table with inline-editable rank and outreach group columns, plus status badges
- `ProspectFilters` — Filter bar with preset buttons (Group 1, Group 2, Time-Sensitive, Medical Molders, Mold Maker + Converter, Home Turf, Warm Leads, Ready for Research) + **multi-select** dropdown filters for group, category, priority, geography, and status. Uses `MultiSelectFilter` component (inline in ProspectFilters.jsx) with checkbox dropdowns, click-outside-to-close, Escape to close, select all / clear links. Active filters highlighted with navy border/background tint and count badge.
- `ProspectDetail` — Near-full-screen modal (was 480px sidebar) with two-column layout. Left column: action sections (Engagement Planning, Research Brief, Connections/NeighborhoodPanel). Right column: reference sections (Company Info, Company Metrics, Signals & Readiness, FDA Intelligence, PSB Relationship). Prev/next navigation through filtered prospect list. URL hash routing: `#prospects?id=123` deep-links to a prospect. Sub-modals (ResearchPromptModal, AttachResearchModal, ConvertToOpportunityModal, ExtractionPromptModal, ImportOntologyModal) stack at z-[60] above the prospect detail modal at z-40. Escape key respects modal stacking (sub-modal closes first, then prospect detail).
- `OutreachGroupBadge` — Colored badge: Group 1=green, Group 2=blue, Time-Sensitive=amber, Infrastructure=purple, Unassigned=gray
- `StatusBadge` — Prospect lifecycle badge: Identified=gray, Prioritized=blue, Research Complete=amber, Outreach Ready=green, Converted=purple, Nurture=gray italic
- `AddCompanyModal` — Form modal for adding a single company (company name required, primary fields + collapsible "More Details" section). POSTs to `/api/prospects`.
- `BulkImportModal` — Three-step Excel/CSV import flow: upload → preview (first 15 rows) → confirm. Uses SheetJS (`xlsx`) client-side to parse files with the same EXCEL_TO_DB column mapping as `scripts/seed-prospects.js`. POSTs to `/api/prospects?action=import`. Does not send `outreach_group`, `outreach_rank`, `group_notes`, or `last_edited_by` so the server preserves existing user-edited values.

### Outreach Group Pre-Assignments
Group 1 (ranked 1-5): Matrix Tool, X-Cell Tool & Mold, C&J Industries, Automation Plastics Corp, Erie Molded Plastics
Time-Sensitive: Currier Plastics (PE acquisition), Allegheny Performance Plastics (PE acquisition)
Group 2: Venture Plastics, Ferriot Inc., Accudyn Products, Caplugs/Protective Industries, TTMP/PRISM Plastics, Adler Industrial Solutions, Essentra Components
Infrastructure: RJG Inc., DME Company, Husky Technologies, Mold-Masters, Beaumont Technologies

### Prospect Status Lifecycle
- **Identified** — Default for new/imported companies
- **Prioritized** — Company has been reviewed and ranked for outreach
- **Research Complete** — Background research finished
- **Outreach Ready** — Ready for initial contact
- **Converted** — Moved to opportunity pipeline
- **Nurture** — Not ready now, maintain relationship

### Follow-Up Tracking & Staleness Detection

Two-tier "attention needed" system combining explicit follow-up dates with auto-detected staleness.

**Database:** `follow_up_date DATE` column on `prospect_companies` (nullable, day-precision only). Added to PATCH `allowedFields` in `api/prospects.js`.

**Tier 1 — Explicit Follow-Up Dates:**
- Date picker in ProspectDetail Engagement Planning section (after Suggested Next Step)
- Quick-set buttons: Tomorrow, +3 days, +1 week, +2 weeks, +1 month. Uses local-timezone date formatting (not `toISOString()`) to avoid UTC off-by-one errors.
- "Due" column in ProspectTable (between CWP and Ownership), sortable with nulls-last
- Urgency levels: overdue (red, priority 1), due_today (amber, 2), due_soon ≤3d (yellow, 3), due_week ≤7d (blue, 4), scheduled (gray, 10)

**Tier 2 — Auto-Detected Staleness (client-side only, no DB columns):**
- Computed from `updated_at`, `prospect_status`, and current date via `getProspectUrgency()` in ProspectTable
- Outreach Ready + 14d idle → "stale" (orange, priority 5)
- Prioritized + 14d idle → **"Research stalled"** (orange, priority 6) — triggers when a prospect has `prospect_status = 'Prioritized'` and `updated_at` is 14+ days ago. This means someone marked it for research but no progress has been recorded. Any edit to the prospect resets the timer by updating `updated_at`.
- Research Complete + 7d idle → "Needs outreach" (orange, priority 7)
- **Parked statuses exempt:** Converted, Nurture, Identified — never show staleness

**`parseLocalDate()` — Date Parsing Utility (critical pattern):**
- PostgreSQL `DATE` columns may come back as `"2026-04-21"` or `"2026-04-21T00:00:00.000Z"` depending on driver serialization
- `parseLocalDate(val)` safely handles both formats (plus Date objects and null) by splitting on `'T'` first, then parsing `YYYY-MM-DD` components into a local-timezone Date
- **SYNC**: Exists in both `ProspectTable.jsx` and `api/prospects.js` — keep identical
- **Rule**: Never use `new Date(follow_up_date + 'T00:00:00')` — always use `parseLocalDate()` for any DATE column parsing

**Visual indicators:**
- Colored urgency badge in Next Step column (before next-step text)
- Color-coded date in Due column
- Action items count badge in filter bar (red pill `<button>`, clickable to activate Action Items preset, always visible regardless of active filter)

**Filter presets:**
- "Action Items" (first preset) — shows all prospects with urgency priority ≤ 7 (overdue + due today + due soon + stale + stalled)
- "Stale" — shows only auto-detected stale/stalled prospects
- All presets and the action items badge clear the search text input when clicked

**CSV export** includes `follow_up_date` field.

### CWP Warm Lead Visuals
- **CWP heat thresholds**: 0=gray, 1-4=amber, 5-9=warm badge (amber bg), 10-19=hot (orange bg), 20+=very hot (red bg)
- Companies with CWP >= 5 show a colored dot next to company name in the table
- `warm_leads` preset filter: shows only companies with `cwp_contacts >= 5`
- ProspectDetail "PSB Relationship" section auto-opens when `cwp_contacts >= 5` and shows a warmth indicator banner

### Export Functionality
- Client-side CSV generation from the in-memory prospects array (no API call)
- Two options: "Export filtered" (respects current filters) and "Export all" (full dataset)
- Export button in the sub-view toggle header area of ProspectTable

### Parent-Company Grouping (Expandable Rows)
Companies that share a `parent_company` value are grouped into expandable/collapsible rows in ProspectTable. All grouping is **client-side**, applied after filtering and sorting — no API or schema changes.

**Grouping rules:**
- A group is created when 2+ filtered prospects share the same `parent_company` value, OR when a prospect's `company` name matches another prospect's `parent_company` (real parent + at least 1 child)
- **Real parent**: A prospect row exists with the parent's company name → it becomes the group header row (clickable to open detail panel)
- **Virtual parent**: No matching prospect row exists (e.g., "Hillenbrand") → a non-clickable header row is created with the parent name and aggregate stats
- Prospects that are real parents (others reference them) are never consumed as children of another group, preventing multi-level nesting
- Single-child groups without a real parent row are not grouped (child appears standalone)

**Visual design:**
- Group header rows: +/− toggle (`ChevronRight`/`ChevronDown`), bold company name, subsidiary count badge (`bg-gray-200/80 rounded-full`)
- Virtual parent rows: `bg-gray-100/60`, aggregate stats in numeric columns, dashes in text columns
- Real parent rows: parent's own data in text columns, aggregate totals in numeric columns (Sig, Presses, CWP)
- Child rows: indented (`pl-10` on company cell), muted background (`bg-gray-50/30`), left border (`border-l-2 border-l-gray-200`)

**State management:**
- `expandedGroups` — `Set<string>` of expanded parent company names, default all collapsed
- `toggleGroup(groupName)` — adds/removes from Set, `e.stopPropagation()` prevents row click

**Key behaviors:**
- Filtering works on the flat prospect list first, grouping applies to filtered results — search for "Synventive" shows it even though it's a subsidiary
- CSV export remains flat (exports the filtered array, not grouped structure)
- `filtered.length` count reflects individual prospects, not grouped row count
- Column widths unchanged — grouped rows use the same 17-column structure
- Charts sub-view unaffected — grouping only applies to table view

**Key test cases:**
- Barnes Molding Solutions: real parent + 6 subsidiaries
- Hillenbrand: virtual parent, 2 subsidiaries (DME Company, Mold-Masters)
- Peterson Manufacturing: real parent + 3 subsidiaries

**Brett's corporate structure taxonomy:**
- **Parent Company**: owns a controlling interest in subsidiaries that still operate independently (e.g., Barnes → Synventive, Männer)
- **M&A / Absorbed**: company was acquired and absorbed — the original entity legally no longer exists but legacy data/contacts may remain (e.g., Berry Global ← F&S Tool). Indicated by `also_known_as` field on child rows
- "Conglomerate" does NOT apply to our dataset — do not use this term in UI text

**Absorbed-company visual indicator:**
- Child rows within a parent group that have `also_known_as` populated show a `GitMerge` icon (`w-3 h-3 text-gray-400`) next to the "fka" text, signaling the company was absorbed into the parent
- Standalone rows (not in a parent group) with `also_known_as` show "fka" text only — no merge icon (name change, not absorption)

**Search fields:**
- Text search covers: `company`, `also_known_as`, `city`, `state`, `category`, `parent_company`, `notes`, `suggested_next_step`
- Searching "F&S" surfaces companies with "F&S" in `also_known_as`; searching "Westfall" surfaces all subsidiaries via `parent_company` match

### Industry Visual Intelligence (Prospect Table + Detail Panel Polish)

Six visual enhancements that surface plastics industry intelligence at a glance. All data-driven from existing API fields — no new endpoints or schema changes.

**Files modified:** `ProspectTable.jsx`, `ProspectDetail.jsx`

1. **Press Count Column** — "Presses" column between Sig and Sites in table. Sortable. Universal sizing metric in plastics.
1b. **Sites Column** — "Sites" column between Presses and Acq. Sortable by `site_count`. Shows dash when null.
1c. **Acquisitions Column** — "Acq" column between Sites and RJG. Sortable by `acquisition_count`. Shows dash when null. Both columns aggregate in parent group rows.
2. **Tooling Indicator** — 🔧 icon in Category cell when `in_house_tooling === 'Yes'`. Tooltip: "In-house tooling — controls their own molds."
3. **Gold RJG Treatment** — Confirmed RJG users show gold/amber star (★) instead of green checkmark. Matches Brett's "gold signal" mental model. Likely still shows yellow tilde.
4. **Ownership Urgency Indicators** — Icons after ownership text: red ⏱ (PE + recent M&A, 6-18mo window), amber ⏱ (PE, 3-5yr hold), orange ◈ (family 30+ years, succession), blue ◈ (ESOP). Ownership text truncated to ~100px in table.
5. **Certification Badges in Detail** — `key_certifications` rendered as colored pills in ProspectDetail Signals section. Color-coded by market vertical:
   - Purple: Medical (ISO 13485, FDA, MedAccred)
   - Blue: Automotive (IATF 16949, TS 16949)
   - Gray-dark: Aerospace (AS9100, NADCAP, ITAR)
   - Green: Environmental (ISO 14001)
   - Cyan: Cleanroom (ISO Class)
   - Gray-light: General QMS (ISO 9001) and default
6. **"Why This Company" Hook Line** — Computed one-liner in detail panel header (white/60 italic). Built from: RJG status → tooling integration → press count/employees → site count (≥10) → acquisition count (≥5) → legacy years → PE/M&A → medical → CWP warmth → top_signal fallback. Max 4 hooks, separated by middle dot (·).

**`buildHookLine(p)`** priority order: RJG confirmed → converter+tooling → press count (or 500+ employees) → site count (≥10) → acquisition count (≥5) → 30+ year legacy → PE/M&A → medical device → CWP warmth → top_signal fallback

**`CERT_COLORS`** mapping and `getCertColor()` use case-insensitive partial match against certification string.

### Company Hover Card (CompanyHoverCard)

**Component**: Inline in `ProspectTable.jsx` — renders a compact corporate profile card on company name hover in the prospect table.

**Behavior**:
- 250ms delay before showing (prevents flicker on casual mouse movement). Timeout cleared on mouse leave.
- `pointer-events-none` on the card so it doesn't intercept row clicks
- Wraps ONLY the company name `<span>`, not the entire company cell (preserves CWP dots, AKA text, badges, expand toggles)
- Appears on standalone rows, child rows, and real parent group header rows
- Does NOT appear on virtual parent rows (no prospect data)
- If no data fields are populated, renders as a passthrough (just children)

**Content** (rows shown only when data exists):
- Presses + Employees
- Sites + Acquisitions (`site_count`, `acquisition_count`)
- Founded + Revenue
- Ownership + Geography Tier
- Parent Company
- Certification badges (same color scheme as ProspectDetail)
- Top Signal (footer, italic)

**Editable fields**: `site_count` (INTEGER) and `acquisition_count` (INTEGER) are editable in ProspectDetail Company Metrics section as always-visible number inputs (same pattern as `outreach_rank`). Data entered here appears in the hover card and in `buildHookLine()` (≥10 sites, ≥5 acquisitions).

### FDA Intelligence (Client-Side Enrichment)

**Component**: `src/components/prospects/FdaEnrichment.jsx` — client-side FDA API enrichment panel in ProspectDetail, between Signals & Readiness and PSB Relationship sections. Uses `<Section title="FDA Intelligence" defaultOpen={false}>`.

**How it works**: Queries the FDA's public openFDA API (no auth key needed, supports CORS) for 510(k) device clearances and registered manufacturing establishments. Results are NOT persisted — fetched fresh each session and cached in component state.

**FDA API endpoints used (client-side `fetch`):**
- `https://api.fda.gov/device/510k.json?search=applicant:{name}&limit=10`
- `https://api.fda.gov/device/registrationlisting.json?search=registration.owner_operator.firm_name:{name}&limit=10`

**Search cascade**: Tries `prospect.company`, then `prospect.also_known_as`, then `prospect.parent_company`. Merges and deduplicates results across all name variants.

**"Yes (confirmed)" value**: When FDA data is found, Brett can click "Update to Yes (confirmed)" which:
1. Sets `medical_device_mfg` to `'Yes (confirmed)'` via existing PATCH route (auto-triggers ontology rebuild)
2. Appends 510(k) numbers to `notes` field: `[FDA 2026-04-10] 510(k): K123456, K789012`
3. Saves an FDA snapshot as a `prospect_attachment` (see below)

**FDA Snapshot Persistence**: FDA query results are saved as `prospect_attachments` with `attachment_type: 'fda_snapshot'`. Content is a JSON string: `{ clearances, facilities, searchedNames, checkedAt }`. One snapshot per prospect (replace pattern — old snapshot deleted before saving new). On subsequent visits, saved snapshot loads automatically into the tab UI with a "Checked on {date} by {user}" timestamp. "Re-check FDA" button runs a live query without auto-saving — user must click "Update to Yes (confirmed)" to persist. Props from ProspectDetail: `attachments` (full array) and `onSnapshotSaved` (re-fetches attachments).

**Codebase-wide pattern for `medical_device_mfg`:**
- **JS**: Use `value?.startsWith('Yes')` to match both `'Yes'` and `'Yes (confirmed)'`
- **SQL**: Use `medical_device_mfg LIKE 'Yes%'` instead of `= 'Yes'`
- All existing checks were updated in the ripple audit: ontology rebuild, data audit, analytics, Medical Molders filter, ShieldCheck icon, NeighborhoodPanel probe

**No new serverless functions** — zero API route changes beyond the `LIKE 'Yes%'` ripple updates.

### Manufacturing Corridors (replaced Geography Tiers)
The analytics chart and filter system uses **Manufacturing Corridors** — industry-meaningful geographic groupings derived from the `state` column at query time. The old `geography_tier` column (Tier 1/2/3/Infrastructure) still exists in the database but is no longer used for analytics or filtering.

**State → Corridor Mapping:**
| Corridor | States |
|----------|--------|
| **Great Lakes Auto** | MI, OH, IN, IL, WI |
| **Northeast Tool** | PA, NY, CT, NJ, MA, NH, VT, ME, RI, DC |
| **Southeast Growth** | NC, GA, FL, TN, SC, VA, AL, MS, KY |
| **Gulf / Resin Belt** | TX, LA, OK, AR |
| **Upper Midwest Medical** | MN |
| **West Coast** | CA, OR, WA |
| **Mountain / Central** | CO, AZ, UT, NV, NM, ID, MT, WY, ND, SD, NE, KS, IA, MO |
| **Non-Contiguous** | AK, HI |

**Corridor Colors:**
- Great Lakes Auto: `#041E42` (navy), Northeast Tool: `#2563EB` (blue), Southeast Growth: `#16A34A` (green), Gulf / Resin Belt: `#DC2626` (red), Upper Midwest Medical: `#7C3AED` (purple), West Coast: `#F59E0B` (amber), Mountain / Central: `#6B7280` (gray), Non-Contiguous: `#9CA3AF` (light gray), Unknown: `#D1D5DB`

**Filter preset:** "Home Turf" → filters to Northeast Tool corridor (was "Tier 1 Local")

**Implementation:** Corridors are computed from `state` via SQL CASE expression in the analytics endpoint and a JS lookup map in ProspectTable for client-side filtering. The `corridor` query param maps to `WHERE state IN (...)` clauses. The mapping is defined in three places: `api/prospects.js` (analytics + list endpoints), `src/components/prospects/ProspectTable.jsx` (client-side filter), and `src/components/prospects/charts/GeographyMap.jsx` (colors).

### Sub-View Toggle Pattern
The Prospects tab uses a Table/Charts sub-view toggle within the view (not a separate top-level tab). Charts respect the same filter state as the table — when Brett filters to "Medical Molders in Northeast Tool," the charts reflect that filtered dataset. Clicking chart elements (group cards, category bars, corridor segments) updates the shared filter state, affecting both table and chart views.

### Multi-Select Filter State Shape
Filter state uses **arrays** (not strings). Empty array = no filter (show all).

```javascript
// Filter state shape (ProspectTable.jsx)
{ group: [], category: [], priority: [], geo: [], status: [], search: '', preset: null }

// Example with selections:
{ group: ['Group 1', 'Time-Sensitive'], category: [], priority: [], geo: [], status: [], search: '', preset: null }
```

**Key patterns:**
- **Empty array = "All"**: `filters.group.length === 0` means no group filter active
- **Client-side filtering**: `filters.group.length > 0 && !filters.group.includes(p.outreach_group)` → exclude
- **Presets use arrays**: `{ filter: { group: ['Group 1'] } }` not `{ filter: { group: 'Group 1' } }`
- **Analytics query params**: Arrays joined as comma-separated strings: `?outreach_group=Group+1,Time-Sensitive`
- **Server-side SQL**: `api/prospects.js` splits comma-separated params and uses `IN (...)` for multi-values
- **Chart click handlers**: Set single-element arrays: `onFilterChange({ group: [clickedGroup], ... })`
- **MultiSelectFilter component**: Inline in `ProspectFilters.jsx`. Props: `label`, `options`, `selected` (array), `onChange` (receives new array)

### Data Quality Audit
- **API**: `GET /api/prospects?action=data-audit` — Read-only diagnostic scan of the prospect database
- **Component**: `DataAuditModal.jsx` — Modal triggered from "Audit" button in ProspectTable header
- **16 diagnostic rules** across 3 categories:
  - **Completeness** (10 rules): null_signal (high), null_cwp (high), null_state (critical), null_category (warning), null_priority (warning), null_press (info), null_founded (info), null_employees (info), null_certs (info), null_ownership (warning)
  - **Consistency** (5 rules): rjg_no_signal (critical), medical_no_cert (warning), converter_no_press (warning), parent_no_ownership (info), age_mismatch (info)
  - **Coverage** (1 rule): state_signal_gap (critical) — states with 5+ prospects but avg signal < 0.5
- **Severity levels**: critical (data error), high (import gap), warning (possible issue), info (minor gap)
- **Response includes**: rules with counts/examples (max 5 per rule), state_signal_health table, ontology_health (gracefully skips if tables don't exist), summary counts
- **SQL efficiency**: 3 consolidated queries using `COUNT(*) FILTER (WHERE ...)` + 1 UNION ALL examples query + 1 ontology query (try/catch). Well within 10s Vercel timeout.
- **Session caching**: Modal caches audit results; "Re-run Audit" button forces refresh

### Research Workflow & Attachments
- **Deep research prompt template** lives at `public/prompts/deep-research-template.md` with `{{variable}}` placeholders injected from prospect data at render time
- **ResearchPromptModal** (`src/components/prospects/ResearchPromptModal.jsx`) — fetches template, injects prospect data, copies to clipboard
- **AttachResearchModal** (`src/components/prospects/AttachResearchModal.jsx`) — paste markdown, preview, save as attachment. Supports both create and edit modes via optional `existingAttachment` prop. In edit mode: pre-populates content, uses `update-attachment` endpoint, hides status auto-advance hint.
- **ResearchBriefPanel** (`src/components/prospects/ResearchBriefPanel.jsx`) — renders saved research brief as collapsible accordion sections, parsed by `## ` headers
- **Attachment API routes** (all in `api/prospects.js`):
  - `GET ?action=attachments&id=X` — list attachments for a prospect
  - `POST ?action=attach` — create attachment (body: `{ prospect_id, attachment_type, title, content, created_by }`)
  - `POST ?action=update-attachment` — update existing attachment content (body: `{ attachment_id, content, updated_by }`). Does NOT re-trigger status auto-advancement.
  - `DELETE ?action=delete-attachment&attachmentId=X` — remove attachment
- **Status auto-advancement**: Saving a `research_brief` attachment auto-sets `prospect_status` to `'Outreach Ready'` if current status is `Identified`, `Prioritized`, or `Research Complete`. Does NOT overwrite `Converted` or `Nurture`. Does NOT fire on edit (update-attachment).
- **Database table**: `prospect_attachments` (id, prospect_id, attachment_type, title, content, created_by, created_at)
- **Markdown rendering**: Uses `react-markdown` package (safe by default, no `dangerouslySetInnerHTML`)

### Seed/Import
- SQL migration: `scripts/create-prospect-table.sql`
- Seed script: `scripts/seed-prospects.js` (reads Excel if available, otherwise seeds known companies)
- Excel dependency: `xlsx` (SheetJS) package

## Authentication System

### Architecture
- **Session-based auth** with email + 6-digit PIN login. No JWT, no external auth libraries.
- **Sessions persist until explicit logout** — no expiry, no timeout.
- Session token stored in `localStorage` as `session_token`, sent as `Authorization: Bearer <token>` header.
- All auth endpoints consolidated in a single `api/auth.js` (Vercel function limit).

### Key Components
- `src/context/AuthContext.jsx` — `AuthProvider` wraps the app in `main.jsx`. Exposes `useAuth()` hook providing `{ user, login, logout, loading, authFetch }`.
- `src/components/auth/LoginScreen.jsx` — Login gate (Penn State navy gradient, centered card).
- `src/components/auth/AdminPanel.jsx` — Admin-only user management modal (add/edit/deactivate users, reset PINs).
- `Header.jsx` — Shows logged-in user avatar, team member avatars, admin gear icon (admin only), logout button.

### Auth API Routes (`api/auth.js`)
- `POST ?action=login` — Validate email + PIN, create session
- `POST ?action=logout` — Delete session
- `GET ?action=validate` — Validate session token
- `GET ?action=me` — Get current user profile
- `POST ?action=create-user` — Admin: add new user (returns one-time PIN)
- `PATCH ?action=update-user&id=X` — Admin: edit user
- `POST ?action=reset-pin&id=X` — Admin: generate new PIN
- `GET ?action=list-users` — Admin: get all users

### User Identity Pattern
- `useAuth()` is the canonical way to get the current user (`{ id, name, email, color, role }`)
- All hardcoded user arrays have been removed from `Header.jsx`
- `last_edited_by` on prospect edits now uses the authenticated user's name
- `added_by` on prospect creation (single add and bulk import) records who added the company — set on INSERT only, never overwritten on update/upsert
- `transitioned_by` on pipeline stage changes now uses the authenticated user's name

### Users (4 total)
- **Kyle** (admin) — Alliance Coordinator, only admin
- **Duane** (member) — Aquila operations
- **Steve** (member) — Aquila legal/contracts
- **Brett** (member) — Aquila industry expert

### Database Tables
- `users` — id, name, email, pin_hash, color, role, is_active, created_at, last_login_at
- `sessions` — id (token), user_id, created_at

### Initial Setup
Run `node scripts/setup-admin.js` to create auth tables and the initial admin (Kyle) account. The script generates a 6-digit PIN displayed once. Kyle then creates other users via the admin panel.

## Daily Digest Email System

### Overview
Automated daily email digests notify users about action items in their prospect pipeline. Uses Vercel Cron to trigger and Resend API to deliver personalized HTML emails.

### Architecture
- **Cron trigger:** Vercel Cron (`vercel.json`) → `GET /api/prospects?action=daily-digest` at 12:00 UTC (8:00 AM ET), weekdays only
- **Email delivery:** Resend API via plain `fetch` (no npm package). From address: `PSB-Aquila Dashboard <onboarding@resend.dev>` (shared test domain)
- **Cron security:** `Authorization: Bearer {CRON_SECRET}` header required. Returns 401 if missing/wrong.
- **Server-side urgency:** `getProspectUrgency()` function in `api/prospects.js` — SYNC with client-side copy in `ProspectTable.jsx`

### Email Sections (user-configurable)
| Section | Preference Key | What It Shows |
|---------|---------------|---------------|
| Overdue Follow-Ups | `overdue` | Prospects past their `follow_up_date` |
| Due This Week | `due_soon` | Follow-ups due today or within 7 days |
| Stale / Stalled | `stale` | Prospects idle too long for their status |
| PE Window Watch | `pe_windows` | PE-backed companies with recent M&A activity |

### User Preferences
- Stored on `users` table: `digest_enabled` (boolean), `digest_preferences` (JSONB)
- Self-service: any user can toggle via bell icon in header → `DigestPrefsModal`
- API: `PATCH /api/auth?action=update-preferences` (authenticated, updates own prefs)
- Empty digests are NOT sent — users with zero matching items are skipped

### API Routes
- `GET /api/prospects?action=daily-digest` — Cron-secured endpoint. Queries prospects, computes urgency, sends emails via Resend. Returns `{ sent, skipped, failed, results[] }`.
- `PATCH /api/auth?action=update-preferences` — Authenticated. Body: `{ digest_enabled, digest_preferences }`. Updates own user record.

### UI Components
- `src/components/notifications/DigestPrefsModal.jsx` — Modal with master toggle + section checkboxes
- `Header.jsx` — Bell icon (`lucide-react` `Bell`) opens DigestPrefsModal

### Environment Variables
- `RESEND_API_KEY` — Resend API key (set in Vercel)
- `CRON_SECRET` — Vercel Cron secret for securing the digest endpoint (set in Vercel)

### Database Migration (run once in Neon SQL Editor)
```sql
ALTER TABLE users ADD COLUMN digest_enabled BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN digest_preferences JSONB DEFAULT '{"overdue": true, "due_soon": true, "stale": true, "pe_windows": true}'::jsonb;
```

## Keeping This File Current

This file is only useful if it stays accurate. Maintain it actively:

- **Architectural decisions**: When we make a significant decision (tech choice, pattern, convention), update this file immediately
- **New commands/scripts**: When adding build scripts, dev commands, or utilities, add them to Key Commands
- **Recurring issues**: When we hit the same problem twice, add guidance here so we don't repeat it
- **Schema changes**: When database tables or columns change, update the Database Schema section
- **New conventions**: When a coding pattern emerges that we want to keep consistent, document it

**Proactive updates**: When something feels like it should be documented, ask "Should I add this to CLAUDE.md?" Don't wait to be asked.

## Environment Variables

```
DATABASE_URL=            # Neon PostgreSQL connection string
VITE_API_URL=            # API base URL (if separate backend)
RESEND_API_KEY=          # Resend API key for daily digest emails
CRON_SECRET=             # Vercel Cron secret for securing digest endpoint
```

## Conventions

### API Route Consolidation (Vercel Hobby = 12 function limit)
- **One file per feature** in `api/`. Do NOT use nested directories for sub-routes.
- Route internally using HTTP method + `req.query` params (`?id=X`, `?action=import`)
- Current function count: **10** (target: ≤ 12, Vercel Hobby limit)
- Files: `health.js`, `opportunities.js`, `opportunities/[id].js`, `activities.js`, `analytics.js`, `stage-transitions.js`, `key-dates.js`, `meeting-minutes.js`, `prospects.js`, `auth.js`

### Icons
- Use `lucide-react` for all new icons. Import only what you need (tree-shakeable, ~1KB per icon).
- Currently used in `ProspectTable.jsx`: Wrench (tooling), Star (RJG confirmed), HelpCircle (RJG likely), Clock (PE urgency), AlertTriangle (family succession), Users (ESOP), ShieldCheck (medical).
- Existing inline SVGs elsewhere in the app are fine — no need to migrate those.

## National Map Feature

### Overview
Interactive SVG choropleth map of the United States. Each state colored by a selectable metric, derived from `prospect_companies` data grouped by state.

### Components
- **Directory**: `src/components/national-map/`
- **NationalMap.jsx** — Main container: fetches state-stats + report metadata on mount, manages metric/hover/selection state, composes all sub-components
- **USMap.jsx** — SVG `<path>` rendering for all 50 states + DC with hover/click handlers and metric-based color fills (including freshness semantic colors)
- **StateTooltip.jsx** — Floating tooltip near cursor showing state summary; shows freshness info when Research Freshness metric is active
- **StateDetailPanel.jsx** — Right slide-out panel with summary stats, category breakdown, priority bar, top companies, research report section, and "Coming Soon" placeholders for Prompt Builder and Ontology Summary
- **StateReportSection.jsx** — Condensed report preview in sidebar: freshness badge, metadata, first 1-2 accordion sections as preview, action buttons, and "Open Full Report" button that opens StateReportModal. Exports `getFreshnessInfo` and `parseSections` used by other components.
- **StateReportModal.jsx** — Near-full-screen modal (max-w-5xl, 90vh) for reading state research reports. Includes all controls: accordion expand/collapse, copy raw markdown, freshness badge, new-prospects indicator, upload new report, run state research. Closeable via X, Escape, or backdrop click. Uses shared `ReportMarkdownRenderer` for company-entry formatting.
- **UploadStateReportModal.jsx** — Modal for uploading state research reports via paste (textarea) or file upload (drag-and-drop .md/.txt). State selector, research date picker, title field, preview mode. Max 500KB file size.
- **MapMetricSelector.jsx** — Array-driven pill buttons for switching color metric (5 metrics including Research Freshness)
- **MapLegend.jsx** — Color gradient scale for standard metrics; categorical legend (green/yellow/red/gray) for freshness metric

### API Endpoints (all inside `api/prospects.js` — no new serverless functions)
- `GET /api/prospects?action=state-stats` — Per-state aggregations keyed by 2-letter abbreviation: `prospect_count`, `categories` (top 3), `avg_signal`, `cwp_total`, `priorities` breakdown, `top_companies` (top 3), plus `_totals` key
- `GET /api/prospects?action=state-reports` — List all current reports (metadata only, no content). Returns array of `{ id, state_code, state_name, title, researched_at, researched_by, uploaded_at, uploaded_by, prospect_count_at_time }`
- `GET /api/prospects?action=state-report&state=XX` — Get full report for a state (includes content). Returns single object or null.
- `POST /api/prospects?action=save-state-report` — Save/replace a state report. Body: `{ state_code, state_name, title, content, researched_at, researched_by, uploaded_by }`. Auto-computes `prospect_count_at_time`. Archives existing current report (sets `is_current = false`), inserts new with `is_current = true`.

### Database: `state_research_reports` Table
```sql
state_research_reports (
  id SERIAL PRIMARY KEY,
  state_code TEXT NOT NULL,           -- 2-letter abbreviation
  state_name TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,              -- Full markdown (can be 3,000-10,000+ words)
  parameters_used JSONB,             -- Future use
  prospect_count_at_time INTEGER,    -- Snapshot of prospect count at save time
  researched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  researched_by TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by TEXT,
  is_current BOOLEAN DEFAULT TRUE,   -- Soft-archive pattern
  created_at TIMESTAMPTZ DEFAULT NOW()
)
-- Unique partial index: only one current report per state
-- CREATE UNIQUE INDEX idx_state_reports_one_current ON state_research_reports(state_code) WHERE is_current = TRUE;
```

### Report Replacement Flow
When saving a new report for a state that already has one: old report gets `is_current = false` (archived, not deleted), new one inserted with `is_current = true`. The unique partial index enforces only one current report per state. Future UI could show report history.

### Static Data
- `src/data/us-states.js` — SVG path data for all 50 states + DC. ViewBox `0 0 960 600`. Alaska/Hawaii repositioned as insets. Exports `US_STATES` array and `STATE_ABBR_TO_NAME` lookup.
- `src/data/corridors.js` — Single source of truth for manufacturing corridor constants. Exports `CORRIDOR_COLORS` (corridor name → hex) and `STATE_TO_CORRIDOR` (state abbreviation → corridor name). Imported by `GeographyMap.jsx`, `USMap.jsx`, `NationalMap.jsx`, `MapLegend.jsx`, and `StateTooltip.jsx`. The mapping also exists in `api/prospects.js` (SQL CASE) for server-side analytics.

### Metrics
| Key | Label | Description |
|-----|-------|-------------|
| `prospect_count` | Prospect Count | Number of companies per state (default) |
| `avg_signal` | Signal Strength | Average signal_count per state |
| `cwp_total` | CWP Density | Total CWP contacts per state |
| `priority_mix` | Priority Mix | Proportion of HIGH PRIORITY prospects |
| `freshness` | Research Freshness | How recently each state was researched (semantic color scale) |
| `ontology_density` | Ontology Density | Relationships per prospect — knowledge graph depth (standard gradient) |

### Color Palette
- No data: `#E5E7EB` (gray-200)
- Data gradient (standard metrics): light blue (`#93C5FD`) → blue (`#2563EB`) → navy (`#041E42`)
- Freshness metric: green (`#16A34A`, <30d) → yellow (`#EAB308`, 30-90d) → red (`#DC2626`, >90d) → gray (`#E5E7EB`, no report)
- Selected state: amber stroke (`#F59E0B`)

### Corridor Overlay
- Toggle button ("Corridors") in top-right of map container. When active: state borders colored by manufacturing corridor, corridor legend shown below metric legend, and corridor name displayed in tooltip header.
- Toggle state persisted in `localStorage` key `national-map-corridors-visible`.
- Stroke priority: selected (amber) > hovered (navy) > corridor color (1.5px) > default (white 0.5px). Corridor strokes never override hover/selection.
- Prop flow: `NationalMap` owns `showCorridors` state → passes to `USMap` (strokes), `MapLegend` (corridor legend), `StateTooltip` (corridor name via `showCorridor` + `corridorName` props).
- Corridor colors/mapping defined in `src/data/corridors.js` (single source of truth).

### Enhanced State Tooltip
- Default tooltip (non-freshness, non-ontology) shows: company count, high priority count (amber), avg signal, CWP total, top 3 company names with category, and research date or "Not yet researched".
- When corridor overlay is active, corridor name appears below the state name/abbreviation header.
- All data sourced from already-fetched `stateData` and `reportMeta` — no additional API calls on hover.

### Freshness Thresholds (configurable in `StateReportSection.jsx`)
- **Fresh** (green): < 30 days since `researched_at`
- **Aging** (yellow): 30–90 days
- **Stale** (red): > 90 days
- **No Report** (gray): no current report exists

### Phase Roadmap
- **Phase 1** (complete): Map + state stats + detail panel
- **Phase 2** (complete): State research reports + freshness tracking + upload modal
- **Phase 3** (complete): State Prompt Builder + Training Wheels (contextual help)
- **Phases 4-6** (future): Ontology tables, extraction, visualization

### State Prompt Builder (Phase 3)

**Template**: `public/prompts/state-research-template.md`
- Two-section structure: Parameter Header (with `{{variables}}`) + Core Alliance Client Prospecting Prompt below the `---` separator
- The core prompt content (~4,000 words) is sacred — the builder only modifies the parameter header. Everything below the `---` is the "digital Brett" research framework and must not be altered
- Exception: the Geographic Prioritization section within the core prompt uses `{{state_name}}` and `{{state_code}}` variables for state-specific tier logic
- Template variables: `state_name`, `state_code`, `research_date`, `requested_by`, `existing_count`, `existing_companies_list`, `focus_instructions`, `min_employees`, `cwp_instructions`, `geo_notes`

**StatePromptBuilderModal** (`src/components/national-map/StatePromptBuilderModal.jsx`)
- Follows ResearchPromptModal pattern: fetch template from `/prompts/`, cache after first load, inject variables via regex, copy to clipboard
- Parameter controls: state selector, industry focus checkboxes, minimum employee count, CWP cross-reference toggle, exclude existing companies toggle
- Two-panel layout: parameters (left/top) + prompt preview (right/bottom)
- Fetches full prospect list from `GET /api/prospects` for client-side state filtering (exclusion list)
- Word count indicator in footer
- Entry points: "Run State Research" button in StateDetailPanel and StateReportSection

### Training Wheels (Phase 3)

**InfoTooltip** (`src/components/national-map/InfoTooltip.jsx`)
- Reusable `ⓘ` icon with hover tooltip (14px, gray-400, darker on hover)
- Tooltip: absolute positioned, max-width 250px, bg-gray-900, text-white, text-xs
- Auto-flips above/below based on viewport position
- Usage: `<InfoTooltip text="Description text here" />`
- To add tooltips elsewhere, import and place inline next to any label

**Orientation Card** (in `NationalMap.jsx`)
- Collapsible intro card at top of map view (blue-50 background, navy border-l-4)
- Collapses to "ⓘ About this view" link when dismissed
- Collapse state persisted in `localStorage` key `national-map-orientation-dismissed`
- This is the ONE localStorage usage for UI preference (not application data)

**Dynamic Subtitles** (in `NationalMap.jsx`)
- Subtitle below "National Map" header adapts based on active metric
- Computed from already-fetched state-stats and report metadata — no new API calls
- Each metric has a custom subtitle format (counts, ranges, freshness breakdown)

**Section Descriptions** (in `StateDetailPanel.jsx`)
- One-line gray descriptions (`text-xs text-gray-400 mb-1`) above each section in the state detail panel
- Subtle enough not to clutter, visible enough to orient new users

**Metric Tooltips** (in `MapMetricSelector.jsx`)
- InfoTooltip placed inside each metric pill button with `ml-1` spacing
- Each metric has a descriptive tooltip explaining what it measures

### Ontology System (Phase 4 — Active)

**Taxonomy reference document**: `docs/plastics-manufacturing-ontology-v1.md` — defines entity types, relationship types, and a starter population extracted from state research reports. Created collaboratively with Duane and Brett.

#### Database Tables (4 tables)
- **`ontology_entity_types`** — Taxonomy classes (Company, Certification, Technology / Software, Manufacturing Process, etc.). 12 seeded types.
- **`ontology_entities`** — Specific instances (ISO 9001, RJG Cavity Pressure Monitoring, Medical Devices, etc.). Links to `prospect_companies` via `prospect_company_id` FK for Company-type entities.
- **`ontology_relationship_types`** — Verbs connecting entities (holds_certification, uses_technology, subsidiary_of, etc.). 23 seeded types with domain/range constraints and inverse names.
- **`ontology_relationships`** — Actual edges (Company X → holds_certification → ISO 9001). UNIQUE on (type_id, subject_entity_id, object_entity_id).

SQL migration: `scripts/create-ontology-tables.sql`

#### Layer 1 vs Layer 2
- **Layer 1 (auto-derived):** Reads structured `prospect_companies` columns and generates entities + relationships automatically. Zero manual effort.
- **Layer 2 (Research-extracted):** Extracts richer data from research brief narrative text via a manual prompt-copy-paste workflow. See "Layer 2 Ontology Extraction" section below.

#### Layer 1 Field-to-Entity Mapping
| Prospect Field | Entity Type | Relationship |
|---------------|-------------|--------------|
| `key_certifications` (comma-separated) | Certification | holds_certification |
| `rjg_cavity_pressure` (Yes/confirmed/Likely) | Technology / Software ("RJG Cavity Pressure Monitoring") | uses_technology |
| `medical_device_mfg` (Yes) | Market Vertical ("Medical Devices") | serves_market |
| `ownership_type` | Ownership Structure | has_ownership_structure |
| `parent_company` | Company | subsidiary_of |
| `category`, `in_house_tooling` | — | Stored as attributes on Company entity |

#### Certification Normalization
`key_certifications` values are normalized to canonical forms before entity creation in both `rebuildOntologyLayer1` and `rebuildOntologyForProspect`. The `CERT_NORMALIZATION` map (defined near the top of `api/prospects.js`) maps variants like "ISO 9001:2015", "ISO 9001:2008", "ISO 9000" → "ISO 9001". After normalization, duplicates are removed via `[...new Set()]` so a company with both "ISO 9001:2015" and "ISO 9001" creates only one relationship. The `normalizeCertName()` helper does case-insensitive lookup, falling back to the trimmed original if no match. After deploying changes to the normalization map, a full Layer 1 rebuild (`POST ?action=rebuild-ontology-layer1`) is needed to regenerate with normalized certs.

#### API Endpoints (all in `api/prospects.js`)
- `POST /api/prospects?action=rebuild-ontology-layer1` — Clears all Layer 1 entities/relationships, reads all prospects, regenerates. Idempotent. Returns `{ entities_created, relationships_created, prospects_processed, duration_ms }`.
- `GET /api/prospects?action=ontology-stats` — Aggregate stats: entity counts by type, relationship counts by type, layer breakdown, last rebuilt timestamp.
- `GET /api/prospects?action=ontology-state-summary&state=XX` — State-level breakdown: top certifications, technologies, ownership mix, medical/RJG counts.
- `GET /api/prospects?action=ontology-density-by-state` — Per-state ontology density for National Map metric: entity count, relationship count, prospect count, density (relationships/prospects), layer breakdown. Includes `_totals` key.

#### Rebuild Workflow
1. Run SQL migration in Neon console (one-time): `scripts/create-ontology-tables.sql`
2. Deploy code changes
3. `POST /api/prospects?action=rebuild-ontology-layer1` to populate the graph (or let auto-triggers handle it)

#### Auto-Trigger Behavior
Layer 1 ontology auto-rebuilds on data changes — the ontology never silently goes stale:
- **Bulk import** (`POST ?action=import`): Full `rebuildOntologyLayer1(sql)` after upsert loop. Adds `ontology` field to response.
- **Single create** (`POST /api/prospects`): Per-prospect `rebuildOntologyForProspect(sql, id)` after insert. Adds `ontology` field to response.
- **PATCH** (`PATCH ?id=X`): Conditional per-prospect rebuild only when body contains ontology-relevant fields: `key_certifications`, `rjg_cavity_pressure`, `medical_device_mfg`, `ownership_type`, `parent_company`, `category`, `in_house_tooling`. Editing `outreach_group`, `notes`, etc. does NOT trigger rebuild.

All rebuild calls are **awaited before response** — fire-and-forget is unsafe on Vercel serverless (execution context freezes after `res.end()`). Per-prospect rebuild deletes only Layer 1 relationships (never entities, never Layer 2 data) to avoid CASCADE danger on shared entities like "ISO 9001".

The manual endpoint `POST ?action=rebuild-ontology-layer1` still works — it calls the same extracted `rebuildOntologyLayer1(sql)` function.

#### UI: OntologySummary Component
- `src/components/national-map/OntologySummary.jsx` — Displays in StateDetailPanel when a state is clicked
- Shows certification landscape (horizontal bars), technology signals (badges), ownership mix (list), medical/RJG stat cards
- Fetches data via `ontology-state-summary` endpoint
- Includes InfoTooltip on all section headers

#### Layer 2 Ontology Extraction (Phase 5)

**Manual workflow** for extracting entities and relationships from research brief narrative text:

1. Open a prospect with a saved research brief in ProspectDetail
2. Click "Extract Ontology" in the brief metadata row → ExtractionPromptModal opens
3. Modal fetches the extraction template from `/prompts/ontology-extraction-template.md`, injects prospect data + brief content + existing entities (for deduplication), displays assembled prompt
4. User copies prompt to clipboard, runs in a separate Claude session (web search off)
5. Claude returns structured JSON with entities + relationships
6. User clicks "Import Extraction" → ImportOntologyModal opens
7. Paste JSON → "Parse & Preview" shows entities/relationships tables with confidence levels
8. "Import" saves Layer 2 data to the same ontology tables (layer = 2)

**Extraction Template**: `public/prompts/ontology-extraction-template.md`
- Variables: `{{company}}`, `{{id}}`, `{{category}}`, `{{state}}`, `{{source_report}}`, `{{brief_content}}`, `{{existing_entities}}`
- This is a technical utility template (iterable), unlike the sacred deep research template

**UI Components**:
- `ResearchBriefPanel.jsx` — "Extract Ontology" and "Import Extraction" buttons in metadata row (only visible when a brief exists)
- `ExtractionPromptModal.jsx` — Follows ResearchPromptModal pattern: fetch template, inject variables, copy to clipboard, word count
- `ImportOntologyModal.jsx` — Two-step: paste JSON → preview & confirm → save. Validates JSON structure, entity types, relationship types before import.

**API Endpoints** (both in `api/prospects.js`):
- `GET /api/prospects?action=ontology-existing-entities` — All entities grouped by type name (for deduplication in extraction prompt)
- `POST /api/prospects?action=import-ontology-extraction` — Import extracted JSON. Body: `{ prospect_id, entities[], relationships[] }`. UPSERTs entities (ON CONFLICT updates timestamp), inserts relationships (ON CONFLICT DO NOTHING). Returns `{ entities_created, entities_updated, relationships_created, relationships_skipped }`.

**Layer 2 coexistence with Layer 1**: Same ontology tables, distinguished by `layer` column (1 vs 2). Layer 1 rebuild does NOT delete Layer 2 data. Entity UPSERT uses `GREATEST(layer, 2)` to preserve the higher layer marker. Relationships use DO NOTHING on conflict so Layer 1 and Layer 2 don't create duplicates.

**Entity types extracted by Layer 2**: Technology / Software, Equipment Brand, Quality Method, Material, Market Vertical, Manufacturing Process, Workforce Capability, Company (acquirers/partners)

#### Phase Roadmap
- **Phase 6 (complete):** Ontology Density as 6th National Map metric. `ontology-density-by-state` endpoint returns per-state density (relationships/prospects), layer breakdown, entity/relationship counts. Data fetched in parallel on mount and merged into stateData. OntologySummary enhanced with Layer 1 vs Layer 2 breakdown bar and entity type distribution mini-bars.

### Knowledge Graph (Phase 7 — Active)

Interactive force-directed graph visualization of the ontology. Top-level tab at `/#knowledge-graph` with query panel and graph explorer.

**Dependencies:** `d3` (force simulation, zoom, drag)

#### Components
- **Directory:** `src/components/ontology/`
- **KnowledgeGraph.jsx** — Page component. Fetches `ontology-graph` on mount, manages view mode (Query+Graph / Full Graph / Query Only), state filter, and query highlight state. Passes graph data to both QueryPanel (for filter options) and GraphExplorer (for rendering). Route: `/#knowledge-graph`.
- **QueryPanel.jsx** — Left-panel query builder. Filter sections (Certifications, Technologies, Markets, Equipment, Ownership, Quality Methods) with toggleable chips derived from graph super-nodes. State filter dropdown. Calls `ontology-query` on search, passes matched company IDs up for graph highlighting. Includes "Find Similar" via `ontology-similar`. "Clear all" button resets chips + state filter + results (visible when any filter is active).
- **QueryResults.jsx** — Result cards within QueryPanel. Shows company name, location, match score, matched edges as tags. "Find similar companies" button per card. Similar results sub-view with back navigation.
- **GraphExplorer.jsx** — Wraps ForceGraph with expand/collapse state. Click super-node → fetch `ontology-neighborhood` → show expanded view with "Back to overview" button. Entity type filter chips and search input in toolbar. Auto-sizes to container via ResizeObserver. Legend bar at bottom.
- **ForceGraph.jsx** — Shared reusable D3 force-directed graph component. React owns a container div, D3 renders into a ref'd SVG. Props: `nodes`, `links`, `onNodeClick`, `onBackgroundClick`, `highlightNodeIds` (Set), `width`, `height`, `compact` (boolean). Does NOT fetch data.
  - Exports `ENTITY_COLORS` constant mapping entity types to hex colors
  - Super-node radius: `Math.max(16, Math.min(42, 10 + Math.sqrt(count) * 3.2))`
  - Company node radius: fixed 10
  - Supports zoom (d3.zoom, scaleExtent [0.3, 4]) and drag (d3.drag)
  - Highlight: dims non-highlighted nodes/links to opacity 0.1
  - **Compact mode** (`compact=true`): Smaller node radii (30% reduction), tighter force params, 8px labels (vs 10px), no count text in super-nodes, tighter zoom [0.6, 2]. Center node (`isCenter=true`) gets amber stroke highlight.
- **NeighborhoodPanel.jsx** — Compact neighborhood graph for ProspectDetail. Embedded after Research Brief section. Resolves prospect → ontology entity_id via multi-step lookup (ontology-similar → ontology-graph → probe neighborhood → company neighborhood). Shows company's 1-hop ontology connections in a compact ForceGraph (280px height). Caps at 15 visible nodes with overflow indicator. Clicking non-center nodes shows entity detail line below graph. "View in Knowledge Graph" link navigates to `#knowledge-graph?company={entityId}`. Handles empty/loading/error states.

#### View Modes
- **Query + Graph**: Split layout — 340px query panel + flexible graph area
- **Full Graph**: Graph only, query panel hidden via CSS `display:none` (NOT unmounted — preserves D3 state)
- **Query Only** (default): Query panel full width, graph hidden — optimized for Brett's criteria-based workflow

#### Query Flow
1. Filter options derived from graph super-nodes (no extra API call)
2. User selects chips (AND across sections, OR within)
3. "Find Companies" calls `ontology-query` → results in QueryResults
4. Matched company IDs passed to GraphExplorer as `highlightNodeIds`
5. "Find Similar" on result card calls `ontology-similar` → inline sub-view

#### API Endpoints (all in `api/prospects.js`)
- `GET /api/prospects?action=ontology-graph` — Aggregated super-node view. Each non-Company entity becomes a super-node with `count` (connected companies) and `memberIds[]`. Inter-node links computed by shared company overlap (strength ≥ 0.1). Optional `state` and `type` filters. Response: `{ nodes, links, meta }`.
- `GET /api/prospects?action=ontology-neighborhood` — 1-hop (or 2-hop) neighborhood around a specific entity. Required: `entity_id`. Optional: `depth` (1-2), `state` (2-letter abbreviation — filters Company nodes to that state only, non-Company entities always included). Response: `{ nodes, links, meta }` with `isSuper: false`.
- `GET /api/prospects?action=ontology-query` — Find companies matching ontology criteria. AND across categories, OR within. Params: `certifications`, `technologies`, `markets`, `ownership`, `equipment`, `state`. Response: `{ results[], meta }` with matchScore.
- `GET /api/prospects?action=ontology-similar` — Find companies sharing the most ontology edges with a target. Required: `prospect_id`. Optional: `limit` (default 10). Response: `{ target, similar[] }` with similarity scores.

#### Cross-Navigation (Session 3)
- **ProspectDetail → Knowledge Graph**: NeighborhoodPanel "View in Knowledge Graph" navigates to `#knowledge-graph?company={entityId}`
- **KnowledgeGraph.jsx** reads `?company=` hash param on mount, passes `initialCompanyId` to GraphExplorer, which auto-expands the company's neighborhood
- **Hash param routing**: `App.jsx` `getViewFromHash()` strips query params before matching against `VALID_VIEWS`, so `#knowledge-graph?company=123` correctly routes to the knowledge-graph view
- **D3/React pattern**: React owns the container div, D3 renders into a ref'd SVG inside a `useEffect`. D3 handles all mutations (nodes, links, zoom, drag). React re-runs the effect when props change. Never mix React DOM and D3 DOM on the same elements.

#### Entity Color Mapping (shared constant in ForceGraph.jsx)
| Entity Type | Color |
|-------------|-------|
| Company | `#041E42` (navy) |
| Certification | `#1D9E75` (green) |
| Technology / Software | `#D85A30` (orange) |
| Market Vertical | `#D4537E` (pink) |
| Ownership Structure | `#BA7517` (gold) |
| Equipment Brand | `#639922` (olive) |
| Quality Method | `#534AB7` (purple) |

#### Visual Redesign (Session 8)

**Light background**: SVG background is `transparent` (container is white). Node strokes: `#D1D5DB`, label fill: `#6B7280`, link stroke: `#CBD5E1` at 0.3 opacity. Container border: `border-gray-200`. Compact mode center node retains amber (`#F59E0B`) stroke.

**Value-chain zone layout** (non-compact mode only): Entity types get horizontal zone targets via `forceX` that mirror the injection molding value chain. Defined in `ZONE_X` constant in ForceGraph.jsx:
- **Left zone (x: 0.18-0.25):** Equipment Brand, Manufacturing Process, Material, Workforce Capability — design & tooling inputs
- **Center zone (x: 0.50):** Company nodes — the connective tissue
- **Bridge zone (x: 0.58-0.62):** Technology / Software, Ownership Structure — bridge production to compliance
- **Right zone (x: 0.78-0.82):** Certification, Market Vertical, Quality Method — outputs & compliance

`forceX` strength: 0.10 (gentle zones, not rigid). `forceY` uses connection count: highly-connected nodes (count>20) drift to 0.35*height, medium (>5) to 0.45, low to 0.55. `forceY` strength: 0.04 (very gentle vertical nudge). Compact mode (`NeighborhoodPanel`) is exempt — uses `forceCenter` instead.

**Fit-to-view**: `simulation.on('end', ...)` computes bounding box of all nodes and applies a d3.zoom transform to fit content with padding. Capped at 1.5x zoom. Prevents the "tiny cluster in a corner" problem.

**Hover-to-highlight**: Mouseover a node dims unconnected nodes to 0.12 opacity and unconnected links to 0.03. Mouseout restores. Disabled when `highlightNodeIds` is active (query results take priority). Does not interfere with click behavior.

**Super-node threshold gate**: Super-nodes with >25 members are NOT expanded on click when no state filter is active. Instead, `GraphExplorer` shows an amber toast message ("X has N companies — use Query Panel to explore", auto-dismisses after 4s) and fires `onLargeNodeClick` which switches `KnowledgeGraph` to split view (showing QueryPanel). When a state filter IS active, the threshold gate is bypassed — the state filter on the `ontology-neighborhood` endpoint keeps results manageable. Nodes with <=25 members always expand normally via neighborhood fetch. Threshold constant: `25` in `GraphExplorer.jsx`.

**Sparse node filtering**: Super-nodes with <5 connections hidden by default in overview. Toggle "Show all (N hidden)" / "Hide sparse" in GraphExplorer toolbar. Only applies to overview (not expanded neighborhoods). Threshold constant: `SPARSE_THRESHOLD = 5` in `GraphExplorer.jsx`.

### Shared Components

- **`src/components/shared/ReportMarkdownRenderer.jsx`** — Custom ReactMarkdown wrapper with `remark-gfm` plugin for GFM table support and component overrides for research report formatting. Detects numbered company entries (`N. **CompanyName**`) and renders company names at header size with indented data fields below. Pipe-delimited markdown tables render as styled HTML tables (borders, padding, header background). All links open in a new tab (`target="_blank"`) to avoid navigating away from the dashboard. Used by both `StateReportModal` (state reports) and `ResearchBriefPanel` (company briefs) for consistent formatting. `UploadStateReportModal` preview also uses `target="_blank"` links.

### Category Parent-Group Filtering
The database has 65+ distinct `category` values. The filter system collapses these into ~12 parent groups using prefix-matching rules.

- **Shared utility**: `src/utils/categoryGroups.js` — source of truth for `CATEGORY_PARENT_RULES`, `getParentCategory()`, and `PARENT_CATEGORY_OPTIONS`
- **SYNC requirement**: `api/prospects.js` duplicates `CATEGORY_PARENT_RULES` and `buildCategoryCondition()` because Vercel serverless can't import from `src/`. Both files have `// SYNC` comments — keep them in sync when adding new rules.
- **Filter behavior**: Category dropdown shows parent groups (not raw values). Selecting "Converter" matches all Converter variants (376+ companies). Raw category values still display in the table.
- **Medical Molders preset**: Checks parent group membership — includes Converter, Converter + In-House Tooling, and Mold Maker + Converter companies with `medical_device_mfg = 'Yes'`
- **Chart click-to-filter**: `CategoryBreakdown.jsx` sends parent group name (not largest child) on bar click
- **Key constraint**: "Converter + In-House Tooling" and "Mold Maker + Converter" are intentionally separate parent groups — do NOT merge them
- **SQL overlap handling**: `buildCategoryCondition()` in `api/prospects.js` adds NOT LIKE exclusions for cross-group prefix overlaps (e.g., `LIKE 'Converter%' AND NOT LIKE 'Converter + In-House Tooling%'`)
- Seed data in `api/prospects.js` and `scripts/seed-prospects.js` still references old category values — these are for initial seeding only, not runtime

## Notes

- **Database health indicator removed from header.** `/api/health` endpoint still exists but is not called on page load.
- **No local dev environment.** Kyle does NOT have a local clone of this repo. All development happens via Claude Code (cloud). Never suggest running commands locally, running scripts on Kyle's machine, or ask him to open a terminal. If a script needs to run (e.g., database migrations, setup scripts), run it directly in this environment or provide a way to execute it through the deployed app/API.
- This is a small team tool (4 users), optimize for simplicity over scale
- Mobile-friendly but desktop-primary usage expected
- Focus on visibility and reducing dropped balls in the pipeline
- **Tab routing uses hash-based navigation** (`window.location.hash`). URLs: `/#prospects`, `/#pipeline`, `/#national-map`, `/#knowledge-graph`. `VALID_VIEWS` array in App.jsx defines allowed values; default is `pipeline`. Refresh preserves the active tab, and browser back/forward navigates between tabs. `/#analytics` falls back to `pipeline`. Prospect detail deep-linking: `/#prospects?id=123` opens the prospects tab with that prospect's modal open. Uses `replaceState` (not `pushState`) for selection changes to avoid polluting browser history.
- **Analytics tab is hidden** (not deleted). Component files (`src/components/AnalyticsDashboard.jsx`, `src/components/analytics/`) are preserved for future resurrection when pipeline has active opportunities. The tab button was removed from Header and the routing branch from App.
- **All nav tabs have Lucide icons**: Prospects (`Building2`), Pipeline (`Kanban`), National Map (`Map`), Knowledge Graph (`Share2`). Same `w-4 h-4` sizing with `flex items-center gap-1.5` pattern.
