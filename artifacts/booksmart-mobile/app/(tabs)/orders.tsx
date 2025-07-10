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

type Order = {
  id: number;
  title: string;
  status: string;
  payment_status?: string;
  amount?: number;
  services?: string[];
  cpa?: { first_name: string; last_name: string } | null;
};

type StatusFilter = "all" | "pending" | "in_progress" | "completed" | "cancelled";

function formatMoney(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

function StatusBadge({ status, colors }: { status: string; colors: ReturnType<typeof useColors> }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    pending: { bg: colors.primary + "25", text: colors.primary, label: "Pending" },
    in_progress: { bg: "#3B82F620", text: "#3B82F6", label: "In Progress" },
    completed: { bg: colors.success + "20", text: colors.success, label: "Completed" },
    cancelled: { bg: colors.destructive + "20", text: colors.destructive, label: "Cancelled" },
  };
  const c = config[status] ?? { bg: colors.muted, text: colors.mutedForeground, label: status };
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.text }]}>{c.label}</Text>
    </View>
  );
}

const ALL_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Active", value: "in_progress" },
  { label: "Done", value: "completed" },
];

export default function OrdersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const [filter, setFilter] = useState<StatusFilter>("all");

  const { data: orders, isLoading, refetch } = useQuery({
    queryKey: ["orders", profile?.numericId],
    queryFn: async () => {
      if (!profile?.numericId) return [];
      const { data } = await supabase
        .from("orders")
        .select("id, title, status, payment_status, amount, services, cpa:users!orders_cpa_id_fkey(first_name, last_name)")
        .eq("user_id", profile.numericId)
        .order("id", { ascending: false });
      return (data ?? []) as unknown as Order[];
    },
    enabled: !!profile?.numericId,
  });

  const allOrders = orders ?? [];
  const filtered = filter === "all" ? allOrders : allOrders.filter((o) => o.status === filter);

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Orders</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {allOrders.length} total orders
        </Text>

        {/* Filters */}
        <View style={styles.filterRow}>
          {ALL_FILTERS.map((f) => (
            <Pressable
              key={f.value}
              style={[
                styles.filterPill,
                {
                  backgroundColor: filter === f.value ? colors.primary : colors.card,
                  borderColor: filter === f.value ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setFilter(f.value)}
            >
              <Text style={[styles.filterText, {
                color: filter === f.value ? colors.primaryForeground : colors.mutedForeground,
              }]}>
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
          keyExtractor={(item) => String(item.id)}
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
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No orders yet</Text>
              <Text style={[styles.emptySubtext, { color: colors.mutedForeground }]}>
                Hire a CPA to get started
              </Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item: order }) => (
            <View style={[styles.orderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.orderTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.orderTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {order.title}
                  </Text>
                  {order.cpa && (
                    <Text style={[styles.cpaName, { color: colors.mutedForeground }]}>
                      {(order.cpa as any).first_name} {(order.cpa as any).last_name}
                    </Text>
                  )}
                </View>
                <StatusBadge status={order.status} colors={colors} />
              </View>

              {(order.services ?? []).length > 0 && (
                <View style={styles.servicesRow}>
                  {(order.services ?? []).slice(0, 3).map((s: string) => (
                    <View key={s} style={[styles.serviceTag, { backgroundColor: colors.muted }]}>
                      <Text style={[styles.serviceText, { color: colors.mutedForeground }]}>{s}</Text>
                    </View>
                  ))}
                </View>
              )}

              {order.amount != null && (
                <View style={styles.orderBottom}>
                  <Text style={[styles.orderAmount, { color: colors.foreground }]}>
                    {formatMoney(order.amount)}
                  </Text>
                  {order.payment_status && (
                    <Text style={[styles.payStatus, {
                      color: order.payment_status === "paid" ? colors.success : colors.primary,
                    }]}>
                      {order.payment_status === "paid" ? "Paid" : "Unpaid"}
                    </Text>
                  )}
                </View>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 0 },
  title: { fontSize: 26, fontWeight: "700", fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2, marginBottom: 14 },
  filterRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  filterPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  filterText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  empty: { padding: 48, alignItems: "center", gap: 8, marginTop: 20 },
  emptyText: { fontSize: 16, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  emptySubtext: { fontSize: 13, fontFamily: "Inter_400Regular" },
  orderCard: { padding: 16, borderRadius: 14, borderWidth: 1, gap: 10 },
  orderTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  orderTitle: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
  cpaName: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 12, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  servicesRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  serviceTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  serviceText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  orderBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderAmount: { fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold" },
  payStatus: { fontSize: 13, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
});
