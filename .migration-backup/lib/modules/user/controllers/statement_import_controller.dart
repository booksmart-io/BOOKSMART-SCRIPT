import 'dart:async';
import 'dart:developer';

import 'package:booksmart/models/pending_transaction_model.dart';
import 'package:booksmart/modules/user/controllers/financial_report_controller.dart';
import 'package:booksmart/modules/user/controllers/transaction_controller.dart';
import 'package:booksmart/supabase/tables.dart';
import 'package:booksmart/utils/supabase.dart';
import 'package:get/get.dart';

class StatementImportController extends GetxController {
  final int importId;
  StatementImportController(this.importId);

  final rows = <PendingTransactionModel>[].obs;
  final importStatus = 'processing'.obs;
  final errorMessage = ''.obs;
  final isLoading = false.obs;

  Timer? _poller;
  int _pollCount = 0;
  static const _maxPolls = 30; // 90 seconds max (30 × 3s)

  @override
  void onInit() {
    super.onInit();
    _startPolling();
  }

  @override
  void onClose() {
    _poller?.cancel();
    super.onClose();
  }

  void cancelPolling() {
    _poller?.cancel();
  }

  void _startPolling() {
    _poller = Timer.periodic(const Duration(seconds: 3), (_) async {
      _pollCount++;
      if (_pollCount >= _maxPolls) {
        _poller?.cancel();
        importStatus.value = 'failed';
        errorMessage.value = 'Processing timed out. Please try again.';
        return;
      }
      try {
        final result = await supabase
            .from(SupabaseTable.statementImports)
            .select('status, error_message')
            .eq('id', importId)
            .single();

        importStatus.value = result['status'] ?? 'processing';
        errorMessage.value = result['error_message'] ?? '';

        if (importStatus.value == 'completed') {
          _poller?.cancel();
          await fetchRows();
        } else if (importStatus.value == 'failed') {
          _poller?.cancel();
        }
      } catch (e) {
        // Polling errors are non-fatal — keep retrying
      }
    });
  }

  Future<void> fetchRows() async {
    try {
      isLoading.value = true;
      final result = await supabase
          .from(SupabaseTable.pendingTransactions)
          .select()
          .eq('import_id', importId)
          .eq('status', 'pending')
          .order('date_time', ascending: true);
      rows.value =
          (result as List).map((e) => PendingTransactionModel.fromJson(e)).toList();
    } catch (e) {
      log('StatementImportController.fetchRows error: $e');
    } finally {
      isLoading.value = false;
    }
  }

  Future<void> approveTransaction(PendingTransactionModel row) async {
    try {
      // Direct insert — TransactionController.addTransaction() calls Get.back()
      // which would close the review screen, so we insert directly.
      final txJson = {
        'user_id': row.userId,
        'org_id': row.orgId,
        'title': row.title,
        'amount': row.transactionType == 'debit' ? -row.amount.abs() : row.amount.abs(),
        'description': row.description,
        'type': 'Business',
        'deductible': true,
        'date_time': row.dateTime.toIso8601String(),
        'is_ai_verified': false,
        if (row.categoryId != null) 'category_id': row.categoryId,
        if (row.subCategoryId != null) 'sub_category_id': row.subCategoryId,
      };
      await supabase.from(SupabaseTable.transaction).insert(txJson);

      // Refresh transaction list if controller is already registered
      final tag = row.orgId.toString();
      if (Get.isRegistered<TransactionController>(tag: tag)) {
        Get.find<TransactionController>(tag: tag).getAllTransactions();
      }

      await supabase
          .from(SupabaseTable.pendingTransactions)
          .delete()
          .eq('id', row.id);

      rows.removeWhere((r) => r.id == row.id);
      await _cleanupIfDone();
    } catch (e) {
      log('approveTransaction error: $e');
      Get.snackbar('Error', 'Failed to approve transaction');
    }
  }

  Future<void> rejectTransaction(PendingTransactionModel row) async {
    try {
      await supabase
          .from(SupabaseTable.pendingTransactions)
          .delete()
          .eq('id', row.id);
      rows.removeWhere((r) => r.id == row.id);
      await _cleanupIfDone();
    } catch (e) {
      log('rejectTransaction error: $e');
      Get.snackbar('Error', 'Failed to reject transaction');
    }
  }

  Future<void> editAndApprove(
    PendingTransactionModel row,
    Map<String, dynamic> updates,
  ) async {
    if (updates['title'] != null) row.title = updates['title'];
    if (updates['amount'] != null) row.amount = updates['amount'];
    if (updates['date_time'] != null) {
      row.dateTime = DateTime.parse(updates['date_time']);
    }
    if (updates['description'] != null) row.description = updates['description'];
    if (updates['transaction_type'] != null) {
      row.transactionType = updates['transaction_type'];
    }
    if (updates['category_id'] != null) row.categoryId = updates['category_id'];
    if (updates['sub_category_id'] != null) {
      row.subCategoryId = updates['sub_category_id'];
    }
    await approveTransaction(row);
  }

  Future<void> approveAll() async {
    final toApprove = List<PendingTransactionModel>.from(rows);
    for (final row in toApprove) {
      await approveTransaction(row);
    }
  }

  Future<void> rejectAll() async {
    try {
      await supabase
          .from(SupabaseTable.pendingTransactions)
          .delete()
          .eq('import_id', importId);
      rows.clear();
    } catch (e) {
      log('rejectAll error: $e');
    }
  }

  // Deletes all remaining pending_transaction rows once review is complete (Option B)
  Future<void> _cleanupIfDone() async {
    if (rows.isNotEmpty) return;
    try {
      await supabase
          .from(SupabaseTable.pendingTransactions)
          .delete()
          .eq('import_id', importId);
    } catch (e) {
      log('_cleanupIfDone error: $e');
    }
    _refreshReports();
  }

  void _refreshReports() {
    if (!Get.isRegistered<FinancialReportController>()) return;
    final frc = Get.find<FinancialReportController>();
    final start = frc.lastStartDate;
    final end = frc.lastEndDate;
    if (start == null || end == null) return;
    frc.fetchAndAggregateData(startDate: start, endDate: end);
  }
}
