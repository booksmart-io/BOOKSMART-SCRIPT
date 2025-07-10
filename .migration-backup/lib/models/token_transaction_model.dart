import '../helpers/json_helper.dart';

enum TokenTransactionType {
  purchase('purchase'),
  spend('spend'),
  refund('refund'),
  bonus('bonus'),
  adReward('ad_reward'),
  adminAdjustment('admin_adjustment');

  const TokenTransactionType(this.value);

  final String value;

  static TokenTransactionType fromValue(String value) {
    return TokenTransactionType.values.firstWhere(
      (type) => type.value == value,
      orElse: () => TokenTransactionType.purchase,
    );
  }
}

enum TokenTransactionStatus {
  pending('pending'),
  posted('posted'),
  failed('failed'),
  refunded('refunded');

  const TokenTransactionStatus(this.value);

  final String value;

  static TokenTransactionStatus fromValue(String value) {
    return TokenTransactionStatus.values.firstWhere(
      (status) => status.value == value,
      orElse: () => TokenTransactionStatus.posted,
    );
  }
}

class TokenTransactionModel {
  final int id;
  final String userId;
  final int amount;
  final int balanceAfter;
  final TokenTransactionType type;
  final TokenTransactionStatus status;
  final String? useCase;
  final String? stripeCustomerId;
  final String? stripePaymentIntentId;
  final String? stripeCheckoutSessionId;
  final String? stripePriceId;
  final String? stripeProductId;
  final DateTime createdAt;

  TokenTransactionModel({
    required this.id,
    required this.userId,
    required this.amount,
    required this.balanceAfter,
    required this.type,
    required this.status,
    required this.useCase,
    required this.stripeCustomerId,
    required this.stripePaymentIntentId,
    required this.stripeCheckoutSessionId,
    required this.stripePriceId,
    required this.stripeProductId,
    required this.createdAt,
  });

  bool get isCredit => amount > 0;
  bool get isDebit => amount < 0;

  factory TokenTransactionModel.fromJson(Map<String, dynamic> json) {
    return TokenTransactionModel(
      id: handleResponseFromJson<int>(json, 'id') ?? -1,
      userId: handleResponseFromJson<String>(json, 'user_id') ?? '',
      amount: handleResponseFromJson<int>(json, 'amount') ?? 0,
      balanceAfter: handleResponseFromJson<int>(json, 'balance_after') ?? 0,
      type: TokenTransactionType.fromValue(
        handleResponseFromJson<String>(json, 'type') ?? '',
      ),
      status: TokenTransactionStatus.fromValue(
        handleResponseFromJson<String>(json, 'status') ?? '',
      ),
      useCase: handleResponseFromJson<String>(json, 'use_case'),
      stripeCustomerId: handleResponseFromJson<String>(
        json,
        'stripe_customer_id',
      ),
      stripePaymentIntentId: handleResponseFromJson<String>(
        json,
        'stripe_payment_intent_id',
      ),
      stripeCheckoutSessionId: handleResponseFromJson<String>(
        json,
        'stripe_checkout_session_id',
      ),
      stripePriceId: handleResponseFromJson<String>(json, 'stripe_price_id'),
      stripeProductId: handleResponseFromJson<String>(
        json,
        'stripe_product_id',
      ),
      createdAt: dateFromJson(json, 'created_at'),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'amount': amount,
      'balance_after': balanceAfter,
      'type': type.value,
      'status': status.value,
      'use_case': useCase,
      'stripe_customer_id': stripeCustomerId,
      'stripe_payment_intent_id': stripePaymentIntentId,
      'stripe_checkout_session_id': stripeCheckoutSessionId,
      'stripe_price_id': stripePriceId,
      'stripe_product_id': stripeProductId,
      'created_at': createdAt.toIso8601String(),
    };
  }
}
