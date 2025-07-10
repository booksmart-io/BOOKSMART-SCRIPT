import 'package:booksmart/models/lead_model.dart';
import 'package:booksmart/models/user_base_model.dart';
import 'package:booksmart/modules/common/ui/chat/chat_screen.dart';
import 'package:booksmart/modules/user/ui/cpa/order/create_order_screen.dart';
import 'package:booksmart/modules/user/ui/cpa/order/user_documents_dialog.dart';
import 'package:booksmart/widgets/app_text.dart';
import 'package:booksmart/widgets/custom_circle_avatar.dart';
import 'package:flutter/material.dart';
import 'package:jiffy/jiffy.dart';
import 'package:get/get.dart';
import 'package:booksmart/widgets/custom_dialog.dart';

class LeadCard extends StatefulWidget {
  const LeadCard({super.key, required this.lead});
  final LeadModel lead;

  @override
  State<LeadCard> createState() => _LeadCardState();
}

class _LeadCardState extends State<LeadCard> {
  @override
  Widget build(BuildContext context) {
    final user = widget.lead.userWrapper;

    final name = user != null
        ? "${user['first_name']} ${user['last_name']}"
        : "Unknown User";
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () {
          _showUserDetailDialog(context, user);
        },
        child: Container(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              CustomCircleAvatar(
                radius: 25,
                imgUrl: user!['img_url'],
                alternateText: user['first_name'],
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AppText(name, fontSize: 14, fontWeight: FontWeight.bold),
                    AppText(
                      'Received: ${Jiffy.parseFromDateTime(widget.lead.createdAt.toLocal()).fromNow()}',
                      fontSize: 12,
                    ),
                  ],
                ),
              ),

              const SizedBox(width: 8),
              IconButton(
                key: const Key('send_order_request_icon_btn'),
                onPressed: () {
                  goToCreateOrderCPAScreen(
                    userId: widget.lead.userId,
                    userName: name,
                  );
                },
                icon: const Icon(Icons.request_quote_outlined),
                tooltip: 'Send order request',
              ),
              const SizedBox(width: 8),
              IconButton(
                onPressed: () {
                  final personData = Map<String, dynamic>.from(user);
                  final person = PersonModel.fromJson(personData);
                  goToChatScreen(person);
                },
                icon: const Icon(Icons.chat_bubble_outline),
                tooltip: 'Chat',
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showUserDetailDialog(BuildContext context, Map<String, dynamic>? user) {
    const Color orangeColor = Color(0xFFF5C542);

    customDialog(
      title: 'User Details',
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (user != null) ...[
              CustomCircleAvatar(
                radius: 40,
                imgUrl: user['img_url'],
                alternateText: user['first_name'],
              ),
              const SizedBox(height: 12),
              AppText(
                "${user['first_name']} ${user['last_name']}",
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
              if (user['email'] != null) ...[
                const SizedBox(height: 4),
                AppText(user['email'], fontSize: 14, color: Colors.grey),
              ],
              const SizedBox(height: 24),
            ] else ...[
              const AppText("Unknown User"),
              const SizedBox(height: 24),
            ],

            /// 🔽 ROW 1
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    key: const Key('chat_btn'),
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: orangeColor),
                      foregroundColor: orangeColor,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    onPressed: () {
                      if (user != null) {
                        Get.back();
                        final personData = Map<String, dynamic>.from(user);
                        final person = PersonModel.fromJson(personData);
                        goToChatScreen(person);
                      }
                    },
                    child: const Text("Chat", style: TextStyle(fontSize: 12)),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton(
                    key: const Key('documents_btn'),
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: orangeColor),
                      foregroundColor: orangeColor,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    onPressed: () {
                      Get.back();
                      showUserDocumentsDialog(lead: widget.lead);
                    },
                    child: const Text(
                      "Documents",
                      style: TextStyle(fontSize: 12),
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 10),

            /// 🔽 ROW 2
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    key: const Key('send_order_request_btn'),
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: orangeColor),
                      foregroundColor: orangeColor,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    onPressed: () {
                      final userName = user != null
                          ? "${user['first_name']} ${user['last_name']}"
                          : "Unknown User";
                      goToCreateOrderCPAScreen(
                        shouldCloseBefore: true,
                        userId: widget.lead.userId,
                        userName: userName,
                      );
                    },
                    child: const Text(
                      "Send Order Request",
                      style: TextStyle(fontSize: 12),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
