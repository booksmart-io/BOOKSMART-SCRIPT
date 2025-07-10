import 'dart:developer';

import 'package:booksmart/modules/common/controllers/auth_controller.dart';
import 'package:booksmart/services/crud_service.dart';
import 'package:booksmart/supabase/tables.dart';
import 'package:get/get.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../models/chat_model.dart';
import '../../../models/message_model.dart';
import '../../../models/user_base_model.dart';
import '../../../utils/supabase.dart';

class ChatController extends GetxController {
  // --- Pagination & Realtime Variables ---
  // Chat List
  final myChats = <ChatModel>[].obs;
  final isChatsLoadingMore = false.obs;
  bool hasMoreChats = true;
  int _chatsPage = 0;
  final int _chatsLimit = 15;

  // Messages
  // final messages = <MessageModel>[].obs; // Unused
  final isLoading = false.obs; // Used for chat list loading
  // actually fetchMyChats uses isLoading.

  Rx<ChatModel?> currentChat = Rx<ChatModel?>(null);

  // Get current user ID (int)
  int get currentUserId => Get.find<AuthController>().person?.id ?? -1;

  @override
  void onInit() {
    fetchMyChats();
    _subscribeToMyChats();
    super.onInit();
  }

  @override
  void onClose() {
    // unsubscribe handling if needed
    supabase
        .removeAllChannels(); // simplistic cleanup, better to store subscription
    super.onClose();
  }

  // --- Chat List Logic ---

  Future<void> fetchMyChats({bool isLoadMore = false}) async {
    if (isLoadMore) {
      if (isChatsLoadingMore.value || !hasMoreChats) return;
      isChatsLoadingMore.value = true;
    } else {
      isLoading.value = true;
      _chatsPage = 0;
      hasMoreChats = true;
      myChats.clear();
    }

    try {
      final start = _chatsPage * _chatsLimit;
      final end = start + _chatsLimit - 1;

      final result = await supabase
          .from(SupabaseTable.chats)
          .select('*, sender:sender_id(*), receiver:receiver_id(*)')
          .or('sender_id.eq.$currentUserId,receiver_id.eq.$currentUserId')
          .order('last_message_time', ascending: false)
          .range(start, end);

      final newChats = (result as List)
          .map((e) => ChatModel.fromJson(e))
          .toList();

      if (newChats.length < _chatsLimit) {
        hasMoreChats = false;
      }

      if (isLoadMore) {
        myChats.addAll(newChats);
      } else {
        myChats.assignAll(newChats);
      }

      _chatsPage++;
    } catch (e) {
      log("Error fetching my chats: $e");
    } finally {
      if (isLoadMore) {
        isChatsLoadingMore.value = false;
      } else {
        isLoading.value = false;
      }
      update();
    }
  }

