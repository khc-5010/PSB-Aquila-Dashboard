-- Thread 1: post-apply verification.
-- Returns one JSON cell: population counts + spot-checks on 11 canary rows.
-- Compare against expected values in chat.

WITH touched AS (
  SELECT id, parent_company, also_known_as,
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
),
spot AS (
  SELECT id, company, parent_company, also_known_as,
         parent_relationship_kind, financial_sponsor, former_names
  FROM prospect_companies
  WHERE id IN (58, 66, 72, 99, 182, 555, 614, 670, 728, 912, 916)
)
SELECT json_build_object(
  'populations', json_build_object(
    'total_touched', (SELECT COUNT(*)::int FROM touched),
    'parent_relationship_kind_pop', (SELECT COUNT(*)::int FROM touched WHERE parent_relationship_kind IS NOT NULL),
    'financial_sponsor_pop', (SELECT COUNT(*)::int FROM touched WHERE financial_sponsor IS NOT NULL),
    'former_names_pop', (SELECT COUNT(*)::int FROM touched WHERE former_names IS NOT NULL AND array_length(former_names, 1) > 0),
    'parent_company_null', (SELECT COUNT(*)::int FROM touched WHERE parent_company IS NULL),
    'also_known_as_null', (SELECT COUNT(*)::int FROM touched WHERE also_known_as IS NULL)
  ),
  'kind_distribution', (
    SELECT json_object_agg(COALESCE(parent_relationship_kind, '(null)'), n)
    FROM (SELECT parent_relationship_kind, COUNT(*)::int n FROM touched GROUP BY parent_relationship_kind) x
  ),
  'spot_checks', (SELECT json_agg(row_to_json(s) ORDER BY s.id) FROM spot s)
) AS result;
