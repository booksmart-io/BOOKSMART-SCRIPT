import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../constant/env_data.dart';
import '../../../models/ai_message_model.dart';
import '../../../models/ai_tax_strategy_model.dart';
import '../../../supabase/tables.dart';
import '../../../utils/supabase.dart';
import 'package:http/http.dart' as http;

class AiGenericChatController extends GetxController {
  /// Nullable — when null this is a "general" AI chat, not tied to a strategy.
  final int? strategyId;

  AiGenericChatController(this.strategyId);

  final messages = <AiMessageModel>[].obs;
  final isLoading = false.obs;
  final isSending = false.obs;

  int _page = 0;
  final int _limit = 20;
  bool hasMore = true;

  final scrollController = ScrollController();

  // Grab the authenticated user's id once so every method can reuse it.
  String get _userId => supabase.auth.currentUser!.id;

  // ── lifecycle ──────────────────────────────────────────────────────────────

  @override
  void onInit() {
    super.onInit();
    loadMessages();

    scrollController.addListener(() {
      if (scrollController.position.pixels ==
              scrollController.position.maxScrollExtent &&
          hasMore &&
          !isLoading.value) {
        loadMessages();
      }
    });
  }

  @override
  void onClose() {
    scrollController.dispose();
    super.onClose();
  }

  // ── load paginated ─────────────────────────────────────────────────────────

  // AFTER — filters applied first, then order/range (correct)
  Future<void> loadMessages() async {
    isLoading.value = true;

    final List data;

    if (strategyId != null) {
      data = await supabase
          .from(SupabaseTable.aiChatMessages)
          .select()
          .eq('strategy_id', strategyId!) // filter first
          .order('created_at', ascending: false)
          .range(_page * _limit, (_page + 1) * _limit - 1);
    } else {
      data = await supabase
          .from(SupabaseTable.aiChatMessages)
          .select()
          .isFilter('strategy_id', null) // filter first
          .eq('user_id', _userId) // filter first
          .order('created_at', ascending: false)
          .range(_page * _limit, (_page + 1) * _limit - 1);
    }

    if (data.length < _limit) hasMore = false;

    final fetched = data
        .map((e) => AiMessageModel.fromJson(e))
        .toList()
        .reversed
        .toList();

    messages.insertAll(0, fetched);
    _page++;
    isLoading.value = false;
  }

  // ── send message ───────────────────────────────────────────────────────────

  Future<void> sendMessage(String text, {AiTaxStrategyModel? strategy}) async {
    if (text.trim().isEmpty) return;

    final userMsg = AiMessageModel(
      id: 0,
      strategyId: strategyId,
      userId: _userId,
      role: AiChatRole.user,
      message: text,
      createdAt: DateTime.now(),
    );

    messages.add(userMsg);

    // Persist user message.
    await supabase
        .from(SupabaseTable.aiChatMessages)
        .insert(userMsg.toInsertJson());

    isSending.value = true;

    // Call AI with optional strategy context.
    final aiReply = await _callAI(strategy: strategy);

    final aiMsg = AiMessageModel(
      id: 0,
      strategyId: strategyId,
      userId: _userId,
      role: AiChatRole.ai,
      message: aiReply,
      createdAt: DateTime.now(),
    );

    messages.add(aiMsg);

    // Persist AI response.
    await supabase
        .from(SupabaseTable.aiChatMessages)
        .insert(aiMsg.toInsertJson());

    isSending.value = false;
    scrollToBottom();
  }

  // ── AI call ────────────────────────────────────────────────────────────────

  Future<String> _callAI({AiTaxStrategyModel? strategy}) async {
    // Build a rolling window of recent context.
    final lastMessages = messages.reversed.take(6).toList();
    final chatHistory = lastMessages
        .map((m) => '${m.role.name}: ${m.message}')
        .join('\n');

    // Prompt is dynamic — richer when a strategy is attached.
    final prompt = strategy != null
        ? '''
You are a US tax expert helping the user understand a specific tax strategy.

Strategy: ${strategy.title}
Summary:  ${strategy.summary}
Steps:    ${strategy.implementationSteps.join(', ')}

Conversation so far:
$chatHistory

Answer the user's follow-up questions. Be concise, practical, and compliant.
'''
        : '''
You are a US tax expert (CPA). The user has a general tax question.

Conversation so far:
$chatHistory

Answer clearly, concisely, and in plain English. Mention when they should consult a licensed CPA.
''';

    final response = await http.post(
      Uri.parse('https://openrouter.ai/api/v1/chat/completions'),
      headers: {
        'Authorization': 'Bearer $getOpenRouterAiTaxKey',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'model': 'openai/gpt-4.1-mini',
        'messages': [
          {'role': 'system', 'content': 'You are a CPA.'},
          {'role': 'user', 'content': prompt},
        ],
        'max_tokens': 600,
        'temperature': 0.3,
      }),
    );

    final data = jsonDecode(response.body);
    return data['choices'][0]['message']['content'] as String;
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  void scrollToBottom() {
    Future.delayed(const Duration(milliseconds: 300), () {
      if (scrollController.hasClients) {
        scrollController.animateTo(
          scrollController.position.minScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }
}
