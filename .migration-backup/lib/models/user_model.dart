part of './user_base_model.dart';

class UserModel extends Core {
  UserModel({
    required super.data,
    this.stripeCustomerId,
    this.tokenBalance = 0,
  });

  bool get isProfileCompleted =>
      data.firstName.isNotEmpty && data.lastName.isNotEmpty;

  final String? stripeCustomerId;
  final int tokenBalance;

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      data: PersonModel.fromJson(json),
      stripeCustomerId: json['stripe_customer_id'],
      tokenBalance: json['token_balance'] ?? 0,
    );
  }

  Map<String, dynamic> toJson() {
    return super.data.toJson()..addAll({
      'stripe_customer_id': stripeCustomerId,
      'token_balance': tokenBalance,
    });
  }
}
