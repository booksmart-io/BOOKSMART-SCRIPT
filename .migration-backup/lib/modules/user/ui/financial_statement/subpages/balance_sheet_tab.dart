// ignore_for_file: depend_on_referenced_packages, unused_local_variable, unused_field, unused_element, curly_braces_in_flow_control_structures

import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/modules/user/controllers/financial_report_controller.dart';
import 'package:booksmart/modules/user/controllers/organization_controller.dart';
import 'package:intl/intl.dart';
import 'package:excel/excel.dart' as excel_lib;
import 'package:get/get.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:booksmart/modules/user/ui/tax_filling/upload_tax_doc_dialog.dart';
import 'package:booksmart/widgets/recent_documents_widget.dart';
import 'package:booksmart/widgets/kpi_info_tooltip.dart';
import 'package:booksmart/widgets/snackbar.dart';
import 'package:syncfusion_flutter_pdf/pdf.dart' as pdf_gen;
import 'dart:developer' as dev;
import 'package:archive/archive.dart';
import 'package:booksmart/utils/downloader.dart';
import 'package:booksmart/modules/user/ui/financial_statement/export_modal_widget.dart';
import 'package:booksmart/modules/user/ui/financial_statement/pdf_export_service.dart';
import 'package:booksmart/utils/balance_sheet_from_transactions.dart';
import 'package:xml/xml.dart';

class BalanceSheetTab extends StatefulWidget {
  const BalanceSheetTab({super.key});

  @override
  State<BalanceSheetTab> createState() => _BalanceSheetTabState();
}

