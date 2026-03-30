-- Create prospect_companies table for PSB-Aquila Prospect Pipeline
-- Run this in the Neon console BEFORE using the prospect features

CREATE TABLE IF NOT EXISTS prospect_companies (
  id SERIAL PRIMARY KEY,

  -- Core company info (from Excel)
  company TEXT NOT NULL,
  also_known_as TEXT,
  website TEXT,
  category TEXT,              -- Converter+Tooling, Converter, Mold Maker, Hot Runner Systems, Knowledge Sector, Catalog/Standards, Strategic Partner
  in_house_tooling TEXT,      -- Yes, No, N/A
  city TEXT,
  state TEXT,
  geography_tier TEXT,        -- Tier 1, Tier 2, Infrastructure
  source_report TEXT,
  priority TEXT,              -- HIGH PRIORITY, QUALIFIED, WATCH, STRATEGIC PARTNER

  -- Company metrics
  employees_approx INTEGER,
  year_founded INTEGER,
  years_in_business INTEGER,
  revenue_known TEXT,
  revenue_est_m NUMERIC,
  press_count INTEGER,

  -- Signal data
  signal_count INTEGER,
  top_signal TEXT,
  rjg_cavity_pressure TEXT,   -- Yes (confirmed), Likely, Unknown
  medical_device_mfg TEXT,    -- Yes, No
  key_certifications TEXT,

  -- Relationship data
  ownership_type TEXT,
  recent_ma TEXT,
  cwp_contacts INTEGER,
  psb_connection_notes TEXT,

  -- Engagement planning (from Excel)
  engagement_type TEXT,
  suggested_next_step TEXT,
  legacy_data_potential TEXT,
  notes TEXT,

  -- Dashboard-managed fields (editable by Brett/team)
  outreach_group TEXT DEFAULT 'Unassigned',  -- Group 1, Group 2, Infrastructure, Time-Sensitive, Unassigned
  outreach_rank INTEGER,                      -- Manual priority: 1, 2, 3...
  group_notes TEXT,                           -- Notes specific to prioritization decisions
  last_edited_by TEXT,                        -- Track who changed what

  -- Prospect lifecycle status
  prospect_status TEXT DEFAULT 'Identified',  -- Identified, Prioritized, Research Complete, Outreach Ready, Converted, Nurture

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common filter/sort operations
CREATE INDEX IF NOT EXISTS idx_prospect_category ON prospect_companies(category);
CREATE INDEX IF NOT EXISTS idx_prospect_priority ON prospect_companies(priority);
CREATE INDEX IF NOT EXISTS idx_prospect_geography ON prospect_companies(geography_tier);
CREATE INDEX IF NOT EXISTS idx_prospect_group ON prospect_companies(outreach_group);
CREATE INDEX IF NOT EXISTS idx_prospect_rank ON prospect_companies(outreach_rank);
CREATE INDEX IF NOT EXISTS idx_prospect_medical ON prospect_companies(medical_device_mfg);
CREATE INDEX IF NOT EXISTS idx_prospect_status ON prospect_companies(prospect_status);
