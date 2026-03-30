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
│   │   └── ConvertToOpportunityModal.jsx  # Promote prospect → pipeline opportunity
│   ├── opportunities/   # Detail panel, forms, stakeholder alerts
│   └── layout/          # Header, sidebar, navigation
├── hooks/               # Custom React hooks
├── lib/
│   ├── db.js            # Database connection and queries
│   ├── api.js           # API client functions
│   └── utils.js         # Helper functions
├── pages/               # Route-level components
├── context/             # React context providers
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

- **`sessions`** - Active login sessions (persist until logout)
  - `id` (TEXT, PK — random UUID token), `user_id` (FK), `created_at`

### Prospect Tables

- **`prospect_companies`** - 179-company prospect database for alliance outreach
  - `id` (SERIAL, PK)
  - Core: `company`, `also_known_as`, `website`, `category`, `in_house_tooling`, `city`, `state`, `geography_tier`, `source_report`, `priority`
  - Metrics: `employees_approx`, `year_founded`, `years_in_business`, `revenue_known`, `revenue_est_m`, `press_count`
  - Signals: `signal_count`, `top_signal`, `rjg_cavity_pressure`, `medical_device_mfg`, `key_certifications`
  - Relationships: `ownership_type`, `recent_ma`, `cwp_contacts`, `psb_connection_notes`
  - Planning: `engagement_type`, `suggested_next_step`, `legacy_data_potential`, `notes`
  - Dashboard-managed (editable): `outreach_group`, `outreach_rank`, `group_notes`, `last_edited_by`
  - Status: `prospect_status` — Identified, Prioritized, Research Complete, Outreach Ready, Converted, Nurture
  - Timestamps: `created_at`, `updated_at`

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
- `DELETE /api/prospects?action=delete-attachment&attachmentId=X` — Delete attachment

### Frontend Components
- `ProspectTable` — Main sortable table with inline-editable rank and outreach group columns, plus status badges
- `ProspectFilters` — Filter bar with preset buttons (Group 1, Group 2, Time-Sensitive, Medical Molders, Converter+Tooling, Tier 1 Local, Warm Leads, Ready for Research) + dropdown filters for group, category, priority, geography, and status
- `ProspectDetail` — Right slide-out panel (follows OpportunityDetail pattern) with all fields in sections; status and outreach group are editable
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

### CWP Warm Lead Visuals
- **CWP heat thresholds**: 0=gray, 1-4=amber, 5-9=warm badge (amber bg), 10-19=hot (orange bg), 20+=very hot (red bg)
- Companies with CWP >= 5 show a colored dot next to company name in the table
- `warm_leads` preset filter: shows only companies with `cwp_contacts >= 5`
- ProspectDetail "PSB Relationship" section auto-opens when `cwp_contacts >= 5` and shows a warmth indicator banner

### Export Functionality
- Client-side CSV generation from the in-memory prospects array (no API call)
- Two options: "Export filtered" (respects current filters) and "Export all" (full dataset)
- Export button in the sub-view toggle header area of ProspectTable

### Sub-View Toggle Pattern
The Prospects tab uses a Table/Charts sub-view toggle within the view (not a separate top-level tab). Charts respect the same filter state as the table — when Brett filters to "Medical Molders in Tier 1," the charts reflect that filtered dataset. Clicking chart elements (group cards, category bars, geography segments) updates the shared filter state, affecting both table and chart views.

### Research Workflow & Attachments
- **Deep research prompt template** lives at `public/prompts/deep-research-template.md` with `{{variable}}` placeholders injected from prospect data at render time
- **ResearchPromptModal** (`src/components/prospects/ResearchPromptModal.jsx`) — fetches template, injects prospect data, copies to clipboard
- **AttachResearchModal** (`src/components/prospects/AttachResearchModal.jsx`) — paste markdown, preview, save as attachment
- **ResearchBriefPanel** (`src/components/prospects/ResearchBriefPanel.jsx`) — renders saved research brief as collapsible accordion sections, parsed by `## ` headers
- **Attachment API routes** (all in `api/prospects.js`):
  - `GET ?action=attachments&id=X` — list attachments for a prospect
  - `POST ?action=attach` — create attachment (body: `{ prospect_id, attachment_type, title, content, created_by }`)
  - `DELETE ?action=delete-attachment&attachmentId=X` — remove attachment
- **Status auto-advancement**: Saving a `research_brief` attachment auto-sets `prospect_status` to `'Outreach Ready'` if current status is `Identified`, `Prioritized`, or `Research Complete`. Does NOT overwrite `Converted` or `Nurture`.
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
```

## Conventions

### API Route Consolidation (Vercel Hobby = 12 function limit)
- **One file per feature** in `api/`. Do NOT use nested directories for sub-routes.
- Route internally using HTTP method + `req.query` params (`?id=X`, `?action=import`)
- Current function count: **10** (target: ≤ 12, Vercel Hobby limit)
- Files: `health.js`, `opportunities.js`, `opportunities/[id].js`, `activities.js`, `analytics.js`, `stage-transitions.js`, `key-dates.js`, `meeting-minutes.js`, `prospects.js`, `auth.js`

## Notes

- **No local dev environment.** Kyle does NOT have a local clone of this repo. All development happens via Claude Code (cloud). Never suggest running commands locally, running scripts on Kyle's machine, or ask him to open a terminal. If a script needs to run (e.g., database migrations, setup scripts), run it directly in this environment or provide a way to execute it through the deployed app/API.
- This is a small team tool (4 users), optimize for simplicity over scale
- Mobile-friendly but desktop-primary usage expected
- Focus on visibility and reducing dropped balls in the pipeline
