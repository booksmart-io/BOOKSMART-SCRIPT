import 'dart:math';

import 'package:booksmart/constant/exports.dart';
import 'package:get/get.dart';
import 'package:syncfusion_flutter_gauges/gauges.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:booksmart/modules/user/controllers/organization_controller.dart';
import 'package:booksmart/modules/user/controllers/financial_report_controller.dart';
import 'package:booksmart/modules/user/controllers/ai_stragey_controller.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:booksmart/modules/user/ui/bank/bank_list_screen.dart';
import 'package:syncfusion_flutter_datepicker/datepicker.dart';

import '../financial_statement.dart';

class FinancialDashboardTab extends StatefulWidget {
  const FinancialDashboardTab({super.key});

  @override
  State<FinancialDashboardTab> createState() => _FinancialDashboardTabState();
}

class _FinancialDashboardTabState extends State<FinancialDashboardTab>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  /// 0: 7d, 1: 30d, 2: 3mo, 3: 12mo, 4: Yearly, 5: Custom — mirrors Profit & Loss filters.
  int _dashFilterIdx = 2;
  int? _dashSelectedYear;
  bool _didSyncFilterWithController = false;

  static const Color _bg = Color(0xFF020E2C);
  static const Color _cardStart = Color(0xFF071F4A);
  static const Color _cardEnd = Color(0xFF061A3D);
  static const Color _cardStroke = Color(0xFF123469);
  static const Color _title = Color(0xFFA9BCDE);
  static const Color _text = Color(0xFFEAF2FF);
  static const Color _muted = Color(0xFF6E86AD);
  static const Color _green = Color(0xFF4AE481);
  static const Color _red = Color(0xFFFF6A6A);
  static const Color _yellow = Color(0xFFFFC52C);

  static String _money(double value, {int decimals = 2}) {
    final fmt = NumberFormat.currency(symbol: '\$', decimalDigits: decimals);
    final core = fmt.format(value.abs()).replaceFirst('\$', '');
    return value < 0 ? '(\$$core)' : '\$$core';
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Container(
      color: _bg,
      child: GetBuilder<FinancialReportController>(
        tag: getCurrentOrganization!.id.toString(),
        builder: (controller) {
          _syncFilterFromControllerRange(controller);
          if (controller.isLoading.value && !controller.hasPresentedFinancialData) {
            return const Center(child: CircularProgressIndicator());
          }

          final income = controller.totalIncome.value;
          final expenses = controller.totalExpenses.value;
          final netIncome = controller.netIncome.value;
          final assets = controller.totalAssets.value;
          final liabilities = controller.totalLiabilities.value;
          final equity = assets - liabilities;
          final cashIn = controller.cashInflow.value;
          final cashOut = controller.cashOutflow.value;
          final netCashChange = cashIn - cashOut;

          final pIncome = controller.prevPeriodIncome.value;
          final pExpenses = controller.prevPeriodExpenses.value;
          final pNetIncome = controller.prevPeriodNetIncome.value;
          final pAssets = controller.prevPeriodAssets.value;
          final pLiabilities = controller.prevPeriodLiabilities.value;
          final pEquity = pAssets - pLiabilities;
          final pCashIn = controller.prevPeriodCashInflow.value;
          final pCashOut = controller.prevPeriodCashOutflow.value;
          final pNetCash = pCashIn - pCashOut;

          final dateRange = _formatRange(controller.lastStartDate, controller.lastEndDate);
          final balanceSheetAsOf = controller.lastEndDate ??
              DateTime(
                DateTime.now().year,
                DateTime.now().month,
                DateTime.now().day,
              );
          final deductionPct = _deductionPct(controller.totalTaxDeductions.value, income, expenses);
          final healthScore = _healthScore(
            netIncome: netIncome,
            revenue: income,
            currentRatio: controller.currentRatio,
            debtToEquity: controller.debtToEquity,
            netCash: netCashChange,
            deductionPct: deductionPct,
          );
          final prevHealthScore = _healthScore(
            netIncome: pNetIncome,
            revenue: pIncome,
            currentRatio: controller.prevPeriodCurrentRatio,
            debtToEquity: controller.prevPeriodDebtToEquity,
            netCash: pNetCash,
            deductionPct: deductionPct,
          );

          final chartData = _dashChartSeries(controller);

          return SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 20),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final isDesktop = constraints.maxWidth > 1100;

                final chartRow = Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(
                      flex: 70,
                      child: _chartCard(
                        revenue: chartData.income,
                        expense: chartData.expense,
                        netCash: chartData.cashflow,
                        profit: chartData.profit,
                        xLabels: chartData.xLabels,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 30,
                      child: _insightsCard(
                        netIncome: netIncome,
                        pNetIncome: pNetIncome,
                        income: income,
                        expenses: expenses,
                        equity: equity,
                        pEquity: pEquity,
                        netCashChange: netCashChange,
                        taxDeduction: controller.totalTaxDeductions.value,
                      ),
                    ),
                  ],
                );

                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _dashboardHeader(controller),
                    const SizedBox(height: 12),
                    _topBand(
                      score: healthScore,
                      netIncome: netIncome,
                      pNetIncome: pNetIncome,
                      assets: assets,
                      pAssets: pAssets,
                      cashFlow: netCashChange,
                      pCashFlow: pNetCash,
                    ),
                    const SizedBox(height: 16),
                    const Padding(
                      padding: EdgeInsets.only(left: 4, bottom: 8),
                      child: AppText(
                        'Business Overview',
                        fontSize: 14,
                        color: _text,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    _overviewBand(
                      dateRange: dateRange,
                      balanceSheetAsOf: balanceSheetAsOf,
                      income: income, pIncome: pIncome,
                      expenses: expenses, pExpenses: pExpenses,
                      netIncome: netIncome, pNetIncome: pNetIncome,
                      assets: assets, pAssets: pAssets,
                      liabilities: liabilities, pLiabilities: pLiabilities,
                      equity: equity, pEquity: pEquity,
                      debtToEquity: controller.debtToEquity,
                      pDebtToEquity: controller.prevPeriodDebtToEquity,
                      cashIn: cashIn, pCashIn: pCashIn,
                      cashOut: cashOut, pCashOut: pCashOut,
                      netCashChange: netCashChange,
                      taxDeduction: controller.totalTaxDeductions.value,
                      aiInsights: controller.aiInsights,
                    ),
                    const SizedBox(height: 12),
                    if (isDesktop)
                      SizedBox(height: 270, child: chartRow)
                    else ...[
                      SizedBox(height: 270, child: _chartCard(
                        revenue: chartData.income,
                        expense: chartData.expense,
                        netCash: chartData.cashflow,
                        profit: chartData.profit,
                        xLabels: chartData.xLabels,
                      )),
                      const SizedBox(height: 12),
                      SizedBox(height: 270, child: _insightsCard(
                        netIncome: netIncome,
                        pNetIncome: pNetIncome,
                        income: income,
                        expenses: expenses,
                        equity: equity,
                        pEquity: pEquity,
                        netCashChange: netCashChange,
                        taxDeduction: controller.totalTaxDeductions.value,
                      )),
                    ],
                    const SizedBox(height: 12),
                    _footerBanner(
                      score: healthScore,
                      prevScore: prevHealthScore,
                      netIncome: netIncome,
                      income: income,
                      expenses: expenses,
                      cashFlow: netCashChange,
                      currentRatio: controller.currentRatio,
                      debtToEquity: controller.debtToEquity,
                    ),
                    const SizedBox(height: 12),
                    _actionRow(),
                  ],
                );
              },
            ),
          );
        },
      ),
    );
  }

  Widget _topBand({
    required double score,
    required double netIncome,
    required double pNetIncome,
    required double assets,
    required double pAssets,
    required double cashFlow,
    required double pCashFlow,
  }) {
    return SizedBox(
      height: 224,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(child: _healthCard(score)),
          const SizedBox(width: 12),
          Expanded(
            child: _metricCard(
              title: 'Net Income (Profit)',
              value: _money(netIncome),
              deltaPct: _pctChange(netIncome, pNetIncome),
              valueIsNegative: netIncome < 0,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _metricCard(
              title: 'Total Assets',
              value: _money(assets),
              deltaPct: _pctChange(assets, pAssets),
              valueIsNegative: assets < 0,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _metricCard(
              title: 'Cash Flow (Net Cash)',
              value: _money(cashFlow),
              deltaPct: _pctChange(cashFlow, pCashFlow),
              valueIsNegative: cashFlow < 0,
            ),
          ),
        ],
      ),
    );
  }

  Widget _healthCard(double score) {
    final status = score >= 81
        ? 'Excellent'
        : score >= 61
            ? 'Good'
            : score >= 41
                ? 'Fair'
                : 'Weak';
    final statusColor = score >= 60
        ? _green
        : score >= 40
            ? _yellow
            : _red;
    return _glassCard(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          const AppText(
            'Business Health Score',
            fontSize: 14,
            color: _text,
            fontWeight: FontWeight.w700,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 2),
          SizedBox(
            height: 142,
            width: double.infinity,
            child: Stack(
              alignment: Alignment.center,
              children: [
                Positioned.fill(
                  child: _getRadialGauge(score),
                ),
                Positioned(
                  top: 70,
                  child: AppText(
                    score.toInt().toString(),
                    fontSize: 22,
                    color: _text,
                    fontWeight: FontWeight.w800,
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 1),
          AppText(
            status,
            fontSize: 12,
            color: statusColor,
            fontWeight: FontWeight.w700,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 2),
          AppText(
            DateFormat('MMM dd, yyyy').format(DateTime.now()),
            fontSize: 9,
            color: _muted,
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _metricCard({
    required String title,
    required String value,
    required double deltaPct,
    required bool valueIsNegative,
  }) {
    final isFlat = deltaPct.abs() < 0.0001;
    final positive = deltaPct >= 0;
    final deltaColor = isFlat ? _muted : (positive ? _green : _red);
    return _glassCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          AppText(
            title,
            fontSize: 13,
            color: _title,
            fontWeight: FontWeight.w600,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 12),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.center,
            child: AppText(
              value,
              fontSize: 32,
              color: valueIsNegative ? _red : _text,
              fontWeight: FontWeight.w700,
              textAlign: TextAlign.center,
            ),
          ),
          const SizedBox(height: 12),
          Center(
            child: Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              alignment: WrapAlignment.center,
              spacing: 6,
              runSpacing: 4,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: deltaColor.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: _deltaBadge(deltaPct, deltaColor),
                ),
                const AppText(
                  'vs previous period',
                  fontSize: 10,
                  color: _muted,
                  disableFormat: true,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _overviewBand({
    required String dateRange,
    required DateTime balanceSheetAsOf,
    required double income, required double pIncome,
    required double expenses, required double pExpenses,
    required double netIncome, required double pNetIncome,
    required double assets, required double pAssets,
    required double liabilities, required double pLiabilities,
    required double equity, required double pEquity,
    required double debtToEquity, required double pDebtToEquity,
    required double cashIn, required double pCashIn,
    required double cashOut, required double pCashOut,
    required double netCashChange,
    required double taxDeduction,
    required List<String> aiInsights,
  }) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 1150;
        final cards = [
          _businessOverviewCard(
            dateRange: dateRange,
            income: income, pIncome: pIncome,
            expenses: expenses, pExpenses: pExpenses,
            netIncome: netIncome, pNetIncome: pNetIncome,
          ),
          _balanceOverviewCard(
            balanceSheetAsOf: balanceSheetAsOf,
            assets: assets, pAssets: pAssets,
            liabilities: liabilities, pLiabilities: pLiabilities,
            equity: equity, pEquity: pEquity,
            debtToEquity: debtToEquity, pDebtToEquity: pDebtToEquity,
          ),
          _cashFlowOverviewCard(
            dateRange: dateRange,
            cashIn: cashIn, pCashIn: pCashIn,
            cashOut: cashOut, pCashOut: pCashOut,
            netCashChange: netCashChange,
          ),
          _aiDeductionCard(
            taxDeduction: taxDeduction,
            income: income,
            expenses: expenses,
            aiInsights: aiInsights,
          ),
        ];
        if (!compact) {
          return IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(child: cards[0]),
                const SizedBox(width: 12),
                Expanded(child: cards[1]),
                const SizedBox(width: 12),
                Expanded(child: cards[2]),
                const SizedBox(width: 12),
                Expanded(child: cards[3]),
              ],
            ),
          );
        }
        return Column(
          children: [
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(child: cards[0]),
                  const SizedBox(width: 12),
                  Expanded(child: cards[1]),
                ],
              ),
            ),
            const SizedBox(height: 12),
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(child: cards[2]),
                  const SizedBox(width: 12),
                  Expanded(child: cards[3]),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _businessOverviewCard({
    required String dateRange,
    required double income, required double pIncome,
    required double expenses, required double pExpenses,
    required double netIncome, required double pNetIncome,
  }) {
    final marginCur = income <= 0 ? 0.0 : (netIncome / income) * 100;
    final marginPrev = pIncome <= 0 ? 0.0 : (pNetIncome / pIncome) * 100;
    return _glassCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          const AppText('Profit & Loss Overview', fontSize: 13, color: _title, fontWeight: FontWeight.w600),
          AppText(dateRange, fontSize: 10, color: _muted),
          const SizedBox(height: 8),
          _overviewLine('Income', _money(income), income, pIncome, positiveIsGood: true),
          _overviewLine('Expenses', _money(expenses), expenses, pExpenses, positiveIsGood: false),
          _overviewLine('Net Income', _money(netIncome), netIncome, pNetIncome, positiveIsGood: true),
          _overviewLine('% Margin', '${marginCur.toStringAsFixed(1)}%', marginCur, marginPrev, positiveIsGood: true, isPctPoint: true),
          const SizedBox(height: 4),
          _viewLink('View Profit & Loss', () => _goToTab(2)),
        ],
      ),
    );
  }

  Widget _balanceOverviewCard({
    required DateTime balanceSheetAsOf,
    required double assets, required double pAssets,
    required double liabilities, required double pLiabilities,
    required double equity, required double pEquity,
    required double debtToEquity, required double pDebtToEquity,
  }) {
    return _glassCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          const AppText('Balance Sheet Overview', fontSize: 13, color: _title, fontWeight: FontWeight.w600),
          AppText(
            'As of ${DateFormat('MMM dd, yyyy').format(balanceSheetAsOf)}',
            fontSize: 10,
            color: _muted,
          ),
          const SizedBox(height: 8),
          _overviewLine('Total Assets', _money(assets), assets, pAssets, positiveIsGood: true),
          _overviewLine('Total Liabilities', _money(liabilities), liabilities, pLiabilities, positiveIsGood: false),
          _overviewLine('Equity', _money(equity), equity, pEquity, positiveIsGood: true),
          _overviewLine(
            'Debt-to-Equity',
            equity.abs() < 0.0001 ? 'N/A' : debtToEquity.toStringAsFixed(2),
            debtToEquity,
            pDebtToEquity,
            positiveIsGood: false,
          ),
          const SizedBox(height: 4),
          _viewLink('View Balance Sheet', () => _goToTab(3)),
        ],
      ),
    );
  }

  Widget _cashFlowOverviewCard({
    required String dateRange,
    required double cashIn, required double pCashIn,
    required double cashOut, required double pCashOut,
    required double netCashChange,
  }) {
    final pNetCash = pCashIn - pCashOut;
    return _glassCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          const AppText('Cash Flow Overview', fontSize: 13, color: _title, fontWeight: FontWeight.w600),
          AppText(dateRange, fontSize: 10, color: _muted),
          const SizedBox(height: 8),
          _overviewLine('Money In', _money(cashIn), cashIn, pCashIn, positiveIsGood: true),
          _overviewLine('Money Out', _money(cashOut), cashOut, pCashOut, positiveIsGood: false),
          _overviewLine('Net Cash', _money(netCashChange), netCashChange, pNetCash, positiveIsGood: true),
          _overviewLineText('Cash Flow Trend', netCashChange >= 0 ? 'Positive' : 'Negative', positive: netCashChange >= 0),
          const SizedBox(height: 4),
          _viewLink('View Cash Flow', () => _goToTab(4)),
        ],
      ),
    );
  }

  Widget _aiDeductionCard({
    required double taxDeduction,
    required double income,
    required double expenses,
    List<String> aiInsights = const <String>[],
  }) {
    final orgTag = getCurrentOrganization!.id.toString();
    if (!Get.isRegistered<AiStrategyController>(tag: orgTag)) {
      Get.put(AiStrategyController(), tag: orgTag, permanent: true);
    }
    return GetBuilder<AiStrategyController>(
      tag: orgTag,
      builder: (aiStrategyController) {
        final optimizationPct = aiStrategyController.deductionOptimizationPercentDisplay;
        final unutilized = aiStrategyController.deductionsNotUtilizedPercentDisplay;
        final additionalDeductionsText = aiStrategyController.additionalDeductionsFoundDisplay;
        final potentialSavings = aiStrategyController.totalPotentialSavings;
        return _glassCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const AppText('AI Deduction Optimization', fontSize: 13, color: _title, fontWeight: FontWeight.w600),
          const AppText('Deduction Optimization Level', fontSize: 10, color: _muted),
          const SizedBox(height: 10),
          Expanded(
            child: Row(
              children: [
                SizedBox(
                  height: 76,
                  width: 76,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      SizedBox(
                        height: 76,
                        width: 76,
                        child: CircularProgressIndicator(
                          value: AiStrategyController.deductionOptimizationPercent,
                          strokeWidth: 8,
                          backgroundColor: const Color(0xFF1A355F),
                          valueColor: const AlwaysStoppedAnimation<Color>(_green),
                        ),
                      ),
                      AppText(
                        '${optimizationPct.toStringAsFixed(0)}%',
                        fontSize: 18,
                        color: _text,
                        fontWeight: FontWeight.w700,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const AppText(
                        'Additional Tax\nDeductions Found',
                        fontSize: 9,
                        color: _muted,
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 2),
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.center,
                        child: AppText(
                          additionalDeductionsText,
                          fontSize: 18,
                          color: _green,
                          fontWeight: FontWeight.w700,
                          disableFormat: true,
                        ),
                      ),
                      const SizedBox(height: 6),
                      const AppText(
                        'Potential Tax Savings',
                        fontSize: 9,
                        color: _muted,
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 2),
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.center,
                        child: AppText(
                          '\$${potentialSavings.toStringAsFixed(0)}',
                          fontSize: 18,
                          color: _text,
                          fontWeight: FontWeight.w700,
                          disableFormat: true,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          AppText(
            '${unutilized.toStringAsFixed(0)}% of deductions not yet utilized',
            fontSize: 9,
            color: _muted,
            textAlign: TextAlign.center,
          ),
          if (aiInsights.isNotEmpty) ...[
            const SizedBox(height: 4),
            AppText(
              aiInsights.first,
              fontSize: 9,
              color: _muted,
              textAlign: TextAlign.center,
              maxLines: 2,
            ),
          ],
          const SizedBox(height: 4),
          _viewLink('View AI Activity', () => Get.toNamed(Routes.aiStrategy)),
        ],
      ),
        );
      },
    );
  }

  Widget _overviewLine(
    String label,
    String value,
    double current,
    double previous, {
    required bool positiveIsGood,
    bool isPctPoint = false,
  }) {
    final deltaPct = isPctPoint ? _absDiff(current, previous) : _pctChange(current, previous);
    final isFlat = deltaPct.abs() < 0.0001;
    final up = deltaPct > 0;
    final color = isFlat ? _muted : (up == positiveIsGood ? _green : _red);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            flex: 5,
            child: AppText(label, fontSize: 11, color: _title),
          ),
          Expanded(
            flex: 6,
            child: Align(
              alignment: Alignment.centerRight,
              child: FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerRight,
                child: AppText(
                  value,
                  fontSize: 12,
                  color: _text,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
          const SizedBox(width: 6),
          SizedBox(
            width: 64,
            child: Align(
              alignment: Alignment.centerRight,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: isFlat ? 0.12 : 0.2),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: _deltaBadge(
                  deltaPct,
                  color,
                  isPctPoint: isPctPoint,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _overviewLineText(String label, String value, {required bool positive}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(
            flex: 5,
            child: AppText(label, fontSize: 11, color: _title),
          ),
          Expanded(
            flex: 6,
            child: Align(
              alignment: Alignment.centerRight,
              child: AppText(
                value,
                fontSize: 12,
                color: positive ? _green : _red,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const SizedBox(width: 6),
          const SizedBox(width: 64),
        ],
      ),
    );
  }

  Widget _viewLink(String label, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: Row(
        children: [
          AppText(label, fontSize: 12, color: _text, fontWeight: FontWeight.w500),
          const SizedBox(width: 4),
          const Icon(Icons.arrow_forward_rounded, size: 13, color: _text),
        ],
      ),
    );
  }

  void _goToTab(int idx) {
    if (Get.isRegistered<FinincialTabController>()) {
      Get.find<FinincialTabController>().changeTab(idx);
    }
  }

  Widget _dashboardHeader(FinancialReportController controller) {
    final rangeText = _formatRange(controller.lastStartDate, controller.lastEndDate);
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth <= 1024;
        if (compact) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const AppText(
                'Financial Dashboard',
                fontSize: 28,
                fontWeight: FontWeight.w900,
                color: _text,
              ),
              if (rangeText.isNotEmpty) ...[
                const SizedBox(height: 4),
                AppText(rangeText, fontSize: 12, color: _muted),
              ],
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerRight,
                child: _dashboardTimeFilter(controller),
              ),
            ],
          );
        }
        return Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const AppText(
                  'Financial Dashboard',
                  fontSize: 28,
                  fontWeight: FontWeight.w900,
                  color: _text,
                ),
                if (rangeText.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  AppText(rangeText, fontSize: 12, color: _muted),
                ],
              ],
            ),
            _dashboardTimeFilter(controller),
          ],
        );
      },
    );
  }

  void _syncFilterFromControllerRange(FinancialReportController controller) {
    if (_didSyncFilterWithController) return;
    final start = controller.lastStartDate;
    final end = controller.lastEndDate;
    if (start == null || end == null) return;
    final normalizedStart = DateTime(start.year, start.month, start.day);
    final normalizedEnd = DateTime(end.year, end.month, end.day);
    final days = normalizedEnd.difference(normalizedStart).inDays + 1;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    _didSyncFilterWithController = true;
    if (normalizedStart == DateTime(normalizedEnd.year, 1, 1)) {
      _dashFilterIdx = 4;
      _dashSelectedYear = normalizedEnd.year;
      return;
    }
    if (normalizedEnd == today && days == 7) {
      _dashFilterIdx = 0;
      return;
    }
    if (normalizedEnd == today && days == 30) {
      _dashFilterIdx = 1;
      return;
    }
    if (normalizedEnd == today && days == 90) {
      _dashFilterIdx = 2;
      return;
    }
    if (normalizedEnd == today && days == 365) {
      _dashFilterIdx = 3;
      return;
    }
    _dashFilterIdx = 5;
  }

  Future<void> _dashboardUpdateFilter(
    int index,
    FinancialReportController controller, {
    int? year,
  }) async {
    final DateTime now = DateTime.now();
    final DateTime today = DateTime(now.year, now.month, now.day);
    DateTime? start;
    DateTime end = today;

    if (index == 0) {
      start = today.subtract(const Duration(days: 6));
    } else if (index == 1) {
      start = today.subtract(const Duration(days: 29));
    } else if (index == 2) {
      start = today.subtract(const Duration(days: 89));
    } else if (index == 3) {
      start = today.subtract(const Duration(days: 364));
    } else if (index == 4) {
      final yr = year ?? _dashSelectedYear ?? now.year;
      start = DateTime(yr, 1, 1);
      end = yr == now.year ? today : DateTime(yr, 12, 31);
    }

    setState(() {
      _dashFilterIdx = index;
      if (year != null) _dashSelectedYear = year;
    });

    if (start != null) {
      await controller.fetchAndAggregateData(startDate: start, endDate: end);
      if (mounted) setState(() {});
    }
  }

  Future<void> _dashboardSelectCustom(FinancialReportController controller) async {
    DateTime? tempStart;
    DateTime? tempEnd;

    await showDialog<void>(
      context: context,
      builder: (context) {
        return Dialog(
          backgroundColor: const Color(0xFF0F1E37),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          child: Container(
            padding: const EdgeInsets.all(24),
            width: 400,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const AppText(
                  'Select Date Range',
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: _text,
                ),
                const SizedBox(height: 24),
                SfDateRangePicker(
                  view: DateRangePickerView.month,
                  selectionMode: DateRangePickerSelectionMode.range,
                  headerStyle: const DateRangePickerHeaderStyle(
                    textStyle: TextStyle(color: _text, fontWeight: FontWeight.bold),
                  ),
                  monthCellStyle: DateRangePickerMonthCellStyle(
                    textStyle: const TextStyle(color: _muted),
                    todayTextStyle: TextStyle(color: orangeColor),
                  ),
                  rangeSelectionColor: orangeColor.withValues(alpha: 0.1),
                  startRangeSelectionColor: orangeColor,
                  endRangeSelectionColor: orangeColor,
                  todayHighlightColor: orangeColor,
                  onSelectionChanged: (DateRangePickerSelectionChangedArgs args) {
                    if (args.value is PickerDateRange) {
                      final range = args.value as PickerDateRange;
                      tempStart = range.startDate;
                      tempEnd = range.endDate ?? range.startDate;
                    }
                  },
                ),
                const SizedBox(height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const AppText('Close', color: _muted),
                    ),
                    const SizedBox(width: 12),
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: orangeColor,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      onPressed: () async {
                        if (tempStart != null && tempEnd != null) {
                          final ts = tempStart!;
                          final te = tempEnd!;
                          final s = DateTime(ts.year, ts.month, ts.day);
                          final e = DateTime(te.year, te.month, te.day);
                          setState(() {
                            _dashFilterIdx = 5;
                          });
                          await controller.fetchAndAggregateData(startDate: s, endDate: e);
                          if (context.mounted) Navigator.pop(context);
                          if (mounted) setState(() {});
                        }
                      },
                      child: const AppText('Select', color: Colors.black, fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  /// Same interaction model as Profit & Loss `_buildTimeFilter` / `_filterItem` (pill bar + soft selection).
  Widget _dashboardPnlStyleFilterItem(String text, bool isSelected, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFF1E293B) : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: isSelected ? Border.all(color: Colors.white12) : null,
        ),
        child: AppText(
          text,
          fontSize: 11,
          fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
          color: isSelected ? Colors.white : const Color(0xFF8FA6C4),
          disableFormat: true,
        ),
      ),
    );
  }

  Widget _dashboardYearMenu(FinancialReportController controller) {
    final int currentYear = DateTime.now().year;
    final List<int> years = List.generate(5, (index) => currentYear - index);
    final bool isSelected = _dashFilterIdx == 4;

    return PopupMenuButton<int>(
      offset: const Offset(0, 40),
      color: const Color(0xFF1E293B),
      onSelected: (y) => _dashboardUpdateFilter(4, controller, year: y),
      itemBuilder: (context) => years
          .map(
            (y) => PopupMenuItem<int>(
              value: y,
              child: Text(
                '$y',
                style: const TextStyle(color: Colors.white, fontSize: 13, fontFamily: 'Outfit'),
              ),
            ),
          )
          .toList(),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFF1E293B) : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: isSelected ? Border.all(color: Colors.white12) : null,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              isSelected
                  ? (_dashSelectedYear?.toString() ?? 'Yearly')
                  : 'Yearly',
              style: TextStyle(
                fontSize: 11,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                color: isSelected ? Colors.white : const Color(0xFF8FA6C4),
                fontFamily: 'Outfit',
              ),
            ),
            Icon(
              Icons.keyboard_arrow_down_rounded,
              size: 14,
              color: isSelected ? Colors.white : const Color(0xFF8FA6C4),
            ),
          ],
        ),
      ),
    );
  }

  Widget _dashboardTimeFilter(FinancialReportController controller) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.26),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Wrap(
        spacing: 4,
        runSpacing: 4,
        alignment: WrapAlignment.end,
        children: [
          _dashboardPnlStyleFilterItem('7 Days', _dashFilterIdx == 0, () => _dashboardUpdateFilter(0, controller)),
          _dashboardPnlStyleFilterItem('30 Days', _dashFilterIdx == 1, () => _dashboardUpdateFilter(1, controller)),
          _dashboardPnlStyleFilterItem('3 Months', _dashFilterIdx == 2, () => _dashboardUpdateFilter(2, controller)),
          _dashboardPnlStyleFilterItem('12 Months', _dashFilterIdx == 3, () => _dashboardUpdateFilter(3, controller)),
          _dashboardYearMenu(controller),
          _dashboardPnlStyleFilterItem('Custom', _dashFilterIdx == 5, () => _dashboardSelectCustom(controller)),
        ],
      ),
    );
  }

  static double _pctChange(double current, double previous) {
    if (previous.abs() < 0.0001) return 0;
    final pct = ((current - previous) / previous.abs()) * 100;
    if (pct.isNaN || pct.isInfinite) return 0;
    return pct;
  }

  static double _absDiff(double a, double b) => a - b;

  static String _formatDelta(double pct) {
    if (pct.abs() < 0.0001) return '0.0%';
    final abs = pct.abs();
    final shown = abs >= 1000 ? '999+' : abs.toStringAsFixed(1);
    return '$shown%';
  }

  static String _formatPctPoint(double pp) {
    final abs = pp.abs().toStringAsFixed(1);
    return '${abs}pp';
  }

  static String _formatRange(DateTime? start, DateTime? end) {
    if (start == null || end == null) return '';
    final df = DateFormat('MMM d');
    final yr = end.year;
    return '${df.format(start)} - ${df.format(end)}, $yr';
  }

  Widget _chartCard({
    required List<double> revenue,
    required List<double> expense,
    required List<double> netCash,
    required List<double> profit,
    required List<String> xLabels,
  }) {
    final yBounds = _dashTrendChartYBounds(revenue, expense, netCash, profit);
    final minY = yBounds.minY;
    final maxY = yBounds.maxY;
    final yInterval = yBounds.interval;
    final n = revenue.length;
    final compactX = n > 8;

    return _glassCard(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const AppText('Financial Trend', fontSize: 13, color: _title, fontWeight: FontWeight.w600),
          const SizedBox(height: 8),
          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) {
                const leftAxis = 42.0;
                final usableW = (constraints.maxWidth - leftAxis).clamp(1.0, double.infinity);
                final groupW = _dashTrendGroupWidth(n);
                final centers = _barGroupCenterXsSpaceAround(usableW, n, groupW);
                final spotXN = centers.map((c) => c / usableW).toList();
                final bottomReserved = compactX ? 34.0 : 22.0;

                return Stack(
                  fit: StackFit.expand,
                  children: [
                    BarChart(
                      BarChartData(
                        alignment: BarChartAlignment.spaceAround,
                        baselineY: 0,
                        minY: minY,
                        maxY: maxY,
                        barTouchData: const BarTouchData(enabled: false),
                        gridData: FlGridData(
                          show: true,
                          horizontalInterval: yInterval,
                          drawVerticalLine: false,
                          getDrawingHorizontalLine: (_) =>
                              const FlLine(color: Color(0xFF173761), strokeWidth: 1),
                        ),
                        borderData: FlBorderData(show: false),
                        titlesData: FlTitlesData(
                          topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                          rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                          leftTitles: AxisTitles(
                            sideTitles: SideTitles(
                              showTitles: true,
                              interval: yInterval,
                              reservedSize: leftAxis,
                              getTitlesWidget: (value, _) {
                                if (minY >= 0 && value < -0.01) {
                                  return const SizedBox.shrink();
                                }
                                if (value < minY - 0.01 || value > maxY + 0.01) {
                                  return const SizedBox.shrink();
                                }
                                return AppText(
                                  _formatAxisMoney(value),
                                  fontSize: 10,
                                  color: _muted,
                                );
                              },
                            ),
                          ),
                          bottomTitles: AxisTitles(
                            sideTitles: SideTitles(
                              showTitles: true,
                              interval: 1,
                              reservedSize: bottomReserved,
                              getTitlesWidget: (value, _) {
                                final i = value.toInt();
                                if (i < 0 || i >= xLabels.length) return const SizedBox.shrink();
                                return Padding(
                                  padding: EdgeInsets.only(top: compactX ? 4 : 0),
                                  child: AppText(
                                    xLabels[i],
                                    fontSize: compactX ? 7 : 9,
                                    color: _muted,
                                    maxLines: 1,
                                  ),
                                );
                              },
                            ),
                          ),
                        ),
                        barGroups: List.generate(n, (i) {
                          final rodW = (320 / n).clamp(4.0, 18.0);
                          final inc = i < revenue.length ? revenue[i] : 0.0;
                          final exp = i < expense.length ? expense[i] : 0.0;
                          return BarChartGroupData(
                            x: i,
                            barsSpace: 6,
                            barRods: [
                              BarChartRodData(
                                toY: inc,
                                width: rodW,
                                color: const Color(0xFF19C37D),
                                borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
                                gradient: const LinearGradient(
                                  begin: Alignment.bottomCenter,
                                  end: Alignment.topCenter,
                                  colors: [
                                    Color(0x6619C37D),
                                    Color(0xFF19C37D),
                                  ],
                                ),
                              ),
                              BarChartRodData(
                                toY: exp,
                                width: rodW,
                                color: const Color(0xFF2B7FFF),
                                borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
                                gradient: const LinearGradient(
                                  begin: Alignment.bottomCenter,
                                  end: Alignment.topCenter,
                                  colors: [
                                    Color(0x662B7FFF),
                                    Color(0xFF2B7FFF),
                                  ],
                                ),
                              ),
                            ],
                          );
                        }),
                      ),
                    ),
                    LineChart(
                      LineChartData(
                        minX: 0,
                        maxX: 1,
                        baselineY: 0,
                        minY: minY,
                        maxY: maxY,
                        gridData: const FlGridData(show: false),
                        borderData: FlBorderData(show: false),
                        lineTouchData: LineTouchData(
                          enabled: true,
                          handleBuiltInTouches: true,
                          getTouchedSpotIndicator: (barData, spotIndexes) {
                            return spotIndexes
                                .map(
                                  (_) => const TouchedSpotIndicatorData(
                                    FlLine(color: Colors.transparent, strokeWidth: 0),
                                    FlDotData(show: false),
                                  ),
                                )
                                .toList();
                          },
                          touchTooltipData: LineTouchTooltipData(
                            maxContentWidth: 240,
                            fitInsideHorizontally: true,
                            fitInsideVertically: true,
                            getTooltipColor: (_) => const Color(0xFF1E293B),
                            getTooltipItems: (touchedSpots) {
                              return touchedSpots.map((s) {
                                // Two line series are touchable (net cash + profit). Render
                                // a single combined tooltip from the first series only.
                                if (s.barIndex != 0) return null;
                                final idx = s.spotIndex;
                                if (idx < 0 || idx >= n) return null;
                                final rev = idx < revenue.length ? revenue[idx] : 0.0;
                                final exp = idx < expense.length ? expense[idx] : 0.0;
                                final cash = idx < netCash.length ? netCash[idx] : 0.0;
                                final prof = idx < profit.length ? profit[idx] : 0.0;
                                final dateText = idx < xLabels.length ? xLabels[idx] : '';
                                String money(double v) => _money(v);
                                return LineTooltipItem(
                                  '',
                                  const TextStyle(height: 1.3),
                                  children: [
                                    TextSpan(
                                      text: '$dateText\n',
                                      style: const TextStyle(
                                        color: Color(0xFFB8C7E0),
                                        fontWeight: FontWeight.w600,
                                        fontSize: 11,
                                      ),
                                    ),
                                    TextSpan(
                                      text: 'Revenue: ',
                                      style: const TextStyle(
                                        color: Color(0xFF19C37D),
                                        fontWeight: FontWeight.w600,
                                        fontSize: 12,
                                      ),
                                    ),
                                    TextSpan(
                                      text: '${money(rev)}\n',
                                      style: const TextStyle(
                                        color: Color(0xFF19C37D),
                                        fontWeight: FontWeight.w400,
                                        fontSize: 12,
                                      ),
                                    ),
                                    TextSpan(
                                      text: 'Expenses: ',
                                      style: const TextStyle(
                                        color: Color(0xFF2B7FFF),
                                        fontWeight: FontWeight.w600,
                                        fontSize: 12,
                                      ),
                                    ),
                                    TextSpan(
                                      text: '${money(exp)}\n',
                                      style: const TextStyle(
                                        color: Color(0xFF2B7FFF),
                                        fontWeight: FontWeight.w400,
                                        fontSize: 12,
                                      ),
                                    ),
                                    TextSpan(
                                      text: 'Net Cash: ',
                                      style: const TextStyle(
                                        color: Color(0xFFFFC52C),
                                        fontWeight: FontWeight.w600,
                                        fontSize: 12,
                                      ),
                                    ),
                                    TextSpan(
                                      text: '${money(cash)}\n',
                                      style: const TextStyle(
                                        color: Color(0xFFFFC52C),
                                        fontWeight: FontWeight.w400,
                                        fontSize: 12,
                                      ),
                                    ),
                                    TextSpan(
                                      text: 'Profit: ',
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w600,
                                        fontSize: 12,
                                      ),
                                    ),
                                    TextSpan(
                                      text: money(prof),
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w400,
                                        fontSize: 12,
                                      ),
                                    ),
                                  ],
                                );
                              }).toList();
                            },
                          ),
                        ),
                        titlesData: FlTitlesData(
                          leftTitles: AxisTitles(
                            sideTitles: SideTitles(
                              showTitles: true,
                              reservedSize: leftAxis,
                              getTitlesWidget: (_, __) => const SizedBox.shrink(),
                            ),
                          ),
                          bottomTitles: AxisTitles(
                            sideTitles: SideTitles(
                              showTitles: true,
                              reservedSize: bottomReserved,
                              getTitlesWidget: (_, __) => const SizedBox.shrink(),
                            ),
                          ),
                          topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                          rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                        ),
                        lineBarsData: [
                          _lineNormalized(netCash, spotXN, _yellow),
                          _lineNormalized(profit, spotXN, const Color(0xFFEFF4FF)),
                        ],
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
          const SizedBox(height: 4),
          SizedBox(
            width: double.infinity,
            child: Wrap(
              alignment: WrapAlignment.center,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 14,
              runSpacing: 6,
              children: const [
                _LegendDot('Revenue', Color(0xFF19C37D)),
                _LegendDot('Expenses', Color(0xFF2B7FFF)),
                _LegendLine('Net Cash', Color(0xFFFFC52C)),
                _LegendLine('Profit', Color(0xFFEFF4FF)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _insightsCard({
    required double netIncome,
    required double pNetIncome,
    required double income,
    required double expenses,
    required double equity,
    required double pEquity,
    required double netCashChange,
    required double taxDeduction,
  }) {
    final niPct = _pctChange(netIncome, pNetIncome);
    final eqPct = _pctChange(equity, pEquity);
    final overspend = expenses - income;
    final insights = <String>[
      'Net income is ${_money(netIncome)}',
      if (overspend > 0)
        'Expenses exceeded income by ${_money(overspend)}'
      else
        'Income exceeded expenses by ${_money(-overspend)}',
      'Equity ${eqPct >= 0 ? 'increased' : 'decreased'} ${eqPct.abs().toStringAsFixed(1)}%',
      '${netCashChange >= 0 ? 'Positive' : 'Negative'} cash flow of ${_money(netCashChange)}',
      if (taxDeduction > 0)
        'You have ${NumberFormat.currency(symbol: '\$', decimalDigits: 0).format(taxDeduction)} in potential deductions',
      'Net income ${niPct >= 0 ? 'improved' : 'declined'} ${niPct.abs().toStringAsFixed(1)}% vs previous period',
    ].take(5).toList();
    return _glassCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const AppText('Key Financial Insights', fontSize: 13, color: _title, fontWeight: FontWeight.w600),
          const SizedBox(height: 6),
          Expanded(
            child: ListView.builder(
              padding: EdgeInsets.zero,
              itemCount: insights.length,
              itemBuilder: (_, i) {
                return Container(
                  padding: const EdgeInsets.symmetric(vertical: 7),
                  decoration: BoxDecoration(
                    border: Border(
                      bottom: BorderSide(
                        color: i == insights.length - 1 ? Colors.transparent : const Color(0xFF133560),
                        width: 1,
                      ),
                    ),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: AppText(
                          insights[i],
                          fontSize: 11,
                          color: _title,
                          fontWeight: FontWeight.w400,
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _footerBanner({
    required double score,
    required double prevScore,
    required double netIncome,
    required double income,
    required double expenses,
    required double cashFlow,
    required double currentRatio,
    required double debtToEquity,
  }) {
    final message = _healthSummary(
      score: score,
      prevScore: prevScore,
      netIncome: netIncome,
      income: income,
      expenses: expenses,
      cashFlow: cashFlow,
      currentRatio: currentRatio,
      debtToEquity: debtToEquity,
    );
    return _glassCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const AppText(
                  'Business Health Summary',
                  fontSize: 12,
                  color: _title,
                  fontWeight: FontWeight.w600,
                  textAlign: TextAlign.center,
                ),
                AppText(
                  message.$1,
                  fontSize: 12,
                  color: _text,
                  fontWeight: FontWeight.w600,
                  textAlign: TextAlign.center,
                ),
                AppText(
                  message.$2,
                  fontSize: 10,
                  color: _muted,
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          const DecoratedBox(
            decoration: BoxDecoration(
              color: Color(0xFF092B55),
              borderRadius: BorderRadius.all(Radius.circular(8)),
              border: Border.fromBorderSide(BorderSide(color: Color(0xFF3C5A87))),
            ),
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(
                children: [
                  Icon(Icons.auto_awesome, color: Color(0xFFFFC72B), size: 14),
                  SizedBox(width: 6),
                  AppText('Ask BookSmart AI', fontSize: 11, color: Color(0xFFFFD978), fontWeight: FontWeight.w600),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _actionRow() {
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 1100;
        final tiles = [
          _actionTile(title: 'Transactions', onTap: () => _goToTab(1)),
          _actionTile(
            title: 'Dun & Bradstreet',
            onTap: () async {
              await launchUrl(Uri.parse('https://www.dnb.com'), mode: LaunchMode.externalApplication);
            },
          ),
          _actionTile(title: 'Reports', onTap: () => Get.toNamed(Routes.tax)),
          _actionTile(
            title: 'Accounts',
            onTap: () {
              Get.to(() => const BanksListScreen());
            },
          ),
        ];
        if (!compact) {
          return SizedBox(
            height: 80,
            child: Row(
              children: [
                Expanded(child: tiles[0]),
                const SizedBox(width: 12),
                Expanded(child: tiles[1]),
                const SizedBox(width: 12),
                Expanded(child: tiles[2]),
                const SizedBox(width: 12),
                Expanded(child: tiles[3]),
              ],
            ),
          );
        }
        return Column(
          children: [
            SizedBox(
              height: 80,
              child: Row(
                children: [
                  Expanded(child: tiles[0]),
                  const SizedBox(width: 12),
                  Expanded(child: tiles[1]),
                ],
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 80,
              child: Row(
                children: [
                  Expanded(child: tiles[2]),
                  const SizedBox(width: 12),
                  Expanded(child: tiles[3]),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _actionTile({required String title, required VoidCallback onTap}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: _glassCard(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Center(
          child: AppText(title, fontSize: 14, color: _text, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }

  Widget _glassCard({required Widget child, EdgeInsets? padding, double? height}) {
    return Container(
      height: height,
      padding: padding ?? const EdgeInsets.all(12),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [_cardStart, _cardEnd],
        ),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _cardStroke),
        boxShadow: const [
          BoxShadow(color: Color(0x66010A20), blurRadius: 10, spreadRadius: 0, offset: Offset(0, 4)),
        ],
      ),
      child: child,
    );
  }

  Widget _getRadialGauge(double pointerValue) {
    return SfRadialGauge(
      axes: [
        RadialAxis(
          minimum: 0,
          maximum: 100,
          startAngle: 180,
          endAngle: 0,
          showTicks: true,
          showLabels: true,
          interval: 20,
          minorTicksPerInterval: 0,
          radiusFactor: 0.98,
          centerY: 0.84,
          canScaleToFit: true,
          showFirstLabel: true,
          showLastLabel: true,
          axisLabelStyle: const GaugeTextStyle(color: _text, fontSize: 10),
          majorTickStyle: const MajorTickStyle(length: 7, thickness: 1.2, color: Color(0xFFB9C8DE)),
          minorTickStyle: const MinorTickStyle(length: 0, thickness: 0),
          axisLineStyle: const AxisLineStyle(
            thickness: 14,
            cornerStyle: CornerStyle.bothCurve,
            gradient: SweepGradient(
              colors: [Color(0xFFF34F4F), Color(0xFFFF9A36), Color(0xFFF6C546), Color(0xFF59E182), Color(0xFF40D86E)],
              stops: [0.0, 0.24, 0.5, 0.76, 1.0],
            ),
          ),
          pointers: [
            NeedlePointer(
              value: pointerValue.clamp(0, 100),
              needleColor: const Color(0xFFEAF2FF),
              knobStyle: const KnobStyle(knobRadius: 0.05, color: Color(0xFFEAF2FF)),
              tailStyle: const TailStyle(length: 0.08, width: 3, color: Color(0xFFEAF2FF)),
              needleLength: 0.6,
              needleStartWidth: 0,
              needleEndWidth: 3,
            ),
          ],
        ),
      ],
    );
  }
  /// Uses [FinancialReportController.trendChartSeries] — same buckets and x-axis
  /// labels as Profit & Loss (daily / weekly / monthly / quarterly from selected range).
  _DashChartSeries _dashChartSeries(FinancialReportController controller) {
    final series = controller.trendChartSeries;
    if (series.isEmpty) {
      return _DashChartSeries(
        income: const <double>[0],
        expense: const <double>[0],
        cashflow: const <double>[0],
        profit: const <double>[0],
        xLabels: const ['—'],
      );
    }

    final income = <double>[];
    final expense = <double>[];
    final profit = <double>[];
    final xLabels = <String>[];

    for (final row in series) {
      xLabels.add(row['label']?.toString() ?? '');
      income.add((row['income'] as num?)?.toDouble() ?? 0);
      expense.add((row['expense'] as num?)?.toDouble() ?? 0);
      profit.add((row['net'] as num?)?.toDouble() ?? 0);
    }

    // Net cash as cumulative sum of per-bucket net (distinct from period profit line).
    double runningNet = 0;
    final cashflow = <double>[];
    for (final row in series) {
      final net = (row['net'] as num?)?.toDouble() ?? 0;
      runningNet += net;
      cashflow.add(runningNet);
    }

    return _DashChartSeries(
      income: income,
      expense: expense,
      cashflow: cashflow,
      profit: profit,
      xLabels: xLabels,
    );
  }

  /// Bar group width for Revenue + Expense rods (same layout rule as P&L trend).
  static double _dashTrendGroupWidth(int n) {
    final rodW = (320 / n).clamp(4.0, 18.0);
    return rodW * 2 + 6;
  }

  /// X center of each bar group for [BarChartAlignment.spaceAround] (matches fl_chart).
  static List<double> _barGroupCenterXsSpaceAround(
    double viewWidth,
    int n,
    double groupWidth,
  ) {
    if (n <= 0) return [];
    final sumWidth = groupWidth * n;
    final spaceAvailable = viewWidth - sumWidth;
    final eachSpace = spaceAvailable / (n * 2);
    var tempX = 0.0;
    final out = <double>[];
    for (var i = 0; i < n; i++) {
      tempX += eachSpace;
      tempX += groupWidth / 2;
      out.add(tempX);
      tempX += groupWidth / 2;
      tempX += eachSpace;
    }
    return out;
  }

  /// Line overlay with x in 0..1 aligned to bar centers (P&L trend pattern).
  LineChartBarData _lineNormalized(List<double> data, List<double> spotXN, Color color) {
    final n = data.length;
    return LineChartBarData(
      spots: List.generate(
        n,
        (i) => FlSpot(i < spotXN.length ? spotXN[i] : 0.5, i < data.length ? data[i] : 0),
      ),
      isCurved: true,
      curveSmoothness: 0.35,
      preventCurveOverShooting: true,
      color: color,
      barWidth: 2,
      isStrokeCapRound: true,
      dotData: FlDotData(
        show: true,
        getDotPainter: (spot, p0, p1, p2) => FlDotCirclePainter(
          radius: n > 60 ? 2.0 : 3.0,
          color: color,
          strokeWidth: 1.5,
          strokeColor: const Color(0xFF0F1E37),
        ),
      ),
      belowBarData: BarAreaData(
        show: true,
        applyCutOffY: true,
        cutOffY: 0,
        color: const Color(0xFF19C37D).withValues(alpha: 0.2),
      ),
      aboveBarData: BarAreaData(
        show: true,
        applyCutOffY: true,
        cutOffY: 0,
        color: const Color(0xFFE57373).withValues(alpha: 0.2),
      ),
    );
  }

  double _deductionPct(double taxDeduction, double income, double expenses) {
    final base = expenses > 0 ? expenses : income;
    if (base <= 0) return 0;
    return ((taxDeduction / base) * 100).clamp(0, 100);
  }

  double _healthScore({
    required double netIncome,
    required double revenue,
    required double currentRatio,
    required double debtToEquity,
    required double netCash,
    required double deductionPct,
  }) {
    final profitScore = _normalize(
      revenue == 0 ? 0 : netIncome / revenue,
      min: -0.5,
      max: 0.5,
    );
    final liquidityScore = _normalize(currentRatio, min: 0.5, max: 2.5);
    final leverageScore = 100 - _normalize(debtToEquity, min: 0.0, max: 2.0);
    final cashScore = _normalize(netCash, min: -10000, max: 10000);
    final taxScore = deductionPct;
    final score = (profitScore * 0.25) +
        (liquidityScore * 0.20) +
        (leverageScore * 0.15) +
        (cashScore * 0.20) +
        (taxScore * 0.20);
    return score.clamp(0, 100).toDouble();
  }

  double _normalize(double value, {required double min, required double max}) {
    if (max <= min) return 0;
    return (((value - min) / (max - min)) * 100).clamp(0, 100).toDouble();
  }

  (String, String) _healthSummary({
    required double score,
    required double prevScore,
    required double netIncome,
    required double income,
    required double expenses,
    required double cashFlow,
    required double currentRatio,
    required double debtToEquity,
  }) {
    String primary;
    if (score < 41) {
      primary = 'Your business is under financial pressure.';
    } else if (score < 61) {
      primary = 'Your business is stable but has areas to improve.';
    } else if (score < 81) {
      primary = 'Your business is performing well with room to optimize.';
    } else {
      primary = 'Your business is in strong financial condition.';
    }

    final drivers = <String>[];
    if (netIncome < 0 || expenses > income) drivers.add('expenses are exceeding income');
    if (cashFlow < 0) drivers.add('cash outflows are higher than inflows');
    if (debtToEquity > 1.5) drivers.add('debt levels are high relative to equity');
    if (currentRatio < 1.0) drivers.add('short-term liquidity is constrained');
    if (drivers.isEmpty) {
      if (cashFlow > 0) drivers.add('cash inflows are exceeding outflows');
      if (netIncome > 0) drivers.add('revenue exceeds expenses');
      if (debtToEquity < 0.5) drivers.add('debt levels are well managed');
    }

    final delta = score - prevScore;
    String trendLine;
    if (delta >= 5) {
      trendLine = 'Financial health improved vs previous period.';
    } else if (delta <= -5) {
      trendLine = 'Financial health declined vs previous period.';
    } else {
      trendLine = 'Financial performance remained consistent.';
    }
    final reason = drivers.take(2).join(' and ');
    final support = reason.isEmpty ? trendLine : '$reason. $trendLine';
    return (primary, support);
  }

  Widget _deltaBadge(
    double deltaPct,
    Color color, {
    bool isPctPoint = false,
  }) {
    final isFlat = deltaPct.abs() < 0.0001;
    final positive = deltaPct >= 0;
    final text = isPctPoint ? _formatPctPoint(deltaPct) : _formatDelta(deltaPct);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (!isFlat) ...[
          Icon(
            positive ? Icons.arrow_upward : Icons.arrow_downward,
            size: 12,
            color: color,
          ),
          const SizedBox(width: 2),
        ],
        AppText(
          text,
          fontSize: 9,
          color: color,
          fontWeight: FontWeight.w700,
          textAlign: TextAlign.center,
          disableFormat: true,
        ),
      ],
    );
  }

  String _formatAxisMoney(double value) {
    final abs = value.abs();
    if (abs >= 1000000) {
      final unit = (abs / 1000000).toStringAsFixed(abs >= 10000000 ? 0 : 1);
      return value >= 0 ? '\$${unit}M' : '-\$${unit}M';
    }
    if (abs >= 1000) {
      final unit = (abs / 1000).toStringAsFixed(abs >= 100000 ? 0 : 1);
      return value >= 0 ? '\$${unit}K' : '-\$${unit}K';
    }
    final whole = abs.toStringAsFixed(0);
    return value >= 0 ? '\$$whole' : '-\$$whole';
  }

  ({double minY, double maxY, double interval}) _dashTrendChartYBounds(
    List<double> revenue,
    List<double> expense,
    List<double> netCash,
    List<double> profit,
  ) {
    double minVal = 0;
    double maxVal = 0;

    void consider(double v) {
      if (!v.isFinite) return;
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
    }

    for (final v in revenue) {
      consider(v);
    }
    for (final v in expense) {
      consider(v);
    }
    for (final v in profit) {
      consider(v);
    }
    // Cumulative net cash can dip below zero in buckets while bars stay ≥ 0;
    // only use it for the upper bound so the axis does not extend below $0.
    for (final v in netCash) {
      if (v.isFinite && v > maxVal) maxVal = v;
    }

    // Financial trend bars/lines are anchored at zero; keep axis at 0 unless
    // plotted values are actually negative (e.g. net loss buckets).
    final double minY;
    if (minVal >= -1e-9) {
      minY = 0;
    } else {
      final negInterval = minVal.abs() > 50000 ? 10000.0 : 5000.0;
      minY = (minVal / negInterval).floor() * negInterval;
    }

    final interval = _dashNiceAxisInterval(maxVal <= 0 ? 10000 : maxVal);
    final double maxY;
    if (maxVal <= 0) {
      maxY = interval * 4;
    } else {
      var computedMax = ((maxVal / interval).ceil() * interval).toDouble();
      if (computedMax <= maxVal) computedMax += interval;
      maxY = computedMax;
    }

    return (minY: minY, maxY: maxY, interval: interval);
  }

  double _dashNiceAxisInterval(double maxY) {
    if (maxY <= 0) return 1;
    final raw = maxY / 4;
    final exponent = (log(raw) / ln10).floor();
    final magnitude = pow(10, exponent).toDouble();
    final normalized = raw / magnitude;
    final nice = normalized <= 1
        ? 1
        : (normalized <= 2
            ? 2
            : (normalized <= 5 ? 5 : 10));
    return nice * magnitude;
  }
}

class _DashChartSeries {
  _DashChartSeries({
    required this.income,
    required this.expense,
    required this.cashflow,
    required this.profit,
    required this.xLabels,
  });

  final List<double> income;
  final List<double> expense;
  final List<double> cashflow;
  final List<double> profit;
  final List<String> xLabels;
}

class _LegendDot extends StatelessWidget {
  const _LegendDot(this.label, this.color);

  final String label;
  final Color color;
  static const Color _legendText = Color(0xFF6E86AD);

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(10)),
        ),
        const SizedBox(width: 4),
        AppText(label, fontSize: 10, color: _legendText),
      ],
    );
  }
}

/// Line-style legend swatch (matches Profit & Loss trend “profit” line key).
class _LegendLine extends StatelessWidget {
  const _LegendLine(this.label, this.color);

  final String label;
  final Color color;
  static const Color _legendText = Color(0xFF6E86AD);

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 16,
          height: 2,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(5),
          ),
        ),
        const SizedBox(width: 8),
        AppText(label, fontSize: 10, color: _legendText),
      ],
    );
  }
}
