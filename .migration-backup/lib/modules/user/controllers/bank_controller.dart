import 'dart:developer';

import 'package:booksmart/modules/user/controllers/organization_controller.dart';
import 'package:booksmart/models/bank_model.dart';
import 'package:booksmart/services/crud_service.dart';
import 'package:booksmart/supabase/tables.dart';
import 'package:booksmart/widgets/snackbar.dart';
import 'package:get/get.dart';

import '../../../utils/supabase.dart';

BankController bankControllerInstance = Get.find<BankController>(
  tag: getCurrentOrganization?.id.toString(),
);

/// TAG: currentOrganizationID
class BankController extends GetxController {
  RxBool isLoading = false.obs;
  RxList<BankModel> banks = <BankModel>[].obs;

  @override
  void onInit() {
    super.onInit();
    loadBanks();
  }

  Future<void> loadBanks() async {
    try {
      isLoading.value = true;

      final res = await SupabaseCrudService.executeQuery(
        query: supabase
            .from(SupabaseTable.bank)
            .select('*, ${SupabaseTable.bankAccounts}(*)')
            .eq('org_id', getCurrentOrganization!.id),
      );

      banks.value = (res as List).map((e) => BankModel.fromJson(e)).toList();
    } catch (e, s) {
      log("❌ getAllBanks ERROR");
      log(e.toString());
      log(s.toString());
      somethingWentWrongSnackbar();
    } finally {
      isLoading.value = false;
      update();
    }
  }
}
