// ignore_for_file: depend_on_referenced_packages, unused_element, unused_local_variable, dead_code, dead_null_aware_expression, deprecated_member_use, use_build_context_synchronously, curly_braces_in_flow_control_structures

import 'package:booksmart/constant/exports.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:booksmart/modules/user/controllers/financial_report_controller.dart';
import 'package:booksmart/modules/user/controllers/organization_controller.dart';
import 'package:booksmart/modules/common/controllers/auth_controller.dart';
import 'package:booksmart/supabase/tables.dart';
import 'package:booksmart/utils/supabase.dart';
import 'package:excel/excel.dart' as excel_lib;
import 'package:intl/intl.dart';
import 'package:get/get.dart';
import 'package:archive/archive.dart';
import 'package:syncfusion_flutter_datepicker/datepicker.dart';
import 'package:booksmart/modules/user/ui/tax_filling/upload_tax_doc_dialog.dart';
import 'package:booksmart/widgets/recent_documents_widget.dart';
import 'package:booksmart/widgets/kpi_info_tooltip.dart';
import 'package:booksmart/modules/user/ui/financial_statement/pdf_export_service.dart';
import 'package:booksmart/modules/user/ui/financial_statement/export_modal_widget.dart';
import 'package:booksmart/modules/user/utils/cash_flow_manual_entry_service.dart';
import 'dart:developer' as dev;
import 'package:booksmart/widgets/snackbar.dart';
import 'package:booksmart/utils/downloader.dart';
import 'package:xml/xml.dart';
import 'package:booksmart/models/cash_flow_manual_entry_model.dart';
import 'dart:math';

class CashFlowTab extends StatefulWidget {
  const CashFlowTab({super.key});

  @override
  State<CashFlowTab> createState() => _CashFlowTabState();
}

