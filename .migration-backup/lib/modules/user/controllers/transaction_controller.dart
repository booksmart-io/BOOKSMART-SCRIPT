import 'dart:developer';
import 'package:booksmart/modules/user/controllers/organization_controller.dart';
import 'package:booksmart/models/transaction_model.dart';
import 'package:booksmart/services/crud_service.dart';
import 'package:booksmart/supabase/tables.dart';
import 'package:booksmart/widgets/snackbar.dart';
import 'package:booksmart/utils/supabase.dart';
import 'package:booksmart/widgets/loading.dart';
import 'package:get/get.dart';

TransactionController transactionControllerInstance =
    Get.find<TransactionController>(tag: getCurrentOrganization!.id.toString());

/// TAG: currentOrganizationID
class TransactionController extends GetxController {
  final String table = SupabaseTable.transaction;

  RxBool isLoading = false.obs;
  RxBool isLoadMoreLoading = false.obs;
  RxList<TransactionModel> transactions = <TransactionModel>[].obs;
  RxList<TransactionModel> catagoriesTransactions = <TransactionModel>[].obs;

  bool hasMore = true;
  int _offset = 0;
  final int _limit = 10;

  //-------------
  RxBool isAiLoading = false.obs;
  RxBool isAiLoadMoreLoading = false.obs;

  bool hasMoreAi = true;
  int _aiOffset = 0;
  // reuse _limit (no need to create new one)

  @override
  void onInit() {
    super.onInit();
    getTransactions();
  }

  Future<void> getTransactions({
    bool isLoadMore = false,
    String? searchQuery,
    Object? category,
    String? type,
    String? amountRange,
    DateTime? startDate,
    DateTime? endDate,
    String?
    bankAccountId, // Plaid account ID from BankAccountModel.plaidAccountId
    // bool? isAiVerified,
    // bool? isCategoryNotNull,
  }) async {
    try {
      if (isLoadMore) {
        if (!hasMore || isLoadMoreLoading.value) return;
        isLoadMoreLoading.value = true;
      } else {
        isLoading.value = true;
        _offset = 0;
        hasMore = true;
        transactions.clear();
      }

      dynamic query = supabase
          .from(table)
          .select()
          .eq('org_id', getCurrentOrganization!.id);

      // Search filter
      if (searchQuery != null && searchQuery.isNotEmpty) {
        query = query.ilike('title', '%$searchQuery%');
      }

      // Category filter
      if (category != null && category != "All") {
        query = query.eq('category_id', category);
      }

      // Bank Account filter
      if (bankAccountId != null && bankAccountId.isNotEmpty) {
        query = query.eq('bank_account_id', bankAccountId);
      }

      // Type filter
      if (type != null && type != "All") {
        query = query.eq('type', type);
      }

      // Amount Range filter
      if (amountRange != null && amountRange != "All") {
        switch (amountRange) {
          case "Under \$50":
            query = query.lt('amount', 50).gt('amount', -50);
            break;
          case "\$50 - \$200":
            // For both positive and negative (expenses/income)
            // This logic might be tricky with just Supabase query.
            // Usually absolute value is better but Supabase doesn't have abs() in simple filter easily.
            // Let's assume we filter based on positive amount logic or just range.
            // User's previous code: t.amount.abs() >= 50 && t.amount.abs() <= 200
            // We can use an OR filter if needed, but for simplicity let's stick to simple range or ask.
            // Actually, we can use .or('and(amount.gte.50,amount.lte.200),and(amount.lte.-50,amount.gte.-200)')
            query = query.or(
              'and(amount.gte.50,amount.lte.200),and(amount.lte.-50,amount.gte.-200)',
            );
            break;
          case "\$200 - \$500":
            query = query.or(
              'and(amount.gt.200,amount.lte.500),and(amount.lt.-200,amount.gte.-500)',
            );
            break;
          case "Over \$500":
            query = query.or('amount.gt.500,amount.lt.-500');
            break;
        }
      }

      // Date filter
      if (startDate != null && endDate != null) {
        query = query.gte('date_time', startDate.toIso8601String());
        query = query.lte('date_time', endDate.toIso8601String());
      }

      // Pagination and Sorting
      query = query
          .order('date_time', ascending: false)
          .range(_offset, _offset + _limit - 1);

      final res = await query;

      final List<TransactionModel> fetchedTransactions = (res as List)
          .map((e) => TransactionModel.fromJson(e))
          .toList();

      if (fetchedTransactions.length < _limit) {
        hasMore = false;
      }

      if (isLoadMore) {
        transactions.addAll(fetchedTransactions);
        _offset += _limit;
      } else {
        transactions.value = fetchedTransactions;
        _offset = _limit;
      }
    } catch (e, s) {
      log("❌ getTransactions ERROR");
      log(e.toString());
      log(s.toString());
      somethingWentWrongSnackbar();
    } finally {
      isLoading.value = false;
      isLoadMoreLoading.value = false;
      update();
    }
  }

