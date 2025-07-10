import 'dart:async';
import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/helpers/currency_formatter.dart';
import 'package:booksmart/modules/admin/controllers/category_controler.dart';
import 'package:booksmart/modules/user/ui/transaction/add_transaction_manual.dart';
import 'package:get/get.dart';
import 'package:jiffy/jiffy.dart';
import 'package:pie_chart/pie_chart.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../controllers/deduction_controller.dart';

class AIDeductionPage extends StatefulWidget {
  const AIDeductionPage({super.key});

  @override
  State<AIDeductionPage> createState() => _AIDeductionPageState();
}

class _AIDeductionPageState extends State<AIDeductionPage> {
  DateTimeRange _activeRange = DateTimeRange(
    start: DateTime(DateTime.now().year),
    end: DateTime.now(),
  );

  final Set<int> _expandedCategoryIds = {};
  String _selectedDeductionType = 'Federal';

  bool get isFederal => _selectedDeductionType == 'Federal';

  late String deductionControllerTag;

  @override
  void initState() {
    super.initState();

    deductionControllerTag = getDeductionControllerTag(
      _activeRange.start,
      _activeRange.end,
    );

    if (!Get.isRegistered<CategoryAdminController>()) {
      Get.put(CategoryAdminController(), permanent: true);
    }
    _loadData();
  }

  Future<void> _loadData() async {
    deductionControllerTag = getDeductionControllerTag(
      _activeRange.start,
      _activeRange.end,
    );
    if (!Get.isRegistered<DeductionController>(tag: deductionControllerTag)) {
      Get.put(
        DeductionController(
          startDate: _activeRange.start,
          endDate: _activeRange.end,
        ),
        tag: deductionControllerTag,
        permanent: true,
      );
    }
  }

  String _getDateRangeText() {
    final start = _activeRange.start;
    final end = _activeRange.end;
    return "${Jiffy.parseFromDateTime(start).yMMMd} - ${Jiffy.parseFromDateTime(end).yMMMd}";
  }

  Widget _buildStatCard({
    required IconData icon,
    required Color iconColor,
    required Color iconBgColor,
    required String title,
    required String value,
    required String subtext,
    Color? subtextColor,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      decoration: BoxDecoration(
        color: const Color(0xFF0C2346).withValues(alpha: 0.4),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: iconBgColor.withValues(alpha: 0.12),
              shape: BoxShape.circle,
              border: Border.all(
                color: iconColor.withValues(alpha: 0.3),
                width: 1,
              ),
            ),
            child: Icon(icon, color: iconColor, size: 20),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                FittedText(
                  title,
                  style: const TextStyle(color: Colors.white70, fontSize: 12),
                ),
                const SizedBox(height: 6),
                FittedText(
                  value,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 6),
                FittedText(
                  subtext,
                  style: TextStyle(
                    color: subtextColor ?? Colors.white54,
                    fontSize: 11,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader(double width) {
    final isMobile = width < 720;
    final isVerySmall = width < 480;

    final titleColumn = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: const [
        Text(
          'AI Deductions',
          style: TextStyle(
            color: Colors.white,
            fontSize: 24,
            fontWeight: FontWeight.bold,
          ),
        ),
        SizedBox(height: 4),
        Text(
          'Review AI-identified deductions and their impact on your taxes.',
          style: TextStyle(color: Colors.white70, fontSize: 14),
        ),
      ],
    );

    final datePickerBtn = InkWell(
      onTap: () async {
        final now = DateTime.now();
        final DateTimeRange? pickedRange = await showDateRangePicker(
          context: context,
          firstDate: DateTime(now.year - 2),
          lastDate: DateTime(now.year + 2),
          initialDateRange: DateTimeRange(
            start: _activeRange.start,
            end: _activeRange.end,
          ),
          builder: (context, child) {
            return Center(
              child: Container(
                margin: const EdgeInsets.all(20),
                width: 400,
                decoration: BoxDecoration(
                  border: Border.all(color: Colors.grey.shade300, width: 1),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: child,
                ),
              ),
            );
          },
        );
        if (pickedRange != null) {
          setState(() {
            _activeRange = pickedRange;

            _loadData();
          });
        }
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14),
        height: 40,
        decoration: BoxDecoration(
          border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
          borderRadius: BorderRadius.circular(8),
          color: const Color(0xFF0C2346),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.calendar_today_outlined,
              color: Colors.white70,
              size: 16,
            ),
            const SizedBox(width: 8),
            Flexible(
              child: FittedText(
                _getDateRangeText(),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            const SizedBox(width: 8),
            const Icon(
              Icons.keyboard_arrow_down,
              color: Colors.white70,
              size: 16,
            ),
          ],
        ),
      ),
    );

    final deductionTypeDropdown = Container(
      padding: const EdgeInsets.symmetric(horizontal: 5),
      height: 40,
      width: 100,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
        borderRadius: BorderRadius.circular(8),
        color: const Color(0xFF0C2346),
      ),
      child: DropdownButton<String>(
        value: _selectedDeductionType,
        dropdownColor: const Color(0xFF0C2346),
        underline: SizedBox(),
        isDense: true,
        elevation: 0,
        borderRadius: BorderRadius.circular(8),

        icon: const Icon(
          Icons.keyboard_arrow_down,
          color: Colors.white70,
          size: 16,
        ),
        style: const TextStyle(
          color: Colors.white,
          fontSize: 14,
          fontWeight: FontWeight.w500,
        ),
        onChanged: (String? newValue) {
          if (newValue != null) {
            setState(() {
              _selectedDeductionType = newValue;
            });
          }
        },
        items: <String>['Federal', 'State'].map<DropdownMenuItem<String>>((
          String value,
        ) {
          return DropdownMenuItem<String>(
            value: value,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 3),
              child: Text(value),
            ),
          );
        }).toList(),
      ),
    );

