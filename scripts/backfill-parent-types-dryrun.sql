-- Thread 1: backfill candidates for typed parent/FKA model — Phase 2 dryrun (READ-ONLY)
-- Mirrors the JS heuristic in api/prospects.js (?action=backfill-parent-types-dryrun).
-- Returns ONE JSON cell with shape { summary, candidates } — no writes.
--
-- USAGE
--   1. Run scripts/add-parent-type-columns.sql first (migration).
--   2. Run this query in the Neon SQL Editor.
--   3. Copy the result JSON; save to docs/diagnostics/parent-type-backfill-candidates.json.
--   4. Review the candidates manually before applying any of them via
--      POST /api/prospects?action=apply-parent-type-classifications.

WITH all_rows AS (
  SELECT id, company, parent_company, also_known_as, ownership_type, recent_ma
  FROM prospect_companies
),
child_counts AS (
  SELECT LOWER(TRIM(parent_company)) AS pnorm, COUNT(*)::int AS cnt
  FROM all_rows
  WHERE parent_company IS NOT NULL AND parent_company <> ''
  GROUP BY LOWER(TRIM(parent_company))
),
company_set AS (
  SELECT DISTINCT LOWER(TRIM(company)) AS cnorm FROM all_rows
),
-- Per-row PE classification. \m / \M are POSIX word-boundary anchors (Postgres-flavored \b).
classified AS (
  SELECT
    r.id, r.company, r.parent_company, r.also_known_as, r.ownership_type, r.recent_ma,
    cc.cnt AS parent_child_count,
    CASE
      WHEN r.parent_company IS NULL OR TRIM(r.parent_company) = '' THEN NULL
      WHEN TRIM(r.parent_company) ~* '^(Group|Holdings|Inc\.?|Corp\.?|LLC|Ltd\.?)\s*$' THEN NULL
      WHEN r.parent_company ~* '\m(Capital|Private Equity|PE|LP|Fund|Investments?)\M' THEN 'pattern'
      WHEN r.parent_company ~* '(Partners|Equity)\s*$' THEN 'ending'
      ELSE NULL
    END AS pe_hit
  FROM all_rows r
  LEFT JOIN child_counts cc ON cc.pnorm = LOWER(TRIM(r.parent_company))
),
-- Mark rows that would land in category A so B/C can exclude them (matches JS `continue` flow).
classified_2 AS (
  SELECT
    c.*,
    (
      c.pe_hit = 'pattern'
      OR (c.pe_hit = 'ending' AND c.parent_child_count = 1)
    ) AS added_to_a
  FROM classified c
),
all_candidates AS (
  -- A) Financial sponsor extraction.
  SELECT
    id, company, 'financial_sponsor' AS category,
    json_build_object(
      'parent_company', parent_company,
      'also_known_as', also_known_as,
      'ownership_type', ownership_type
    ) AS current_val,
    json_build_object(
      'financial_sponsor', TRIM(parent_company),
      'parent_company', NULL
    ) AS suggested_val,
    CASE
      WHEN pe_hit = 'pattern' AND ownership_type ILIKE '%PE%' THEN 'high'
      WHEN pe_hit = 'pattern' THEN 'medium'
      WHEN pe_hit = 'ending' AND parent_child_count = 1 THEN 'medium'
    END AS confidence,
    CASE
      WHEN pe_hit = 'pattern' AND ownership_type ILIKE '%PE%'
        THEN 'parent_company matches PE pattern AND ownership_type contains PE'
      WHEN pe_hit = 'pattern'
        THEN 'parent_company matches PE pattern (no ownership_type corroboration)'
      WHEN pe_hit = 'ending' AND parent_child_count = 1
        THEN 'parent_company ends in Partners/Equity AND is singleton in parent landscape'
    END AS reason
  FROM classified_2
  WHERE added_to_a

  UNION ALL

  -- B) Absorbed-brand candidate (single-name aka, has parent, not PE-classified).
  SELECT
    id, company, 'absorbed_into' AS category,
    json_build_object(
      'parent_company', parent_company,
      'also_known_as', also_known_as,
      'recent_ma', recent_ma
    ) AS current_val,
    json_build_object(
      'parent_relationship_kind', 'absorbed_into',
      'former_names', json_build_array(TRIM(also_known_as))
    ) AS suggested_val,
    CASE
      WHEN recent_ma ~* '\m(acquired by|absorbed|merger|merged|bought by)\M' THEN 'high'
      ELSE 'medium'
    END AS confidence,
    CASE
      WHEN recent_ma ~* '\m(acquired by|absorbed|merger|merged|bought by)\M'
        THEN 'aka populated with single name AND recent_ma confirms acquisition'
      ELSE 'aka populated with single name (suggests former name); recent_ma not corroborating'
    END AS reason
  FROM classified_2
  WHERE also_known_as IS NOT NULL AND also_known_as <> ''
    AND parent_company IS NOT NULL AND parent_company <> ''
    AND also_known_as NOT LIKE '%,%'
    AND also_known_as NOT LIKE '%/%'
    AND NOT added_to_a

  UNION ALL

  -- C) Subsidiary candidate (no aka, parent has 2+ children, not PE-classified).
  SELECT
    id, company, 'subsidiary' AS category,
    json_build_object(
      'parent_company', parent_company,
      'ownership_type', ownership_type
    ) AS current_val,
    json_build_object(
      'parent_relationship_kind', 'subsidiary'
    ) AS suggested_val,
    CASE
      WHEN ownership_type ~* '(corporate|strategic)' THEN 'high'
      ELSE 'medium'
    END AS confidence,
    CASE
      WHEN ownership_type ~* '(corporate|strategic)'
        THEN 'aka empty, parent has ' || parent_child_count::text || ' children, ownership_type Corporate/Strategic'
      ELSE 'aka empty, parent has ' || parent_child_count::text || ' children (real operational parent)'
    END AS reason
  FROM classified_2
  WHERE parent_company IS NOT NULL AND parent_company <> ''
    AND (also_known_as IS NULL OR also_known_as = '')
    AND parent_child_count >= 2
    AND NOT added_to_a

  UNION ALL

  -- D) Brand-list aka cleanup (3+ tokens, 2+ matching existing company rows).
  SELECT
    sub.id, sub.company, 'aka_cleanup' AS category,
    json_build_object(
      'also_known_as', sub.also_known_as,
      'parent_company', sub.parent_company
    ) AS current_val,
    json_build_object('also_known_as', NULL) AS suggested_val,
    'high' AS confidence,
    'aka contains ' || sub.token_count::text || ' comma/slash-separated tokens; ' ||
      sub.match_count::text || ' match existing company rows (brand-list misuse)' AS reason
  FROM (
    SELECT
      r.id, r.company, r.also_known_as, r.parent_company,
      array_length(tokens, 1) AS token_count,
      (SELECT COUNT(*)::int FROM unnest(tokens) AS t
        WHERE LOWER(TRIM(t)) IN (SELECT cnorm FROM company_set)) AS match_count
    FROM (
      SELECT
        r2.*,
        ARRAY(
          SELECT TRIM(t)
          FROM regexp_split_to_table(r2.also_known_as, '[,/]') AS t
          WHERE TRIM(t) <> ''
        ) AS tokens
      FROM all_rows r2
      WHERE r2.also_known_as IS NOT NULL AND r2.also_known_as <> ''
    ) r
    WHERE array_length(tokens, 1) >= 3
  ) sub
  WHERE sub.match_count >= 2
)
SELECT json_build_object(
  'summary', json_build_object(
    'total_candidates', (SELECT COUNT(*)::int FROM all_candidates),
    'by_category', COALESCE(
      (SELECT json_object_agg(category, n)
        FROM (SELECT category, COUNT(*)::int AS n FROM all_candidates GROUP BY category) c),
      '{}'::json),
    'by_confidence', COALESCE(
      (SELECT json_object_agg(confidence, n)
        FROM (SELECT confidence, COUNT(*)::int AS n FROM all_candidates GROUP BY confidence) c),
      '{}'::json)
  ),
  'candidates', COALESCE(
    (SELECT json_agg(json_build_object(
      'id', id,
      'company', company,
      'category', category,
      'current', current_val,
      'suggested', suggested_val,
      'confidence', confidence,
      'reason', reason
    ) ORDER BY category, confidence DESC, id) FROM all_candidates),
    '[]'::json)
) AS result;
