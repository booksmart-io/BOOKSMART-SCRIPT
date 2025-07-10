import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
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
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

function formatMoney(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function CpaEarningsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();

  const { data: orders, isLoading, refetch } = useQuery({
    queryKey: ["cpa-earnings", profile?.numericId],
    queryFn: async () => {
      if (!profile?.numericId) return [];
      const { data } = await supabase
        .from("orders")
        .select("id, title, amount, status, user:users!orders_user_id_fkey(first_name, last_name)")
        .eq("cpa_id", profile.numericId)
        .eq("status", "completed")
        .order("id", { ascending: false });
      return data ?? [];
    },
    enabled: !!profile?.numericId,
  });

  const completedOrders = orders ?? [];
  const totalEarned = completedOrders.reduce((s: number, o: any) => s + (o.amount ?? 0), 0);
  const avgOrder = completedOrders.length > 0 ? totalEarned / completedOrders.length : 0;

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPad = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Earnings</Text>
      </View>

      <LinearGradient colors={[colors.primary, "#E6A800"]} style={[styles.earningsCard, { marginHorizontal: 16 }]}>
        <Text style={styles.totalLabel}>Total Earned</Text>
        <Text style={styles.totalValue}>{formatMoney(totalEarned)}</Text>
        <View style={styles.earningsRow}>
          <View>
            <Text style={styles.earningsSubLabel}>Completed Orders</Text>
            <Text style={styles.earningsSubValue}>{completedOrders.length}</Text>
          </View>
          <View>
            <Text style={styles.earningsSubLabel}>Avg. per Order</Text>
            <Text style={styles.earningsSubValue}>{formatMoney(avgOrder)}</Text>
          </View>
        </View>
      </LinearGradient>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={completedOrders}
          keyExtractor={(item: any) => String(item.id)}
          scrollEnabled={!!completedOrders.length}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: botPad + 100 }}
          ListHeaderComponent={
            completedOrders.length > 0
              ? <Text style={[styles.listTitle, { color: colors.mutedForeground }]}>Payment History</Text>
              : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="cash-outline" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No earnings yet</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Complete orders to see your earnings here</Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item: order }: { item: any }) => (
            <View style={[styles.earningRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.orderTitle, { color: colors.foreground }]} numberOfLines={1}>{order.title}</Text>
                {order.user && (
                  <Text style={[styles.clientName, { color: colors.mutedForeground }]}>
                    {(order.user as any).first_name} {(order.user as any).last_name}
                  </Text>
                )}
              </View>
              <Text style={[styles.earningAmount, { color: colors.success }]}>{formatMoney(order.amount ?? 0)}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 14 },
  title: { fontSize: 26, fontWeight: "700", fontFamily: "Inter_700Bold" },
  earningsCard: { borderRadius: 16, padding: 24, marginBottom: 16 },
  totalLabel: { fontSize: 13, color: "rgba(0,0,0,0.6)", fontFamily: "Inter_400Regular" },
  totalValue: { fontSize: 40, fontWeight: "700", color: "#011026", fontFamily: "Inter_700Bold", marginTop: 4, marginBottom: 16 },
  earningsRow: { flexDirection: "row", gap: 32 },
  earningsSubLabel: { fontSize: 12, color: "rgba(0,0,0,0.5)", fontFamily: "Inter_400Regular", marginBottom: 2 },
  earningsSubValue: { fontSize: 16, fontWeight: "700", color: "#011026", fontFamily: "Inter_700Bold" },
  listTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  empty: { padding: 48, alignItems: "center", gap: 8 },
  emptyText: { fontSize: 16, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  earningRow: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 12, borderWidth: 1, gap: 10 },
  orderTitle: { fontSize: 14, fontWeight: "500", fontFamily: "Inter_500Medium" },
  clientName: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  earningAmount: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
});
