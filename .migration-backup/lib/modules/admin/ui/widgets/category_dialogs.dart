import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/helpers/currency_formatter.dart';
import 'package:booksmart/modules/admin/controllers/category_controler.dart';
import 'package:booksmart/models/category.dart';
import 'package:booksmart/widgets/custom_dialog.dart';
import 'package:get/get.dart';
import 'package:booksmart/models/state_model.dart';
import 'package:booksmart/models/deduction_rule_model.dart';
import 'package:booksmart/widgets/snackbar.dart';
import 'package:booksmart/widgets/custom_drop_down.dart';
import 'package:dropdown_search/dropdown_search.dart';

void showSaveCategoryDialog({
  required CategoryAdminController controller,
  CategoryModel? category,
}) {
  final textController = TextEditingController(text: category?.name ?? '');

  customDialog(
    title: category == null ? 'Add Category' : 'Edit Category',
    maxWidth: 350,
    child: Padding(
      padding: const EdgeInsets.all(8),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AppTextField(
            controller: textController,
            labelText: 'Category Name',
            hintText: 'Category Name',
          ),
          0.06.verticalSpace,
          AppButton(
            buttonText: category == null ? 'Add' : 'Update',
            onTapFunction: () {
              final name = textController.text.trim();
              if (name.isEmpty) return;

              controller.saveCategory(id: category?.id, name: name);
              Get.back();
            },
          ),
        ],
      ),
    ),
  );
}

void showSubCategoryListDialog(
  CategoryAdminController controller,
  int categoryId,
  String categoryName,
) {
  customDialog(
    title: categoryName,
    maxWidth: 450,
    child: GetBuilder<CategoryAdminController>(
      builder: (_) {
        final subCategories = controller.getSubCategoriesByCategory(categoryId);

        if (subCategories.isEmpty) {
          return Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const AppText('No sub-categories found'),
                0.06.verticalSpace,
                AppButton(
                  buttonText: 'Add Sub-Category',
                  onTapFunction: () => showSaveSubCategoryDialog(
                    controller: controller,
                    categoryId: categoryId,
                  ),
                ),
              ],
            ),
          );
        }

        return SingleChildScrollView(
          padding: const EdgeInsets.all(15),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ...subCategories.map(
                (sub) => ListTile(
                  onTap: () {
                    Get.back();
                    Get.toNamed(Routes.adminTaxDeductions);
                  },
                  title: AppText(sub.name),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        icon: const Icon(Icons.edit),
                        onPressed: () => showSaveSubCategoryDialog(
                          controller: controller,
                          categoryId: categoryId,
                          subCategory: sub,
                        ),
                      ),

                      IconButton(
                        icon: Icon(
                          sub.isDeleted
                              ? Icons.cancel_rounded
                              : Icons.check_circle_rounded,
                          color: sub.isDeleted ? Colors.red : Colors.green,
                        ),
                        tooltip: sub.isDeleted ? "Inactive" : "Active",
                        onPressed: () => showConfirmDeleteDialog(
                          title: sub.isDeleted
                              ? 'Restore Sub-Category'
                              : 'Delete Sub-Category',
                          description: sub.isDeleted
                              ? 'Are you sure you want to restore this sub-category?'
                              : 'Are you sure you want to delete this sub-category?',
                          onConfirm: () =>
                              controller.toggleSubCategoryStatus(sub),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              0.06.verticalSpace,
              AppButton(
                buttonText: 'Add Sub-Category',
                onTapFunction: () => showSaveSubCategoryDialog(
                  controller: controller,
                  categoryId: categoryId,
                ),
              ),
            ],
          ),
        );
      },
    ),
  );
}

void showSaveSubCategoryDialog({
  required CategoryAdminController controller,
  required int categoryId,
  SubCategoryModel? subCategory,
}) {
  final textController = TextEditingController(text: subCategory?.name ?? '');

  customDialog(
    title: subCategory == null ? 'Add Sub-Category' : 'Edit Sub-Category',
    maxWidth: 350,
    child: Padding(
      padding: const EdgeInsets.all(8),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AppTextField(
            controller: textController,
            labelText: 'Sub-Category Name',
            hintText: 'Sub-Category Name',
          ),
          0.06.verticalSpace,
          AppButton(
            buttonText: subCategory == null ? 'Add' : 'Update',
            onTapFunction: () {
              final name = textController.text.trim();
              if (name.isEmpty) return;

              controller.saveSubCategory(
                id: subCategory?.id,
                categoryId: categoryId,
                name: name,
              );
              Get.back();
            },
          ),
        ],
      ),
    ),
  );
}

