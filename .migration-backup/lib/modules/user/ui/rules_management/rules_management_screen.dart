import 'package:booksmart/modules/admin/controllers/category_controler.dart';
import 'package:booksmart/modules/user/controllers/rules_controller.dart';
import 'package:booksmart/modules/user/ui/rules_management/rules_dialouge.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:booksmart/widgets/app_text.dart';
import 'package:get/get.dart';

class RulesManagementScreen extends StatefulWidget {
  const RulesManagementScreen({super.key});

  @override
  State<RulesManagementScreen> createState() => _RulesManagementScreenState();
}

class _RulesManagementScreenState extends State<RulesManagementScreen> {
  late RulesController categoryController;
  late CategoryAdminController categoryC;

  @override
  void initState() {
    if (Get.isRegistered<RulesController>()) {
      categoryController = Get.find<RulesController>();
    } else {
      categoryController = Get.put(RulesController(), permanent: true);
    }
    if (Get.isRegistered<CategoryAdminController>()) {
      categoryC = Get.find<CategoryAdminController>();
    } else {
      categoryC = Get.put(CategoryAdminController(), permanent: true);
    }
    super.initState();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: kIsWeb ? null : AppBar(title: const Text('Rules Management')),
      body: GetBuilder<RulesController>(
        builder: (c) {
          if (c.isLoading) {
            return const Center(child: CircularProgressIndicator());
          }

          if (c.rules.isEmpty) {
            return const Center(child: AppText('No rules found'));
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: c.rules.length,
            itemBuilder: (_, index) {
              final rule = c.rules[index];

              return Card(
                child: ListTile(
                  title: AppText(
                    'If memo contains "${rule.memo}"',
                    fontWeight: FontWeight.w600,
                  ),
                  subtitle: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      AppText(
                        'Category : ${categoryC.getCategoryName(rule.categoryId)}',
                      ),
                      AppText(
                        'Sub_catgory : ${categoryC.getSubCategoryName(rule.subCategoryId)}',
                        fontSize: 10,
                      ),
                    ],
                  ),
                  trailing: Switch(
                    value: rule.status,
                    onChanged: (val) => c.toggleRule(rule, val),
                  ),
                  onTap: () => showAddEditRuleDialog(rule: rule),
                ),
              );
            },
          );
        },
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => showAddEditRuleDialog(),
        child: const Icon(Icons.add),
      ),
    );
  }
}
