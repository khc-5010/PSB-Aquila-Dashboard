-- Captures the source_prospect_id migration that previously ran as an
-- ALTER TABLE on every /api/opportunities request (now removed from the
-- hot path). Already applied to the production Neon database — kept here
-- so a fresh environment can be rebuilt from scripts/.

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS source_prospect_id INTEGER REFERENCES prospect_companies(id);
