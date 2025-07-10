import { Feather, Ionicons } from "@expo/vector-icons";
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

type Transaction = {
  id: number;
  title: string;
  amount: number;
  type: string;
  date_time: string;
  description?: string;
  deductible?: boolean;
};

type Filter = "all" | "income" | "expense";

function formatMoney(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(v);
}

function formatDate(s: string) {
  const d = new Date(s);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ReportsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");

  const { data: transactions, isLoading, refetch } = useQuery({
    queryKey: ["all-transactions", profile?.numericId],
    queryFn: async () => {
      if (!profile?.numericId) return [];
      const { data } = await supabase
        .from("transactions")
        .select("*")
        .eq("org_id", profile.numericId)
        .order("date_time", { ascending: false });
      return (data ?? []) as Transaction[];
    },
    enabled: !!profile?.numericId,
  });

  const allTx = transactions ?? [];
  const filtered = filter === "all" ? allTx : allTx.filter((t) => t.type === filter);
  const income = allTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expenses = allTx.filter((t) => t.type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0);
  const net = income - expenses;

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const FILTERS: { label: string; value: Filter }[] = [
    { label: "All", value: "all" },
    { label: "Income", value: "income" },
    { label: "Expenses", value: "expense" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Reports</Text>
      </View>

      {/* Summary cards */}
      <View style={[styles.summaryRow, { paddingHorizontal: 16, paddingTop: 16 }]}>
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Income</Text>
          <Text style={[styles.summaryValue, { color: colors.success }]}>{formatMoney(income)}</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Expenses</Text>
          <Text style={[styles.summaryValue, { color: colors.destructive }]}>{formatMoney(expenses)}</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Net</Text>
          <Text style={[styles.summaryValue, { color: net >= 0 ? colors.success : colors.destructive }]}>
            {formatMoney(net)}
          </Text>
        </View>
      </View>

      {/* Filter pills */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
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
            <Text style={[
              styles.filterText,
              { color: filter === f.value ? colors.primaryForeground : colors.mutedForeground },
            ]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Transactions list */}
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
            paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 100,
          }}
          ListEmptyComponent={
            <View style={[styles.empty, { borderColor: colors.border }]}>
              <Ionicons name="receipt-outline" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No transactions found</Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item: t }) => (
            <View style={[styles.txCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.txIcon, {
                backgroundColor: t.type === "income" ? colors.success + "20" : colors.destructive + "20",
              }]}>
                <Feather
                  name={t.type === "income" ? "arrow-down-left" : "arrow-up-right"}
                  size={18}
                  color={t.type === "income" ? colors.success : colors.destructive}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.txTitle, { color: colors.foreground }]} numberOfLines={1}>{t.title}</Text>
                <Text style={[styles.txDate, { color: colors.mutedForeground }]}>{formatDate(t.date_time)}</Text>
                {t.deductible && (
                  <View style={[styles.deductBadge, { backgroundColor: colors.primary + "20" }]}>
                    <Text style={[styles.deductText, { color: colors.primary }]}>Tax Deductible</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.txAmount, {
                color: t.type === "income" ? colors.success : colors.destructive,
              }]}>
                {t.type === "income" ? "+" : "-"}{formatMoney(Math.abs(t.amount))}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  title: { fontSize: 26, fontWeight: "700", fontFamily: "Inter_700Bold" },
  summaryRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  summaryCard: { flex: 1, borderRadius: 10, padding: 12, borderWidth: 1 },
  summaryLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 4 },
  summaryValue: { fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold" },
  filterRow: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 14 },
  filterPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  filterText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  empty: { padding: 40, alignItems: "center", gap: 12, marginTop: 20 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  txCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  txIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  txTitle: { fontSize: 14, fontWeight: "500", fontFamily: "Inter_500Medium" },
  txDate: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  deductBadge: { marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, alignSelf: "flex-start" },
  deductText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  txAmount: { fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold" },
});
