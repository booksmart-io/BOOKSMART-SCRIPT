class StateModel {
  final int id;
  final String name;
  final String code;
  final bool isActive;

  StateModel({
    required this.id,
    required this.name,
    required this.code,
    this.isActive = true,
  });

  factory StateModel.fromJson(Map<String, dynamic> json) {
    return StateModel(
      id: json['id'],
      name: json['name'],
      code: json['code'],
      isActive: json['is_active'] ?? true,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'code': code,
      'is_active': isActive,
    };
  }
}
