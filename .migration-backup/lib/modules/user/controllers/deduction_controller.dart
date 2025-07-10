import 'dart:developer';
import 'package:booksmart/utils/supabase.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../../models/transaction_model.dart';
import '../../../supabase/tables.dart';
import '../../admin/controllers/category_controler.dart';
import 'organization_controller.dart';

String getDeductionControllerTag(DateTime startDate, DateTime endDate) {
  return "${startDate.toIso8601String()}-${endDate.toIso8601String()}-${organizationControllerInstance.currentOrganization?.id}";
}

class DeductionResult {
  final int subCategoryId;
  final String subCategoryName;
  final double totalAmount;
  final int transactionCount;
  final double stateDeduction;
  final double federalDeduction;
  final double? deductionRate; // null when tiered rule
  final String? stateDeductionRate;
  final String? federalDeductionRate;
  final Color color;

  DeductionResult({
    required this.subCategoryId,
    required this.subCategoryName,
    required this.totalAmount,
    required this.transactionCount,
    required this.stateDeduction,
    required this.federalDeduction,
    required this.deductionRate,
    this.stateDeductionRate,
    this.federalDeductionRate,
    required this.color,
  });

  factory DeductionResult.fromMap(
    Map<String, dynamic> map,
    Color color,
    String subCategoryName,
  ) {
    return DeductionResult(
      subCategoryId: _readInt(map, 'sub_category_id') ?? 0,
      subCategoryName: subCategoryName,
      totalAmount: _readDouble(map, 'total_amount') ?? 0,
      transactionCount: _readInt(map, 'transaction_count') ?? 0,
      stateDeduction: _readDouble(map, 'state_deduction') ?? 0,
      federalDeduction: _readDouble(map, 'federal_deduction') ?? 0,
      deductionRate: _readDouble(map, 'deduction_rate'),
      stateDeductionRate: _readString(map, 'state_deduction_rate'),
      federalDeductionRate: _readString(map, 'federal_deduction_rate'),
      color: color,
    );
  }
}

dynamic _readValue(Map<String, dynamic> map, String key) {
  return map[key] ?? map['out_$key'];
}

double? _readDouble(Map<String, dynamic> map, String key) {
  final value = _readValue(map, key);
  if (value == null) return null;
  if (value is num) return value.toDouble();
  return double.tryParse(value.toString());
}

int? _readInt(Map<String, dynamic> map, String key) {
  final value = _readValue(map, key);
  if (value == null) return null;
  if (value is num) return value.toInt();
  return int.tryParse(value.toString());
}

String? _readString(Map<String, dynamic> map, String key) {
  final value = _readValue(map, key);
  return value?.toString();
}

List<Color> _generateColors(int count) {
  if (count == 0) return [];

  final double step = 360.0 / count;

  return List.generate(count, (i) {
    final double hue = i * step;
    const double saturation = 0.65; // vivid but not neon
    const double lightness = 0.55; // not too dark, not too pale

    return HSLColor.fromAHSL(1.0, hue, saturation, lightness).toColor();
  });
}

class DeductionController extends GetxController {
  final DateTime startDate;
  final DateTime endDate;

  // parsed models with colors
  List<DeductionResult> results = [];

  // summaries
  double totalAmount = 0;
  double totalStateDeduction = 0;
  double totalFederalDeduction = 0;
  int totalTransactions = 0;

  DeductionController({required this.startDate, required this.endDate});

  RxBool isLoading = false.obs;

  @override
  void onInit() {
    loadData();
    super.onInit();
  }

  Future<void> loadData() async {
    isLoading.value = true;
    final rpcParams = {
      'p_org_id': organizationControllerInstance.currentOrganization?.id,
      'p_start_date': startDate.toIso8601String().split('T').first,
      'p_end_date': endDate.toIso8601String().split('T').first,
    };

    final dynamic response = await supabase.rpc(
      'get_tax_deductions',
      params: rpcParams,
    );

    log("RPC: get_tax_deductions: $response");
    List<dynamic> groupedTransactions = response as List<dynamic>;

    // generate exactly N unique colors for N rows
    final colors = _generateColors(groupedTransactions.length);

    // parse each row
    results = List.generate(
      groupedTransactions.length,
      (i) => DeductionResult.fromMap(
        groupedTransactions[i] as Map<String, dynamic>,
        colors[i],
        Get.find<CategoryAdminController>().getSubCategoryName(
          _readInt(
                groupedTransactions[i] as Map<String, dynamic>,
                'sub_category_id',
              ) ??
              0,
        ),
      ),
    );

    results.sort((a, b) => b.totalAmount.compareTo(a.totalAmount));

    // summaries
    totalAmount = results.fold(0, (sum, r) => sum + r.totalAmount);
    totalStateDeduction = results.fold(0, (sum, r) => sum + r.stateDeduction);
    totalFederalDeduction = results.fold(
      0,
      (sum, r) => sum + r.federalDeduction,
    );
    totalTransactions = results.fold(0, (sum, r) => sum + r.transactionCount);
    isLoading.value = false;
    update();
  }
}

String getDeductionTransactionControllerTag(
  int subCategoryId,
  DateTime startDate,
  DateTime endDate,
) {
  return "$subCategoryId-${startDate.toIso8601String()}-${endDate.toIso8601String()}-${organizationControllerInstance.currentOrganization?.id}";
}

class DeductionTransactionController extends GetxController {
  final int subCategoryId;
  final DateTime startDate;
  final DateTime endDate;

  RxList<TransactionModel> transactions = <TransactionModel>[].obs;

  DeductionTransactionController({
    required this.subCategoryId,
    required this.startDate,
    required this.endDate,
  });

  @override
  void onInit() {
    super.onInit();
    loadTransactions();
  }

  RxBool isLoading = false.obs;

  Future<void> loadTransactions() async {
    isLoading.value = true;
    final res = await supabase
        .from(SupabaseTable.transaction)
        .select()
        .eq('org_id', getCurrentOrganization!.id)
        .eq('sub_category_id', subCategoryId)
        .gte('date_time', startDate.toIso8601String())
        .lte('date_time', endDate.toIso8601String());

    transactions.assignAll(
      (res as List).map((e) => TransactionModel.fromJson(e)).toList(),
    );
    isLoading.value = false;
    update();
  }
}
