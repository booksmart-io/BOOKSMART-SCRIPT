import 'package:booksmart/models/user_base_model.dart';
import '../helpers/json_helper.dart';

enum OrderStatus {
  pending,
  accepted,
  rejected,
  completed,
  cancelled,
  revision,
  delivered;

  static OrderStatus fromString(String status) {
    return OrderStatus.values.firstWhere(
      (element) => element.name == status,
      orElse: () => OrderStatus.pending,
    );
  }
}

enum StripePaymentStatus {
  unpaid,
  paid,
  processing,
  failed,
  refunded;

  static StripePaymentStatus fromString(String status) {
    return StripePaymentStatus.values.firstWhere(
      (e) => e.name == status,
      orElse: () => StripePaymentStatus.unpaid,
    );
  }
}

enum CpaPayoutStatus {
  pending,
  paid;

  static CpaPayoutStatus fromString(String status) {
    return CpaPayoutStatus.values.firstWhere(
      (e) => e.name == status,
      orElse: () => CpaPayoutStatus.pending,
    );
  }
}

class OrderModel {
  final int id;
  final int cpaId;
  final int userId;
  final String title;
  final String? description;
  final double amount;
  final OrderStatus status;
  final DateTime createdAt;
  final DateTime updatedAt;
  final int? daysToComplete;
  final DateTime? expirationDate;
  final PersonModel? cpa;
  final PersonModel? user;

  final String? stripePaymentIntentId;
  final StripePaymentStatus paymentStatus;
  final DateTime? paidAt;

  final double? platformFee;

  final double? cpaPayoutAmount;
  final CpaPayoutStatus cpaPayoutStatus;
  final DateTime? cpaPaidAt;
  final String? stripeTransferId;

  final int? cancelledBy;
  final String? cancellationReason;
  final DateTime? cancelledAt;

  final String? deliverMessage;
  final DateTime? deliverAt;
  final List<String> services;
  final List<String>? deliveryFiles;
  final List<String>? deliverables;
  final String? cancellationPolicy;

  final String? userReviewMessage;
  final double? userReviewStars;
  final DateTime? userReviewAt;

  OrderModel({
    required this.id,
    required this.cpaId,
    required this.userId,
    required this.title,
    this.description,
    required this.amount,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    this.daysToComplete,
    this.expirationDate,
    this.cpa,
    this.user,
    this.stripePaymentIntentId,
    required this.paymentStatus,
    this.paidAt,

    this.platformFee,

    this.cpaPayoutAmount,
    required this.cpaPayoutStatus,
    this.cpaPaidAt,
    this.stripeTransferId,

    this.cancelledBy,
    this.cancellationReason,
    this.cancelledAt,

    this.deliverMessage,
    this.deliverAt,
    this.services = const [],
    this.deliveryFiles,
    this.deliverables,
    this.cancellationPolicy,

    this.userReviewMessage,
    this.userReviewStars,
    this.userReviewAt,
  });

  factory OrderModel.fromJson(Map<String, dynamic> json) {
    return OrderModel(
      id: handleResponseFromJson<int>(json, "id") ?? -1,
      cpaId: handleResponseFromJson<int>(json, "cpa_id") ?? -1,
      userId: handleResponseFromJson<int>(json, "user_id") ?? -1,
      title: handleResponseFromJson<String>(json, "title") ?? "",
      description: handleResponseFromJson<String>(json, "description"),
      amount: (handleResponseFromJson<num>(json, "amount") ?? 0).toDouble(),
      status: OrderStatus.fromString(
        handleResponseFromJson<String>(json, "status") ?? "pending",
      ),
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
      daysToComplete: handleResponseFromJson<int>(json, "days_to_complete"),
      expirationDate: DateTime.tryParse(
        handleResponseFromJson<String>(json, "expiration_date") ?? "",
      ),
      cpa: json['cpa'] != null ? PersonModel.fromJson(json['cpa']) : null,
      user: json['user'] != null ? PersonModel.fromJson(json['user']) : null,
      stripePaymentIntentId: handleResponseFromJson<String>(
        json,
        "stripe_payment_intent_id",
      ),

      paymentStatus: StripePaymentStatus.fromString(
        handleResponseFromJson<String>(json, "payment_status") ?? "unpaid",
      ),

      paidAt: DateTime.tryParse(
        handleResponseFromJson<String>(json, "paid_at") ?? "",
      ),

      platformFee: (handleResponseFromJson<num>(
        json,
        "platform_fee",
      ))?.toDouble(),

      cpaPayoutAmount: (handleResponseFromJson<num>(
        json,
        "cpa_payout_amount",
      ))?.toDouble(),

      cpaPayoutStatus: CpaPayoutStatus.fromString(
        handleResponseFromJson<String>(json, "cpa_payout_status") ?? "pending",
      ),

      cpaPaidAt: DateTime.tryParse(
        handleResponseFromJson<String>(json, "cpa_paid_at") ?? "",
      ),

      stripeTransferId: handleResponseFromJson<String>(
        json,
        "stripe_transfer_id",
      ),

      cancelledBy: handleResponseFromJson<int>(json, "cancelled_by"),
      cancellationReason: handleResponseFromJson<String>(
        json,
        "cancellation_reason",
      ),
      cancelledAt: DateTime.tryParse(
        handleResponseFromJson<String>(json, "cancelled_at") ?? "",
      ),

      deliverMessage: handleResponseFromJson<String>(json, "deliver_message"),
      deliverAt: DateTime.tryParse(
        handleResponseFromJson<String>(json, "deliver_at") ?? "",
      ),
      services: (json['services'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          [],
      deliveryFiles: (json['delivery_files'] as List<dynamic>?)
          ?.map((e) => e.toString())
          .toList(),
      deliverables: (json['deliverables'] as List<dynamic>?)
          ?.map((e) => e.toString())
          .toList(),
      cancellationPolicy: handleResponseFromJson<String>(
        json,
        "cancellation_policy",
      ),

      userReviewMessage: handleResponseFromJson<String>(
        json,
        "user_review_message",
      ),
      userReviewStars: (handleResponseFromJson<num>(
        json,
        "user_review_stars",
      ))?.toDouble(),
      userReviewAt: DateTime.tryParse(
        handleResponseFromJson<String>(json, "user_review_at") ?? "",
      ),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      "id": id,
      "cpa_id": cpaId,
      "user_id": userId,
      "title": title,
      "description": description,
      "amount": amount,
      "status": status.name,
      "created_at": createdAt.toIso8601String(),
      "updated_at": updatedAt.toIso8601String(),
      "days_to_complete": daysToComplete,
      "expiration_date": expirationDate?.toIso8601String(),
      "stripe_payment_intent_id": stripePaymentIntentId,
      "payment_status": paymentStatus.name,
      "paid_at": paidAt?.toIso8601String(),
      "platform_fee": platformFee,

      "cpa_payout_amount": cpaPayoutAmount,
      "cpa_payout_status": cpaPayoutStatus.name,
      "cpa_paid_at": cpaPaidAt?.toIso8601String(),
      "stripe_transfer_id": stripeTransferId,

      "cancelled_by": cancelledBy,
      "cancellation_reason": cancellationReason,
      "cancelled_at": cancelledAt?.toIso8601String(),

      "deliver_message": deliverMessage,
      "deliver_at": deliverAt?.toIso8601String(),
      "services": services,
      "delivery_files": deliveryFiles,
      "deliverables": deliverables,
      "cancellation_policy": cancellationPolicy,

      "user_review_message": userReviewMessage,
      "user_review_stars": userReviewStars,
      "user_review_at": userReviewAt?.toIso8601String(),
    };
  }
}
