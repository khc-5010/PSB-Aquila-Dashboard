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
│   ├── prospects/       # Prospect pipeline table, detail panel, filters, wave badges
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

### Pipeline Stages

1. **Lead** - Initial contact or interest identified
2. **Qualified** - Confirmed fit, scope being discussed
3. **Proposal** - Formal proposal submitted
4. **Negotiation** - Contract/terms being finalized
5. **Active** - Project in progress
6. **Complete** - Project delivered (archive)

### Project Types & Stakeholder Routing

| Project Type | Primary PSB Contact | Notes |
|--------------|---------------------|-------|
| **Research Agreement** | Alicyn Rhoades (VC Research), Jennifer Surrena (contracts) | 4-6 week processing time |
| **Senior Design / Capstone** | Dean Lewis (dal16@psu.edu) | **Aug 15 deadline** for fall semester |
| **Consulting Engagement** | Aquila-led | Amy Bridger for partnership structure |
| **Workforce Training** | TBD | Program-specific routing |
| **Alliance Membership** | Amy Bridger | Revenue model discussions |
| **Does Not Fit** | N/A | Archive with reason |

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
  - `stage` - Pipeline stage (lead, qualified, proposal, negotiation, active, complete)
  - `owner` - Assigned team member (Kyle, Duane, Steve)
  - `estimated_value` - Estimated deal value
  - `source` - Lead source
  - `psb_relationship` - Existing PSB relationship
  - `next_action` - Next action to take
  - `outcome` - Deal outcome (won, lost, abandoned) - set when closed
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

### Prospect Tables

- **`prospect_companies`** - 179-company prospect database for alliance outreach
  - `id` (SERIAL, PK)
  - Core: `company`, `also_known_as`, `website`, `category`, `in_house_tooling`, `city`, `state`, `geography_tier`, `source_report`, `priority`
  - Metrics: `employees_approx`, `year_founded`, `years_in_business`, `revenue_known`, `revenue_est_m`, `press_count`
  - Signals: `signal_count`, `top_signal`, `rjg_cavity_pressure`, `medical_device_mfg`, `key_certifications`
  - Relationships: `ownership_type`, `recent_ma`, `cwp_contacts`, `psb_connection_notes`
  - Planning: `engagement_type`, `suggested_next_step`, `legacy_data_potential`, `notes`
  - Dashboard-managed (editable): `engagement_wave`, `outreach_rank`, `wave_notes`, `last_edited_by`
  - Timestamps: `created_at`, `updated_at`

## Prospect Pipeline Architecture

### API Routes
- `GET/POST /api/prospects` — List all (with optional query param filters), create new
- `GET/PATCH /api/prospects/[id]` — Get single, update fields
- `POST /api/prospects/import` — Upsert from Excel. Keys on company name (case-insensitive). Updates research columns but **preserves** user-edited fields (`engagement_wave`, `outreach_rank`, `wave_notes`, `last_edited_by`)

### Frontend Components
- `ProspectTable` — Main sortable table with inline-editable rank and wave columns
- `ProspectFilters` — Filter bar with preset buttons (Wave 1, Wave 2, Time-Sensitive, Medical Molders, Converter+Tooling, Tier 1 Local)
- `ProspectDetail` — Right slide-out panel (follows OpportunityDetail pattern) with all 29 fields in sections
- `WaveBadge` — Colored badge: Wave 1=green, Wave 2=blue, Time-Sensitive=amber, Infrastructure=purple, Unassigned=gray

### Wave Pre-Assignments
Wave 1 (ranked 1-5): Matrix Tool, X-Cell Tool & Mold, C&J Industries, Automation Plastics Corp, Erie Molded Plastics
Time-Sensitive: Currier Plastics (PE acquisition), Allegheny Performance Plastics (PE acquisition)
Wave 2: Venture Plastics, Ferriot Inc., Accudyn Products, Caplugs/Protective Industries, TTMP/PRISM Plastics, Adler Industrial Solutions, Essentra Components
Infrastructure: RJG Inc., DME Company, Husky Technologies, Mold-Masters, Beaumont Technologies

### Seed/Import
- SQL migration: `scripts/create-prospect-table.sql`
- Seed script: `scripts/seed-prospects.js` (reads Excel if available, otherwise seeds known companies)
- Excel dependency: `xlsx` (SheetJS) package

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

## Notes

- This is a small team tool (4 users), optimize for simplicity over scale
- Mobile-friendly but desktop-primary usage expected
- Focus on visibility and reducing dropped balls in the pipeline
