import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { DeductionRule, DeductionRuleGroup } from "./deduction-calculation";

export * from "./deduction-calculation";

export function useDeductionRuleSet() {
  const groupsQuery = useQuery<DeductionRuleGroup[]>({
    queryKey: ["deduction_rule_groups_all"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("deduction_rule_groups").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
  const rulesQuery = useQuery<DeductionRule[]>({
    queryKey: ["deduction_rules_all"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("deduction_rules").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
  return {
    groups: groupsQuery.data ?? [],
    rules: rulesQuery.data ?? [],
    isLoading: groupsQuery.isLoading || rulesQuery.isLoading,
  };
}
