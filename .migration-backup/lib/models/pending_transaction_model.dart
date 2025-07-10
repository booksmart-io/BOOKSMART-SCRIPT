class PendingTransactionModel {
  final int id;
  final int importId;
  final int userId;
  final int orgId;
  String title;
  double amount;
  DateTime dateTime;
  String description;
  String transactionType;
  final double? runningBalance;
  final bool isDuplicate;
  final int? duplicateOfId;
  int? categoryId;
  int? subCategoryId;
  String status;

  PendingTransactionModel.fromJson(Map<String, dynamic> j)
      : id = j['id'],
        importId = j['import_id'],
        userId = j['user_id'],
        orgId = j['org_id'],
        title = j['title'] ?? '',
        amount = (j['amount'] as num).toDouble(),
        dateTime = DateTime.parse(j['date_time']),
        description = j['description'] ?? '',
        transactionType = j['transaction_type'] ?? 'debit',
        runningBalance = j['running_balance'] != null
            ? (j['running_balance'] as num).toDouble()
            : null,
        isDuplicate = j['is_duplicate'] ?? false,
        duplicateOfId = j['duplicate_of_id'],
        categoryId = j['category_id'],
        subCategoryId = j['sub_category_id'],
        status = j['status'] ?? 'pending';

  Map<String, dynamic> toJson() => {
        'id': id,
        'import_id': importId,
        'user_id': userId,
        'org_id': orgId,
        'title': title,
        'amount': amount,
        'date_time': dateTime.toIso8601String(),
        'description': description,
        'transaction_type': transactionType,
        'running_balance': runningBalance,
        'is_duplicate': isDuplicate,
        'duplicate_of_id': duplicateOfId,
        'category_id': categoryId,
        'sub_category_id': subCategoryId,
        'status': status,
      };
}
