enum AiChatRole { user, ai }

class AiMessageModel {
  final int id;
  final int? strategyId;
  final String userId;
  final AiChatRole role;
  final String message;
  final DateTime createdAt;

  AiMessageModel({
    required this.id,
    required this.strategyId,
    required this.userId,
    required this.role,
    required this.message,
    required this.createdAt,
  });

  factory AiMessageModel.fromJson(Map<String, dynamic> json) {
    return AiMessageModel(
      id: json['id'] as int,
      strategyId: json['strategy_id'] as int,
      userId: json['user_id'] as String,
      role: AiChatRole.values.byName(json['role']),
      message: json['message'] as String,
      createdAt: DateTime.parse(json['created_at']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'strategy_id': strategyId,
      'user_id': userId,
      'role': role.name,
      'message': message,
      'created_at': createdAt.toIso8601String(),
    };
  }

  Map<String, dynamic> toInsertJson() {
    return {
      'strategy_id': strategyId,
      'role': role.name,
      'message': message,
      'user_id': userId,
    };
  }

  AiMessageModel copyWith({
    int? id,
    int? strategyId,
    String? userId,
    AiChatRole? role,
    String? message,
    DateTime? createdAt,
  }) {
    return AiMessageModel(
      id: id ?? this.id,
      strategyId: strategyId ?? this.strategyId,
      userId: userId ?? this.userId,
      role: role ?? this.role,
      message: message ?? this.message,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}
