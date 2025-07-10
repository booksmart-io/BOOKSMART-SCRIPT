// ignore_for_file: unrelated_type_equality_checks

import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/modules/admin/controllers/category_controler.dart';
import 'package:booksmart/widgets/custom_dialog.dart';
import 'package:flutter/foundation.dart';
import 'package:get/get.dart';

Future<dynamic> goToCategorySelectionScreen({
  int? selectedCategory,
  int? selectedSubcategory,
}) async {
  if (kIsWeb) {
    return customDialog(
      child: CategorySelectionScreen(
        selectedCategory: selectedCategory,
        selectedSubcategory: selectedSubcategory,
      ),
      title: 'Select Category',
    );
  } else {
    return Get.to(
      () => CategorySelectionScreen(
        selectedCategory: selectedCategory,
        selectedSubcategory: selectedSubcategory,
      ),
    );
  }
}

class CategorySelectionScreen extends StatefulWidget {
  final int? selectedCategory;
  final int? selectedSubcategory;

  const CategorySelectionScreen({
    super.key,
    this.selectedCategory,
    this.selectedSubcategory,
  });

  @override
  State<CategorySelectionScreen> createState() =>
      _CategorySelectionScreenState();
}

class _CategorySelectionScreenState extends State<CategorySelectionScreen> {
  final CategoryAdminController controller = Get.put(CategoryAdminController());

  final TextEditingController _searchController = TextEditingController();

  int? _selectedSubcategory;
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _selectedSubcategory = widget.selectedSubcategory;
  }

  void _selectSubcategory(int categoryId, int subcategoryId) {
    Get.back(
      result: {'categoryId': categoryId, 'subcategoryId': subcategoryId},
    );
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: kIsWeb ? null : AppBar(title: const Text('Select Category')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 15),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search categories...',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
                filled: true,
                fillColor: colorScheme.surfaceContainerHighest,
              ),
              onChanged: (value) {
                setState(() => _searchQuery = value.toLowerCase());
              },
            ),
          ),
          const SizedBox(height: 10),
          Expanded(
            child: GetBuilder<CategoryAdminController>(
              builder: (_) {
                final categories = controller.categories
                    .where((c) => c.name.toLowerCase().contains(_searchQuery))
                    .toList();

                if (categories.isEmpty) {
                  return const Center(child: AppText('No categories found'));
                }

                return ListView.builder(
                  padding: const EdgeInsets.only(
                    left: 15,
                    right: 15,
                    bottom: 50,
                  ),
                  itemCount: categories.length,
                  itemBuilder: (_, index) {
                    final category = categories[index];
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _buildCategoryTile(
                        categoryId: category.id,
                        categoryName: category.name,
                        colorScheme: colorScheme,
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCategoryTile({
    required int categoryId,
    required String categoryName,
    required ColorScheme colorScheme,
  }) {
    // Determine divider color based on theme brightness
    final bool isDarkMode = Theme.of(context).brightness == Brightness.dark;
    final Color dividerColor = isDarkMode
        ? Colors.white.withValues(alpha: 0.1) // Subtle white for dark mode
        : Colors.grey.shade300;
    return Card(
      margin: EdgeInsets.zero,
      child: ExpansionTile(
        leading: Icon(
          _getCategoryIcon(categoryName),
          color: colorScheme.primary,
          size: 20,
        ),
        title: AppText(categoryName, fontSize: 14),
        initiallyExpanded: false,
        dense: true,
        tilePadding: const EdgeInsets.symmetric(horizontal: 5),
        onExpansionChanged: (expanded) {
          if (expanded) {
            controller.getSubCategoriesByCategory(categoryId);
          }
        },
        children: [
          GetBuilder<CategoryAdminController>(
            builder: (_) {
              final subs = controller.subCategories
                  .where((e) => e.categoryId == categoryId)
                  .toList();

              if (subs.isEmpty) {
                return const Padding(
                  padding: EdgeInsets.all(12),
                  child: AppText(
                    'No sub-categories',
                    fontSize: 13,
                    color: Colors.grey,
                  ),
                );
              }

              return Column(
                children: subs.map((sub) {
                  final isSelected = _selectedSubcategory == sub.name;

                  return Column(
                    children: [
                      ListTile(
                        leading: const SizedBox(width: 40),
                        title: AppText(
                          sub.name,
                          fontSize: 14,
                          color: isSelected ? colorScheme.primary : Colors.grey,
                        ),
                        trailing: isSelected
                            ? Icon(Icons.check, color: colorScheme.primary)
                            : null,
                        dense: true,
                        onTap: () => _selectSubcategory(categoryId, sub.id),
                      ),
                      Divider(
                        height: 1,
                        thickness: 1,
                        color: dividerColor,
                        indent: 12, // Optional: add padding to the line
                        endIndent: 12,
                      ),
                    ],
                  );
                }).toList(),
              );
            },
          ),
        ],
      ),
    );
  }

  IconData _getCategoryIcon(String category) {
    switch (category) {
      case 'Expense':
        return Icons.money_off;
      case 'Income':
        return Icons.attach_money_outlined;
      case 'Cost of Goods Sold (COS)':
        return Icons.inventory_outlined;
      case 'Other Current Asset':
        return Icons.account_balance_wallet_outlined;
      case 'Equity':
        return Icons.balance_outlined;
      case 'Other Expense':
        return Icons.warning_amber_sharp;
      default:
        return Icons.category_outlined;
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }
}
