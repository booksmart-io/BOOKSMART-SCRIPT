import 'package:booksmart/models/ai_tax_strategy_model.dart';
import 'package:flutter/foundation.dart';
import 'package:get/get.dart';

import '../../../../../constant/exports.dart';
import '../../../../../models/ai_message_model.dart';
import '../../../../../widgets/custom_dialog.dart';
import '../../../controllers/ai_chat_controller.dart';

void goToAiChatScreen({
  bool shouldCloseBefore = false,
  required AiTaxStrategyModel strategy,
}) {
  if (kIsWeb) {
    if (shouldCloseBefore) {
      Get.back();
    }
    customDialog(
      child: AIGenericChatScreen(strategy: strategy),
      title: strategy.title,
      barrierDismissible: true,
    );
  } else {
    if (shouldCloseBefore) {
      Get.off(() => AIGenericChatScreen(strategy: strategy));
    } else {
      Get.to(() => AIGenericChatScreen(strategy: strategy));
    }
  }
}

class AIGenericChatScreen extends StatefulWidget {
  /// When null → general AI chat (no strategy context).
  final AiTaxStrategyModel? strategy;

  const AIGenericChatScreen({super.key, this.strategy});

  @override
  State<AIGenericChatScreen> createState() => _AIGenericChatScreenState();
}

class _AIGenericChatScreenState extends State<AIGenericChatScreen> {
  late AiGenericChatController controller;
  final _textController = TextEditingController();

  // ── derived helpers ────────────────────────────────────────────────────────

  /// Unique tag so Get.put doesn't collide when both screens are in memory.
  String get _controllerTag =>
      widget.strategy != null ? 'strategy_${widget.strategy!.id}' : 'general';

  String get _hintText => widget.strategy != null
      ? 'Ask about this strategy…'
      : 'Ask any tax question…';

  // ── lifecycle ──────────────────────────────────────────────────────────────

  @override
  void initState() {
    super.initState();
    controller = Get.put(
      AiGenericChatController(widget.strategy?.id),
      tag: _controllerTag,
    );
  }

  @override
  void dispose() {
    _textController.dispose();
    super.dispose();
  }

  // ── actions ────────────────────────────────────────────────────────────────

  void _sendMessage() {
    final text = _textController.text.trim();
    if (text.isEmpty) return;
    _textController.clear();
    controller.sendMessage(text, strategy: widget.strategy);
  }

