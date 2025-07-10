import 'package:booksmart/models/category_rule_model.dart';
import 'package:booksmart/modules/common/controllers/auth_controller.dart';
import 'package:booksmart/services/crud_service.dart';
import 'package:booksmart/supabase/tables.dart';
import 'package:booksmart/widgets/snackbar.dart';
import 'package:get/get.dart';

class RulesController extends GetxController {
  final rules = <CategoryRuleModel>[];
  bool isLoading = false;

  @override
  void onInit() {
    fetchRules();
    super.onInit();
  }

  Future<void> fetchRules() async {
    try {
      isLoading = true;
      update();

      final res = await SupabaseCrudService.read(
        table: SupabaseTable.categoryRules,
        filters: {'user_id': authUser?.authId},
      );

      rules
        ..clear()
        ..addAll(
          (res as List).map((e) => CategoryRuleModel.fromJson(e)).toList(),
        );
    } catch (e) {
      somethingWentWrongSnackbar();
    }

    isLoading = false;
    update();
  }

  Future<void> addRule(CategoryRuleModel model) async {
    try {
      await SupabaseCrudService.insert(
        table: SupabaseTable.categoryRules,
        data: model.toJson(),
      );
      showSnackBar('Rule added');
      fetchRules();
    } catch (e) {
      somethingWentWrongSnackbar();
    }
  }

  Future<void> updateRule({
    required int id,
    required Map<String, dynamic> data,
  }) async {
    try {
      await SupabaseCrudService.update(
        table: SupabaseTable.categoryRules,
        data: data,
        filters: {'id': id},
      );
      fetchRules();
    } catch (e) {
      somethingWentWrongSnackbar();
    }
  }

  Future<void> deleteRule(int id) async {
    try {
      await SupabaseCrudService.delete(
        table: SupabaseTable.categoryRules,
        filters: {'id': id},
      );
      showSnackBar('Rule deleted');
      fetchRules();
    } catch (e) {
      somethingWentWrongSnackbar();
    }
  }

  void toggleRule(CategoryRuleModel rule, bool value) {
    updateRule(id: rule.id, data: {'status': value});
  }
}