class _BalanceSheetTabState extends State<BalanceSheetTab>
    with TickerProviderStateMixin, AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  late DateTime _asOfDate;
  bool _didInitialControllerSync = false;
  bool _isAsOfResyncInProgress = false;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _asOfDate = DateTime(now.year, now.month, now.day);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _ensureInitialControllerSync();
    });
  }

  bool _isSameDate(DateTime? a, DateTime? b) {
    if (a == null || b == null) return false;
    return a.year == b.year && a.month == b.month && a.day == b.day;
  }

  Future<void> _ensureInitialControllerSync() async {
    if (!mounted || _didInitialControllerSync) return;
    _didInitialControllerSync = true;
    final orgId = getCurrentOrganization?.id;
    if (orgId == null) return;
    final controller = Get.find<FinancialReportController>(
      tag: orgId.toString(),
    );
    final DateTime? selectedEnd = controller.lastEndDate;
    if (selectedEnd != null) {
      _asOfDate = DateTime(
        selectedEnd.year,
        selectedEnd.month,
        selectedEnd.day,
      );
    }
    if (controller.balanceSheetComparisonMode != 0) {
      controller.setBalanceSheetComparisonMode(0);
    }
    final needsFetch =
        !controller.lastFetchBalanceSheetSnapshot ||
        !_isSameDate(controller.lastEndDate, _asOfDate);
    if (!needsFetch) return;
    await controller.fetchAndAggregateData(
      endDate: _asOfDate,
      balanceSheetAsOfSnapshot: true,
    );
  }

  void _syncAsOfFromSelectedRange(FinancialReportController controller) {
    if (_isAsOfResyncInProgress) return;
    if (controller.lastFetchBalanceSheetSnapshot) return;
    final DateTime? selectedEnd = controller.lastEndDate;
    if (selectedEnd == null) return;
    final asOf = DateTime(selectedEnd.year, selectedEnd.month, selectedEnd.day);
    if (_isSameDate(asOf, _asOfDate)) return;
    _isAsOfResyncInProgress = true;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) {
        _isAsOfResyncInProgress = false;
        return;
      }
      setState(() => _asOfDate = asOf);
      await controller.fetchAndAggregateData(
        endDate: asOf,
        balanceSheetAsOfSnapshot: true,
      );
      _isAsOfResyncInProgress = false;
    });
  }

  static const String _balanceSheetComparisonCaption = 'vs previous month';

  Future<void> _pickAsOfDate(
    BuildContext context,
    FinancialReportController controller,
  ) async {
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: _asOfDate,
      firstDate: DateTime(2000),
      lastDate: DateTime(2101),
      builder: (context, child) {
        final isDark = Theme.of(context).brightness == Brightness.dark;
        return Theme(
          data: ThemeData.dark().copyWith(
            colorScheme: ColorScheme.dark(
              primary: orangeColor,
              onPrimary: Colors.black,
              surface: isDark ? const Color(0xFF0F1E37) : Colors.white,
              onSurface: isDark ? Colors.white : Colors.black87,
            ),
            scaffoldBackgroundColor: isDark
                ? const Color(0xFF0F1E37)
                : Colors.white,
          ),
          child: child!,
        );
      },
    );
    if (picked == null) return;
    final asOf = DateTime(picked.year, picked.month, picked.day);
    if (_isSameDate(asOf, _asOfDate)) return;
    setState(() => _asOfDate = asOf);
    await controller.fetchAndAggregateData(
      endDate: asOf,
      balanceSheetAsOfSnapshot: true,
    );
  }

  Widget _buildAsOfDateControl(FinancialReportController controller) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => _pickAsOfDate(context, controller),
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: isDark ? Colors.black26 : Colors.grey.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: isDark ? Colors.white12 : Colors.black12),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              AppText(
                'As Of Date',
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: isDark ? Colors.white38 : Colors.black45,
              ),
              const SizedBox(width: 10),
              AppText(
                DateFormat('MMM dd, yyyy').format(_asOfDate),
                fontSize: 13,
                fontWeight: FontWeight.bold,
                color: isDark ? Colors.white : Colors.black87,
              ),
              const SizedBox(width: 6),
              const Icon(
                Icons.calendar_today_outlined,
                size: 16,
                color: orangeColor,
              ),
            ],
          ),
        ),
      ),
    );
  }

  BalanceSheetLineMetrics _balanceSheetMetricsAt(
    FinancialReportController controller,
    DateTime columnEnd,
  ) {
    final src = controller.balanceSheetSnapshotSourceTransactions;
    if (src.isEmpty) {
      return BalanceSheetLineMetrics.compute(const [], 0);
    }
    return BalanceSheetLineMetrics.computeThrough(src, columnEnd);
  }

  void _exportExcel(
    FinancialReportController controller, {
    PdfExportRequest? request,
  }) async {
    try {
      final asOfDate = request?.endDate ?? _asOfDate;
      final org = getCurrentOrganization;
      final orgName = org?.name.trim().isNotEmpty == true
          ? org!.name.trim()
          : 'Organization';
      final streetLine = org?.street.trim() ?? '';
      final cityStateZipLine = [
        org?.city.trim() ?? '',
        org?.primaryState?.trim() ?? '',
        org?.zip.trim() ?? '',
      ].where((e) => e.isNotEmpty).join(', ');
      final asOfLine = 'As of ${DateFormat('MMMM dd,').format(asOfDate)}';
      final exportService = PdfExportService();
      final exportEnd = DateTime(asOfDate.year, asOfDate.month, asOfDate.day);
      final exportViewType = request?.viewType ?? PdfViewType.monthly;
      final exportStart =
          request?.startDate ?? DateTime(exportEnd.year, exportEnd.month, 1);
      final List<DateTime> columnEnds;
      final List<String> displayBucketLabels;
      if (request?.balanceSheetSnapshotEnds != null &&
          request!.balanceSheetSnapshotEnds!.isNotEmpty) {
        columnEnds = List<DateTime>.from(request.balanceSheetSnapshotEnds!);
        displayBucketLabels =
            PdfExportService.buildBalanceSheetSnapshotColumnLabels(
              columnEnds,
              exportViewType,
              exportEnd,
            );
      } else {
        final bucketLabels = exportService.buildBucketLabels(
          exportStart,
          exportEnd,
          exportViewType,
        );
        if (bucketLabels.isEmpty) {
          throw Exception('No Excel columns available for selected range.');
        }
        columnEnds = List<DateTime>.filled(bucketLabels.length, exportEnd);
        final candidateYearLabels = bucketLabels
            .map(
              (label) =>
                  RegExp(r'(19|20)\d{2}').firstMatch(label)?.group(0) ?? label,
            )
            .toList();
        displayBucketLabels =
            candidateYearLabels.toSet().length == candidateYearLabels.length
            ? candidateYearLabels
            : bucketLabels;
      }
      final int yearCount = displayBucketLabels.length;
      if (yearCount == 0) {
        throw Exception('No Excel columns available for selected range.');
      }
      if (yearCount > PdfExportService.maxColumns) {
        throw Exception(
          'Balance Sheet export supports a maximum of '
          '${PdfExportService.maxColumns} periods.',
        );
      }
      final excel = excel_lib.Excel.createExcel();
      final sheet = excel['Balance Sheet'];
      final existingSheets = List<String>.from(excel.tables.keys);
      for (final name in existingSheets) {
        final isDefaultSheet = name.toLowerCase().startsWith('sheet');
        if (isDefaultSheet && name != 'Balance Sheet') {
          excel.delete(name);
        }
      }
      final int labelCol = 0;
      final int firstSymbolCol = 1;
      int symbolCol(int index) => firstSymbolCol + (index * 2);
      int amountCol(int index) => symbolCol(index) + 1;
      final int titleStartCol = yearCount >= 3
          ? symbolCol(yearCount - 3)
          : firstSymbolCol;
      final int titleEndCol = amountCol(yearCount - 1);

      final titleStyle = excel_lib.CellStyle(
        bold: true,
        fontSize: 17,
        horizontalAlign: excel_lib.HorizontalAlign.Right,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final metaCenterStyle = excel_lib.CellStyle(
        fontSize: 9,
        horizontalAlign: excel_lib.HorizontalAlign.Right,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final companyStyle = excel_lib.CellStyle(
        bold: true,
        fontSize: 13,
        horizontalAlign: excel_lib.HorizontalAlign.Left,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final headerStyle = excel_lib.CellStyle(
        bold: true,
        fontSize: 9,
        fontColorHex: excel_lib.ExcelColor.fromHexString('FFFFFFFF'),
        backgroundColorHex: excel_lib.ExcelColor.fromHexString('FF6F8DAB'),
        horizontalAlign: excel_lib.HorizontalAlign.Center,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final headerColumnDateStyle = headerStyle.copyWith(
        horizontalAlignVal: excel_lib.HorizontalAlign.Right,
      );
      final liabilityHeaderStyle = excel_lib.CellStyle(
        bold: true,
        fontSize: 9,
        fontColorHex: excel_lib.ExcelColor.fromHexString('FF1F1F1F'),
        backgroundColorHex: excel_lib.ExcelColor.fromHexString('FFD9D9D9'),
        horizontalAlign: excel_lib.HorizontalAlign.Center,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final sectionLabelStyle = excel_lib.CellStyle(
        bold: true,
        fontSize: 9,
        horizontalAlign: excel_lib.HorizontalAlign.Left,
      );
      final lineLabelStyle = excel_lib.CellStyle(
        fontSize: 9,
        horizontalAlign: excel_lib.HorizontalAlign.Left,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final totalLabelStyle = excel_lib.CellStyle(
        bold: true,
        fontSize: 9,
        backgroundColorHex: excel_lib.ExcelColor.fromHexString('FFF2F6FB'),
        horizontalAlign: excel_lib.HorizontalAlign.Left,
      );
      final liabilityTotalLabelStyle = excel_lib.CellStyle(
        bold: true,
        fontSize: 9,
        backgroundColorHex: excel_lib.ExcelColor.fromHexString('FFD9D9D9'),
        horizontalAlign: excel_lib.HorizontalAlign.Left,
      );
      final ratioHeaderStyle = excel_lib.CellStyle(
        bold: true,
        fontSize: 9,
        fontColorHex: excel_lib.ExcelColor.fromHexString('FFFFFFFF'),
        backgroundColorHex: excel_lib.ExcelColor.fromHexString('FF6F8DAB'),
        horizontalAlign: excel_lib.HorizontalAlign.Left,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final ratioLabelStyle = excel_lib.CellStyle(
        fontSize: 9,
        horizontalAlign: excel_lib.HorizontalAlign.Left,
        backgroundColorHex: excel_lib.ExcelColor.fromHexString('FFE8F0F9'),
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final ratioValueStyle = excel_lib.CellStyle(
        fontSize: 9,
        numberFormat: const excel_lib.CustomNumericNumFormat(
          formatCode: r'0.00;[Red](0.00);"-"',
        ),
        horizontalAlign: excel_lib.HorizontalAlign.Right,
        backgroundColorHex: excel_lib.ExcelColor.fromHexString('FFE8F0F9'),
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final ratioWorkingCapitalStyle = excel_lib.CellStyle(
        fontSize: 9,
        numberFormat: const excel_lib.CustomNumericNumFormat(
          formatCode: r'#,##0.00;[Red](#,##0.00);"-"',
        ),
        horizontalAlign: excel_lib.HorizontalAlign.Right,
        backgroundColorHex: excel_lib.ExcelColor.fromHexString('FFE8F0F9'),
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final ratioDollarStyle = excel_lib.CellStyle(
        fontSize: 9,
        horizontalAlign: excel_lib.HorizontalAlign.Center,
        backgroundColorHex: excel_lib.ExcelColor.fromHexString('FFE8F0F9'),
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final dividerLineStyle = excel_lib.CellStyle(
        backgroundColorHex: excel_lib.ExcelColor.fromHexString('FFE1E6ED'),
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final dollarStyle = excel_lib.CellStyle(
        fontSize: 9,
        horizontalAlign: excel_lib.HorizontalAlign.Right,
      );
      final currencyStyle = excel_lib.CellStyle(
        fontSize: 9,
        numberFormat: const excel_lib.CustomNumericNumFormat(
          formatCode: r'#,##0.00;[Red](#,##0.00);"-"',
        ),
        horizontalAlign: excel_lib.HorizontalAlign.Right,
      );
      final totalCurrencyStyle = currencyStyle.copyWith(
        boldVal: true,
        backgroundColorHexVal: excel_lib.ExcelColor.fromHexString('FFF2F6FB'),
      );
      final totalDollarStyle = dollarStyle.copyWith(
        boldVal: true,
        backgroundColorHexVal: excel_lib.ExcelColor.fromHexString('FFF2F6FB'),
      );
      final liabilityTotalCurrencyStyle = currencyStyle.copyWith(
        boldVal: true,
        backgroundColorHexVal: excel_lib.ExcelColor.fromHexString('FFD9D9D9'),
      );
      final liabilityTotalDollarStyle = dollarStyle.copyWith(
        boldVal: true,
        backgroundColorHexVal: excel_lib.ExcelColor.fromHexString('FFD9D9D9'),
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
        if (style != null) {
          cell.cellStyle = style;
        }
      }

      String colLetter(int columnIndexZeroBased) {
        int index = columnIndexZeroBased + 1;
        String result = '';
        while (index > 0) {
          final int rem = (index - 1) % 26;
          result = String.fromCharCode(65 + rem) + result;
          index = (index - 1) ~/ 26;
        }
        return result;
      }

      String monthKey(DateTime d) =>
          DateFormat('yyyy-MM').format(DateTime(d.year, d.month, 1));

      List<DateTime> buildBucketStarts() {
        switch (exportViewType) {
          case PdfViewType.monthly:
            final out = <DateTime>[];
            var cursor = DateTime(exportStart.year, exportStart.month, 1);
            final last = DateTime(exportEnd.year, exportEnd.month, 1);
            while (!cursor.isAfter(last)) {
              out.add(cursor);
              cursor = DateTime(cursor.year, cursor.month + 1, 1);
            }
            return out;
          case PdfViewType.quarterly:
            final out = <DateTime>[];
            var cursor = DateTime(
              exportStart.year,
              (((exportStart.month - 1) ~/ 3) * 3) + 1,
              1,
            );
            while (!cursor.isAfter(exportEnd)) {
              out.add(cursor);
              cursor = DateTime(cursor.year, cursor.month + 3, 1);
            }
            return out;
          case PdfViewType.yearly:
            return [
              for (int y = exportStart.year; y <= exportEnd.year; y++)
                DateTime(y, 1, 1),
            ];
        }
      }

      final bucketStarts = buildBucketStarts();
      final bucketMonthKeys = <List<String>>[
        for (final start in bucketStarts)
          switch (exportViewType) {
            PdfViewType.monthly => [monthKey(start)],
            PdfViewType.quarterly => [
              monthKey(start),
              monthKey(DateTime(start.year, start.month + 1, 1)),
              monthKey(DateTime(start.year, start.month + 2, 1)),
            ],
            PdfViewType.yearly => [
              for (int m = 1; m <= 12; m++)
                monthKey(DateTime(start.year, m, 1)),
            ],
          },
      ];

      double sumAllForBucket(
        Map<String, Map<String, double>> periodic,
        int bucketIdx,
      ) {
        double total = 0;
        for (final mk in bucketMonthKeys[bucketIdx]) {
          final rows = periodic[mk];
          if (rows == null) continue;
          total += rows.values.fold(0.0, (a, b) => a + b);
        }
        return total;
      }

      double sumMatchingForBucket(
        Map<String, Map<String, double>> periodic,
        int bucketIdx,
        List<String> keywords,
      ) {
        double total = 0;
        for (final mk in bucketMonthKeys[bucketIdx]) {
          final rows = periodic[mk];
          if (rows == null) continue;
          for (final entry in rows.entries) {
            final key = entry.key.toLowerCase();
            if (keywords.any((k) => key.contains(k))) {
              total += entry.value;
            }
          }
        }
        return total;
      }

      double pickKeywordsMap(Map<String, double> map, List<String> keywords) {
        double total = 0;
        for (final entry in map.entries) {
          final key = entry.key.toLowerCase();
          if (keywords.any((k) => key.contains(k))) {
            total += entry.value;
          }
        }
        return total;
      }

      Map<int, double> valuesMap(List<double> values) => {
        for (int i = 0; i < values.length; i++) i: values[i],
      };

      for (int c = 0; c <= amountCol(yearCount - 1); c++) {
        if (c == labelCol) {
          sheet.setColumnWidth(c, 34);
        } else if (c.isOdd) {
          // Keep symbol/value pair visually centered under merged month header.
          sheet.setColumnWidth(c, 5.2);
        } else {
          sheet.setColumnWidth(c, 7.8);
        }
      }
      sheet.setRowHeight(1, 24);
      sheet.setRowHeight(2, 14);
      sheet.setRowHeight(3, 14);
      sheet.setRowHeight(4, 14);
      sheet.setRowHeight(5, 2.5);

      setCell(labelCol, 1, excel_lib.TextCellValue(orgName), companyStyle);
      setCell(labelCol, 2, excel_lib.TextCellValue(streetLine));
      setCell(labelCol, 3, excel_lib.TextCellValue(cityStateZipLine));
      setCell(
        titleStartCol,
        1,
        excel_lib.TextCellValue('BALANCE SHEET'),
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
          'Date Prepared: ${DateFormat('MMMM dd, yyyy').format(DateTime.now())}',
        ),
        metaCenterStyle,
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
        metaCenterStyle,
      );
      setCell(
        titleStartCol,
        3,
        excel_lib.TextCellValue(asOfLine),
        metaCenterStyle,
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
        metaCenterStyle,
      );
      for (int c = firstSymbolCol; c <= amountCol(yearCount - 1); c++) {
        setCell(c, 5, excel_lib.TextCellValue(' '), dividerLineStyle);
      }

      int row = 6;
      void writeYearHeader(String label, {excel_lib.CellStyle? bandStyle}) {
        final style = bandStyle ?? headerStyle;
        setCell(labelCol, row, excel_lib.TextCellValue(label), style);
        for (int i = 0; i < yearCount; i++) {
          setCell(
            amountCol(i),
            row,
            excel_lib.TextCellValue(displayBucketLabels[i]),
            headerColumnDateStyle,
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
            headerColumnDateStyle,
          );
        }
        row++;
      }

      int writeLine(
        String label, {
        bool isTotal = false,
        bool isSection = false,
        Map<int, double>? valuesByYearIndex,
        Map<int, String>? formulasByYearIndex,
        bool indent = false,
        bool ratioLine = false,
        bool showDollar = true,
        bool ratioUsesCurrency = false,
        bool useLiabilityTotalStyle = false,
      }) {
        final lineStyle = isSection
            ? sectionLabelStyle
            : isTotal
            ? (useLiabilityTotalStyle
                  ? liabilityTotalLabelStyle
                  : totalLabelStyle)
            : ratioLine
            ? ratioLabelStyle
            : lineLabelStyle;
        setCell(
          labelCol,
          row,
          excel_lib.TextCellValue(indent ? '      $label' : label),
          lineStyle,
        );

        for (int i = 0; i < yearCount; i++) {
          final excel_lib.CellStyle moneyStyle = isTotal
              ? (useLiabilityTotalStyle
                    ? liabilityTotalCurrencyStyle
                    : totalCurrencyStyle)
              : ratioLine
              ? (ratioUsesCurrency ? ratioWorkingCapitalStyle : ratioValueStyle)
              : currencyStyle;
          final excel_lib.CellStyle moneyDollarStyle = isTotal
              ? (useLiabilityTotalStyle
                    ? liabilityTotalDollarStyle
                    : totalDollarStyle)
              : ratioLine
              ? ratioDollarStyle
              : dollarStyle;

          setCell(
            symbolCol(i),
            row,
            excel_lib.TextCellValue(showDollar ? '\$' : ' '),
            moneyDollarStyle,
          );
          if (formulasByYearIndex != null &&
              formulasByYearIndex.containsKey(i)) {
            setCell(
              amountCol(i),
              row,
              excel_lib.FormulaCellValue(formulasByYearIndex[i]!),
              moneyStyle,
            );
          } else {
            final value = valuesByYearIndex?[i] ?? 0.0;
            setCell(
              amountCol(i),
              row,
              excel_lib.DoubleCellValue(value),
              moneyStyle,
            );
          }
        }
        final writtenRow = row;
        row++;
        return writtenRow;
      }

      final currentAssetsVals = <double>[];
      final fixedAssetsVals = <double>[];
      final otherAssetsVals = <double>[];
      final cashVals = <double>[];
      final arVals = <double>[];
      final inventoryVals = <double>[];
      final shortTermInvestmentsVals = <double>[];
      final currentLiabilitiesVals = <double>[];
      final longTermLiabilitiesVals = <double>[];
      final ownerInvestmentVals = <double>[];
      final retainedEarningsVals = <double>[];
      final totalAssetsVals = <double>[];
      final totalLiabilitiesVals = <double>[];
      final totalEquityVals = <double>[];

      void adjustSeriesTotal(List<double> series, double expectedTotal) {
        if (series.isEmpty) return;
        final actual = series.fold(0.0, (a, b) => a + b);
        final diff = expectedTotal - actual;
        series[series.length - 1] += diff;
      }

      final useEngineColumns =
          controller.balanceSheetSnapshotSourceTransactions.isNotEmpty;
      for (int i = 0; i < yearCount; i++) {
        if (useEngineColumns) {
          final m = _balanceSheetMetricsAt(controller, columnEnds[i]);
          final curAssets = m.currentAssetsBreakdown.values.fold(
            0.0,
            (a, b) => a + b,
          );
          final fixedAssets = m.fixedAssetsBreakdown.values.fold(
            0.0,
            (a, b) => a + b,
          );
          final otherAssets = m.otherAssetsBreakdown.values.fold(
            0.0,
            (a, b) => a + b,
          );
          final curLiab = m.currentLiabilitiesBreakdown.values.fold(
            0.0,
            (a, b) => a + b,
          );
          final longLiab = m.longTermLiabilitiesBreakdown.values.fold(
            0.0,
            (a, b) => a + b,
          );
          final cash = m.currentAssetsBreakdown['Cash'] ?? 0;
          final ar = m.currentAssetsBreakdown['Accounts Receivable'] ?? 0;
          final inventory = m.currentAssetsBreakdown['Inventory'] ?? 0;
          final ownerInvestment = pickKeywordsMap(m.ownerEquityBreakdown, [
            'owner',
            'capital',
            'contribution',
          ]);
          final totalAssets = m.totalAssets;
          final totalLiabilities = m.totalLiabilities;
          final totalEquity = m.totalEquity;

          currentAssetsVals.add(curAssets);
          fixedAssetsVals.add(fixedAssets);
          otherAssetsVals.add(otherAssets);
          cashVals.add(cash);
          arVals.add(ar);
          inventoryVals.add(inventory);
          shortTermInvestmentsVals.add(curAssets - cash - ar - inventory);
          currentLiabilitiesVals.add(curLiab);
          longTermLiabilitiesVals.add(longLiab);
          ownerInvestmentVals.add(ownerInvestment);
          retainedEarningsVals.add(totalEquity - ownerInvestment);
          totalAssetsVals.add(totalAssets);
          totalLiabilitiesVals.add(totalLiabilities);
          totalEquityVals.add(totalEquity);
        } else {
          final curAssets = sumAllForBucket(
            controller.periodicCurrentAssetsBreakdown,
            i,
          );
          final fixedAssets = sumAllForBucket(
            controller.periodicFixedAssetsBreakdown,
            i,
          );
          final otherAssets = sumAllForBucket(
            controller.periodicOtherAssetsBreakdown,
            i,
          );
          final curLiab = sumAllForBucket(
            controller.periodicCurrentLiabilitiesBreakdown,
            i,
          );
          final longLiab = sumAllForBucket(
            controller.periodicLongTermLiabilitiesBreakdown,
            i,
          );
          final cash = sumMatchingForBucket(
            controller.periodicCurrentAssetsBreakdown,
            i,
            ['cash'],
          );
          final ar = sumMatchingForBucket(
            controller.periodicCurrentAssetsBreakdown,
            i,
            ['receivable'],
          );
          final inventory = sumMatchingForBucket(
            controller.periodicCurrentAssetsBreakdown,
            i,
            ['inventory'],
          );
          final ownerInvestment = sumMatchingForBucket(
            controller.periodicEquityBreakdown,
            i,
            ['owner', 'capital', 'contribution'],
          );
          final totalAssets = curAssets + fixedAssets + otherAssets;
          final totalLiabilities = curLiab + longLiab;
          final totalEquity = totalAssets - totalLiabilities;

          currentAssetsVals.add(curAssets);
          fixedAssetsVals.add(fixedAssets);
          otherAssetsVals.add(otherAssets);
          cashVals.add(cash);
          arVals.add(ar);
          inventoryVals.add(inventory);
          shortTermInvestmentsVals.add(curAssets - cash - ar - inventory);
          currentLiabilitiesVals.add(curLiab);
          longTermLiabilitiesVals.add(longLiab);
          ownerInvestmentVals.add(ownerInvestment);
          retainedEarningsVals.add(totalEquity - ownerInvestment);
          totalAssetsVals.add(totalAssets);
          totalLiabilitiesVals.add(totalLiabilities);
          totalEquityVals.add(totalEquity);
        }
      }

      // Legacy periodic export: nudge columns to match dashboard. Engine path skips this.
      if (!useEngineColumns) {
        final expectedCurrentAssets = controller.currentAssetsBreakdown.values
            .fold(0.0, (a, b) => a + b);
        final expectedFixedAssets = controller.fixedAssetsBreakdown.values.fold(
          0.0,
          (a, b) => a + b,
        );
        final expectedOtherAssets = controller.otherAssetsBreakdown.values.fold(
          0.0,
          (a, b) => a + b,
        );
        final expectedCurrentLiabilities = controller
            .currentLiabilitiesBreakdown
            .values
            .fold(0.0, (a, b) => a + b);
        final expectedLongTermLiabilities = controller
            .longTermLiabilitiesBreakdown
            .values
            .fold(0.0, (a, b) => a + b);
        final expectedOwnerInvestment = controller.ownerEquityBreakdown.values
            .fold(0.0, (a, b) => a + b);

        adjustSeriesTotal(currentAssetsVals, expectedCurrentAssets);
        adjustSeriesTotal(fixedAssetsVals, expectedFixedAssets);
        adjustSeriesTotal(otherAssetsVals, expectedOtherAssets);
        adjustSeriesTotal(currentLiabilitiesVals, expectedCurrentLiabilities);
        adjustSeriesTotal(longTermLiabilitiesVals, expectedLongTermLiabilities);
        adjustSeriesTotal(ownerInvestmentVals, expectedOwnerInvestment);
      }

      for (int i = 0; i < yearCount; i++) {
        totalAssetsVals[i] =
            currentAssetsVals[i] + fixedAssetsVals[i] + otherAssetsVals[i];
        totalLiabilitiesVals[i] =
            currentLiabilitiesVals[i] + longTermLiabilitiesVals[i];
        totalEquityVals[i] = totalAssetsVals[i] - totalLiabilitiesVals[i];
        retainedEarningsVals[i] = totalEquityVals[i] - ownerInvestmentVals[i];
      }

      writeYearHeader('ASSETS');

      writeLine('CURRENT ASSETS', isSection: true);
      writeLine('Cash', indent: true, valuesByYearIndex: valuesMap(cashVals));
      writeLine(
        'Accounts Receivable',
        indent: true,
        valuesByYearIndex: valuesMap(arVals),
      );
      writeLine(
        'Inventory',
        indent: true,
        valuesByYearIndex: valuesMap(inventoryVals),
      );
      writeLine(
        'Prepaid Expenses',
        indent: true,
        valuesByYearIndex: valuesMap(List<double>.filled(yearCount, 0)),
      );
      writeLine(
        'Short-Term Investments',
        indent: true,
        valuesByYearIndex: valuesMap(shortTermInvestmentsVals),
      );
      final rTotalCurrentAssets = writeLine(
        'TOTAL CURRENT ASSETS',
        isTotal: true,
        valuesByYearIndex: valuesMap(currentAssetsVals),
      );
      row++;

      writeLine('FIXED (LONG-TERM) ASSETS', isSection: true);
      writeLine(
        'Long-Term Investments',
        indent: true,
        valuesByYearIndex: valuesMap(List<double>.filled(yearCount, 0)),
      );
      writeLine(
        'Property, Plant, and Equipment',
        indent: true,
        valuesByYearIndex: valuesMap(fixedAssetsVals),
      );
      writeLine(
        'Intangible Assets',
        indent: true,
        valuesByYearIndex: valuesMap(List<double>.filled(yearCount, 0)),
      );
      writeLine(
        'Accumulated Depreciation (*enter as negative)',
        indent: true,
        valuesByYearIndex: valuesMap(List<double>.filled(yearCount, 0)),
      );
      final rTotalFixed = writeLine(
        'TOTAL FIXED (LONG-TERM) ASSETS',
        isTotal: true,
        valuesByYearIndex: valuesMap(fixedAssetsVals),
      );
      row++;

      writeLine('OTHER ASSETS', isSection: true);
      writeLine(
        'Deferred Income Tax',
        indent: true,
        valuesByYearIndex: valuesMap(List<double>.filled(yearCount, 0)),
      );
      writeLine(
        'Other',
        indent: true,
        valuesByYearIndex: valuesMap(otherAssetsVals),
      );
      final rTotalOtherAssets = writeLine(
        'TOTAL OTHER ASSETS',
        isTotal: true,
        valuesByYearIndex: valuesMap(otherAssetsVals),
      );

      final rTotalAssets = writeLine(
        'TOTAL ASSETS',
        isTotal: true,
        valuesByYearIndex: valuesMap(totalAssetsVals),
      );
      row++;

      writeYearHeader(
        "LIABILITIES AND OWNER'S EQUITY",
        bandStyle: liabilityHeaderStyle,
      );

      writeLine('CURRENT LIABILITIES', isSection: true);
      writeLine(
        'Accounts Payable',
        indent: true,
        valuesByYearIndex: valuesMap(currentLiabilitiesVals),
      );
      writeLine(
        'Short-Term Loans',
        indent: true,
        valuesByYearIndex: valuesMap(List<double>.filled(yearCount, 0)),
      );
      writeLine(
        'Income Taxes Payable',
        indent: true,
        valuesByYearIndex: valuesMap(List<double>.filled(yearCount, 0)),
      );
      writeLine(
        'Accrued Salaries and Wages',
        indent: true,
        valuesByYearIndex: valuesMap(List<double>.filled(yearCount, 0)),
      );
      writeLine(
        'Unearned Revenue',
        indent: true,
        valuesByYearIndex: valuesMap(List<double>.filled(yearCount, 0)),
      );
      writeLine(
        'Current Portion of Long-Term Debt',
        indent: true,
        valuesByYearIndex: valuesMap(List<double>.filled(yearCount, 0)),
      );
      final rTotalCurrentLiab = writeLine(
        'TOTAL CURRENT LIABILITIES',
        isTotal: true,
        valuesByYearIndex: valuesMap(currentLiabilitiesVals),
      );

      writeLine('LONG-TERM LIABILITIES', isSection: true);
      writeLine(
        'Long-term debt',
        indent: true,
        valuesByYearIndex: valuesMap(longTermLiabilitiesVals),
      );
      writeLine(
        'Deferred income tax',
        indent: true,
        valuesByYearIndex: valuesMap(List<double>.filled(yearCount, 0)),
      );
      writeLine(
        'Other',
        indent: true,
        valuesByYearIndex: valuesMap(List<double>.filled(yearCount, 0)),
      );
      final rTotalLongTermLiab = writeLine(
        'TOTAL LONG-TERM LIABILITIES',
        isTotal: true,
        valuesByYearIndex: valuesMap(longTermLiabilitiesVals),
      );

      writeLine('OWNER\'S EQUITY', isSection: true);
      writeLine(
        'Owner\'s Investment',
        indent: true,
        valuesByYearIndex: valuesMap(ownerInvestmentVals),
      );
      writeLine(
        'Retained Earnings',
        indent: true,
        valuesByYearIndex: valuesMap(retainedEarningsVals),
      );
      writeLine(
        'Other',
        indent: true,
        valuesByYearIndex: valuesMap(List<double>.filled(yearCount, 0)),
      );
      final rTotalEquity = writeLine(
        'TOTAL OWNER\'S EQUITY',
        isTotal: true,
        valuesByYearIndex: valuesMap(totalEquityVals),
      );

      final rTotalLiabEq = writeLine(
        "TOTAL LIABILITIES AND OWNER'S EQUITY",
        isTotal: true,
        useLiabilityTotalStyle: true,
        valuesByYearIndex: valuesMap(
          List<double>.generate(
            yearCount,
            (i) => totalLiabilitiesVals[i] + totalEquityVals[i],
          ),
        ),
      );

      row++;
      setCell(
        labelCol,
        row,
        excel_lib.TextCellValue('FINANCIAL RATIOS'),
        ratioHeaderStyle,
      );
      sheet.setRowHeight(row, 20);
      for (int i = 0; i < yearCount; i++) {
        setCell(
          amountCol(i),
          row,
          excel_lib.TextCellValue(displayBucketLabels[i]),
          ratioHeaderStyle,
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
          ratioHeaderStyle,
        );
      }
      row++;

      final ratioRow1 = writeLine(
        'Debt Ratio',
        ratioLine: true,
        showDollar: false,
        formulasByYearIndex: {
          for (int i = 0; i < yearCount; i++)
            i: '=IF(${colLetter(amountCol(i))}${rTotalAssets + 1}=0,"-",(${colLetter(amountCol(i))}${rTotalCurrentLiab + 1}+${colLetter(amountCol(i))}${rTotalLongTermLiab + 1})/${colLetter(amountCol(i))}${rTotalAssets + 1})',
        },
      );
      final ratioRow2 = writeLine(
        'Current Ratio',
        ratioLine: true,
        showDollar: false,
        formulasByYearIndex: {
          for (int i = 0; i < yearCount; i++)
            i: '=IF(${colLetter(amountCol(i))}${rTotalCurrentLiab + 1}=0,"-",${colLetter(amountCol(i))}${rTotalCurrentAssets + 1}/${colLetter(amountCol(i))}${rTotalCurrentLiab + 1})',
        },
      );
      final ratioRow3 = writeLine(
        'Working Capital',
        ratioLine: true,
        showDollar: true,
        ratioUsesCurrency: true,
        formulasByYearIndex: {
          for (int i = 0; i < yearCount; i++)
            i: '=${colLetter(amountCol(i))}${rTotalCurrentAssets + 1}-${colLetter(amountCol(i))}${rTotalCurrentLiab + 1}',
        },
      );
      final ratioRow4 = writeLine(
        'Assets-to-Equity Ratio',
        ratioLine: true,
        showDollar: false,
        formulasByYearIndex: {
          for (int i = 0; i < yearCount; i++)
            i: '=IF(${colLetter(amountCol(i))}${rTotalEquity + 1}=0,"-",${colLetter(amountCol(i))}${rTotalAssets + 1}/${colLetter(amountCol(i))}${rTotalEquity + 1})',
        },
      );
      final ratioRow5 = writeLine(
        'Debt-to-Equity Ratio',
        ratioLine: true,
        showDollar: false,
        formulasByYearIndex: {
          for (int i = 0; i < yearCount; i++)
            i: '=IF(${colLetter(amountCol(i))}${rTotalEquity + 1}=0,"-",(${colLetter(amountCol(i))}${rTotalCurrentLiab + 1}+${colLetter(amountCol(i))}${rTotalLongTermLiab + 1})/${colLetter(amountCol(i))}${rTotalEquity + 1})',
        },
      );
      for (final rr in [
        ratioRow1,
        ratioRow2,
        ratioRow3,
        ratioRow4,
        ratioRow5,
      ]) {
        sheet.setRowHeight(rr, 20);
      }

      final exportName =
          'Balance_Sheet_${DateFormat('yyyyMMdd').format(asOfDate)}.xlsx';
      final bytes = excel.encode();
      if (bytes == null) {
        throw Exception('Unable to generate Excel file.');
      }
      final outputBytes = _hideGridLinesInFirstSheet(bytes);
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

  List<int> _hideGridLinesInFirstSheet(List<int> xlsxBytes) {
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

      if (!changed) {
        return xlsxBytes;
      }

      return ZipEncoder().encode(archive) ?? xlsxBytes;
    } catch (_) {
      return xlsxBytes;
    }
  }

  // Define some styles inside the method scope or as reusable markers
  static final netProfitStyle = excel_lib.CellStyle(
    bold: true,
    fontColorHex: excel_lib.ExcelColor.fromHexString('#FFFFFF'),
    backgroundColorHex: excel_lib.ExcelColor.fromHexString('#0F1E37'),
  );

  void _exportCSV(FinancialReportController controller) async {
    final buffer = StringBuffer();
    final orgName = getCurrentOrganization?.name ?? 'Financial Report';
    final dateStr = "As of ${DateFormat('MMM dd, yyyy').format(_asOfDate)}";

    buffer.writeln('Balance Sheet Report');
    buffer.writeln('Organization,$orgName');
    buffer.writeln('Date,$dateStr');
    buffer.writeln('');

    void addCsvSection(String title, Map<String, double> items, double total) {
      buffer.writeln(title.toUpperCase());
      buffer.writeln('Description,Amount');
      items.forEach((key, val) {
        final cleanKey = key.contains(']') ? key.split(']').last.trim() : key;
        buffer.writeln('"$cleanKey",$val');
      });
      buffer.writeln('TOTAL $title,$total');
      buffer.writeln('');
    }

    final currentAssets = controller.currentAssetsBreakdown.values.fold(
      0.0,
      (a, b) => a + b,
    );
    final fixedAssets = controller.fixedAssetsBreakdown.values.fold(
      0.0,
      (a, b) => a + b,
    );
    final otherAssets = controller.otherAssetsBreakdown.values.fold(
      0.0,
      (a, b) => a + b,
    );
    final totalAssets = controller.totalAssets.value;

    addCsvSection(
      'Current Assets',
      controller.currentAssetsBreakdown,
      currentAssets,
    );
    addCsvSection('Fixed Assets', controller.fixedAssetsBreakdown, fixedAssets);
    addCsvSection('Other Assets', controller.otherAssetsBreakdown, otherAssets);
    buffer.writeln('TOTAL ASSETS,$totalAssets');
    buffer.writeln('');

    final currentLiab = controller.currentLiabilitiesBreakdown.values.fold(
      0.0,
      (a, b) => a + b,
    );
    final longTermLiab = controller.longTermLiabilitiesBreakdown.values.fold(
      0.0,
      (a, b) => a + b,
    );
    final totalLiab = controller.totalLiabilities.value;

    addCsvSection(
      'Current Liabilities',
      controller.currentLiabilitiesBreakdown,
      currentLiab,
    );
    addCsvSection(
      'Long-Term Liabilities',
      controller.longTermLiabilitiesBreakdown,
      longTermLiab,
    );

    final equityMap = <String, double>{...controller.ownerEquityBreakdown};
    final totalEquity = totalAssets - totalLiab;
    addCsvSection('Equity', equityMap, totalEquity);

    buffer.writeln('TOTAL LIABILITIES & EQUITY,${totalLiab + totalEquity}');

    final csvBytes = utf8.encode(buffer.toString());
    await downloadFile(
      'Balance_Sheet_${orgName.replaceAll(" ", "_")}.csv',
      csvBytes,
      mimeType: 'text/csv',
    );
  }

  double _percentChange(double current, double previous) {
    if (previous.abs() < 0.000001) return 0.0;
    final pct = ((current - previous) / previous) * 100;
    if (pct.isNaN || pct.isInfinite) return 0.0;
    return pct;
  }

  Widget _outlineButton(String text, {required VoidCallback onPressed}) {
    return InkWell(
      onTap: onPressed,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        decoration: BoxDecoration(
          border: Border.all(color: orangeColor, width: 1.2),
          borderRadius: BorderRadius.circular(12),
        ),
        child: AppText(
          text.toUpperCase(),
          color: orangeColor,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Widget _premiumKPICard({
    required String title,
    required String value,
    required double change,
    required bool isCurrency,
    String comparisonCaption = 'vs previous month',
    Color? borderColor,
    double? borderWidth,
    bool showInfoIcon = true,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isPositive = change >= 0;
    final Color softRed = const Color(0xFFE57373);
    final Color changeColor = isPositive ? const Color(0xFF19C37D) : softRed;
    final IconData changeIcon = isPositive
        ? Icons.arrow_upward
        : Icons.arrow_downward;

    final bool isNegativeValue =
        value.contains('-') || (isCurrency && value.startsWith('-\$'));
    final Color valueColor = isNegativeValue
        ? softRed
        : (isDark ? Colors.white : Colors.black87);
    final tooltipText = showInfoIcon ? kpiTooltipTextForTitle(title) : null;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color:
              borderColor ??
              (isDark ? Colors.yellow.withValues(alpha: 0.3) : Colors.black12),
          width: borderWidth ?? 0.5,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.05),
            blurRadius: 15,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Stack(
        alignment: Alignment.topCenter,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  title,
                  style: TextStyle(
                    fontFamily: 'Outfit',
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: isDark ? Colors.white70 : Colors.black54,
                  ),
                  softWrap: false,
                  overflow: TextOverflow.visible,
                ),
              ),
              const SizedBox(height: 12),
              FittedBox(
                fit: BoxFit.scaleDown,
                child: AppText(
                  value,
                  fontSize: 28,
                  fontWeight: FontWeight.w900,
                  color: valueColor,
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
                      color: isPositive
                          ? changeColor.withValues(alpha: 0.15)
                          : softRed.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(changeIcon, size: 12, color: changeColor),
                        const SizedBox(width: 4),
                        AppText(
                          "${change.abs().toStringAsFixed(1)}%",
                          fontSize: 12,
                          fontWeight: FontWeight.w900,
                          color: changeColor,
                          disableFormat: true,
                        ),
                      ],
                    ),
                  ),
                  AppText(
                    comparisonCaption,
                    fontSize: 11,
                    color: isDark ? Colors.white30 : Colors.black38,
                    disableFormat: true,
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

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return GetBuilder<FinancialReportController>(
      tag: getCurrentOrganization!.id.toString(),
      builder: (controller) {
        if (TickerMode.of(context)) {
          _syncAsOfFromSelectedRange(controller);
        }
        if (controller.isLoading.value &&
            !controller.hasPresentedFinancialData) {
          return const Center(
            child: CircularProgressIndicator(color: orangeColor),
          );
        }

        final totalAssets = controller.totalAssets.value;
        final totalLiabilities = controller.totalLiabilities.value;
        final totalEquity = totalAssets - totalLiabilities;
        final previousEquity =
            controller.prevPeriodAssets.value -
            controller.prevPeriodLiabilities.value;
        final assetsChange = _percentChange(
          totalAssets,
          controller.prevPeriodAssets.value,
        );
        final liabilitiesChange = _percentChange(
          totalLiabilities,
          controller.prevPeriodLiabilities.value,
        );
        final equityChange = _percentChange(totalEquity, previousEquity);
        final currentRatioChange = _percentChange(
          controller.currentRatio,
          controller.prevPeriodCurrentRatio,
        );
        final debtToEquityChange = _percentChange(
          controller.debtToEquity,
          controller.prevPeriodDebtToEquity,
        );
        final roeChange = _percentChange(
          controller.returnOnEquity,
          controller.prevPeriodReturnOnEquity,
        );
        final curLiabilities = controller.currentLiabilitiesBreakdown.values
            .fold(0.0, (a, b) => a + b);
        final currentRatioValue = curLiabilities.abs() < 0.000001
            ? "N/A"
            : controller.currentRatio.toStringAsFixed(2);
        final equityBase = totalAssets - totalLiabilities;
        final debtToEquityValue = equityBase.abs() < 0.000001
            ? "N/A"
            : controller.debtToEquity.toStringAsFixed(2);
        final roeValue = equityBase.abs() < 0.000001
            ? "N/A"
            : "${controller.returnOnEquity.toStringAsFixed(1)}%";
        final compareCap = _balanceSheetComparisonCaption;

        final isDark = Theme.of(context).brightness == Brightness.dark;
        final screenWidth = MediaQuery.sizeOf(context).width;
        final isNarrow = screenWidth <= 1024;

        return Container(
          color: Theme.of(context).scaffoldBackgroundColor,
          child: SingleChildScrollView(
            padding: EdgeInsets.all(isNarrow ? 12 : 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 🔹 Title & As Of header
                isNarrow
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          AppText(
                            "Balance Sheet",
                            fontSize: 28,
                            fontWeight: FontWeight.w900,
                            color: isDark ? Colors.white : Colors.black87,
                          ),
                          const SizedBox(height: 4),
                          AppText(
                            "Snapshot as of ${DateFormat('MMM dd, yyyy').format(_asOfDate)}",
                            fontSize: 12,
                            color: isDark ? Colors.white38 : Colors.black45,
                          ),
                          const SizedBox(height: 12),
                          _buildAsOfDateControl(controller),
                        ],
                      )
                    : Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              AppText(
                                "Balance Sheet",
                                fontSize: 28,
                                fontWeight: FontWeight.w900,
                                color: isDark ? Colors.white : Colors.black87,
                              ),
                              const SizedBox(height: 4),
                              AppText(
                                "Snapshot as of ${DateFormat('MMM dd, yyyy').format(_asOfDate)}",
                                fontSize: 12,
                                color: isDark ? Colors.white38 : Colors.black45,
                              ),
                            ],
                          ),
                          _buildAsOfDateControl(controller),
                        ],
                      ),
                const SizedBox(height: 24),

                Align(
                  alignment: Alignment.centerRight,
                  child: Wrap(
                    spacing: 16,
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
                              companyAddress: 'Address not available',
                              reportType: ExportPdfReportType.balanceSheet,
                              balanceSheetAdvancedExport: true,
                              singleDateLabel: 'As Of Date',
                              initialEndDate: _asOfDate,
                              onExport: (request) async {
                                final asOfDate = DateTime(
                                  request.endDate.year,
                                  request.endDate.month,
                                  request.endDate.day,
                                );
                                setState(() => _asOfDate = asOfDate);
                                await controller.fetchAndAggregateData(
                                  endDate: asOfDate,
                                  balanceSheetAsOfSnapshot: true,
                                );
                                await _exportPDF(controller, request: request);
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
                              companyAddress: 'Address not available',
                              reportType: ExportPdfReportType.balanceSheet,
                              balanceSheetAdvancedExport: true,
                              singleDateLabel: 'As Of Date',
                              initialEndDate: _asOfDate,
                              initialStartDate: _asOfDate,
                              onExport: (request) async {
                                final asOfDate = DateTime(
                                  request.endDate.year,
                                  request.endDate.month,
                                  request.endDate.day,
                                );
                                setState(() => _asOfDate = asOfDate);
                                await controller.fetchAndAggregateData(
                                  endDate: asOfDate,
                                  balanceSheetAsOfSnapshot: true,
                                );
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
                      _outlineButton(
                        "Upload",
                        onPressed: () =>
                            showUploadTaxDocumentDialog(type: 'bs'),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),

                // 🔹 Top Section: 3 Large Cards
                isNarrow
                    ? Wrap(
                        spacing: 12,
                        runSpacing: 12,
                        children: [
                          SizedBox(
                            width: screenWidth - 36,
                            child: _premiumKPICard(
                              title: "Total Assets",
                              value: _formatCurrency(totalAssets),
                              change: assetsChange,
                              isCurrency: true,
                              comparisonCaption: compareCap,
                              borderColor:
                                  Theme.of(context).brightness ==
                                      Brightness.dark
                                  ? Colors.white.withValues(alpha: 0.15)
                                  : Colors.black12,
                              borderWidth: 0.8,
                              showInfoIcon: false,
                            ),
                          ),
                          SizedBox(
                            width: screenWidth - 36,
                            child: _premiumKPICard(
                              title: "Total Liabilities",
                              value: _formatCurrency(totalLiabilities),
                              change: liabilitiesChange,
                              isCurrency: true,
                              comparisonCaption: compareCap,
                              borderColor:
                                  Theme.of(context).brightness ==
                                      Brightness.dark
                                  ? Colors.white.withValues(alpha: 0.15)
                                  : Colors.black12,
                              borderWidth: 0.8,
                            ),
                          ),
                          SizedBox(
                            width: screenWidth - 36,
                            child: _premiumKPICard(
                              title: "Equity",
                              value: _formatCurrency(totalEquity),
                              change: equityChange,
                              isCurrency: true,
                              comparisonCaption: compareCap,
                              borderColor:
                                  Theme.of(context).brightness ==
                                      Brightness.dark
                                  ? Colors.white.withValues(alpha: 0.15)
                                  : Colors.black12,
                              borderWidth: 0.8,
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
                                title: "Total Assets",
                                value: _formatCurrency(totalAssets),
                                change: assetsChange,
                                isCurrency: true,
                                comparisonCaption: compareCap,
                                borderColor:
                                    Theme.of(context).brightness ==
                                        Brightness.dark
                                    ? Colors.white.withValues(alpha: 0.15)
                                    : Colors.black12,
                                borderWidth: 0.8,
                                showInfoIcon: false,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: _premiumKPICard(
                                title: "Total Liabilities",
                                value: _formatCurrency(totalLiabilities),
                                change: liabilitiesChange,
                                isCurrency: true,
                                comparisonCaption: compareCap,
                                borderColor:
                                    Theme.of(context).brightness ==
                                        Brightness.dark
                                    ? Colors.white.withValues(alpha: 0.15)
                                    : Colors.black12,
                                borderWidth: 0.8,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: _premiumKPICard(
                                title: "Equity",
                                value: _formatCurrency(totalEquity),
                                change: equityChange,
                                isCurrency: true,
                                comparisonCaption: compareCap,
                                borderColor:
                                    Theme.of(context).brightness ==
                                        Brightness.dark
                                    ? Colors.white.withValues(alpha: 0.15)
                                    : Colors.black12,
                                borderWidth: 0.8,
                              ),
                            ),
                          ],
                        ),
                      ),
                const SizedBox(height: 24),

                // 🔹 Second Row: 4 Small Ratio Cards
                isNarrow
                    ? Wrap(
                        spacing: 12,
                        runSpacing: 12,
                        children: [
                          SizedBox(
                            width: screenWidth - 36,
                            child: _premiumKPICard(
                              title: "Current Ratio",
                              value: currentRatioValue,
                              change: currentRatioChange,
                              isCurrency: false,
                              comparisonCaption: compareCap,
                              borderColor: Colors.yellow.withValues(alpha: 0.6),
                              borderWidth: 1.5,
                            ),
                          ),
                          SizedBox(
                            width: screenWidth - 36,
                            child: _premiumKPICard(
                              title: "Debt / Equity Ratio",
                              value: debtToEquityValue,
                              change: debtToEquityChange,
                              isCurrency: false,
                              comparisonCaption: compareCap,
                              borderColor: Colors.yellow.withValues(alpha: 0.6),
                              borderWidth: 1.5,
                            ),
                          ),
                          SizedBox(
                            width: screenWidth - 36,
                            child: _premiumKPICard(
                              title: "Return on Equity (ROE)",
                              value: roeValue,
                              change: roeChange,
                              isCurrency: false,
                              comparisonCaption: compareCap,
                              borderColor: Colors.yellow.withValues(alpha: 0.6),
                              borderWidth: 1.5,
                            ),
                          ),
                          SizedBox(
                            width: screenWidth - 36,
                            child: _premiumKPICard(
                              title: "Total Assets",
                              value: _formatCurrency(totalAssets),
                              change: assetsChange,
                              isCurrency: true,
                              comparisonCaption: compareCap,
                              borderColor: Colors.yellow.withValues(alpha: 0.6),
                              borderWidth: 1.5,
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
                                title: "Current Ratio",
                                value: currentRatioValue,
                                change: currentRatioChange,
                                isCurrency: false,
                                comparisonCaption: compareCap,
                                borderColor: Colors.yellow.withValues(
                                  alpha: 0.6,
                                ),
                                borderWidth: 1.5,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: _premiumKPICard(
                                title: "Debt / Equity Ratio",
                                value: debtToEquityValue,
                                change: debtToEquityChange,
                                isCurrency: false,
                                comparisonCaption: compareCap,
                                borderColor: Colors.yellow.withValues(
                                  alpha: 0.6,
                                ),
                                borderWidth: 1.5,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: _premiumKPICard(
                                title: "Return on Equity (ROE)",
                                value: roeValue,
                                change: roeChange,
                                isCurrency: false,
                                comparisonCaption: compareCap,
                                borderColor: Colors.yellow.withValues(
                                  alpha: 0.6,
                                ),
                                borderWidth: 1.5,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: _premiumKPICard(
                                title: "Total Assets",
                                value: _formatCurrency(totalAssets),
                                change: assetsChange,
                                isCurrency: true,
                                comparisonCaption: compareCap,
                                borderColor: Colors.yellow.withValues(
                                  alpha: 0.6,
                                ),
                                borderWidth: 1.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                const SizedBox(height: 24),

                // 🔹 Bottom Section: Side-by-Side Breakdown
                IntrinsicHeight(
                  child: isNarrow
                      ? Column(
                          children: [
                            _buildBreakdownPanel(
                              title: "Assets",
                              sections: [
                                _BreakdownSection(
                                  title: "Current Assets",
                                  items: controller.currentAssetsBreakdown,
                                ),
                                _BreakdownSection(
                                  title: "Fixed Assets",
                                  items: controller.fixedAssetsBreakdown,
                                ),
                                _BreakdownSection(
                                  title: "Other Assets",
                                  items: controller.otherAssetsBreakdown,
                                ),
                              ],
                              total: totalAssets,
                            ),
                            const SizedBox(height: 24),
                            _buildBreakdownPanel(
                              title: "Liabilities & Equity",
                              sections: [
                                _BreakdownSection(
                                  title: "Current Liabilities",
                                  items: controller.currentLiabilitiesBreakdown,
                                ),
                                _BreakdownSection(
                                  title: "Long Term Liabilities",
                                  items:
                                      controller.longTermLiabilitiesBreakdown,
                                ),
                                _BreakdownSection(
                                  title: "Equity",
                                  items: <String, double>{
                                    ...controller.ownerEquityBreakdown,
                                  },
                                ),
                              ],
                              total: totalLiabilities + totalEquity,
                            ),
                          ],
                        )
                      : Row(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Expanded(
                              child: _buildBreakdownPanel(
                                title: "Assets",
                                sections: [
                                  _BreakdownSection(
                                    title: "Current Assets",
                                    items: controller.currentAssetsBreakdown,
                                  ),
                                  _BreakdownSection(
                                    title: "Fixed Assets",
                                    items: controller.fixedAssetsBreakdown,
                                  ),
                                  _BreakdownSection(
                                    title: "Other Assets",
                                    items: controller.otherAssetsBreakdown,
                                  ),
                                ],
                                total: totalAssets,
                              ),
                            ),
                            const SizedBox(width: 24),
                            Expanded(
                              child: _buildBreakdownPanel(
                                title: "Liabilities & Equity",
                                sections: [
                                  _BreakdownSection(
                                    title: "Current Liabilities",
                                    items:
                                        controller.currentLiabilitiesBreakdown,
                                  ),
                                  _BreakdownSection(
                                    title: "Long Term Liabilities",
                                    items:
                                        controller.longTermLiabilitiesBreakdown,
                                  ),
                                  _BreakdownSection(
                                    title: "Equity",
                                    items: <String, double>{
                                      ...controller.ownerEquityBreakdown,
                                    },
                                  ),
                                ],
                                total: totalLiabilities + totalEquity,
                              ),
                            ),
                          ],
                        ),
                ),
                const RecentDocumentsWidget(
                  type: 'bs',
                  sectionTitle: 'Recently Uploaded',
                  showUploadDateInSubtitle: true,
                  useImageThumbnailWhenPossible: true,
                  showDeleteAction: true,
                  showViewAllAction: false,
                ),
                const SizedBox(height: 24),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildBreakdownPanel({
    required String title,
    required List<_BreakdownSection> sections,
    required double total,
  }) {
    // Collect all items from all sections for the Pie Chart (Top 5 Overall)
    Map<String, double> allItems = {};
    for (var section in sections) {
      allItems.addAll(section.items);
    }

    final sortedItems = allItems.entries.where((e) => e.value != 0).toList()
      ..sort((a, b) => b.value.abs().compareTo(a.value.abs()));

    final displayItems = sortedItems.take(5).toList();
    final bool hasData = sortedItems.isNotEmpty;

    final List<Color> palette = [
      const Color(0xFF10B981), // Emerald/Green
      const Color(0xFF3B82F6), // Blue
      const Color(0xFF06B6D4), // Cyan
      const Color(0xFF84CC16), // Lime
      const Color(0xFFF59E0B), // Amber
    ];

    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: isDark ? Colors.white.withValues(alpha: 0.08) : Colors.black12,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.05),
            blurRadius: 15,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AppText(
                    title,
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                    color: isDark ? Colors.white : Colors.black87,
                  ),
                  const SizedBox(height: 4),
                  AppText(
                    "As of ${DateFormat('MMM dd, yyyy').format(_asOfDate)}",
                    fontSize: 10,
                    color: isDark ? Colors.white38 : Colors.black54,
                  ),
                ],
              ),
              AppText(
                _formatCurrency(total),
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: isDark ? Colors.white70 : Colors.black87,
              ),
            ],
          ),
          const SizedBox(height: 32),
          if (!hasData)
            SizedBox(
              height: 180,
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.pie_chart_outline,
                      size: 48,
                      color: isDark ? Colors.white24 : Colors.black12,
                    ),
                    const SizedBox(height: 12),
                    AppText(
                      "No Data Available",
                      color: isDark ? Colors.white30 : Colors.black38,
                      fontSize: 13,
                    ),
                  ],
                ),
              ),
            )
          else
            Row(
              children: [
                SizedBox(
                  height: 180,
                  width: 180,
                  child: PieChart(
                    PieChartData(
                      sectionsSpace: 2,
                      centerSpaceRadius: 40,
                      sections: displayItems.asMap().entries.map((e) {
                        return PieChartSectionData(
                          color: palette[e.key % palette.length],
                          value: e.value.value.abs(),
                          title: '',
                          radius: 50,
                          showTitle: false,
                        );
                      }).toList(),
                    ),
                  ),
                ),
                const SizedBox(width: 24),
                Expanded(
                  child: Align(
                    alignment: Alignment.centerRight,
                    child: SizedBox(
                      width: 260, // Constrained width to prevent congestion
                      child: SingleChildScrollView(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const SizedBox(height: 8),
                            ...sections.map<Widget>((section) {
                              if (section.items.isEmpty)
                                return const SizedBox.shrink();

                              return Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Padding(
                                    padding: const EdgeInsets.only(
                                      top: 12,
                                      bottom: 6,
                                    ),
                                    child: Text(
                                      section.title.toUpperCase(),
                                      style: TextStyle(
                                        fontFamily: 'Outfit',
                                        fontSize: 10,
                                        fontWeight: FontWeight.bold,
                                        color: orangeColor.withValues(
                                          alpha: 0.7,
                                        ),
                                      ),
                                      softWrap: false,
                                      overflow: TextOverflow.visible,
                                    ),
                                  ),
                                  ...section.items.entries.map((e) {
                                    final pct = total != 0
                                        ? (e.value.abs() / total.abs()) * 100
                                        : 0.0;
                                    int index = allItems.keys.toList().indexOf(
                                      e.key,
                                    );
                                    return _buildLegendItem(
                                      e.key.contains(']')
                                          ? e.key.split(']').last.trim()
                                          : e.key,
                                      "${pct.toStringAsFixed(0)}%",
                                      palette[index % palette.length],
                                    );
                                  }),
                                  const SizedBox(height: 8),
                                ],
                              );
                            }),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _buildLegendItem(String label, String percent, Color color) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: AppText(
              label,
              fontSize: 11,
              color: Colors.white54,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(width: 24), // Restored internal space
          AppText(
            percent,
            fontSize: 11,
            fontWeight: FontWeight.bold,
            color: Colors.white70,
          ),
          const SizedBox(width: 4),
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
        ],
      ),
    );
  }

  Widget _buildMiniLegend(String label, Color color) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 6,
          height: 6,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.5),
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 6),
        AppText(label, fontSize: 11, color: Colors.white30),
      ],
    );
  }

  Widget _buildBreakdownRow({
    required String label,
    required double value,
    required double total,
  }) {
    final double percentage = total != 0
        ? (value.abs() / total.abs()) * 100
        : 0;
    final bool isNegative = value < 0;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Expanded(child: AppText(label, fontSize: 13, color: Colors.white70)),
          AppText(
            isNegative
                ? "(${_formatCurrency(value.abs())})"
                : _formatCurrency(value),
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: isNegative ? Colors.redAccent : Colors.white,
          ),
          const SizedBox(width: 12),
          Container(
            width: 45,
            alignment: Alignment.centerRight,
            child: AppText(
              percentage == 0 ? "0%" : "${percentage.toStringAsFixed(1)}%",
              fontSize: 11,
              color: Colors.white38,
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _exportPDF(
    FinancialReportController controller, {
    PdfExportRequest? request,
  }) async {
    try {
      final asOfDate = request?.endDate ?? _asOfDate;
      final org = getCurrentOrganization;
      final orgName = org?.name.trim().isNotEmpty == true
          ? org!.name.trim()
          : 'Organization';
      final streetLine = org?.street.trim() ?? '';
      final cityStateZipLine = [
        org?.city.trim() ?? '',
        org?.primaryState?.trim() ?? '',
        org?.zip.trim() ?? '',
      ].where((e) => e.isNotEmpty).join(', ');
      final exportService = PdfExportService();
      final exportEnd = DateTime(asOfDate.year, asOfDate.month, asOfDate.day);
      final exportStart =
          request?.startDate ?? DateTime(exportEnd.year, exportEnd.month, 1);
      final exportViewType = request?.viewType ?? PdfViewType.monthly;
      final List<DateTime> columnEnds;
      final List<String> displayLabels;
      if (request?.balanceSheetSnapshotEnds != null &&
          request!.balanceSheetSnapshotEnds!.isNotEmpty) {
        columnEnds = List<DateTime>.from(request.balanceSheetSnapshotEnds!);
        displayLabels = PdfExportService.buildBalanceSheetSnapshotColumnLabels(
          columnEnds,
          exportViewType,
          exportEnd,
        );
      } else {
        final labels = exportService.buildBucketLabels(
          exportStart,
          exportEnd,
          exportViewType,
        );
        if (labels.isEmpty) {
          throw Exception('No PDF columns available for selected range.');
        }
        columnEnds = List<DateTime>.filled(labels.length, exportEnd);
        final candidateYearLabels = labels
            .map(
              (label) =>
                  RegExp(r'(19|20)\d{2}').firstMatch(label)?.group(0) ?? label,
            )
            .toList();
        displayLabels =
            candidateYearLabels.toSet().length == candidateYearLabels.length
            ? candidateYearLabels
            : labels;
      }
      final int yearCount = displayLabels.length;
      if (yearCount == 0) {
        throw Exception('No PDF columns available for selected range.');
      }
      if (yearCount > PdfExportService.maxColumns) {
        throw Exception(
          'Balance Sheet export supports a maximum of '
          '${PdfExportService.maxColumns} periods.',
        );
      }

      double pickByKeywords(Map<String, double> map, List<String> keywords) {
        double total = 0;
        for (final entry in map.entries) {
          final key = entry.key.toLowerCase();
          if (keywords.any((k) => key.contains(k))) {
            total += entry.value;
          }
        }
        return total;
      }

      double pickKeywordsMap(Map<String, double> map, List<String> keywords) {
        double total = 0;
        for (final entry in map.entries) {
          final key = entry.key.toLowerCase();
          if (keywords.any((k) => key.contains(k))) {
            total += entry.value;
          }
        }
        return total;
      }

      String monthKey(DateTime d) =>
          DateFormat('yyyy-MM').format(DateTime(d.year, d.month, 1));

      List<DateTime> buildBucketStarts() {
        switch (exportViewType) {
          case PdfViewType.monthly:
            final out = <DateTime>[];
            var cursor = DateTime(exportStart.year, exportStart.month, 1);
            final last = DateTime(exportEnd.year, exportEnd.month, 1);
            while (!cursor.isAfter(last)) {
              out.add(cursor);
              cursor = DateTime(cursor.year, cursor.month + 1, 1);
            }
            return out;
          case PdfViewType.quarterly:
            final out = <DateTime>[];
            var cursor = DateTime(
              exportStart.year,
              (((exportStart.month - 1) ~/ 3) * 3) + 1,
              1,
            );
            while (!cursor.isAfter(exportEnd)) {
              out.add(cursor);
              cursor = DateTime(cursor.year, cursor.month + 3, 1);
            }
            return out;
          case PdfViewType.yearly:
            return [
              for (int y = exportStart.year; y <= exportEnd.year; y++)
                DateTime(y, 1, 1),
            ];
        }
      }

      final bucketStarts = buildBucketStarts();
      final bucketMonthKeys = <List<String>>[
        for (final start in bucketStarts)
          switch (exportViewType) {
            PdfViewType.monthly => [monthKey(start)],
            PdfViewType.quarterly => [
              monthKey(start),
              monthKey(DateTime(start.year, start.month + 1, 1)),
              monthKey(DateTime(start.year, start.month + 2, 1)),
            ],
            PdfViewType.yearly => [
              for (int m = 1; m <= 12; m++)
                monthKey(DateTime(start.year, m, 1)),
            ],
          },
      ];

      double sumAllForBucket(
        Map<String, Map<String, double>> periodic,
        int bucketIdx,
      ) {
        double total = 0;
        for (final mk in bucketMonthKeys[bucketIdx]) {
          final rows = periodic[mk];
          if (rows == null) continue;
          total += rows.values.fold(0.0, (a, b) => a + b);
        }
        return total;
      }

      double sumMatchingForBucket(
        Map<String, Map<String, double>> periodic,
        int bucketIdx,
        List<String> keywords,
      ) {
        double total = 0;
        for (final mk in bucketMonthKeys[bucketIdx]) {
          final rows = periodic[mk];
          if (rows == null) continue;
          for (final entry in rows.entries) {
            final key = entry.key.toLowerCase();
            if (keywords.any((k) => key.contains(k))) {
              total += entry.value;
            }
          }
        }
        return total;
      }

      final dashboardCurrentAssets = controller.currentAssetsBreakdown.values
          .fold(0.0, (a, b) => a + b);
      final dashboardFixedAssets = controller.fixedAssetsBreakdown.values.fold(
        0.0,
        (a, b) => a + b,
      );
      final dashboardOtherAssets = controller.otherAssetsBreakdown.values.fold(
        0.0,
        (a, b) => a + b,
      );
      final dashboardCurrentLiabilities = controller
          .currentLiabilitiesBreakdown
          .values
          .fold(0.0, (a, b) => a + b);
      final dashboardLongTermLiabilities = controller
          .longTermLiabilitiesBreakdown
          .values
          .fold(0.0, (a, b) => a + b);
      final dashboardOwnerInvestment = controller.ownerEquityBreakdown.values
          .fold(0.0, (a, b) => a + b);
      final dashboardTotalAssets = controller.totalAssets.value;
      final dashboardTotalLiabilities = controller.totalLiabilities.value;
      final dashboardTotalEquity =
          dashboardTotalAssets - dashboardTotalLiabilities;

      final currentAssetsVals = <double>[];
      final fixedAssetsVals = <double>[];
      final otherAssetsVals = <double>[];
      final cashVals = <double>[];
      final arVals = <double>[];
      final inventoryVals = <double>[];
      final shortTermInvestmentsVals = <double>[];
      final ppeVals = <double>[];
      final depreciationVals = <double>[];
      final currentLiabilitiesVals = <double>[];
      final longTermLiabilitiesVals = <double>[];
      final ownerInvestmentVals = <double>[];
      final totalAssetsVals = <double>[];
      final totalLiabilitiesVals = <double>[];
      final totalEquityVals = <double>[];
      final retainedEarningsVals = <double>[];

      final useEngineColumns =
          controller.balanceSheetSnapshotSourceTransactions.isNotEmpty;
      for (int i = 0; i < yearCount; i++) {
        if (useEngineColumns) {
          final m = _balanceSheetMetricsAt(controller, columnEnds[i]);
          final curAssets = m.currentAssetsBreakdown.values.fold(
            0.0,
            (a, b) => a + b,
          );
          final fixedAssets = m.fixedAssetsBreakdown.values.fold(
            0.0,
            (a, b) => a + b,
          );
          final otherAssets = m.otherAssetsBreakdown.values.fold(
            0.0,
            (a, b) => a + b,
          );
          final curLiab = m.currentLiabilitiesBreakdown.values.fold(
            0.0,
            (a, b) => a + b,
          );
          final longLiab = m.longTermLiabilitiesBreakdown.values.fold(
            0.0,
            (a, b) => a + b,
          );
          final cash = m.currentAssetsBreakdown['Cash'] ?? 0;
          final ar = m.currentAssetsBreakdown['Accounts Receivable'] ?? 0;
          final inventory = m.currentAssetsBreakdown['Inventory'] ?? 0;
          final rawDep = pickKeywordsMap(m.fixedAssetsBreakdown, [
            'depreciation',
            'amortization',
            'accumulated',
          ]);
          final dep = rawDep > 0 ? -rawDep : rawDep;
          final ppe = fixedAssets - dep;
          final ownerInvestment = pickKeywordsMap(m.ownerEquityBreakdown, [
            'owner',
            'capital',
            'contribution',
          ]);
          final totalAssets = m.totalAssets;
          final totalLiabilities = m.totalLiabilities;
          final totalEquity = m.totalEquity;

          currentAssetsVals.add(curAssets);
          fixedAssetsVals.add(fixedAssets);
          otherAssetsVals.add(otherAssets);
          cashVals.add(cash);
          arVals.add(ar);
          inventoryVals.add(inventory);
          shortTermInvestmentsVals.add(curAssets - cash - ar - inventory);
          ppeVals.add(ppe);
          depreciationVals.add(dep);
          currentLiabilitiesVals.add(curLiab);
          longTermLiabilitiesVals.add(longLiab);
          ownerInvestmentVals.add(ownerInvestment);
          totalAssetsVals.add(totalAssets);
          totalLiabilitiesVals.add(totalLiabilities);
          totalEquityVals.add(totalEquity);
          retainedEarningsVals.add(totalEquity - ownerInvestment);
        } else {
          final curAssets = sumAllForBucket(
            controller.periodicCurrentAssetsBreakdown,
            i,
          );
          final fixedAssets = sumAllForBucket(
            controller.periodicFixedAssetsBreakdown,
            i,
          );
          final otherAssets = sumAllForBucket(
            controller.periodicOtherAssetsBreakdown,
            i,
          );
          final curLiab = sumAllForBucket(
            controller.periodicCurrentLiabilitiesBreakdown,
            i,
          );
          final longLiab = sumAllForBucket(
            controller.periodicLongTermLiabilitiesBreakdown,
            i,
          );
          final cash = sumMatchingForBucket(
            controller.periodicCurrentAssetsBreakdown,
            i,
            ['cash'],
          );
          final ar = sumMatchingForBucket(
            controller.periodicCurrentAssetsBreakdown,
            i,
            ['receivable'],
          );
          final inventory = sumMatchingForBucket(
            controller.periodicCurrentAssetsBreakdown,
            i,
            ['inventory'],
          );
          final rawDep = sumMatchingForBucket(
            controller.periodicFixedAssetsBreakdown,
            i,
            ['depreciation', 'amortization', 'accumulated'],
          );
          final dep = rawDep > 0 ? -rawDep : rawDep;
          final ppe = fixedAssets - dep;
          final ownerInvestment = sumMatchingForBucket(
            controller.periodicEquityBreakdown,
            i,
            ['owner', 'capital', 'contribution'],
          );
          final totalAssets = curAssets + fixedAssets + otherAssets;
          final totalLiabilities = curLiab + longLiab;
          final totalEquity = totalAssets - totalLiabilities;

          currentAssetsVals.add(curAssets);
          fixedAssetsVals.add(fixedAssets);
          otherAssetsVals.add(otherAssets);
          cashVals.add(cash);
          arVals.add(ar);
          inventoryVals.add(inventory);
          shortTermInvestmentsVals.add(curAssets - cash - ar - inventory);
          ppeVals.add(ppe);
          depreciationVals.add(dep);
          currentLiabilitiesVals.add(curLiab);
          longTermLiabilitiesVals.add(longLiab);
          ownerInvestmentVals.add(ownerInvestment);
          totalAssetsVals.add(totalAssets);
          totalLiabilitiesVals.add(totalLiabilities);
          totalEquityVals.add(totalEquity);
          retainedEarningsVals.add(totalEquity - ownerInvestment);
        }
      }

      if (!useEngineColumns) {
        // Keep latest visible bucket synced with dashboard values (legacy periodic path).
        final int lastIdx = yearCount - 1;
        currentAssetsVals[lastIdx] = dashboardCurrentAssets;
        fixedAssetsVals[lastIdx] = dashboardFixedAssets;
        otherAssetsVals[lastIdx] = dashboardOtherAssets;
        currentLiabilitiesVals[lastIdx] = dashboardCurrentLiabilities;
        longTermLiabilitiesVals[lastIdx] = dashboardLongTermLiabilities;
        ownerInvestmentVals[lastIdx] = dashboardOwnerInvestment;
        totalAssetsVals[lastIdx] = dashboardTotalAssets;
        totalLiabilitiesVals[lastIdx] = dashboardTotalLiabilities;
        totalEquityVals[lastIdx] = dashboardTotalEquity;
        retainedEarningsVals[lastIdx] =
            dashboardTotalEquity - dashboardOwnerInvestment;

        final cashNow = pickByKeywords(controller.currentAssetsBreakdown, [
          'cash',
        ]);
        final arNow = pickByKeywords(controller.currentAssetsBreakdown, [
          'receivable',
        ]);
        final inventoryNow = pickByKeywords(controller.currentAssetsBreakdown, [
          'inventory',
        ]);
        final rawDepNow = pickByKeywords(controller.fixedAssetsBreakdown, [
          'depreciation',
          'amortization',
          'accumulated',
        ]);
        final depNow = rawDepNow > 0 ? -rawDepNow : rawDepNow;
        cashVals[lastIdx] = cashNow;
        arVals[lastIdx] = arNow;
        inventoryVals[lastIdx] = inventoryNow;
        shortTermInvestmentsVals[lastIdx] =
            dashboardCurrentAssets - cashNow - arNow - inventoryNow;
        depreciationVals[lastIdx] = depNow;
        ppeVals[lastIdx] = dashboardFixedAssets - depNow;
      }

      final moneyFmt = NumberFormat('#,##0.00');
      String amountText(double v) {
        if (v == 0) return '\$ -';
        final core = moneyFmt.format(v.abs());
        return v < 0 ? '\$ ($core)' : '\$ $core';
      }

      final pdf = pdf_gen.PdfDocument();
      pdf.pageSettings.orientation = pdf_gen.PdfPageOrientation.portrait;
      final page = pdf.pages.add();
      final size = page.getClientSize();
      final contentX = 20.0;
      final contentWidth = size.width - (contentX * 2);
      final companyFont = pdf_gen.PdfStandardFont(
        pdf_gen.PdfFontFamily.helvetica,
        9.2,
      );
      final titleFont = pdf_gen.PdfStandardFont(
        pdf_gen.PdfFontFamily.helvetica,
        11.2,
        style: pdf_gen.PdfFontStyle.bold,
      );
      final subtitleFont = pdf_gen.PdfStandardFont(
        pdf_gen.PdfFontFamily.helvetica,
        6.4,
      );
      final bodyFont = pdf_gen.PdfStandardFont(
        pdf_gen.PdfFontFamily.helvetica,
        6.4,
      );
      final boldFont = pdf_gen.PdfStandardFont(
        pdf_gen.PdfFontFamily.helvetica,
        6.5,
        style: pdf_gen.PdfFontStyle.bold,
      );
      final smallFont = pdf_gen.PdfStandardFont(
        pdf_gen.PdfFontFamily.helvetica,
        6.1,
      );
      final templateHeaderBlue = pdf_gen.PdfColor(106, 135, 164);
      final templateTotalBand = pdf_gen.PdfColor(247, 249, 253);

      page.graphics.drawString(
        orgName,
        companyFont,
        bounds: Rect.fromLTWH(contentX, 15, contentWidth * 0.40, 14),
      );
      page.graphics.drawString(
        streetLine,
        smallFont,
        bounds: Rect.fromLTWH(contentX, 26, contentWidth * 0.40, 9),
      );
      page.graphics.drawString(
        cityStateZipLine,
        smallFont,
        bounds: Rect.fromLTWH(contentX, 35, contentWidth * 0.40, 9),
      );
      page.graphics.drawString(
        'BALANCE SHEET',
        titleFont,
        bounds: Rect.fromLTWH(
          contentX + (contentWidth * 0.58),
          15,
          contentWidth * 0.40,
          16,
        ),
        format: pdf_gen.PdfStringFormat(
          alignment: pdf_gen.PdfTextAlignment.right,
        ),
      );
      page.graphics.drawString(
        'Date Prepared: ${DateFormat('MMMM dd, yyyy').format(DateTime.now())}',
        smallFont,
        bounds: Rect.fromLTWH(
          contentX + (contentWidth * 0.58),
          27,
          contentWidth * 0.40,
          9,
        ),
        format: pdf_gen.PdfStringFormat(
          alignment: pdf_gen.PdfTextAlignment.right,
        ),
      );
      page.graphics.drawString(
        'As of ${DateFormat('MMMM dd').format(asOfDate)}',
        subtitleFont,
        bounds: Rect.fromLTWH(
          contentX + (contentWidth * 0.58),
          35,
          contentWidth * 0.40,
          10,
        ),
        format: pdf_gen.PdfStringFormat(
          alignment: pdf_gen.PdfTextAlignment.right,
        ),
      );
      page.graphics.drawLine(
        pdf_gen.PdfPen(pdf_gen.PdfColor(223, 229, 237), width: 0.4),
        Offset(contentX, 50),
        Offset(contentX + contentWidth, 50),
      );

      final grid = pdf_gen.PdfGrid();
      final colCount = 1 + yearCount;
      grid.columns.add(count: colCount);
      grid.columns[0].width = contentWidth * 0.38;
      final amountWidth = (contentWidth - grid.columns[0].width) / yearCount;
      for (int i = 0; i < yearCount; i++) {
        grid.columns[1 + i].width = amountWidth;
      }
      final header = grid.headers.add(1)[0];
      header.cells[0].value = 'ASSETS';
      for (int i = 0; i < yearCount; i++) {
        header.cells[1 + i].value = displayLabels[i];
      }
      header.style = pdf_gen.PdfGridRowStyle(
        backgroundBrush: pdf_gen.PdfSolidBrush(templateHeaderBlue),
        textBrush: pdf_gen.PdfBrushes.white,
        font: boldFont,
      );
      for (int i = 0; i < yearCount; i++) {
        header.cells[1 + i].style = pdf_gen.PdfGridCellStyle(
          format: pdf_gen.PdfStringFormat(
            alignment: pdf_gen.PdfTextAlignment.right,
            lineAlignment: pdf_gen.PdfVerticalAlignment.middle,
          ),
          borders: pdf_gen.PdfBorders(
            bottom: pdf_gen.PdfPens.transparent,
            left: pdf_gen.PdfPens.transparent,
            right: pdf_gen.PdfPens.transparent,
            top: pdf_gen.PdfPens.transparent,
          ),
        );
      }
      header.cells[0].style = pdf_gen.PdfGridCellStyle(
        borders: pdf_gen.PdfBorders(
          bottom: pdf_gen.PdfPens.transparent,
          left: pdf_gen.PdfPens.transparent,
          right: pdf_gen.PdfPens.transparent,
          top: pdf_gen.PdfPens.transparent,
        ),
      );

      void addTemplateRow(
        String label,
        List<double> values, {
        bool bold = false,
        bool shaded = false,
        bool indent = false,
      }) {
        final row = grid.rows.add();
        row.cells[0].value = indent ? '      $label' : label;
        for (int i = 0; i < yearCount; i++) {
          row.cells[1 + i].value = amountText(values[i]);
          row.cells[1 + i].style = pdf_gen.PdfGridCellStyle(
            format: pdf_gen.PdfStringFormat(
              alignment: pdf_gen.PdfTextAlignment.right,
              lineAlignment: pdf_gen.PdfVerticalAlignment.middle,
            ),
            borders: pdf_gen.PdfBorders(
              bottom: pdf_gen.PdfPens.transparent,
              left: pdf_gen.PdfPens.transparent,
              right: pdf_gen.PdfPens.transparent,
              top: pdf_gen.PdfPens.transparent,
            ),
          );
        }
        row.cells[0].style = pdf_gen.PdfGridCellStyle(
          borders: pdf_gen.PdfBorders(
            bottom: pdf_gen.PdfPens.transparent,
            left: pdf_gen.PdfPens.transparent,
            right: pdf_gen.PdfPens.transparent,
            top: pdf_gen.PdfPens.transparent,
          ),
        );
        row.style = pdf_gen.PdfGridRowStyle(
          font: bold ? boldFont : bodyFont,
          backgroundBrush: shaded
              ? pdf_gen.PdfSolidBrush(templateTotalBand)
              : null,
        );
      }

      void addTemplateTextRow(
        String label,
        List<String> values, {
        bool bold = false,
        bool shaded = false,
      }) {
        final row = grid.rows.add();
        row.cells[0].value = label;
        for (int i = 0; i < yearCount; i++) {
          row.cells[1 + i].value = values[i];
          row.cells[1 + i].style = pdf_gen.PdfGridCellStyle(
            format: pdf_gen.PdfStringFormat(
              alignment: pdf_gen.PdfTextAlignment.right,
              lineAlignment: pdf_gen.PdfVerticalAlignment.middle,
            ),
            borders: pdf_gen.PdfBorders(
              bottom: pdf_gen.PdfPens.transparent,
              left: pdf_gen.PdfPens.transparent,
              right: pdf_gen.PdfPens.transparent,
              top: pdf_gen.PdfPens.transparent,
            ),
          );
        }
        row.cells[0].style = pdf_gen.PdfGridCellStyle(
          borders: pdf_gen.PdfBorders(
            bottom: pdf_gen.PdfPens.transparent,
            left: pdf_gen.PdfPens.transparent,
            right: pdf_gen.PdfPens.transparent,
            top: pdf_gen.PdfPens.transparent,
          ),
        );
        row.style = pdf_gen.PdfGridRowStyle(
          font: bold ? boldFont : bodyFont,
          backgroundBrush: shaded
              ? pdf_gen.PdfSolidBrush(templateTotalBand)
              : null,
        );
      }

      void addHeaderRow(String title) {
        final row = grid.rows.add();
        row.cells[0].value = title;
        for (int i = 0; i < yearCount; i++) {
          row.cells[1 + i].value = displayLabels[i];
          row.cells[1 + i].style = pdf_gen.PdfGridCellStyle(
            format: pdf_gen.PdfStringFormat(
              alignment: pdf_gen.PdfTextAlignment.right,
              lineAlignment: pdf_gen.PdfVerticalAlignment.middle,
            ),
            borders: pdf_gen.PdfBorders(
              bottom: pdf_gen.PdfPens.transparent,
              left: pdf_gen.PdfPens.transparent,
              right: pdf_gen.PdfPens.transparent,
              top: pdf_gen.PdfPens.transparent,
            ),
          );
        }
        row.cells[0].style = pdf_gen.PdfGridCellStyle(
          borders: pdf_gen.PdfBorders(
            bottom: pdf_gen.PdfPens.transparent,
            left: pdf_gen.PdfPens.transparent,
            right: pdf_gen.PdfPens.transparent,
            top: pdf_gen.PdfPens.transparent,
          ),
        );
        row.style = pdf_gen.PdfGridRowStyle(
          font: boldFont,
          backgroundBrush: pdf_gen.PdfSolidBrush(templateHeaderBlue),
          textBrush: pdf_gen.PdfBrushes.white,
        );
      }

      void addPdfSectionGap() {
        final row = grid.rows.add();
        row.height = 4;
        row.cells[0].value = ' ';
        for (int i = 0; i < yearCount; i++) {
          row.cells[1 + i].value = ' ';
        }
        row.style = pdf_gen.PdfGridRowStyle(font: smallFont);
      }

      addTemplateRow(
        'CURRENT ASSETS',
        List<double>.filled(yearCount, 0),
        bold: true,
      );
      addTemplateRow('Cash', cashVals, indent: true);
      addTemplateRow('Accounts Receivable', arVals, indent: true);
      addTemplateRow('Inventory', inventoryVals, indent: true);
      addTemplateRow(
        'Prepaid Expenses',
        List<double>.filled(yearCount, 0),
        indent: true,
      );
      addTemplateRow(
        'Short-Term Investments',
        shortTermInvestmentsVals,
        indent: true,
      );
      addTemplateRow(
        'TOTAL CURRENT ASSETS',
        currentAssetsVals,
        bold: true,
        shaded: true,
      );
      addPdfSectionGap();

      addTemplateRow(
        'FIXED (LONG-TERM) ASSETS',
        List<double>.filled(yearCount, 0),
        bold: true,
      );
      addTemplateRow(
        'Long-Term Investments',
        List<double>.filled(yearCount, 0),
        indent: true,
      );
      addTemplateRow('Property, Plant, and Equipment', ppeVals, indent: true);
      addTemplateRow(
        'Intangible Assets',
        List<double>.filled(yearCount, 0),
        indent: true,
      );
      addTemplateRow(
        'Accumulated Depreciation (*enter as negative)',
        depreciationVals,
        indent: true,
      );
      addTemplateRow(
        'TOTAL FIXED (LONG-TERM) ASSETS',
        fixedAssetsVals,
        bold: true,
        shaded: true,
      );
      addPdfSectionGap();

      addTemplateRow(
        'OTHER ASSETS',
        List<double>.filled(yearCount, 0),
        bold: true,
      );
      addTemplateRow(
        'Deferred Income Tax',
        List<double>.filled(yearCount, 0),
        indent: true,
      );
      addTemplateRow('Other', otherAssetsVals, indent: true);
      addTemplateRow(
        'TOTAL OTHER ASSETS',
        otherAssetsVals,
        bold: true,
        shaded: true,
      );
      addTemplateRow('TOTAL ASSETS', totalAssetsVals, bold: true, shaded: true);
      addPdfSectionGap();

      addHeaderRow("LIABILITIES AND OWNER'S EQUITY");
      addTemplateRow(
        'CURRENT LIABILITIES',
        List<double>.filled(yearCount, 0),
        bold: true,
      );
      addTemplateRow('Accounts Payable', currentLiabilitiesVals, indent: true);
      addTemplateRow(
        'Short-Term Loans',
        List<double>.filled(yearCount, 0),
        indent: true,
      );
      addTemplateRow(
        'Income Taxes Payable',
        List<double>.filled(yearCount, 0),
        indent: true,
      );
      addTemplateRow(
        'Accrued Salaries and Wages',
        List<double>.filled(yearCount, 0),
        indent: true,
      );
      addTemplateRow(
        'Unearned Revenue',
        List<double>.filled(yearCount, 0),
        indent: true,
      );
      addTemplateRow(
        'Current Portion of Long-Term Debt',
        List<double>.filled(yearCount, 0),
        indent: true,
      );
      addTemplateRow(
        'TOTAL CURRENT LIABILITIES',
        currentLiabilitiesVals,
        bold: true,
        shaded: true,
      );
      addPdfSectionGap();

      addTemplateRow(
        'LONG-TERM LIABILITIES',
        List<double>.filled(yearCount, 0),
        bold: true,
      );
      addTemplateRow('Long-term debt', longTermLiabilitiesVals, indent: true);
      addTemplateRow(
        'Deferred income tax',
        List<double>.filled(yearCount, 0),
        indent: true,
      );
      addTemplateRow('Other', List<double>.filled(yearCount, 0), indent: true);
      addTemplateRow(
        'TOTAL LONG-TERM LIABILITIES',
        longTermLiabilitiesVals,
        bold: true,
        shaded: true,
      );
      addPdfSectionGap();
      addTemplateRow(
        'TOTAL LIABILITIES',
        totalLiabilitiesVals,
        bold: true,
        shaded: true,
      );

      addTemplateRow(
        "OWNER'S EQUITY",
        List<double>.filled(yearCount, 0),
        bold: true,
      );
      addTemplateRow('Owners Investment', ownerInvestmentVals, indent: true);
      addTemplateRow('Retained Earnings', retainedEarningsVals, indent: true);
      addTemplateRow('Other', List<double>.filled(yearCount, 0), indent: true);
      addTemplateRow(
        "TOTAL OWNER'S EQUITY",
        totalEquityVals,
        bold: true,
        shaded: true,
      );
      addTemplateRow(
        "TOTAL LIABILITIES AND OWNER'S EQUITY",
        List<double>.generate(
          yearCount,
          (i) => totalLiabilitiesVals[i] + totalEquityVals[i],
        ),
        bold: true,
        shaded: true,
      );
      grid.style = pdf_gen.PdfGridStyle(
        cellPadding: pdf_gen.PdfPaddings(
          left: 1,
          right: 1,
          top: 3.6,
          bottom: 3.6,
        ),
      );
      grid.draw(
        page: page,
        bounds: Rect.fromLTWH(contentX, 54, contentWidth, 0),
      );

      final bytes = await pdf.save();
      pdf.dispose();
      await downloadFile(
        'Balance_Sheet_${DateFormat('yyyyMMdd').format(asOfDate)}.pdf',
        bytes,
        mimeType: 'application/pdf',
      );
    } catch (e, st) {
      dev.log('PDF Export Error: $e\n$st');
      showSnackBar('Please review PDF generation: $e', isError: true);
    }
  }

  String _formatCurrency(double value) {
    final formatted = NumberFormat("#,##0.00").format(value.abs());
    return value < 0 ? '(\$$formatted)' : '\$$formatted';
  }
}

class _BreakdownSection {
  final String title;
  final Map<String, double> items;

  _BreakdownSection({required this.title, required this.items});
}
