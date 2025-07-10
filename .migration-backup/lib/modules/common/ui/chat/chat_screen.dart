// ignore_for_file: deprecated_member_use

import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/widgets/custom_dialog.dart';
import 'package:flutter/foundation.dart';
import 'package:booksmart/modules/user/ui/cpa/order/create_order_screen.dart';
import 'package:get/get.dart';
import 'package:booksmart/models/user_base_model.dart';
import 'package:jiffy/jiffy.dart';
import '../../controllers/chat_controller.dart';
import 'package:booksmart/modules/common/controllers/auth_controller.dart';
import 'package:booksmart/models/message_model.dart';

// Add this function to open chat as dialog on web
void goToChatScreen(PersonModel otherUser, {bool shouldCloseBefore = false}) {
  if (kIsWeb) {
    if (shouldCloseBefore) {
      Get.back(); // close previous dialog
    }
    customDialog(
      child: ChatScreen(otherUser: otherUser),
      title:
          '${otherUser.firstName} ${otherUser.lastName} : ${otherUser.role.name.toUpperCase()}',
      barrierDismissible: true,
      maxWidth: 600, // Adjusted for better chat experience
    );
  } else {
    if (shouldCloseBefore) {
      Get.off(() => ChatScreen(otherUser: otherUser));
    } else {
      Get.to(() => ChatScreen(otherUser: otherUser));
    }
  }
}

class ChatScreen extends StatefulWidget {
  final PersonModel otherUser;
  const ChatScreen({super.key, required this.otherUser});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final TextEditingController _controller = TextEditingController();
  final ChatController chatController = Get.put(ChatController());

  // To handle scrolling
  final ScrollController _scrollController = ScrollController();

  int _limit = 20;

  List<MessageModel> _cachedMessages = [];
  int? _lastChatId;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      chatController.loadChat(widget.otherUser.id);
    });

    _scrollController.addListener(() {
      // Check if scrolled to top (end of list because reverse: true)
      if (_scrollController.position.pixels >=
          _scrollController.position.maxScrollExtent - 200) {
        setState(() {
          _limit += 20;
        });
      }
    });
  }

  Future<void> _sendMessage() async {
    if (_controller.text.trim().isEmpty) return;

    final text = _controller.text;
    _controller.clear();

    final currentChat = chatController.currentChat.value;
    if (currentChat != null) {
      if (mounted) {
        setState(() {
          _cachedMessages.insert(
            0,
            MessageModel(
              id: DateTime.now().millisecondsSinceEpoch,
              chatId: currentChat.id,
              senderId: chatController.currentUserId,
              content: text,
              type: MessageType.text,
              isRead: false,
              createdAt: DateTime.now(),
            ),
          );
        });
      }
    }

    await chatController.sendMessage(text);

    if (mounted) {
      setState(() {});
    }
  }

  // Calculate isMe helper
  bool _isMe(int senderId) {
    return senderId == (Get.find<AuthController>().person?.id ?? -1);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    // Use the other user's name
    final title = "${widget.otherUser.firstName} ${widget.otherUser.lastName}";

    return Scaffold(
      // Only show app bar on mobile, dialog handles title on web
      appBar: kIsWeb
          ? null
          : AppBar(
              title: AppText(title, fontSize: 18, fontWeight: FontWeight.bold),
              centerTitle: true,
            ),
      body: Column(
        children: [
          Expanded(
            child: Obx(() {
              // Wait for chat to be loaded
              final chat = chatController.currentChat.value;
              if (chat == null) {
                return const Center(child: CircularProgressIndicator());
              }

              return StreamBuilder<List<Map<String, dynamic>>>(
                stream: chatController.getMessagesStream(chat.id, _limit),
                builder: (context, snapshot) {
                  if (_lastChatId != chat.id) {
                    _cachedMessages.clear();
                    _lastChatId = chat.id;
                  }

                  if (snapshot.hasData) {
                    _cachedMessages = snapshot.data!
                        .map((e) => MessageModel.fromJson(e))
                        .toList();
                  } else if (snapshot.hasError && _cachedMessages.isEmpty) {
                    return Center(child: Text('Error: ${snapshot.error}'));
                  }

                  if (_cachedMessages.isEmpty && !snapshot.hasData) {
                    return const Center(child: CircularProgressIndicator());
                  }

                  if (_cachedMessages.isEmpty) {
                    return const Center(
                      child: Text("Start the conversation now!"),
                    );
                  }

                  return ListView.builder(
                    key: ValueKey(chat.id), // Ensure fresh list on chat switch
                    padding: const EdgeInsets.all(16),
                    itemCount: _cachedMessages.length,
                    reverse: true, // Show newest at bottom
                    itemBuilder: (context, index) {
                      final msg = _cachedMessages[index];
                      final isMe = _isMe(msg.senderId);

                      return Align(
                        alignment: isMe
                            ? Alignment.centerRight
                            : Alignment.centerLeft,
                        child: Card(
                          margin: const EdgeInsets.symmetric(vertical: 6),
                          elevation: 0,
                          color: isMe
                              ? Colors.yellow.withValues(alpha: 0.3)
                              : colorScheme.surfaceVariant,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.only(
                              topLeft: const Radius.circular(14),
                              topRight: const Radius.circular(14),
                              bottomLeft: isMe
                                  ? const Radius.circular(14)
                                  : const Radius.circular(0),
                              bottomRight: isMe
                                  ? const Radius.circular(0)
                                  : const Radius.circular(14),
                            ),
                          ),
                          child: Container(
                            constraints: BoxConstraints(
                              maxWidth:
                                  MediaQuery.of(context).size.width * 0.75,
                            ),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 10,
                            ),
                            child: Column(
                              crossAxisAlignment: isMe
                                  ? CrossAxisAlignment.end
                                  : CrossAxisAlignment.start,
                              children: [
                                AppText(
                                  msg.content,
                                  fontSize: 14,
                                  //color: isMe ? Colors.black : null,
                                ),
                                const SizedBox(height: 4),
                                AppText(
                                  Jiffy.parseFromDateTime(
                                    msg.createdAt.toLocal(),
                                  ).jm,
                                  fontSize: 10,
                                  //color: isMe ? Colors.black : Colors.black,
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  );
                },
              );
            }),
          ),

          // Text Field and Buttons
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Column(
              children: [
                AppTextField(
                  controller: _controller,
                  hintText: "Securely send a message...",
                  suffixWidget: IconButton(
                    onPressed: _sendMessage,
                    icon: Icon(Icons.send, color: colorScheme.primary),
                  ),
                  textInputAction: TextInputAction.done,
                  onFieldSubmit: (value) {
                    _sendMessage();
                  },
                ),
                const SizedBox(height: 10),
              ],
            ),
          ),
          if (authPerson?.role == UserRole.cpa)
            Container(
              width: double.infinity,
              padding: EdgeInsets.only(bottom: 8, left: 8, right: 8),
              child: ElevatedButton.icon(
                onPressed: () {
                  goToCreateOrderCPAScreen(
                    userId: widget.otherUser.id,
                    userName:
                        "${widget.otherUser.firstName} ${widget.otherUser.lastName}",
                  );
                },
                icon: const Icon(Icons.add_task, color: Colors.black),
                label: Text(
                  "Send Order Request",
                  style: TextStyle(color: Colors.black),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: colorScheme.primary,
                  foregroundColor: colorScheme.onPrimary,
                ),
              ),
            ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }
}
