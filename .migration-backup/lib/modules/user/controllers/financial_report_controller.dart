import 'dart:developer';
import 'package:booksmart/modules/user/controllers/organization_controller.dart';
import 'package:booksmart/models/transaction_model.dart';
import 'package:booksmart/supabase/tables.dart';
import 'package:booksmart/utils/supabase.dart';
import 'package:booksmart/utils/balance_sheet_from_transactions.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart' as intl;

enum _TrendGranularity { daily, weekly, monthly, quarterly }

class FinancialReportController extends GetxController {
  RxBool isLoading = false.obs;
  RxBool isRealizedView = true.obs;
  RxBool isDemoMode = false.obs;

  /// After the first successful aggregate, tabs keep showing prior data during
  /// refetch instead of replacing the whole screen with a blocking spinner.
  bool hasPresentedFinancialData = false;

  void toggleRealizedView(bool val) {
    isRealizedView.value = val;
    update();
  }

  void toggleDemoMode() {
    isDemoMode.value = !isDemoMode.value;
    if (isDemoMode.value) {
      _loadMockBalanceSheetData();
    } else {
      fetchAndAggregateData(
        startDate: lastStartDate,
        endDate: lastEndDate,
        balanceSheetAsOfSnapshot: lastFetchBalanceSheetSnapshot,
      );
    }
    update();
  }

  // Mocks for Unrealized (Upcoming) Cash Flows
  RxDouble upcomingReceivables = 0.0.obs;
  RxDouble upcomingPayables = 0.0.obs;

  // Used by the Plaid sync and transaction CRUD flows to refresh the report
  // using the same date range the user last selected.
  DateTime? lastStartDate;
  DateTime? lastEndDate;

  /// When true, [lastStartDate] and [lastEndDate] are both the Balance Sheet "As Of" day and
  /// the last fetch loaded cumulative balances through that day (see [fetchAndAggregateData]).
  bool lastFetchBalanceSheetSnapshot = false;

  /// Full transaction history through the Balance Sheet As Of (used for exports + engine verify).
  List<TransactionModel> balanceSheetSnapshotSourceTransactions = [];

  /// 0 = same day previous month, 1 = 7 days before As Of, 2 = 30 days, 3 = 6 calendar months.
  int balanceSheetComparisonMode = 0;
  int? _availableYearsOrgId;
  RxList<int> availableYears = <int>[].obs;

  // Aggregate Metrics over all time (or a specific default range)
  RxDouble totalIncome = 0.0.obs;
  RxDouble totalExpenses = 0.0.obs;
  RxDouble netIncome = 0.0.obs;

  // Breakdown for Profit & Loss
  RxMap<String, double> incomeBreakdown = <String, double>{}.obs;
  RxMap<String, double> expenseBreakdown = <String, double>{}.obs;

  // Breakdown for Profit & Loss (deprecated/legacy names, keeping for compat if needed)
  RxDouble cogs = 0.0.obs;
  RxDouble grossProfit = 0.0.obs;
  RxDouble grossMarginPct = 0.0.obs;
  RxDouble ebitda = 0.0.obs;
  RxDouble operatingExpenses = 0.0.obs;
  RxDouble netOperatingIncome = 0.0.obs;

  // Monthly Data for charts
  RxList<Map<String, double>> monthlyData = <Map<String, double>>[].obs;

  // Asset/Liability Breakdown
  RxDouble totalAssets = 0.0.obs;
  RxDouble totalLiabilities = 0.0.obs;

  RxMap<String, double> assetBreakdown = <String, double>{}.obs;
  RxMap<String, double> liabilityBreakdown = <String, double>{}.obs;

  RxMap<String, double> currentAssetsBreakdown = <String, double>{}.obs;
  RxMap<String, double> fixedAssetsBreakdown = <String, double>{}.obs;
  RxMap<String, double> otherAssetsBreakdown = <String, double>{}.obs;
  RxMap<String, double> currentLiabilitiesBreakdown = <String, double>{}.obs;
  RxMap<String, double> longTermLiabilitiesBreakdown = <String, double>{}.obs;
  RxMap<String, double> ownerEquityBreakdown = <String, double>{}.obs;

  // Cash Flow Breakdown
  RxDouble operatingCashFlow = 0.0.obs;
  RxDouble investingCashFlow = 0.0.obs;
  RxDouble financingCashFlow = 0.0.obs;

  // Granular Cash Flow Statement Breakdown
  RxDouble operatingAdjustments = 0.0.obs;
  RxDouble workingCapitalChanges = 0.0.obs;
  RxDouble operatingOther = 0.0.obs;
  RxDouble assetPurchases = 0.0.obs;
  RxDouble investmentActivities = 0.0.obs;
  RxDouble loanActivities = 0.0.obs;
  RxDouble ownerContributions = 0.0.obs;
  RxDouble distributions = 0.0.obs;
  RxDouble financingOther = 0.0.obs;
  RxDouble beginningCashBalance = 0.0.obs;
  RxDouble netChangeInCash = 0.0.obs;
  RxDouble endingCashBalance = 0.0.obs;
  RxDouble cashInflow = 0.0.obs;
  RxDouble cashOutflow = 0.0.obs;

  // Previous Period Comparison for KPIs
  RxDouble prevPeriodIncome = 0.0.obs;
  RxDouble prevPeriodExpenses = 0.0.obs;
  RxDouble prevPeriodGrossProfit = 0.0.obs;
  RxDouble prevPeriodGrossMarginPct = 0.0.obs;
  RxDouble prevPeriodEbitda = 0.0.obs;
  RxDouble prevPeriodNetIncome = 0.0.obs;
  RxDouble prevPeriodCogs = 0.0.obs;
  RxDouble prevPeriodAssets = 0.0.obs;
  RxDouble prevPeriodLiabilities = 0.0.obs;
  RxDouble prevPeriodCurrentAssets = 0.0.obs;
  RxDouble prevPeriodCurrentLiabilities = 0.0.obs;
  RxDouble prevPeriodCashInflow = 0.0.obs;
  RxDouble prevPeriodCashOutflow = 0.0.obs;

  int _latestFetchRequestId = 0;

  // Granular Growth Data for Charts
  RxList<Map<String, dynamic>> chartData = <Map<String, dynamic>>[].obs;

  /// Time-bucketed series for P&L / Cash Flow trend charts (only selected date range).
  List<Map<String, dynamic>> trendChartSeries = [];
  List<Map<String, dynamic>> prevTrendChartSeries = [];
  String trendGranularityLabel = '';

  // Periodic Breakdowns for Multi-column Statements (Key: yyyy-MM or yyyy)
  RxMap<String, Map<String, double>> periodicIncomeBreakdown =
      <String, Map<String, double>>{}.obs;
  RxMap<String, Map<String, double>> periodicExpenseBreakdown =
      <String, Map<String, double>>{}.obs;

  // Balance Sheet periodic data
  RxMap<String, Map<String, double>> periodicCurrentAssetsBreakdown =
      <String, Map<String, double>>{}.obs;
  RxMap<String, Map<String, double>> periodicFixedAssetsBreakdown =
      <String, Map<String, double>>{}.obs;
  RxMap<String, Map<String, double>> periodicOtherAssetsBreakdown =
      <String, Map<String, double>>{}.obs;
  RxMap<String, Map<String, double>> periodicCurrentLiabilitiesBreakdown =
      <String, Map<String, double>>{}.obs;
  RxMap<String, Map<String, double>> periodicLongTermLiabilitiesBreakdown =
      <String, Map<String, double>>{}.obs;
  RxMap<String, Map<String, double>> periodicEquityBreakdown =
      <String, Map<String, double>>{}.obs;

  // Cash Flow periodic data
  RxMap<String, Map<String, double>> periodicOperatingActivities =
      <String, Map<String, double>>{}.obs;
  RxMap<String, Map<String, double>> periodicInvestingActivities =
      <String, Map<String, double>>{}.obs;
  RxMap<String, Map<String, double>> periodicFinancingActivities =
      <String, Map<String, double>>{}.obs;
  RxMap<String, double> periodicNetIncome = <String, double>{}.obs;

  // Tax Metrics
  RxDouble totalTaxDeductions = 0.0.obs;

  // Business Strength (0-100)
  RxDouble businessStrengthScore = 0.0.obs;