  //-------- get ai trasections

  Future<void> getAiCatagoriesTrasections({
    bool isLoadMore = false,
    bool isAiVerified = false,
    bool isCategoryNotNull = true,
  }) async {
    try {
      if (isLoadMore) {
        if (!hasMoreAi || isAiLoadMoreLoading.value) return;
        isAiLoadMoreLoading.value = true;
      } else {
        isAiLoading.value = true;
        _aiOffset = 0;
        hasMoreAi = true;
        catagoriesTransactions.clear();
      }

      dynamic query = supabase
          .from(table)
          .select()
          .eq('org_id', getCurrentOrganization!.id);

      /// ✅ AI Verified filter
      query = query.eq('is_ai_verified', isAiVerified);

      /// ✅ Category not null filter
      if (isCategoryNotNull) {
        query = query.not('category_id', 'is', null);
      }

      /// ✅ Pagination
      query = query
          .order('date_time', ascending: false)
          .range(_aiOffset, _aiOffset + _limit - 1);

      final res = await query;

      final List<TransactionModel> fetched = (res as List)
          .map((e) => TransactionModel.fromJson(e))
          .toList();

      if (fetched.length < _limit) {
        hasMoreAi = false;
      }

      if (isLoadMore) {
        catagoriesTransactions.addAll(fetched);
        _aiOffset += _limit;
      } else {
        catagoriesTransactions.value = fetched;
        _aiOffset = _limit;
      }
    } catch (e, s) {
      log("❌ aiCatagoriesTrasections ERROR");
      log(e.toString());
      log(s.toString());
      somethingWentWrongSnackbar();
    } finally {
      isAiLoading.value = false;
      isAiLoadMoreLoading.value = false;
      update();
    }
  }

  /// Alias for backward compatibility if needed elsewhere
  Future<void> getAllTransactions() async => getTransactions();

  Future<void> addTransaction(TransactionModel transaction) async {
    try {
      Map<String, dynamic> json = transaction.toJson();
      json.remove("id");
      await SupabaseCrudService.create(
        table: table,
        data: json,
        isShowLoading: true,
      );
      getAllTransactions();
      Get.back();
      showSnackBar("Transaction added successfully");
    } catch (e, s) {
      log(e.toString());
      log(s.toString());
      somethingWentWrongSnackbar();
    }
    update();
  }

  /// Like [addTransaction] but returns the newly created row's ID.
  Future<int?> addTransactionAndReturnId(TransactionModel transaction) async {
    try {
      Map<String, dynamic> json = transaction.toJson();
      json.remove("id");
      showLoading();
      final res = await supabase.from(table).insert(json).select('id').single();
      dismissLoadingWidget();
      getAllTransactions();
      Get.back();
      showSnackBar("Transaction added successfully");
      return res['id'] as int?;
    } catch (e, s) {
      dismissLoadingWidget();
      log(e.toString());
      log(s.toString());
      somethingWentWrongSnackbar();
      return null;
    } finally {
      update();
    }
  }

  Future<void> updateTransaction({
    required int id,
    required TransactionModel data,
  }) async {
    try {
      log("📤 UPDATE TRANSACTION DATA: $data");
      Map<String, dynamic> json = data.toJson();
      json.remove('id'); // remove id before sending to Supabase
      await SupabaseCrudService.update(
        table: table,
        data: json,
        filters: {'id': id},
        isShowLoading: true,
      );
      getAllTransactions();
      Get.back();
      showSnackBar("Transaction updated successfully");
    } catch (e, s) {
      log("❌ updateTransaction ERROR");
      log(e.toString());
      log(s.toString());
      somethingWentWrongSnackbar();
    }
    update();
  }

  Future<void> approveTransactions({
    required List<int> ids,
    bool isAiVerified = false,
    bool isCategoryNotNull = true,
  }) async {
    try {
      showLoading();
      await supabase
          .from(table)
          .update({'is_ai_verified': true})
          .filter('id', 'in', '(${ids.join(",")})');

      dismissLoadingWidget();

      showSnackBar("Transactions approved successfully");
    } catch (e, s) {
      log("❌ approveTransactions ERROR: $e");
      log(s.toString());
      dismissLoadingWidget();
      somethingWentWrongSnackbar();
    } finally {
      update();
    }
  }

  Future<void> deleteTransaction(int id) async {
    try {
      await SupabaseCrudService.delete(table: table, filters: {'id': id});
      transactions.removeWhere((tx) => tx.id == id);
      showSnackBar("Transaction deleted");
    } catch (e, s) {
      log("❌ deleteTransaction ERROR");
      log(e.toString());
      log(s.toString());
      somethingWentWrongSnackbar();
    } finally {
      update();
    }
  }
}