class _CashFlowTabState extends State<CashFlowTab>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  final CashFlowManualEntryService _manualEntryService =
      CashFlowManualEntryService();
  DateTime asOfDate = DateTime.now();
  // 0: 7d, 1: 30d, 2: 3mo, 3: 12mo, 4: Yearly, 5: Custom
  int _selectedFilterIdx = 2;
  int? _selectedYear;
  DateTime? _startDate;
  DateTime? _endDate;

  bool _showMoneyIn = true;
  bool _showMoneyOut = true;
  bool _showNetCash = true;
  bool _comparePriorPeriod = false;
  bool _didInitialControllerSync = false;

  final Map<String, bool> _expandedCards = {
    "Operating Activities": false,
    "Investing Activities": false,
    "Financing Activities": false,
  };

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    _startDate = today.subtract(const Duration(days: 89));
    _endDate = today;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _ensureInitialControllerSync();
    });
  }

  bool _isSameDate(DateTime? a, DateTime? b) {
    if (a == null || b == null) return false;
    return a.year == b.year && a.month == b.month && a.day == b.day;
  }

  DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

  bool _isSameRange(DateTime start, DateTime end) {
    if (_startDate == null || _endDate == null) return false;
    return _dateOnly(_startDate!) == _dateOnly(start) &&
        _dateOnly(_endDate!) == _dateOnly(end);
  }

  Future<void> _ensureInitialControllerSync() async {
    if (!mounted || _didInitialControllerSync) return;
    _didInitialControllerSync = true;
    if (_startDate == null || _endDate == null) return;
    final orgId = getCurrentOrganization?.id;
    if (orgId == null) return;
    final controller = Get.find<FinancialReportController>(
      tag: orgId.toString(),
    );
    if (_isSameDate(controller.lastStartDate, _startDate) &&
        _isSameDate(controller.lastEndDate, _endDate)) {
      return;
    }
    await controller.fetchAndAggregateData(
      startDate: _startDate,
      endDate: _endDate,
    );
  }

  void _exportCSV(FinancialReportController controller) async {
    final buffer = StringBuffer();
    final String orgName = getCurrentOrganization?.name ?? 'Organization';
    final String periodLabel =
        "${DateFormat('MM-dd-yyyy').format(_startDate ?? DateTime.now())}_to_${DateFormat('MM-dd-yyyy').format(_endDate ?? DateTime.now())}";

    buffer.writeln('Cash Flow Statement - $orgName');
    buffer.writeln('Period: $periodLabel');
    buffer.writeln('');

    void addActivitySection(
      String title,
      List<Map<String, dynamic>> items,
      double total,
    ) {
      buffer.writeln(title.toUpperCase());
      buffer.writeln('Activity Item,Amount');
      for (var item in items) {
        buffer.writeln('"${item["label"]}",${item["value"]}');
      }
      buffer.writeln('TOTAL $title,$total');
      buffer.writeln('');
    }

    addActivitySection(
      'Operating Activities',
      _getOperatingItems(controller),
      controller.operatingCashFlow.value,
    );
    addActivitySection(
      'Investing Activities',
      _getInvestingItems(controller),
      controller.investingCashFlow.value,
    );
    addActivitySection(
      'Financing Activities',
      _getFinancingItems(controller),
      controller.financingCashFlow.value,
    );

    final netCash =
        controller.operatingCashFlow.value +
        controller.investingCashFlow.value +
        controller.financingCashFlow.value;
    buffer.writeln('NET CHANGE IN CASH,$netCash');

    final csvBytes = utf8.encode(buffer.toString());
    await downloadFile(
      '${orgName}_Cash_Flow_$periodLabel.csv',
      csvBytes,
      mimeType: 'text/csv',
    );
  }

  void _exportPDF(FinancialReportController controller) async {
    try {
      if (_startDate == null || _endDate == null) {
        showSnackBar('Please select a valid date range.', isError: true);
        return;
      }

      final start = DateTime(
        _startDate!.year,
        _startDate!.month,
        _startDate!.day,
      );
      final end = DateTime(_endDate!.year, _endDate!.month, _endDate!.day);
      final totalMonths =
          (end.year - start.year) * 12 + end.month - start.month + 1;

      // Keep existing filter behavior, but enforce 5-column export constraints.
      final PdfViewType viewType = _selectedFilterIdx == 4
          ? PdfViewType.yearly
          : (totalMonths <= 5 ? PdfViewType.monthly : PdfViewType.quarterly);

      final request = PdfExportRequest(
        startDate: start,
        endDate: end,
        viewType: viewType,
        templateVariant: PdfTemplateVariant.templateA,
        companyName: getCurrentOrganization?.name ?? 'Organization',
        companyAddress: '',
      );

      await PdfExportService().exportCashFlowPresentationPdf(request);
    } catch (e, st) {
      dev.log('PDF Export Error: $e\n$st');
      showSnackBar('Please review PDF generation: $e', isError: true);
    }
  }

  Future<CashFlowPdfData> _buildCashFlowPdfData(
    FinancialReportController controller,
    PdfExportRequest request,
  ) async {
    final bucketLabels = PdfExportService().buildBucketLabels(
      request.startDate,
      request.endDate,
      request.viewType,
    );

    final monthlyNetIncome = <String, double>{};
    final monthlyDepAmort = <String, double>{};
    final monthlyWorkingCapital = <String, double>{};
    final monthlyOperatingOther = <String, double>{};
    final monthlyOperatingTotal = <String, double>{};

    final monthlyCapex = <String, double>{};
    final monthlyInvestingOther = <String, double>{};
    final monthlyInvestingTotal = <String, double>{};

    final monthlyLoanActivities = <String, double>{};
    final monthlyOwnerContributions = <String, double>{};
    final monthlyDistributions = <String, double>{};
    final monthlyFinancingOther = <String, double>{};
    final monthlyFinancingTotal = <String, double>{};
    final monthlyDepFromTransactions = <String, double>{};

    String sqlDateLocal(DateTime d) {
      final x = DateTime(d.year, d.month, d.day);
      final mm = x.month.toString().padLeft(2, '0');
      final dd = x.day.toString().padLeft(2, '0');
      return '${x.year}-$mm-$dd';
    }

    DateTime nextDay(DateTime d) => DateTime(d.year, d.month, d.day + 1);

    final orgId = getCurrentOrganization?.id;
    if (orgId != null) {
      final txRows = await supabase
          .from(SupabaseTable.transaction)
          .select('date_time,title,amount')
          .eq('org_id', orgId)
          .gte('date_time', sqlDateLocal(request.startDate))
          .lt('date_time', sqlDateLocal(nextDay(request.endDate)));

      for (final row in (txRows as List)) {
        final rawTitle = (row['title'] ?? '').toString().toLowerCase();
        final rawAmount = row['amount'];
        final double amount = rawAmount is num
            ? rawAmount.toDouble()
            : (double.tryParse(rawAmount?.toString() ?? '0') ?? 0.0);
        final rawDate = (row['date_time'] ?? '').toString();
        final DateTime? dateTime = DateTime.tryParse(rawDate);
        if (dateTime == null) continue;
        if (rawTitle.contains('depreciation') ||
            rawTitle.contains('amortization') ||
            rawTitle.contains('[cf:adjustments]')) {
          final monthKey = DateFormat('yyyy-MM').format(dateTime);
          monthlyDepFromTransactions[monthKey] =
              (monthlyDepFromTransactions[monthKey] ?? 0) + amount.abs();
        }
      }
    }

    DateTime cursor = DateTime(
      request.startDate.year,
      request.startDate.month,
      1,
    );
    final DateTime last = DateTime(
      request.endDate.year,
      request.endDate.month,
      1,
    );
    while (!cursor.isAfter(last)) {
      final monthKey = DateFormat('yyyy-MM').format(cursor);

      final netIncome = controller.periodicNetIncome[monthKey] ?? 0.0;
      final expenseMap =
          controller.periodicExpenseBreakdown[monthKey] ?? <String, double>{};
      final operatingMap =
          controller.periodicOperatingActivities[monthKey] ??
          <String, double>{};
      final investingMap =
          controller.periodicInvestingActivities[monthKey] ??
          <String, double>{};
      final financingMap =
          controller.periodicFinancingActivities[monthKey] ??
          <String, double>{};

      final depAmort =
          monthlyDepFromTransactions[monthKey] ??
          _sumByKeywords(expenseMap, const ['depreciation', 'amortization']);
      final wcChanges = _sumByKeywords(operatingMap, const [
        'receivable',
        'inventory',
        'payable',
        'accrued',
        'deferred',
        'prepaid',
        '[cf:workingcapital]',
      ]);
      final operatingOther = _sumValues(operatingMap) - wcChanges;
      final operatingTotal = netIncome + depAmort + wcChanges + operatingOther;

      final capex = _sumByKeywords(investingMap, const [
        'equipment',
        'property',
        'asset purchase',
        '[cf:investing]',
      ]);
      final investingOther = _sumValues(investingMap) - capex;
      final investingTotal = capex + investingOther;

      final loanActivities = _sumByKeywords(financingMap, const [
        'loan',
        'debt',
        '[cf:financing]',
      ]);
      final ownerContributions = _sumByKeywords(financingMap, const [
        'contribution',
        'share capital',
        '[cf:contribution]',
      ]);
      final distributions = _sumByKeywords(financingMap, const [
        'distribution',
        'dividend',
        'owner draw',
        '[cf:distributions]',
      ]);
      final financingOther =
          _sumValues(financingMap) -
          loanActivities -
          ownerContributions -
          distributions;
      final financingTotal =
          loanActivities + ownerContributions + distributions + financingOther;

      monthlyNetIncome[monthKey] = netIncome;
      monthlyDepAmort[monthKey] = depAmort;
      monthlyWorkingCapital[monthKey] = wcChanges;
      monthlyOperatingOther[monthKey] = operatingOther;
      monthlyOperatingTotal[monthKey] = operatingTotal;

      monthlyCapex[monthKey] = capex;
      monthlyInvestingOther[monthKey] = investingOther;
      monthlyInvestingTotal[monthKey] = investingTotal;

      monthlyLoanActivities[monthKey] = loanActivities;
      monthlyOwnerContributions[monthKey] = ownerContributions;
      monthlyDistributions[monthKey] = distributions;
      monthlyFinancingOther[monthKey] = financingOther;
      monthlyFinancingTotal[monthKey] = financingTotal;

      cursor = DateTime(cursor.year, cursor.month + 1, 1);
    }

    final netIncomeByBucket = _aggregateMonthlyToBuckets(
      monthlyNetIncome,
      bucketLabels,
      request.viewType,
    );
    final depByBucket = _aggregateMonthlyToBuckets(
      monthlyDepAmort,
      bucketLabels,
      request.viewType,
    );
    final wcByBucket = _aggregateMonthlyToBuckets(
      monthlyWorkingCapital,
      bucketLabels,
      request.viewType,
    );
    final opOtherByBucket = _aggregateMonthlyToBuckets(
      monthlyOperatingOther,
      bucketLabels,
      request.viewType,
    );
    final opTotalByBucket = _aggregateMonthlyToBuckets(
      monthlyOperatingTotal,
      bucketLabels,
      request.viewType,
    );

    final capexByBucket = _aggregateMonthlyToBuckets(
      monthlyCapex,
      bucketLabels,
      request.viewType,
    );
    final investingOtherByBucket = _aggregateMonthlyToBuckets(
      monthlyInvestingOther,
      bucketLabels,
      request.viewType,
    );
    final investingTotalByBucket = _aggregateMonthlyToBuckets(
      monthlyInvestingTotal,
      bucketLabels,
      request.viewType,
    );

    final loanByBucket = _aggregateMonthlyToBuckets(
      monthlyLoanActivities,
      bucketLabels,
      request.viewType,
    );
    final contribByBucket = _aggregateMonthlyToBuckets(
      monthlyOwnerContributions,
      bucketLabels,
      request.viewType,
    );
    final distributionsByBucket = _aggregateMonthlyToBuckets(
      monthlyDistributions,
      bucketLabels,
      request.viewType,
    );
    final finOtherByBucket = _aggregateMonthlyToBuckets(
      monthlyFinancingOther,
      bucketLabels,
      request.viewType,
    );
    final financingTotalByBucket = _aggregateMonthlyToBuckets(
      monthlyFinancingTotal,
      bucketLabels,
      request.viewType,
    );

    final netIncomeSeries = _valuesFromBuckets(netIncomeByBucket, bucketLabels);
    final depSeries = _valuesFromBuckets(depByBucket, bucketLabels);
    final wcSeries = _valuesFromBuckets(wcByBucket, bucketLabels);
    final opOtherSeries = _valuesFromBuckets(opOtherByBucket, bucketLabels);
    final capexSeries = _valuesFromBuckets(capexByBucket, bucketLabels);
    final investingOtherSeries = _valuesFromBuckets(
      investingOtherByBucket,
      bucketLabels,
    );
    final loanSeries = _valuesFromBuckets(loanByBucket, bucketLabels);
    final contributionSeries = _valuesFromBuckets(
      contribByBucket,
      bucketLabels,
    );
    final distributionsSeries = _valuesFromBuckets(
      distributionsByBucket,
      bucketLabels,
    );
    final financingOtherSeries = _valuesFromBuckets(
      finOtherByBucket,
      bucketLabels,
    );

    List<double> recomputeTotalSeries(List<List<double>> parts) {
      return List<double>.generate(
        bucketLabels.length,
        (i) => parts.fold<double>(0.0, (sum, p) => sum + p[i]),
      );
    }

    void alignSectionToDashboardTotal(
      List<double> sectionTotal,
      List<double> adjustableComponent,
      double targetTotal,
    ) {
      if (sectionTotal.isEmpty || adjustableComponent.isEmpty) return;
      final current = sectionTotal.fold<double>(0.0, (a, b) => a + b);
      final delta = targetTotal - current;
      if (delta.abs() < 0.000001) return;
      final lastIdx = sectionTotal.length - 1;
      sectionTotal[lastIdx] += delta;
      adjustableComponent[lastIdx] += delta;
    }

    var opTotalSeries = recomputeTotalSeries([
      netIncomeSeries,
      depSeries,
      wcSeries,
      opOtherSeries,
    ]);
    var investingTotalSeries = recomputeTotalSeries([
      capexSeries,
      investingOtherSeries,
    ]);
    var financingTotalSeries = recomputeTotalSeries([
      loanSeries,
      contributionSeries,
      distributionsSeries,
      financingOtherSeries,
    ]);

    // Keep exported totals exactly in sync with dashboard cards.
    alignSectionToDashboardTotal(
      opTotalSeries,
      opOtherSeries,
      controller.operatingCashFlow.value,
    );
    alignSectionToDashboardTotal(
      investingTotalSeries,
      investingOtherSeries,
      controller.investingCashFlow.value,
    );
    alignSectionToDashboardTotal(
      financingTotalSeries,
      financingOtherSeries,
      controller.financingCashFlow.value,
    );

    var netChangeSeries = List<double>.generate(
      bucketLabels.length,
      (i) =>
          opTotalSeries[i] + investingTotalSeries[i] + financingTotalSeries[i],
    );
    alignSectionToDashboardTotal(
      netChangeSeries,
      financingOtherSeries,
      controller.netChangeInCash.value,
    );

    final beginningCashSeries = <double>[];
    final endingCashSeries = <double>[];
    var runningCash = controller.beginningCashBalance.value;
    for (var i = 0; i < netChangeSeries.length; i++) {
      beginningCashSeries.add(runningCash);
      runningCash += netChangeSeries[i];
      endingCashSeries.add(runningCash);
    }

    return CashFlowPdfData(
      sections: [
        CashFlowPdfSectionData(
          title: 'Operating Activities',
          rows: [
            CashFlowPdfRowData(label: 'Net income', values: netIncomeSeries),
            CashFlowPdfRowData(
              label: 'Depreciation & amortization',
              values: depSeries,
            ),
            CashFlowPdfRowData(
              label: 'Working capital changes',
              values: wcSeries,
            ),
            CashFlowPdfRowData(
              label: 'Other operating adjustments',
              values: opOtherSeries,
            ),
            CashFlowPdfRowData(
              label: 'Net Cash from Operating Activities (A)',
              values: opTotalSeries,
              isTotal: true,
              periodTotalOverride: controller.operatingCashFlow.value,
            ),
          ],
        ),
        CashFlowPdfSectionData(
          title: 'Investing Activities',
          rows: [
            CashFlowPdfRowData(
              label: 'Asset purchases / CapEx',
              values: capexSeries,
            ),
            CashFlowPdfRowData(
              label: 'Other investing activities',
              values: investingOtherSeries,
            ),
            CashFlowPdfRowData(
              label: 'Net Cash from Investing Activities (B)',
              values: investingTotalSeries,
              isTotal: true,
              periodTotalOverride: controller.investingCashFlow.value,
            ),
          ],
        ),
        CashFlowPdfSectionData(
          title: 'Financing Activities',
          rows: [
            CashFlowPdfRowData(label: 'Loan activities', values: loanSeries),
            CashFlowPdfRowData(
              label: 'Owner contributions',
              values: contributionSeries,
            ),
            CashFlowPdfRowData(
              label: 'Distributions',
              values: distributionsSeries,
            ),
            CashFlowPdfRowData(
              label: 'Other financing activities',
              values: financingOtherSeries,
            ),
            CashFlowPdfRowData(
              label: 'Net Cash from Financing Activities (C)',
              values: financingTotalSeries,
              isTotal: true,
              periodTotalOverride: controller.financingCashFlow.value,
            ),
          ],
        ),
      ],
      netChange: netChangeSeries,
      beginningCash: beginningCashSeries,
      endingCash: endingCashSeries,
      operatingTotal: controller.operatingCashFlow.value,
      investingTotal: controller.investingCashFlow.value,
      financingTotal: controller.financingCashFlow.value,
      netChangeTotal: controller.netChangeInCash.value,
      beginningCashTotal: controller.beginningCashBalance.value,
      endingCashTotal: controller.endingCashBalance.value,
    );
  }

  Map<String, double> _aggregateMonthlyToBuckets(
    Map<String, double> monthlyData,
    List<String> bucketLabels,
    PdfViewType viewType,
  ) {
    final aggregated = <String, double>{
      for (final label in bucketLabels) label: 0.0,
    };
    monthlyData.forEach((monthKey, value) {
      final DateTime month = DateFormat('yyyy-MM').parse(monthKey);
      final label = _bucketLabelForMonth(month, viewType);
      if (aggregated.containsKey(label)) {
        aggregated[label] = (aggregated[label] ?? 0) + value;
      }
    });
    return aggregated;
  }

  String _bucketLabelForMonth(DateTime month, PdfViewType viewType) {
    switch (viewType) {
      case PdfViewType.monthly:
        return DateFormat('MMM yyyy').format(month);
      case PdfViewType.quarterly:
        final q = ((month.month - 1) ~/ 3) + 1;
        return 'Q$q ${month.year}';
      case PdfViewType.yearly:
        return month.year.toString();
    }
  }

  List<double> _valuesFromBuckets(
    Map<String, double> bucketMap,
    List<String> orderedLabels,
  ) {
    return orderedLabels.map((label) => bucketMap[label] ?? 0.0).toList();
  }

  double _sumValues(Map<String, double> values) {
    return values.values.fold<double>(0.0, (sum, v) => sum + v);
  }

  double _sumByKeywords(Map<String, double> values, List<String> keywords) {
    var sum = 0.0;
    values.forEach((key, value) {
      final lower = key.toLowerCase();
      final matched = keywords.any((kw) => lower.contains(kw));
      if (matched) {
        sum += value;
      }
    });
    return sum;
  }

  void _exportExcel(
    FinancialReportController controller, {
    PdfExportRequest? request,
  }) async {
    try {
      final org = getCurrentOrganization;
      if (org == null) {
        showSnackBar('Please select an organization.', isError: true);
        return;
      }

      final now = DateTime.now();
      final DateTime defaultYtdStart = DateTime(now.year, 1, 1);
      final DateTime selectedStart = _startDate != null
          ? DateTime(_startDate!.year, _startDate!.month, _startDate!.day)
          : defaultYtdStart;
      final DateTime selectedEnd = _endDate != null
          ? DateTime(_endDate!.year, _endDate!.month, _endDate!.day)
          : DateTime(now.year, now.month, now.day);
      final DateTime reportStart = selectedEnd.isBefore(selectedStart)
          ? selectedEnd
          : selectedStart;
      final DateTime reportEnd = selectedEnd.isBefore(selectedStart)
          ? selectedStart
          : selectedEnd;
      final String orgName = org.name ?? 'Organization';
      DateTime nextDay(DateTime d) => DateTime(d.year, d.month, d.day + 1);
      String sqlDateLocal(DateTime d) {
        final x = DateTime(d.year, d.month, d.day);
        final mm = x.month.toString().padLeft(2, '0');
        final dd = x.day.toString().padLeft(2, '0');
        return '${x.year}-$mm-$dd';
      }

      String cleanTitle(String raw) {
        return raw.replaceAll(RegExp(r'\[[^\]]+\]'), '').trim();
      }

      List<String> extractTags(String title) {
        return RegExp(r'\[([^\]]+)\]')
            .allMatches(title)
            .map((m) => m.group(1)?.trim() ?? '')
            .where((x) => x.isNotEmpty)
            .toList();
      }

      String classifyFlowSection(String titleLower) {
        if (titleLower.contains('[cf:manual:operating]') ||
            titleLower.contains('[cf:manual:other]')) {
          return 'Operating';
        }
        if (titleLower.contains('[cf:manual:investing]') ||
            titleLower.contains('[cf:invest:other]') ||
            titleLower.contains('other investing')) {
          return 'Investing';
        }
        if (titleLower.contains('[cf:manual:financing]')) {
          return 'Financing';
        }
        if (titleLower.contains('[cf:investing]') ||
            titleLower.contains('asset purchase') ||
            titleLower.contains('equipment') ||
            titleLower.contains('property') ||
            titleLower.contains('investment')) {
          return 'Investing';
        }
        if (titleLower.contains('[cf:financing]') ||
            titleLower.contains('loan') ||
            titleLower.contains('debt') ||
            titleLower.contains('contribution') ||
            titleLower.contains('dividend') ||
            titleLower.contains('share capital') ||
            titleLower.contains('capital repayment')) {
          return 'Financing';
        }
        return 'Operating';
      }

      final totalMonths =
          (reportEnd.year - reportStart.year) * 12 +
          reportEnd.month -
          reportStart.month +
          1;
      final PdfViewType viewType =
          request?.viewType ??
          (_selectedFilterIdx == 4
              ? PdfViewType.yearly
              : (totalMonths <= 5
                    ? PdfViewType.monthly
                    : PdfViewType.quarterly));
      final pdfRequest = PdfExportRequest(
        startDate: reportStart,
        endDate: reportEnd,
        viewType: viewType,
        templateVariant: PdfTemplateVariant.templateA,
        companyName: orgName,
        companyAddress: '',
      );
      final liveData = await _buildCashFlowPdfData(controller, pdfRequest);
      final bucketLabels = PdfExportService().buildBucketLabels(
        reportStart,
        reportEnd,
        viewType,
      );
      final keys = List<String>.generate(bucketLabels.length, (i) => 'b$i');
      final Map<String, String> keyToLabel = {
        for (int i = 0; i < keys.length; i++) keys[i]: bucketLabels[i],
      };

      List<double> seriesFor(String sectionTitle, String rowLabel) {
        for (final section in liveData.sections) {
          if (section.title != sectionTitle) continue;
          for (final row in section.rows) {
            if (row.label == rowLabel) return row.values;
          }
        }
        return List<double>.filled(bucketLabels.length, 0);
      }

      Map<String, double> mapFromSeries(List<double> values) {
        return {for (int i = 0; i < keys.length; i++) keys[i]: values[i]};
      }

      final netIncomeMap = mapFromSeries(
        seriesFor('Operating Activities', 'Net income'),
      );
      final depAmortMap = mapFromSeries(
        seriesFor('Operating Activities', 'Depreciation & amortization'),
      );
      final wcMap = mapFromSeries(
        seriesFor('Operating Activities', 'Working capital changes'),
      );
      final opOtherMap = mapFromSeries(
        seriesFor('Operating Activities', 'Other operating adjustments'),
      );
      final operatingMap = mapFromSeries(
        seriesFor(
          'Operating Activities',
          'Net Cash from Operating Activities (A)',
        ),
      );
      final investingMap = mapFromSeries(
        seriesFor(
          'Investing Activities',
          'Net Cash from Investing Activities (B)',
        ),
      );
      final financingMap = mapFromSeries(
        seriesFor(
          'Financing Activities',
          'Net Cash from Financing Activities (C)',
        ),
      );
      final netChangeMap = mapFromSeries(liveData.netChange);
      final beginningCashMap = mapFromSeries(liveData.beginningCash);
      final endingCashMap = mapFromSeries(liveData.endingCash);

      final adjustmentsMap = {
        for (final k in keys) k: (depAmortMap[k] ?? 0) + (opOtherMap[k] ?? 0),
      };
      double periodTotal(Map<String, double> values) =>
          keys.fold<double>(0.0, (sum, key) => sum + (values[key] ?? 0.0));

      void alignPeriodTotal(Map<String, double> values, double targetTotal) {
        if (keys.isEmpty) return;
        final currentTotal = periodTotal(values);
        final delta = targetTotal - currentTotal;
        final lastKey = keys.last;
        values[lastKey] = (values[lastKey] ?? 0.0) + delta;
      }

      // Keep export period totals aligned with dashboard/controller totals.
      alignPeriodTotal(netIncomeMap, controller.netIncome.value);
      alignPeriodTotal(adjustmentsMap, controller.operatingAdjustments.value);
      alignPeriodTotal(wcMap, controller.workingCapitalChanges.value);
      alignPeriodTotal(operatingMap, controller.operatingCashFlow.value);
      alignPeriodTotal(investingMap, controller.investingCashFlow.value);
      alignPeriodTotal(financingMap, controller.financingCashFlow.value);
      alignPeriodTotal(netChangeMap, controller.netChangeInCash.value);

      List<List<String>> buildBucketMonthKeys() {
        String monthKey(DateTime d) =>
            DateFormat('yyyy-MM').format(DateTime(d.year, d.month, 1));
        switch (viewType) {
          case PdfViewType.monthly:
            final out = <List<String>>[];
            var cursor = DateTime(reportStart.year, reportStart.month, 1);
            final last = DateTime(reportEnd.year, reportEnd.month, 1);
            while (!cursor.isAfter(last)) {
              out.add([monthKey(cursor)]);
              cursor = DateTime(cursor.year, cursor.month + 1, 1);
            }
            return out;
          case PdfViewType.quarterly:
            final out = <List<String>>[];
            var cursor = DateTime(
              reportStart.year,
              (((reportStart.month - 1) ~/ 3) * 3) + 1,
              1,
            );
            while (!cursor.isAfter(reportEnd)) {
              out.add([
                monthKey(cursor),
                monthKey(DateTime(cursor.year, cursor.month + 1, 1)),
                monthKey(DateTime(cursor.year, cursor.month + 2, 1)),
              ]);
              cursor = DateTime(cursor.year, cursor.month + 3, 1);
            }
            return out;
          case PdfViewType.yearly:
            return [
              for (int y = reportStart.year; y <= reportEnd.year; y++)
                [for (int m = 1; m <= 12; m++) monthKey(DateTime(y, m, 1))],
            ];
        }
      }

      final bucketMonthKeys = buildBucketMonthKeys();

      Map<String, double> zeroMap() => {for (final k in keys) k: 0.0};

      Map<String, double> addMaps(List<Map<String, double>> maps) {
        final out = zeroMap();
        for (final m in maps) {
          for (final k in keys) {
            out[k] = (out[k] ?? 0.0) + (m[k] ?? 0.0);
          }
        }
        return out;
      }

      Map<String, double> subtractMap(
        Map<String, double> a,
        Map<String, double> b,
      ) {
        final out = zeroMap();
        for (final k in keys) {
          out[k] = (a[k] ?? 0.0) - (b[k] ?? 0.0);
        }
        return out;
      }

      Map<String, double> bucketizeByKeywords(
        Map<String, Map<String, double>> periodic,
        List<String> keywords,
      ) {
        final out = zeroMap();
        for (int i = 0; i < keys.length; i++) {
          double total = 0;
          for (final mk in bucketMonthKeys[i]) {
            final rows = periodic[mk];
            if (rows == null) continue;
            for (final entry in rows.entries) {
              final key = entry.key.toLowerCase();
              if (keywords.any((kw) => key.contains(kw))) {
                total += entry.value;
              }
            }
          }
          out[keys[i]] = total;
        }
        return out;
      }

      final receivableMap = bucketizeByKeywords(
        controller.periodicOperatingActivities,
        const ['receivable'],
      );
      final inventoryMap = bucketizeByKeywords(
        controller.periodicOperatingActivities,
        const ['inventory'],
      );
      final accountsPayableMap = bucketizeByKeywords(
        controller.periodicOperatingActivities,
        const ['payable'],
      );
      final unearnedRevenueMap = bucketizeByKeywords(
        controller.periodicOperatingActivities,
        const ['unearned', 'deferred revenue'],
      );
      final incomeTaxesMap = bucketizeByKeywords(
        controller.periodicOperatingActivities,
        const ['income tax'],
      );
      final otherCurrentLiabilitiesMap = bucketizeByKeywords(
        controller.periodicOperatingActivities,
        const ['accrued', 'current liabilities'],
      );
      final otherLongTermLiabilitiesMap = bucketizeByKeywords(
        controller.periodicOperatingActivities,
        const ['long-term liabilities', 'long term liabilities'],
      );
      final dividendsOperatingMap = bucketizeByKeywords(
        controller.periodicOperatingActivities,
        const ['dividend', 'dividends'],
      );
      final workingCapitalKnown = addMaps([
        receivableMap,
        inventoryMap,
        accountsPayableMap,
        unearnedRevenueMap,
        incomeTaxesMap,
        otherCurrentLiabilitiesMap,
        otherLongTermLiabilitiesMap,
        dividendsOperatingMap,
      ]);
      final workingCapitalOtherMap = subtractMap(wcMap, workingCapitalKnown);

      final proceedsSaleMap = bucketizeByKeywords(
        controller.periodicInvestingActivities,
        const ['proceeds', 'sale'],
      );
      final ppePurchasesMap = bucketizeByKeywords(
        controller.periodicInvestingActivities,
        const ['property', 'plant', 'equipment', 'asset purchase', 'capex'],
      );
      final intangiblePurchasesMap = bucketizeByKeywords(
        controller.periodicInvestingActivities,
        const ['intangible'],
      );
      final investingKnown = addMaps([
        proceedsSaleMap,
        ppePurchasesMap,
        intangiblePurchasesMap,
      ]);
      final investingOtherTemplateMap = subtractMap(
        investingMap,
        investingKnown,
      );

      final issueShareCapitalMap = bucketizeByKeywords(
        controller.periodicFinancingActivities,
        const ['issue of share', 'share capital'],
      );
      final stockIssuanceMap = bucketizeByKeywords(
        controller.periodicFinancingActivities,
        const [
          'stock issuance',
          'stock issued',
          'equity issuance',
          'contribution',
        ],
      );
      final interestPaidMap = bucketizeByKeywords(
        controller.periodicFinancingActivities,
        const ['interest paid', 'interest'],
      );
      final capitalRepaymentsMap =
          bucketizeByKeywords(controller.periodicFinancingActivities, const [
            'capital repayment',
            'buy-back',
            'share buy',
            'debt repayment',
            'principal repayment',
          ]);
      final loanPaidMap = bucketizeByKeywords(
        controller.periodicFinancingActivities,
        const ['loan paid', 'loan repayment', 'principal'],
      );
      final dividendsFinancingMap = bucketizeByKeywords(
        controller.periodicFinancingActivities,
        const ['dividend', 'dividends'],
      );
      final financingKnown = addMaps([
        issueShareCapitalMap,
        stockIssuanceMap,
        interestPaidMap,
        capitalRepaymentsMap,
        loanPaidMap,
        dividendsFinancingMap,
      ]);
      final financingOtherTemplateMap = subtractMap(
        financingMap,
        financingKnown,
      );

      final excel = excel_lib.Excel.createExcel();
      final sheet = excel['Cash Flow Statement'];
      final existingSheets = List<String>.from(excel.tables.keys);
      for (final name in existingSheets) {
        if (name != 'Cash Flow Statement') {
          excel.delete(name);
        }
      }

      final int labelCol = 0;
      final int firstSymbolCol = 1;
      int symbolCol(int index) => firstSymbolCol + (index * 2);
      int amountCol(int index) => symbolCol(index) + 1;
      final int lastAmountCol = amountCol(keys.length - 1);

      final displayLabels = (() {
        final years = bucketLabels
            .map(
              (label) =>
                  RegExp(r'(19|20)\d{2}').firstMatch(label)?.group(0) ?? label,
            )
            .toList();
        return years.toSet().length == years.length ? years : bucketLabels;
      })();

      final titleStyle = excel_lib.CellStyle(
        bold: true,
        fontSize: 17,
        horizontalAlign: excel_lib.HorizontalAlign.Right,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final metaStyle = excel_lib.CellStyle(
        fontSize: 8,
        horizontalAlign: excel_lib.HorizontalAlign.Right,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final companyStyle = excel_lib.CellStyle(
        bold: true,
        fontSize: 13,
        horizontalAlign: excel_lib.HorizontalAlign.Left,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final companyMetaStyle = excel_lib.CellStyle(
        fontSize: 8,
        horizontalAlign: excel_lib.HorizontalAlign.Left,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final headerBlueStyle = excel_lib.CellStyle(
        bold: true,
        fontSize: 9,
        fontColorHex: excel_lib.ExcelColor.fromHexString('FFFFFFFF'),
        backgroundColorHex: excel_lib.ExcelColor.fromHexString('FF7A94B3'),
        horizontalAlign: excel_lib.HorizontalAlign.Right,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );

      /// Section banner label (Operating / Investing / Financing) — left-aligned in column A.
      final headerBlueLabelStyle = excel_lib.CellStyle(
        bold: true,
        fontSize: 9,
        fontColorHex: excel_lib.ExcelColor.fromHexString('FFFFFFFF'),
        backgroundColorHex: excel_lib.ExcelColor.fromHexString('FF7A94B3'),
        horizontalAlign: excel_lib.HorizontalAlign.Left,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final sectionLabelStyle = excel_lib.CellStyle(
        bold: true,
        fontSize: 9,
        horizontalAlign: excel_lib.HorizontalAlign.Left,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final lineLabelStyle = excel_lib.CellStyle(
        fontSize: 8,
        horizontalAlign: excel_lib.HorizontalAlign.Left,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final totalLabelStyle = excel_lib.CellStyle(
        bold: true,
        fontSize: 9,
        backgroundColorHex: excel_lib.ExcelColor.fromHexString('FFF4F7FC'),
        horizontalAlign: excel_lib.HorizontalAlign.Left,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final cashBandLabelStyle = excel_lib.CellStyle(
        bold: true,
        fontSize: 9,
        backgroundColorHex: excel_lib.ExcelColor.fromHexString('FF7A94B3'),
        fontColorHex: excel_lib.ExcelColor.fromHexString('FFFFFFFF'),
        horizontalAlign: excel_lib.HorizontalAlign.Left,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final dollarStyle = excel_lib.CellStyle(
        fontSize: 8,
        horizontalAlign: excel_lib.HorizontalAlign.Center,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final amountStyle = excel_lib.CellStyle(
        fontSize: 8,
        numberFormat: const excel_lib.CustomNumericNumFormat(
          formatCode: r'#,##0.00;[Red](#,##0.00);"-"',
        ),
        horizontalAlign: excel_lib.HorizontalAlign.Right,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final totalDollarStyle = dollarStyle.copyWith(
        boldVal: true,
        backgroundColorHexVal: excel_lib.ExcelColor.fromHexString('FFF4F7FC'),
      );
      final totalAmountStyle = amountStyle.copyWith(
        boldVal: true,
        backgroundColorHexVal: excel_lib.ExcelColor.fromHexString('FFF4F7FC'),
      );
      final totalDarkLabelStyle = excel_lib.CellStyle(
        bold: true,
        fontSize: 9,
        backgroundColorHex: excel_lib.ExcelColor.fromHexString('FFDCDCDC'),
        horizontalAlign: excel_lib.HorizontalAlign.Left,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final totalDarkDollarStyle = dollarStyle.copyWith(
        boldVal: true,
        backgroundColorHexVal: excel_lib.ExcelColor.fromHexString('FFDCDCDC'),
      );
      final totalDarkAmountStyle = amountStyle.copyWith(
        boldVal: true,
        backgroundColorHexVal: excel_lib.ExcelColor.fromHexString('FFDCDCDC'),
      );
      final cashBandDollarStyle = dollarStyle.copyWith(
        boldVal: true,
        backgroundColorHexVal: excel_lib.ExcelColor.fromHexString('FF7A94B3'),
        fontColorHexVal: excel_lib.ExcelColor.fromHexString('FFFFFFFF'),
      );
      final cashBandAmountStyle = amountStyle.copyWith(
        boldVal: true,
        backgroundColorHexVal: excel_lib.ExcelColor.fromHexString('FF7A94B3'),
        fontColorHexVal: excel_lib.ExcelColor.fromHexString('FFFFFFFF'),
      );
      final dividerStyle = excel_lib.CellStyle(
        backgroundColorHex: excel_lib.ExcelColor.fromHexString('FFE1E6ED'),
      );

      void setCell(
        int c,
        int r,
        excel_lib.CellValue v, [
        excel_lib.CellStyle? style,
      ]) {
        final cell = sheet.cell(
          excel_lib.CellIndex.indexByColumnRow(columnIndex: c, rowIndex: r),
        );
        cell.value = v;
        if (style != null) cell.cellStyle = style;
      }

      sheet.setColumnWidth(labelCol, 46);
      for (int i = 0; i < keys.length; i++) {
        sheet.setColumnWidth(symbolCol(i), 4.2);
        sheet.setColumnWidth(amountCol(i), 16);
      }
      sheet.setRowHeight(1, 24);
      sheet.setRowHeight(2, 14);
      sheet.setRowHeight(3, 14);
      sheet.setRowHeight(6, 18);

      final titleStartCol = keys.length >= 3
          ? symbolCol(keys.length - 3)
          : firstSymbolCol;
      final titleEndCol = lastAmountCol;
      final streetLine = (org.street ?? '').trim();
      final cityStateZipLine = [
        (org.city ?? '').trim(),
        (org.primaryState ?? '').trim(),
        (org.zip ?? '').trim(),
      ].where((e) => e.isNotEmpty).join(', ');

      setCell(labelCol, 1, excel_lib.TextCellValue(orgName), companyStyle);
      setCell(
        labelCol,
        2,
        excel_lib.TextCellValue(streetLine),
        companyMetaStyle,
      );
      setCell(
        labelCol,
        3,
        excel_lib.TextCellValue(cityStateZipLine),
        companyMetaStyle,
      );

      setCell(
        titleStartCol,
        1,
        excel_lib.TextCellValue('Cash Flow Statement'),
        titleStyle,
      );
      sheet.merge(
        excel_lib.CellIndex.indexByColumnRow(
          columnIndex: titleStartCol,
          rowIndex: 1,
        ),
        excel_lib.CellIndex.indexByColumnRow(
          columnIndex: titleEndCol,
          rowIndex: 1,
        ),
      );
      sheet.setMergedCellStyle(
        excel_lib.CellIndex.indexByColumnRow(
          columnIndex: titleStartCol,
          rowIndex: 1,
        ),
        titleStyle,
      );

      setCell(
        titleStartCol,
        2,
        excel_lib.TextCellValue(
          'Date Prepared: ${DateFormat('MM/dd/yyyy').format(DateTime.now())}',
        ),
        metaStyle,
      );
      sheet.merge(
        excel_lib.CellIndex.indexByColumnRow(
          columnIndex: titleStartCol,
          rowIndex: 2,
        ),
        excel_lib.CellIndex.indexByColumnRow(
          columnIndex: titleEndCol,
          rowIndex: 2,
        ),
      );
      sheet.setMergedCellStyle(
        excel_lib.CellIndex.indexByColumnRow(
          columnIndex: titleStartCol,
          rowIndex: 2,
        ),
        metaStyle,
      );

      setCell(
        titleStartCol,
        3,
        excel_lib.TextCellValue(
          'As of ${DateFormat('MMMM dd, yyyy').format(reportEnd)}',
        ),
        metaStyle,
      );
      sheet.merge(
        excel_lib.CellIndex.indexByColumnRow(
          columnIndex: titleStartCol,
          rowIndex: 3,
        ),
        excel_lib.CellIndex.indexByColumnRow(
          columnIndex: titleEndCol,
          rowIndex: 3,
        ),
      );
      sheet.setMergedCellStyle(
        excel_lib.CellIndex.indexByColumnRow(
          columnIndex: titleStartCol,
          rowIndex: 3,
        ),
        metaStyle,
      );

      for (int c = firstSymbolCol; c <= lastAmountCol; c++) {
        setCell(c, 5, excel_lib.TextCellValue(' '), dividerStyle);
      }
      sheet.setRowHeight(5, 2.5);

      int row = 6;
      void writePeriodHeader(String title, {bool includePeriods = true}) {
        setCell(
          labelCol,
          row,
          excel_lib.TextCellValue(title),
          headerBlueLabelStyle,
        );
        for (int i = 0; i < keys.length; i++) {
          setCell(
            amountCol(i),
            row,
            excel_lib.TextCellValue(includePeriods ? displayLabels[i] : ' '),
            headerBlueStyle,
          );
          sheet.merge(
            excel_lib.CellIndex.indexByColumnRow(
              columnIndex: symbolCol(i),
              rowIndex: row,
            ),
            excel_lib.CellIndex.indexByColumnRow(
              columnIndex: amountCol(i),
              rowIndex: row,
            ),
          );
          sheet.setMergedCellStyle(
            excel_lib.CellIndex.indexByColumnRow(
              columnIndex: symbolCol(i),
              rowIndex: row,
            ),
            headerBlueStyle,
          );
        }
        sheet.setRowHeight(row, 18);
        row++;
      }

      const cfSubIndent = '            ';

      void writeLineLabel(
        String label, {
        bool indent = false,
        bool bold = false,
        bool total = false,
        bool cashBand = false,
      }) {
        setCell(
          labelCol,
          row,
          excel_lib.TextCellValue(indent ? '$cfSubIndent$label' : label),
          cashBand
              ? cashBandLabelStyle
              : (total
                    ? totalLabelStyle
                    : (bold ? sectionLabelStyle : lineLabelStyle)),
        );
      }

      void writeValueCells(
        Map<String, double> values, {
        bool total = false,
        bool cashBand = false,
        bool darkTotal = false,
      }) {
        for (int i = 0; i < keys.length; i++) {
          final String k = keys[i];
          final double v = values[k] ?? 0.0;
          final bool isDetail = !total && !cashBand && !darkTotal;
          final bool emptyDetail =
              isDetail && (!values.containsKey(k) || v.abs() < 1e-12);
          final symbolStyle = cashBand
              ? cashBandDollarStyle
              : (darkTotal
                    ? totalDarkDollarStyle
                    : (total ? totalDollarStyle : dollarStyle));
          final valueStyle = cashBand
              ? cashBandAmountStyle
              : (darkTotal
                    ? totalDarkAmountStyle
                    : (total ? totalAmountStyle : amountStyle));
          if (emptyDetail) {
            setCell(
              symbolCol(i),
              row,
              excel_lib.TextCellValue(''),
              symbolStyle,
            );
            setCell(
              amountCol(i),
              row,
              excel_lib.TextCellValue(''),
              excel_lib.CellStyle(
                fontSize: 8,
                horizontalAlign: excel_lib.HorizontalAlign.Right,
                verticalAlign: excel_lib.VerticalAlign.Center,
              ),
            );
            continue;
          }
          setCell(
            symbolCol(i),
            row,
            excel_lib.TextCellValue('\$'),
            symbolStyle,
          );
          setCell(amountCol(i), row, excel_lib.DoubleCellValue(v), valueStyle);
        }
      }

      void writeRow(
        String label,
        Map<String, double> values, {
        bool indent = false,
        bool total = false,
        bool section = false,
        bool cashBand = false,
        bool darkTotal = false,
      }) {
        writeLineLabel(
          label,
          indent: indent,
          bold: section,
          total: darkTotal ? false : total,
          cashBand: cashBand,
        );
        if (darkTotal) {
          setCell(
            labelCol,
            row,
            excel_lib.TextCellValue(indent ? '$cfSubIndent$label' : label),
            totalDarkLabelStyle,
          );
        }
        writeValueCells(
          values,
          total: total,
          cashBand: cashBand,
          darkTotal: darkTotal,
        );
        sheet.setRowHeight(row, total || cashBand ? 18 : 16);
        row++;
      }

      void writeSectionSpacer() {
        setCell(labelCol, row, excel_lib.TextCellValue(' '), dividerStyle);
        for (int i = 0; i < keys.length; i++) {
          setCell(
            symbolCol(i),
            row,
            excel_lib.TextCellValue(' '),
            dividerStyle,
          );
          setCell(
            amountCol(i),
            row,
            excel_lib.TextCellValue(' '),
            dividerStyle,
          );
        }
        sheet.setRowHeight(row, 7);
        row++;
      }

      writePeriodHeader('Operating Activities', includePeriods: true);
      writeRow('Net income', netIncomeMap, indent: true);
      writeRow('Adjustments for Non-Cash Items', zeroMap(), indent: true);
      writeRow('Depreciation', depAmortMap, indent: true);
      writeRow('Amortization', zeroMap(), indent: true);
      writeRow('Goodwill/Intangible Impairment', zeroMap(), indent: true);
      writeRow('Deferred Income Tax', zeroMap(), indent: true);
      writeRow('Changes in Working Capital:', zeroMap(), indent: true);
      writeRow('Accounts Receivable', receivableMap, indent: true);
      writeRow('Inventory', inventoryMap, indent: true);
      writeRow('Accounts Payable', accountsPayableMap, indent: true);
      writeRow('Unearned Revenue', unearnedRevenueMap, indent: true);
      writeRow('Income taxes', incomeTaxesMap, indent: true);
      writeRow(
        'Other Current Liabilities',
        otherCurrentLiabilitiesMap,
        indent: true,
      );
      writeRow(
        'Other long-term liabilities',
        otherLongTermLiabilitiesMap,
        indent: true,
      );
      writeRow('Dividends', dividendsOperatingMap, indent: true);
      writeRow('Other', workingCapitalOtherMap, indent: true);
      writeRow(
        'Net Cash from Operating Activities',
        operatingMap,
        total: true,
        darkTotal: true,
      );
      writeSectionSpacer();

      writePeriodHeader('Investing Activities', includePeriods: true);
      writeRow(
        'Proceeds from sales of long-term assets',
        proceedsSaleMap,
        indent: true,
      );
      writeRow(
        'Purchases of property, plant and equipment',
        ppePurchasesMap,
        indent: true,
      );
      writeRow(
        'Purchases of intangible assets',
        intangiblePurchasesMap,
        indent: true,
      );
      writeRow('Other', investingOtherTemplateMap, indent: true);
      writeRow(
        'Net Cash from Investing Activities',
        investingMap,
        total: true,
        darkTotal: true,
      );
      writeSectionSpacer();

      writePeriodHeader('Financing Activities', includePeriods: true);
      writeRow('Issue of share capital', issueShareCapitalMap, indent: true);
      writeRow('Stock issuance', stockIssuanceMap, indent: true);
      writeRow('Interest paid', interestPaidMap, indent: true);
      writeRow(
        'Capital repayments (including share buy-backs)',
        capitalRepaymentsMap,
        indent: true,
      );
      writeRow('Loan paid', loanPaidMap, indent: true);
      writeRow('Dividends', dividendsFinancingMap, indent: true);
      writeRow('Other', financingOtherTemplateMap, indent: true);
      writeRow(
        'Net Cash from Financing Activities',
        financingMap,
        total: true,
        darkTotal: true,
      );
      writeSectionSpacer();

      writeRow('Beginning Cash Balance', beginningCashMap, cashBand: true);
      writeRow(
        'Change in Cash & Cash Equivalents',
        netChangeMap,
        cashBand: false,
      );
      writeRow('Ending Cash Balance', endingCashMap, cashBand: true);

      List<int> hideGridLines(List<int> xlsxBytes) {
        try {
          final archive = ZipDecoder().decodeBytes(xlsxBytes, verify: false);
          bool changed = false;
          for (final file in archive.files) {
            if (!file.isFile) continue;
            if (!file.name.startsWith('xl/worksheets/sheet')) continue;
            if (!file.name.endsWith('.xml')) continue;
            final xmlText = utf8.decode(file.content as List<int>);
            final doc = XmlDocument.parse(xmlText);
            final worksheet = doc.rootElement;
            final sheetViews = worksheet.getElement('sheetViews');
            if (sheetViews == null) continue;
            final views = sheetViews.findElements('sheetView');
            if (views.isEmpty) continue;
            views.first.setAttribute('showGridLines', '0');
            final patched = utf8.encode(doc.toXmlString(pretty: false));
            archive.addFile(ArchiveFile(file.name, patched.length, patched));
            changed = true;
          }
          return changed
              ? (ZipEncoder().encode(archive) ?? xlsxBytes)
              : xlsxBytes;
        } catch (_) {
          return xlsxBytes;
        }
      }

      final exportName =
          '${orgName.replaceAll(' ', '_')}_Cash_Flow_Statement_${DateFormat('yyyyMMdd').format(reportEnd)}.xlsx';
      final bytes = excel.encode();
      if (bytes == null) {
        throw Exception('Unable to generate Excel file.');
      }

      final outputBytes = hideGridLines(bytes);
      await downloadFile(
        exportName,
        outputBytes,
        mimeType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    } catch (e, st) {
      dev.log('Excel Export Error: $e\n$st');
      showSnackBar('Please review Excel generation: $e', isError: true);
    }
  }

  // Helper method to update filter and trigger data fetch
  Future<void> _updateFilter(
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
      final yr = year ?? _selectedYear ?? now.year;
      start = DateTime(yr, 1, 1);
      end = yr == now.year ? today : DateTime(yr, 12, 31);
    }

    setState(() {
      _selectedFilterIdx = index;
      if (year != null) _selectedYear = year;
      _startDate = start;
      _endDate = end;
    });

    if (start != null) {
      await controller.fetchAndAggregateData(startDate: start, endDate: end);
    }
  }

  Future<void> _selectCustomRange(FinancialReportController controller) async {
    DateTime? tempStart;
    DateTime? tempEnd;

    await showDialog(
      context: context,
      builder: (context) {
        final isDark = Theme.of(context).brightness == Brightness.dark;
        return Dialog(
          backgroundColor: isDark ? const Color(0xFF0F1E37) : Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
          child: Container(
            padding: const EdgeInsets.all(24),
            width: 400,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                AppText(
                  "Select Date Range",
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Theme.of(context).brightness == Brightness.dark
                      ? Colors.white
                      : Colors.black87,
                ),
                const SizedBox(height: 24),
                SfDateRangePicker(
                  view: DateRangePickerView.month,
                  selectionMode: DateRangePickerSelectionMode.range,
                  headerStyle: DateRangePickerHeaderStyle(
                    textStyle: TextStyle(
                      color: Theme.of(context).brightness == Brightness.dark
                          ? Colors.white
                          : Colors.black87,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  monthCellStyle: DateRangePickerMonthCellStyle(
                    textStyle: TextStyle(
                      color: Theme.of(context).brightness == Brightness.dark
                          ? Colors.white70
                          : Colors.black54,
                    ),
                    todayTextStyle: const TextStyle(color: orangeColor),
                  ),
                  rangeSelectionColor: orangeColor.withValues(alpha: 0.1),
                  startRangeSelectionColor: orangeColor,
                  endRangeSelectionColor: orangeColor,
                  todayHighlightColor: orangeColor,
                  onSelectionChanged:
                      (DateRangePickerSelectionChangedArgs args) {
                        if (args.value is PickerDateRange) {
                          tempStart = args.value.startDate;
                          tempEnd = args.value.endDate;
                        }
                      },
                ),
                const SizedBox(height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: AppText(
                        "Close",
                        color: isDark ? Colors.white38 : Colors.black38,
                      ),
                    ),
                    const SizedBox(width: 12),
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: orangeColor,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      onPressed: () {
                        if (tempStart != null && tempEnd != null) {
                          final ts = tempStart!;
                          final te = tempEnd!;
                          final s = DateTime(ts.year, ts.month, ts.day);
                          final e = DateTime(te.year, te.month, te.day);
                          setState(() {
                            _selectedFilterIdx = 5;
                            _startDate = s;
                            _endDate = e;
                          });
                          controller.fetchAndAggregateData(
                            startDate: s,
                            endDate: e,
                          );
                          Navigator.pop(context);
                        }
                      },
                      child: const AppText(
                        "Select",
                        color: Colors.black,
                        fontWeight: FontWeight.bold,
                      ),
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

  Widget _buildTimeFilter(FinancialReportController controller) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Theme.of(context).brightness == Brightness.dark
            ? Colors.black26
            : Colors.grey.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Wrap(
        spacing: 4,
        runSpacing: 4,
        children: [
          _filterItem(
            "7 Days",
            _selectedFilterIdx == 0,
            () => _updateFilter(0, controller),
          ),
          _filterItem(
            "30 Days",
            _selectedFilterIdx == 1,
            () => _updateFilter(1, controller),
          ),
          _filterItem(
            "3 Months",
            _selectedFilterIdx == 2,
            () => _updateFilter(2, controller),
          ),
          _filterItem(
            "12 Months",
            _selectedFilterIdx == 3,
            () => _updateFilter(3, controller),
          ),
          _buildYearDropdown(controller),
          _filterItem(
            "Custom",
            _selectedFilterIdx == 5,
            () => _selectCustomRange(controller),
          ),
        ],
      ),
    );
  }

  Widget _buildYearDropdown(FinancialReportController controller) {
    final int currentYear = DateTime.now().year;
    final List<int> years = controller.availableYears.isNotEmpty
        ? List<int>.from(controller.availableYears)
        : List.generate(5, (index) => currentYear - index);
    final bool isSelected = _selectedFilterIdx == 4;

    return PopupMenuButton<int>(
      offset: const Offset(0, 40),
      onSelected: (year) => _updateFilter(4, controller, year: year),
      itemBuilder: (context) => years
          .map(
            (y) => PopupMenuItem(
              value: y,
              child: Text(
                '$y',
                style: TextStyle(
                  fontSize: 13,
                  color: Theme.of(context).brightness == Brightness.dark
                      ? Colors.white
                      : Colors.black87,
                  fontFamily: 'Outfit',
                ),
              ), // Standard Text to avoid AppText's auto-formatting
            ),
          )
          .toList(),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected
              ? (Theme.of(context).brightness == Brightness.dark
                    ? orangeColor.withValues(alpha: 0.28)
                    : orangeColor.withValues(alpha: 0.16))
              : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: isSelected
              ? Border.all(color: orangeColor.withValues(alpha: 0.8))
              : null,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              isSelected
                  ? (_selectedYear != null ? '$_selectedYear' : "Yearly")
                  : "Yearly",
              style: TextStyle(
                fontSize: 11,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                color: isSelected
                    ? (Theme.of(context).brightness == Brightness.dark
                          ? Colors.white
                          : Colors.black87)
                    : (Theme.of(context).brightness == Brightness.dark
                          ? Colors.white38
                          : Colors.black45),
                fontFamily: 'Outfit',
              ),
            ),
            const SizedBox(width: 4),
            Icon(
              Icons.keyboard_arrow_down,
              size: 12,
              color: isSelected
                  ? (Theme.of(context).brightness == Brightness.dark
                        ? Colors.white
                        : Colors.black87)
                  : (Theme.of(context).brightness == Brightness.dark
                        ? Colors.white38
                        : Colors.black45),
            ),
          ],
        ),
      ),
    );
  }

  Widget _filterItem(String text, bool isSelected, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected
              ? (Theme.of(context).brightness == Brightness.dark
                    ? const Color(0xFF1E293B)
                    : Colors.black.withValues(alpha: 0.05))
              : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: isSelected
              ? Border.all(
                  color: Theme.of(context).brightness == Brightness.dark
                      ? Colors.white12
                      : Colors.black12,
                )
              : null,
        ),
        child: AppText(
          text,
          fontSize: 11,
          fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
          color: isSelected
              ? (Theme.of(context).brightness == Brightness.dark
                    ? Colors.white
                    : Colors.black87)
              : (Theme.of(context).brightness == Brightness.dark
                    ? Colors.white38
                    : Colors.black45),
        ),
      ),
    );
  }

  double _percentChange(double current, double previous) {
    if (previous.abs() < 0.000001) return 0.0;
    return ((current - previous) / previous.abs()) * 100;
  }

  bool _isComparisonUnavailable(double current, double previous) {
    return previous.abs() < 0.000001 && current.abs() >= 0.000001;
  }

  ({double moneyIn, double moneyOut}) _cashFlowDirectionTotals({
    required double operatingCash,
    required double investingCash,
    required double financingCash,
  }) {
    final sections = <double>[operatingCash, investingCash, financingCash];
    double moneyIn = 0;
    double moneyOut = 0;
    for (final sectionTotal in sections) {
      if (sectionTotal >= 0) {
        moneyIn += sectionTotal;
      } else {
        moneyOut += sectionTotal.abs();
      }
    }
    return (moneyIn: moneyIn, moneyOut: moneyOut);
  }

  double _niceAxisStep(double span) {
    if (span <= 0) return 1000;
    final rough = span / 5;
    final magnitude = pow(10, (log(rough) / ln10).floor()).toDouble();
    final normalized = rough / magnitude;
    final nice = normalized <= 1
        ? 1
        : normalized <= 2
        ? 2
        : normalized <= 5
        ? 5
        : 10;
    return nice * magnitude;
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    const moneyInColor = Color(0xFF19C37D);
    const moneyOutColor = Color(0xFF2B7FFF);
    const netCashColor = Color(0xFFF2C94C);
    final textPrimary = isDark ? Colors.white : Colors.black87;
    final textSecondary = isDark ? Colors.white70 : Colors.black54;
    final backgroundColor = isDark
        ? const Color(0xFF071223)
        : const Color(0xFFF8FAFC);
    final screenWidth = MediaQuery.sizeOf(context).width;
    final isNarrow = screenWidth <= 1024;

    return GetBuilder<FinancialReportController>(
      tag: getCurrentOrganization!.id.toString(),
      builder: (controller) {
        if (controller.isLoading.value &&
            !controller.hasPresentedFinancialData) {
          return const Center(child: CircularProgressIndicator());
        }

        final trendSeries = controller.trendChartSeries;
        final operatingCash = controller.operatingCashFlow.value;
        final investingCash = controller.investingCashFlow.value;
        final financingCash = controller.financingCashFlow.value;
        final unrealizedIn = controller.upcomingReceivables.value;
        final unrealizedOut = controller.upcomingPayables.value;
        final unrealizedNet = unrealizedIn - unrealizedOut;
        final includeUnrealized = !controller.isRealizedView.value;
        final adjustedOperatingCash = includeUnrealized
            ? operatingCash + unrealizedNet
            : operatingCash;
        final statementNetCash =
            adjustedOperatingCash + investingCash + financingCash;
        final topTotals = includeUnrealized
            ? (
                moneyIn: controller.cashInflow.value + unrealizedIn,
                moneyOut: controller.cashOutflow.value + unrealizedOut,
              )
            : _cashFlowDirectionTotals(
                operatingCash: operatingCash,
                investingCash: investingCash,
                financingCash: financingCash,
              );
        final totalIn = topTotals.moneyIn;
        final totalOut = topTotals.moneyOut;
        final netCash = totalIn - totalOut;

        final prevIn = controller.prevPeriodCashInflow.value;
        final prevOut = controller.prevPeriodCashOutflow.value;
        final prevNet = prevIn - prevOut;

        final double incomeChange = _percentChange(totalIn, prevIn);
        final double expensesChange = _percentChange(totalOut, prevOut);
        final double netCashChange = _percentChange(netCash, prevNet);

        return Container(
          color: backgroundColor,
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 🔹 Title & Filter Header
                isNarrow
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          AppText(
                            "Cash Flow",
                            fontSize: 28,
                            fontWeight: FontWeight.w900,
                            color: isDark ? Colors.white : Colors.black87,
                          ),
                          const SizedBox(height: 12),
                          _buildTimeFilter(controller),
                          if (_startDate != null && _endDate != null) ...[
                            const SizedBox(height: 8),
                            AppText(
                              "${DateFormat('MMM dd, yyyy').format(_startDate!)} – ${DateFormat('MMM dd, yyyy').format(_endDate!)}",
                              fontSize: 12,
                              color: isDark ? Colors.white38 : Colors.black45,
                            ),
                          ],
                        ],
                      )
                    : Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              AppText(
                                "Cash Flow",
                                fontSize: 28,
                                fontWeight: FontWeight.w900,
                                color: isDark ? Colors.white : Colors.black87,
                              ),
                              if (_startDate != null && _endDate != null) ...[
                                const SizedBox(height: 4),
                                AppText(
                                  "${DateFormat('MMM dd, yyyy').format(_startDate!)} – ${DateFormat('MMM dd, yyyy').format(_endDate!)}",
                                  fontSize: 12,
                                  color: isDark
                                      ? Colors.white38
                                      : Colors.black45,
                                ),
                              ],
                            ],
                          ),
                          _buildTimeFilter(controller),
                        ],
                      ),
                const SizedBox(height: 16),
                Align(
                  alignment: Alignment.centerRight,
                  child: Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    alignment: WrapAlignment.end,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      PopupMenuButton<String>(
                        offset: const Offset(0, 40),
                        color: isDark ? const Color(0xFF1E293B) : Colors.white,
                        elevation: 8,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        onSelected: (value) {
                          if (value == 'csv') _exportCSV(controller);
                          if (value == 'pdf') {
                            ExportModalWidget.showPdfModal(
                              context: context,
                              companyName:
                                  (getCurrentOrganization?.name ?? '')
                                      .trim()
                                      .isNotEmpty
                                  ? (getCurrentOrganization?.name ?? '').trim()
                                  : 'Booksmart',
                              companyAddress: [
                                (getCurrentOrganization?.street ?? '').trim(),
                                [
                                  (getCurrentOrganization?.city ?? '').trim(),
                                  (getCurrentOrganization?.primaryState ?? '')
                                      .trim(),
                                  (getCurrentOrganization?.zip ?? '').trim(),
                                ].where((e) => e.isNotEmpty).join(', '),
                              ].where((e) => e.isNotEmpty).join('\n'),
                              reportType: ExportPdfReportType.cashFlow,
                              initialStartDate: _startDate,
                              initialEndDate: _endDate,
                              onExport: (request) async {
                                final bool sameRange = _isSameRange(
                                  request.startDate,
                                  request.endDate,
                                );
                                setState(() {
                                  _startDate = request.startDate;
                                  _endDate = request.endDate;
                                });
                                if (!sameRange) {
                                  await controller.fetchAndAggregateData(
                                    startDate: request.startDate,
                                    endDate: request.endDate,
                                  );
                                }
                                final liveData = await _buildCashFlowPdfData(
                                  controller,
                                  request,
                                );
                                await PdfExportService()
                                    .exportCashFlowPresentationPdf(
                                      request,
                                      cashFlowData: liveData,
                                    );
                              },
                            );
                          }
                          if (value == 'excel') {
                            ExportModalWidget.showExcelModal(
                              context: context,
                              companyName:
                                  (getCurrentOrganization?.name ?? '')
                                      .trim()
                                      .isNotEmpty
                                  ? (getCurrentOrganization?.name ?? '').trim()
                                  : 'Booksmart',
                              companyAddress: [
                                (getCurrentOrganization?.street ?? '').trim(),
                                [
                                  (getCurrentOrganization?.city ?? '').trim(),
                                  (getCurrentOrganization?.primaryState ?? '')
                                      .trim(),
                                  (getCurrentOrganization?.zip ?? '').trim(),
                                ].where((e) => e.isNotEmpty).join(', '),
                              ].where((e) => e.isNotEmpty).join('\n'),
                              reportType: ExportPdfReportType.cashFlow,
                              initialStartDate: _startDate,
                              initialEndDate: _endDate,
                              onExport: (request) async {
                                final bool sameRange = _isSameRange(
                                  request.startDate,
                                  request.endDate,
                                );
                                setState(() {
                                  _startDate = request.startDate;
                                  _endDate = request.endDate;
                                });
                                if (!sameRange) {
                                  await controller.fetchAndAggregateData(
                                    startDate: request.startDate,
                                    endDate: request.endDate,
                                  );
                                }
                                _exportExcel(controller, request: request);
                              },
                            );
                          }
                        },
                        itemBuilder: (context) => [
                          PopupMenuItem(
                            value: 'csv',
                            child: AppText(
                              "Export CSV",
                              fontSize: 13,
                              color: isDark ? Colors.white : Colors.black87,
                            ),
                          ),
                          PopupMenuItem<String>(
                            height: 1,
                            padding: EdgeInsets.zero,
                            enabled: false,
                            child: Divider(
                              height: 1,
                              thickness: 0.2,
                              color: isDark ? Colors.white24 : Colors.black12,
                            ),
                          ),
                          PopupMenuItem(
                            value: 'pdf',
                            child: AppText(
                              "Export PDF",
                              fontSize: 13,
                              color: isDark ? Colors.white : Colors.black87,
                            ),
                          ),
                          PopupMenuItem<String>(
                            height: 1,
                            padding: EdgeInsets.zero,
                            enabled: false,
                            child: Divider(
                              height: 1,
                              thickness: 0.2,
                              color: isDark ? Colors.white24 : Colors.black12,
                            ),
                          ),
                          PopupMenuItem(
                            value: 'excel',
                            child: AppText(
                              "Export Excel",
                              fontSize: 13,
                              color: isDark ? Colors.white : Colors.black87,
                            ),
                          ),
                        ],
                        child: Builder(
                          builder: (context) {
                            bool isHovered = false;
                            return StatefulBuilder(
                              builder: (context, setState) {
                                return MouseRegion(
                                  onEnter: (_) =>
                                      setState(() => isHovered = true),
                                  onExit: (_) =>
                                      setState(() => isHovered = false),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 16,
                                      vertical: 10,
                                    ),
                                    decoration: BoxDecoration(
                                      color: isHovered
                                          ? orangeColor.withValues(alpha: 0.1)
                                          : Colors.transparent,
                                      border: Border.all(
                                        color: orangeColor,
                                        width: 1.2,
                                      ),
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: const [
                                        AppText(
                                          "EXPORT",
                                          fontSize: 12,
                                          fontWeight: FontWeight.w600,
                                          color: orangeColor,
                                        ),
                                        SizedBox(width: 6),
                                        Icon(
                                          Icons.keyboard_arrow_down,
                                          size: 16,
                                          color: orangeColor,
                                        ),
                                      ],
                                    ),
                                  ),
                                );
                              },
                            );
                          },
                        ),
                      ),
                      InkWell(
                        onTap: () => showUploadTaxDocumentDialog(type: 'cf'),
                        borderRadius: BorderRadius.circular(12),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 20,
                            vertical: 10,
                          ),
                          decoration: BoxDecoration(
                            border: Border.all(color: orangeColor, width: 1.2),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const AppText(
                            "UPLOAD",
                            color: orangeColor,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      InkWell(
                        onTap: () => _showManualCashFlowDialog(controller),
                        borderRadius: BorderRadius.circular(12),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 20,
                            vertical: 10,
                          ),
                          decoration: BoxDecoration(
                            border: Border.all(color: orangeColor, width: 1.2),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const AppText(
                            "ADJUST CASH FLOW",
                            color: orangeColor,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Obx(
                        () => Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(12),
                            color: isDark
                                ? Colors.white.withValues(alpha: 0.04)
                                : Colors.black.withValues(alpha: 0.02),
                            border: Border.all(
                              color: isDark ? Colors.white12 : Colors.black12,
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              AppText(
                                controller.isRealizedView.value
                                    ? "Showing: paid"
                                    : "Showing: paid + unpaid",
                                fontSize: 11,
                                color: isDark ? Colors.white70 : Colors.black54,
                                disableFormat: true,
                              ),
                              const SizedBox(width: 6),
                              Switch(
                                value: controller.isRealizedView.value,
                                activeColor: orangeColor,
                                onChanged: (v) =>
                                    controller.toggleRealizedView(v),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                LayoutBuilder(
                  builder: (context, constraints) {
                    return isNarrow
                        ? Wrap(
                            spacing: 12,
                            runSpacing: 12,
                            children: [
                              SizedBox(
                                width: screenWidth - 32,
                                child: _premiumKPICard(
                                  title: "Money In",
                                  value: _formatCurrency(totalIn),
                                  change: incomeChange,
                                  comparisonUnavailable:
                                      _isComparisonUnavailable(totalIn, prevIn),
                                  isCurrency: true,
                                  timeframe: _getTimeframeLabel(),
                                  valueColor: moneyInColor,
                                ),
                              ),
                              SizedBox(
                                width: screenWidth - 32,
                                child: _premiumKPICard(
                                  title: "Money Out",
                                  value: _formatCurrency(totalOut),
                                  change: expensesChange,
                                  invertTrendColors: true,
                                  comparisonUnavailable:
                                      _isComparisonUnavailable(
                                        totalOut,
                                        prevOut,
                                      ),
                                  isCurrency: true,
                                  timeframe: _getTimeframeLabel(),
                                  valueColor: isDark
                                      ? Colors.white
                                      : Colors.black87,
                                ),
                              ),
                              SizedBox(
                                width: screenWidth - 32,
                                child: _premiumKPICard(
                                  title: "Net Cash",
                                  value: _formatCurrency(netCash),
                                  change: netCashChange,
                                  comparisonUnavailable:
                                      _isComparisonUnavailable(
                                        netCash,
                                        prevNet,
                                      ),
                                  isCurrency: true,
                                  timeframe: _getTimeframeLabel(),
                                  isNetCash: true,
                                ),
                              ),
                            ],
                          )
                        : IntrinsicHeight(
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Expanded(
                                  child: _premiumKPICard(
                                    title: "Money In",
                                    value: _formatCurrency(totalIn),
                                    change: incomeChange,
                                    comparisonUnavailable:
                                        _isComparisonUnavailable(
                                          totalIn,
                                          prevIn,
                                        ),
                                    isCurrency: true,
                                    timeframe: _getTimeframeLabel(),
                                    valueColor: moneyInColor,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: _premiumKPICard(
                                    title: "Money Out",
                                    value: _formatCurrency(totalOut),
                                    change: expensesChange,
                                    invertTrendColors: true,
                                    comparisonUnavailable:
                                        _isComparisonUnavailable(
                                          totalOut,
                                          prevOut,
                                        ),
                                    isCurrency: true,
                                    timeframe: _getTimeframeLabel(),
                                    valueColor: isDark
                                        ? Colors.white
                                        : Colors.black87,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: _premiumKPICard(
                                    title: "Net Cash",
                                    value: _formatCurrency(netCash),
                                    change: netCashChange,
                                    comparisonUnavailable:
                                        _isComparisonUnavailable(
                                          netCash,
                                          prevNet,
                                        ),
                                    isCurrency: true,
                                    timeframe: _getTimeframeLabel(),
                                    isNetCash: true,
                                  ),
                                ),
                              ],
                            ),
                          );
                  },
                ),
                const SizedBox(height: 24),

                // 🔹 Middle Section: Chart Area
                Container(
                  margin: const EdgeInsets.only(top: 8),
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surface,
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(
                      color: isDark
                          ? Colors.white.withValues(alpha: 0.05)
                          : Colors.black12,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(
                          alpha: isDark ? 0.15 : 0.03,
                        ),
                        blurRadius: 40,
                        offset: const Offset(0, 10),
                      ),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                AppText(
                                  "Cash Flow Trend",
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                  color: isDark ? Colors.white : Colors.black87,
                                ),
                                if (_showNetCash) ...[
                                  const SizedBox(height: 4),
                                  AppText(
                                    controller.isRealizedView.value
                                        ? "Yellow = net cash (paid only). Circles mark each period — not a separate unrealized line."
                                        : "Yellow = net cash including unpaid/projected. Circles mark each period — still one net line, not two.",
                                    fontSize: 10,
                                    fontWeight: FontWeight.w500,
                                    color: isDark
                                        ? Colors.white.withValues(alpha: 0.45)
                                        : Colors.black54,
                                    disableFormat: true,
                                  ),
                                ],
                                const SizedBox(height: 8),
                                Wrap(
                                  spacing: 8,
                                  runSpacing: 6,
                                  crossAxisAlignment: WrapCrossAlignment.center,
                                  children: [
                                    if (_startDate != null &&
                                        _endDate != null &&
                                        controller
                                            .trendGranularityLabel
                                            .isNotEmpty)
                                      Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          AppText(
                                            "${DateFormat('MMM dd, yyyy').format(_startDate!)} – ${DateFormat('MMM dd, yyyy').format(_endDate!)}",
                                            fontSize: 10,
                                            fontWeight: FontWeight.w400,
                                            color: isDark
                                                ? Colors.white38
                                                : Colors.black45,
                                          ),
                                          Container(
                                            width: 1,
                                            height: 12,
                                            margin: const EdgeInsets.symmetric(
                                              horizontal: 8,
                                            ),
                                            color: Colors.white,
                                          ),
                                          AppText(
                                            controller.trendGranularityLabel,
                                            fontSize: 11,
                                            fontWeight: FontWeight.w600,
                                            color: isDark
                                                ? Colors.white38
                                                : Colors.black45,
                                          ),
                                        ],
                                      )
                                    else ...[
                                      if (_startDate != null &&
                                          _endDate != null)
                                        AppText(
                                          "${DateFormat('MMM dd, yyyy').format(_startDate!)} – ${DateFormat('MMM dd, yyyy').format(_endDate!)}",
                                          fontSize: 10,
                                          fontWeight: FontWeight.w400,
                                          color: isDark
                                              ? Colors.white38
                                              : Colors.black45,
                                        ),
                                      if (controller
                                          .trendGranularityLabel
                                          .isNotEmpty)
                                        AppText(
                                          controller.trendGranularityLabel,
                                          fontSize: 11,
                                          fontWeight: FontWeight.w600,
                                          color: isDark
                                              ? Colors.white38
                                              : Colors.black45,
                                        ),
                                    ],
                                  ],
                                ),
                              ],
                            ),
                          ),
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              _buildCashFlowMetricToggles(isDark),
                              Container(
                                width: 1,
                                height: 18,
                                margin: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                ),
                                color: isDark ? Colors.white24 : Colors.black12,
                              ),
                              InkWell(
                                onTap: () => setState(
                                  () => _comparePriorPeriod =
                                      !_comparePriorPeriod,
                                ),
                                borderRadius: BorderRadius.circular(8),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 4,
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      SizedBox(
                                        width: 12,
                                        height: 12,
                                        child: Transform.scale(
                                          scale: 0.78,
                                          child: Checkbox(
                                            value: _comparePriorPeriod,
                                            onChanged: (v) => setState(
                                              () => _comparePriorPeriod =
                                                  v ?? false,
                                            ),
                                            materialTapTargetSize:
                                                MaterialTapTargetSize
                                                    .shrinkWrap,
                                            visualDensity: const VisualDensity(
                                              horizontal: -4,
                                              vertical: -4,
                                            ),
                                            activeColor: orangeColor,
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 6),
                                      AppText(
                                        "vs prior month",
                                        fontSize: 11,
                                        color: isDark
                                            ? Colors.white54
                                            : Colors.black45,
                                        disableFormat: true,
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),
                      SizedBox(
                        height: 320,
                        child: trendSeries.isEmpty
                            ? Center(
                                child: AppText(
                                  "Data will appear for this range",
                                  color: isDark
                                      ? Colors.white38
                                      : Colors.black45,
                                ),
                              )
                            : _buildCashFlowTrendChart(
                                controller,
                                trendSeries,
                                moneyInColor,
                                moneyOutColor,
                                netCashColor,
                                isDark,
                              ),
                      ),
                      const SizedBox(height: 24),
                      SizedBox(
                        width: double.infinity,
                        child: Wrap(
                          alignment: WrapAlignment.center,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          spacing: 24,
                          runSpacing: 8,
                          children: [
                            if (_showMoneyIn)
                              _LegendItem(
                                color: moneyInColor,
                                label: "Money In",
                                swatch: _LegendSwatch.solidSquare,
                              ),
                            if (_showMoneyOut)
                              _LegendItem(
                                color: moneyOutColor,
                                label: "Money Out",
                                swatch: _LegendSwatch.solidSquare,
                              ),
                            if (_showNetCash)
                              _LegendItem(
                                color: netCashColor,
                                label: "Net Cash",
                                swatch: _LegendSwatch.lineSolid,
                                subtitle: controller.isRealizedView.value
                                    ? "Paid transactions only"
                                    : "Same yellow line; totals include unpaid",
                              ),
                            if (_comparePriorPeriod)
                              _LegendItem(
                                color: isDark
                                    ? const Color(0xFF94A3B8)
                                    : const Color(0xFF64748B),
                                label: "Prior net",
                                swatch: _LegendSwatch.lineDashedPrior,
                                subtitle: "Grey long-dash · prior month",
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 48),

                // 🔹 Bottom Section: Cash Flow Statement Container (match trend chart surface)
                Container(
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surface,
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(
                      color: isDark
                          ? Colors.white.withValues(alpha: 0.05)
                          : Colors.black12,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(
                          alpha: isDark ? 0.15 : 0.03,
                        ),
                        blurRadius: 40,
                        offset: const Offset(0, 10),
                      ),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding: const EdgeInsets.all(24.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            AppText(
                              "Cash Flow Statement",
                              fontSize: 22,
                              fontWeight: FontWeight.w900,
                              color: isDark ? Colors.white : Colors.black87,
                            ),
                            const SizedBox(height: 24),

                            LayoutBuilder(
                              builder: (context, constraints) {
                                final isWide = constraints.maxWidth > 950;
                                final opItems = _getOperatingItems(controller);
                                final investItems = _getInvestingItems(
                                  controller,
                                );
                                final financeItems = _getFinancingItems(
                                  controller,
                                );

                                final statementCardFill = Theme.of(
                                  context,
                                ).colorScheme.surface;
                                if (isWide) {
                                  return IntrinsicHeight(
                                    child: Row(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.stretch,
                                      children: [
                                        Expanded(
                                          child: _buildStatementCard(
                                            "Operating Activities",
                                            opItems,
                                            adjustedOperatingCash,
                                            const Color(0xFF19C37D),
                                            statementCardFill,
                                            textPrimary,
                                            textSecondary,
                                            equalHeightWithNeighbors: true,
                                          ),
                                        ),
                                        const SizedBox(width: 16),
                                        Expanded(
                                          child: _buildStatementCard(
                                            "Investing Activities",
                                            investItems,
                                            controller.investingCashFlow.value,
                                            const Color(0xFF2B7FFF),
                                            statementCardFill,
                                            textPrimary,
                                            textSecondary,
                                            equalHeightWithNeighbors: true,
                                          ),
                                        ),
                                        const SizedBox(width: 16),
                                        Expanded(
                                          child: _buildStatementCard(
                                            "Financing Activities",
                                            financeItems,
                                            controller.financingCashFlow.value,
                                            const Color(0xFFF2C94C),
                                            statementCardFill,
                                            textPrimary,
                                            textSecondary,
                                            equalHeightWithNeighbors: true,
                                          ),
                                        ),
                                      ],
                                    ),
                                  );
                                } else {
                                  return Column(
                                    children: [
                                      _buildStatementCard(
                                        "Operating Activities",
                                        opItems,
                                        adjustedOperatingCash,
                                        const Color(0xFF19C37D),
                                        statementCardFill,
                                        textPrimary,
                                        textSecondary,
                                        equalHeightWithNeighbors: false,
                                      ),
                                      const SizedBox(height: 16),
                                      _buildStatementCard(
                                        "Investing Activities",
                                        investItems,
                                        controller.investingCashFlow.value,
                                        const Color(0xFF2B7FFF),
                                        statementCardFill,
                                        textPrimary,
                                        textSecondary,
                                        equalHeightWithNeighbors: false,
                                      ),
                                      const SizedBox(height: 16),
                                      _buildStatementCard(
                                        "Financing Activities",
                                        financeItems,
                                        controller.financingCashFlow.value,
                                        const Color(0xFFF2C94C),
                                        statementCardFill,
                                        textPrimary,
                                        textSecondary,
                                        equalHeightWithNeighbors: false,
                                      ),
                                    ],
                                  );
                                }
                              },
                            ),
                          ],
                        ),
                      ),

                      // 3️⃣ Shared Footer: Net Change in Cash
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 24,
                          vertical: 24,
                        ),
                        decoration: BoxDecoration(
                          color: isDark
                              ? Colors.white.withValues(alpha: 0.02)
                              : Colors.black.withValues(alpha: 0.02),
                          borderRadius: const BorderRadius.vertical(
                            bottom: Radius.circular(24),
                          ),
                          border: Border(
                            top: BorderSide(
                              color: isDark
                                  ? Colors.white.withValues(alpha: 0.05)
                                  : Colors.black.withValues(alpha: 0.05),
                            ),
                          ),
                        ),
                        child: Center(
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              AppText(
                                "Net Cash: ",
                                fontSize: 18,
                                fontWeight: FontWeight.w900,
                                color: isDark ? Colors.white : Colors.black87,
                              ),
                              AppText(
                                _formatCurrencyExact(statementNetCash),
                                fontSize: 18,
                                fontWeight: FontWeight.w900,
                                color: statementNetCash < 0
                                    ? const Color(0xFFE57373)
                                    : const Color(0xFF19C37D),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const RecentDocumentsWidget(
                  type: 'cf',
                  showViewAllAction: false,
                  showDeleteAction: true,
                ),
                const SizedBox(height: 80),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _premiumKPICard({
    required String title,
    required String value,
    required double change,
    required bool isCurrency,
    String? timeframe,
    Color? valueColor,
    bool isNetCash = false,
    bool invertTrendColors = false,
    bool comparisonUnavailable = false,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bool isFlat = change.abs() < 0.000001;
    final bool isPositive = change > 0;
    final bool isGoodTrend = invertTrendColors ? !isPositive : isPositive;
    const Color softRed = Color(0xFFE57373);
    const Color cashGreen = Color(0xFF19C37D);
    final Color changeColor = isFlat
        ? (isDark ? Colors.white54 : Colors.black45)
        : (isGoodTrend ? cashGreen : softRed);
    final IconData changeIcon = isPositive
        ? Icons.arrow_upward
        : Icons.arrow_downward;

    final bool isNegativeValue = value.contains('(');

    // Explicit value color rules as per reqs
    Color displayValueColor = valueColor ?? Colors.white;
    if (isNetCash) {
      displayValueColor = isNegativeValue ? softRed : cashGreen;
    }
    final tooltipText = kpiTooltipTextForTitle(title);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color:
              (Theme.of(context).brightness == Brightness.dark
                      ? Colors.white
                      : Colors.black)
                  .withValues(alpha: 0.05),
          width: 0.5,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.1 : 0.03),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Stack(
        alignment: Alignment.topCenter,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              AppText(
                title,
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: isDark ? Colors.white70 : Colors.black54,
              ),
              const SizedBox(height: 12),
              FittedBox(
                fit: BoxFit.scaleDown,
                child: AppText(
                  value,
                  fontSize: 28,
                  fontWeight: FontWeight.w900,
                  color: displayValueColor,
                ),
              ),
              const SizedBox(height: 16),
              Wrap(
                alignment: WrapAlignment.center,
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: 8,
                runSpacing: 4,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: comparisonUnavailable
                          ? Colors.grey.withValues(alpha: 0.15)
                          : changeColor.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (!comparisonUnavailable && !isFlat) ...[
                          Icon(changeIcon, size: 12, color: changeColor),
                          const SizedBox(width: 4),
                        ],
                        AppText(
                          comparisonUnavailable
                              ? "New"
                              : "${change.abs().toStringAsFixed(1)}%",
                          fontSize: 12,
                          fontWeight: FontWeight.w900,
                          color: comparisonUnavailable
                              ? (isDark ? Colors.white70 : Colors.black54)
                              : changeColor,
                        ),
                      ],
                    ),
                  ),
                  AppText(
                    "vs previous $timeframe",
                    fontSize: 11,
                    color: Colors.white30,
                    disableFormat: true, // ✅ Force lowercase vs
                  ),
                ],
              ),
            ],
          ),
          if (tooltipText != null)
            Positioned(
              top: 0,
              right: 0,
              child: KpiInfoTooltipIcon(
                message: tooltipText,
                semanticLabel: "More information about $title",
              ),
            ),
        ],
      ),
    );
  }

  String _getTimeframeLabel() {
    switch (_selectedFilterIdx) {
      case 0:
        return "7 days";
      case 1:
        return "30 days";
      case 2:
        return "3 months";
      case 3:
        return "12 months";
      case 4:
        return "year";
      default:
        return "period";
    }
  }

  String _manualSectionLabel(CashFlowManualSection section) {
    switch (section) {
      case CashFlowManualSection.operating:
        return 'Operating Adjustment';
      case CashFlowManualSection.investing:
        return 'Investing Activity';
      case CashFlowManualSection.financing:
        return 'Financing Activity';
      case CashFlowManualSection.other:
        return 'Other Adjustment';
    }
  }

  String _manualSectionStatementLabel(CashFlowManualSection section) {
    switch (section) {
      case CashFlowManualSection.operating:
        return 'Operating Activities';
      case CashFlowManualSection.investing:
        return 'Investing Activities';
      case CashFlowManualSection.financing:
        return 'Financing Activities';
      case CashFlowManualSection.other:
        return 'Other Activities';
    }
  }

  String _formatManualPeriod(DateTime day) {
    final start = _startDate;
    final end = _endDate;
    if (start != null && end != null) {
      return '${DateFormat('MMM dd, yyyy').format(start)} to ${DateFormat('MMM dd, yyyy').format(end)}';
    }
    return DateFormat('MMMM yyyy').format(day);
  }

  bool _isWithinActiveRange(DateTime day) {
    if (_startDate == null || _endDate == null) return false;
    final selected = DateTime(day.year, day.month, day.day);
    final s = DateTime(_startDate!.year, _startDate!.month, _startDate!.day);
    final e = DateTime(_endDate!.year, _endDate!.month, _endDate!.day);
    return !selected.isBefore(s) && !selected.isAfter(e);
  }

  Future<void> _showManualCashFlowDialog(
    FinancialReportController controller,
  ) async {
    final org = getCurrentOrganization;
    final user = authPerson;
    if (org == null || user == null) {
      showSnackBar(
        'Please make sure organization and user are available.',
        isError: true,
      );
      return;
    }

    final isDark = Theme.of(context).brightness == Brightness.dark;
    final categoryCtrl = TextEditingController();
    final notesCtrl = TextEditingController();
    final amountCtrl = TextEditingController();
    DateTime selectedDate =
        _endDate ??
        DateTime(DateTime.now().year, DateTime.now().month, DateTime.now().day);
    CashFlowManualSection selectedSection = CashFlowManualSection.operating;
    bool isNonCash = false;
    String suggestionMessage = '';
    bool suggestionIsError = false;
    String suggestionImpactType = 'Realized';

    InputDecoration inputDecoration(String label) => InputDecoration(
      labelText: label,
      labelStyle: TextStyle(
        color: isDark ? Colors.white70 : Colors.black54,
        fontSize: 12,
      ),
      filled: true,
      fillColor: const Color(0xFF0F1E37),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.12)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFF2B7FFF)),
      ),
    );

    await showDialog(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            Future<void> pickDate() async {
              final picked = await showDatePicker(
                context: context,
                initialDate: selectedDate,
                firstDate: DateTime(2000),
                lastDate: DateTime(2100),
              );
              if (picked == null) return;
              setDialogState(() {
                selectedDate = DateTime(picked.year, picked.month, picked.day);
              });
            }

            void useSuggestion() {
              final combined =
                  '${categoryCtrl.text} ${notesCtrl.text} ${amountCtrl.text}';
              if (combined.trim().isEmpty) {
                setDialogState(() {
                  suggestionMessage =
                      'BookSmart AI needs category/notes before suggesting a section.';
                  suggestionIsError = true;
                });
                return;
              }
              final suggested = _manualEntryService.suggestSection(combined);
              final amount = double.tryParse(amountCtrl.text.trim()) ?? 0;
              final period = _formatManualPeriod(selectedDate);
              final reason =
                  (notesCtrl.text.trim().isNotEmpty
                          ? notesCtrl.text.trim()
                          : categoryCtrl.text.trim())
                      .toLowerCase();
              final why = reason.isEmpty
                  ? 'based on your entry metadata'
                  : 'because "${reason.length > 70 ? '${reason.substring(0, 70)}...' : reason}" matches cash-flow rules';
              setDialogState(() {
                selectedSection = suggested;
                suggestionImpactType = isNonCash ? 'Unrealized' : 'Realized';
                suggestionMessage =
                    'BookSmart found ${_formatCurrencyExact(amount)} for ${_manualSectionStatementLabel(suggested)} for $period ($suggestionImpactType cash flow), $why.';
                suggestionIsError = false;
                if (combined.toLowerCase().contains('depreciation') ||
                    combined.toLowerCase().contains('amortization')) {
                  isNonCash = true;
                  suggestionImpactType = 'Unrealized';
                }
              });
            }

            Future<void> save() async {
              try {
                final amount = double.tryParse(amountCtrl.text.trim());
                if (_startDate == null || _endDate == null) {
                  setDialogState(() {
                    suggestionMessage =
                        'This adjustment cannot save because no date range was selected.';
                    suggestionIsError = true;
                  });
                  return;
                }
                if (categoryCtrl.text.trim().isEmpty || amount == null) {
                  setDialogState(() {
                    suggestionMessage =
                        'This adjustment cannot save because category and a valid amount are required.';
                    suggestionIsError = true;
                  });
                  return;
                }

                final entry = CashFlowManualEntryModel(
                  section: selectedSection,
                  category: categoryCtrl.text.trim(),
                  amount: amount,
                  date: selectedDate,
                  notes: notesCtrl.text.trim(),
                  isNonCash: isNonCash,
                );
                await _manualEntryService.saveManualEntry(
                  userId: user.id,
                  orgId: org.id,
                  entry: entry,
                );
                await controller.fetchAndAggregateData(
                  startDate: _startDate,
                  endDate: _endDate,
                );
                if (mounted) Navigator.of(context).pop();
                final targetSection = _manualSectionStatementLabel(
                  selectedSection,
                );
                final monthLabel = DateFormat('MMMM yyyy').format(selectedDate);
                showSnackBar(
                  'Your cash flow adjustment was saved to $targetSection for $monthLabel.',
                );
                if (_isWithinActiveRange(selectedDate)) {
                  showSnackBar(
                    'This adjustment updated your Cash Flow Statement and dashboard.',
                  );
                } else {
                  showSnackBar(
                    'This adjustment requires reconciliation before updating your Cash Flow Statement.',
                  );
                }
              } catch (e) {
                setDialogState(() {
                  suggestionMessage =
                      'This adjustment cannot save because ${e.toString()}.';
                  suggestionIsError = true;
                });
                showSnackBar(
                  'This adjustment cannot save because ${e.toString()}.',
                  isError: true,
                );
              }
            }

            return AlertDialog(
              backgroundColor: const Color(0xFF0A192F),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
              title: const Text(
                'Adjust Cash Flow',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                ),
              ),
              content: SizedBox(
                width: 420,
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      DropdownButtonFormField<CashFlowManualSection>(
                        value: selectedSection,
                        dropdownColor: const Color(0xFF0F1E37),
                        decoration: inputDecoration('Section'),
                        borderRadius: BorderRadius.circular(12),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 13,
                          fontFamily: 'Outfit',
                        ),
                        items: CashFlowManualSection.values
                            .map(
                              (s) => DropdownMenuItem(
                                value: s,
                                child: Text(
                                  _manualSectionLabel(s),
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontFamily: 'Outfit',
                                  ),
                                ),
                              ),
                            )
                            .toList(),
                        onChanged: (v) {
                          if (v != null) {
                            setDialogState(() => selectedSection = v);
                          }
                        },
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: categoryCtrl,
                        style: const TextStyle(color: Colors.white),
                        decoration: inputDecoration(
                          'Category / Adjustment Name',
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: amountCtrl,
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                          signed: true,
                        ),
                        style: const TextStyle(color: Colors.white),
                        decoration: inputDecoration('Amount'),
                      ),
                      const SizedBox(height: 12),
                      InkWell(
                        onTap: pickDate,
                        child: InputDecorator(
                          decoration: inputDecoration('Date'),
                          child: Text(
                            DateFormat('MMM dd, yyyy').format(selectedDate),
                            style: const TextStyle(color: Colors.white),
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: notesCtrl,
                        maxLines: 3,
                        style: const TextStyle(color: Colors.white),
                        decoration: inputDecoration('Notes'),
                      ),
                      const SizedBox(height: 8),
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text(
                          'Non-cash adjustment',
                          style: TextStyle(color: Colors.white),
                        ),
                        value: isNonCash,
                        onChanged: (v) =>
                            setDialogState(() => isNonCash = v ?? false),
                        activeColor: const Color(0xFF2B7FFF),
                        checkColor: Colors.white,
                      ),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: OutlinedButton(
                          onPressed: useSuggestion,
                          style: OutlinedButton.styleFrom(
                            foregroundColor: Colors.white,
                            side: BorderSide(
                              color: const Color(
                                0xFF2B7FFF,
                              ).withValues(alpha: 0.7),
                            ),
                            backgroundColor: const Color(0x0D2B7FFF),
                            overlayColor: const Color(0x332B7FFF),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                          ),
                          child: const Text(
                            'Use AI Suggestion',
                            style: TextStyle(fontFamily: 'Outfit'),
                          ),
                        ),
                      ),
                      if (suggestionMessage.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(
                            suggestionMessage,
                            style:
                                const TextStyle(
                                  fontSize: 12,
                                  color: Color(0xFFE57373),
                                  fontWeight: FontWeight.w600,
                                ).copyWith(
                                  color: suggestionIsError
                                      ? const Color(0xFFE57373)
                                      : const Color(0xFF19C37D),
                                  fontWeight: FontWeight.w600,
                                ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  style: TextButton.styleFrom(
                    foregroundColor: Colors.white70,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  child: const Text(
                    'Close',
                    style: TextStyle(fontFamily: 'Outfit'),
                  ),
                ),
                ElevatedButton(
                  onPressed: save,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2B7FFF),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  child: const Text(
                    'Save',
                    style: TextStyle(fontFamily: 'Outfit'),
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }

  Widget _buildCashFlowMetricToggles(bool isDark) {
    return PopupMenuButton<String>(
      offset: const Offset(0, 40),
      color: isDark ? const Color(0xFF1E293B) : Colors.white,
      elevation: 8,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      onSelected: (value) {
        setState(() {
          if (value == "money_in") _showMoneyIn = !_showMoneyIn;
          if (value == "money_out") _showMoneyOut = !_showMoneyOut;
          if (value == "net") _showNetCash = !_showNetCash;
        });
      },
      itemBuilder: (context) => [
        CheckedPopupMenuItem<String>(
          value: "money_in",
          checked: _showMoneyIn,
          child: const AppText("Money In", fontSize: 12),
        ),
        CheckedPopupMenuItem<String>(
          value: "money_out",
          checked: _showMoneyOut,
          child: const AppText("Money Out", fontSize: 12),
        ),
        CheckedPopupMenuItem<String>(
          value: "net",
          checked: _showNetCash,
          child: const AppText("Net", fontSize: 12),
        ),
      ],
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: isDark ? Colors.white12 : Colors.black12),
          color: isDark
              ? Colors.white.withValues(alpha: 0.04)
              : Colors.black.withValues(alpha: 0.02),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppText(
              "Filter",
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: isDark ? Colors.white70 : Colors.black54,
            ),
            const SizedBox(width: 3),
            Icon(
              Icons.keyboard_arrow_down,
              size: 12,
              color: isDark ? Colors.white70 : Colors.black54,
            ),
          ],
        ),
      ),
    );
  }

  /// Raw Y extents (before [_niceAxisStep]) for the cash flow trend chart. When
  /// comparing prior period, prior buckets' net must be included or the dashed
  /// line maps outside the chart (curves can still overshoot slightly — clip the stack).
  ({double minYRaw, double maxYRaw}) _cfTrendChartRawYBounds(
    List<Map<String, dynamic>> effectiveSeries,
    List<Map<String, dynamic>> prevSeries,
    int n,
  ) {
    double minVal = 0;
    double maxVal = 0;
    for (final d in effectiveSeries) {
      final inc = (d['income'] as num?)?.toDouble() ?? 0;
      final exp = (d['expense'] as num?)?.toDouble() ?? 0;
      final net = (d['net'] as num?)?.toDouble() ?? 0;
      if (_showMoneyIn && inc < minVal) minVal = inc;
      if (_showMoneyOut && exp < minVal) minVal = exp;
      if (_showNetCash && net < minVal) minVal = net;
      if (_showMoneyIn && inc > maxVal) maxVal = inc;
      if (_showMoneyOut && exp > maxVal) maxVal = exp;
      if (_showNetCash && net > maxVal) maxVal = net;
    }
    if (_comparePriorPeriod && prevSeries.isNotEmpty) {
      final limit = prevSeries.length < n ? prevSeries.length : n;
      for (var i = 0; i < limit; i++) {
        final net = (prevSeries[i]['net'] as num?)?.toDouble() ?? 0;
        if (net < minVal) minVal = net;
        if (net > maxVal) maxVal = net;
      }
    }
    final double minYRaw;
    if (minVal == 0) {
      minYRaw = 0;
    } else {
      final interval = minVal.abs() > 50000 ? 10000.0 : 5000.0;
      minYRaw = (minVal / interval).floor() * interval;
    }
    final double maxYRaw;
    if (maxVal == 0) {
      maxYRaw = 10000;
    } else {
      final interval = maxVal > 50000 ? 10000.0 : 5000.0;
      maxYRaw = (maxVal / interval).ceil() * interval;
    }
    return (minYRaw: minYRaw, maxYRaw: maxYRaw);
  }

  /// Same as fl_chart [BarChartAlignment.spaceAround] group centers (uniform group width).
  List<double> _cfBarGroupCenterXsSpaceAround(
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

  double _cfTrendGroupWidth(int n) {
    final rodW = (320 / n).clamp(4.0, 16.0);
    var rodCount = 0;
    if (_showMoneyIn) rodCount++;
    if (_showMoneyOut) rodCount++;
    if (rodCount == 0) return 1.0;
    if (rodCount == 1) return rodW;
    return rodW * 2 + 6;
  }

  Widget _buildCashFlowTrendChart(
    FinancialReportController controller,
    List<Map<String, dynamic>> series,
    Color inColor,
    Color outColor,
    Color netColor,
    bool isDark,
  ) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final includeUnrealized = !controller.isRealizedView.value;
        final effectiveSeries = series.map((row) {
          final realizedIncome =
              (row['realizedIncome'] as num?)?.toDouble() ??
              (row['income'] as num?)?.toDouble() ??
              0.0;
          final realizedExpense =
              (row['realizedExpense'] as num?)?.toDouble() ??
              (row['expense'] as num?)?.toDouble() ??
              0.0;
          final unrealizedIncome =
              (row['unrealizedIncome'] as num?)?.toDouble() ?? 0.0;
          final unrealizedExpense =
              (row['unrealizedExpense'] as num?)?.toDouble() ?? 0.0;
          final income = includeUnrealized
              ? realizedIncome + unrealizedIncome
              : realizedIncome;
          final expense = includeUnrealized
              ? realizedExpense + unrealizedExpense
              : realizedExpense;
          final net = income - expense;
          return {
            ...row,
            'income': income,
            'expense': expense,
            'net': net,
            'realizedIncome': realizedIncome,
            'realizedExpense': realizedExpense,
            'realizedNet': realizedIncome - realizedExpense,
          };
        }).toList();
        const leftAxis = 50.0;
        final usableW = (constraints.maxWidth - leftAxis).clamp(
          1.0,
          double.infinity,
        );
        final n = effectiveSeries.length;
        final prev = controller.prevTrendChartSeries;
        final rawY = _cfTrendChartRawYBounds(effectiveSeries, prev, n);
        final minYRaw = rawY.minYRaw;
        final maxYRaw = rawY.maxYRaw;
        final span = (maxYRaw - minYRaw).abs();
        final step = _niceAxisStep(span == 0 ? 1000 : span);
        final minY = (minYRaw / step).floorToDouble() * step;
        final maxY = (maxYRaw / step).ceilToDouble() * step;
        final bool compactXAxis = n > 6;
        final compareLen = prev.length < n ? prev.length : n;
        final groupW = _cfTrendGroupWidth(n);
        final centers = _cfBarGroupCenterXsSpaceAround(usableW, n, groupW);
        final spotXN = centers.map((c) => c / usableW).toList();
        final bottomReserved = compactXAxis ? 52.0 : 42.0;

        final lineBars = <LineChartBarData>[];
        if (_showNetCash) {
          lineBars.add(
            LineChartBarData(
              spots: List.generate(n, (i) {
                final net = (series[i]['net'] as num?)?.toDouble() ?? 0;
                final projectedNet =
                    (effectiveSeries[i]['net'] as num?)?.toDouble() ?? 0;
                final xn = i < spotXN.length ? spotXN[i] : 0.5;
                return FlSpot(xn, includeUnrealized ? projectedNet : net);
              }),
              isCurved: true,
              preventCurveOverShooting: true,
              curveSmoothness: 0.35,
              color: netColor,
              barWidth: 3,
              isStrokeCapRound: true,
              dotData: FlDotData(
                show: true,
                getDotPainter: (spot, p, b, i) => FlDotCirclePainter(
                  radius: n > 60 ? 2.0 : 2.5,
                  color: netColor,
                  strokeWidth: 1,
                  strokeColor: Colors.white70,
                ),
              ),
              belowBarData: BarAreaData(
                show: true,
                applyCutOffY: true,
                cutOffY: 0,
                color: const Color(0xFF19C37D).withValues(alpha: 0.22),
              ),
              aboveBarData: BarAreaData(
                show: true,
                applyCutOffY: true,
                cutOffY: 0,
                color: const Color(0xFFE57373).withValues(alpha: 0.22),
              ),
            ),
          );
        }
        if (_comparePriorPeriod && compareLen > 0) {
          final priorColor = isDark
              ? const Color(0xFF94A3B8)
              : const Color(0xFF64748B);
          lineBars.add(
            LineChartBarData(
              spots: List.generate(compareLen, (i) {
                final net = (prev[i]['net'] as num?)?.toDouble() ?? 0;
                final xn = i < spotXN.length ? spotXN[i] : 0.5;
                return FlSpot(xn, net);
              }),
              isCurved: true,
              preventCurveOverShooting: true,
              curveSmoothness: 0.35,
              color: priorColor,
              barWidth: 2,
              // Longer dashes than net-unrealized [6,4] so prior vs yellow net are easy to tell apart.
              dashArray: const [14, 7],
              dotData: const FlDotData(show: false),
            ),
          );
        }

        final tooltipEnabled = _showNetCash && lineBars.isNotEmpty;

        return ClipRect(
          child: Stack(
            clipBehavior: Clip.hardEdge,
            fit: StackFit.expand,
            children: [
              BarChart(
                BarChartData(
                  alignment: BarChartAlignment.spaceAround,
                  maxY: maxY,
                  minY: minY,
                  baselineY: 0,
                  barTouchData: const BarTouchData(enabled: false),
                  titlesData: FlTitlesData(
                    show: true,
                    bottomTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        getTitlesWidget: (v, meta) {
                          final idx = v.toInt();
                          if (idx < 0 || idx >= n)
                            return const SizedBox.shrink();
                          return SideTitleWidget(
                            meta: meta,
                            angle: 0,
                            space: compactXAxis ? 6.0 : 10.0,
                            child: SizedBox(
                              width: compactXAxis ? 38 : 52,
                              child: Transform.rotate(
                                angle: 0,
                                child: Text(
                                  effectiveSeries[idx]['label']?.toString() ??
                                      '',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    fontSize: compactXAxis ? 8 : 10,
                                    color: isDark
                                        ? Colors.white54
                                        : Colors.black54,
                                    fontWeight: FontWeight.w500,
                                    fontStyle: FontStyle.normal,
                                    fontFamily: 'Roboto',
                                    height: 1.0,
                                  ),
                                ),
                              ),
                            ),
                          );
                        },
                        reservedSize: bottomReserved,
                        interval: 1,
                      ),
                    ),
                    leftTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: 50,
                        interval: step,
                        getTitlesWidget: (v, meta) {
                          if ((v - meta.max).abs() < 0.01)
                            return const SizedBox.shrink();
                          return Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: AppText(
                              _formatCompact(v),
                              fontSize: 10,
                              color: isDark ? Colors.white54 : Colors.black54,
                              fontWeight: FontWeight.bold,
                            ),
                          );
                        },
                      ),
                    ),
                    rightTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false),
                    ),
                    topTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false),
                    ),
                  ),
                  gridData: FlGridData(
                    show: true,
                    drawVerticalLine: false,
                    getDrawingHorizontalLine: (v) => FlLine(
                      color: isDark
                          ? Colors.white.withValues(alpha: 0.05)
                          : Colors.black.withValues(alpha: 0.05),
                      strokeWidth: 1,
                    ),
                  ),
                  borderData: FlBorderData(show: false),
                  barGroups: List.generate(n, (i) {
                    final data = effectiveSeries[i];
                    final inc = (data['income'] as num?)?.toDouble() ?? 0;
                    final exp = (data['expense'] as num?)?.toDouble() ?? 0;
                    final realizedInc =
                        (data['realizedIncome'] as num?)?.toDouble() ?? inc;
                    final realizedExp =
                        (data['realizedExpense'] as num?)?.toDouble() ?? exp;
                    final rods = <BarChartRodData>[];
                    if (_showMoneyIn) {
                      rods.add(
                        BarChartRodData(
                          toY: includeUnrealized ? realizedInc : inc,
                          color: inColor,
                          width: (320 / n).clamp(4.0, 16.0),
                          borderRadius: const BorderRadius.vertical(
                            top: Radius.circular(4),
                          ),
                          gradient: LinearGradient(
                            begin: Alignment.bottomCenter,
                            end: Alignment.topCenter,
                            colors: [inColor.withValues(alpha: 0.4), inColor],
                          ),
                        ),
                      );
                      if (includeUnrealized && inc > realizedInc) {
                        rods.add(
                          BarChartRodData(
                            toY: inc,
                            fromY: realizedInc,
                            color: inColor.withValues(alpha: 0.35),
                            width: (320 / n).clamp(4.0, 16.0),
                            borderRadius: const BorderRadius.vertical(
                              top: Radius.circular(4),
                            ),
                          ),
                        );
                      }
                    }
                    if (_showMoneyOut) {
                      rods.add(
                        BarChartRodData(
                          toY: includeUnrealized ? realizedExp : exp,
                          color: outColor,
                          width: (320 / n).clamp(4.0, 16.0),
                          borderRadius: const BorderRadius.vertical(
                            top: Radius.circular(4),
                          ),
                          gradient: LinearGradient(
                            begin: Alignment.bottomCenter,
                            end: Alignment.topCenter,
                            colors: [outColor.withValues(alpha: 0.4), outColor],
                          ),
                        ),
                      );
                      if (includeUnrealized && exp > realizedExp) {
                        rods.add(
                          BarChartRodData(
                            toY: exp,
                            fromY: realizedExp,
                            color: outColor.withValues(alpha: 0.35),
                            width: (320 / n).clamp(4.0, 16.0),
                            borderRadius: const BorderRadius.vertical(
                              top: Radius.circular(4),
                            ),
                          ),
                        );
                      }
                    }
                    if (rods.isEmpty) {
                      rods.add(
                        BarChartRodData(
                          toY: 0.001,
                          color: Colors.transparent,
                          width: 1,
                        ),
                      );
                    }
                    return BarChartGroupData(x: i, barsSpace: 6, barRods: rods);
                  }),
                ),
              ),
              LineChart(
                LineChartData(
                  minX: 0,
                  maxX: 1,
                  maxY: maxY,
                  minY: minY,
                  baselineY: 0,
                  lineTouchData: LineTouchData(
                    enabled: tooltipEnabled,
                    handleBuiltInTouches: tooltipEnabled,
                    touchSpotThreshold: 18,
                    distanceCalculator: (touch, spotPixel) =>
                        (touch - spotPixel).distance,
                    getTouchedSpotIndicator: (barData, spotIndexes) {
                      return spotIndexes
                          .map(
                            (_) => TouchedSpotIndicatorData(
                              FlLine(color: Colors.transparent, strokeWidth: 0),
                              const FlDotData(show: false),
                            ),
                          )
                          .toList();
                    },
                    touchTooltipData: LineTouchTooltipData(
                      maxContentWidth: 240,
                      fitInsideHorizontally: true,
                      fitInsideVertically: true,
                      getTooltipColor: (_) => isDark
                          ? const Color(0xFF1E293B)
                          : const Color(0xFF0F1E37),
                      getTooltipItems: (touchedSpots) {
                        return touchedSpots.map((s) {
                          if (s.barIndex != 0) return null;
                          final idx = s.spotIndex;
                          if (idx < 0 || idx >= effectiveSeries.length)
                            return null;
                          final row = effectiveSeries[idx];
                          final dateStr = row['tooltipDate']?.toString() ?? '';
                          final bucketStart = row['bucketStart'];
                          final bucketDate = bucketStart is DateTime
                              ? bucketStart
                              : DateTime.tryParse(
                                  bucketStart?.toString() ?? '',
                                );
                          final hasSpecificDay = RegExp(
                            r'\b[A-Za-z]{3,9}\s+\d{1,2}\b',
                          ).hasMatch(dateStr);
                          final tooltipDateText = dateStr.isNotEmpty
                              ? (hasSpecificDay || bucketDate == null
                                    ? dateStr
                                    : DateFormat(
                                        'MMMM dd, yyyy',
                                      ).format(bucketDate))
                              : (bucketDate != null
                                    ? DateFormat(
                                        'MMM dd, yyyy',
                                      ).format(bucketDate)
                                    : '');
                          final inc = (row['income'] as num?)?.toDouble() ?? 0;
                          final exp = (row['expense'] as num?)?.toDouble() ?? 0;
                          final net = (row['net'] as num?)?.toDouble() ?? 0;
                          return LineTooltipItem(
                            '',
                            const TextStyle(color: Colors.white, fontSize: 12),
                            children: [
                              TextSpan(
                                text: '$tooltipDateText\n',
                                style: const TextStyle(
                                  color: Colors.white70,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 12,
                                  height: 1.35,
                                ),
                              ),
                              TextSpan(
                                text:
                                    'Money In: ${_formatCurrencyExact(inc)}\n',
                                style: TextStyle(
                                  color: inColor,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 12,
                                  height: 1.35,
                                ),
                              ),
                              TextSpan(
                                text:
                                    'Money Out: ${_formatCurrencyExact(exp)}\n',
                                style: TextStyle(
                                  color: outColor,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 12,
                                  height: 1.35,
                                ),
                              ),
                              TextSpan(
                                text: 'Net Cash: ${_formatCurrencyExact(net)}',
                                style: TextStyle(
                                  color: netColor,
                                  fontWeight: FontWeight.w900,
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
                        reservedSize: 50,
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
                    rightTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false),
                    ),
                    topTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false),
                    ),
                  ),
                  gridData: const FlGridData(show: false),
                  borderData: FlBorderData(show: false),
                  lineBarsData: lineBars.isEmpty
                      ? [
                          LineChartBarData(
                            spots: const [FlSpot(0, 0)],
                            dotData: const FlDotData(show: false),
                          ),
                        ]
                      : lineBars,
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildStatementCard(
    String title,
    List<Map<String, dynamic>> items,
    double total,
    Color accentColor,
    Color cardColor,
    Color textPrimary,
    Color textSecondary, {
    bool equalHeightWithNeighbors = false,
  }) {
    bool isExpanded = _expandedCards[title] ?? false;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final Widget detailSection = isExpanded
        ? Padding(
            padding: const EdgeInsets.fromLTRB(24, 0, 24, 16),
            child: Column(
              children: items.asMap().entries.map((entry) {
                final idx = entry.key;
                final item = entry.value;
                return Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          AppText(
                            item["label"],
                            fontSize: 13,
                            color: textSecondary,
                            fontWeight: FontWeight.w500,
                          ),
                          AppText(
                            _formatCurrencyExact(item["value"]),
                            fontSize: 13,
                            fontWeight: FontWeight.bold,
                            color: (item["value"] as double) < 0
                                ? const Color(0xFFE57373)
                                : textPrimary,
                          ),
                        ],
                      ),
                    ),
                    if (idx < items.length - 1)
                      Divider(
                        height: 1,
                        thickness: 0.5,
                        color: isDark
                            ? Colors.white.withValues(alpha: 0.05)
                            : Colors.black.withValues(alpha: 0.05),
                      ),
                  ],
                );
              }).toList(),
            ),
          )
        : const SizedBox.shrink();

    return Container(
      decoration: BoxDecoration(
        color: cardColor,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: isDark
              ? Colors.white.withValues(alpha: 0.05)
              : Colors.black.withValues(alpha: 0.06),
        ),
        boxShadow: isDark
            ? null
            : [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.02),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: Stack(
          children: [
            Positioned.fill(
              child: Align(
                alignment: Alignment.centerLeft,
                child: Container(
                  width: 8,
                  decoration: BoxDecoration(
                    color: accentColor,
                    borderRadius: const BorderRadius.only(
                      topLeft: Radius.circular(24),
                      bottomLeft: Radius.circular(24),
                    ),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(left: 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  InkWell(
                    onTap: () =>
                        setState(() => _expandedCards[title] = !isExpanded),
                    child: Container(
                      padding: const EdgeInsets.all(24),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: AppText(
                              title,
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                              color: textPrimary,
                            ),
                          ),
                          Icon(
                            isExpanded
                                ? Icons.keyboard_arrow_down
                                : Icons.keyboard_arrow_right,
                            size: 20,
                            color: textSecondary.withValues(alpha: 0.3),
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (isExpanded) ...[
                    detailSection,
                    if (items.length < 3)
                      SizedBox(height: (3 - items.length) * 44.0),
                  ],
                  if (equalHeightWithNeighbors) const Spacer(),
                  Container(
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      color: accentColor.withValues(alpha: 0.1),
                      borderRadius: const BorderRadius.only(
                        bottomRight: Radius.circular(24),
                      ),
                      border: Border(
                        top: BorderSide(
                          color: accentColor.withValues(alpha: 0.2),
                          width: 1,
                        ),
                      ),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        AppText(
                          title == "Operating Activities"
                              ? "Operating Cash Flow"
                              : (title == "Investing Activities"
                                    ? "Investing Cash Flow"
                                    : "Financing Cash Flow"),
                          fontSize: 14,
                          fontWeight: FontWeight.w900,
                          color: textPrimary,
                        ),
                        AppText(
                          _formatCurrencyExact(total),
                          fontSize: 16,
                          fontWeight: FontWeight.w900,
                          color: total >= 0
                              ? const Color(0xFF19C37D)
                              : const Color(0xFFE57373),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<Map<String, dynamic>> _getOperatingItems(
    FinancialReportController controller,
  ) {
    final includeUnrealized = !controller.isRealizedView.value;
    return [
      {"label": "Net Income", "value": controller.netIncome.value},
      {"label": "Adjustments", "value": controller.operatingAdjustments.value},
      {
        "label": "Working Capital",
        "value": controller.workingCapitalChanges.value,
      },
      {"label": "Other Operating", "value": controller.operatingOther.value},
      if (includeUnrealized)
        {
          "label": "Unrealized Receivables",
          "value": controller.upcomingReceivables.value,
        },
      if (includeUnrealized)
        {
          "label": "Unrealized Payables",
          "value": -controller.upcomingPayables.value,
        },
    ];
  }

  List<Map<String, dynamic>> _getInvestingItems(
    FinancialReportController controller,
  ) {
    return [
      {"label": "Asset Purchases", "value": controller.assetPurchases.value},
      {"label": "Investments", "value": controller.investmentActivities.value},
    ];
  }

  List<Map<String, dynamic>> _getFinancingItems(
    FinancialReportController controller,
  ) {
    return [
      {"label": "Loans", "value": controller.loanActivities.value},
      {"label": "Contributions", "value": controller.ownerContributions.value},
      {"label": "Distributions", "value": controller.distributions.value},
      {"label": "Other Financing", "value": controller.financingOther.value},
    ];
  }

  String _formatCurrency(double value) {
    final formatted = NumberFormat("#,##0.00").format(value.abs());
    return value < 0 ? '(\$$formatted)' : '\$$formatted';
  }

  String _formatCompact(double value) {
    if (value == 0) return "\$0";
    final isNegative = value < 0;
    final absVal = value.abs();
    String formatted;
    if (absVal >= 1000000) {
      final m = absVal / 1000000;
      formatted =
          "\$${m.truncateToDouble() == m ? m.toStringAsFixed(0) : m.toStringAsFixed(1)}M";
    } else if (absVal >= 1000) {
      final k = absVal / 1000;
      formatted =
          "\$${k.truncateToDouble() == k ? k.toStringAsFixed(0) : k.toStringAsFixed(1)}K";
    } else {
      formatted = "\$${absVal.toInt()}";
    }
    return isNegative ? "($formatted)" : formatted;
  }

  String _formatCurrencyExact(double value) {
    final formatted = NumberFormat("#,##0.00").format(value.abs());
    return value < 0 ? '(\$$formatted)' : '\$$formatted';
  }
}

/// Swatch shapes for the Cash Flow Trend legend (each series has a distinct marker).
enum _LegendSwatch {
  solidSquare,
  lineSolid,

  /// Prior-period overlay: two longer segments (matches chart long-dash pattern).
  lineDashedPrior,
}

class _LegendItem extends StatelessWidget {
  final Color color;
  final String label;
  final _LegendSwatch swatch;

  /// Short hint under the label (e.g. how unrealized relates to the net line).
  final String? subtitle;

  const _LegendItem({
    required this.color,
    required this.label,
    this.swatch = _LegendSwatch.solidSquare,
    this.subtitle,
  });

  static const double _lineThick = 2;

  Widget _swatch() {
    final cap = BorderRadius.circular(1);
    switch (swatch) {
      case _LegendSwatch.solidSquare:
        return Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(2),
          ),
        );
      case _LegendSwatch.lineSolid:
        return Container(
          width: 16,
          height: _lineThick,
          decoration: BoxDecoration(color: color, borderRadius: cap),
        );
      case _LegendSwatch.lineDashedPrior:
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 8,
              height: _lineThick,
              decoration: BoxDecoration(color: color, borderRadius: cap),
            ),
            const SizedBox(width: 4),
            Container(
              width: 8,
              height: _lineThick,
              decoration: BoxDecoration(color: color, borderRadius: cap),
            ),
          ],
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final labelColor = isDark ? Colors.white70 : Colors.black54;
    final subColor = isDark ? Colors.white38 : Colors.black45;
    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(padding: const EdgeInsets.only(top: 2), child: _swatch()),
        const SizedBox(width: 8),
        Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AppText(label, fontSize: 11, color: labelColor),
            if (subtitle != null && subtitle!.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: AppText(
                  subtitle!,
                  fontSize: 9,
                  fontWeight: FontWeight.w500,
                  color: subColor,
                  disableFormat: true,
                ),
              ),
          ],
        ),
      ],
    );
  }
}
