-- Backfill the authorizing receipt match for legacy confirmed job-cost
-- assignments only when the receipt-to-transaction path identifies exactly
-- one confirmed match in the same organization.
BEGIN;

WITH unique_candidates AS (
  SELECT a.id AS assignment_id, max(m.id) AS match_id
  FROM public.contractor_job_cost_assignments a
  JOIN public.contractor_source_links l
    ON l.organization_id = a.organization_id
   AND l.right_provider = a.source_provider
   AND l.right_record_type = a.source_record_type
   AND l.right_record_id = a.source_record_id
   AND l.status = 'confirmed'
  JOIN public.contractor_financial_matches m
    ON m.organization_id = a.organization_id
   AND m.source_provider = l.left_provider
   AND m.source_record_type = l.left_record_type
   AND m.source_record_id = l.left_record_id
   AND m.status = 'confirmed'
  WHERE a.match_id IS NULL
    AND a.confidence = 'confirmed'
  GROUP BY a.id
  HAVING count(DISTINCT m.id) = 1
)
UPDATE public.contractor_job_cost_assignments a
SET match_id = candidates.match_id
FROM unique_candidates candidates
WHERE a.id = candidates.assignment_id
  AND a.match_id IS NULL;

COMMIT;
