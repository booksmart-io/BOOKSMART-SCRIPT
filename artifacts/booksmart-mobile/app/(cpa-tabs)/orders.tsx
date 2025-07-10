import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { useColors } from "@/hooks/useColors";

type OrderStatus = "all" | "pending" | "in_progress" | "completed";

function formatMoney(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

const STATUS_CONFIG: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: "#F5C54220", color: "#F5C542", label: "Pending" },
  in_progress: { bg: "#3B82F620", color: "#3B82F6", label: "In Progress" },
  completed: { bg: "#22C55E20", color: "#22C55E", label: "Completed" },
  cancelled: { bg: "#EC3C2B20", color: "#EC3C2B", label: "Cancelled" },
};

const FILTERS: { label: string; value: OrderStatus }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Active", value: "in_progress" },
  { label: "Done", value: "completed" },
];

export default function CpaOrdersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const [filter, setFilter] = useState<OrderStatus>("all");

  const { data: orders, isLoading, refetch } = useQuery({
    queryKey: ["cpa-orders-list", profile?.numericId],
    queryFn: async () => {
      if (!profile?.numericId) return [];
      const { data } = await supabase
        .from("orders")
        .select("id, title, status, payment_status, amount, services, user:users!orders_user_id_fkey(first_name, last_name, email)")
        .eq("cpa_id", profile.numericId)
        .order("id", { ascending: false });
      return data ?? [];
    },
    enabled: !!profile?.numericId,
  });

  const allOrders = orders ?? [];
  const filtered = filter === "all" ? allOrders : allOrders.filter((o: any) => o.status === filter);
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Client Orders</Text>
        <View style={styles.filterRow}>
          {FILTERS.map((f) => (
            <Pressable
              key={f.value}
              style={[styles.pill, {
                backgroundColor: filter === f.value ? colors.primary : colors.card,
                borderColor: filter === f.value ? colors.primary : colors.border,
              }]}
              onPress={() => setFilter(f.value)}
            >
              <Text style={[styles.pillText, { color: filter === f.value ? colors.primaryForeground : colors.mutedForeground }]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item: any) => String(item.id)}
          scrollEnabled={!!filtered.length}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 100,
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="bag-outline" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No orders found</Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item: order }: { item: any }) => {
            const sc = STATUS_CONFIG[order.status] ?? { bg: colors.muted, color: colors.mutedForeground, label: order.status };
            return (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{order.title}</Text>
                    {order.user && (
                      <Text style={[styles.clientText, { color: colors.mutedForeground }]}>
                        {(order.user as any).first_name} {(order.user as any).last_name}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.badge, { backgroundColor: sc.bg }]}>
                    <Text style={[styles.badgeText, { color: sc.color }]}>{sc.label}</Text>
                  </View>
                </View>
                {order.amount != null && (
                  <Text style={[styles.amount, { color: colors.foreground }]}>{formatMoney(order.amount)}</Text>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  title: { fontSize: 26, fontWeight: "700", fontFamily: "Inter_700Bold", marginBottom: 14 },
  filterRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  pill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  pillText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  empty: { padding: 48, alignItems: "center", gap: 12, marginTop: 20 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  card: { padding: 16, borderRadius: 14, borderWidth: 1, gap: 8 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
  clientText: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 12, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  amount: { fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold" },
});
