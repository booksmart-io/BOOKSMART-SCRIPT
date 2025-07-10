import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/modules/common/ui/chat/chat_screen.dart';
import 'package:booksmart/widgets/custom_circle_avatar.dart';
import 'package:flutter/foundation.dart';
import 'package:get/get.dart';

import 'package:booksmart/modules/common/controllers/chat_controller.dart';
import 'package:booksmart/models/chat_model.dart';
import 'package:booksmart/modules/common/controllers/auth_controller.dart';
import 'package:jiffy/jiffy.dart';

class ChatListScreen extends StatefulWidget {
  const ChatListScreen({super.key});

  @override
  State<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends State<ChatListScreen> {
  late ChatController chatController;
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    if (Get.isRegistered<ChatController>()) {
      chatController = Get.find<ChatController>();
    } else {
      chatController = Get.put(ChatController());
    }

    _scrollController.addListener(() {
      if (_scrollController.position.pixels >=
          _scrollController.position.maxScrollExtent - 200) {
        chatController.fetchMyChats(isLoadMore: true);
      }
    });

    super.initState();
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    final currentUserId = Get.find<AuthController>().person?.id;

    return GetBuilder<ChatController>(
      builder: (controller) {
        if (controller.isLoading.value) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        return Scaffold(
          appBar: kIsWeb ? null : AppBar(title: const Text('Chats')),
          body: Obx(() {
            // Wrap with Obx for reactive list updates
            final chats = controller.myChats;

            if (chats.isEmpty && !controller.isLoading.value) {
              return const Center(child: Text("No recent chats"));
            }

            return ListView.builder(
              controller: _scrollController,
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              itemCount:
                  chats.length + (controller.isChatsLoadingMore.value ? 1 : 0),
              itemBuilder: (context, index) {
                if (index == chats.length) {
                  return const Padding(
                    padding: EdgeInsets.all(8.0),
                    child: Center(child: CircularProgressIndicator()),
                  );
                }

                final ChatModel chat = chats[index];
                final isSenderMe = chat.senderId == currentUserId;
                final otherUser = isSenderMe ? chat.receiver : chat.sender;
                if (otherUser == null) return const SizedBox();
                return Card(
                  child: ListTile(
                    leading: CustomCircleAvatar(
                      radius: 25,
                      imgUrl: otherUser.imgUrl,
                      alternateText: otherUser.firstName,
                    ),
                    title: AppText(
                      "${otherUser.firstName} ${otherUser.lastName}",
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                    subtitle: AppText(
                      chat.lastMessage.isNotEmpty
                          ? chat.lastMessage
                          : "Start chatting...",
                      fontSize: 13,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    trailing: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        AppText(
                          otherUser.role.name.toUpperCase(),
                          fontSize: 10,
                          color: colorScheme.primary,
                          fontWeight: FontWeight.bold,
                        ),
                        const SizedBox(height: 4),
                        AppText(
                          Jiffy.parseFromDateTime(
                            chat.lastMessageTime,
                          ).fromNow(),
                          fontSize: 11,
                          color: Colors.grey,
                        ),
                      ],
                    ),
                    onTap: () {
                      goToChatScreen(otherUser, shouldCloseBefore: false);
                    },
                  ),
                );
              },
            );
          }),
        );
      },
    );
  }
}