    if (isMobile) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          titleColumn,
          const SizedBox(height: 16),
          if (isVerySmall)
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                datePickerBtn,
                const SizedBox(height: 12),
                deductionTypeDropdown,
              ],
            )
          else
            Row(
              children: [
                Expanded(child: datePickerBtn),
                const SizedBox(width: 12),
                Expanded(child: deductionTypeDropdown),
              ],
            ),
        ],
      );
    }

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(child: titleColumn),
        const SizedBox(width: 16),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            datePickerBtn,
            const SizedBox(width: 12),
            deductionTypeDropdown,
          ],
        ),
      ],
    );
  }

  Widget _buildBreakdownHeader() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: const [
        Text(
          'Deductions Breakdown',
          style: TextStyle(
            color: Colors.white,
            fontSize: 16,
            fontWeight: FontWeight.bold,
          ),
        ),
        Text(
          'Click on a category to view matching transactions',
          style: TextStyle(color: Colors.white54, fontSize: 12),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final double width = MediaQuery.sizeOf(context).width;
    final bool isLargeScreen = width > 1100;

    return GetBuilder<DeductionController>(
      tag: deductionControllerTag,
      builder: (controller) {
        Widget buildPieChartCard() {
          final mainContent = LayoutBuilder(
            builder: (context, constraints) {
              final isWide = constraints.maxWidth > 420;
              final chartWidget = Container(
                padding: EdgeInsets.all(20),
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: PieChart(
                    dataMap: {
                      for (var e in controller.results)
                        e.subCategoryName: e.totalAmount,
                    },
                    chartType: ChartType.ring,
                    colorList: controller.results.map((e) => e.color).toList(),
                    chartRadius: 200,
                    ringStrokeWidth: 50,
                    centerWidget: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text(
                          'Total Deductions',
                          style: TextStyle(color: Colors.white54, fontSize: 10),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          CurrencyUtils.format(
                            isFederal
                                ? controller.totalFederalDeduction
                                : controller.totalStateDeduction,
                          ),
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 16,
                          ),
                        ),
                      ],
                    ),
                    chartValuesOptions: const ChartValuesOptions(
                      showChartValues: true,
                      showChartValuesInPercentage: true,
                      showChartValuesOutside: true,
                      decimalPlaces: 1,
                      chartValueStyle: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        // color: Colors.white,
                      ),
                      // showChartValueBackground: false,
                    ),
                    legendOptions: const LegendOptions(showLegends: false),
                  ),
                ),
              );

              final legendWidget = Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: controller.results.map((entry) {
                  final color = entry.color;
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6.0),
                    child: Row(
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            color: color,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 5),
                        Expanded(
                          child: Text(
                            entry.subCategoryName,
                            style: const TextStyle(
                              color: Colors.white70,
                              fontSize: 13,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: FittedText(
                            CurrencyUtils.format(
                              isFederal
                                  ? entry.federalDeduction.toInt()
                                  : entry.stateDeduction.toInt(),
                            ),
                            alignment: Alignment.centerRight,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                }).toList(),
              );

              if (isWide) {
                return Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(flex: 3, child: chartWidget),
                    const SizedBox(width: 50),
                    Expanded(flex: 2, child: legendWidget),
                  ],
                );
              } else {
                return SingleChildScrollView(
                  child: Column(
                    children: [
                      Center(child: chartWidget),
                      const SizedBox(height: 20),
                      legendWidget,
                    ],
                  ),
                );
              }
            },
          );

          return Card(
            color: const Color(0xFF0C2346).withValues(alpha: 0.4),
            margin: EdgeInsets.zero,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: BorderSide(color: Colors.white.withValues(alpha: 0.08)),
            ),
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: const [
                      Text(
                        "Deductions by Category",
                        style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                      SizedBox(width: 6),
                      Icon(Icons.info_outline, color: Colors.white54, size: 16),
                    ],
                  ),
                  const SizedBox(height: 20),
                  mainContent,
                ],
              ),
            ),
          );
        }

        Widget buildStatsGrid(double width) {
          double totalDeductions = isFederal
              ? controller.totalFederalDeduction
              : controller.totalStateDeduction;
          final cards = [
            _buildStatCard(
              icon: LucideIcons.wallet,
              iconColor: const Color(0xFF2B7FFF),
              iconBgColor: const Color(0xFF2B7FFF),
              title: "Total Amount",
              value: CurrencyUtils.format(controller.totalAmount),
              subtext: "100% of transactions",
            ),
            _buildStatCard(
              icon: LucideIcons.database,
              iconColor: const Color(0xFF34C759),
              iconBgColor: const Color(0xFF34C759),
              title: "Total Deductions",
              value: CurrencyUtils.format(
                isFederal
                    ? controller.totalFederalDeduction
                    : controller.totalStateDeduction,
              ),
              subtext:
                  "${((totalDeductions / controller.totalAmount) * 100).toStringAsFixed(0)}% of total amount",
              subtextColor: const Color(0xFF34C759),
            ),

            _buildStatCard(
              icon: LucideIcons.fileText,
              iconColor: const Color(0xFFFFCC00),
              iconBgColor: const Color(0xFFFFCC00),
              title: "Total Transactions",
              value: "${controller.totalTransactions}",
              subtext: "Across all categories",
            ),

            _buildStatCard(
              icon: LucideIcons.percent,
              iconColor: const Color(0xFF9E00FF),
              iconBgColor: const Color(0xFF9E00FF),
              title: "Deduction Rate",
              value:
                  "${((totalDeductions / controller.totalAmount) * 100).toStringAsFixed(2)}%",
              subtext: "Average deduction rate",
            ),
          ];

          return LayoutBuilder(
            builder: (context, constraints) {
              const double spacing = 20;
              const double runSpacing = 20;

              final itemWidth = (constraints.maxWidth - spacing) / 2;
              final itemHeight = (constraints.maxHeight - runSpacing) / 2;

              return Wrap(
                spacing: spacing,
                runSpacing: runSpacing,
                children: cards.map((e) {
                  return SizedBox(
                    width: itemWidth,
                    height: itemHeight,
                    child: e,
                  );
                }).toList(),
              );
            },
          );
        }

        Widget buildSubTable(DeductionResult row) {
          return GetBuilder<DeductionTransactionController>(
            tag: getDeductionTransactionControllerTag(
              row.subCategoryId,
              _activeRange.start,
              _activeRange.end,
            ),
            builder: (transactionController) {
              if (transactionController.isLoading.value) {
                return Container(
                  height: 100,
                  alignment: Alignment.center,
                  child: CircularProgressIndicator.adaptive(),
                );
              } else if (transactionController.transactions.isEmpty) {
                return Container(
                  height: 100,
                  alignment: Alignment.center,
                  child: Text("No transactions found"),
                );
              }
              return Container(
                padding: const EdgeInsets.symmetric(
                  vertical: 12,
                  horizontal: 24,
                ),
                color: const Color(0xFF071426),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8.0),
                      child: Row(
                        children: const [
                          Expanded(
                            flex: 2,
                            child: Text(
                              'Date',
                              style: TextStyle(
                                color: Colors.white38,
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          Expanded(
                            flex: 4,
                            child: Text(
                              'Description',
                              style: TextStyle(
                                color: Colors.white38,
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          Expanded(
                            flex: 3,
                            child: Text(
                              'Merchant',
                              style: TextStyle(
                                color: Colors.white38,
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          Expanded(
                            flex: 2,
                            child: Text(
                              'Amount',
                              textAlign: TextAlign.end,
                              style: TextStyle(
                                color: Colors.white38,
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),

                          Expanded(flex: 1, child: Text("Action")),
                        ],
                      ),
                    ),
                    const Divider(color: Colors.white12, height: 1),

                    ...transactionController.transactions.map((tx) {
                      return InkWell(
                        onTap: () {
                          goToAddTransactionScreen(transaction: tx);
                        },
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 10.0),
                          child: Row(
                            children: [
                              Expanded(
                                flex: 2,
                                child: Text(
                                  Jiffy.parseFromDateTime(tx.dateTime).yMMMd,
                                  style: const TextStyle(
                                    color: Colors.white70,
                                    fontSize: 12,
                                  ),
                                ),
                              ),
                              Expanded(
                                flex: 4,
                                child: Text(
                                  tx.description.isNotEmpty
                                      ? tx.description
                                      : tx.title,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w500,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              Expanded(
                                flex: 3,
                                child: Text(
                                  tx.title,
                                  style: const TextStyle(
                                    color: Colors.white70,
                                    fontSize: 12,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              Expanded(
                                flex: 2,
                                child: Text(
                                  CurrencyUtils.format(tx.amount),
                                  textAlign: TextAlign.end,
                                  style: const TextStyle(
                                    color: Colors.white70,
                                    fontSize: 12,
                                  ),
                                ),
                              ),
                              Expanded(child: Icon(Icons.remove_red_eye)),
                            ],
                          ),
                        ),
                      );
                    }),
                    const SizedBox(height: 12),
                  ],
                ),
              );
            },
          );
        }

        Widget buildBreakdownTable() {
          if (controller.results.isEmpty) {
            return Container(
              padding: const EdgeInsets.all(40),
              decoration: BoxDecoration(
                color: const Color(0xFF0C2346).withValues(alpha: 0.2),
                border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Center(
                child: Text(
                  'No transactions available',
                  style: TextStyle(color: Colors.white54, fontSize: 14),
                ),
              ),
            );
          }

          return Container(
            decoration: BoxDecoration(
              color: const Color(0xFF0C2346).withValues(alpha: 0.2),
              border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(
                    vertical: 16.0,
                    horizontal: 16.0,
                  ),
                  child: Row(
                    spacing: 3,
                    children: const [
                      Expanded(
                        flex: 3,
                        child: FittedText(
                          'Category',
                          style: TextStyle(
                            color: Colors.white54,
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      Expanded(
                        flex: 2,
                        child: FittedText(
                          'Total',
                          style: TextStyle(
                            color: Colors.white54,
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      Expanded(
                        flex: 2,
                        child: FittedText(
                          'Deductions',
                          style: TextStyle(
                            color: Colors.white54,
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      Expanded(
                        flex: 2,
                        child: FittedText(
                          'Deduction Rate',
                          style: TextStyle(
                            color: Colors.white54,
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      Expanded(
                        flex: 1,
                        child: FittedText(
                          'Transactions',
                          style: TextStyle(
                            color: Colors.white54,
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      Expanded(
                        flex: 1,
                        child: FittedText(
                          'Action',
                          alignment: Alignment.centerRight,
                          style: TextStyle(
                            color: Colors.white54,
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const Divider(color: Colors.white12, height: 1),
                StatefulBuilder(
                  builder: (context, rowState) {
                    return Column(
                      children: controller.results.map((row) {
                        final isExpanded = _expandedCategoryIds.contains(
                          row.subCategoryId,
                        );

                        return Column(
                          children: [
                            InkWell(
                              onTap: () {
                                rowState(() {
                                  if (isExpanded) {
                                    _expandedCategoryIds.remove(
                                      row.subCategoryId,
                                    );
                                  } else {
                                    _expandedCategoryIds.add(row.subCategoryId);

                                    String deductionTransactionControllerTag =
                                        getDeductionTransactionControllerTag(
                                          row.subCategoryId,
                                          _activeRange.start,
                                          _activeRange.end,
                                        );

                                    if (!Get.isRegistered<
                                      DeductionTransactionController
                                    >(tag: deductionTransactionControllerTag)) {
                                      Get.put(
                                        DeductionTransactionController(
                                          subCategoryId: row.subCategoryId,
                                          startDate: _activeRange.start,
                                          endDate: _activeRange.end,
                                        ),
                                        tag: deductionTransactionControllerTag,
                                        permanent: true,
                                      );
                                    }
                                  }
                                });
                              },
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  vertical: 16,
                                  horizontal: 16,
                                ),
                                decoration: BoxDecoration(
                                  border: Border(
                                    bottom: BorderSide(
                                      color: Colors.white.withValues(
                                        alpha: 0.04,
                                      ),
                                      width: 1,
                                    ),
                                  ),
                                ),
                                child: Row(
                                  spacing: 3,
                                  children: [
                                    Expanded(
                                      flex: 3,
                                      child: Row(
                                        children: [
                                          Container(
                                            width: 8,
                                            height: 8,
                                            decoration: BoxDecoration(
                                              color: row.color,
                                              shape: BoxShape.circle,
                                            ),
                                          ),
                                          const SizedBox(width: 8),
                                          Expanded(
                                            child: FittedText(
                                              row.subCategoryName,
                                              style: const TextStyle(
                                                color: Colors.white,
                                                fontSize: 13,
                                                fontWeight: FontWeight.w500,
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    Expanded(
                                      flex: 2,
                                      child: FittedText(
                                        CurrencyUtils.format(row.totalAmount),
                                        style: const TextStyle(
                                          color: Colors.white70,
                                          fontSize: 13,
                                        ),
                                      ),
                                    ),
                                    Expanded(
                                      flex: 2,
                                      child: FittedText(
                                        CurrencyUtils.format(
                                          isFederal
                                              ? row.federalDeduction
                                              : row.stateDeduction,
                                        ),
                                        style: const TextStyle(
                                          color: Colors.white70,
                                          fontSize: 13,
                                        ),
                                      ),
                                    ),
                                    Expanded(
                                      flex: 2,
                                      child: FittedText(
                                        row.deductionRate == null
                                            ? "---"
                                            : "${row.deductionRate}%",
                                        style: const TextStyle(
                                          color: Colors.white70,
                                          fontSize: 13,
                                        ),
                                      ),
                                    ),
                                    Expanded(
                                      flex: 1,
                                      child: FittedText(
                                        "${row.transactionCount}",
                                        style: const TextStyle(
                                          color: Colors.white70,
                                          fontSize: 13,
                                        ),
                                      ),
                                    ),
                                    Expanded(
                                      flex: 1,
                                      child: Align(
                                        alignment: Alignment.centerRight,
                                        child: Icon(
                                          isExpanded
                                              ? Icons.keyboard_arrow_up
                                              : Icons.keyboard_arrow_down,
                                          color: Colors.white54,
                                          size: 18,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            if (isExpanded) buildSubTable(row),
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

        return Scaffold(
          backgroundColor: primaryColor,
          body: controller.isLoading.isTrue
              ? const Center(
                  child: CircularProgressIndicator(color: Color(0xFF2B7FFF)),
                )
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(24.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _buildHeader(width),
                      const SizedBox(height: 24),
                      if (isLargeScreen)
                        SizedBox(
                          height: 350,
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(flex: 6, child: buildPieChartCard()),
                              const SizedBox(width: 20),
                              Expanded(flex: 5, child: buildStatsGrid(width)),
                            ],
                          ),
                        )
                      else
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            buildPieChartCard(),
                            const SizedBox(height: 20),
                            SizedBox(height: 250, child: buildStatsGrid(width)),
                          ],
                        ),
                      const SizedBox(height: 32),
                      _buildBreakdownHeader(),
                      const SizedBox(height: 16),
                      buildBreakdownTable(),
                    ],
                  ),
                ),
        );
      },
    );
  }
}
