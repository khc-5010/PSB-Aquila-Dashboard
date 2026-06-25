-- Pipeline Activation migration (run once in the Neon SQL Editor)
--
-- Adds the two opportunity columns and teaches the `stage` ENUM the two new
-- front stages ('on_deck', 'outreach'). api/opportunities.js also self-heals
-- both at runtime (ensureOpportunitySchema), so this script is mainly for
-- reproducibility / immediate application without waiting for a redeploy.

-- 1. New columns (idempotent)
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS lead_type TEXT;   -- 'client' | 'partner'
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS waiting_on TEXT;  -- 'us' | 'them'

-- 2. Add the new stages to whatever ENUM type backs the stage columns.
--    `stage` is a Postgres enum (not a CHECK), so new values must be added to
--    the type or INSERT/UPDATE with the new stages raises
--    "invalid input value for enum stage". ADD VALUE IF NOT EXISTS is idempotent.
--    On PG 12+ this is allowed inside a DO block as long as the value isn't used
--    in the same transaction (it isn't here). No-op if stage is a text column.
DO $$
DECLARE
  tn text;
BEGIN
  FOR tn IN
    SELECT DISTINCT t.typname
    FROM pg_type t
    JOIN pg_attribute a ON a.atttypid = t.oid
    JOIN pg_class c ON c.oid = a.attrelid
    WHERE t.typtype = 'e'
      AND (
        (c.relname = 'opportunities' AND a.attname = 'stage')
        OR (c.relname = 'stage_transitions' AND a.attname IN ('from_stage', 'to_stage'))
      )
  LOOP
    EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', tn, 'on_deck');
    EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', tn, 'outreach');
    RAISE NOTICE 'Added on_deck/outreach to enum type %', tn;
  END LOOP;
END $$;

-- 3. project_type is ALSO a Postgres enum, and its value list drifted from the
--    app: it still carries legacy values ('research', 'senior_design', …) while
--    the app writes display values ('Pilot Project', …). Add the current display
--    values so promoting a client with a project type doesn't raise
--    "invalid input value for enum project_type". Idempotent. No-op if text.
DO $$
DECLARE
  tn text;
  v  text;
BEGIN
  SELECT t.typname INTO tn
  FROM pg_type t
  JOIN pg_attribute a ON a.atttypid = t.oid
  JOIN pg_class c ON c.oid = a.attrelid
  WHERE t.typtype = 'e' AND c.relname = 'opportunities' AND a.attname = 'project_type'
  LIMIT 1;

  IF tn IS NOT NULL THEN
    FOREACH v IN ARRAY ARRAY['Pilot Project', 'Research Agreement', 'Senior Design', 'Strategic Membership']
    LOOP
      EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', tn, v);
    END LOOP;
    RAISE NOTICE 'Added current project types to enum type %', tn;
  END IF;
END $$;
