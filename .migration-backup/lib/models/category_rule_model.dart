class CategoryRuleModel {
  final int id;
  final String memo;
  final int categoryId;
  final int? subCategoryId;

  /// authId of user - changed from int to string
  final String userId;
  final bool status;
  final DateTime createdAt;
  final DateTime updatedAt;

  CategoryRuleModel({
    required this.id,
    required this.memo,
    required this.categoryId,
    this.subCategoryId,
    required this.userId,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
  });

  factory CategoryRuleModel.fromJson(Map<String, dynamic> json) {
    return CategoryRuleModel(
      id: json['id'],
      memo: json['memo'],
      categoryId: json['category_id'],
      subCategoryId: json['sub_category_id'],
      userId: json['user_id'],
      status: json['status'] ?? true,
      createdAt: DateTime.parse(json['created_at']),
      updatedAt: DateTime.parse(json['updated_at']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'memo': memo,
      'category_id': categoryId,
      'sub_category_id': subCategoryId,
      'user_id': userId,
      'status': status,
    };
  }
}
