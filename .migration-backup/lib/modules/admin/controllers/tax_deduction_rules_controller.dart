import 'dart:developer';

import 'package:booksmart/models/category.dart';
import 'package:booksmart/models/deduction_rule_model.dart';
import 'package:booksmart/models/state_model.dart';
import 'package:booksmart/supabase/tables.dart';
import 'package:booksmart/utils/supabase.dart';
import 'package:booksmart/widgets/snackbar.dart';
import 'package:get/get.dart';

class TaxDeductionRulesController extends GetxController {
  static const organizationColumns = [
    'business_vehicle_percent',
    'business_utility_percent',
    'business_meal_percent',
  ];

  final groups = <DeductionRuleGroupModel>[];
  final rules = <DeductionRuleModel>[];
  final states = <StateModel>[];
  final categories = <CategoryModel>[];
  final subCategories = <SubCategoryModel>[];

  bool isLoading = false;
  DeductionRuleGroupModel? selectedGroup;

  @override
  void onInit() {
    fetchInitialData();
    super.onInit();
  }

  Future<void> fetchInitialData() async {
    await Future.wait([fetchLookups(), fetchGroups()]);
  }

  Future<void> fetchLookups() async {
    try {
      _setLoading(true);
      final responses = await Future.wait([
        supabase.from(SupabaseTable.states).select().order('name'),
        supabase.from(SupabaseTable.category).select().order('name'),
        supabase.from(SupabaseTable.subCategory).select().order('name'),
      ]);

      states
        ..clear()
        ..addAll(
          (responses[0] as List).map((e) => StateModel.fromJson(e)).toList(),
        );
      categories
        ..clear()
        ..addAll(
          (responses[1] as List).map((e) => CategoryModel.fromJson(e)).toList(),
        );
      subCategories
        ..clear()
        ..addAll(
          (responses[2] as List)
              .map((e) => SubCategoryModel.fromJson(e))
              .toList(),
        );
    } catch (e, st) {
      log('fetchLookups failed: $e');
      log(st.toString());
      somethingWentWrongSnackbar();
    } finally {
      _setLoading(false);
    }
  }

  Future<void> fetchGroups() async {
    try {
      _setLoading(true);
      final res = await supabase
          .from(SupabaseTable.deductionRuleGroups)
          .select()
          .order('valid_from', ascending: false);

      groups
        ..clear()
        ..addAll((res as List).map((e) => DeductionRuleGroupModel.fromJson(e)));

      if (selectedGroup != null) {
        selectedGroup = groups.firstWhereOrNull(
          (g) => g.id == selectedGroup!.id,
        );
      }

      selectedGroup ??= groups.firstOrNull;
      if (selectedGroup != null) {
        await fetchRules(selectedGroup!.id, showLoadingState: false);
      } else {
        rules.clear();
      }
    } catch (e, st) {
      log('fetchGroups failed: $e');
      log(st.toString());
      somethingWentWrongSnackbar();
    } finally {
      _setLoading(false);
    }
  }

  Future<void> fetchRules(int groupId, {bool showLoadingState = true}) async {
    try {
      if (showLoadingState) _setLoading(true);
      final res = await supabase
          .from(SupabaseTable.deductionRules)
          .select()
          .eq('deduction_rule_group_id', groupId)
          .order('sub_category_id');

      rules
        ..clear()
        ..addAll((res as List).map((e) => DeductionRuleModel.fromJson(e)));
    } catch (e, st) {
      log('fetchRules failed: $e');
      log(st.toString());
      somethingWentWrongSnackbar();
    } finally {
      if (showLoadingState) _setLoading(false);
      update();
    }
  }

  void selectGroup(DeductionRuleGroupModel group) {
    selectedGroup = group;
    fetchRules(group.id);
    update();
  }

  Future<void> saveGroup({
    int? id,
    int? stateId,
    required DateTime validFrom,
    DateTime? validTo,
    String? description,
  }) async {
    if (validTo != null && !validTo.isAfter(validFrom)) {
      showSnackBar('Valid to must be after valid from', isError: true);
      return;
    }

    final data = {
      'state_id': stateId,
      'valid_from': _dateOnly(validFrom),
      'valid_to': validTo == null ? null : _dateOnly(validTo),
      'description': description?.trim().isEmpty == true
          ? null
          : description?.trim(),
    };

    try {
      _setLoading(true);
      if (id == null) {
        final inserted = await supabase
            .from(SupabaseTable.deductionRuleGroups)
            .insert(data)
            .select()
            .single();
        selectedGroup = DeductionRuleGroupModel.fromJson(inserted);
        showSnackBar('Rule group added');
      } else {
        final updated = await supabase
            .from(SupabaseTable.deductionRuleGroups)
            .update(data)
            .eq('id', id)
            .select()
            .single();
        selectedGroup = DeductionRuleGroupModel.fromJson(updated);
        showSnackBar('Rule group updated');
      }
      await fetchGroups();
    } catch (e, st) {
      log('saveGroup failed: $e');
      log(st.toString());
      somethingWentWrongSnackbar();
    } finally {
      _setLoading(false);
    }
  }

