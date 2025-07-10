import 'package:booksmart/constant/data.dart';
import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/models/bank_model.dart';
import 'package:booksmart/modules/admin/controllers/category_controler.dart';
import 'package:booksmart/modules/user/controllers/transaction_controller.dart';
import 'dart:async';
import 'package:booksmart/modules/user/ui/bulk_review/bulk_review_screen.dart';
import 'package:booksmart/modules/user/ui/transaction/add_transaction_manual.dart';
import 'package:booksmart/widgets/date_range_picker.dart';
import 'package:booksmart/widgets/snackbar.dart';
import 'package:dropdown_search/dropdown_search.dart';
import 'package:get/get.dart';
import '../../../../services/edge_functions.dart';
import '../../../../widgets/confirmation_dialog.dart';
import '../../controllers/bank_controller.dart';
import '../../controllers/organization_controller.dart';
import '../../../../widgets/custom_drop_down.dart';
import '../../../../widgets/custom_dialog.dart';
import 'components/transaction_card.dart';

class TransactionListScreen extends StatefulWidget {
  const TransactionListScreen({super.key});

  @override
  State<TransactionListScreen> createState() => _TransactionListScreenState();
}

class _TransactionListScreenState extends State<TransactionListScreen> {
  String searchQuery = "";
  DateTime? startDate;
  DateTime? endDate;
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  // Filter dropdown keys
  final categoryDropdownKey = GlobalKey<DropdownSearchState<String>>();
  final typeDropdownKey = GlobalKey<DropdownSearchState<String>>();
  final amountRangeDropdownKey = GlobalKey<DropdownSearchState<String>>();
  final bankAccountDropdownKey = GlobalKey<DropdownSearchState<String>>();

  /// Maps display label → BankAccountModel for the filter dropdown.
  final Map<String, BankAccountModel> _accountLabelMap = {};

  // Persisted selected filter labels (survive dialog close/reopen until reset)
  String? _selectedCategory;
  String? _selectedType;
  String? _selectedAmountRange;
  String? _selectedBankAccountLabel; // display label
  String? _selectedBankAccountId; // Plaid account ID (derived)

  void _applyFilters() {
    // Persist selected labels from dropdown keys into state
    _selectedCategory = categoryDropdownKey.currentState?.getSelectedItem;
    _selectedType = typeDropdownKey.currentState?.getSelectedItem;
    _selectedAmountRange = amountRangeDropdownKey.currentState?.getSelectedItem;
    _selectedBankAccountLabel =
        bankAccountDropdownKey.currentState?.getSelectedItem;

    // Resolve category name → id
    Object? categoryId;
    if (_selectedCategory != null && _selectedCategory != 'All') {
      try {
        categoryId = categoryController.categories
            .firstWhere((c) => c.name == _selectedCategory)
            .id;
      } catch (_) {
        categoryId = _selectedCategory;
      }
    }

    // Resolve bank-account label → Plaid account ID
    if (_selectedBankAccountLabel != null &&
        _accountLabelMap.containsKey(_selectedBankAccountLabel)) {
      _selectedBankAccountId =
          _accountLabelMap[_selectedBankAccountLabel]!.plaidAccountId;
    } else {
      _selectedBankAccountId = null;
    }

    transactionC.getTransactions(
      searchQuery: searchQuery,
      category: categoryId ?? 'All',
      type: _selectedType,
      amountRange: _selectedAmountRange,
      startDate: startDate,
      endDate: endDate,
      bankAccountId: _selectedBankAccountId,
    );
  }

