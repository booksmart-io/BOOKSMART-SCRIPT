import '../helpers/json_helper.dart';

enum MessageType { text, image, file }

class MessageModel {
  final int id;
  final int chatId;
  final int senderId;
  final String content;
  final MessageType type;
  final bool isRead;
  final DateTime createdAt;

  MessageModel({
    required this.id,
    required this.chatId,
    required this.senderId,
    required this.content,
    required this.type,
    required this.isRead,
    required this.createdAt,
  });

  factory MessageModel.fromJson(Map<String, dynamic> json) {
    return MessageModel(
      id: handleResponseFromJson<int>(json, "id") ?? -1,
      chatId: handleResponseFromJson<int>(json, "chat_id") ?? -1,
      senderId: handleResponseFromJson<int>(json, "sender_id") ?? -1,
      content: handleResponseFromJson<String>(json, "content") ?? "",
      type: MessageType.values.firstWhere(
        (e) =>
            e.name == (handleResponseFromJson<String>(json, "type") ?? "text"),
        orElse: () => MessageType.text,
      ),
      isRead: handleResponseFromJson<bool>(json, "is_read") ?? false,
      createdAt:
          DateTime.tryParse(
            handleResponseFromJson<String>(json, "created_at") ?? "",
          ) ??
          DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      "id": id,
      "chat_id": chatId,
      "sender_id": senderId,
      "content": content,
      "type": type.name,
      "is_read": isRead,
      "created_at": createdAt.toIso8601String(),
    };
  }
}
