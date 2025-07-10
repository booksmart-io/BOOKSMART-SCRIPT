import 'package:booksmart/models/user_base_model.dart';
import '../helpers/json_helper.dart';

class ChatModel {
  final int id;
  final int senderId;
  final int receiverId;
  final String lastMessage;
  final DateTime lastMessageTime;
  final DateTime createdAt;
  final DateTime updatedAt;
  final PersonModel? sender;
  final PersonModel? receiver;

  ChatModel({
    required this.id,
    required this.senderId,
    required this.receiverId,
    required this.lastMessage,
    required this.lastMessageTime,
    required this.createdAt,
    required this.updatedAt,
    this.sender,
    this.receiver,
  });

  factory ChatModel.fromJson(Map<String, dynamic> json) {
    return ChatModel(
      id: handleResponseFromJson<int>(json, "id") ?? -1,
      senderId: handleResponseFromJson<int>(json, "sender_id") ?? -1,
      receiverId: handleResponseFromJson<int>(json, "receiver_id") ?? -1,
      lastMessage: handleResponseFromJson<String>(json, "last_message") ?? "",
      lastMessageTime:
          DateTime.tryParse(
            handleResponseFromJson<String>(json, "last_message_time") ?? "",
          ) ??
          DateTime.now(),
      createdAt:
          DateTime.tryParse(
            handleResponseFromJson<String>(json, "created_at") ?? "",
          ) ??
          DateTime.now(),
      updatedAt:
          DateTime.tryParse(
            handleResponseFromJson<String>(json, "updated_at") ?? "",
          ) ??
          DateTime.now(),
      sender: json['sender'] != null
          ? PersonModel.fromJson(json['sender'])
          : null,
      receiver: json['receiver'] != null
          ? PersonModel.fromJson(json['receiver'])
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      "id": id,
      "sender_id": senderId,
      "receiver_id": receiverId,
      "last_message": lastMessage,
      "last_message_time": lastMessageTime.toIso8601String(),
      "created_at": createdAt.toIso8601String(),
      "updated_at": updatedAt.toIso8601String(),
    };
  }
}
