-- Pipeline Activation migration (run once in the Neon SQL Editor)
--
-- Adds the two opportunity columns backing the feature and removes any CHECK
-- constraint on `stage` so the two new front stages ('on_deck', 'outreach')
-- are accepted. The columns are also self-ensured at runtime by
-- ensureOpportunitySchema() in api/opportunities.js, so this script is mainly
-- here for reproducibility and to handle the constraint case the app won't.

-- 1. New columns (idempotent)
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS lead_type TEXT;   -- 'client' | 'partner'
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS waiting_on TEXT;  -- 'us' | 'them'

-- 2. Drop any CHECK constraint that references `stage` (stage values are
--    validated in app code via VALID_STAGES; a DB CHECK would reject the new
--    stages). No-op if none exists.
DO $$
DECLARE
  c text;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'opportunities'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%stage%'
  LIMIT 1;

  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE opportunities DROP CONSTRAINT %I', c);
    RAISE NOTICE 'Dropped stage CHECK constraint: %', c;
  ELSE
    RAISE NOTICE 'No stage CHECK constraint found — nothing to drop.';
  END IF;
END $$;
