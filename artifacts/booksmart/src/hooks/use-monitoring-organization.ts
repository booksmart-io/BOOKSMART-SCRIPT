import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { pickActiveOrganization, useActiveOrganizationId } from "@/lib/active-organization";
import { supabase } from "@/lib/supabase";

export function useMonitoringOrganization() {
  const { profile } = useAuth();
  const numericId = profile?.numericId ?? null;
  const [activeOrgId] = useActiveOrganizationId(numericId);
  return useQuery<{ id: number; name?: string | null } | null>({
    queryKey: ["monitoring-organization", numericId, activeOrgId], enabled: numericId !== null, staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("id,name").eq("owner_id", numericId!).order("id");
      if (error) throw error;
      return pickActiveOrganization(data, activeOrgId);
    },
  });
}
