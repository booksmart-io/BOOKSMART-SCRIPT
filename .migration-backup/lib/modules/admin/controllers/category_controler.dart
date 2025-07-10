// ignore_for_file: avoid_print

import 'package:booksmart/services/crud_service.dart';
import 'package:booksmart/supabase/tables.dart';
import 'package:get/get.dart';
import '../../../models/category.dart';
import '../../../widgets/snackbar.dart';
import '../../common/controllers/auth_controller.dart';
import '../../../models/state_model.dart';
import '../../../models/deduction_rule_model.dart';

class CategoryAdminController extends GetxController {
  final categories = <CategoryModel>[];
  final subCategories = <SubCategoryModel>[];
  final states = <StateModel>[];
  final deductionRules = <DeductionRuleModel>[];

  bool isLoading = false;

  @override
  void onInit() {
    fetchAll();
    super.onInit();
  }

  // ================= LOADING HANDLER =================

  void _setLoading(bool value) {
    isLoading = value;
    update();
  }

  // ================= FETCH ALL =================

  Future<void> fetchAll() async {
    try {
      _setLoading(true);

      final categoryRes = await SupabaseCrudService.read(
        table: SupabaseTable.category,
      );

      final subCategoryRes = await SupabaseCrudService.read(
        table: SupabaseTable.subCategory,
      );

      categories
        ..clear()
        ..addAll((categoryRes as List).map((e) => CategoryModel.fromJson(e)));

      subCategories
        ..clear()
        ..addAll(
          (subCategoryRes as List).map((e) => SubCategoryModel.fromJson(e)),
        );

      await fetchStates();
    } catch (e) {
      somethingWentWrongSnackbar();
    } finally {
      _setLoading(false);
    }
  }

  Future<void> fetchStates() async {
    try {
      _setLoading(true);
      final res = await SupabaseCrudService.read(table: SupabaseTable.states);
      states
        ..clear()
        ..addAll((res as List).map((e) => StateModel.fromJson(e)));
    } catch (e) {
      print("Error fetching states: $e");
    } finally {
      _setLoading(false);
    }
  }

  Future<void> fetchDeductionRules({
    int? categoryId,
    int? subCategoryId,
  }) async {
    try {
      _setLoading(true);
      final filters = <String, dynamic>{};
      if (categoryId != null) filters['category_id'] = categoryId;
      if (subCategoryId != null) filters['sub_category_id'] = subCategoryId;

      final res = await SupabaseCrudService.read(
        table: SupabaseTable.deductionRules,
        filters: filters,
      );
      deductionRules
        ..clear()
        ..addAll((res as List).map((e) => DeductionRuleModel.fromJson(e)));
    } catch (e) {
      print("Error fetching deduction rules: $e");
    } finally {
      _setLoading(false);
    }
  }

  // ================= CATEGORY =================

  Future<void> saveCategory({int? id, required String name}) async {
    try {
      _setLoading(true);

      if (id == null) {
        await SupabaseCrudService.insert(
          table: SupabaseTable.category,
          data: {'name': name, 'added_by': authAdmin?.id},
        );
        showSnackBar('Category added');
      } else {
        await SupabaseCrudService.update(
          table: SupabaseTable.category,
          data: {'name': name},
          filters: {'id': id},
        );
        showSnackBar('Category updated');
      }

      await fetchAll();
    } catch (e) {
      somethingWentWrongSnackbar();
    } finally {
      _setLoading(false);
    }
  }

  Future<void> deleteCategory(int id) async {
    try {
      _setLoading(true);

      await SupabaseCrudService.delete(
        table: SupabaseTable.category,
        filters: {'id': id},
      );

      showSnackBar('Category deleted');
      await fetchAll();
    } catch (e) {
      somethingWentWrongSnackbar();
    } finally {
      _setLoading(false);
    }
  }

  // ================= SUB CATEGORY =================

  List<SubCategoryModel> getSubCategoriesByCategory(int categoryId) {
    return subCategories.where((e) => e.categoryId == categoryId).toList();
  }