  // ── build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: widget.strategy == null
          ? AppBar(
              automaticallyImplyLeading: !kIsWeb,
              title: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('🧠', style: TextStyle(fontSize: 20)),
                  SizedBox(width: 8),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Booksmart AI',
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.2,
                        ),
                      ),
                      Text(
                        'Your personal tax advisor',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w400,
                          color: Colors.white70,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            )
          : kIsWeb
          ? null
          : AppBar(
              title: Text(widget.strategy!.title),
              bottom: PreferredSize(
                preferredSize: const Size.fromHeight(28),
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Chip(
                    label: const Text('Strategy context active'),
                    avatar: const Icon(Icons.auto_awesome, size: 14),
                    visualDensity: VisualDensity.compact,
                    labelStyle: const TextStyle(fontSize: 11),
                  ),
                ),
              ),
            ),
      body: Column(
        children: [
          // ── chat list ────────────────────────────────────────────────────
          Expanded(child: _buildMessageList()),

          // ── input bar ────────────────────────────────────────────────────
          _buildInputBar(),
        ],
      ),
    );
  }

  // ── chat list ──────────────────────────────────────────────────────────────

  Widget _buildMessageList() {
    return Obx(() {
      if (controller.messages.isEmpty && controller.isLoading.value) {
        return const Center(child: CircularProgressIndicator());
      }

      if (controller.messages.isEmpty) {
        return _buildEmptyState();
      }

      return ListView.builder(
        controller: controller.scrollController,
        reverse: true,
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: controller.messages.length + (controller.hasMore ? 1 : 0),
        itemBuilder: (context, index) {
          // Load-more spinner pinned at the bottom of the reversed list.
          if (index == controller.messages.length) {
            return const Padding(
              padding: EdgeInsets.all(12),
              child: Center(child: CircularProgressIndicator()),
            );
          }

          final msg =
              controller.messages[controller.messages.length - 1 - index];

          return _buildMessageBubble(msg);
        },
      );
    });
  }

  // ── empty state ────────────────────────────────────────────────────────────

  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              widget.strategy != null
                  ? Icons.account_balance
                  : Icons.chat_bubble_outline,
              size: 56,
              color: Colors.grey.shade400,
            ),
            const SizedBox(height: 16),
            Text(
              widget.strategy != null
                  ? 'Ask anything about\n"${widget.strategy!.title}"'
                  : 'Ask me any US tax question',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 16, color: Colors.grey.shade600),
            ),
          ],
        ),
      ),
    );
  }

  // ── input bar ──────────────────────────────────────────────────────────────

  Widget _buildInputBar() {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 6, 10, 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: TextFormField(
                controller: _textController,
                onFieldSubmitted: (_) => _sendMessage(),
                textInputAction: TextInputAction.send,
                maxLines: 4,
                minLines: 1,
                decoration: InputDecoration(
                  hintText: _hintText,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 10,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Obx(() {
              return AnimatedSwitcher(
                duration: const Duration(milliseconds: 200),
                child: controller.isSending.value
                    ? const SizedBox(
                        key: ValueKey('loading'),
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(strokeWidth: 2.5),
                      )
                    : IconButton(
                        key: const ValueKey('send'),
                        icon: const Icon(Icons.send),
                        onPressed: _sendMessage,
                      ),
              );
            }),
          ],
        ),
      ),
    );
  }

  // ── message bubble ─────────────────────────────────────────────────────────

  Widget _buildMessageBubble(AiMessageModel msg) {
    final isUser = msg.role == AiChatRole.user;
    final time = TimeOfDay.fromDateTime(msg.createdAt.toLocal());
    final formattedTime =
        '${time.hourOfPeriod == 0 ? 12 : time.hourOfPeriod}:'
        '${time.minute.toString().padLeft(2, '0')} '
        '${time.period == DayPeriod.am ? 'AM' : 'PM'}';

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: Column(
        crossAxisAlignment: isUser
            ? CrossAxisAlignment.end
            : CrossAxisAlignment.start,
        children: [
          // ── AI label ──────────────────────────────────────────────────
          if (!isUser)
            Padding(
              padding: const EdgeInsets.only(left: 4, bottom: 4),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: const [
                  Text('🧠', style: TextStyle(fontSize: 14)),
                  SizedBox(width: 5),
                  Text(
                    'Booksmart AI',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Colors.blueGrey,
                      letterSpacing: 0.3,
                    ),
                  ),
                ],
              ),
            ),

          // ── bubble ────────────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            constraints: BoxConstraints(
              maxWidth: MediaQuery.of(context).size.width * 0.72,
            ),
            decoration: BoxDecoration(
              color: isUser ? Colors.blue : Colors.grey.shade100,
              borderRadius: BorderRadius.only(
                topLeft: const Radius.circular(16),
                topRight: const Radius.circular(16),
                bottomLeft: Radius.circular(isUser ? 16 : 4),
                bottomRight: Radius.circular(isUser ? 4 : 16),
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.06),
                  blurRadius: 4,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Text(
              msg.message,
              style: TextStyle(
                color: isUser ? Colors.white : Colors.black87,
                height: 1.45,
                fontSize: 14,
              ),
            ),
          ),

          // ── timestamp ─────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.only(top: 3, left: 4, right: 4),
            child: Text(
              formattedTime,
              style: TextStyle(fontSize: 10.5, color: Colors.grey.shade500),
            ),
          ),
        ],
      ),
    );
  }
}
