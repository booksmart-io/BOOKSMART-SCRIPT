import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/models/category_rule_model.dart';
import 'package:booksmart/modules/admin/controllers/category_controler.dart';
import 'package:booksmart/modules/common/controllers/auth_controller.dart';
import 'package:booksmart/modules/user/controllers/rules_controller.dart';
import 'package:booksmart/widgets/custom_dialog.dart';
import 'package:booksmart/widgets/custom_drop_down.dart';
import 'package:get/get.dart';
import 'package:dropdown_search/dropdown_search.dart';

void showAddEditRuleDialog({CategoryRuleModel? rule}) {
  final rulesC = Get.find<RulesController>();
  final categoryC = Get.find<CategoryAdminController>();

  final memoCtrl = TextEditingController(text: rule?.memo ?? '');

  int? selectedCategory = rule?.categoryId;
  int? selectedSubCategory = rule?.subCategoryId;

  final categoryDropdownKey = GlobalKey<DropdownSearchState<int>>();
  final subCategoryDropdownKey = GlobalKey<DropdownSearchState<int>>();

  customDialog(
    title: rule == null ? 'Add Rule' : 'Edit Rule',
    child: StatefulBuilder(
      builder: (context, setState) {
        return SingleChildScrollView(
          padding: const EdgeInsets.all(6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              /// MEMO
              AppTextField(
                controller: memoCtrl,
                labelText: 'Memo contains',
                hintText: 'Memo contains',
              ),

              0.04.verticalSpace,

              /// CATEGORY DROPDOWN
              CustomDropDownWidget<int>(
                dropDownKey: categoryDropdownKey,
                hint: 'Select Category',
                selectedItem: selectedCategory,
                items: categoryC.categories.map((c) => c.id).toList(),
                itemAsString: (id) => categoryC.getCategoryName(id),
                onChanged: (val) {
                  setState(() {
                    selectedCategory = val;
                    selectedSubCategory = null; // reset sub-category
                  });
                },
              ),

              /// SUB CATEGORY DROPDOWN
              if (selectedCategory != null) ...[
                0.04.verticalSpace,
                CustomDropDownWidget<int>(
                  dropDownKey: subCategoryDropdownKey,
                  hint: 'Select Sub Category',
                  selectedItem: selectedSubCategory,
                  items: categoryC
                      .getSubCategoriesByCategory(selectedCategory!)
                      .map((s) => s.id)
                      .toList(),
                  itemAsString: (id) => categoryC.getSubCategoryName(id),
                  onChanged: (val) {
                    setState(() {
                      selectedSubCategory = val;
                    });
                  },
                ),
              ],

              0.06.verticalSpace,

              /// SAVE / UPDATE BUTTON
              AppButton(
                buttonText: rule == null ? 'Save Rule' : 'Update Rule',
                onTapFunction: () {
                  if (memoCtrl.text.trim().isEmpty ||
                      selectedCategory == null) {
                    return;
                  }

                  if (rule == null) {
                    rulesC.addRule(
                      CategoryRuleModel(
                        id: 0,
                        memo: memoCtrl.text.trim(),
                        categoryId: selectedCategory!,
                        subCategoryId: selectedSubCategory,
                        userId: authUser!.authId,
                        status: true,
                        createdAt: DateTime.now(),
                        updatedAt: DateTime.now(),
                      ),
                    );
                  } else {
                    rulesC.updateRule(
                      id: rule.id,
                      data: {
                        'memo': memoCtrl.text.trim(),
                        'category_id': selectedCategory,
                        'sub_category_id': selectedSubCategory,
                      },
                    );
                  }

                  Get.back();
                },
              ),
            ],
          ),
        );
      },
    ),
  );
}