void showConfirmDeleteDialog({
  required String title,
  String? description,
  required VoidCallback onConfirm,
  double cardWidth = 300,
}) {
  customDialog(
    title: title,
    maxWidth: cardWidth,
    child: SingleChildScrollView(
      padding: EdgeInsets.all(6),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (description != null) ...[
            AppText(description, textAlign: TextAlign.center),
            0.03.verticalSpace,
          ],
          Row(
            spacing: 10,
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: Get.back,
                  child: const Text('Cancel'),
                ),
              ),
              Expanded(
                child: AppButton(
                  buttonText: title.contains("Restore") ? "Restore" : 'Delete',
                  onTapFunction: () {
                    onConfirm();
                    Get.back();
                  },
                ),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}

void showDeductionRulesDialog({
  required CategoryAdminController controller,
  required int categoryId,
  int? subCategoryId,
  required String name,
}) {
  customDialog(
    title: 'Deductions - $name',
    maxWidth: 700,
    child: GetBuilder<CategoryAdminController>(
      builder: (_) {
        if (controller.isLoading) {
          return const SizedBox(
            height: 250,
            child: Center(child: CircularProgressIndicator.adaptive()),
          );
        }

        return Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: AppButton(
                  buttonText: 'Add Rule',
                  onTapFunction: () => showSaveDeductionRuleDialog(
                    controller: controller,
                    categoryId: categoryId,
                    subCategoryId: subCategoryId,
                  ),
                ),
              ),
              0.02.verticalSpace,
              Flexible(
                child: SingleChildScrollView(
                  child: Container(
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.black, width: 1.5),
                    ),
                    child: Table(
                      border: const TableBorder(
                        horizontalInside: BorderSide(
                          color: Colors.black,
                          width: 1.5,
                        ),
                        verticalInside: BorderSide(
                          color: Colors.black,
                          width: 1.5,
                        ),
                        top: BorderSide(color: Colors.black, width: 1.5),
                        bottom: BorderSide(color: Colors.black, width: 1.5),
                        left: BorderSide(color: Colors.black, width: 1.5),
                        right: BorderSide(color: Colors.black, width: 1.5),
                      ),
                      columnWidths: const {
                        0: FlexColumnWidth(1.2),
                        1: FlexColumnWidth(1),
                        2: FlexColumnWidth(1.5),
                      },
                      children: [
                        TableRow(
                          children: const [
                            Padding(
                              padding: EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 12,
                              ),
                              child: AppText(
                                'Entity',
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            Padding(
                              padding: EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 12,
                              ),
                              child: AppText(
                                'Deduction',
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            Padding(
                              padding: EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 12,
                              ),
                              child: AppText(
                                'Actions',
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                        // Federal Row
                        _buildRuleRow(
                          controller: controller,
                          categoryId: categoryId,
                          subCategoryId: subCategoryId,
                          state: null,
                        ),
                        // States Rows
                        ...controller.states.map(
                          (state) => _buildRuleRow(
                            controller: controller,
                            categoryId: categoryId,
                            subCategoryId: subCategoryId,
                            state: state,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    ),
  );
}

TableRow _buildRuleRow({
  required CategoryAdminController controller,
  required int categoryId,
  int? subCategoryId,
  StateModel? state,
}) {
  final rule = controller.deductionRules.firstWhereOrNull(
    (r) => r.stateId == state?.id,
  );

  String deductionText = '--';
  if (rule != null) {
    deductionText = rule.ruleType == RuleType.percentage
        ? '${(rule.value).toStringAsFixed(0)} %'
        : CurrencyUtils.format(rule.value);
  }

  return TableRow(
    children: [
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: AppText(state?.name ?? 'Federal'),
      ),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: AppText(deductionText),
      ),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        child: Row(
          children: [
            TextButton(
              onPressed: () => showSaveDeductionRuleDialog(
                controller: controller,
                categoryId: categoryId,
                subCategoryId: subCategoryId,
                rule: rule,
                state: state,
              ),
              style: TextButton.styleFrom(
                backgroundColor: Colors.black,
                padding: const EdgeInsets.symmetric(horizontal: 12),
              ),
              child: const Text(
                'Edit',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            if (rule != null) ...[
              const SizedBox(width: 8),
              TextButton(
                onPressed: () => showConfirmDeleteDialog(
                  title: 'Delete Rule',
                  description: 'Are you sure you want to delete this rule?',
                  onConfirm: () => controller.deleteDeductionRule(
                    id: rule.id,
                    categoryId: categoryId,
                    subCategoryId: subCategoryId,
                  ),
                ),
                style: TextButton.styleFrom(
                  backgroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                ),
                child: const Text(
                  'Delete',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    ],
  );
}

void showSaveDeductionRuleDialog({
  required CategoryAdminController controller,
  required int categoryId,
  int? subCategoryId,
  DeductionRuleModel? rule,
  StateModel? state,
}) {
  final valueController = TextEditingController(
    text: rule?.value.toString() ?? '',
  );
  var ruleType = rule?.ruleType ?? RuleType.percentage;
  StateModel? selectedState =
      state ?? controller.states.firstWhereOrNull((s) => s.id == rule?.stateId);

  final stateKey = GlobalKey<DropdownSearchState<StateModel?>>();
  final typeKey = GlobalKey<DropdownSearchState<RuleType>>();
  final formKey = GlobalKey<FormState>();

  customDialog(
    title: rule == null ? 'Add Deduction Rule' : 'Edit Deduction Rule',
    maxWidth: 400,
    child: StatefulBuilder(
      builder: (context, setState) {
        return SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Form(
            key: formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CustomDropDownWidget<StateModel?>(
                  dropDownKey: stateKey,
                  label: 'State (Federal if empty)',
                  hint: 'Select State',
                  selectedItem: selectedState,
                  items: [null, ...controller.states],
                  itemAsString: (s) => s?.name ?? 'Federal',
                  showSearchBox: true,
                  onChanged: (val) => setState(() => selectedState = val),
                ),
                0.02.verticalSpace,
                CustomDropDownWidget<RuleType>(
                  dropDownKey: typeKey,
                  label: 'Rule Type',
                  hint: 'Select Type',
                  selectedItem: ruleType,
                  items: RuleType.values,
                  itemAsString: (t) => t.name.capitalizeFirst!,
                  onChanged: (val) => setState(() => ruleType = val!),
                ),
                0.02.verticalSpace,
                AppTextField(
                  controller: valueController,
                  labelText: ruleType == RuleType.percentage
                      ? 'Percentage (e.g. 23%)'
                      : 'Fixed Amount',
                  hintText: ruleType == RuleType.percentage ? '23' : '45.00',
                  keyboardType: TextInputType.number,
                  inputFormatters: [
                    if (ruleType == RuleType.fixed)
                      CurrencyTextInputFormatter(),
                  ],
                  fieldValidator: (v) {
                    if (v == null || v.isEmpty) {
                      return 'Please enter a value';
                    }
                    final double? val = ruleType == RuleType.fixed
                        ? CurrencyUtils.parse(v.trim())
                        : double.tryParse(v.trim());
                    if (val == null || val == 0) return 'Invalid value';
                    if (ruleType == RuleType.percentage &&
                        (val <= 0 || val > 100)) {
                      return 'Percentage must be between 0 and 100';
                    }
                    return null;
                  },
                ),
                0.04.verticalSpace,
                AppButton(
                  buttonText: rule == null ? 'Add' : 'Update',
                  onTapFunction: () {
                    if (formKey.currentState?.validate() == false) {
                      return;
                    }

                    final double? val = ruleType == RuleType.fixed
                        ? CurrencyUtils.parse(valueController.text.trim())
                        : double.tryParse(valueController.text.trim());
                    if (val == null || val == 0) {
                      showSnackBar('Invalid value');
                      return;
                    }

                    controller.saveDeductionRule(
                      id: rule?.id,
                      categoryId: categoryId,
                      subCategoryId: subCategoryId,
                      stateId: selectedState?.id,
                      ruleType: ruleType,
                      value: val,
                    );
                    Get.back();
                  },
                ),
              ],
            ),
          ),
        );
      },
    ),
  );
}
