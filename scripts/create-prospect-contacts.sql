-- prospect_contacts (QA audit E5) — minimal structured contacts per prospect.
-- The API self-ensures this (see ensureProspectSchemaAdditions in
-- api/prospects.js), so running this by hand is OPTIONAL — it exists for
-- schema reproducibility (audit finding C2). Safe to run repeatedly.
--
-- This is the difference between a research database and the CRM the team
-- works deals from: person names previously lived only in free text
-- (notes, psb_connection_notes) and research-brief attachments. The
-- export-json payload fills its contacts[] arrays from this table
-- (schema_version 1.1).

CREATE TABLE IF NOT EXISTS prospect_contacts (
  id SERIAL PRIMARY KEY,
  prospect_id INTEGER NOT NULL REFERENCES prospect_companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  source TEXT,
  last_contacted DATE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prospect_contacts_prospect ON prospect_contacts(prospect_id);
