import '../helpers/json_helper.dart';

enum ProductType {
  subscription('subscription'),
  tokens('tokens'),
  unknown('unknown');

  const ProductType(this.value);

  final String value;

  static ProductType fromValue(String value) {
    return ProductType.values.firstWhere(
      (type) => type.value == value,
      orElse: () => ProductType.unknown,
    );
  }
}

class SubscriptionModel {
  final int id;
  final String userId;
  final String stripeCustomerId;
  final String stripeSubscriptionId;
  final String stripePriceId;
  final String stripeProductId;
  final ProductType productType;
  final String status;
  final DateTime currentPeriodStart;
  final DateTime currentPeriodEnd;
  final bool cancelAtPeriodEnd;
  final DateTime? canceledAt;
  final DateTime? trialStart;
  final DateTime? trialEnd;
  final DateTime createdAt;
  final DateTime updatedAt;

  SubscriptionModel({
    required this.id,
    required this.userId,
    required this.stripeCustomerId,
    required this.stripeSubscriptionId,
    required this.stripePriceId,
    required this.stripeProductId,
    required this.productType,
    required this.status,
    required this.currentPeriodStart,
    required this.currentPeriodEnd,
    required this.cancelAtPeriodEnd,
    required this.canceledAt,
    required this.trialStart,
    required this.trialEnd,
    required this.createdAt,
    required this.updatedAt,
  });

  bool get isActive => status == 'active' || status == 'trialing';
  bool get isTrialing => status == 'trialing';

  String get statusLabel {
    return status
        .split('_')
        .map((part) {
          if (part.isEmpty) return part;
          return '${part[0].toUpperCase()}${part.substring(1)}';
        })
        .join(' ');
  }

  factory SubscriptionModel.fromJson(Map<String, dynamic> json) {
    return SubscriptionModel(
      id: handleResponseFromJson<int>(json, 'id') ?? -1,
      userId: handleResponseFromJson<String>(json, 'user_id') ?? '',
      stripeCustomerId:
          handleResponseFromJson<String>(json, 'stripe_customer_id') ?? '',
      stripeSubscriptionId:
          handleResponseFromJson<String>(json, 'stripe_subscription_id') ?? '',
      stripePriceId:
          handleResponseFromJson<String>(json, 'stripe_price_id') ?? '',
      stripeProductId:
          handleResponseFromJson<String>(json, 'stripe_product_id') ?? '',
      productType: ProductType.fromValue(
        handleResponseFromJson<String>(json, 'product_type') ??
            ProductType.subscription.value,
      ),
      status: handleResponseFromJson<String>(json, 'status') ?? '',
      currentPeriodStart: _dateFromJson(json, 'current_period_start'),
      currentPeriodEnd: _dateFromJson(json, 'current_period_end'),
      cancelAtPeriodEnd:
          handleResponseFromJson<bool>(json, 'cancel_at_period_end') ?? false,
      canceledAt: _nullableDateFromJson(json, 'canceled_at'),
      trialStart: _nullableDateFromJson(json, 'trial_start'),
      trialEnd: _nullableDateFromJson(json, 'trial_end'),
      createdAt: _dateFromJson(json, 'created_at'),
      updatedAt: _dateFromJson(json, 'updated_at'),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'stripe_customer_id': stripeCustomerId,
      'stripe_subscription_id': stripeSubscriptionId,
      'stripe_price_id': stripePriceId,
      'stripe_product_id': stripeProductId,
      'product_type': productType.value,
      'status': status,
      'current_period_start': currentPeriodStart.toIso8601String(),
      'current_period_end': currentPeriodEnd.toIso8601String(),
      'cancel_at_period_end': cancelAtPeriodEnd,
      'canceled_at': canceledAt?.toIso8601String(),
      'trial_start': trialStart?.toIso8601String(),
      'trial_end': trialEnd?.toIso8601String(),
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  static DateTime _dateFromJson(Map<String, dynamic> json, String key) {
    return _nullableDateFromJson(json, key) ?? DateTime.now();
  }

  static DateTime? _nullableDateFromJson(
    Map<String, dynamic> json,
    String key,
  ) {
    final value = handleResponseFromJson<String>(json, key);
    if (value == null || value.isEmpty) return null;
    return DateTime.tryParse(value);
  }
}
