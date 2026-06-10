-- Bundle B schema additions (QA audit E7 + E4). The API self-ensures these
-- (see ensureProspectSchemaAdditions in api/prospects.js), so running this by
-- hand is OPTIONAL — it exists for schema reproducibility (audit finding C2).
-- Safe to run repeatedly (IF NOT EXISTS throughout).

-- E7: append-only prospect status history, mirroring the pipeline's
-- stage_transitions. Enables "outreach-ready inventory over time" trends.
CREATE TABLE IF NOT EXISTS prospect_status_transitions (
  id SERIAL PRIMARY KEY,
  prospect_id INTEGER NOT NULL REFERENCES prospect_companies(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  transitioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  transitioned_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_status_transitions_prospect ON prospect_status_transitions(prospect_id);
CREATE INDEX IF NOT EXISTS idx_status_transitions_at ON prospect_status_transitions(transitioned_at);

-- E4: structured M&A date so the 6-18 month post-acquisition PE window can be
-- computed ("window closes in N months") instead of read out of recent_ma
-- free text.
ALTER TABLE prospect_companies ADD COLUMN IF NOT EXISTS ma_date DATE;
