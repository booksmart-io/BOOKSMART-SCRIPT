// ignore_for_file: deprecated_member_use

import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/modules/admin/controllers/category_controler.dart';
import 'package:booksmart/modules/user/controllers/transaction_controller.dart';
import 'package:booksmart/widgets/custom_dialog.dart';
import 'package:flutter/foundation.dart';
import 'package:get/get.dart';
import 'package:booksmart/helpers/currency_formatter.dart';
import '../../../../../models/transaction_model.dart';
import '../transaction/add_transaction_manual.dart';

// --- Navigation Helper ---
void goToBulkReviewScreen({bool shouldCloseBefore = false}) {
  // Safe registration check to prevent "Controller not found" error
  if (!Get.isRegistered<TransactionController>()) {
    Get.lazyPut(() => TransactionController());
  }

  if (kIsWeb) {
    if (shouldCloseBefore) Get.back();
    customDialog(
      child: const BulkReviewScreen(),
      title: 'Bulk Review',
      barrierDismissible: true,
    );
  } else {
    if (shouldCloseBefore) {
      Get.off(() => const BulkReviewScreen());
    } else {
      Get.to(() => const BulkReviewScreen());
    }
  }
}

class BulkReviewScreen extends StatefulWidget {
  const BulkReviewScreen({super.key});

  @override
  State<BulkReviewScreen> createState() => _BulkReviewScreenState();
}

class _BulkReviewScreenState extends State<BulkReviewScreen> {
  // Use Get.find to get the existing controller instance
  late TransactionController txController;

  List<TransactionModel> filteredTransactions = [];
  Set<String> selectedIds = {};
  final TextEditingController searchController = TextEditingController();

  @override
  void initState() {
    super.initState();

    // Safety: Find the controller, or put it if it's missing
    txController = Get.isRegistered<TransactionController>()
        ? Get.find<TransactionController>()
        : Get.put(TransactionController());

    // Initial data load
    _fetchTransactions();
    searchController.addListener(_onSearchChanged);
  }

  void _fetchTransactions() {
    txController.getAiCatagoriesTrasections(
      isAiVerified: false,
      isCategoryNotNull: true,
    );
  }

  void _onSearchChanged() {
    setState(() {
      filteredTransactions = txController.catagoriesTransactions
          .where(
            (tx) => tx.title.toLowerCase().contains(
              searchController.text.toLowerCase(),
            ),
          )
          .toList();
    });
  }

  void toggleSelectAll() {
    setState(() {
      if (selectedIds.length == filteredTransactions.length) {
        selectedIds.clear();
      } else {
        selectedIds = filteredTransactions.map((e) => e.id.toString()).toSet();
      }
    });
  }