  Future<void> _showFilterDialog() async {
    // Build the bank-account label map from BankController
    _accountLabelMap.clear();
    final bankCtrl = Get.find<BankController>(
      tag: getCurrentOrganization!.id.toString(),
    );
    for (final bank in bankCtrl.banks) {
      for (final account in bank.accounts) {
        final label =
            '${bank.institutionName} – ${account.name}'
            '${account.mask != null ? " (••${account.mask})" : ""}';
        _accountLabelMap[label] = account;
      }
    }

    await customDialog(
      title: "Filter Transactions",
      child: ListView(
        padding: const EdgeInsets.all(15),
        shrinkWrap: true,
        children: [
          // Bank Account filter
          if (_accountLabelMap.isNotEmpty) ...[
            _buildFilterDropdown(
              label: 'Bank Account',
              items: ['All', ..._accountLabelMap.keys],
              dropDownKey: bankAccountDropdownKey,
              selectedItem: _selectedBankAccountLabel,
            ),
            const SizedBox(height: 16),
          ],

          // Category filter
          _buildFilterDropdown(
            label: 'Category',
            items: ['All', ...categoryController.categories.map((e) => e.name)],
            dropDownKey: categoryDropdownKey,
            selectedItem: _selectedCategory,
          ),
          const SizedBox(height: 16),

          // Type filter
          _buildFilterDropdown(
            label: 'Type',
            items: ['All', personalTransactionType, businessTransactionType],
            dropDownKey: typeDropdownKey,
            selectedItem: _selectedType,
          ),
          const SizedBox(height: 16),

          // Amount Range filter
          _buildFilterDropdown(
            label: 'Amount Range',
            items: [
              'All',
              'Under \$50',
              '\$50 - \$200',
              '\$200 - \$500',
              'Over \$500',
            ],
            dropDownKey: amountRangeDropdownKey,
            selectedItem: _selectedAmountRange,
          ),
          const SizedBox(height: 16),

          // Date range
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AppText("Date Range", fontWeight: FontWeight.w600, fontSize: 14),
              const SizedBox(height: 8),
              DateRangePickerWidget(
                onDateRangeSelected: (start, end) {
                  setState(() {
                    startDate = start;
                    endDate = end;
                  });
                },
                initialText: startDate == null
                    ? "Select Date Range"
                    : "Custom Range",
              ),
            ],
          ),
          const SizedBox(height: 24),

          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              OutlinedButton(
                onPressed: () {
                  clearFilters();
                  _applyFilters();
                  Get.back();
                },
                child: AppText("Reset"),
              ),

              const SizedBox(width: 10),
              AppButton(
                buttonText: " Apply ",
                onTapFunction: () {
                  _applyFilters();
                  Get.back();
                },
              ),
            ],
          ),
        ],
      ),
    ).then((_) => setState(() {}));
  }

  Widget _buildFilterDropdown({
    required String label,
    required List<String> items,
    required GlobalKey<DropdownSearchState<String>> dropDownKey,
    String? selectedItem,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AppText(label, fontWeight: FontWeight.w600, fontSize: 14),
        const SizedBox(height: 8),
        CustomDropDownWidget<String>(
          dropDownKey: dropDownKey,
          label: label,
          hint: 'Select $label',
          items: items,
          selectedItem: selectedItem,
        ),
      ],
    );
  }

  void clearFilters() {
    categoryDropdownKey.currentState?.clear();
    typeDropdownKey.currentState?.clear();
    amountRangeDropdownKey.currentState?.clear();
    bankAccountDropdownKey.currentState?.clear();
    setState(() {
      startDate = null;
      endDate = null;
      searchQuery = '';
      _selectedCategory = null;
      _selectedType = null;
      _selectedAmountRange = null;
      _selectedBankAccountLabel = null;
      _selectedBankAccountId = null;
    });
  }

  bool get isAnyActiveFilter =>
      categoryDropdownKey.currentState?.getSelectedItem != null ||
      typeDropdownKey.currentState?.getSelectedItem != null ||
      amountRangeDropdownKey.currentState?.getSelectedItem != null ||
      bankAccountDropdownKey.currentState?.getSelectedItem != null ||
      startDate != null ||
      searchQuery.isNotEmpty;

  late TransactionController transactionC;
  late CategoryAdminController categoryController;
  @override
  void initState() {
    if (Get.isRegistered<TransactionController>(
      tag: getCurrentOrganization!.id.toString(),
    )) {
      transactionC = Get.find<TransactionController>(
        tag: getCurrentOrganization!.id.toString(),
      );
    } else {
      transactionC = Get.put(
        TransactionController(),
        tag: getCurrentOrganization!.id.toString(),
      );
    }

    if (Get.isRegistered<CategoryAdminController>()) {
      categoryController = Get.find<CategoryAdminController>();
    } else {
      categoryController = Get.put(CategoryAdminController(), permanent: true);
    }
    if (!Get.isRegistered<BankController>(
      tag: getCurrentOrganization!.id.toString(),
    )) {
      Get.put(BankController(), tag: getCurrentOrganization!.id.toString());
    }
    super.initState();
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Column(
      children: [
        const SizedBox(height: 12),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 15),
          child: Row(
            children: [
              Expanded(
                child: AppTextField(
                  hintText: "Search transactions",
                  prefixWidget: const Icon(Icons.search),
                  onChanged: (value) {
                    searchQuery = value;
                    if (_debounce?.isActive ?? false) _debounce!.cancel();
                    _debounce = Timer(const Duration(milliseconds: 500), () {
                      _applyFilters();
                    });
                  },
                ),
              ),
              IconButton(
                icon: Icon(Icons.compass_calibration_outlined),
                onPressed: () async {
                  showConfirmationDialog(
                    title: "AI Categorization",
                    description:
                        "It will now categorize your 10 transactions through AI",
                    onYes: () async {
                      Get.back();
                      await aiCategorization().then((value) {
                        showSnackBar(value.toString());
                      });
                    },
                  );
                },
              ),

              IconButton(
                icon: Badge(
                  isLabelVisible: isAnyActiveFilter,
                  child: const Icon(Icons.filter_list),
                ),
                onPressed: _showFilterDialog,
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        Expanded(
          child: GetBuilder<BankController>(
            tag: getCurrentOrganization!.id.toString(),
            builder: (bankController) {
              if (bankController.isLoading.value) {
                return const Center(
                  child: CircularProgressIndicator.adaptive(),
                );
              }
              return GetBuilder<TransactionController>(
                tag: getCurrentOrganization!.id.toString(),
                builder: (controller) {
                  if (controller.isLoading.value) {
                    return const Center(
                      child: CircularProgressIndicator.adaptive(),
                    );
                  }

                  if (controller.transactions.isEmpty) {
                    return const Center(child: Text("No transactions found"));
                  }

                  final allTransactions = controller.transactions;

                  return ListView.separated(
                    padding: EdgeInsets.symmetric(horizontal: 15),
                    itemCount:
                        allTransactions.length + (controller.hasMore ? 1 : 0),
                    separatorBuilder: (_, index) {
                      return const SizedBox(height: 20);
                    },
                    itemBuilder: (context, index) {
                      if (index == allTransactions.length) {
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          child: controller.isLoadMoreLoading.value
                              ? const Center(child: CircularProgressIndicator())
                              : ElevatedButton(
                                  onPressed: () {
                                    controller.getTransactions(
                                      isLoadMore: true,
                                      searchQuery: searchQuery,
                                      category: categoryDropdownKey
                                          .currentState
                                          ?.getSelectedItem,
                                      type: typeDropdownKey
                                          .currentState
                                          ?.getSelectedItem,
                                      amountRange: amountRangeDropdownKey
                                          .currentState
                                          ?.getSelectedItem,
                                      startDate: startDate,
                                      endDate: endDate,
                                      bankAccountId: _selectedBankAccountId,
                                    );
                                  },
                                  child: const Text(
                                    "Load More",
                                    style: TextStyle(color: Colors.black),
                                  ),
                                ),
                        );
                      }

                      return TransactionCard(
                        transaction: allTransactions[index],
                      );
                    },
                  );
                },
              );
            },
          ),
        ),
        // Bottom buttons
        const SizedBox(height: 10),
        Padding(
          padding: const EdgeInsets.fromLTRB(15, 5, 15, 15),
          child: Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: () =>
                      goToBulkReviewScreen(shouldCloseBefore: false),
                  icon: const Icon(
                    Icons.category_outlined,
                    color: Colors.black,
                  ),
                  label: const FittedText(
                    "AI Categorization",
                    style: TextStyle(
                      color: Colors.black,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: colorScheme.primary,
                    minimumSize: const Size(double.infinity, 50),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: () => goToAddTransactionScreen(),
                  icon: const Icon(Icons.add, color: Colors.black),
                  label: const FittedText(
                    "Add Transaction",
                    style: TextStyle(
                      color: Colors.black,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: colorScheme.primary,
                    minimumSize: const Size(double.infinity, 50),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
