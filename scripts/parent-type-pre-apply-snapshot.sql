-- Thread 1: pre-apply snapshot of current state for the 153 rows that will be
-- modified by POST ?action=apply-parent-type-classifications.
--
-- Captures the pre-write values of the legacy columns (parent_company, also_known_as)
-- and the new typed columns (parent_relationship_kind, financial_sponsor, former_names).
-- IDs sourced verbatim from docs/diagnostics/parent-type-classifications.json.
--
-- USAGE
--   1. Run this query in the Neon SQL Editor.
--   2. Paste the single JSON cell result back to Claude.
--   3. Claude saves to docs/diagnostics/parent-type-pre-apply-snapshot.json and pushes.
--   4. Only AFTER the snapshot lands on the branch, fire the apply POST.

WITH snap AS (
  SELECT id, company, parent_company, also_known_as,
         parent_relationship_kind, financial_sponsor, former_names
  FROM prospect_companies
  WHERE id IN (
    3, 6, 11, 12, 17, 23, 26, 27, 38, 39, 40, 41,
    42, 58, 61, 66, 72, 97, 99, 101, 105, 106, 131, 158,
    161, 182, 192, 195, 196, 203, 204, 212, 216, 217, 218, 220,
    221, 240, 241, 243, 245, 248, 251, 252, 256, 258, 260, 261,
    263, 265, 268, 271, 272, 278, 280, 281, 283, 285, 286, 288,
    294, 299, 308, 309, 313, 314, 330, 337, 349, 351, 366, 380,
    381, 395, 431, 432, 439, 440, 441, 443, 449, 459, 461, 466,
    472, 475, 491, 492, 496, 514, 518, 531, 534, 552, 553, 554,
    555, 576, 594, 598, 599, 601, 604, 607, 614, 617, 618, 621,
    622, 624, 626, 638, 639, 641, 645, 647, 670, 671, 675, 679,
    683, 686, 687, 707, 715, 720, 728, 729, 732, 737, 740, 741,
    742, 777, 800, 814, 876, 879, 886, 902, 912, 913, 914, 915,
    916, 918, 919, 920, 921, 923, 925, 928, 934
  )
)
SELECT json_build_object(
  'meta', json_build_object(
    'captured_at', NOW()::text,
    'row_count', (SELECT COUNT(*)::int FROM snap),
    'purpose', 'Pre-apply snapshot for Thread 1 parent-type classifications. Rollback reference if apply produces unexpected results.'
  ),
  'rows', (SELECT json_agg(row_to_json(s) ORDER BY s.id) FROM snap s)
) AS result;