  List<String> get aiInsights {
    final numFormat = intl.NumberFormat.currency(
      symbol: '\$',
      decimalDigits: 0,
    );
    final deductions = numFormat.format(totalTaxDeductions.value);

    final estimatedTax = netIncome.value > 0 ? netIncome.value * 0.20 : 0.0;
    final taxDue = numFormat.format(estimatedTax);

    return [
      "You saved $deductions in deductions this period",
      if (netIncome.value > 0)
        "Estimated Tax Due: $taxDue - Want to reduce it?"
      else
        "No net income yet - focus on growing revenue to see tax projections",
    ];
  }

  double get debtToEquity {
    final equityVal = totalAssets.value - totalLiabilities.value;
    if (equityVal.abs() < 0.01) return 0.0;
    return (totalLiabilities.value / equityVal);
  }

  double get currentRatio {
    final curAssets = currentAssetsBreakdown.values.fold(0.0, (a, b) => a + b);
    final curLiabilities = currentLiabilitiesBreakdown.values.fold(
      0.0,
      (a, b) => a + b,
    );
    if (curLiabilities == 0) return curAssets > 0 ? 5.0 : 0.0;
    return curAssets / curLiabilities;
  }

  double get returnOnEquity {
    final equityVal = totalAssets.value - totalLiabilities.value;
    if (equityVal.abs() < 0.01) return 0.0;
    return (netIncome.value / equityVal) * 100;
  }

  double get prevPeriodReturnOnEquity {
    final equityVal = prevPeriodAssets.value - prevPeriodLiabilities.value;
    if (equityVal.abs() < 0.01) return 0.0;
    return (prevPeriodNetIncome.value / equityVal) * 100;
  }

  double get prevPeriodDebtToEquity {
    final equityVal = prevPeriodAssets.value - prevPeriodLiabilities.value;
    if (equityVal.abs() < 0.01) return 0.0;
    return (prevPeriodLiabilities.value / equityVal);
  }

  double get prevPeriodCurrentRatio {
    if (prevPeriodCurrentLiabilities.value == 0) {
      return prevPeriodCurrentAssets.value > 0 ? 5.0 : 0.0;
    }
    return prevPeriodCurrentAssets.value / prevPeriodCurrentLiabilities.value;
  }

  RxDouble assetsChange = 0.0.obs;
  RxDouble liabilitiesChange = 0.0.obs;
  RxDouble equityChange = 0.0.obs;

  @override
  void onInit() {
    super.onInit();
    final DateTime now = DateTime.now();
    final DateTime end = DateTime(now.year, now.month, now.day);
    final DateTime start = end.subtract(const Duration(days: 89));
    fetchAndAggregateData(startDate: start, endDate: end);
  }

  /// Local calendar `yyyy-MM-dd` for queries (avoids UTC shifts from `toIso8601String()`).
  String _sqlDateLocal(DateTime d) {
    final x = DateTime(d.year, d.month, d.day);
    final mm = x.month.toString().padLeft(2, '0');
    final dd = x.day.toString().padLeft(2, '0');
    return '${x.year}-$mm-$dd';
  }

  DateTime _nextDay(DateTime d) => DateTime(d.year, d.month, d.day + 1);

  static const List<String> _expenseKeywords = <String>[
    'starbucks',
    'mcdonald',
    'subway',
    'burger king',
    'uber',
    'lyft',
    'amazon',
    'netflix',
    'spotify',
    'airbnb',
    'airlines',
    'united',
    'delta',
    'shell',
    'chevron',
    'at&t',
    'verizon',
    'utilities',
    'comcast',
    'internet',
    'subscription',
    'insurance',
    'interest payment',
    'tax payment',
  ];

  bool _matchesExpenseKeyword(String title) {
    for (final kw in _expenseKeywords) {
      if (title.contains(kw)) return true;
    }
    return false;
  }

  Future<void> fetchAndAggregateData({
    DateTime? startDate,
    DateTime? endDate,
    bool balanceSheetAsOfSnapshot = false,
  }) async {
    final int requestId = ++_latestFetchRequestId;
    if (isDemoMode.value) return;

    final DateTime now = DateTime.now();
    final DateTime firstDayOfYear = DateTime(now.year, 1, 1);
    final DateTime today = DateTime(now.year, now.month, now.day);

    try {
      isLoading.value = true;
      update();

      late final DateTime effectiveStart;
      late final DateTime effectiveEnd;
      late final DateTime queryLowerBound;
      late final DateTime metricsStartDate;
      late final DateTime metricsEndDate;
      late final DateTime metricsPrevStart;
      late final DateTime metricsPrevEnd;
      late final DateTime reportStart;

      if (balanceSheetAsOfSnapshot) {
        effectiveEnd = _dateOnly(endDate ?? today);
        effectiveStart = effectiveEnd;
        queryLowerBound = DateTime(2000, 1, 1);
        reportStart = effectiveEnd;
        final DateTime prevAsOf = _sameDayPreviousMonth(effectiveEnd);
        metricsEndDate = effectiveEnd;
        metricsStartDate = DateTime(
          effectiveEnd.year - 1,
          effectiveEnd.month,
          1,
        );
        metricsPrevEnd = prevAsOf;
        metricsPrevStart = DateTime(prevAsOf.year - 1, prevAsOf.month, 1);
        lastFetchBalanceSheetSnapshot = true;
      } else {
        lastFetchBalanceSheetSnapshot = false;
        var rangeStart = _dateOnly(startDate ?? firstDayOfYear);
        var rangeEnd = _dateOnly(endDate ?? today);
        if (rangeStart.isAfter(rangeEnd)) {
          final tmp = rangeStart;
          rangeStart = rangeEnd;
          rangeEnd = tmp;
        }
        effectiveStart = rangeStart;
        effectiveEnd = rangeEnd;
        queryLowerBound = effectiveStart;
        reportStart = effectiveStart;
        metricsStartDate = effectiveStart;
        metricsEndDate = effectiveEnd;
        if (!effectiveStart.isAfter(effectiveEnd)) {
          final inclusiveDays =
              effectiveEnd.difference(effectiveStart).inDays + 1;
          final pEnd = effectiveStart.subtract(const Duration(days: 1));
          final pStart = pEnd.subtract(Duration(days: inclusiveDays - 1));
          metricsPrevStart = pStart;
          metricsPrevEnd = pEnd;
        } else {
          metricsPrevStart = DateTime(now.year - 1, 1, 1);
          metricsPrevEnd = DateTime(now.year - 1, 12, 31);
        }
      }

      lastStartDate = effectiveStart;
      lastEndDate = effectiveEnd;

      final orgId = getCurrentOrganization?.id;
      if (orgId == null) {
        log("⚠️ [FRC] Organization ID is null. Aborting fetch.");
        return;
      }
      await _ensureAvailableYears(orgId);

      dynamic query = supabase
          .from(SupabaseTable.transaction)
          .select()
          .eq('org_id', orgId);
      query = query.gte('date_time', _sqlDateLocal(queryLowerBound));
      query = query.lt('date_time', _sqlDateLocal(_nextDay(effectiveEnd)));

      final res = await query;
      if (requestId != _latestFetchRequestId) return;
      final List<TransactionModel> currentTransactions = (res as List)
          .map((e) => TransactionModel.fromJson(e))
          .toList();

      dynamic prevQuery = supabase
          .from(SupabaseTable.transaction)
          .select()
          .eq('org_id', orgId);
      if (balanceSheetAsOfSnapshot) {
        final DateTime prevAsOf = _sameDayPreviousMonth(effectiveEnd);
        prevQuery = prevQuery
            .gte('date_time', _sqlDateLocal(queryLowerBound))
            .lt('date_time', _sqlDateLocal(_nextDay(prevAsOf)));
      } else {
        prevQuery = prevQuery
            .gte('date_time', _sqlDateLocal(metricsPrevStart))
            .lt('date_time', _sqlDateLocal(_nextDay(metricsPrevEnd)));
      }

      final prevRes = await prevQuery;
      if (requestId != _latestFetchRequestId) return;
      final List<TransactionModel> previousTransactions = (prevRes as List)
          .map((e) => TransactionModel.fromJson(e))
          .toList();

      final openingRes = await supabase
          .from(SupabaseTable.transaction)
          .select()
          .eq('org_id', orgId)
          .lt('date_time', _sqlDateLocal(reportStart));
      if (requestId != _latestFetchRequestId) return;
      final List<TransactionModel> openingTransactions = (openingRes as List)
          .map((e) => TransactionModel.fromJson(e))
          .toList();
      final double openingCash = openingTransactions
          .where((tx) {
            final t = tx.title.toLowerCase();
            return t.contains('cash') ||
                t.contains('bank') ||
                t.contains('checking') ||
                t.contains('savings');
          })
          .fold<double>(0.0, (sum, tx) => sum + tx.amount);

      _calculateMetrics(
        currentTransactions,
        previousTransactions,
        startDate: metricsStartDate,
        endDate: metricsEndDate,
        prevStart: metricsPrevStart,
        prevEnd: metricsPrevEnd,
        openingCash: openingCash,
      );
      if (balanceSheetAsOfSnapshot) {
        balanceSheetSnapshotSourceTransactions = List<TransactionModel>.from(
          currentTransactions,
        );
        _applyEngineBalanceSheetSnapshot();
        refreshBalanceSheetComparisonBaselines();
      } else {
        // Range fetch (dashboard / P&L): cumulative balance sheet through [effectiveEnd] must not
        // depend on transactions only inside the visible window (fixes export vs dashboard mismatch).
        dynamic bsHistQuery = supabase
            .from(SupabaseTable.transaction)
            .select()
            .eq('org_id', orgId)
            .gte('date_time', _sqlDateLocal(DateTime(2000, 1, 1)))
            .lt('date_time', _sqlDateLocal(_nextDay(effectiveEnd)));
        final bsHistRes = await bsHistQuery;
        if (requestId != _latestFetchRequestId) return;
        balanceSheetSnapshotSourceTransactions = (bsHistRes as List)
            .map((e) => TransactionModel.fromJson(e))
            .toList();
        _applyEngineBalanceSheetSnapshot(includeNetIncome: false);
      }
      hasPresentedFinancialData = true;
    } catch (e, s) {
      log("❌ [FRC] fetchAndAggregateData error: $e");
      log(s.toString());
    } finally {
      // if (requestId != _latestFetchRequestId) return;
      // isLoading.value = false;
      // update();

      if (requestId != _latestFetchRequestId) {
        // do nothing
      } else {
        isLoading.value = false;
        update();
      }
    }
  }

