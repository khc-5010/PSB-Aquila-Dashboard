-- Thread 1: typed parent/FKA model — Phase 1 schema migration
-- Run this in the Neon SQL Editor BEFORE deploying the api/prospects.js changes.
-- Additive only. Does not drop or rename parent_company / also_known_as.
--
-- New columns on prospect_companies:
--   parent_relationship_kind  TEXT     enum-like: 'subsidiary' | 'absorbed_into' | 'sister_company' | NULL.
--                                       No CHECK constraint — UI dropdown governs valid values.
--   financial_sponsor         TEXT     PE / holding owner, separated from the operational parent.
--                                       Lets parent_company stop carrying ~200 PE strings (Crestview, Apollo, ...).
--   former_names              TEXT[]   Multi-entry FKA list. Import delimiter is pipe '|' (commas and slashes
--                                       are too common inside company names).
--
-- During the transition, parent_company and also_known_as are KEPT. Phase 3 will change how the UI
-- interprets them (GitMerge driven by parent_relationship_kind, not positional isChild). Deprecation
-- of the legacy columns is a later cleanup pass.

ALTER TABLE prospect_companies
  ADD COLUMN IF NOT EXISTS parent_relationship_kind TEXT,
  ADD COLUMN IF NOT EXISTS financial_sponsor        TEXT,
  ADD COLUMN IF NOT EXISTS former_names             TEXT[];

CREATE INDEX IF NOT EXISTS idx_prospect_parent_relationship_kind
  ON prospect_companies(parent_relationship_kind);

CREATE INDEX IF NOT EXISTS idx_prospect_financial_sponsor
  ON prospect_companies(financial_sponsor);

-- Verification query (one JSON cell): confirms columns exist with expected types and counts are zero.
-- Paste the result back to Claude after running this migration.
--
-- SELECT json_build_object(
--   'columns', (SELECT json_agg(json_build_object('c', column_name, 't', data_type) ORDER BY column_name)
--               FROM information_schema.columns
--               WHERE table_name = 'prospect_companies'
--                 AND column_name IN ('parent_relationship_kind','financial_sponsor','former_names')),
--   'populated_counts', (SELECT json_build_object(
--       'kind',     COUNT(*) FILTER (WHERE parent_relationship_kind IS NOT NULL),
--       'sponsor',  COUNT(*) FILTER (WHERE financial_sponsor IS NOT NULL),
--       'former',   COUNT(*) FILTER (WHERE former_names IS NOT NULL AND array_length(former_names, 1) > 0)
--     ) FROM prospect_companies)
-- ) AS result;
