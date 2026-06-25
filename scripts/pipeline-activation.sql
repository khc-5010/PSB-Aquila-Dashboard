-- Pipeline Activation migration (run once in the Neon SQL Editor)
--
-- api/opportunities.js self-heals all of this on deploy (ensureOpportunitySchema:
-- add columns → ensureEnumValues → convertEnumColumnsToText), so this script is
-- mainly for reproducibility / immediate application without waiting for a redeploy.

-- 1. New columns (idempotent)
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS lead_type TEXT;   -- 'client' | 'partner'
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS waiting_on TEXT;  -- 'us' | 'them'

-- 2. Durable fix: convert the legacy enum columns to TEXT.
--    `stage` and `project_type` (and possibly `outcome`) were Postgres enums whose
--    value lists drifted from the app, causing "invalid input value for enum ...".
--    Converting to TEXT (the convention used by lead_type/waiting_on) ends that
--    class of bug; the app validates these via VALID_STAGES + its dropdowns.
--    ALTER TABLE ... ALTER COLUMN TYPE is fully transactional (no ADD VALUE caveat).
--    Guarded per column; a no-op if already text. DROP DEFAULT first so an enum
--    default doesn't block the cast; the stage default is restored in step 3.
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE data_type = 'USER-DEFINED'
      AND (
        (table_name = 'opportunities' AND column_name IN ('stage', 'project_type', 'outcome'))
        OR (table_name = 'stage_transitions' AND column_name IN ('from_stage', 'to_stage'))
      )
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP DEFAULT', rec.table_name, rec.column_name);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE TEXT USING %I::text',
                   rec.table_name, rec.column_name, rec.column_name);
    RAISE NOTICE 'Converted %.% to TEXT', rec.table_name, rec.column_name;
  END LOOP;
END $$;

-- 3. Restore a sensible default on the (now TEXT) stage column.
ALTER TABLE opportunities ALTER COLUMN stage SET DEFAULT 'on_deck';

-- The now-orphaned enum types are left in place (harmless). Drop them manually
-- later if desired, only once nothing references them.
