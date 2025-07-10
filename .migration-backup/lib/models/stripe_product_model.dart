import 'subscription_model.dart';

class StripePlan {
  final String id;
  final String name;
  final String? description;
  final ProductType productType;
  final List<StripePrice> prices;

  StripePlan({
    required this.id,
    required this.name,
    required this.description,
    required this.productType,
    required this.prices,
  });

  factory StripePlan.fromJson(Map<String, dynamic> json) {
    return StripePlan(
      id: json['id'],
      name: json['name'],
      description: json['description'],
      productType: ProductType.fromValue(json['product_type'] ?? ''),
      prices: (json['prices'] as List)
          .map((e) => StripePrice.fromJson(e))
          .toList(),
    );
  }

  bool get isSubscription => productType == ProductType.subscription;

  bool get isTokens => productType == ProductType.tokens;

  StripePrice get monthly => prices.firstWhere((e) => e.interval == 'month');

  StripePrice get yearly => prices.firstWhere((e) => e.interval == 'year');
}

class StripePrice {
  final String id;
  final int amount;
  final String currency;
  final String? interval;
  final String type;
  final int? tokenAmount;

  StripePrice({
    required this.id,
    required this.amount,
    required this.currency,
    required this.interval,
    required this.type,
    required this.tokenAmount,
  });

  factory StripePrice.fromJson(Map<String, dynamic> json) {
    return StripePrice(
      id: json['id'],
      amount: json['amount'] ?? 0,
      currency: json['currency'],
      interval: json['interval'],
      type: json['type'] ?? '',
      tokenAmount: int.tryParse('${json['token_amount'] ?? ''}'),
    );
  }

  double get amountInDollar => amount / 100;

  bool get isRecurring => type == 'recurring';

  bool get isOneTime => type == 'one_time';
}
