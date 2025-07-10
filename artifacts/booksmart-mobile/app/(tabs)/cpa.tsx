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
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useColors } from "@/hooks/useColors";

type CPA = {
  id: number;
  auth_id: string;
  first_name: string;
  last_name: string;
  email: string;
  img_url?: string;
  professional_bio?: string;
  specialties?: string[];
  state_focuses?: string[];
  certifications?: string[];
  verification_status?: string;
};

function StarRating({ rating, colors }: { rating: number; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Feather
          key={star}
          name="star"
          size={12}
          color={star <= rating ? colors.primary : colors.border}
        />
      ))}
    </View>
  );
}

export default function CPANetworkScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [filterSpecialty, setFilterSpecialty] = useState<string | null>(null);

  const { data: cpas, isLoading, refetch } = useQuery({
    queryKey: ["cpas"],
    queryFn: async () => {
      const { data } = await supabase
        .from("users")
        .select("id, auth_id, first_name, last_name, email, img_url, professional_bio, specialties, state_focuses, certifications, verification_status")
        .eq("role", "cpa");
      return (data ?? []) as CPA[];
    },
  });

  const allCpas = cpas ?? [];

  const filtered = allCpas.filter((cpa) => {
    const fullName = `${cpa.first_name} ${cpa.last_name}`.toLowerCase();
    const matchesSearch = !search || fullName.includes(search.toLowerCase()) ||
      (cpa.specialties ?? []).some((s) => s.toLowerCase().includes(search.toLowerCase()));
    const matchesFilter = !filterSpecialty ||
      (cpa.specialties ?? []).includes(filterSpecialty);
    return matchesSearch && matchesFilter;
  });

  const allSpecialties = [...new Set(allCpas.flatMap((c) => c.specialties ?? []))].slice(0, 5);

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>CPA Network</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {allCpas.length} verified professionals
        </Text>

        {/* Search */}
        <View style={[styles.searchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search CPAs or specialties..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <Pressable onPress={() => setSearch("")}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>

        {/* Specialty filters */}
        {allSpecialties.length > 0 && (
          <View style={styles.filtersScroll}>
            <Pressable
              style={[styles.pill, {
                backgroundColor: !filterSpecialty ? colors.primary : colors.card,
                borderColor: !filterSpecialty ? colors.primary : colors.border,
              }]}
              onPress={() => setFilterSpecialty(null)}
            >
              <Text style={[styles.pillText, { color: !filterSpecialty ? colors.primaryForeground : colors.mutedForeground }]}>
                All
              </Text>
            </Pressable>
            {allSpecialties.map((s) => (
              <Pressable
                key={s}
                style={[styles.pill, {
                  backgroundColor: filterSpecialty === s ? colors.primary : colors.card,
                  borderColor: filterSpecialty === s ? colors.primary : colors.border,
                }]}
                onPress={() => setFilterSpecialty(filterSpecialty === s ? null : s)}
              >
                <Text style={[styles.pillText, { color: filterSpecialty === s ? colors.primaryForeground : colors.mutedForeground }]}>
                  {s}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
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
              <Ionicons name="people-outline" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No CPAs found</Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={({ item: cpa }) => (
            <View style={[styles.cpaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/* Avatar */}
              <View style={[styles.avatar, { backgroundColor: colors.primary + "20" }]}>
                <Text style={[styles.avatarText, { color: colors.primary }]}>
                  {cpa.first_name?.[0]}{cpa.last_name?.[0]}
                </Text>
              </View>

              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={[styles.cpaName, { color: colors.foreground }]}>
                    {cpa.first_name} {cpa.last_name}
                  </Text>
                  {cpa.verification_status === "verified" && (
                    <Feather name="check-circle" size={14} color={colors.success} />
                  )}
                </View>
                <StarRating rating={4} colors={colors} />
                {cpa.professional_bio ? (
                  <Text style={[styles.bio, { color: colors.mutedForeground }]} numberOfLines={2}>
                    {cpa.professional_bio}
                  </Text>
                ) : null}
                {(cpa.specialties ?? []).length > 0 && (
                  <View style={styles.tagsRow}>
                    {(cpa.specialties ?? []).slice(0, 3).map((s) => (
                      <View key={s} style={[styles.tag, { backgroundColor: colors.muted }]}>
                        <Text style={[styles.tagText, { color: colors.mutedForeground }]}>{s}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.actionCol}>
                <Pressable style={[styles.hireBtn, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.hireText, { color: colors.primaryForeground }]}>Hire</Text>
                </Pressable>
              </View>
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
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  filtersScroll: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 4 },
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  pillText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  empty: { padding: 40, alignItems: "center", gap: 12, marginTop: 20 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  cpaCard: { flexDirection: "row", gap: 12, padding: 16, borderRadius: 14, borderWidth: 1, alignItems: "flex-start" },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  cpaName: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
  bio: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 6, lineHeight: 18 },
  tagsRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 8 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  actionCol: { alignItems: "center", justifyContent: "flex-start" },
  hireBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  hireText: { fontSize: 13, fontWeight: "700", fontFamily: "Inter_700Bold" },
});
