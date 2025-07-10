part of './user_base_model.dart';

class AdminModel extends Core {
  AdminModel({required super.data});

  bool get isProfileCompleted =>
      data.firstName.isNotEmpty && data.lastName.isNotEmpty;

  factory AdminModel.fromJson(Map<String, dynamic> json) {
    return AdminModel(data: PersonModel.fromJson(json));
  }

  Map<String, dynamic> toJson() {
    return super.data.toJson()..addAll({
      // add other fields for Admin
    });
  }
}
