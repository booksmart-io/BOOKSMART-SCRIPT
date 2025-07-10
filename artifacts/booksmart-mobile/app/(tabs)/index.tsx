import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
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

type Transaction = {
  id: number;
  title: string;
  amount: number;
  type: string;
  date_time: string;
  deductible?: boolean;
};

function formatMoney(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
}

function formatDate(s: string) {
  const d = new Date(s);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function StatCard({ label, value, icon, trend, colors }: {
  label: string; value: string; icon: string; trend?: string; colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[localStyles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[localStyles.iconCircle, { backgroundColor: colors.primary + "20" }]}>
        <Feather name={icon as any} size={18} color={colors.primary} />
      </View>
      <Text style={[localStyles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[localStyles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
      {trend ? <Text style={[localStyles.statTrend, { color: colors.success }]}>{trend}</Text> : null}
    </View>
  );
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();

  const { data: transactions, isLoading, refetch } = useQuery({
    queryKey: ["recent-transactions", profile?.numericId],
    queryFn: async () => {
      if (!profile?.numericId) return [];
      const { data } = await supabase
        .from("transactions")
        .select("*")
        .eq("org_id", profile.numericId)
        .order("date_time", { ascending: false })
        .limit(5);
      return (data ?? []) as Transaction[];
    },
    enabled: !!profile?.numericId,
  });

  const { data: orders } = useQuery({
    queryKey: ["recent-orders", profile?.numericId],
    queryFn: async () => {
      if (!profile?.numericId) return [];
      const { data } = await supabase
        .from("orders")
        .select("id, title, status, amount")
        .eq("user_id", profile.numericId)
        .order("id", { ascending: false })
        .limit(3);
      return data ?? [];
    },
    enabled: !!profile?.numericId,
  });

  const income = (transactions ?? []).filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expenses = (transactions ?? []).filter((t) => t.type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0);

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPad = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  return (
    <ScrollView
      style={[localStyles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: botPad + 100 }}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />}
    >
      {/* Header */}
      <LinearGradient colors={["#011A40", "#0A2347"]} style={[localStyles.header, { paddingTop: topPad + 20 }]}>
        <View>
          <Text style={localStyles.greeting}>Good morning,</Text>
          <Text style={localStyles.name}>{profile?.first_name || "User"} 👋</Text>
        </View>
        <View style={[localStyles.tokenBadge, { backgroundColor: colors.primary + "20", borderColor: colors.primary + "40" }]}>
          <Feather name="zap" size={14} color={colors.primary} />
          <Text style={[localStyles.tokenText, { color: colors.primary }]}>{profile?.token_balance ?? 0}</Text>
        </View>
      </LinearGradient>

      {/* Balance card */}
      <View style={{ paddingHorizontal: 20, marginTop: -20 }}>
        <LinearGradient colors={[colors.primary, "#E6A800"]} style={localStyles.balanceCard}>
          <Text style={localStyles.balanceLabel}>Token Balance</Text>
          <Text style={localStyles.balanceValue}>{profile?.token_balance ?? 0}</Text>
          <Text style={localStyles.balanceSub}>BookSmart Tokens</Text>
          <Feather name="cpu" size={48} color="rgba(0,0,0,0.1)" style={localStyles.balanceBg} />
        </LinearGradient>
      </View>

      {/* Stats */}
      <View style={[localStyles.statsRow, { paddingHorizontal: 20, marginTop: 16 }]}>
        <StatCard label="Income" value={formatMoney(income)} icon="trending-up" colors={colors} />
        <StatCard label="Expenses" value={formatMoney(expenses)} icon="trending-down" colors={colors} />
        <StatCard label="Orders" value={String(orders?.length ?? 0)} icon="shopping-bag" colors={colors} />
      </View>

      {/* Recent Transactions */}
      <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
        <Text style={[localStyles.sectionTitle, { color: colors.foreground }]}>Recent Transactions</Text>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : (transactions ?? []).length === 0 ? (
          <View style={[localStyles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="receipt-outline" size={32} color={colors.mutedForeground} />
            <Text style={[localStyles.emptyText, { color: colors.mutedForeground }]}>No transactions yet</Text>
          </View>
        ) : (
          <View style={[localStyles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {(transactions ?? []).map((t, idx) => (
              <View
                key={t.id}
                style={[
                  localStyles.txRow,
                  idx < (transactions ?? []).length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                <View style={[localStyles.txIcon, {
                  backgroundColor: t.type === "income" ? colors.success + "20" : colors.destructive + "20",
                }]}>
                  <Feather
                    name={t.type === "income" ? "arrow-down-left" : "arrow-up-right"}
                    size={16}
                    color={t.type === "income" ? colors.success : colors.destructive}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[localStyles.txTitle, { color: colors.foreground }]} numberOfLines={1}>{t.title}</Text>
                  <Text style={[localStyles.txDate, { color: colors.mutedForeground }]}>{formatDate(t.date_time)}</Text>
                </View>
                <Text style={[localStyles.txAmount, {
                  color: t.type === "income" ? colors.success : colors.destructive,
                }]}>
                  {t.type === "income" ? "+" : "-"}{formatMoney(Math.abs(t.amount))}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const localStyles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 40, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  greeting: { fontSize: 13, color: "rgba(255,255,255,0.6)", fontFamily: "Inter_400Regular" },
  name: { fontSize: 22, fontWeight: "700", color: "#FFFFFF", fontFamily: "Inter_700Bold" },
  tokenBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  tokenText: { fontSize: 14, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  balanceCard: { borderRadius: 16, padding: 24, overflow: "hidden" },
  balanceLabel: { fontSize: 13, color: "rgba(0,0,0,0.6)", fontFamily: "Inter_400Regular" },
  balanceValue: { fontSize: 48, fontWeight: "700", color: "#011026", fontFamily: "Inter_700Bold", marginTop: 4 },
  balanceSub: { fontSize: 13, color: "rgba(0,0,0,0.5)", fontFamily: "Inter_400Regular", marginTop: 2 },
  balanceBg: { position: "absolute", right: 16, bottom: 16 },
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: { flex: 1, borderRadius: 12, padding: 14, borderWidth: 1, alignItems: "center", gap: 4 },
  iconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  statValue: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
  statTrend: { fontSize: 11, fontFamily: "Inter_500Medium" },
  sectionTitle: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold", marginBottom: 12 },
  emptyCard: { borderRadius: 12, padding: 32, borderWidth: 1, alignItems: "center", gap: 8 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  listCard: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  txRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  txIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  txTitle: { fontSize: 14, fontWeight: "500", fontFamily: "Inter_500Medium" },
  txDate: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold" },
});
