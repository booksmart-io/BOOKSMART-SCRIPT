import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";

/**
 * Returns the total count of unread messages sent to the current user
 * across all their chats. Polls every 5 s and subscribes to real-time
 * changes so the badge stays current.
 */
export function useUnreadCount(): number {
  const { profile } = useAuth();
  const numericId = profile?.numericId as number | undefined;
  const qc = useQueryClient();

  const { data: count = 0 } = useQuery<number>({
    queryKey: ["unread_count", numericId],
    enabled: !!numericId,
    refetchInterval: 5000,
    queryFn: async () => {
      // Get all chat IDs this user participates in
      const { data: chats } = await supabase
        .from("chats")
        .select("id")
        .or(`sender_id.eq.${numericId},receiver_id.eq.${numericId}`);

      if (!chats?.length) return 0;

      const chatIds = chats.map((c: { id: number }) => c.id);

      // Count messages in those chats that are unread and not from this user
      const { count: unread } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .in("chat_id", chatIds)
        .neq("sender_id", numericId!)
        .eq("is_read", false);

      return unread ?? 0;
    },
  });

  // Real-time: any insert/update on messages recomputes the count
  useEffect(() => {
    if (!numericId) return;
    const ch = supabase
      .channel(`unread_count:${numericId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        qc.invalidateQueries({ queryKey: ["unread_count", numericId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [numericId, qc]);

  return count;
}
