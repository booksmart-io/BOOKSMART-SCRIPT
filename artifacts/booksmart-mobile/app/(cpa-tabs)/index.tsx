import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { useColors } from "@/hooks/useColors";

function formatMoney(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
}

export default function CpaDashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();

  const { data: orders, isLoading, refetch } = useQuery({
    queryKey: ["cpa-orders", profile?.numericId],
    queryFn: async () => {
      if (!profile?.numericId) return [];
      const { data } = await supabase
        .from("orders")
        .select("id, title, status, amount, user:users!orders_user_id_fkey(first_name, last_name, email)")
        .eq("cpa_id", profile.numericId)
        .order("id", { ascending: false });
      return data ?? [];
    },
    enabled: !!profile?.numericId,
  });

  const allOrders = orders ?? [];
  const pending = allOrders.filter((o: any) => o.status === "pending").length;
  const active = allOrders.filter((o: any) => o.status === "in_progress").length;
  const completed = allOrders.filter((o: any) => o.status === "completed").length;
  const totalEarned = allOrders
    .filter((o: any) => o.status === "completed")
    .reduce((s: number, o: any) => s + (o.amount ?? 0), 0);

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPad = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: botPad + 100 }}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />}
    >
      {/* Header */}
      <LinearGradient colors={["#011A40", "#0A2347"]} style={[styles.header, { paddingTop: topPad + 20 }]}>
        <View>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.name}>{profile?.first_name} {profile?.last_name}</Text>
          <View style={[styles.cpaBadge, { backgroundColor: colors.primary + "30", borderColor: colors.primary + "50" }]}>
            <Feather name="award" size={12} color={colors.primary} />
            <Text style={[styles.cpaLabel, { color: colors.primary }]}>CPA Professional</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Earnings card */}
      <View style={{ paddingHorizontal: 20, marginTop: -20 }}>
        <LinearGradient colors={[colors.primary, "#E6A800"]} style={styles.earningsCard}>
          <Text style={styles.earningsLabel}>Total Earned</Text>
          <Text style={styles.earningsValue}>{formatMoney(totalEarned)}</Text>
          <Text style={styles.earningsSub}>From {completed} completed orders</Text>
        </LinearGradient>
      </View>

      {/* Stats */}
      <View style={[styles.statsRow, { paddingHorizontal: 20, marginTop: 16 }]}>
        {[
          { label: "Pending", value: pending, icon: "clock", color: colors.primary },
          { label: "Active", value: active, icon: "activity", color: "#3B82F6" },
          { label: "Done", value: completed, icon: "check-circle", color: colors.success },
        ].map((stat) => (
          <View key={stat.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.statIcon, { backgroundColor: stat.color + "20" }]}>
              <Feather name={stat.icon as any} size={16} color={stat.color} />
            </View>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{stat.value}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Recent orders */}
      <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent Orders</Text>
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : allOrders.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="bag-outline" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No orders yet</Text>
          </View>
        ) : (
          <View style={[styles.orderList, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {allOrders.slice(0, 5).map((order: any, idx: number) => (
              <View
                key={order.id}
                style={[styles.orderRow, idx < Math.min(allOrders.length, 5) - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.orderTitle, { color: colors.foreground }]} numberOfLines={1}>{order.title}</Text>
                  {order.user && (
                    <Text style={[styles.clientName, { color: colors.mutedForeground }]}>
                      {(order.user as any).first_name} {(order.user as any).last_name}
                    </Text>
                  )}
                </View>
                <View style={[styles.statusDot, {
                  backgroundColor: order.status === "completed" ? colors.success :
                    order.status === "in_progress" ? "#3B82F6" : colors.primary,
                }]} />
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 40 },
  greeting: { fontSize: 13, color: "rgba(255,255,255,0.6)", fontFamily: "Inter_400Regular" },
  name: { fontSize: 22, fontWeight: "700", color: "#FFFFFF", fontFamily: "Inter_700Bold", marginTop: 2 },
  cpaBadge: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  cpaLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  earningsCard: { borderRadius: 16, padding: 24 },
  earningsLabel: { fontSize: 13, color: "rgba(0,0,0,0.6)", fontFamily: "Inter_400Regular" },
  earningsValue: { fontSize: 40, fontWeight: "700", color: "#011026", fontFamily: "Inter_700Bold", marginTop: 4 },
  earningsSub: { fontSize: 13, color: "rgba(0,0,0,0.5)", fontFamily: "Inter_400Regular", marginTop: 2 },
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: { flex: 1, borderRadius: 12, padding: 14, borderWidth: 1, alignItems: "center", gap: 4 },
  statIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  statValue: { fontSize: 20, fontWeight: "700", fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  sectionTitle: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold", marginBottom: 12 },
  empty: { borderRadius: 12, padding: 32, borderWidth: 1, alignItems: "center", gap: 8 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  orderList: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  orderRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 10 },
  orderTitle: { fontSize: 14, fontWeight: "500", fontFamily: "Inter_500Medium" },
  clientName: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
});