  void _subscribeToMyChats() {
    supabase
        .channel('public:chats:$currentUserId')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: SupabaseTable.chats,
          // Listen to all changes, assume RLS or filter in callback
          callback: (payload) async {
            if (payload.eventType == PostgresChangeEvent.insert ||
                payload.eventType == PostgresChangeEvent.update) {
              final newRecord = payload.newRecord;
              final senderId = newRecord['sender_id'];
              final receiverId = newRecord['receiver_id'];

              // Filter for relevant chats if RLS is not strict
              if (senderId != currentUserId && receiverId != currentUserId) {
                return;
              }

              final chatId = newRecord['id'];

              // We need to fetch the full chat object to get sender/receiver details relations
              // Use single fetch
              final chatData = await supabase
                  .from(SupabaseTable.chats)
                  .select('*, sender:sender_id(*), receiver:receiver_id(*)')
                  .eq('id', chatId)
                  .maybeSingle();

              if (chatData != null) {
                final chat = ChatModel.fromJson(chatData);

                // Remove existing if present to move to top
                final index = myChats.indexWhere((c) => c.id == chat.id);
                if (index != -1) {
                  myChats.removeAt(index);
                }

                // Insert at top
                myChats.insert(0, chat);
                myChats.refresh(); // Ensure observers are notified
                update();
              }
            }
          },
        )
        .subscribe();
  }

  // --- Specific Chat Logic ---

  Future<void> loadChat(int otherUserId) async {
    try {
      currentChat.value = null; // Clear previous chat context

      ChatModel? chat = await _getChat(otherUserId);

      if (chat == null) {
        chat = await _createChat(otherUserId);
      } else {
        // Chat exists, but check if lead exists
        await _checkAndCreateLead(otherUserId);
      }

      if (chat != null) {
        currentChat.value = chat;
      }
    } catch (e) {
      log("Error loading chat: $e");
    } finally {
      update();
    }
  }

  Future<void> _checkAndCreateLead(int otherUserId) async {
    try {
      final authController = Get.find<AuthController>();
      if (authController.person?.role == UserRole.user) {
        // Check if other user is CPA
        final otherUserMap = await supabase
            .from(SupabaseTable.user)
            .select('role')
            .eq('id', otherUserId)
            .maybeSingle();

        if (otherUserMap != null && otherUserMap['role'] == 'cpa') {
          // Check if lead record already exists
          final leadExists = await supabase
              .from(SupabaseTable.leads)
              .select('id')
              .eq('user_id', currentUserId)
              .eq('cpa_id', otherUserId)
              .maybeSingle();

          if (leadExists == null) {
            // Create Lead
            await SupabaseCrudService.insert(
              table: SupabaseTable.leads,
              data: {'user_id': currentUserId, 'cpa_id': otherUserId},
            );
          }
        }
      }
    } catch (e) {
      log("Error in _checkAndCreateLead: $e");
    }
  }

  Future<ChatModel?> _getChat(int otherUserId) async {
    try {
      final result = await supabase
          .from(SupabaseTable.chats)
          .select()
          .or(
            'and(sender_id.eq.$currentUserId,receiver_id.eq.$otherUserId),and(sender_id.eq.$otherUserId,receiver_id.eq.$currentUserId)',
          )
          .maybeSingle();

      if (result != null) {
        return ChatModel.fromJson(result);
      }
      return null;
    } catch (e) {
      log("Error getting chat: $e");
      return null;
    }
  }

  Future<ChatModel?> _createChat(int otherUserId) async {
    try {
      final data = {
        'sender_id': currentUserId,
        'receiver_id': otherUserId,
        'last_message': '',
        'last_message_time': DateTime.now().toIso8601String(),
      };

      final result = await SupabaseCrudService.insert(
        table: SupabaseTable.chats,
        data: data,
      );

      if (result is List && result.isNotEmpty) {
        // Check if we need to create a lead
        // Case: Current user is User, Other user is CPA
        try {
          // We need to know the role of the other user.
          // Since we don't have the full PersonModel of the other user here easily without fetching,
          // we can check if the current user is a 'user'.
          // If so, we assume they might be chatting with a CPA (or we should verify).
          // For now, let's assume we need to check the other user's role.

          // Actually, we can just try to insert into leads if I am a User.
          // The constraint is: user_id (me), cpa_id (them).
          // If they are not a CPA, what happens? Ideally we should check.

          final authController = Get.find<AuthController>();
          if (authController.person?.role == UserRole.user) {
            // Check if other user is CPA
            final otherUserMap = await supabase
                .from(SupabaseTable.user)
                .select('role')
                .eq('id', otherUserId)
                .maybeSingle();
            if (otherUserMap != null && otherUserMap['role'] == 'cpa') {
              // Create Lead
              await SupabaseCrudService.insert(
                table: SupabaseTable.leads,
                data: {
                  'user_id': currentUserId,
                  'cpa_id': otherUserId,
                  // created_at is default now()
                },
              );
            }
          }
        } catch (e) {
          log("Error creating lead: $e");
          // Don't block chat creation
        }

        return ChatModel.fromJson(result.first);
      }
      return null;
    } catch (e) {
      log("Error creating chat: $e");
      return null;
    }
  }

  Future<void> sendMessage(String content) async {
    if (currentChat.value == null || content.trim().isEmpty) return;

    try {
      final messageData = {
        'chat_id': currentChat.value!.id,
        'sender_id': currentUserId,
        'content': content,
        'type': MessageType.text.name,
        'is_read': false,
      };

      await SupabaseCrudService.insert(
        table: SupabaseTable.messages,
        data: messageData,
      );

      // Update chat last message
      await SupabaseCrudService.update(
        table: SupabaseTable.chats,
        data: {
          'last_message': content,
          'last_message_time': DateTime.now().toIso8601String(),
        },
        filters: {'id': currentChat.value!.id},
      );
    } catch (e) {
      log("Error sending message: $e");
    }
    fetchMyChats();
  }

  Stream<List<Map<String, dynamic>>> getMessagesStream(int chatId, int limit) {
    return supabase
        .from(SupabaseTable.messages)
        .stream(primaryKey: ['id'])
        .eq('chat_id', chatId)
        .order('created_at', ascending: false)
        .limit(limit);
  }
}
