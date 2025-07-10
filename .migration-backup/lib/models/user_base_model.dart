import '../helpers/json_helper.dart';

part 'user_model.dart';
part 'cpa_model.dart';
part 'admin_model.dart';

enum UserRole { user, cpa, admin }

abstract class Core {
  final PersonModel data;

  /// int based, auto increment ID by supabase
  int get id => data.id;

  /// uuid, created when user sign-up
  String get authId => data.authId;
  String get email => data.email;
  UserRole get role => data.role;
  String get firstName => data.firstName;
  String get middleName => data.middleName;
  String get lastName => data.lastName;
  String get phoneNumber => data.phoneNumber;
  String get imgUrl => data.imgUrl;
  DateTime get createdAt => data.createdAt;
  DateTime get updatedAt => data.updatedAt;

  Core({required this.data});
}

class PersonModel {
  /// int based, auto increment ID by supabase
  final int id;

  /// uuid, created when user sign-up
  final String authId;
  final String email;
  final UserRole role;
  final String firstName;
  final String middleName;
  final String lastName;
  final String phoneNumber;
  final String imgUrl;
  final DateTime createdAt;
  final DateTime updatedAt;

  PersonModel({
    required this.id,
    required this.authId,
    required this.email,
    required this.role,
    required this.firstName,
    required this.middleName,
    required this.lastName,
    required this.phoneNumber,
    required this.imgUrl,
    required this.createdAt,
    required this.updatedAt,
  });

  factory PersonModel.fromJson(Map<String, dynamic> json) {
    return PersonModel(
      id: handleResponseFromJson<int>(json, "id") ?? -1,
      authId: handleResponseFromJson<String>(json, "auth_id") ?? "",
      email: handleResponseFromJson<String>(json, "email") ?? "",
      role: UserRole.values.byName(json["role"]),
      firstName: handleResponseFromJson<String>(json, "first_name") ?? "",
      middleName: handleResponseFromJson<String>(json, "middle_name") ?? "",
      lastName: handleResponseFromJson<String>(json, "last_name") ?? "",
      phoneNumber: handleResponseFromJson<String>(json, "phone_number") ?? "",
      imgUrl: handleResponseFromJson<String>(json, "img_url") ?? "",
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
      "auth_id": authId,
      "email": email,
      "role": role.name,
      "first_name": firstName,
      "last_name": lastName,
      "phone_number": phoneNumber,
      "img_url": imgUrl,
      "created_at": createdAt.toIso8601String(),
      "updated_at": updatedAt.toIso8601String(),
    };
  }
}
