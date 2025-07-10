import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "@/lib/supabase";
import { useColors } from "@/hooks/useColors";

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleReset = async () => {
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    setLoading(true);
    setError("");
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: "booksmart-mobile://reset-password",
    });
    setLoading(false);
    if (authError) {
      setError(authError.message);
    } else {
      setSent(true);
    }
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    inner: {
      flex: 1,
      paddingHorizontal: 28,
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 24),
      paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 24),
    },
    backBtn: { marginBottom: 32, alignSelf: "flex-start" },
    heading: { fontSize: 26, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold", marginBottom: 8 },
    subheading: { fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginBottom: 28, lineHeight: 20 },
    label: { fontSize: 13, fontWeight: "600", color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
    inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: colors.radius, borderWidth: 1, borderColor: colors.border, marginBottom: 16, paddingHorizontal: 14 },
    input: { flex: 1, paddingVertical: 14, fontSize: 15, color: colors.foreground, fontFamily: "Inter_400Regular" },
    errorBox: { backgroundColor: colors.destructive + "20", borderRadius: colors.radius, padding: 12, marginBottom: 16 },
    errorText: { color: colors.destructive, fontSize: 13, fontFamily: "Inter_400Regular" },
    btn: { borderRadius: colors.radius, overflow: "hidden", marginTop: 8 },
    grad: { paddingVertical: 16, alignItems: "center" },
    btnText: { fontSize: 16, fontWeight: "700", color: colors.primaryForeground, fontFamily: "Inter_700Bold" },
    successCard: { backgroundColor: colors.success + "20", borderRadius: colors.radius, padding: 20, alignItems: "center", gap: 12 },
    successTitle: { fontSize: 18, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    successText: { fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
    backLink: { marginTop: 20, alignItems: "center" },
    backLinkText: { fontSize: 14, color: colors.primary, fontFamily: "Inter_600SemiBold" },
  });

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={styles.inner}>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Feather name="arrow-left" size={24} color={colors.foreground} />
            </Pressable>

            <Text style={styles.heading}>Reset password</Text>
            <Text style={styles.subheading}>
              Enter your account email and we'll send you a link to reset your password.
            </Text>

            {sent ? (
              <View style={styles.successCard}>
                <Feather name="check-circle" size={32} color={colors.success} />
                <Text style={styles.successTitle}>Check your inbox</Text>
                <Text style={styles.successText}>
                  We've sent a password reset link to {email}. Check your email and follow the link.
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.label}>Email</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.input}
                    placeholder="you@example.com"
                    placeholderTextColor={colors.mutedForeground}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                  />
                </View>

                {error ? (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <Pressable style={styles.btn} onPress={handleReset} disabled={loading}>
                  <LinearGradient colors={[colors.primary, "#E6A800"]} style={styles.grad}>
                    {loading
                      ? <ActivityIndicator color={colors.primaryForeground} />
                      : <Text style={styles.btnText}>Send Reset Link</Text>
                    }
                  </LinearGradient>
                </Pressable>
              </>
            )}

            <Pressable style={styles.backLink} onPress={() => router.back()}>
              <Text style={styles.backLinkText}>Back to Sign In</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