  Future<void> saveSubCategory({
    int? id,
    required int categoryId,
    required String name,
  }) async {
    try {
      _setLoading(true);

      if (id == null) {
        await SupabaseCrudService.insert(
          table: SupabaseTable.subCategory,
          data: {
            'category_id': categoryId,
            'name': name,
            'added_by': authAdmin?.id,
          },
        );
        showSnackBar('Sub-category added');
      } else {
        await SupabaseCrudService.update(
          table: SupabaseTable.subCategory,
          data: {'name': name},
          filters: {'id': id},
        );
        showSnackBar('Sub-category updated');
      }

      await fetchAll();
    } catch (e) {
      somethingWentWrongSnackbar();
    } finally {
      _setLoading(false);
    }
  }

  Future<void> deleteSubCategory(int id) async {
    try {
      _setLoading(true);

      await SupabaseCrudService.delete(
        table: SupabaseTable.subCategory,
        filters: {'id': id},
      );

      showSnackBar('Sub-category deleted');
      await fetchAll();
    } catch (e) {
      somethingWentWrongSnackbar();
    } finally {
      _setLoading(false);
    }
  }

  // ================= HELPERS =================

  String getCategoryName(int id) {
    try {
      return categories.firstWhere((c) => c.id == id).name;
    } catch (_) {
      return '-';
    }
  }

  String getSubCategoryName(int? id) {
    if (id == null) return '-';
    try {
      return subCategories.firstWhere((s) => s.id == id).name;
    } catch (_) {
      return '-';
    }
  }

  Future<void> toggleCategoryStatus(CategoryModel category) async {
    try {
      _setLoading(true);

      await SupabaseCrudService.update(
        table: SupabaseTable.category,
        data: {'is_deleted': !category.isDeleted},
        filters: {'id': category.id},
      );

      showSnackBar(
        category.isDeleted ? 'Category restored' : 'Category marked deleted',
      );

      await fetchAll();
    } catch (e) {
      somethingWentWrongSnackbar();
    } finally {
      _setLoading(false);
    }
  }

  Future<void> toggleSubCategoryStatus(SubCategoryModel sub) async {
    try {
      _setLoading(true);

      await SupabaseCrudService.update(
        table: SupabaseTable.subCategory,
        data: {'is_deleted': !sub.isDeleted},
        filters: {'id': sub.id},
      );

      showSnackBar(
        sub.isDeleted ? 'Sub-category restored' : 'Sub-category marked deleted',
      );

      await fetchAll();
    } catch (e) {
      somethingWentWrongSnackbar();
    } finally {
      _setLoading(false);
    }
  }

  // ================= DEDUCTION RULES =================

  Future<void> saveDeductionRule({
    int? id,
    required int categoryId,
    int? subCategoryId,
    int? stateId,
    required RuleType ruleType,
    required double value,
  }) async {
    try {
      _setLoading(true);
      final data = {
        'category_id': categoryId,
        'sub_category_id': subCategoryId,
        'state_id': stateId,
        'rule_type': ruleType.name,
        'value': value,
      };

      if (id == null) {
        await SupabaseCrudService.insert(
          table: SupabaseTable.deductionRules,
          data: data,
        );
        showSnackBar('Rule added');
      } else {
        await SupabaseCrudService.update(
          table: SupabaseTable.deductionRules,
          data: data,
          filters: {'id': id},
        );
        showSnackBar('Rule updated');
      }
      await fetchDeductionRules(
        categoryId: categoryId,
        subCategoryId: subCategoryId,
      );
    } catch (e) {
      somethingWentWrongSnackbar();
    } finally {
      _setLoading(false);
    }
  }

  Future<void> deleteDeductionRule({
    required int id,
    required int categoryId,
    int? subCategoryId,
  }) async {
    try {
      _setLoading(true);
      await SupabaseCrudService.delete(
        table: SupabaseTable.deductionRules,
        filters: {'id': id},
      );
      showSnackBar('Rule deleted');
      await fetchDeductionRules(
        categoryId: categoryId,
        subCategoryId: subCategoryId,
      );
    } catch (e) {
      somethingWentWrongSnackbar();
    } finally {
      _setLoading(false);
    }
  }
}
