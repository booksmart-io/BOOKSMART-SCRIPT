import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { useColors } from "@/hooks/useColors";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const WELCOME = "Hi! I'm your AI financial advisor. Ask me about tax strategies, deductions, or financial planning for freelancers and small businesses.";

export default function AiChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    { id: "0", role: "assistant", content: WELCOME },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const flatRef = useRef<FlatList>(null);

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPad = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
    };
    const currentMessages = [...messages, userMsg];
    setMessages(currentMessages);
    setInput("");
    setLoading(true);

    const apiMessages: Array<{ role: "user" | "assistant" | "system"; content: string }> = currentMessages
      .filter((m) => m.id !== "0")
      .map((m) => ({ role: m.role, content: m.content }));

    if (apiMessages[0]?.role !== "system") {
      apiMessages.unshift({
        role: "system",
        content: `You are a helpful AI financial advisor for US freelancers and small businesses. The user's name is ${profile?.first_name || "there"}. Provide concise, actionable financial and tax advice.`,
      });
    }

    try {
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      const baseUrl = domain ? `https://${domain}` : "";
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const authHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (currentSession?.access_token) {
        authHeaders["Authorization"] = `Bearer ${currentSession.access_token}`;
      }
      const response = await fetch(`${baseUrl}/api/openai-chat`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!response.ok) throw new Error("API error");

      const json = await response.json();
      const content =
        json?.choices?.[0]?.message?.content ||
        json?.content ||
        "I'm sorry, I couldn't process that. Please try again.";

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (_e) {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Sorry, I couldn't connect to the AI service right now. Please try again later.",
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === "user";
    return (
      <View style={[styles.msgRow, isUser && styles.msgRowUser]}>
        {!isUser && (
          <LinearGradient colors={[colors.primary, "#E6A800"]} style={styles.aiAvatar}>
            <Feather name="cpu" size={14} color={colors.primaryForeground} />
          </LinearGradient>
        )}
        <View
          style={[
            styles.bubble,
            isUser
              ? { backgroundColor: colors.primary, borderBottomRightRadius: 4 }
              : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderBottomLeftRadius: 4 },
          ]}
        >
          <Text style={[styles.bubbleText, { color: isUser ? colors.primaryForeground : colors.foreground }]}>
            {item.content}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <LinearGradient colors={[colors.primary, "#E6A800"]} style={styles.headerIcon}>
          <Feather name="cpu" size={18} color={colors.primaryForeground} />
        </LinearGradient>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>AI Advisor</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>Your financial AI assistant</Text>
        </View>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.messageList,
            { paddingBottom: botPad + 80 },
          ]}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: true })}
          renderItem={renderMessage}
          ListFooterComponent={
            loading ? (
              <View style={[styles.msgRow]}>
                <LinearGradient colors={[colors.primary, "#E6A800"]} style={styles.aiAvatar}>
                  <Feather name="cpu" size={14} color={colors.primaryForeground} />
                </LinearGradient>
                <View style={[styles.bubble, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderBottomLeftRadius: 4 }]}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              </View>
            ) : null
          }
        />

        {/* Input bar */}
        <View style={[styles.inputBar, {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          paddingBottom: botPad + 8,
        }]}>
          <View style={[styles.inputWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder="Ask about tax strategies, deductions..."
              placeholderTextColor={colors.mutedForeground}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={1000}
              onSubmitEditing={sendMessage}
            />
            <Pressable
              style={[styles.sendBtn, { backgroundColor: loading || !input.trim() ? colors.muted : colors.primary }]}
              onPress={sendMessage}
              disabled={loading || !input.trim()}
            >
              <Feather name="send" size={16} color={loading || !input.trim() ? colors.mutedForeground : colors.primaryForeground} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  messageList: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginBottom: 4 },
  msgRowUser: { flexDirection: "row-reverse" },
  aiAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  bubble: { maxWidth: "80%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  bubbleText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  inputBar: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderRadius: 24,
    borderWidth: 1,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 8,
  },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", maxHeight: 100, paddingVertical: 6 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", flexShrink: 0 },
});