  Future<void> _ensureAvailableYears(int orgId) async {
    if (_availableYearsOrgId == orgId && availableYears.isNotEmpty) return;
    final years = <int>{};
    const pageSize = 1000;
    var offset = 0;

    while (true) {
      final rows = await supabase
          .from(SupabaseTable.transaction)
          .select('date_time')
          .eq('org_id', orgId)
          .order('date_time', ascending: false)
          .range(offset, offset + pageSize - 1);

      final page = (rows as List);
      if (page.isEmpty) break;

      for (final row in page) {
        final rawDate = (row['date_time'] ?? '').toString();
        final parsed = DateTime.tryParse(rawDate);
        if (parsed != null) years.add(parsed.year);
      }

      if (page.length < pageSize) break;
      offset += pageSize;
    }

    final sorted = years.toList()..sort((a, b) => b.compareTo(a));
    _availableYearsOrgId = orgId;
    availableYears.assignAll(sorted);
  }

  void _calculateMetrics(
    List<TransactionModel> transactions,
    List<TransactionModel> prevTransactions, {
    required DateTime startDate,
    required DateTime endDate,
    required DateTime prevStart,
    required DateTime prevEnd,
    required double openingCash,
  }) {
    double normalizeCashFlowAmount(
      String lowerTitle,
      double rawAmount, {
      required String section,
    }) {
      final abs = rawAmount.abs();
      if (abs < 0.0000001) return 0.0;

      bool hasAny(List<String> keys) => keys.any(lowerTitle.contains);

      if (section == 'operating') {
        // Working capital directional rules.
        if (lowerTitle.contains('receivable')) {
          if (hasAny(const ['decrease', 'decreased', 'decline'])) return abs;
          if (hasAny(const ['increase', 'increased', 'growth'])) return -abs;
        }
        if (lowerTitle.contains('payable')) {
          if (hasAny(const ['increase', 'increased', 'growth'])) return abs;
          if (hasAny(const ['decrease', 'decreased', 'decline'])) return -abs;
        }
        if (lowerTitle.contains('inventory')) {
          if (hasAny(const ['decrease', 'decreased', 'decline'])) return abs;
          if (hasAny(const ['increase', 'increased', 'growth'])) return -abs;
        }

        if (hasAny(const [
          'cash received',
          'received from customer',
          'interest received',
          'refund received',
        ])) {
          return abs;
        }
        if (hasAny(const [
          'cash paid',
          'paid to vendor',
          'payroll',
          'rent',
          'utilities',
          'insurance',
          'vendor payment',
        ])) {
          return -abs;
        }
      } else if (section == 'investing') {
        if (hasAny(const ['sale', 'sold', 'disposal', 'proceeds'])) return abs;
        if (hasAny(const [
          'purchase',
          'purchased',
          'buy',
          'acquire',
          'capex',
        ])) {
          return -abs;
        }
      } else if (section == 'financing') {
        if (hasAny(const [
          'loan proceeds',
          'proceeds from loan',
          'owner investment',
          'capital contribution',
          'stock issuance',
          'share issuance',
          'equity injection',
          '[cf:contribution]',
        ])) {
          return abs;
        }
        if (hasAny(const [
          'loan principal',
          'principal payment',
          'owner draw',
          'dividend',
          'debt repayment',
          'repayment',
          '[cf:distributions]',
        ])) {
          return -abs;
        }
      }

      return rawAmount;
    }

    Map<String, double> getCashTotals(List<TransactionModel> txs) {
      double inflow = 0.0;
      double outflow = 0.0;
      for (final tx in txs) {
        final title = tx.title.toLowerCase();
        final bool isInternalTransfer =
            title.contains('credit card payment') ||
            title.contains('transfer to') ||
            title.contains('autopay');
        if (isInternalTransfer) continue;
        if (tx.amount > 0) {
          inflow += tx.amount;
        } else if (tx.amount < 0) {
          outflow += tx.amount.abs();
        }
      }
      return {'inflow': inflow, 'outflow': outflow};
    }

    Map<String, double> getTotals(List<TransactionModel> txs) {
      double inc = 0, exp = 0, cg = 0, opx = 0, dep = 0;
      for (var tx in txs) {
        final title = tx.title.toLowerCase();
        final amt = tx.amount.abs();
        final bool isAL =
            title.contains('[asset') ||
            title.contains('[liab') ||
            title.contains('equity') ||
            title.contains('[cf:');

        // 1. Explicit Tags
        if (title.startsWith('[revenue]')) {
          inc += amt;
        } else if (title.startsWith('[cogs]') ||
            title.contains("cost of goods")) {
          exp += amt;
          cg += amt;
        } else if (title.startsWith('[opex]')) {
          exp += amt;
          opx += amt;
        } else if (isAL) {
          // Skip Asset/Liab for P&L totals
        } else {
          // 2. Keyword-based bucketing (fallback when tags are missing)
          final bool isKnownExpense = _matchesExpenseKeyword(title);

          if (isKnownExpense) {
            exp += amt;
            opx += amt;
          } else if (title.contains('credit card payment') ||
              title.contains('transfer to') ||
              title.contains('autopay')) {
            // Treat as transfer, exclude from P&L for now
          } else if (tx.amount > 0) {
            inc += amt;
          } else {
            exp += amt;
            opx += amt;
          }
        }

        if (title.contains("depreciation") || title.contains("amortization")) {
          dep += amt;
        }
      }
      return {
        'income': inc,
        'expense': exp,
        'cogs': cg,
        'opex': opx,
        'dep': dep,
      };
    }

    final cT = getTotals(transactions);
    final pT = getTotals(prevTransactions);

    totalIncome.value = cT['income']!;
    totalExpenses.value = cT['expense']!;
    netIncome.value = totalIncome.value - totalExpenses.value;
    cogs.value = cT['cogs']!;
    operatingExpenses.value = cT['opex']!;
    grossProfit.value = totalIncome.value - totalExpenses.value;
    grossMarginPct.value = totalIncome.value != 0
        ? (grossProfit.value / totalIncome.value) * 100
        : 0;
    netOperatingIncome.value = grossProfit.value - operatingExpenses.value;
    ebitda.value = netIncome.value + cT['dep']!;

    prevPeriodIncome.value = pT['income']!;
    prevPeriodExpenses.value = pT['expense']!;
    prevPeriodCogs.value = pT['cogs']!;
    prevPeriodGrossProfit.value =
        prevPeriodIncome.value - prevPeriodExpenses.value;
    prevPeriodGrossMarginPct.value = prevPeriodIncome.value != 0
        ? (prevPeriodGrossProfit.value / prevPeriodIncome.value) * 100
        : 0;
    prevPeriodNetIncome.value =
        prevPeriodIncome.value - prevPeriodExpenses.value;
    prevPeriodEbitda.value = prevPeriodNetIncome.value + pT['dep']!;
    final cCash = getCashTotals(transactions);
    final pCash = getCashTotals(prevTransactions);
    cashInflow.value = cCash['inflow'] ?? 0.0;
    cashOutflow.value = cCash['outflow'] ?? 0.0;
    prevPeriodCashInflow.value = pCash['inflow'] ?? 0.0;
    prevPeriodCashOutflow.value = pCash['outflow'] ?? 0.0;

    double taxDeductions = 0;
    double opAdj = 0,
        wcChg = 0,
        opOther = 0,
        astPur = 0,
        invAct = 0,
        loanAct = 0,
        ownCont = 0,
        dist = 0,
        finOther = 0;
    double projectedInflow = 0;
    double projectedOutflow = 0;
    Map<String, double> incBreakdown = {};
    Map<String, double> expBreakdown = {};

    // Periodic maps initialization
    Map<String, Map<String, double>> pInc = {};
    Map<String, Map<String, double>> pExp = {};
    Map<String, Map<String, double>> pCurAst = {};
    Map<String, Map<String, double>> pFxdAst = {};
    Map<String, Map<String, double>> pOthAst = {};
    Map<String, Map<String, double>> pCurLiab = {};
    Map<String, Map<String, double>> pLtLiab = {};
    Map<String, Map<String, double>> pEq = {};
    Map<String, Map<String, double>> pOpAct = {};
    Map<String, Map<String, double>> pInvAct = {};
    Map<String, Map<String, double>> pFinAct = {};
    Map<String, double> pNetInc = {};
    Map<String, Map<String, double>> monthlyMap = {};
    double cashTotal = 0;
    double taggedCurrentAssetsTotal = 0;
    double arTotal = 0;
    double inventoryTotal = 0;
    double fixedAssetsTotal = 0;
    double otherAssetsTotal = 0;
    double curLiabTotal = 0;
    double longTermLiabTotal = 0;
    double equityTotalItems = 0;

    for (var tx in transactions) {
      double absAmt = tx.amount.abs();
      // Use yyyy-MM as key to differentiate months across years
      final txLocalDate = _localDateOnly(tx.dateTime);
      String mKey = intl.DateFormat('yyyy-MM').format(txLocalDate);
      if (!monthlyMap.containsKey(mKey)) {
        monthlyMap[mKey] = {
          'income': 0,
          'expense': 0,
          'cogs': 0,
          'net': 0,
          'dep': 0,
        };
      }

      // Initialize periodic maps for this mKey
      pInc[mKey] ??= {};
      pExp[mKey] ??= {};
      pCurAst[mKey] ??= {};
      pFxdAst[mKey] ??= {};
      pOthAst[mKey] ??= {};
      pCurLiab[mKey] ??= {};
      pLtLiab[mKey] ??= {};
      pEq[mKey] ??= {};
      pOpAct[mKey] ??= {};
      pInvAct[mKey] ??= {};
      pFinAct[mKey] ??= {};
      pNetInc[mKey] ??= 0.0;

      String title = tx.title.toLowerCase();
      final bool looksUnrealized =
          title.contains('receivable') ||
          title.contains('unpaid') ||
          title.contains('pending invoice') ||
          title.contains('pending payment') ||
          title.contains('scheduled') ||
          title.contains('expected deposit') ||
          title.contains('expected payment') ||
          title.contains('bill due') ||
          title.contains('accounts payable');
      if (looksUnrealized) {
        if (tx.amount >= 0) {
          projectedInflow += tx.amount.abs();
        } else {
          projectedOutflow += tx.amount.abs();
        }
      }
      final double realizedCfAmount = looksUnrealized ? 0.0 : tx.amount;
      bool isAL =
          title.contains('[asset') ||
          title.contains('[liab') ||
          title.contains('equity') ||
          title.contains('[cf:');

      final bool isCashLike =
          title.contains('cash') ||
          title.contains('bank') ||
          title.contains('checking') ||
          title.contains('savings');
      final bool isTaggedCurrentAsset = title.contains('[asset:current]');
      final bool isReceivableLike =
          title.contains('receivable') || title.contains('customer owes');
      final bool isInventoryLike =
          title.contains('inventory') || title.contains('stock');
      final bool isFixedAssetLike =
          title.contains('equipment') ||
          title.contains('property') ||
          title.contains('vehicle') ||
          title.contains('furniture') ||
          title.contains('[asset:non-current]');
      final bool isCurrentLiabilityLike =
          title.contains('payable') ||
          title.contains('credit card') ||
          title.contains('[liab:current]');
      final bool isLongTermLiabilityLike =
          title.contains('loan') ||
          title.contains('mortgage') ||
          title.contains('debt:long') ||
          title.contains('[liab:long-term]');
      final bool isEquityLike =
          title.contains('equity') ||
          title.contains('capital') ||
          title.contains('[equity]');
      final bool isAssetLike =
          title.contains('[asset') || title.contains('asset');
      final bool isCurrentForOther =
          title.contains('cash') ||
          title.contains('bank') ||
          title.contains('receivable') ||
          title.contains('inventory') ||
          title.contains('[asset:current]');
      final bool isFixedForOther =
          title.contains('equipment') ||
          title.contains('property') ||
          title.contains('vehicle') ||
          title.contains('[asset:non-current]');

      if (isCashLike) cashTotal += absAmt;
      if (isTaggedCurrentAsset) taggedCurrentAssetsTotal += absAmt;
      if (isReceivableLike) arTotal += absAmt;
      if (isInventoryLike) inventoryTotal += absAmt;
      if (isFixedAssetLike) {
        fixedAssetsTotal += title.contains('depreciation') ? -absAmt : absAmt;
      }
      if (isAssetLike && !isCurrentForOther && !isFixedForOther) {
        otherAssetsTotal += absAmt;
      }
      if (isCurrentLiabilityLike) curLiabTotal += absAmt;
      if (isLongTermLiabilityLike) longTermLiabTotal += absAmt;
      if (isEquityLike) equityTotalItems += absAmt;

      // Cash Flow / P&L Bucket Mapping
      final String cleanTitle = tx.title
          .replaceAll(RegExp(r'\[.*?\]'), '')
          .trim();

      bool isIncome = false;
      bool isExpense = false;
      bool isCogs = false;

      if (title.startsWith('[revenue]')) {
        isIncome = true;
      } else if (title.startsWith('[cogs]') ||
          title.contains("cost of goods")) {
        isExpense = true;
        isCogs = true;
      } else if (title.startsWith('[opex]')) {
        isExpense = true;
      } else if (isAL) {
        // Skip for P&L
      } else {
        final bool isKnownExpense = _matchesExpenseKeyword(title);

        if (isKnownExpense) {
          isExpense = true;
        } else if (title.contains('credit card payment') ||
            title.contains('transfer to') ||
            title.contains('autopay')) {
          // Transfer - ignore for P&L
        } else if (tx.amount > 0) {
          isIncome = true;
        } else {
          isExpense = true;
        }
      }

      if (isIncome) {
        monthlyMap[mKey]!['income'] = monthlyMap[mKey]!['income']! + absAmt;
        incBreakdown[cleanTitle] = (incBreakdown[cleanTitle] ?? 0) + absAmt;
        pInc[mKey]![cleanTitle] = (pInc[mKey]![cleanTitle] ?? 0) + absAmt;
        pNetInc[mKey] = (pNetInc[mKey] ?? 0) + absAmt;
      } else if (isExpense) {
        monthlyMap[mKey]!['expense'] = monthlyMap[mKey]!['expense']! + absAmt;
        if (isCogs) {
          monthlyMap[mKey]!['cogs'] = monthlyMap[mKey]!['cogs']! + absAmt;
        }
        expBreakdown[cleanTitle] = (expBreakdown[cleanTitle] ?? 0) + absAmt;
        pExp[mKey]![cleanTitle] = (pExp[mKey]![cleanTitle] ?? 0) + absAmt;
        pNetInc[mKey] = (pNetInc[mKey] ?? 0) - absAmt;
      }

      // 1. Operating Activities
      if (!isAL) {
        // Basic Operating = Net Income components
      } else {
        // Working Capital Changes
        if (title.contains('[cf:manual:operating]') ||
            title.contains('[cf:manual:other]')) {
          final signed = normalizeCashFlowAmount(
            title,
            realizedCfAmount,
            section: 'operating',
          );
          opOther += signed;
          pOpAct[mKey]![cleanTitle] = (pOpAct[mKey]![cleanTitle] ?? 0) + signed;
        } else if (title.contains('receivable') ||
            title.contains('inventory') ||
            title.contains('payable') ||
            title.contains('[cf:workingcapital]')) {
          final signed = normalizeCashFlowAmount(
            title,
            realizedCfAmount,
            section: 'operating',
          );
          wcChg += signed;
          pOpAct[mKey]![cleanTitle] = (pOpAct[mKey]![cleanTitle] ?? 0) + signed;
        } else if (title.contains('[cf:op:other]') ||
            title.contains('[cf:operating]') ||
            title.contains('other operating')) {
          final signed = normalizeCashFlowAmount(
            title,
            realizedCfAmount,
            section: 'operating',
          );
          opOther += signed;
          pOpAct[mKey]![cleanTitle] = (pOpAct[mKey]![cleanTitle] ?? 0) + signed;
        }

        // Investing Activities
        if (title.contains('[cf:manual:investing]') ||
            title.contains('[cf:invest:other]') ||
            title.contains('other investing')) {
          final signed = normalizeCashFlowAmount(
            title,
            realizedCfAmount,
            section: 'investing',
          );
          invAct += signed;
          pInvAct[mKey]![cleanTitle] =
              (pInvAct[mKey]![cleanTitle] ?? 0) + signed;
        } else if (title.contains('equipment') ||
            title.contains('property') ||
            title.contains('[cf:investing]') ||
            title.contains('asset purchase')) {
          final signed = normalizeCashFlowAmount(
            title,
            realizedCfAmount,
            section: 'investing',
          );
          astPur += signed;
          pInvAct[mKey]![cleanTitle] =
              (pInvAct[mKey]![cleanTitle] ?? 0) + signed;
        } else if (title.contains('investment')) {
          final signed = normalizeCashFlowAmount(
            title,
            realizedCfAmount,
            section: 'investing',
          );
          invAct += signed;
          pInvAct[mKey]![cleanTitle] =
              (pInvAct[mKey]![cleanTitle] ?? 0) + signed;
        }

        // Financing Activities
        if (title.contains('[cf:manual:financing]')) {
          final signed = normalizeCashFlowAmount(
            title,
            realizedCfAmount,
            section: 'financing',
          );
          finOther += signed;
          pFinAct[mKey]![cleanTitle] =
              (pFinAct[mKey]![cleanTitle] ?? 0) + signed;
        } else if (title.contains('loan') ||
            title.contains('debt') ||
            title.contains('[cf:financing]') ||
            title.contains('loan activities')) {
          final signed = normalizeCashFlowAmount(
            title,
            realizedCfAmount,
            section: 'financing',
          );
          loanAct += signed;
          pFinAct[mKey]![cleanTitle] =
              (pFinAct[mKey]![cleanTitle] ?? 0) + signed;
        } else if (title.contains('contribution') ||
            title.contains('[cf:contribution]')) {
          final signed = normalizeCashFlowAmount(
            title,
            realizedCfAmount,
            section: 'financing',
          );
          ownCont += signed;
          pFinAct[mKey]![cleanTitle] =
              (pFinAct[mKey]![cleanTitle] ?? 0) + signed;
        } else if (title.contains('distribution') ||
            title.contains('dividend') ||
            title.contains('owner draw') ||
            title.contains('[cf:distributions]')) {
          final signed = normalizeCashFlowAmount(
            title,
            realizedCfAmount,
            section: 'financing',
          );
          dist += signed;
          pFinAct[mKey]![cleanTitle] =
              (pFinAct[mKey]![cleanTitle] ?? 0) + signed;
        } else if (title.contains('[cf:finance:other]') ||
            title.contains('other financing')) {
          final signed = normalizeCashFlowAmount(
            title,
            realizedCfAmount,
            section: 'financing',
          );
          finOther += signed;
          pFinAct[mKey]![cleanTitle] =
              (pFinAct[mKey]![cleanTitle] ?? 0) + signed;
        }

        // --- Balance Sheet Periodic Bucketing ---
        if (title.contains('cash') ||
            title.contains('bank') ||
            title.contains('checking') ||
            title.contains('savings')) {
          pCurAst[mKey]!['Cash'] =
              (pCurAst[mKey]!['Cash'] ?? 0) + tx.amount.abs();
        } else if (title.contains('[asset:current]')) {
          pCurAst[mKey]!['Current Assets'] =
              (pCurAst[mKey]!['Current Assets'] ?? 0) + tx.amount.abs();
        } else if (title.contains('receivable') ||
            title.contains('customer owes')) {
          pCurAst[mKey]!['Accounts Receivable'] =
              (pCurAst[mKey]!['Accounts Receivable'] ?? 0) + tx.amount.abs();
        } else if (title.contains('inventory') || title.contains('stock')) {
          pCurAst[mKey]!['Inventory'] =
              (pCurAst[mKey]!['Inventory'] ?? 0) + tx.amount.abs();
        } else if (title.contains('equipment') ||
            title.contains('property') ||
            title.contains('vehicle') ||
            title.contains('furniture') ||
            title.contains('[asset:non-current]')) {
          double v = tx.title.toLowerCase().contains('depreciation')
              ? -tx.amount.abs()
              : tx.amount.abs();
          pFxdAst[mKey]!['Fixed Assets'] =
              (pFxdAst[mKey]!['Fixed Assets'] ?? 0) + v;
        } else if (title.contains('payable') ||
            title.contains('credit card') ||
            title.contains('[liab:current]')) {
          pCurLiab[mKey]!['Current Liabilities'] =
              (pCurLiab[mKey]!['Current Liabilities'] ?? 0) + tx.amount.abs();
        } else if (title.contains('loan') ||
            title.contains('mortgage') ||
            title.contains('debt:long') ||
            title.contains('[liab:long-term]')) {
          pLtLiab[mKey]!['Long-Term Liabilities'] =
              (pLtLiab[mKey]!['Long-Term Liabilities'] ?? 0) + tx.amount.abs();
        } else if (title.contains('equity') ||
            title.contains('capital') ||
            title.contains('[equity]')) {
          pEq[mKey]!["Owner's Equity"] =
              (pEq[mKey]!["Owner's Equity"] ?? 0) + tx.amount.abs();
        }
      }

      if (title.contains("depreciation") ||
          title.contains("amortization") ||
          title.contains('[cf:adjustments]')) {
        monthlyMap[mKey]!['dep'] = monthlyMap[mKey]!['dep']! + absAmt;
        opAdj += absAmt;
      }

      // Deductions should only come from expense-side transactions.
      if (tx.deductible && isExpense) taxDeductions += absAmt;
    }

    Map<String, double> balanceTotals(List<TransactionModel> txs) {
      double bCash = 0;
      double bTaggedCurrent = 0;
      double bAr = 0;
      double bInventory = 0;
      double bFixed = 0;
      double bOther = 0;
      double bCurLiab = 0;
      double bLongLiab = 0;

      for (final tx in txs) {
        final title = tx.title.toLowerCase();
        final absAmt = tx.amount.abs();
        final isCashLike =
            title.contains('cash') ||
            title.contains('bank') ||
            title.contains('checking') ||
            title.contains('savings');
        final isTaggedCurrentAsset = title.contains('[asset:current]');
        final isReceivableLike =
            title.contains('receivable') || title.contains('customer owes');
        final isInventoryLike =
            title.contains('inventory') || title.contains('stock');
        final isFixedAssetLike =
            title.contains('equipment') ||
            title.contains('property') ||
            title.contains('vehicle') ||
            title.contains('furniture') ||
            title.contains('[asset:non-current]');
        final isCurrentLiabilityLike =
            title.contains('payable') ||
            title.contains('credit card') ||
            title.contains('[liab:current]');
        final isLongTermLiabilityLike =
            title.contains('loan') ||
            title.contains('mortgage') ||
            title.contains('debt:long') ||
            title.contains('[liab:long-term]');
        final isAssetLike = title.contains('[asset') || title.contains('asset');
        final isCurrentForOther =
            title.contains('cash') ||
            title.contains('bank') ||
            title.contains('receivable') ||
            title.contains('inventory') ||
            title.contains('[asset:current]');
        final isFixedForOther =
            title.contains('equipment') ||
            title.contains('property') ||
            title.contains('vehicle') ||
            title.contains('[asset:non-current]');

        if (isCashLike) bCash += absAmt;
        if (isTaggedCurrentAsset) bTaggedCurrent += absAmt;
        if (isReceivableLike) bAr += absAmt;
        if (isInventoryLike) bInventory += absAmt;
        if (isFixedAssetLike) {
          bFixed += title.contains('depreciation') ? -absAmt : absAmt;
        }
        if (isAssetLike && !isCurrentForOther && !isFixedForOther) {
          bOther += absAmt;
        }
        if (isCurrentLiabilityLike) bCurLiab += absAmt;
        if (isLongTermLiabilityLike) bLongLiab += absAmt;
      }

      final computedAssets = bCash + bAr + bInventory + bFixed + bOther;
      return {
        'assets': computedAssets,
        'liabilities': bCurLiab + bLongLiab,
        'currentAssets': bTaggedCurrent + bCash + bAr + bInventory,
        'currentLiabilities': bCurLiab,
      };
    }

    final prevBalance = balanceTotals(prevTransactions);
    prevPeriodAssets.value = prevBalance['assets'] ?? 0.0;
    prevPeriodLiabilities.value = prevBalance['liabilities'] ?? 0.0;
    prevPeriodCurrentAssets.value = prevBalance['currentAssets'] ?? 0.0;
    prevPeriodCurrentLiabilities.value =
        prevBalance['currentLiabilities'] ?? 0.0;

    final prevEquity = prevPeriodAssets.value - prevPeriodLiabilities.value;
    final currEquity = totalAssets.value - totalLiabilities.value;
    assetsChange.value = prevPeriodAssets.value != 0
        ? ((totalAssets.value - prevPeriodAssets.value) /
                  prevPeriodAssets.value) *
              100
        : (totalAssets.value > 0 ? 100 : 0);
    liabilitiesChange.value = prevPeriodLiabilities.value != 0
        ? ((totalLiabilities.value - prevPeriodLiabilities.value) /
                  prevPeriodLiabilities.value) *
              100
        : (totalLiabilities.value > 0 ? 100 : 0);
    equityChange.value = prevEquity != 0
        ? ((currEquity - prevEquity) / prevEquity) * 100
        : (currEquity > 0 ? 100 : 0);

    operatingAdjustments.value = opAdj;
    workingCapitalChanges.value = wcChg;
    operatingOther.value = opOther;
    assetPurchases.value = astPur;
    investmentActivities.value = invAct;
    loanActivities.value = loanAct;
    ownerContributions.value = ownCont;
    distributions.value = dist;
    financingOther.value = finOther;

    operatingCashFlow.value = netIncome.value + opAdj + wcChg + opOther;
    investingCashFlow.value = astPur + invAct;
    financingCashFlow.value = loanAct + ownCont + dist + finOther;
    beginningCashBalance.value = openingCash;
    netChangeInCash.value =
        operatingCashFlow.value +
        investingCashFlow.value +
        financingCashFlow.value;
    endingCashBalance.value =
        beginningCashBalance.value + netChangeInCash.value;

    final computedCashForBs = cashTotal.abs() > 0.0001
        ? cashTotal
        : endingCashBalance.value;
    final retainedEarnings = netIncome.value;
    // final totalEquityForBreakdown = equityTotalItems + retainedEarnings;

    currentAssetsBreakdown.value = {
      if (taggedCurrentAssetsTotal > 0)
        "Current Assets": taggedCurrentAssetsTotal,
      "Cash": computedCashForBs,
      "Accounts Receivable": arTotal,
      if (inventoryTotal > 0) "Inventory": inventoryTotal,
    };
    fixedAssetsBreakdown.value = {"Fixed Assets": fixedAssetsTotal};
    otherAssetsBreakdown.value = {"Other Assets": otherAssetsTotal};
    currentLiabilitiesBreakdown.value = {"Current Liabilities": curLiabTotal};
    longTermLiabilitiesBreakdown.value = {
      "Long-Term Liabilities": longTermLiabTotal,
    };
    ownerEquityBreakdown.value = {
      if (equityTotalItems.abs() > 0.0001) "Owner's Equity": equityTotalItems,
      "Retained Earnings": retainedEarnings,
    };

    totalAssets.value =
        computedCashForBs +
        arTotal +
        inventoryTotal +
        fixedAssetsTotal +
        otherAssetsTotal;
    totalLiabilities.value = curLiabTotal + longTermLiabTotal;
    totalTaxDeductions.value = taxDeductions;
    upcomingReceivables.value = projectedInflow;
    upcomingPayables.value = projectedOutflow;

    incomeBreakdown.assignAll(incBreakdown);
    expenseBreakdown.assignAll(expBreakdown);

    periodicIncomeBreakdown.assignAll(pInc);
    periodicExpenseBreakdown.assignAll(pExp);
    periodicCurrentAssetsBreakdown.assignAll(pCurAst);
    periodicFixedAssetsBreakdown.assignAll(pFxdAst);
    periodicOtherAssetsBreakdown.assignAll(pOthAst);
    periodicCurrentLiabilitiesBreakdown.assignAll(pCurLiab);
    periodicLongTermLiabilitiesBreakdown.assignAll(pLtLiab);
    periodicEquityBreakdown.assignAll(pEq);
    periodicOperatingActivities.assignAll(pOpAct);
    periodicInvestingActivities.assignAll(pInvAct);
    periodicFinancingActivities.assignAll(pFinAct);
    periodicNetIncome.assignAll(pNetInc);

    List<Map<String, double>> tempMonthly = [];

    // Monthly aggregates for secondary charts: only months overlapping the selected range
    DateTime current = DateTime(startDate.year, startDate.month, 1);
    final endMonth = DateTime(endDate.year, endDate.month, 1);

    while (current.isBefore(endMonth) || current.isAtSameMomentAs(endMonth)) {
      String mKey = intl.DateFormat('yyyy-MM').format(current);
      final val =
          monthlyMap[mKey] ??
          {'income': 0.0, 'expense': 0.0, 'cogs': 0.0, 'net': 0.0, 'dep': 0.0};
      val['income'] ??= 0.0;
      val['expense'] ??= 0.0;
      val['cogs'] ??= 0.0;
      val['net'] = val['income']! - val['expense']!;
      val['ebitda'] = val['net']! + (val['dep'] ?? 0.0);
      val['month_idx'] = current.month
          .toDouble(); // Keep month_idx for reference

      tempMonthly.add(val);

      current = DateTime(current.year, current.month + 1, 1);
    }

    monthlyData.value = tempMonthly;

    final trendStart = _dateOnly(startDate);
    final trendEnd = _dateOnly(endDate);
    final g = _trendGranularityForRange(trendStart, trendEnd);
    trendGranularityLabel = _trendGranularityLabel(g);
    trendChartSeries = _buildTrendSeries(transactions, trendStart, trendEnd, g);
    prevTrendChartSeries = _buildTrendSeries(
      prevTransactions,
      _dateOnly(prevStart),
      _dateOnly(prevEnd),
      g,
    );
    chartData.value = _buildGrowthAndCogsSeries(trendChartSeries);

    businessStrengthScore.value = totalIncome.value > 0
        ? (netIncome.value / totalIncome.value * 100).clamp(0, 100)
        : 0;
  }

  DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);
  DateTime _localDateOnly(DateTime d) {
    final local = d.toLocal();
    return DateTime(local.year, local.month, local.day);
  }

  /// Calendar day in the previous month, clamped (e.g. Mar 31 → Feb 28/29).
  DateTime _sameDayPreviousMonth(DateTime date) {
    final d = _dateOnly(date);
    var y = d.year;
    var m = d.month - 1;
    if (m < 1) {
      m = 12;
      y--;
    }
    final lastDay = DateTime(y, m + 1, 0).day;
    final day = d.day > lastDay ? lastDay : d.day;
    return DateTime(y, m, day);
  }

  DateTime _subtractCalendarMonths(DateTime date, int months) {
    var y = date.year;
    var m = date.month - months;
    while (m < 1) {
      m += 12;
      y--;
    }
    final lastDay = DateTime(y, m + 1, 0).day;
    final d = date.day > lastDay ? lastDay : date.day;
    return DateTime(y, m, d);
  }

  DateTime _balanceSheetComparisonBaselineDate(DateTime asOf) {
    final a = _dateOnly(asOf);
    switch (balanceSheetComparisonMode) {
      case 1:
        return _dateOnly(a.subtract(const Duration(days: 7)));
      case 2:
        return _dateOnly(a.subtract(const Duration(days: 30)));
      case 3:
        return _subtractCalendarMonths(a, 6);
      case 0:
      default:
        return _sameDayPreviousMonth(a);
    }
  }

  void setBalanceSheetComparisonMode(int mode) {
    if (balanceSheetComparisonMode == mode) return;
    balanceSheetComparisonMode = mode;
    refreshBalanceSheetComparisonBaselines();
    update();
  }

  /// Reconciles Balance Sheet lines with [BalanceSheetLineMetrics] (same engine as exports).
  ///
  /// When [includeNetIncome] is false (e.g. dashboard date-range fetch), period P&L [netIncome]
  /// from [_calculateMetrics] is left unchanged; only balance sheet maps and asset/liability totals update.
  void _applyEngineBalanceSheetSnapshot({bool includeNetIncome = true}) {
    if (balanceSheetSnapshotSourceTransactions.isEmpty || lastEndDate == null) {
      return;
    }
    final m = BalanceSheetLineMetrics.computeThrough(
      balanceSheetSnapshotSourceTransactions,
      lastEndDate!,
    );
    totalAssets.value = m.totalAssets;
    totalLiabilities.value = m.totalLiabilities;
    if (includeNetIncome) {
      netIncome.value = m.netIncome;
    }
    currentAssetsBreakdown.assignAll(m.currentAssetsBreakdown);
    fixedAssetsBreakdown.assignAll(m.fixedAssetsBreakdown);
    otherAssetsBreakdown.assignAll(m.otherAssetsBreakdown);
    currentLiabilitiesBreakdown.assignAll(m.currentLiabilitiesBreakdown);
    longTermLiabilitiesBreakdown.assignAll(m.longTermLiabilitiesBreakdown);
    ownerEquityBreakdown.assignAll(m.ownerEquityBreakdown);
  }

  void refreshBalanceSheetComparisonBaselines() {
    if (!lastFetchBalanceSheetSnapshot ||
        balanceSheetSnapshotSourceTransactions.isEmpty ||
        lastEndDate == null) {
      return;
    }
    final base = _balanceSheetComparisonBaselineDate(lastEndDate!);
    final p = BalanceSheetLineMetrics.computeThrough(
      balanceSheetSnapshotSourceTransactions,
      base,
    );
    prevPeriodAssets.value = p.totalAssets;
    prevPeriodLiabilities.value = p.totalLiabilities;
    prevPeriodNetIncome.value = p.netIncome;
    prevPeriodCurrentAssets.value = p.currentAssetsBreakdown.values.fold(
      0.0,
      (a, b) => a + b,
    );
    prevPeriodCurrentLiabilities.value = p.currentLiabilitiesBreakdown.values
        .fold(0.0, (a, b) => a + b);
  }

  /// P&L trend bucketing (inclusive day count):
  /// - 1–31 days → daily (custom month-spanning ranges like the 30-day preset)
  /// - 32–186 days → weekly (~≤6 months)
  /// - 187–729 days → monthly
  /// - 730+ days → quarterly
  _TrendGranularity _trendGranularityForRange(DateTime start, DateTime end) {
    final s = _dateOnly(start);
    final e = _dateOnly(end);
    final days = e.difference(s).inDays + 1;
    if (days <= 31) return _TrendGranularity.daily;
    if (days <= 186) return _TrendGranularity.weekly;
    if (days < 730) return _TrendGranularity.monthly;
    return _TrendGranularity.quarterly;
  }

  String _trendGranularityLabel(_TrendGranularity g) {
    switch (g) {
      case _TrendGranularity.daily:
        return 'Daily';
      case _TrendGranularity.weekly:
        return 'Weekly';
      case _TrendGranularity.monthly:
        return 'Monthly';
      case _TrendGranularity.quarterly:
        return 'Quarterly';
    }
  }

  DateTime _startOfIsoWeekMonday(DateTime d) {
    final day = _dateOnly(d);
    return day.subtract(Duration(days: day.weekday - DateTime.monday));
  }

  DateTime _startOfMonth(DateTime d) => DateTime(d.year, d.month, 1);

  DateTime _startOfQuarter(DateTime d) {
    final qMonth = ((d.month - 1) ~/ 3) * 3 + 1;
    return DateTime(d.year, qMonth, 1);
  }

  DateTime _trendBucketStartForDate(DateTime d, _TrendGranularity g) {
    switch (g) {
      case _TrendGranularity.daily:
        return _dateOnly(d);
      case _TrendGranularity.weekly:
        return _startOfIsoWeekMonday(d);
      case _TrendGranularity.monthly:
        return _startOfMonth(d);
      case _TrendGranularity.quarterly:
        return _startOfQuarter(d);
    }
  }

  String _trendBucketKey(DateTime bucketStart, _TrendGranularity g) {
    switch (g) {
      case _TrendGranularity.daily:
      case _TrendGranularity.weekly:
        return intl.DateFormat('yyyy-MM-dd').format(bucketStart);
      case _TrendGranularity.monthly:
        return intl.DateFormat('yyyy-MM').format(bucketStart);
      case _TrendGranularity.quarterly:
        final q = ((bucketStart.month - 1) ~/ 3) + 1;
        return '${bucketStart.year}-Q$q';
    }
  }

  List<DateTime> _trendBucketStarts(
    DateTime rangeStart,
    DateTime rangeEnd,
    _TrendGranularity g,
  ) {
    final rs = _dateOnly(rangeStart);
    final re = _dateOnly(rangeEnd);
    final List<DateTime> out = [];
    switch (g) {
      case _TrendGranularity.daily:
        for (var d = rs; !d.isAfter(re); d = d.add(const Duration(days: 1))) {
          out.add(d);
        }
        break;
      case _TrendGranularity.weekly:
        var cur = _startOfIsoWeekMonday(rs);
        while (!cur.isAfter(re)) {
          final weekEnd = cur.add(const Duration(days: 6));
          if (weekEnd.isBefore(rs)) {
            cur = cur.add(const Duration(days: 7));
            continue;
          }
          out.add(cur);
          cur = cur.add(const Duration(days: 7));
        }
        break;
      case _TrendGranularity.monthly:
        for (
          var m = _startOfMonth(rs);
          !m.isAfter(_startOfMonth(re));
          m = DateTime(m.year, m.month + 1, 1)
        ) {
          out.add(m);
        }
        break;
      case _TrendGranularity.quarterly:
        for (
          var q = _startOfQuarter(rs);
          !q.isAfter(_startOfQuarter(re));
          q = DateTime(q.year, q.month + 3, 1)
        ) {
          out.add(q);
        }
        break;
    }
    return out;
  }

  String _formatTrendAxisLabel(
    DateTime bucket,
    _TrendGranularity g,
    DateTime rangeStart,
    DateTime rangeEnd,
  ) {
    final rs = _dateOnly(rangeStart);
    final re = _dateOnly(rangeEnd);
    switch (g) {
      case _TrendGranularity.daily:
        if (rs.year != re.year) {
          return intl.DateFormat('MMM d, yy').format(bucket);
        }
        return intl.DateFormat('MMM d').format(bucket);
      case _TrendGranularity.weekly:
        return intl.DateFormat('MMM d').format(bucket);
      case _TrendGranularity.monthly:
        return intl.DateFormat("MMM ''yy").format(bucket);
      case _TrendGranularity.quarterly:
        final q = ((bucket.month - 1) ~/ 3) + 1;
        return "Q$q '${bucket.year.toString().substring(2)}";
    }
  }

  String _formatTrendTooltipDate(DateTime bucket, _TrendGranularity g) {
    switch (g) {
      case _TrendGranularity.daily:
        return intl.DateFormat('MMM dd, yyyy').format(bucket);
      case _TrendGranularity.weekly:
        final we = bucket.add(const Duration(days: 6));
        return '${intl.DateFormat('MMM d').format(bucket)} – ${intl.DateFormat('MMM d, yyyy').format(we)}';
      case _TrendGranularity.monthly:
        return intl.DateFormat('MMMM yyyy').format(bucket);
      case _TrendGranularity.quarterly:
        final q = ((bucket.month - 1) ~/ 3) + 1;
        return 'Q$q ${bucket.year}';
    }
  }

  (double income, double expense) _plIncomeExpenseForTx(TransactionModel tx) {
    final title = tx.title.toLowerCase();
    final isAL =
        title.contains('[asset') ||
        title.contains('[liab') ||
        title.contains('equity') ||
        title.contains('[cf:');
    final absAmt = tx.amount.abs();

    var isIncome = false;
    var isExpense = false;

    if (title.startsWith('[revenue]')) {
      isIncome = true;
    } else if (title.startsWith('[cogs]') || title.contains('cost of goods')) {
      isExpense = true;
    } else if (title.startsWith('[opex]')) {
      isExpense = true;
    } else if (isAL) {
      return (0.0, 0.0);
    } else {
      final isKnownExpense = _matchesExpenseKeyword(title);
      if (isKnownExpense) {
        isExpense = true;
      } else if (title.contains('credit card payment') ||
          title.contains('transfer to') ||
          title.contains('autopay')) {
        return (0.0, 0.0);
      } else if (tx.amount > 0) {
        isIncome = true;
      } else {
        isExpense = true;
      }
    }

    if (isIncome) return (absAmt, 0.0);
    if (isExpense) return (0.0, absAmt);
    return (0.0, 0.0);
  }

  bool _isUnrealizedCashFlowTx(TransactionModel tx) {
    final t = tx.title.toLowerCase();
    return t.contains('receivable') ||
        t.contains('accounts receivable') ||
        t.contains('accounts payable') ||
        t.contains('unpaid') ||
        t.contains('pending invoice') ||
        t.contains('pending payment') ||
        t.contains('scheduled') ||
        t.contains('expected deposit') ||
        t.contains('expected payment') ||
        t.contains('bill due');
  }

  List<Map<String, dynamic>> _buildTrendSeries(
    List<TransactionModel> txs,
    DateTime rangeStart,
    DateTime rangeEnd,
    _TrendGranularity g,
  ) {
    final rs = _dateOnly(rangeStart);
    final re = _dateOnly(rangeEnd);
    final buckets = _trendBucketStarts(rs, re, g);
    final inc = <String, double>{
      for (final b in buckets) _trendBucketKey(b, g): 0.0,
    };
    final exp = <String, double>{
      for (final b in buckets) _trendBucketKey(b, g): 0.0,
    };
    final cogs = <String, double>{
      for (final b in buckets) _trendBucketKey(b, g): 0.0,
    };
    final unrealizedInc = <String, double>{
      for (final b in buckets) _trendBucketKey(b, g): 0.0,
    };
    final unrealizedExp = <String, double>{
      for (final b in buckets) _trendBucketKey(b, g): 0.0,
    };

    for (final tx in txs) {
      final d = _localDateOnly(tx.dateTime);
      if (d.isBefore(rs) || d.isAfter(re)) continue;
      final b = _trendBucketStartForDate(d, g);
      final key = _trendBucketKey(b, g);
      if (!inc.containsKey(key)) continue;
      final pair = _plIncomeExpenseForTx(tx);
      inc[key] = inc[key]! + pair.$1;
      exp[key] = exp[key]! + pair.$2;
      if (_isUnrealizedCashFlowTx(tx)) {
        if (tx.amount >= 0) {
          unrealizedInc[key] = unrealizedInc[key]! + tx.amount.abs();
        } else {
          unrealizedExp[key] = unrealizedExp[key]! + tx.amount.abs();
        }
      }
      final title = tx.title.toLowerCase();
      if (title.startsWith('[cogs]') || title.contains('cost of goods')) {
        cogs[key] = cogs[key]! + tx.amount.abs();
      }
    }

    return buckets.map((b) {
      final key = _trendBucketKey(b, g);
      final i = inc[key] ?? 0.0;
      final e = exp[key] ?? 0.0;
      final cg = cogs[key] ?? 0.0;
      final ui = unrealizedInc[key] ?? 0.0;
      final ue = unrealizedExp[key] ?? 0.0;
      return <String, dynamic>{
        'bucketStart': b,
        'label': _formatTrendAxisLabel(b, g, rs, re),
        'tooltipDate': _formatTrendTooltipDate(b, g),
        'income': i,
        'expense': e,
        'realizedIncome': i,
        'realizedExpense': e,
        'unrealizedIncome': ui,
        'unrealizedExpense': ue,
        'cogs': cg,
        'net': i - e,
        'realizedNet': i - e,
        'unrealizedNet': ui - ue,
        'sortKey': key,
      };
    }).toList();
  }

  List<Map<String, dynamic>> _buildGrowthAndCogsSeries(
    List<Map<String, dynamic>> trendSeries,
  ) {
    double? prevRevenue;
    double? prevExpense;
    double? prevCogs;
    const double growthCapPct = 500.0;

    /// Period-over-period % change, aligned with [trendSeries] buckets.
    /// Prior revenue/expense of 0 with non-zero current caps at [growthCapPct] for chart stability.
    ({double value, bool isNew}) growthFromPrevious(
      double current,
      double? previous,
    ) {
      if (previous == null) return (value: 0.0, isNew: false);
      if (previous == 0.0) {
        if (current == 0.0) return (value: 0.0, isNew: false);
        return (value: growthCapPct, isNew: true);
      }
      final raw = ((current - previous) / previous) * 100;
      return (value: raw.clamp(-growthCapPct, growthCapPct), isNew: false);
    }

    return trendSeries.map((row) {
      final currentRevenue = (row['income'] as num?)?.toDouble() ?? 0.0;
      final currentExpense = (row['expense'] as num?)?.toDouble() ?? 0.0;
      final currentCogs = (row['cogs'] as num?)?.toDouble() ?? 0.0;
      final bucket = row['bucketStart'];
      final tooltipDate = row['tooltipDate'];
      final label = row['label'];
      final revenueGrowthData = growthFromPrevious(currentRevenue, prevRevenue);
      final expenseGrowthData = growthFromPrevious(currentExpense, prevExpense);
      final cogsGrowthData = growthFromPrevious(currentCogs, prevCogs);
      prevRevenue = currentRevenue;
      prevExpense = currentExpense;
      prevCogs = currentCogs;
      return <String, dynamic>{
        'bucketStart': bucket,
        'name': label,
        'tooltipDate': tooltipDate,
        'revenueGrowth': revenueGrowthData.value,
        'expenseGrowth': expenseGrowthData.value,
        'cogsGrowth': cogsGrowthData.value,
        'revenueGrowthIsNew': revenueGrowthData.isNew,
        'expenseGrowthIsNew': expenseGrowthData.isNew,
        'cogsGrowthIsNew': cogsGrowthData.isNew,
        'revenue': currentRevenue,
        'cogs': currentCogs,
        'cogsPct': currentRevenue != 0
            ? (currentCogs / currentRevenue) * 100
            : 0.0,
      };
    }).toList();
  }

  void _loadMockBalanceSheetData() {
    balanceSheetSnapshotSourceTransactions.clear();
    currentAssetsBreakdown.value = {
      "Cash": 145980.0,
      "Accounts Receivable": 291960.0,
    };
    fixedAssetsBreakdown.value = {"Fixed Assets": 1000000.0};
    otherAssetsBreakdown.value = {"Other Assets": 21860.0};

    totalAssets.value = 1459800.0;
    totalLiabilities.value = 845000.0;

    currentLiabilitiesBreakdown.value = {"Current Liabilities": 45000.0};
    longTermLiabilitiesBreakdown.value = {"Long Term Liabilities": 800000.0};
    ownerEquityBreakdown.value = {"Owner's Equity": 500000.0};
    netIncome.value = 114800.0;
    final mockChart = [
      {
        'name': 'Jan',
        'revenue': 450000,
        'revenueGrowth': 5.2,
        'expenseGrowth': 3.1,
        'cogsGrowth': 4.5,
        'cogsPct': 42,
      },
      {
        'name': 'Feb',
        'revenue': 480000,
        'revenueGrowth': 6.6,
        'expenseGrowth': 2.8,
        'cogsGrowth': 3.2,
        'cogsPct': 40,
      },
      {
        'name': 'Mar',
        'revenue': 510000,
        'revenueGrowth': 6.2,
        'expenseGrowth': 4.2,
        'cogsGrowth': 4.0,
        'cogsPct': 41,
      },
    ];
    chartData.value = mockChart;
    trendChartSeries = mockChart.map((e) {
      final rev = (e['revenue'] as num).toDouble();
      final exp = rev * 0.55;
      final pct = (e['cogsPct'] as num?)?.toDouble() ?? 0;
      return {
        'bucketStart': DateTime.now(),
        'label': e['name'],
        'tooltipDate': e['name'],
        'income': rev,
        'expense': exp,
        'cogs': rev * pct / 100,
        'net': rev - exp,
        'sortKey': e['name'],
      };
    }).toList();
    prevTrendChartSeries = [];
    trendGranularityLabel = 'Monthly';
    update();
  }
}
