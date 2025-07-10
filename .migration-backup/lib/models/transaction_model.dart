import 'package:booksmart/helpers/json_helper.dart';

class TransactionModel {
  final int id;
  final String title;
  final double amount;
  final int? category;
  final int? subcategory;
  final String type; // Personal / Business
  final bool deductible;
  final String description;
  final DateTime dateTime;
  final String? filePath; // Optional attachment
  final int userId;
  final int orgId;

  /// {
  ///   "primary": "GENERAL_MERCHANDISE",
  ///   "detailed": "GENERAL_MERCHANDISE_SUPERSTORES",
  ///   "confidence_level": "VERY_HIGH"
  /// }
  ///
  final Map<String, dynamic>? plaidCategory;
  final int? bankId;
  final String? bankAccountId;
  final String? plaidTransactionId;

  final bool isAiVerified;


  TransactionModel({
    required this.id,
    required this.title,
    required this.amount,
    required this.category,
    required this.subcategory,
    required this.type,
    required this.deductible,
    required this.description,
    required this.dateTime,
    this.filePath,
    required this.userId,
    required this.orgId,
    this.plaidCategory,
    this.bankId,
    this.bankAccountId,
    this.plaidTransactionId,
    this.isAiVerified = true,

  });

  factory TransactionModel.fromJson(Map<String, dynamic> json) =>
      TransactionModel(
        id: handleResponseFromJson<int?>(json, 'id')!,
        title: handleResponseFromJson<String?>(json, 'title') ?? '---',
        amount: handleResponseFromJson<double?>(json, 'amount') ?? 0,
        category: handleResponseFromJson<int?>(json, 'category_id'),
        subcategory: handleResponseFromJson<int?>(json, 'sub_category_id'),
        type: handleResponseFromJson<String?>(json, 'type') ?? '---',
        deductible: handleResponseFromJson<bool?>(json, 'deductible') ?? false,
        description: handleResponseFromJson<String?>(json, 'description') ?? "",
        dateTime: DateTime.parse(json['date_time']),
        filePath: handleResponseFromJson<String?>(json, 'file_path'),
        userId: handleResponseFromJson<int?>(json, 'user_id')!,
        orgId: handleResponseFromJson<int?>(json, 'org_id')!,
        plaidCategory: json['plaid_category'] as Map<String, dynamic>?,
        bankId: handleResponseFromJson<int?>(json, 'bank_id'),
        bankAccountId: handleResponseFromJson<String?>(json, 'bank_account_id'),
        plaidTransactionId: handleResponseFromJson<String?>(
          json,
          'plaid_transaction_id',
        ),
        isAiVerified:
            handleResponseFromJson<bool?>(json, 'is_ai_verified') ?? true,

      );

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'org_id': orgId,
      'title': title,
      'amount': amount,
      'category_id': category,
      'sub_category_id': subcategory,
      'type': type,
      'deductible': deductible,
      'description': description,
      'date_time': dateTime.toIso8601String(),
      'file_path': filePath,
      'plaid_category': plaidCategory,
      'bank_id': bankId,
      'bank_account_id': bankAccountId,
      'plaid_transaction_id': plaidTransactionId,
      'is_ai_verified': isAiVerified,

    }..removeWhere((key, value) => value == null);
  }

  bool get isFromBank => bankId != null;
}
