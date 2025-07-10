import '../helpers/json_helper.dart';

class ServiceModel {
  final int id;
  final String title;
  final String description;
  final double price;
  final int cpaId;
  final DateTime createdAt;
  final DateTime updatedAt;

  ServiceModel({
    required this.id,
    required this.title,
    required this.description,
    required this.price,
    required this.cpaId,
    required this.createdAt,
    required this.updatedAt,
  });

  factory ServiceModel.fromJson(Map<String, dynamic> json) {
    return ServiceModel(
      id: handleResponseFromJson<int>(json, "id") ?? -1,
      title: handleResponseFromJson<String>(json, "title") ?? "",
      description: handleResponseFromJson<String>(json, "description") ?? "",
      price: (handleResponseFromJson<num>(json, "price") ?? 0.0).toDouble(),
      cpaId: handleResponseFromJson<int>(json, "cpa_id") ?? -1,
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
    );
  }

  Map<String, dynamic> toJson() {
    return {
      "id": id,
      "title": title,
      "description": description,
      "price": price,
      "cpa_id": cpaId,
      "created_at": createdAt.toIso8601String(),
      "updated_at": updatedAt.toIso8601String(),
    };
  }
}