  Future<void> deleteGroup(int id) async {
    try {
      _setLoading(true);
      await supabase
          .from(SupabaseTable.deductionRuleGroups)
          .delete()
          .eq('id', id);
      if (selectedGroup?.id == id) selectedGroup = null;
      showSnackBar('Rule group deleted');
      await fetchGroups();
    } catch (e, st) {
      log('deleteGroup failed: $e');
      log(st.toString());
      somethingWentWrongSnackbar();
    } finally {
      _setLoading(false);
    }
  }

  Future<void> saveRule({
    int? id,
    required int groupId,
    required int subCategoryId,
    required CalculationType calculationType,
    required double value,
    String? organizationColumnName,
    required bool isPerTransaction,
    double? maxDeductionPerTransaction,
  }) async {
    if (value < 0) {
      showSnackBar('Value must be 0 or greater', isError: true);
      return;
    }

    if (!isPerTransaction && maxDeductionPerTransaction != null) {
      showSnackBar('Max per transaction only applies to per-transaction rules');
      return;
    }

    final data = {
      'deduction_rule_group_id': groupId,
      'sub_category_id': subCategoryId,
      'organization_column_name': organizationColumnName,
      'calculation_type': calculationType.name,
      'value': value,
      'is_per_transaction': isPerTransaction,
      'max_deduction_per_transaction': maxDeductionPerTransaction,
    };

    try {
      _setLoading(true);
      if (id == null) {
        await supabase.from(SupabaseTable.deductionRules).insert(data);
        showSnackBar('Rule added');
      } else {
        await supabase
            .from(SupabaseTable.deductionRules)
            .update(data)
            .eq('id', id);
        showSnackBar('Rule updated');
      }
      await fetchRules(groupId, showLoadingState: false);
    } catch (e, st) {
      log('saveRule failed: $e');
      log(st.toString());
      somethingWentWrongSnackbar();
    } finally {
      _setLoading(false);
    }
  }

  Future<void> deleteRule(int id) async {
    final groupId = selectedGroup?.id;
    if (groupId == null) return;

    try {
      _setLoading(true);
      await supabase.from(SupabaseTable.deductionRules).delete().eq('id', id);
      showSnackBar('Rule deleted');
      await fetchRules(groupId, showLoadingState: false);
    } catch (e, st) {
      log('deleteRule failed: $e');
      log(st.toString());
      somethingWentWrongSnackbar();
    } finally {
      _setLoading(false);
    }
  }

  String jurisdictionName(int? stateId) {
    if (stateId == null) return 'Federal';
    return states.firstWhereOrNull((s) => s.id == stateId)?.name ??
        'State $stateId';
  }

  String subCategoryName(int subCategoryId) {
    return subCategories.firstWhereOrNull((s) => s.id == subCategoryId)?.name ??
        'Sub-category $subCategoryId';
  }

  String categoryNameForSubCategory(int subCategoryId) {
    final sub = subCategories.firstWhereOrNull((s) => s.id == subCategoryId);
    if (sub == null) return '-';
    return categories.firstWhereOrNull((c) => c.id == sub.categoryId)?.name ??
        '-';
  }

  String describeRule(DeductionRuleModel rule) {
    final orgPart = rule.organizationColumnName == null
        ? null
        : '${rule.organizationColumnName} first';
    final calcPart = rule.calculationType == CalculationType.percentage
        ? '${rule.value.toStringAsFixed(rule.value.truncateToDouble() == rule.value ? 0 : 2)}%'
        : '\$${rule.value.toStringAsFixed(2)} fixed';
    final perTxPart = rule.isPerTransaction ? 'per transaction' : 'bulk';
    final maxPart = rule.maxDeductionPerTransaction == null
        ? null
        : 'max \$${rule.maxDeductionPerTransaction!.toStringAsFixed(2)}';

    return [
      orgPart,
      calcPart,
      perTxPart,
      maxPart,
    ].whereType<String>().join(' • ');
  }

  void _setLoading(bool value) {
    isLoading = value;
    update();
  }

  String _dateOnly(DateTime date) => date.toIso8601String().split('T').first;
}