  @override
  void dispose() {
    searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    // Use Obx to make the screen reactive to the Controller's data
    return Obx(() {
      // Keep search and main list in sync
      if (searchController.text.isEmpty) {
        filteredTransactions = txController.catagoriesTransactions;
      }

      return Scaffold(
        appBar: kIsWeb ? null : AppBar(title: const Text("Bulk Review")),
        body: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 600),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Column(
                  children: [
                    const SizedBox(height: 12),
                    // 🔍 Search Bar
                    AppTextField(
                      hintText: "Search transactions",
                      controller: searchController,
                      prefixWidget: const Icon(Icons.search),
                    ),

                    const SizedBox(height: 16),

                    // ✅ Select All Bar
                    _buildSelectAllBar(colorScheme),

                    const SizedBox(height: 12),

                    // ✅ Transaction List
                    Expanded(
                      child: txController.isAiLoading.value
                          ? const Center(
                              child: CircularProgressIndicator.adaptive(),
                            )
                          : filteredTransactions.isEmpty
                          ? const Center(
                              child: AppText(
                                "No transactions found.",
                                fontSize: 14,
                              ),
                            )
                          : ListView.builder(
                              itemCount:
                                  filteredTransactions.length +
                                  (txController.hasMoreAi ? 1 : 0),
                              itemBuilder: (context, index) {
                                if (index == filteredTransactions.length) {
                                  return Padding(
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 10,
                                    ),
                                    child:
                                        txController.isAiLoadMoreLoading.value
                                        ? const Center(
                                            child: CircularProgressIndicator(),
                                          )
                                        : ElevatedButton(
                                            onPressed: () {
                                              txController
                                                  .getAiCatagoriesTrasections(
                                                    isLoadMore: true,
                                                    isAiVerified: false,
                                                    isCategoryNotNull: true,
                                                  );
                                            },
                                            child: const Text(
                                              "Load More",
                                              style: TextStyle(
                                                color: Colors.black,
                                              ),
                                            ),
                                          ),
                                  );
                                }

                                final tx = filteredTransactions[index];

                                return BulkTransactionCard(
                                  transaction: tx,
                                  isSelected: selectedIds.contains(
                                    tx.id.toString(),
                                  ),
                                  onSelected: (val) {
                                    setState(() {
                                      if (val == true) {
                                        selectedIds.add(tx.id.toString());
                                      } else {
                                        selectedIds.remove(tx.id.toString());
                                      }
                                    });
                                  },
                                );
                              },
                            ),
                    ),

                    // ✅ Action Footer
                    if (selectedIds.isNotEmpty) _buildActionFooter(colorScheme),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    });
  }

  Widget _buildSelectAllBar(ColorScheme colorScheme) {
    bool isAllSelected =
        selectedIds.length == filteredTransactions.length &&
        filteredTransactions.isNotEmpty;

    return InkWell(
      onTap: toggleSelectAll,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
        decoration: BoxDecoration(
          color: colorScheme.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: colorScheme.outlineVariant.withValues(alpha: 0.5),
          ),
        ),
        child: Row(
          children: [
            Checkbox(
              value: isAllSelected,
              onChanged: (val) => toggleSelectAll(),
              activeColor: colorScheme.primary,
            ),
            AppText(
              isAllSelected
                  ? "Deselect All"
                  : "Select All (${filteredTransactions.length})",
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
            const Spacer(),
            if (selectedIds.isNotEmpty)
              AppText(
                "${selectedIds.length} items selected",
                fontSize: 12,
                color: colorScheme.primary,
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildActionFooter(ColorScheme colorScheme) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Row(
        spacing: 20,
        children: [
          Expanded(
            child: OutlinedButton(
              style: OutlinedButton.styleFrom(
                side: BorderSide(color: colorScheme.outline),
                minimumSize: const Size.fromHeight(50),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              onPressed: () {},
              child: const AppText("Reclassify", fontWeight: FontWeight.bold),
            ),
          ),

          Expanded(
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: orangeColor,
                minimumSize: const Size.fromHeight(50),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              onPressed: () async {
                if (selectedIds.isEmpty) return;
                await txController.approveTransactions(
                  ids: selectedIds.map((e) => int.parse(e)).toList(),
                );
                selectedIds.clear();
                _fetchTransactions();
                setState(() {});
              },
              child: const AppText(
                "Approve Selected",
                color: Colors.black,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class BulkTransactionCard extends StatelessWidget {
  final TransactionModel transaction;
  final bool isSelected;
  final ValueChanged<bool?> onSelected;

  const BulkTransactionCard({
    super.key,
    required this.transaction,
    required this.isSelected,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    final categoryController = Get.find<CategoryAdminController>();
    final bool isPositive = transaction.amount >= 0;
    final Color statusColor = isPositive ? Colors.green.shade600 : Colors.grey;

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: isSelected
              ? Theme.of(context).colorScheme.primary
              : Colors.transparent,
          width: 1.5,
        ),
      ),
      color: Theme.of(
        context,
      ).colorScheme.surfaceVariant.withValues(alpha: 0.3),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () {
          goToAddTransactionScreen(transaction: transaction);
        },
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Checkbox(value: isSelected, onChanged: onSelected),
              Container(width: 4, color: statusColor),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(12.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: AppText(
                              transaction.title,
                              fontWeight: FontWeight.bold,
                              fontSize: 15,
                            ),
                          ),
                          AppText(
                            CurrencyUtils.format(transaction.amount.abs()),
                            fontWeight: FontWeight.bold,
                            color: statusColor,
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      AppText(
                        transaction.category == null
                            ? "Uncategorized"
                            : categoryController.getCategoryName(
                                transaction.category!,
                              ),
                        fontSize: 12,
                        color: Colors.grey.shade600,
                      ),
                      if (transaction.category != null)
                        AppText(
                          categoryController.getSubCategoryName(
                            transaction.subcategory,
                          ),
                          fontSize: 12,
                          color: Colors.grey.shade600,
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
