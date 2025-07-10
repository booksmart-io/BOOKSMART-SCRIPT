import 'dart:developer';
import 'package:booksmart/models/organization_model.dart';
import 'package:booksmart/models/state_model.dart';
import 'package:booksmart/modules/user/providers/organization_provider.dart';
import 'package:booksmart/services/crud_service.dart';
import 'package:booksmart/supabase/tables.dart';
import 'package:booksmart/utils/supabase.dart';
import 'package:booksmart/widgets/snackbar.dart';
import 'package:get/get.dart';

OrganizationModel? get getCurrentOrganization {
  try {
    return Get.find<OrganizationController>().currentOrganization;
  } catch (_) {
    return null;
  }
}

bool get isAnyOrganizationAvailable {
  return getCurrentOrganization != null;
}

OrganizationController get organizationControllerInstance =>
    Get.find<OrganizationController>();

class OrganizationController extends GetxController {
  final String table = SupabaseTable.organization;

  Rx<OrganizationModel?> rxCurrentOrganization = Rx<OrganizationModel?>(null);
  OrganizationModel? get currentOrganization => rxCurrentOrganization.value;

  RxBool isLoading = false.obs;
  RxList<OrganizationModel> organizations = <OrganizationModel>[].obs;
  RxList<StateModel> states = <StateModel>[].obs;

  OrganizationController(List<OrganizationModel> organizationList) {
    initlizeOrganizations(organizationList);
  }

  void initlizeOrganizations(
    List<OrganizationModel> list, {
    bool shouldUpdate = true,
  }) {
    fetchStates();
    organizations.value = list;

    if (currentOrganization == null && organizations.isNotEmpty) {
      rxCurrentOrganization.value = organizations.first;
    }
    if (shouldUpdate) {
      update();
    }
  }

  Future<void> refreshOrganizations() async {
    isLoading.value = true;
    initlizeOrganizations(await getOrganizations());
    isLoading.value = false;
    update();
  }

  void switchOrganization(OrganizationModel org) {
    rxCurrentOrganization.value = org;
    update();
  }

  Future<void> addOrganization(OrganizationModel model) async {
    try {
      Map<String, dynamic> json = model.toJson();
      json.remove("id");
      await SupabaseCrudService.create(table: table, data: json);
      refreshOrganizations();
      Get.back();
      showSnackBar("Organization added successfully");
    } catch (e, s) {
      log("❌ addOrganization ERROR");
      log(e.toString());
      log(s.toString());
      somethingWentWrongSnackbar();
    }
  }

  /// Like [addOrganization] but returns the newly created row's ID.
  Future<int?> addOrganizationAndReturnId(OrganizationModel model) async {
    try {
      Map<String, dynamic> json = model.toJson();
      json.remove("id");
      // Use direct supabase call to get the returned ID
      final res =
          await supabase.from(table).insert(json).select('id').single();
      refreshOrganizations();
      Get.back();
      showSnackBar("Organization added successfully");
      return res['id'] as int?;
    } catch (e, s) {
      log("❌ addOrganizationAndReturnId ERROR");
      log(e.toString());
      log(s.toString());
      somethingWentWrongSnackbar();
      return null;
    }
  }

  // ===============================
  // UPDATE ORGANIZATION
  // ===============================
  Future<void> updateOrganization({
    required int id,
    required Map<String, dynamic> data,
  }) async {
    try {
      data.remove('id');
      await SupabaseCrudService.update(
        table: table,
        data: data,
        filters: {'id': id},
      );
      refreshOrganizations();
      Get.back();
      showSnackBar("Organization updated successfully");
    } catch (e, s) {
      log("❌ updateOrganization ERROR");
      log(e.toString());
      log(s.toString());
      showSnackBar(e.toString(), isError: true);
    }
  }

  /// Update only tax onboarding columns for an organization
  Future<void> updateTaxProfile({
    required int organizationId,
    required Map<String, dynamic> data,
  }) async {
    try {
      data.remove('id'); // Safety
      await SupabaseCrudService.update(
        table: table,
        data: data,
        filters: {'id': organizationId},
      );
      // Optional: refresh if we show these fields on the detail page
      refreshOrganizations();
    } catch (e, s) {
      log("❌ updateTaxProfile ERROR");
      log(e.toString());
      log(s.toString());
    }
  }

  // ===============================
  // DELETE ORGANIZATION
  // ===============================
  Future<void> deleteOrganization(int id) async {
    try {
      await SupabaseCrudService.delete(table: table, filters: {'id': id});
      organizations.removeWhere((org) => org.id == id);
      update();
      showSnackBar("Organization deleted");
    } catch (e, s) {
      log("❌ deleteOrganization ERROR");
      log(e.toString());
      log(s.toString());
      showSnackBar(e.toString(), isError: true);
    }
  }

  Future<void> fetchStates() async {
    try {
      final res = await supabase.from(SupabaseTable.states).select().eq('is_active', true).order('name');
      states.value = (res as List).map((e) => StateModel.fromJson(e)).toList();
      update();
    } catch (e) {
      log("❌ fetchStates ERROR: $e");
    }
  }

  String getStateName(dynamic stateId) {
    if (stateId == null) return 'N/A';
    final state = states.firstWhereOrNull((e) => e.id.toString() == stateId.toString());
    return state?.name ?? stateId.toString();
  }
}
