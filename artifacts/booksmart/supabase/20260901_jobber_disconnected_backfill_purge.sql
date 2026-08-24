-- One-time cleanup for organizations disconnected before disconnect became a purge.
-- The purge function is organization-scoped and preserves canonical accounting data.
DO $$
DECLARE
  disconnected_org RECORD;
BEGIN
  FOR disconnected_org IN
    SELECT organization_id
    FROM public.jobber_connections
    WHERE status = 'disconnected'
  LOOP
    PERFORM public.purge_jobber_organization_data(disconnected_org.organization_id);
  END LOOP;
END;
$$;
