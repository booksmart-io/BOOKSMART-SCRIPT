class LeadModel {
  final int id;
  final DateTime createdAt;
  final int userId;
  final int cpaId;
  final Map<String, dynamic>?
  userWrapper; // Changed to match join structure: user:users(...)

  LeadModel({
    required this.id,
    required this.createdAt,
    required this.userId,
    required this.cpaId,
    this.userWrapper,
  });

  factory LeadModel.fromJson(Map<String, dynamic> json) {
    return LeadModel(
      id: json['id'] is int
          ? json['id']
          : int.tryParse(json['id'].toString()) ?? 0,
      createdAt: DateTime.parse(json['created_at']),
      userId: json['user_id'] is int
          ? json['user_id']
          : int.tryParse(json['user_id'].toString()) ?? 0,
      cpaId: json['cpa_id'] is int
          ? json['cpa_id']
          : int.tryParse(json['cpa_id'].toString()) ?? 0,
      userWrapper: json['user'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'created_at': createdAt.toIso8601String(),
      'user_id': userId,
      'cpa_id': cpaId,
    };
  }
}
