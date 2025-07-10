import 'dart:developer';

import 'package:booksmart/services/crud_service.dart';
import 'package:booksmart/supabase/tables.dart';
import 'package:booksmart/widgets/snackbar.dart';
import 'package:get/get.dart';

import '../../../models/ai_tax_strategy_model.dart';
import '../../../utils/supabase.dart';
import 'organization_controller.dart';

AiStrategyController aiStrategyControllerInstance =
    Get.find<AiStrategyController>(tag: getCurrentOrganization?.id.toString());

/// TAG: currentOrganizationID
class AiStrategyController extends GetxController {
  RxBool isLoading = false.obs;
  RxList<AiTaxStrategyModel> strategies = <AiTaxStrategyModel>[].obs;

  @override
  void onInit() {
    super.onInit();
    loadStrategies();
  }

  Future<void> loadStrategies() async {
    try {
      isLoading.value = true;

      final res = await SupabaseCrudService.executeQuery(
        query: supabase
            .from(SupabaseTable.aiTaxStrategies)
            .select()
            .eq('org_id', getCurrentOrganization!.id),
      );

      strategies.value = (res as List)
          .map((e) => AiTaxStrategyModel.fromJson(e))
          .toList();
    } catch (e, s) {
      log("❌ getAllStrategies ERROR");
      log(e.toString());
      log(s.toString());
      somethingWentWrongSnackbar();
    } finally {
      isLoading.value = false;
      update();
    }
  }

  /// Matches [AiStrategyPage] deduction ring (0.62 → 62%).
  static const double deductionOptimizationPercent = 0.62;

  double get deductionOptimizationPercentDisplay =>
      deductionOptimizationPercent * 100;

  double get deductionsNotUtilizedPercentDisplay =>
      (1 - deductionOptimizationPercent) * 100;

  /// Same label as AI Strategy — not yet wired to a backend total.
  String get additionalDeductionsFoundDisplay => '\$ - - -';

  double get totalPotentialSavings {
    if (strategies.isEmpty) return 0;
    return strategies.fold(
      0.0,
      (sum, strategy) => sum + strategy.estimatedSavings,
    );
  }

  double get getTotalPotentialSavings => totalPotentialSavings;
}
