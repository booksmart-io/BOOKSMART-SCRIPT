class CategoryModel {
  final int id;
  final String name;
  final int addedBy;
  final bool isDeleted;
  final DateTime createdAt;
  final DateTime updatedAt;

  CategoryModel({
    required this.id,
    required this.name,
    required this.addedBy,
    required this.isDeleted,
    required this.createdAt,
    required this.updatedAt,
  });

  factory CategoryModel.fromJson(Map<String, dynamic> json) {
    return CategoryModel(
      id: json['id'],
      name: json['name'] ?? '',
      addedBy: json['added_by'],
      isDeleted: json['is_deleted'] ?? false,
      createdAt: DateTime.parse(json['created_at']),
      updatedAt: DateTime.parse(json['updated_at']),
    );
  }

  Map<String, dynamic> toJsonForStatusUpdate() {
    return {'is_deleted': isDeleted};
  }
}

class SubCategoryModel {
  final int id;
  final int categoryId;
  final String name;
  final int addedBy;
  final bool isDeleted;
  final DateTime createdAt;
  final DateTime updatedAt;

  SubCategoryModel({
    required this.id,
    required this.categoryId,
    required this.name,
    required this.addedBy,
    required this.isDeleted,
    required this.createdAt,
    required this.updatedAt,
  });

  factory SubCategoryModel.fromJson(Map<String, dynamic> json) {
    return SubCategoryModel(
      id: json['id'],
      categoryId: json['category_id'],
      name: json['name'] ?? '',
      addedBy: json['added_by'],
      isDeleted: json['is_deleted'] ?? false,
      createdAt: DateTime.parse(json['created_at']),
      updatedAt: DateTime.parse(json['updated_at']),
    );
  }
}
