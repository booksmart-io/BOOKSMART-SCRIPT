// ignore_for_file: depend_on_referenced_packages, unused_element, unused_local_variable, dead_code

import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:booksmart/constant/app_colors.dart';
import 'package:booksmart/widgets/app_text.dart';
import 'package:get/get.dart';

import 'package:booksmart/modules/user/controllers/financial_report_controller.dart';
import 'package:booksmart/modules/user/controllers/organization_controller.dart';
import 'package:booksmart/modules/user/ui/financial_statement/export_modal_widget.dart';
import 'package:booksmart/modules/user/ui/financial_statement/pdf_export_service.dart';
import 'package:booksmart/modules/common/controllers/auth_controller.dart';
import 'package:intl/intl.dart';
import 'package:syncfusion_flutter_datepicker/datepicker.dart';
import 'package:booksmart/modules/user/ui/tax_filling/upload_tax_doc_dialog.dart';
import 'package:booksmart/widgets/recent_documents_widget.dart';
import 'package:booksmart/widgets/kpi_info_tooltip.dart';
import 'package:syncfusion_flutter_pdf/pdf.dart' as pdf_gen;
import 'dart:convert';
import 'dart:developer' as dev;
import 'package:booksmart/widgets/snackbar.dart';
import 'dart:ui' as ui;
import 'package:booksmart/utils/downloader.dart';
import 'package:excel/excel.dart' as excel_lib;
import 'package:archive/archive.dart';
import 'package:xml/xml.dart';
import 'dart:math' as math;
import 'package:booksmart/models/transaction_model.dart';
import 'package:booksmart/supabase/tables.dart';
import 'package:booksmart/utils/supabase.dart';

class ProfitLossScreen extends StatefulWidget {
  const ProfitLossScreen({super.key});

  @override
  State<ProfitLossScreen> createState() => _ProfitLossScreenState();
}

class _PnlExportData {
  const _PnlExportData({
    required this.incomeBreakdown,
    required this.expenseBreakdown,
    required this.periodicIncomeBreakdown,
    required this.periodicExpenseBreakdown,
    required this.periodicNetIncome,
    required this.totalIncome,
    required this.totalExpenses,
    required this.netIncome,
  });

  final Map<String, double> incomeBreakdown;
  final Map<String, double> expenseBreakdown;
  final Map<String, Map<String, double>> periodicIncomeBreakdown;
  final Map<String, Map<String, double>> periodicExpenseBreakdown;
  final Map<String, double> periodicNetIncome;
  final double totalIncome;
  final double totalExpenses;
  final double netIncome;
}

class _ExcelYearBlock {
  const _ExcelYearBlock({
    required this.year,
    required this.totalCol,
    required this.monthCols,
  });

  final int year;
  final int totalCol;
  final List<int> monthCols;
}

class _ProfitLossScreenState extends State<ProfitLossScreen>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  // 0: 7d, 1: 30d, 2: 3mo, 3: 12mo, 4: Yearly, 5: Custom
  int _selectedFilterIdx = 2;
  int? _selectedYear;
  DateTime? _startDate;
  DateTime? _endDate;

  bool _showRevenue = true;
  bool _showExpenses = true;
  bool _showProfit = true;
  bool _comparePriorPeriod = false;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    _startDate = today.subtract(const Duration(days: 89));
    _endDate = today;
  }

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
                  color: isDark ? Colors.white : Colors.black87,
                ),
                const SizedBox(height: 24),
                SfDateRangePicker(
                  view: DateRangePickerView.month,
                  selectionMode: DateRangePickerSelectionMode.range,
                  headerStyle: DateRangePickerHeaderStyle(
                    textStyle: TextStyle(
                      color: isDark ? Colors.white : Colors.black87,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  monthCellStyle: DateRangePickerMonthCellStyle(
                    textStyle: TextStyle(
                      color: isDark ? Colors.white70 : Colors.black54,
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
    final List<int> years = List.generate(5, (index) => currentYear - index);
    final bool isSelected = _selectedFilterIdx == 4;

    return PopupMenuButton<int>(
      offset: const Offset(0, 40),
      onSelected: (year) => _updateFilter(4, controller, year: year),
      itemBuilder: (context) => years
          .map(
            (y) => PopupMenuItem(
              value: y,
              child: Text(
                y.toString().replaceAll(RegExp(r'[^0-9]'), ''),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 13,
                  fontFamily: 'Outfit',
                ),
              ),
            ),
          )
          .toList(),
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
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              isSelected
                  ? (_selectedYear?.toString().replaceAll(
                          RegExp(r'[^0-9]'),
                          '',
                        ) ??
                        "Yearly")
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

  // Removed hardcoded monthly data, will use controller.monthlyData

  void _exportCSV(FinancialReportController controller) async {
    final buffer = StringBuffer();
    final String orgName = getCurrentOrganization?.name ?? 'Organization';
    final String periodLabel =
        "${DateFormat('MM-dd-yyyy').format(_startDate ?? DateTime.now())}_to_${DateFormat('MM-dd-yyyy').format(_endDate ?? DateTime.now())}";

    buffer.writeln('Profit & Loss Statement - $orgName');
    buffer.writeln('Period: $periodLabel');
    buffer.writeln('');

    buffer.writeln('INCOME');
    buffer.writeln('Description,Amount');
    controller.incomeBreakdown.forEach((title, amount) {
      buffer.writeln('"$title",${amount.toStringAsFixed(2)}');
    });
    buffer.writeln(
      'Total Income,,${controller.totalIncome.value.toStringAsFixed(2)}',
    );
    buffer.writeln('');

    buffer.writeln('EXPENSES');
    buffer.writeln('Description,Amount');
    controller.expenseBreakdown.forEach((title, amount) {
      buffer.writeln('"$title",${amount.toStringAsFixed(2)}');
    });
    buffer.writeln(
      'Total Expenses,,${controller.totalExpenses.value.toStringAsFixed(2)}',
    );
    buffer.writeln('');

    buffer.writeln(
      'NET PROFIT/LOSS,,${controller.netIncome.value.toStringAsFixed(2)}',
    );

    final csvBytes = utf8.encode(buffer.toString());
    await downloadFile(
      '${orgName}_PL_$periodLabel.csv',
      csvBytes,
      mimeType: 'text/csv',
    );
  }

  Future<void> _exportPDF(FinancialReportController controller) async {
    try {
      if (_startDate == null || _endDate == null) {
        showSnackBar('Please select a valid date range.', isError: true);
        return;
      }
      final pdf_gen.PdfDocument document = pdf_gen.PdfDocument();
      document.pageSettings.margins.all = 0; // Modern look

      // [1. Determine Periodicity and Columns BEFORE adding any page]
      final int totalMonths =
          (_endDate!.year - _startDate!.year) * 12 +
          _endDate!.month -
          _startDate!.month +
          1;
      final bool useYearly = totalMonths > 12;

      List<String> periodKeys = [];
      List<String> periodLabels = [];

      if (useYearly) {
        for (int y = _startDate!.year; y <= _endDate!.year; y++) {
          periodKeys.add(y.toString());
          periodLabels.add(y.toString());
        }
      } else {
        DateTime current = DateTime(_startDate!.year, _startDate!.month, 1);
        final end = DateTime(_endDate!.year, _endDate!.month, 1);
        while (current.isBefore(end) || current.isAtSameMomentAs(end)) {
          periodKeys.add(DateFormat('yyyy-MM').format(current));
          periodLabels.add(DateFormat('MMM yyyy').format(current));
          current = DateTime(current.year, current.month + 1, 1);
        }
      }
      final exportData = await _buildPnlExportData(_startDate!, _endDate!);

      // Set orientation BEFORE adding the first page to avoid a blank portrait page
      if (periodKeys.length > 3) {
        document.pageSettings.orientation =
            pdf_gen.PdfPageOrientation.landscape;
      }

      pdf_gen.PdfPage page = document.pages.add();
      pdf_gen.PdfGraphics graphics = page.graphics;
      ui.Size size = page.getClientSize();

      // [Colors and Fonts]
      final pdf_gen.PdfColor navyColor = pdf_gen.PdfColor(15, 30, 55);
      final pdf_gen.PdfColor blueHeaderBg = pdf_gen.PdfColor(214, 230, 248);
      final pdf_gen.PdfColor tableHeaderBg = pdf_gen.PdfColor(240, 242, 245);
      final pdf_gen.PdfColor textSecondaryColor = pdf_gen.PdfColor(
        100,
        100,
        100,
      );

      final pdf_gen.PdfFont titleFont = pdf_gen.PdfStandardFont(
        pdf_gen.PdfFontFamily.helvetica,
        18,
        style: pdf_gen.PdfFontStyle.bold,
      );
      final pdf_gen.PdfFont headerFont = pdf_gen.PdfStandardFont(
        pdf_gen.PdfFontFamily.helvetica,
        10,
        style: pdf_gen.PdfFontStyle.bold,
      );
      final pdf_gen.PdfFont boldFont = pdf_gen.PdfStandardFont(
        pdf_gen.PdfFontFamily.helvetica,
        9,
        style: pdf_gen.PdfFontStyle.bold,
      );
      final pdf_gen.PdfFont regularFont = pdf_gen.PdfStandardFont(
        pdf_gen.PdfFontFamily.helvetica,
        9,
      );
      final pdf_gen.PdfFont smallFont = pdf_gen.PdfStandardFont(
        pdf_gen.PdfFontFamily.helvetica,
        8,
      );

      // [1. Header Area]
      graphics.drawRectangle(
        brush: pdf_gen.PdfSolidBrush(blueHeaderBg),
        bounds: Rect.fromLTWH(0, 0, size.width, 85),
      );

      graphics.drawString(
        'Profit & Loss Statement',
        titleFont,
        bounds: Rect.fromLTWH(size.width - 250, 10, 230, 30),
        format: pdf_gen.PdfStringFormat(
          alignment: pdf_gen.PdfTextAlignment.right,
        ),
      );

      void drawHeaderField(String label, String value, double x, double y) {
        graphics.drawString(
          label.toUpperCase(),
          smallFont,
          brush: pdf_gen.PdfSolidBrush(textSecondaryColor),
          bounds: Rect.fromLTWH(x, y, 100, 12),
        );
        graphics.drawRectangle(
          brush: pdf_gen.PdfBrushes.white,
          bounds: Rect.fromLTWH(x, y + 10, 180, 14),
        );
        graphics.drawString(
          value,
          regularFont,
          bounds: Rect.fromLTWH(x + 5, y + 10, 170, 14),
          format: pdf_gen.PdfStringFormat(
            lineAlignment: pdf_gen.PdfVerticalAlignment.middle,
          ),
        );
      }

      final String orgName =
          getCurrentOrganization?.name ?? 'Organization Name';
      final String periodStr =
          "${DateFormat('MM/dd/yyyy').format(_startDate ?? DateTime.now())} to ${DateFormat('MM/dd/yyyy').format(_endDate ?? DateTime.now())}";
      final String preparedBy =
          "${authPerson?.firstName ?? 'Admin'} ${authPerson?.lastName ?? ''}"
              .trim();
      final String datePrepared = DateFormat(
        'MM/dd/yyyy',
      ).format(DateTime.now());

      drawHeaderField('Organization Name', orgName, 140, 38);
      drawHeaderField('Period Covered', periodStr, 340, 38);
      drawHeaderField('Prepared By', preparedBy, 140, 62);
      drawHeaderField('Date Prepared', datePrepared, 340, 62);

      graphics.drawRectangle(
        brush: pdf_gen.PdfSolidBrush(navyColor),
        bounds: Rect.fromLTWH(30, 20, 60, 60),
      );
      graphics.drawString(
        'BS',
        titleFont,
        brush: pdf_gen.PdfBrushes.white,
        bounds: Rect.fromLTWH(30, 20, 60, 60),
        format: pdf_gen.PdfStringFormat(
          alignment: pdf_gen.PdfTextAlignment.center,
          lineAlignment: pdf_gen.PdfVerticalAlignment.middle,
        ),
      );

      double currentY = 100;
      final money = NumberFormat.currency(symbol: '\$', decimalDigits: 2);
      String fmtMoney(double v) => money.format(v);

      // Helper to aggregate data by year if needed
      Map<String, double> getPeriodicData(
        Map<String, Map<String, double>> periodicMap,
        String periodKey,
        String category,
      ) {
        if (useYearly) {
          double total = 0;
          periodicMap.forEach((mKey, categories) {
            if (mKey.startsWith(periodKey)) total += categories[category] ?? 0;
          });
          return {category: total};
        } else {
          return {category: periodicMap[periodKey]?[category] ?? 0};
        }
      }

      // [2. INCOME Table]
      final incomeGrid = pdf_gen.PdfGrid();
      int colCount = 1 + periodKeys.length + 1; // Description + Periods + Total
      incomeGrid.columns.add(count: colCount);
      incomeGrid.columns[0].width = 180;
      for (int i = 1; i < colCount; i++) {
        incomeGrid.columns[i].width = (size.width - 220) / (colCount - 1);
      }

      final incHeaderRow = incomeGrid.rows.add();
      incHeaderRow.cells[0].value = 'INCOME';
      incHeaderRow.cells[0].columnSpan = colCount;
      incHeaderRow.style = pdf_gen.PdfGridCellStyle(
        backgroundBrush: pdf_gen.PdfSolidBrush(navyColor),
        textBrush: pdf_gen.PdfBrushes.white,
        font: headerFont,
      );

      final incHeadRow = incomeGrid.rows.add();
      incHeadRow.cells[0].value = 'Description';
      for (int i = 0; i < periodLabels.length; i++) {
        incHeadRow.cells[i + 1].value = periodLabels[i];
      }
      incHeadRow.cells[colCount - 1].value = 'TOTAL';
      for (int i = 0; i < colCount; i++) {
        incHeadRow.cells[i].style = pdf_gen.PdfGridCellStyle(
          backgroundBrush: pdf_gen.PdfSolidBrush(tableHeaderBg),
          font: boldFont,
        );
      }

      exportData.incomeBreakdown.keys.toList().forEach((title) {
        final row = incomeGrid.rows.add();
        row.cells[0].value = title;
        double rowTotal = 0;
        for (int i = 0; i < periodKeys.length; i++) {
          double val = getPeriodicData(
            exportData.periodicIncomeBreakdown,
            periodKeys[i],
            title,
          ).values.first;
          row.cells[i + 1].value = fmtMoney(val);
          row.cells[i + 1].style = pdf_gen.PdfGridCellStyle(
            format: pdf_gen.PdfStringFormat(
              alignment: pdf_gen.PdfTextAlignment.right,
            ),
          );
          rowTotal += val;
        }
        row.cells[colCount - 1].value = fmtMoney(rowTotal);
        row.cells[colCount - 1].style = pdf_gen.PdfGridCellStyle(
          font: boldFont,
          format: pdf_gen.PdfStringFormat(
            alignment: pdf_gen.PdfTextAlignment.right,
          ),
        );
      });

      final totalIncRow = incomeGrid.rows.add();
      totalIncRow.cells[0].value = 'Total Income';
      totalIncRow.cells[0].style = pdf_gen.PdfGridCellStyle(font: boldFont);
      for (int i = 0; i < periodKeys.length; i++) {
        double pTotal = 0;
        if (useYearly) {
          exportData.periodicIncomeBreakdown.forEach((mKey, cats) {
            if (mKey.startsWith(periodKeys[i])) {
              for (var v in cats.values) {
                pTotal += v;
              }
            }
          });
        } else {
          exportData.periodicIncomeBreakdown[periodKeys[i]]?.values.forEach(
            (v) => pTotal += v,
          );
        }
        totalIncRow.cells[i + 1].value = fmtMoney(pTotal);
        totalIncRow.cells[i + 1].style = pdf_gen.PdfGridCellStyle(
          font: boldFont,
          format: pdf_gen.PdfStringFormat(
            alignment: pdf_gen.PdfTextAlignment.right,
          ),
        );
      }
      totalIncRow.cells[colCount - 1].value = fmtMoney(exportData.totalIncome);
      totalIncRow.cells[colCount - 1].style = pdf_gen.PdfGridCellStyle(
        font: boldFont,
        format: pdf_gen.PdfStringFormat(
          alignment: pdf_gen.PdfTextAlignment.right,
        ),
      );

      var result = incomeGrid.draw(
        page: page,
        bounds: Rect.fromLTWH(20, currentY, size.width - 40, 0),
      )!;
      page = result.page;
      graphics = page.graphics;
      currentY = result.bounds.bottom + 20;

      // [3. EXPENSES Table]
      final expGrid = pdf_gen.PdfGrid();
      expGrid.columns.add(count: colCount);
      expGrid.columns[0].width = 180;
      for (int i = 1; i < colCount; i++) {
        expGrid.columns[i].width = (size.width - 220) / (colCount - 1);
      }

      final expHeaderRow = expGrid.rows.add();
      expHeaderRow.cells[0].value = 'EXPENSES';
      expHeaderRow.cells[0].columnSpan = colCount;
      expHeaderRow.style = pdf_gen.PdfGridCellStyle(
        backgroundBrush: pdf_gen.PdfSolidBrush(navyColor),
        textBrush: pdf_gen.PdfBrushes.white,
        font: headerFont,
      );

      final expHeadRow = expGrid.rows.add();
      expHeadRow.cells[0].value = 'Description';
      for (int i = 0; i < periodLabels.length; i++) {
        expHeadRow.cells[i + 1].value = periodLabels[i];
      }
      expHeadRow.cells[colCount - 1].value = 'TOTAL';
      for (int i = 0; i < colCount; i++) {
        expHeadRow.cells[i].style = pdf_gen.PdfGridCellStyle(
          backgroundBrush: pdf_gen.PdfSolidBrush(tableHeaderBg),
          font: boldFont,
        );
      }

      exportData.expenseBreakdown.keys.toList().forEach((title) {
        final row = expGrid.rows.add();
        row.cells[0].value = title;
        double rowTotal = 0;
        for (int i = 0; i < periodKeys.length; i++) {
          double val = getPeriodicData(
            exportData.periodicExpenseBreakdown,
            periodKeys[i],
            title,
          ).values.first;
          row.cells[i + 1].value = fmtMoney(val);
          row.cells[i + 1].style = pdf_gen.PdfGridCellStyle(
            format: pdf_gen.PdfStringFormat(
              alignment: pdf_gen.PdfTextAlignment.right,
            ),
          );
          rowTotal += val;
        }
        row.cells[colCount - 1].value = fmtMoney(rowTotal);
        row.cells[colCount - 1].style = pdf_gen.PdfGridCellStyle(
          font: boldFont,
          format: pdf_gen.PdfStringFormat(
            alignment: pdf_gen.PdfTextAlignment.right,
          ),
        );
      });

      final totalExpRow = expGrid.rows.add();
      totalExpRow.cells[0].value = 'Total Expenses';
      totalExpRow.cells[0].style = pdf_gen.PdfGridCellStyle(font: boldFont);
      for (int i = 0; i < periodKeys.length; i++) {
        double pTotal = 0;
        if (useYearly) {
          exportData.periodicExpenseBreakdown.forEach((mKey, cats) {
            if (mKey.startsWith(periodKeys[i])) {
              for (var v in cats.values) {
                pTotal += v;
              }
            }
          });
        } else {
          exportData.periodicExpenseBreakdown[periodKeys[i]]?.values.forEach(
            (v) => pTotal += v,
          );
        }
        totalExpRow.cells[i + 1].value = fmtMoney(pTotal);
        totalExpRow.cells[i + 1].style = pdf_gen.PdfGridCellStyle(
          font: boldFont,
          format: pdf_gen.PdfStringFormat(
            alignment: pdf_gen.PdfTextAlignment.right,
          ),
        );
      }
      totalExpRow.cells[colCount - 1].value = fmtMoney(
        exportData.totalExpenses,
      );
      totalExpRow.cells[colCount - 1].style = pdf_gen.PdfGridCellStyle(
        font: boldFont,
        format: pdf_gen.PdfStringFormat(
          alignment: pdf_gen.PdfTextAlignment.right,
        ),
      );

      result = expGrid.draw(
        page: page,
        bounds: Rect.fromLTWH(20, currentY, size.width - 40, 0),
      )!;
      page = result.page;
      graphics = page.graphics;
      currentY = result.bounds.bottom + 20;

      // [4. Summary Row (Net Income)]
      graphics.drawRectangle(
        brush: pdf_gen.PdfSolidBrush(navyColor),
        bounds: Rect.fromLTWH(20, currentY, size.width - 40, 25),
      );
      graphics.drawString(
        'NET PROFIT / LOSS',
        headerFont,
        brush: pdf_gen.PdfBrushes.white,
        bounds: Rect.fromLTWH(30, currentY, 200, 25),
        format: pdf_gen.PdfStringFormat(
          lineAlignment: pdf_gen.PdfVerticalAlignment.middle,
        ),
      );

      double labelX = 200;
      double colW = (size.width - 220) / (colCount - 1);
      for (int i = 0; i < periodKeys.length; i++) {
        double pNet = 0;
        if (useYearly) {
          exportData.periodicNetIncome.forEach((mKey, val) {
            if (mKey.startsWith(periodKeys[i])) pNet += val;
          });
        } else {
          pNet = exportData.periodicNetIncome[periodKeys[i]] ?? 0;
        }
        graphics.drawString(
          fmtMoney(pNet),
          boldFont,
          brush: pdf_gen.PdfBrushes.white,
          bounds: Rect.fromLTWH(labelX, currentY, colW, 25),
          format: pdf_gen.PdfStringFormat(
            alignment: pdf_gen.PdfTextAlignment.right,
            lineAlignment: pdf_gen.PdfVerticalAlignment.middle,
          ),
        );
        labelX += colW;
      }
      graphics.drawString(
        fmtMoney(exportData.netIncome),
        headerFont,
        brush: pdf_gen.PdfBrushes.white,
        bounds: Rect.fromLTWH(size.width - 120, currentY, 100, 25),
        format: pdf_gen.PdfStringFormat(
          alignment: pdf_gen.PdfTextAlignment.right,
          lineAlignment: pdf_gen.PdfVerticalAlignment.middle,
        ),
      );

      currentY += 40;
      graphics.drawString(
        'Note',
        boldFont,
        bounds: Rect.fromLTWH(20, currentY, 100, 15),
      );
      graphics.drawLine(
        pdf_gen.PdfPen(pdf_gen.PdfColor(200, 200, 200), width: 0.5),
        Offset(20, currentY + 18),
        Offset(size.width - 20, currentY + 18),
      );

      currentY += 40;
      graphics.drawLine(
        pdf_gen.PdfPen(textSecondaryColor, width: 0.5),
        Offset(size.width - 220, currentY),
        Offset(size.width - 120, currentY),
      );
      graphics.drawLine(
        pdf_gen.PdfPen(textSecondaryColor, width: 0.5),
        Offset(size.width - 100, currentY),
        Offset(size.width - 20, currentY),
      );
      graphics.drawString(
        'VERIFIED BY',
        smallFont,
        brush: pdf_gen.PdfSolidBrush(textSecondaryColor),
        bounds: Rect.fromLTWH(size.width - 220, currentY + 2, 100, 15),
      );
      graphics.drawString(
        'DATE',
        smallFont,
        brush: pdf_gen.PdfSolidBrush(textSecondaryColor),
        bounds: Rect.fromLTWH(size.width - 100, currentY + 2, 80, 15),
      );

      final List<int> bytes = await document.save();
      document.dispose();
      await downloadFile(
        '${orgName.replaceAll(' ', '_')}_Periodic_PL.pdf',
        bytes,
        mimeType: 'application/pdf',
      );
    } catch (e, st) {
      dev.log('PDF Export Error: $e\n$st');
      showSnackBar('Please review PDF generation: $e', isError: true);
    }
  }

  void _exportExcel(
    FinancialReportController controller,
    PdfExportRequest request,
  ) async {
    await _exportExcelLikePdf(controller, request);
  }

  Future<void> _exportExcelLikePdf(
    FinancialReportController controller,
    PdfExportRequest request,
  ) async {
    try {
      final exportData = await _buildPnlPdfData(request);
      final labels = PdfExportService().buildBucketLabels(
        request.startDate,
        request.endDate,
        request.viewType,
      );
      if (labels.isEmpty) {
        showSnackBar(
          'No periods available for selected date range.',
          isError: true,
        );
        return;
      }

      final excel = excel_lib.Excel.createExcel();
      final sheet = excel['P&L Statement'];
      final existingSheets = List<String>.from(excel.tables.keys);
      for (final name in existingSheets) {
        if (name.toLowerCase().startsWith('sheet') && name != 'P&L Statement') {
          excel.delete(name);
        }
      }

      final orgName = getCurrentOrganization?.name ?? request.companyName;
      final addressLines = request.companyAddress
          .split('\n')
          .map((e) => e.trim())
          .where((e) => e.isNotEmpty)
          .toList();
      final line1 = addressLines.isNotEmpty
          ? addressLines.first
          : 'Address not available';
      final line2 = addressLines.length > 1 ? addressLines[1] : '';
      const headerBand = 'FF8596B0';
      const totalBand = 'FFEAEDF4';

      final titleStyle = excel_lib.CellStyle(
        bold: true,
        fontSize: 14,
        fontFamily: excel_lib.getFontFamily(excel_lib.FontFamily.Calibri),
        horizontalAlign: excel_lib.HorizontalAlign.Left,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final metaStyle = excel_lib.CellStyle(
        fontSize: 11,
        fontFamily: excel_lib.getFontFamily(excel_lib.FontFamily.Calibri),
        horizontalAlign: excel_lib.HorizontalAlign.Left,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final statementBannerStyle = excel_lib.CellStyle(
        bold: true,
        fontSize: 16,
        fontFamily: excel_lib.getFontFamily(excel_lib.FontFamily.Calibri),
        horizontalAlign: excel_lib.HorizontalAlign.Right,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final periodBannerStyle = excel_lib.CellStyle(
        fontSize: 11,
        fontFamily: excel_lib.getFontFamily(excel_lib.FontFamily.Calibri),
        horizontalAlign: excel_lib.HorizontalAlign.Right,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final metaDatePreparedStyle = excel_lib.CellStyle(
        fontSize: 11,
        fontFamily: excel_lib.getFontFamily(excel_lib.FontFamily.Calibri),
        horizontalAlign: excel_lib.HorizontalAlign.Right,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final sectionStyle = excel_lib.CellStyle(
        bold: true,
        fontSize: 10,
        fontFamily: excel_lib.getFontFamily(excel_lib.FontFamily.Calibri),
        fontColorHex: excel_lib.ExcelColor.fromHexString('FF111111'),
        backgroundColorHex: excel_lib.ExcelColor.fromHexString(headerBand),
        horizontalAlign: excel_lib.HorizontalAlign.Left,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final sectionPeriodStyle = sectionStyle.copyWith(
        horizontalAlignVal: excel_lib.HorizontalAlign.Center,
      );
      final labelStyle = excel_lib.CellStyle(
        fontSize: 10,
        fontFamily: excel_lib.getFontFamily(excel_lib.FontFamily.Calibri),
        horizontalAlign: excel_lib.HorizontalAlign.Left,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final totalLabelStyle = excel_lib.CellStyle(
        bold: true,
        fontSize: 10,
        fontFamily: excel_lib.getFontFamily(excel_lib.FontFamily.Calibri),
        backgroundColorHex: excel_lib.ExcelColor.fromHexString(totalBand),
        horizontalAlign: excel_lib.HorizontalAlign.Left,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final valueStyle = excel_lib.CellStyle(
        numberFormat: const excel_lib.CustomNumericNumFormat(
          formatCode: r'$#,##0.00;[Red]($#,##0.00);$-',
        ),
        fontSize: 10,
        fontFamily: excel_lib.getFontFamily(excel_lib.FontFamily.Calibri),
        horizontalAlign: excel_lib.HorizontalAlign.Right,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final valueTotalStyle = valueStyle.copyWith(
        boldVal: true,
        backgroundColorHexVal: excel_lib.ExcelColor.fromHexString(totalBand),
      );
      final emptyPeriodValueStyle = excel_lib.CellStyle(
        fontSize: 10,
        fontFamily: excel_lib.getFontFamily(excel_lib.FontFamily.Calibri),
        horizontalAlign: excel_lib.HorizontalAlign.Right,
        verticalAlign: excel_lib.VerticalAlign.Center,
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

      // Wider period columns so currency does not render as ####### in Excel.
      final double descriptionWidth = labels.length <= 4 ? 54.0 : 48.0;
      final double periodWidth = labels.length <= 4 ? 24.0 : 22.0;
      sheet.setColumnWidth(0, descriptionWidth);
      for (int i = 0; i < labels.length; i++) {
        sheet.setColumnWidth(1 + i, periodWidth);
      }

      final lastCol = labels.length;
      void mergeRow(int r, int fromC, int toC) {
        if (toC > fromC) {
          sheet.merge(
            excel_lib.CellIndex.indexByColumnRow(
              columnIndex: fromC,
              rowIndex: r,
            ),
            excel_lib.CellIndex.indexByColumnRow(columnIndex: toC, rowIndex: r),
          );
        }
      }

      /// Header row: col A = company/meta (left), cols B..last = title or dates (right).
      void writeHeaderPairRow(
        int r,
        excel_lib.CellValue left,
        excel_lib.CellStyle? leftStyle,
        excel_lib.CellValue right,
        excel_lib.CellStyle? rightStyle,
        double rowHeight,
      ) {
        setCell(0, r, left, leftStyle);
        if (lastCol >= 1) {
          if (lastCol > 1) {
            mergeRow(r, 1, lastCol);
          }
          setCell(1, r, right, rightStyle);
        }
        sheet.setRowHeight(r, rowHeight);
      }

      final periodRangeText =
          'For the Period ${DateFormat('MMM d, yyyy').format(request.startDate)} to ${DateFormat('MMM d, yyyy').format(request.endDate)}';

      var row = 0;
      writeHeaderPairRow(
        row,
        excel_lib.TextCellValue(orgName),
        titleStyle,
        excel_lib.TextCellValue('Profit & Loss Statement'),
        statementBannerStyle,
        32,
      );
      row++;

      writeHeaderPairRow(
        row,
        excel_lib.TextCellValue(line1),
        metaStyle,
        excel_lib.TextCellValue(periodRangeText),
        periodBannerStyle,
        22,
      );
      row++;

      writeHeaderPairRow(
        row,
        excel_lib.TextCellValue(line2.isNotEmpty ? line2 : ''),
        metaStyle,
        excel_lib.TextCellValue(
          'Date Prepared: ${DateFormat('MM/dd/yyyy').format(DateTime.now())}',
        ),
        metaDatePreparedStyle,
        20,
      );
      row++;

      sheet.setRowHeight(row, 14);
      row++;
      void writeSection(
        String title,
        List<PnlPdfRowData> rows, {
        bool showPeriodsInHeader = false,
      }) {
        for (int c = 0; c <= labels.length; c++) {
          setCell(c, row, excel_lib.TextCellValue(''), sectionStyle);
        }
        setCell(0, row, excel_lib.TextCellValue(' $title'), sectionStyle);
        if (showPeriodsInHeader) {
          for (int i = 0; i < labels.length; i++) {
            setCell(
              1 + i,
              row,
              excel_lib.TextCellValue(labels[i]),
              sectionPeriodStyle,
            );
          }
        }
        sheet.setRowHeight(row, 21);
        row++;

        for (final item in rows) {
          final isTotal = item.isBold;
          setCell(
            0,
            row,
            excel_lib.TextCellValue(
              isTotal ? item.label : '     ${item.label}',
            ),
            isTotal ? totalLabelStyle : labelStyle,
          );
          for (int i = 0; i < labels.length; i++) {
            final double val = i < item.values.length ? item.values[i] : 0.0;
            if (!isTotal && val.abs() < 1e-12) {
              setCell(
                1 + i,
                row,
                excel_lib.TextCellValue(''),
                emptyPeriodValueStyle,
              );
            } else {
              setCell(
                1 + i,
                row,
                excel_lib.DoubleCellValue(val),
                isTotal ? valueTotalStyle : valueStyle,
              );
            }
          }
          sheet.setRowHeight(row, isTotal ? 21 : 19);
          row++;
        }
        for (int c = 0; c <= labels.length; c++) {
          setCell(c, row, excel_lib.TextCellValue(''), labelStyle);
        }
        sheet.setRowHeight(row, 14);
        row++;
      }

      for (int i = 0; i < exportData.sections.length; i++) {
        final section = exportData.sections[i];
        writeSection(section.title, section.rows, showPeriodsInHeader: i == 0);
      }

      // Final Net Income section to mirror PDF summary.
      writeSection('Net Income', [
        PnlPdfRowData(
          label: 'Net Income (Loss)',
          values: exportData.netProfit,
          isBold: true,
        ),
      ]);

      final rawBytes = excel.encode();
      if (rawBytes == null) throw Exception('Unable to generate Excel file.');
      final bytes = _disableExcelGridlines(rawBytes);
      await downloadFile(
        '${orgName.replaceAll(' ', '_')}_Profit_Loss_Statement.xlsx',
        bytes,
        mimeType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    } catch (e, st) {
      dev.log('Excel Export Error: $e\n$st');
      showSnackBar('Please review Excel generation: $e', isError: true);
    }
  }

  Future<void> _exportPLTemplate(FinancialReportController controller) async {
    try {
      final start =
          _startDate ?? DateTime.now().subtract(const Duration(days: 89));
      final end = _endDate ?? DateTime.now();
      if (end.isBefore(start)) {
        showSnackBar('End date must be on or after start date.', isError: true);
        return;
      }
      final exportData = await _buildPnlExportData(start, end);

      var years = <int>[for (int y = start.year; y <= end.year; y++) y];
      if (years.length > 5) {
        years = years.sublist(years.length - 5);
      }
      while (years.length < 5) {
        years.insert(0, years.first - 1);
      }

      double yearSumByKeywords(
        Map<String, Map<String, double>> periodicMap,
        int year,
        List<String> keywords,
      ) {
        double total = 0;
        periodicMap.forEach((key, row) {
          if (!key.startsWith('$year-')) return;
          row.forEach((cat, v) {
            final n = cat.toLowerCase();
            if (keywords.any((k) => n.contains(k))) {
              total += v;
            }
          });
        });
        return total;
      }

      final excel = excel_lib.Excel.createExcel();
      final sheet = excel['P&L Statement'];
      final existingSheets = List<String>.from(excel.tables.keys);
      for (final name in existingSheets) {
        if (name.toLowerCase().startsWith('sheet') && name != 'P&L Statement') {
          excel.delete(name);
        }
      }
      final orgName = getCurrentOrganization?.name ?? 'Booksmart';

      // === Exact specs extracted from client P&L template ===
      // Fills: section bars use theme dk2 + tint 0.4 ⇒ #8E98A5;
      // total rows ⇒ #EAEEF3; rest white. Net Income bar uses the same
      // section-bar colour as plain section bars in the client file.
      const kSectionFill = 'FF8596B0';
      const kTotalFill = 'FFEAEDF4';
      const kTextDark = 'FF111111';
      const kTextWhite = 'FFFFFFFF';
      const kTextBody = 'FF333333';
      // Standard accounting format with embedded $: dollar pinned to the
      // left edge of the cell, number right-aligned, parentheses for negatives,
      // dash for zero. This is the literal numFmt string from the template.
      const kAccountingFmt =
          r'_("$"* #,##0.00_);_("$"* \(#,##0.00\);_("$"* "-"??_);_(@_)';

      // Layout: col 0 = gutter (A), col 1 = label (B), cols 2..6 = year columns.
      // Hidden monthly columns from the template are skipped in this collapsed
      // view (matches the client's default presentation).
      const colGutter = 0;
      const colLabel = 1;
      const colYearStart = 2;
      const colYearEnd = 6; // 5 year columns: 2..6
      const lastCol = colYearEnd;

      sheet.setColumnWidth(colGutter, 3.36);
      sheet.setColumnWidth(colLabel, 50.58);
      for (int c = colYearStart; c <= colYearEnd; c++) {
        sheet.setColumnWidth(c, 16.95);
      }

      excel_lib.CellStyle baseStyle({
        bool bold = false,
        int fontSize = 10,
        String fontColor = kTextBody,
        String? fillHex,
        excel_lib.HorizontalAlign hAlign = excel_lib.HorizontalAlign.Left,
        excel_lib.VerticalAlign vAlign = excel_lib.VerticalAlign.Center,
        String? numberFormatCode,
      }) {
        final excel_lib.NumFormat fmt = numberFormatCode != null
            ? excel_lib.CustomNumericNumFormat(formatCode: numberFormatCode)
            : excel_lib.NumFormat.standard_0;
        return excel_lib.CellStyle(
          bold: bold,
          fontSize: fontSize,
          fontFamily: excel_lib.getFontFamily(excel_lib.FontFamily.Calibri),
          fontColorHex: excel_lib.ExcelColor.fromHexString(fontColor),
          backgroundColorHex: fillHex == null
              ? excel_lib.ExcelColor.none
              : excel_lib.ExcelColor.fromHexString(fillHex),
          horizontalAlign: hAlign,
          verticalAlign: vAlign,
          numberFormat: fmt,
        );
      }

      final companyTitleStyle = baseStyle(fontSize: 22, fontColor: kTextDark);
      final addressStyle = baseStyle(fontSize: 11, fontColor: kTextDark);
      final datePreparedStyle = baseStyle(
        fontSize: 11,
        fontColor: kTextDark,
        hAlign: excel_lib.HorizontalAlign.Right,
      );
      final asOfStyle = baseStyle(
        fontSize: 12,
        fontColor: kTextDark,
        hAlign: excel_lib.HorizontalAlign.Center,
      );
      final yearHeaderStyle = baseStyle(
        bold: true,
        fontSize: 12,
        fontColor: kTextDark,
        hAlign: excel_lib.HorizontalAlign.Right,
      );

      final sectionLabelStyle = baseStyle(
        bold: true,
        fontSize: 12,
        fontColor: kTextWhite,
        fillHex: kSectionFill,
      );
      final sectionFillStyle = baseStyle(
        bold: true,
        fontSize: 14,
        fontColor: kTextWhite,
        fillHex: kSectionFill,
        hAlign: excel_lib.HorizontalAlign.Right,
      );
      final netIncomeLabelStyle = baseStyle(
        bold: true,
        fontSize: 12,
        fontColor: kTextWhite,
        fillHex: kSectionFill,
      );
      final netIncomeAmountStyle = baseStyle(
        bold: true,
        fontSize: 12,
        fontColor: kTextWhite,
        fillHex: kSectionFill,
        hAlign: excel_lib.HorizontalAlign.Center,
        numberFormatCode: kAccountingFmt,
      );

      final lineLabelStyle = baseStyle(fontColor: kTextBody);
      final lineAmountStyle = baseStyle(
        fontColor: kTextBody,
        numberFormatCode: kAccountingFmt,
      );
      final totalLabelStyle = baseStyle(
        bold: true,
        fontColor: kTextDark,
        fillHex: kTotalFill,
      );
      final totalAmountStyle = baseStyle(
        bold: true,
        fontColor: kTextDark,
        fillHex: kTotalFill,
        numberFormatCode: kAccountingFmt,
      );
      final emptyPeriodValueStyle = baseStyle(
        fontColor: kTextBody,
        numberFormatCode: null,
        hAlign: excel_lib.HorizontalAlign.Right,
      );

      void setCell(
        int c,
        int r,
        excel_lib.CellValue v, [
        excel_lib.CellStyle? s,
      ]) {
        final cell = sheet.cell(
          excel_lib.CellIndex.indexByColumnRow(columnIndex: c, rowIndex: r),
        );
        cell.value = v;
        if (s != null) cell.cellStyle = s;
      }

      // Header: statement title first row (full width), then org / meta / years.
      final statementTopStyle = baseStyle(
        bold: true,
        fontSize: 18,
        fontColor: kTextDark,
        hAlign: excel_lib.HorizontalAlign.Center,
      );
      sheet.setRowHeight(0, 36);
      for (int c = 0; c <= lastCol; c++) {
        setCell(c, 0, excel_lib.TextCellValue(''), baseStyle());
      }
      sheet.merge(
        excel_lib.CellIndex.indexByColumnRow(
          columnIndex: colGutter,
          rowIndex: 0,
        ),
        excel_lib.CellIndex.indexByColumnRow(columnIndex: lastCol, rowIndex: 0),
      );
      setCell(
        colGutter,
        0,
        excel_lib.TextCellValue('Profit & Loss Statement'),
        statementTopStyle,
      );

      sheet.setRowHeight(1, 30);
      for (int c = 0; c <= lastCol; c++) {
        setCell(c, 1, excel_lib.TextCellValue(''), baseStyle());
      }
      sheet.merge(
        excel_lib.CellIndex.indexByColumnRow(
          columnIndex: colLabel,
          rowIndex: 1,
        ),
        excel_lib.CellIndex.indexByColumnRow(columnIndex: lastCol, rowIndex: 1),
      );
      setCell(colLabel, 1, excel_lib.TextCellValue(orgName), companyTitleStyle);

      setCell(
        colLabel,
        2,
        excel_lib.TextCellValue('1234 Anytown St.'),
        addressStyle,
      );
      setCell(
        colYearEnd - 1,
        2,
        excel_lib.TextCellValue('Date Prepared:'),
        datePreparedStyle,
      );
      setCell(
        colYearEnd,
        2,
        excel_lib.TextCellValue(
          DateFormat('MM/dd/yyyy').format(DateTime.now()),
        ),
        baseStyle(
          fontSize: 11,
          fontColor: kTextDark,
          hAlign: excel_lib.HorizontalAlign.Right,
        ),
      );

      setCell(
        colLabel,
        3,
        excel_lib.TextCellValue('City, State  12345'),
        addressStyle,
      );

      sheet.setRowHeight(4, 17.25);
      final asOfDate = DateTime(end.year, 12, 31);
      setCell(
        colYearStart,
        4,
        excel_lib.TextCellValue(
          'As of ${DateFormat('MMMM d, yyyy').format(asOfDate)}',
        ),
        asOfStyle,
      );
      sheet.merge(
        excel_lib.CellIndex.indexByColumnRow(
          columnIndex: colYearStart,
          rowIndex: 4,
        ),
        excel_lib.CellIndex.indexByColumnRow(
          columnIndex: colYearEnd,
          rowIndex: 4,
        ),
      );

      sheet.setRowHeight(5, 17.25);
      for (int y = 0; y < 5; y++) {
        setCell(
          colYearStart + y,
          5,
          excel_lib.TextCellValue('${years[y]}'),
          yearHeaderStyle,
        );
      }

      int row = 6;

      void writeSectionBar(String title, {bool isNet = false}) {
        final lblStyle = isNet ? netIncomeLabelStyle : sectionLabelStyle;
        final fillStyle = sectionFillStyle;
        for (int c = 0; c <= lastCol; c++) {
          setCell(c, row, excel_lib.TextCellValue(''), fillStyle);
        }
        setCell(colGutter, row, excel_lib.TextCellValue(''), lblStyle);
        setCell(colLabel, row, excel_lib.TextCellValue(' $title'), lblStyle);
        sheet.setRowHeight(row, 18);
        row++;
      }

      void writeLineRow(
        String label,
        double Function(int yearIdx) valueByYear, {
        bool total = false,
        bool isNet = false,
        bool indent = true,
      }) {
        final lblStyle = isNet
            ? netIncomeLabelStyle
            : (total ? totalLabelStyle : lineLabelStyle);
        final amtStyle = isNet
            ? netIncomeAmountStyle
            : (total ? totalAmountStyle : lineAmountStyle);

        // Indent emulation via leading spaces — the Dart `excel` package
        // does not surface the alignment indent attribute. The client
        // template uses indent 5 for line items and indent 1 for sections
        // and totals.
        final padding = (!total && !isNet && indent) ? '     ' : ' ';
        setCell(colGutter, row, excel_lib.TextCellValue(''), lblStyle);
        setCell(
          colLabel,
          row,
          excel_lib.TextCellValue('$padding$label'),
          lblStyle,
        );

        for (int y = 0; y < 5; y++) {
          final double yv = valueByYear(y);
          if (!total && yv.abs() < 1e-12) {
            setCell(
              colYearStart + y,
              row,
              excel_lib.TextCellValue(''),
              emptyPeriodValueStyle,
            );
          } else {
            setCell(
              colYearStart + y,
              row,
              excel_lib.DoubleCellValue(yv),
              amtStyle,
            );
          }
        }
        sheet.setRowHeight(row, isNet ? 17.25 : 14.25);
        row++;
      }

      void writeEmptyRow() {
        for (int c = 0; c <= lastCol; c++) {
          setCell(c, row, excel_lib.TextCellValue(''));
        }
        sheet.setRowHeight(row, 14.25);
        row++;
      }

      final periodicIncome = exportData.periodicIncomeBreakdown;
      final periodicExpense = exportData.periodicExpenseBreakdown;
      double rev(int i, List<String> kw) =>
          yearSumByKeywords(periodicIncome, years[i], kw);
      double exp(int i, List<String> kw) =>
          yearSumByKeywords(periodicExpense, years[i], kw);

      const kSales = <String>['gross sales', 'sales', 'revenue'];
      const kOtherSales = <String>['other sales', 'misc'];
      const kDiscounts = <String>['discount', 'allowance'];
      const kReturns = <String>['sales return', 'refund'];
      const kAllRevenue = <String>[
        'gross sales',
        'sales',
        'revenue',
        'other sales',
        'misc',
      ];
      const kRevenueDeductions = <String>[
        'discount',
        'allowance',
        'sales return',
        'refund',
      ];

      const kMaterials = <String>['material'];
      const kLabor = <String>['labor'];
      const kRnD = <String>['development', 'research', 'r&d'];
      const kOverhead = <String>['overhead'];
      const kAllCogs = <String>[
        'material',
        'labor',
        'development',
        'research',
        'r&d',
        'overhead',
        'cogs',
        'cost of goods',
        'inventory',
      ];

      const kWages = <String>['wage', 'salary', 'payroll'];
      const kAd = <String>['advertis', 'marketing', 'promo'];
      const kRepair = <String>['repair', 'maintenance'];
      const kRent = <String>['rent', 'lease'];
      const kDepreciation = <String>['depreciation'];
      const kTravel = <String>['travel'];
      const kUtilities = <String>['utilit'];
      const kFreight = <String>['delivery', 'freight', 'shipping'];
      const kInsurance = <String>['insurance'];
      const kOffice = <String>['office', 'supplies'];
      const kAllOpEx = <String>[
        'wage',
        'salary',
        'payroll',
        'advertis',
        'marketing',
        'promo',
        'repair',
        'maintenance',
        'rent',
        'lease',
        'depreciation',
        'travel',
        'utilit',
        'delivery',
        'freight',
        'shipping',
        'insurance',
        'office',
        'supplies',
      ];

      const kInterestExp = <String>['interest expense', 'interest paid'];
      const kInterestInc = <String>['interest income'];
      const kOtherInc = <String>['other income', 'gain'];
      const kTaxes = <String>['tax'];
      const kAmortization = <String>['amortization'];

      double netSales(int i) =>
          rev(i, kAllRevenue) - rev(i, kRevenueDeductions);
      double cogs(int i) => exp(i, kAllCogs);
      double opex(int i) => exp(i, kAllOpEx);
      double ebit(int i) => netSales(i) - cogs(i) - opex(i);
      double pbt(int i) =>
          ebit(i) -
          exp(i, kInterestExp) +
          rev(i, kInterestInc) +
          rev(i, kOtherInc);
      double netInc(int i) => pbt(i) - exp(i, kTaxes);
      double dep(int i) => exp(i, kDepreciation);
      double amort(int i) => exp(i, kAmortization);
      double ebitda(int i) => netInc(i) + dep(i) + amort(i);

      writeSectionBar('Revenue');
      writeLineRow('Gross Sales', (i) => rev(i, kSales));
      writeLineRow('Other Sales', (i) => rev(i, kOtherSales));
      writeLineRow('Less: Discounts & Allowances', (i) => rev(i, kDiscounts));
      writeLineRow('Less: Sales Returns', (i) => rev(i, kReturns));
      writeLineRow('Net Sales', netSales, total: true, indent: false);
      writeEmptyRow();

      writeSectionBar('Cost of Goods Sold');
      writeLineRow('Materials', (i) => exp(i, kMaterials));
      writeLineRow('Labor', (i) => exp(i, kLabor));
      writeLineRow('Development &  Research', (i) => exp(i, kRnD));
      writeLineRow('Overhead', (i) => exp(i, kOverhead));
      writeLineRow(
        'Total Cost of Goods Sold (COGS)',
        cogs,
        total: true,
        indent: false,
      );
      writeEmptyRow();

      writeSectionBar('Operating Expenses');
      writeLineRow('Wages', (i) => exp(i, kWages));
      writeLineRow('Advertising', (i) => exp(i, kAd));
      writeLineRow('Repairs & Maintenance', (i) => exp(i, kRepair));
      writeLineRow('Rent/Lease', (i) => exp(i, kRent));
      writeLineRow('Depreciation', (i) => exp(i, kDepreciation));
      writeLineRow('Travel', (i) => exp(i, kTravel));
      writeLineRow('Utilities', (i) => exp(i, kUtilities));
      writeLineRow('Delivery/Freight Expenses', (i) => exp(i, kFreight));
      writeLineRow('Insurance', (i) => exp(i, kInsurance));
      writeLineRow('Office Supplies', (i) => exp(i, kOffice));
      writeLineRow('Operating Expenses', opex, total: true, indent: false);
      writeLineRow('% of sales', (i) => 0, indent: true);
      writeLineRow(
        'Operating Profit (Loss) - (EBIT)',
        ebit,
        total: true,
        indent: false,
      );
      writeLineRow('Interest Expense', (i) => exp(i, kInterestExp));
      writeLineRow('Interest Income', (i) => rev(i, kInterestInc));
      writeLineRow('Other Income', (i) => rev(i, kOtherInc));
      writeLineRow('Profit Before Taxes', pbt, total: true, indent: false);
      writeLineRow('Taxes', (i) => exp(i, kTaxes));
      writeLineRow('Net Income (Loss)', netInc, total: true, indent: false);
      writeLineRow('Net Income', netInc, isNet: true, indent: false);
      writeLineRow('Depreciation', dep, total: true, indent: false);
      writeLineRow('Amortization', amort, total: true, indent: false);
      writeLineRow('EBITDA', ebitda, total: true, indent: false);

      final bytes = excel.encode();
      if (bytes == null) {
        throw Exception('Unable to generate Excel file.');
      }
      await downloadFile(
        '${orgName.replaceAll(' ', '_')}_Profit_Loss_Statement.xlsx',
        bytes,
        mimeType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    } catch (e, st) {
      dev.log('Excel Export Error: $e\n$st');
      showSnackBar('Please review Excel generation: $e', isError: true);
    }
  }

  void _exportExcelLegacy(FinancialReportController controller) async {
    try {
      final start =
          _startDate ?? DateTime.now().subtract(const Duration(days: 89));
      final end = _endDate ?? DateTime.now();
      if (end.isBefore(start)) {
        showSnackBar('End date must be on or after start date.', isError: true);
        return;
      }
      final exportData = await _buildPnlExportData(start, end);
      final years = <int>[for (int y = start.year; y <= end.year; y++) y];
      if (years.length > 5) {
        showSnackBar(
          'Profit & Loss export supports max 5 years.',
          isError: true,
        );
        return;
      }

      double yearValue(
        Map<String, Map<String, double>> periodicMap,
        int year,
        String category,
      ) {
        double total = 0;
        periodicMap.forEach((key, row) {
          if (key.startsWith('$year-')) {
            total += row[category] ?? 0;
          }
        });
        return total;
      }

      double monthValue(
        Map<String, Map<String, double>> periodicMap,
        int year,
        int month,
        String category,
      ) {
        final key = '$year-${month.toString().padLeft(2, '0')}';
        return periodicMap[key]?[category] ?? 0;
      }

      final excel = excel_lib.Excel.createExcel();
      final sheet = excel['P&L Statement'];
      final existingSheets = List<String>.from(excel.tables.keys);
      for (final name in existingSheets) {
        final isDefaultSheet = name.toLowerCase().startsWith('sheet');
        if (isDefaultSheet && name != 'P&L Statement') {
          excel.delete(name);
        }
      }
      final orgName = getCurrentOrganization?.name ?? 'Booksmart';
      final monthNames = const <String>[
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];

      final headerStyle = excel_lib.CellStyle(
        bold: true,
        fontColorHex: excel_lib.ExcelColor.fromHexString('FF111111'),
        backgroundColorHex: excel_lib.ExcelColor.none,
        horizontalAlign: excel_lib.HorizontalAlign.Center,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final companyTitleStyle = excel_lib.CellStyle(
        bold: false,
        fontSize: 22,
        fontFamily: excel_lib.getFontFamily(excel_lib.FontFamily.Calibri),
        fontColorHex: excel_lib.ExcelColor.fromHexString('FF111111'),
        backgroundColorHex: excel_lib.ExcelColor.fromHexString('FFFFFFFF'),
        horizontalAlign: excel_lib.HorizontalAlign.Left,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final metaInfoStyle = excel_lib.CellStyle(
        fontSize: 11,
        fontFamily: excel_lib.getFontFamily(excel_lib.FontFamily.Calibri),
        fontColorHex: excel_lib.ExcelColor.fromHexString('FF333333'),
        backgroundColorHex: excel_lib.ExcelColor.fromHexString('FFFFFFFF'),
        horizontalAlign: excel_lib.HorizontalAlign.Left,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final reportTitleStyle = excel_lib.CellStyle(
        bold: false,
        fontSize: 26,
        fontFamily: excel_lib.getFontFamily(excel_lib.FontFamily.Calibri),
        fontColorHex: excel_lib.ExcelColor.fromHexString('FF111111'),
        backgroundColorHex: excel_lib.ExcelColor.fromHexString('FFFFFFFF'),
        horizontalAlign: excel_lib.HorizontalAlign.Right,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final statementTopLegacyStyle = excel_lib.CellStyle(
        bold: true,
        fontSize: 18,
        fontFamily: excel_lib.getFontFamily(excel_lib.FontFamily.Calibri),
        fontColorHex: excel_lib.ExcelColor.fromHexString('FF111111'),
        backgroundColorHex: excel_lib.ExcelColor.fromHexString('FFFFFFFF'),
        horizontalAlign: excel_lib.HorizontalAlign.Center,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final datePreparedStyle = excel_lib.CellStyle(
        fontSize: 11,
        fontFamily: excel_lib.getFontFamily(excel_lib.FontFamily.Calibri),
        fontColorHex: excel_lib.ExcelColor.fromHexString('FF333333'),
        backgroundColorHex: excel_lib.ExcelColor.fromHexString('FFFFFFFF'),
        horizontalAlign: excel_lib.HorizontalAlign.Right,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final asOfStyle = excel_lib.CellStyle(
        fontSize: 12,
        fontFamily: excel_lib.getFontFamily(excel_lib.FontFamily.Calibri),
        fontColorHex: excel_lib.ExcelColor.fromHexString('FF333333'),
        backgroundColorHex: excel_lib.ExcelColor.fromHexString('FFFFFFFF'),
        horizontalAlign: excel_lib.HorizontalAlign.Center,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final sectionStyle = excel_lib.CellStyle(
        bold: false,
        fontSize: 11,
        fontFamily: excel_lib.getFontFamily(excel_lib.FontFamily.Calibri),
        fontColorHex: excel_lib.ExcelColor.fromHexString('FFFFFFFF'),
        backgroundColorHex: excel_lib.ExcelColor.fromHexString('FF8596B0'),
        horizontalAlign: excel_lib.HorizontalAlign.Left,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final subHeaderStyle = excel_lib.CellStyle(
        bold: true,
        fontSize: 12,
        fontFamily: excel_lib.getFontFamily(excel_lib.FontFamily.Calibri),
        backgroundColorHex: excel_lib.ExcelColor.none,
        fontColorHex: excel_lib.ExcelColor.fromHexString('FF111111'),
        horizontalAlign: excel_lib.HorizontalAlign.Center,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final labelStyle = excel_lib.CellStyle(
        fontSize: 10,
        fontFamily: excel_lib.getFontFamily(excel_lib.FontFamily.Calibri),
        horizontalAlign: excel_lib.HorizontalAlign.Left,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final totalLabelStyle = excel_lib.CellStyle(
        bold: true,
        fontSize: 10,
        fontFamily: excel_lib.getFontFamily(excel_lib.FontFamily.Calibri),
        backgroundColorHex: excel_lib.ExcelColor.fromHexString('FFEAEDF4'),
        horizontalAlign: excel_lib.HorizontalAlign.Left,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final currencyStyle = excel_lib.CellStyle(
        numberFormat: const excel_lib.CustomNumericNumFormat(
          formatCode: r'$#,##0.00;[Red]($#,##0.00);$-',
        ),
        fontSize: 10,
        fontFamily: excel_lib.getFontFamily(excel_lib.FontFamily.Calibri),
        horizontalAlign: excel_lib.HorizontalAlign.Right,
        verticalAlign: excel_lib.VerticalAlign.Center,
      );
      final currencyBoldStyle = currencyStyle.copyWith(
        boldVal: true,
        backgroundColorHexVal: excel_lib.ExcelColor.fromHexString('FFEAEDF4'),
      );
      final emptyPeriodValueStyle = excel_lib.CellStyle(
        fontSize: 10,
        fontFamily: excel_lib.getFontFamily(excel_lib.FontFamily.Calibri),
        horizontalAlign: excel_lib.HorizontalAlign.Right,
        verticalAlign: excel_lib.VerticalAlign.Center,
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

      final yearBlocks = <_ExcelYearBlock>[];
      int colCursor = 1;
      for (final y in years) {
        final months = <int>[];
        for (int m = 1; m <= 12; m++) {
          months.add(colCursor + m);
        }
        yearBlocks.add(
          _ExcelYearBlock(year: y, totalCol: colCursor, monthCols: months),
        );
        colCursor += 13;
      }
      final lastCol = colCursor - 1;
      sheet.setColumnWidth(0, 50.58);
      for (final b in yearBlocks) {
        sheet.setColumnWidth(b.totalCol, 22);
        for (final c in b.monthCols) {
          sheet.setColumnWidth(c, 13);
        }
      }

      for (int c = 0; c <= lastCol; c++) {
        setCell(c, 0, excel_lib.TextCellValue(''), metaInfoStyle);
        setCell(c, 1, excel_lib.TextCellValue(''), metaInfoStyle);
        setCell(c, 2, excel_lib.TextCellValue(''), metaInfoStyle);
        setCell(c, 3, excel_lib.TextCellValue(''), metaInfoStyle);
        setCell(c, 4, excel_lib.TextCellValue(''), metaInfoStyle);
        setCell(c, 5, excel_lib.TextCellValue(''), metaInfoStyle);
      }
      sheet.merge(
        excel_lib.CellIndex.indexByColumnRow(columnIndex: 0, rowIndex: 0),
        excel_lib.CellIndex.indexByColumnRow(columnIndex: lastCol, rowIndex: 0),
      );
      setCell(
        0,
        0,
        excel_lib.TextCellValue('Profit & Loss Statement'),
        statementTopLegacyStyle,
      );
      setCell(0, 1, excel_lib.TextCellValue(orgName), companyTitleStyle);
      setCell(0, 2, excel_lib.TextCellValue('1234 Anytown St.'), metaInfoStyle);
      setCell(
        0,
        3,
        excel_lib.TextCellValue('City, State  12345'),
        metaInfoStyle,
      );
      final rightStart = (lastCol - 4).clamp(0, lastCol);
      setCell(
        rightStart,
        2,
        excel_lib.TextCellValue(
          'Date Prepared: ${DateFormat('MM/dd/yyyy').format(DateTime.now())}',
        ),
        datePreparedStyle,
      );
      setCell(
        rightStart,
        4,
        excel_lib.TextCellValue(
          'As of ${DateFormat('MMMM d, yyyy').format(DateTime(end.year, 12, 31))}',
        ),
        asOfStyle,
      );
      sheet.merge(
        excel_lib.CellIndex.indexByColumnRow(
          columnIndex: rightStart,
          rowIndex: 2,
        ),
        excel_lib.CellIndex.indexByColumnRow(columnIndex: lastCol, rowIndex: 2),
      );
      sheet.merge(
        excel_lib.CellIndex.indexByColumnRow(
          columnIndex: rightStart,
          rowIndex: 4,
        ),
        excel_lib.CellIndex.indexByColumnRow(columnIndex: lastCol, rowIndex: 4),
      );
      sheet.setRowHeight(0, 36);
      sheet.setRowHeight(1, 28);
      sheet.setRowHeight(2, 18);
      sheet.setRowHeight(3, 18);
      sheet.setRowHeight(4, 18);
      sheet.setRowHeight(5, 17.25);

      int row = 6;
      setCell(0, row, excel_lib.TextCellValue(''), subHeaderStyle);
      for (final b in yearBlocks) {
        setCell(
          b.totalCol,
          row,
          excel_lib.TextCellValue('${b.year}'),
          subHeaderStyle,
        );
        setCell(
          b.monthCols.first,
          row,
          excel_lib.TextCellValue(''),
          subHeaderStyle,
        );
        sheet.merge(
          excel_lib.CellIndex.indexByColumnRow(
            columnIndex: b.totalCol,
            rowIndex: row,
          ),
          excel_lib.CellIndex.indexByColumnRow(
            columnIndex: b.monthCols.last,
            rowIndex: row,
          ),
        );
      }
      row++;
      setCell(0, row, excel_lib.TextCellValue(''), headerStyle);
      for (final b in yearBlocks) {
        setCell(
          b.totalCol,
          row,
          excel_lib.TextCellValue('${b.year} Total'),
          headerStyle,
        );
        for (int m = 0; m < 12; m++) {
          setCell(
            b.monthCols[m],
            row,
            excel_lib.TextCellValue(monthNames[m]),
            headerStyle,
          );
        }
      }
      sheet.setRowHeight(row - 1, 17.25);
      sheet.setRowHeight(row, 14.25);
      row++;

      void writeSectionTitle(String title) {
        for (int c = 0; c <= lastCol; c++) {
          setCell(c, row, excel_lib.TextCellValue(' '), sectionStyle);
        }
        setCell(0, row, excel_lib.TextCellValue(' $title'), sectionStyle);
        sheet.setRowHeight(row, 18);
        row++;
      }

      void writeCategoryRows(
        List<String> categories,
        Map<String, Map<String, double>> periodicMap, {
        bool negate = false,
      }) {
        for (final category in categories) {
          if (category.trim().isEmpty) {
            continue;
          }
          final normalized = category.trim().toLowerCase();
          final label = normalized == 'uncategorized'
              ? 'Uncategorized Income'
              : category;
          setCell(0, row, excel_lib.TextCellValue('     $label'), labelStyle);
          for (final b in yearBlocks) {
            final yVal =
                yearValue(periodicMap, b.year, category) * (negate ? -1 : 1);
            if (yVal.abs() < 1e-12) {
              setCell(
                b.totalCol,
                row,
                excel_lib.TextCellValue(''),
                emptyPeriodValueStyle,
              );
            } else {
              setCell(
                b.totalCol,
                row,
                excel_lib.DoubleCellValue(yVal),
                currencyStyle,
              );
            }
            for (int m = 1; m <= 12; m++) {
              final mVal =
                  monthValue(periodicMap, b.year, m, category) *
                  (negate ? -1 : 1);
              if (mVal.abs() < 1e-12) {
                setCell(
                  b.monthCols[m - 1],
                  row,
                  excel_lib.TextCellValue(''),
                  emptyPeriodValueStyle,
                );
              } else {
                setCell(
                  b.monthCols[m - 1],
                  row,
                  excel_lib.DoubleCellValue(mVal),
                  currencyStyle,
                );
              }
            }
          }
          sheet.setRowHeight(row, 14.25);
          row++;
        }
      }

      void writeSumRow(
        String label, {
        required List<String> categories,
        required Map<String, Map<String, double>> periodicMap,
        bool negate = false,
      }) {
        setCell(0, row, excel_lib.TextCellValue(' $label'), totalLabelStyle);
        for (final b in yearBlocks) {
          double yTotal = 0;
          for (final c in categories) {
            yTotal += yearValue(periodicMap, b.year, c);
          }
          yTotal = negate ? -yTotal : yTotal;
          setCell(
            b.totalCol,
            row,
            excel_lib.DoubleCellValue(yTotal),
            currencyBoldStyle,
          );
          for (int m = 1; m <= 12; m++) {
            double mTotal = 0;
            for (final c in categories) {
              mTotal += monthValue(periodicMap, b.year, m, c);
            }
            mTotal = negate ? -mTotal : mTotal;
            setCell(
              b.monthCols[m - 1],
              row,
              excel_lib.DoubleCellValue(mTotal),
              currencyBoldStyle,
            );
          }
        }
        sheet.setRowHeight(row, 14.25);
        row++;
      }

      List<String> filtered(
        Iterable<String> source,
        bool Function(String) test,
      ) {
        return source.where((c) => c.trim().isNotEmpty && test(c)).toList();
      }

      final revenueCategories = filtered(
        exportData.incomeBreakdown.keys,
        (c) => !_isOtherIncomeCategory(c),
      );
      final cogsCategories = filtered(
        exportData.expenseBreakdown.keys,
        _isCogsCategory,
      );
      final operatingCategories = filtered(
        exportData.expenseBreakdown.keys,
        (c) => !_isCogsCategory(c) && !_isOtherExpenseCategory(c),
      );
      final otherIncomeCategories = filtered(
        exportData.incomeBreakdown.keys,
        _isOtherIncomeCategory,
      );
      final otherExpenseCategories = filtered(
        exportData.expenseBreakdown.keys,
        _isOtherExpenseCategory,
      );

      List<double> yearTotals(
        List<String> categories,
        Map<String, Map<String, double>> periodicMap, {
        bool negate = false,
      }) {
        return yearBlocks.map((b) {
          double v = 0;
          for (final c in categories) {
            v += yearValue(periodicMap, b.year, c);
          }
          return negate ? -v : v;
        }).toList();
      }

      List<double> monthTotals(
        List<String> categories,
        Map<String, Map<String, double>> periodicMap, {
        bool negate = false,
      }) {
        final out = <double>[];
        for (final b in yearBlocks) {
          for (int m = 1; m <= 12; m++) {
            double v = 0;
            for (final c in categories) {
              v += monthValue(periodicMap, b.year, m, c);
            }
            out.add(negate ? -v : v);
          }
        }
        return out;
      }

      writeSectionTitle('Revenue');
      writeCategoryRows(revenueCategories, exportData.periodicIncomeBreakdown);
      writeSumRow(
        'Net Sales',
        categories: revenueCategories,
        periodicMap: exportData.periodicIncomeBreakdown,
      );

      row++;
      writeSectionTitle('Cost of Goods Sold');
      writeCategoryRows(cogsCategories, exportData.periodicExpenseBreakdown);
      writeSumRow(
        'Total Cost of Goods Sold',
        categories: cogsCategories,
        periodicMap: exportData.periodicExpenseBreakdown,
      );

      final revenueYear = yearTotals(
        revenueCategories,
        exportData.periodicIncomeBreakdown,
      );
      final cogsYear = yearTotals(
        cogsCategories,
        exportData.periodicExpenseBreakdown,
      );
      final grossYear = List<double>.generate(
        yearBlocks.length,
        (i) => revenueYear[i] - cogsYear[i],
      );
      final revenueMonth = monthTotals(
        revenueCategories,
        exportData.periodicIncomeBreakdown,
      );
      final cogsMonth = monthTotals(
        cogsCategories,
        exportData.periodicExpenseBreakdown,
      );
      final grossMonth = List<double>.generate(
        revenueMonth.length,
        (i) => revenueMonth[i] - cogsMonth[i],
      );

      row++;
      writeSectionTitle('Gross Profit');
      setCell(0, row, excel_lib.TextCellValue('Gross Profit'), totalLabelStyle);
      int monthCursor = 0;
      for (int i = 0; i < yearBlocks.length; i++) {
        final b = yearBlocks[i];
        setCell(
          b.totalCol,
          row,
          excel_lib.DoubleCellValue(grossYear[i]),
          currencyBoldStyle,
        );
        for (int m = 0; m < 12; m++) {
          setCell(
            b.monthCols[m],
            row,
            excel_lib.DoubleCellValue(grossMonth[monthCursor]),
            currencyBoldStyle,
          );
          monthCursor++;
        }
      }
      sheet.setRowHeight(row, 21);
      row++;

      writeSectionTitle('Operating Expenses');
      writeCategoryRows(
        operatingCategories,
        exportData.periodicExpenseBreakdown,
      );
      writeSumRow(
        'Total Operating Expenses',
        categories: operatingCategories,
        periodicMap: exportData.periodicExpenseBreakdown,
      );

      final opexYear = yearTotals(
        operatingCategories,
        exportData.periodicExpenseBreakdown,
      );
      final opexMonth = monthTotals(
        operatingCategories,
        exportData.periodicExpenseBreakdown,
      );
      final operatingYear = List<double>.generate(
        yearBlocks.length,
        (i) => grossYear[i] - opexYear[i],
      );
      final operatingMonth = List<double>.generate(
        grossMonth.length,
        (i) => grossMonth[i] - opexMonth[i],
      );

      row++;
      writeSectionTitle('Operating Income');
      setCell(
        0,
        row,
        excel_lib.TextCellValue('Operating Income'),
        totalLabelStyle,
      );
      monthCursor = 0;
      for (int i = 0; i < yearBlocks.length; i++) {
        final b = yearBlocks[i];
        setCell(
          b.totalCol,
          row,
          excel_lib.DoubleCellValue(operatingYear[i]),
          currencyBoldStyle,
        );
        for (int m = 0; m < 12; m++) {
          setCell(
            b.monthCols[m],
            row,
            excel_lib.DoubleCellValue(operatingMonth[monthCursor]),
            currencyBoldStyle,
          );
          monthCursor++;
        }
      }
      sheet.setRowHeight(row, 21);
      row++;

      writeSectionTitle('Other Income / Expenses');
      writeCategoryRows(
        otherIncomeCategories,
        exportData.periodicIncomeBreakdown,
      );
      writeCategoryRows(
        otherExpenseCategories,
        exportData.periodicExpenseBreakdown,
        negate: true,
      );
      final otherIncomeYear = yearTotals(
        otherIncomeCategories,
        exportData.periodicIncomeBreakdown,
      );
      final otherExpenseYear = yearTotals(
        otherExpenseCategories,
        exportData.periodicExpenseBreakdown,
        negate: true,
      );
      final otherIncomeMonth = monthTotals(
        otherIncomeCategories,
        exportData.periodicIncomeBreakdown,
      );
      final otherExpenseMonth = monthTotals(
        otherExpenseCategories,
        exportData.periodicExpenseBreakdown,
        negate: true,
      );
      final otherNetYear = List<double>.generate(
        yearBlocks.length,
        (i) => otherIncomeYear[i] + otherExpenseYear[i],
      );
      final otherNetMonth = List<double>.generate(
        otherIncomeMonth.length,
        (i) => otherIncomeMonth[i] + otherExpenseMonth[i],
      );
      setCell(
        0,
        row,
        excel_lib.TextCellValue('Total Other Income / (Expenses)'),
        totalLabelStyle,
      );
      monthCursor = 0;
      for (int i = 0; i < yearBlocks.length; i++) {
        final b = yearBlocks[i];
        setCell(
          b.totalCol,
          row,
          excel_lib.DoubleCellValue(otherNetYear[i]),
          currencyBoldStyle,
        );
        for (int m = 0; m < 12; m++) {
          setCell(
            b.monthCols[m],
            row,
            excel_lib.DoubleCellValue(otherNetMonth[monthCursor]),
            currencyBoldStyle,
          );
          monthCursor++;
        }
      }
      sheet.setRowHeight(row, 21);
      row++;

      final netYear = List<double>.generate(
        yearBlocks.length,
        (i) => operatingYear[i] + otherNetYear[i],
      );
      final netMonth = List<double>.generate(
        operatingMonth.length,
        (i) => operatingMonth[i] + otherNetMonth[i],
      );
      writeSectionTitle('Net Income');
      setCell(0, row, excel_lib.TextCellValue('Net Income'), totalLabelStyle);
      monthCursor = 0;
      for (int i = 0; i < yearBlocks.length; i++) {
        final b = yearBlocks[i];
        setCell(
          b.totalCol,
          row,
          excel_lib.DoubleCellValue(netYear[i]),
          currencyBoldStyle,
        );
        for (int m = 0; m < 12; m++) {
          setCell(
            b.monthCols[m],
            row,
            excel_lib.DoubleCellValue(netMonth[monthCursor]),
            currencyBoldStyle,
          );
          monthCursor++;
        }
      }
      sheet.setRowHeight(row, 22);

      final rawBytes = excel.encode();
      if (rawBytes == null) {
        throw Exception('Unable to generate Excel file.');
      }
      final monthCols = <int>{};
      final yearTotalCols = <int>{};
      for (final b in yearBlocks) {
        monthCols.addAll(b.monthCols);
        yearTotalCols.add(b.totalCol);
      }
      final bytes = _applyMonthGroupingToSummary(
        rawBytes,
        monthCols: monthCols,
        yearTotalCols: yearTotalCols,
      );
      await downloadFile(
        '${orgName.replaceAll(' ', '_')}_Periodic_PL.xlsx',
        bytes,
        mimeType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    } catch (e, st) {
      dev.log('Excel Export Error: $e\n$st');
      showSnackBar('Please review Excel generation: $e', isError: true);
    }
  }

  List<int> _applyMonthGroupingToSummary(
    List<int> xlsxBytes, {
    required Set<int> monthCols,
    required Set<int> yearTotalCols,
  }) {
    try {
      final archive = ZipDecoder().decodeBytes(xlsxBytes, verify: false);
      final sheetFile = archive.findFile('xl/worksheets/sheet1.xml');
      if (sheetFile == null || !sheetFile.isFile) return xlsxBytes;

      final xml = utf8.decode(sheetFile.content as List<int>);
      final doc = XmlDocument.parse(xml);
      final worksheet = doc.rootElement;

      final cols = worksheet.getElement('cols');
      if (cols != null) {
        for (final col in cols.findElements('col')) {
          final min = int.tryParse(col.getAttribute('min') ?? '') ?? 0;
          final max = int.tryParse(col.getAttribute('max') ?? '') ?? 0;
          final covered = <int>[];
          for (int c = min - 1; c <= max - 1; c++) {
            covered.add(c);
          }
          final hasMonth = covered.any(monthCols.contains);
          final hasYearTotal = covered.any(yearTotalCols.contains);
          if (hasMonth) {
            col.setAttribute('outlineLevel', '1');
            col.setAttribute('hidden', '1');
          }
          if (hasYearTotal) {
            col.setAttribute('collapsed', '1');
          }
        }
      }

      final sheetFormatPr = worksheet.getElement('sheetFormatPr');
      sheetFormatPr?.setAttribute('outlineLevelCol', '1');

      var sheetPr = worksheet.getElement('sheetPr');
      if (sheetPr == null) {
        sheetPr = XmlElement(XmlName('sheetPr'));
        worksheet.children.insert(0, sheetPr);
      }
      if (sheetPr.getElement('outlinePr') == null) {
        sheetPr.children.add(
          XmlElement(XmlName('outlinePr'), [
            XmlAttribute(XmlName('summaryBelow'), '1'),
            XmlAttribute(XmlName('summaryRight'), '1'),
            XmlAttribute(XmlName('showOutlineSymbols'), '1'),
          ]),
        );
      }

      final sheetViews = worksheet.getElement('sheetViews');
      if (sheetViews != null) {
        final views = sheetViews.findElements('sheetView');
        if (views.isNotEmpty) {
          views.first.setAttribute('showOutlineSymbols', '1');
        }
      }

      final patched = utf8.encode(doc.toXmlString(pretty: false));
      archive.addFile(
        ArchiveFile('xl/worksheets/sheet1.xml', patched.length, patched),
      );
      return ZipEncoder().encode(archive) ?? xlsxBytes;
    } catch (_) {
      return xlsxBytes;
    }
  }

  List<int> _disableExcelGridlines(List<int> xlsxBytes) {
    try {
      final archive = ZipDecoder().decodeBytes(xlsxBytes, verify: false);
      final sheetFile = archive.findFile('xl/worksheets/sheet1.xml');
      if (sheetFile == null || !sheetFile.isFile) return xlsxBytes;

      final xml = utf8.decode(sheetFile.content as List<int>);
      final doc = XmlDocument.parse(xml);
      final worksheet = doc.rootElement;

      var sheetViews = worksheet.getElement('sheetViews');
      if (sheetViews == null) {
        sheetViews = XmlElement(XmlName('sheetViews'));
        worksheet.children.insert(0, sheetViews);
      }
      var sheetView = sheetViews.getElement('sheetView');
      if (sheetView == null) {
        sheetView = XmlElement(XmlName('sheetView'), [
          XmlAttribute(XmlName('workbookViewId'), '0'),
        ]);
        sheetViews.children.add(sheetView);
      }
      sheetView.setAttribute('showGridLines', '0');

      final newXml = utf8.encode(doc.toXmlString(pretty: false));
      final updated = <ArchiveFile>[];
      for (final file in archive.files) {
        if (file.name == 'xl/worksheets/sheet1.xml') {
          updated.add(
            ArchiveFile('xl/worksheets/sheet1.xml', newXml.length, newXml)
              ..compress = file.compress,
          );
        } else {
          updated.add(file);
        }
      }
      final out = Archive();
      for (final file in updated) {
        out.addFile(file);
      }
      return ZipEncoder().encode(out) ?? xlsxBytes;
    } catch (_) {
      return xlsxBytes;
    }
  }

  static const List<String> _exportExpenseKeywords = <String>[
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

  String _sqlDateLocal(DateTime d) {
    final x = DateTime(d.year, d.month, d.day);
    final mm = x.month.toString().padLeft(2, '0');
    final dd = x.day.toString().padLeft(2, '0');
    return '${x.year}-$mm-$dd';
  }

  DateTime _nextDay(DateTime d) => DateTime(d.year, d.month, d.day + 1);

  bool _isKnownExportExpense(String title) {
    for (final kw in _exportExpenseKeywords) {
      if (title.contains(kw)) return true;
    }
    return false;
  }

  Future<_PnlExportData> _buildPnlExportData(
    DateTime start,
    DateTime end,
  ) async {
    final orgId = getCurrentOrganization?.id;
    if (orgId == null) {
      return const _PnlExportData(
        incomeBreakdown: {},
        expenseBreakdown: {},
        periodicIncomeBreakdown: {},
        periodicExpenseBreakdown: {},
        periodicNetIncome: {},
        totalIncome: 0,
        totalExpenses: 0,
        netIncome: 0,
      );
    }

    final txRows = await supabase
        .from(SupabaseTable.transaction)
        .select()
        .eq('org_id', orgId)
        .gte('date_time', _sqlDateLocal(start))
        .lt('date_time', _sqlDateLocal(_nextDay(end)));

    final txMaps = (txRows as List).cast<Map<String, dynamic>>();
    final txs = txMaps.map((e) => TransactionModel.fromJson(e)).toList();

    int? parseInt(dynamic v) {
      if (v is int) return v;
      if (v is num) return v.toInt();
      if (v is String) return int.tryParse(v);
      return null;
    }

    final subCategoryIds = txMaps
        .map(
          (row) =>
              parseInt(row['sub_category_id']) ??
              parseInt(row['subcategory_id']),
        )
        .whereType<int>()
        .toSet()
        .toList();
    final Map<int, String> subCategoryNames = {};
    if (subCategoryIds.isNotEmpty) {
      final subCategoryRows = await supabase
          .from(SupabaseTable.subCategory)
          .select('id,name')
          .inFilter('id', subCategoryIds);
      for (final row in (subCategoryRows as List)) {
        final rawId = row['id'];
        final int? id = rawId is int
            ? rawId
            : (rawId is num ? rawId.toInt() : int.tryParse('$rawId'));
        if (id == null) continue;
        final name = (row['name'] as String? ?? '').trim();
        if (name.isNotEmpty) {
          subCategoryNames[id] = name;
        }
      }
    }

    final incomeBreakdown = <String, double>{};
    final expenseBreakdown = <String, double>{};
    final periodicIncomeBreakdown = <String, Map<String, double>>{};
    final periodicExpenseBreakdown = <String, Map<String, double>>{};
    final periodicNetIncome = <String, double>{};

    for (int i = 0; i < txs.length; i++) {
      final tx = txs[i];
      final raw = txMaps[i];
      final title = tx.title.toLowerCase();
      final absAmt = tx.amount.abs();
      final monthKey = DateFormat('yyyy-MM').format(tx.dateTime);

      periodicIncomeBreakdown[monthKey] ??= <String, double>{};
      periodicExpenseBreakdown[monthKey] ??= <String, double>{};
      periodicNetIncome[monthKey] ??= 0;

      final bool isAL =
          title.contains('[asset') ||
          title.contains('[liab') ||
          title.contains('equity') ||
          title.contains('[cf:');

      bool isIncome = false;
      bool isExpense = false;

      if (title.startsWith('[revenue]')) {
        isIncome = true;
      } else if (title.startsWith('[cogs]') ||
          title.contains('cost of goods')) {
        isExpense = true;
      } else if (title.startsWith('[opex]')) {
        isExpense = true;
      } else if (isAL) {
        // Excluded from P&L
      } else {
        final knownExpense = _isKnownExportExpense(title);
        final isTransfer =
            title.contains('credit card payment') ||
            title.contains('transfer to') ||
            title.contains('autopay');
        if (knownExpense) {
          isExpense = true;
        } else if (isTransfer) {
          // Ignore transfers
        } else if (tx.amount > 0) {
          isIncome = true;
        } else {
          isExpense = true;
        }
      }

      final subCategoryId =
          parseInt(raw['sub_category_id']) ??
          parseInt(raw['subcategory_id']) ??
          tx.subcategory;
      final subName = subCategoryId != null
          ? (subCategoryNames[subCategoryId] ?? '')
          : '';
      final label = subName.isNotEmpty ? subName : 'Uncategorized';

      if (isIncome) {
        incomeBreakdown[label] = (incomeBreakdown[label] ?? 0) + absAmt;
        periodicIncomeBreakdown[monthKey]![label] =
            (periodicIncomeBreakdown[monthKey]![label] ?? 0) + absAmt;
        periodicNetIncome[monthKey] =
            (periodicNetIncome[monthKey] ?? 0) + absAmt;
      } else if (isExpense) {
        expenseBreakdown[label] = (expenseBreakdown[label] ?? 0) + absAmt;
        periodicExpenseBreakdown[monthKey]![label] =
            (periodicExpenseBreakdown[monthKey]![label] ?? 0) + absAmt;
        periodicNetIncome[monthKey] =
            (periodicNetIncome[monthKey] ?? 0) - absAmt;
      }
    }

    final totalIncome = incomeBreakdown.values.fold<double>(
      0.0,
      (a, b) => a + b,
    );
    final totalExpenses = expenseBreakdown.values.fold<double>(
      0.0,
      (a, b) => a + b,
    );
    final netIncome = totalIncome - totalExpenses;

    return _PnlExportData(
      incomeBreakdown: incomeBreakdown,
      expenseBreakdown: expenseBreakdown,
      periodicIncomeBreakdown: periodicIncomeBreakdown,
      periodicExpenseBreakdown: periodicExpenseBreakdown,
      periodicNetIncome: periodicNetIncome,
      totalIncome: totalIncome,
      totalExpenses: totalExpenses,
      netIncome: netIncome,
    );
  }

  Future<PnlPdfData> _buildPnlPdfData(PdfExportRequest request) async {
    final exportData = await _buildPnlExportData(
      request.startDate,
      request.endDate,
    );
    final pdfSvc = PdfExportService();
    final labels = pdfSvc.buildBucketLabels(
      request.startDate,
      request.endDate,
      request.viewType,
    );
    if (labels.isEmpty || labels.length > PdfExportService.maxColumns) {
      throw ArgumentError(
        'Profit & Loss export supports 1–${PdfExportService.maxColumns} period columns.',
      );
    }
    final n = labels.length;

    List<double> aggInc(String cat) => pdfSvc.aggregatePeriodicCategoryForPl(
      exportData.periodicIncomeBreakdown,
      cat,
      request.startDate,
      request.endDate,
      request.viewType,
    );
    List<double> aggExp(String cat) => pdfSvc.aggregatePeriodicCategoryForPl(
      exportData.periodicExpenseBreakdown,
      cat,
      request.startDate,
      request.endDate,
      request.viewType,
    );

    List<double> addSeries(List<List<double>> series) {
      final out = List<double>.filled(n, 0);
      for (final values in series) {
        for (int i = 0; i < n; i++) {
          out[i] += values[i];
        }
      }
      return out;
    }

    List<double> subtractSeries(List<double> a, List<double> b) =>
        List<double>.generate(n, (i) => a[i] - b[i]);

    List<double> sumExpenseCategories(Iterable<String> cats) {
      final lists = cats.map(aggExp).toList();
      if (lists.isEmpty) return List<double>.filled(n, 0);
      return addSeries(lists);
    }

    final revenueCategories = exportData.incomeBreakdown.keys
        .where((c) => c.trim().isNotEmpty && !_isOtherIncomeCategory(c))
        .toList();
    final cogsCategories = exportData.expenseBreakdown.keys
        .where((c) => c.trim().isNotEmpty && _isCogsCategory(c))
        .toList();
    final operatingCategories = exportData.expenseBreakdown.keys
        .where(
          (c) =>
              c.trim().isNotEmpty &&
              !_isCogsCategory(c) &&
              !_isOtherExpenseCategory(c),
        )
        .toList();
    final depCategories = operatingCategories
        .where(_isDepreciationExportLabel)
        .toList();
    final amortCategories = operatingCategories
        .where(_isAmortizationExportLabel)
        .toList();
    final opexDetailCategories = operatingCategories
        .where(
          (c) =>
              !_isDepreciationExportLabel(c) && !_isAmortizationExportLabel(c),
        )
        .toList();
    final otherIncomeCategories = exportData.incomeBreakdown.keys
        .where((c) => c.trim().isNotEmpty && _isOtherIncomeCategory(c))
        .toList();
    final otherExpenseCategories = exportData.expenseBreakdown.keys
        .where((c) => c.trim().isNotEmpty && _isOtherExpenseCategory(c))
        .toList();

    final interestExpenseCategories = exportData.expenseBreakdown.keys
        .where((c) => c.trim().isNotEmpty && _isInterestExpenseExportLabel(c))
        .toList();
    final taxCategories = exportData.expenseBreakdown.keys
        .where((c) => c.trim().isNotEmpty && _isTaxExpenseExportLabel(c))
        .toList();

    final revenueRows = revenueCategories.map((category) {
      final normalized = category.trim().toLowerCase();
      final label = normalized == 'uncategorized'
          ? 'Uncategorized Income'
          : category;
      return PnlPdfRowData(label: label, values: aggInc(category));
    }).toList();
    final cogsRows = cogsCategories
        .map(
          (category) =>
              PnlPdfRowData(label: category, values: aggExp(category)),
        )
        .toList();
    final opexRows = <PnlPdfRowData>[
      ...opexDetailCategories.map(
        (category) => PnlPdfRowData(label: category, values: aggExp(category)),
      ),
      PnlPdfRowData(
        label: 'Depreciation',
        values: sumExpenseCategories(depCategories),
      ),
      PnlPdfRowData(
        label: 'Amortization',
        values: sumExpenseCategories(amortCategories),
      ),
    ];

    final otherRows = <PnlPdfRowData>[
      ...otherIncomeCategories.map(
        (category) => PnlPdfRowData(label: category, values: aggInc(category)),
      ),
      ...otherExpenseCategories.map(
        (category) => PnlPdfRowData(
          label: category,
          values: aggExp(category).map((v) => -v).toList(),
        ),
      ),
    ];

    final totalRevenue = addSeries(revenueRows.map((e) => e.values).toList());
    final totalCogs = addSeries(cogsRows.map((e) => e.values).toList());
    final grossProfit = subtractSeries(totalRevenue, totalCogs);

    final totalOpex = sumExpenseCategories(operatingCategories);
    final operatingIncome = subtractSeries(grossProfit, totalOpex);
    final totalOther = addSeries(otherRows.map((e) => e.values).toList());
    final netIncome = List<double>.generate(
      n,
      (i) => operatingIncome[i] + totalOther[i],
    );

    final depreciationTotal = sumExpenseCategories(depCategories);
    final amortizationTotal = sumExpenseCategories(amortCategories);
    final interestExpenseTotal = sumExpenseCategories(
      interestExpenseCategories,
    );
    final taxExpenseTotal = sumExpenseCategories(taxCategories);

    final ebitda = List<double>.generate(n, (i) {
      return netIncome[i] +
          interestExpenseTotal[i] +
          taxExpenseTotal[i] +
          depreciationTotal[i] +
          amortizationTotal[i];
    });

    revenueRows.add(
      PnlPdfRowData(label: 'Total Revenue', values: totalRevenue, isBold: true),
    );
    cogsRows.add(
      PnlPdfRowData(
        label: 'Total Cost of Goods Sold',
        values: totalCogs,
        isBold: true,
      ),
    );
    opexRows.add(
      PnlPdfRowData(
        label: 'Total Operating Expenses',
        values: totalOpex,
        isBold: true,
      ),
    );
    otherRows.add(
      PnlPdfRowData(
        label: 'Total Other Income / (Expenses)',
        values: totalOther,
        isBold: true,
      ),
    );

    return PnlPdfData(
      sections: [
        PnlPdfSectionData(title: 'Revenue', rows: revenueRows),
        PnlPdfSectionData(title: 'Cost of Goods Sold', rows: cogsRows),
        PnlPdfSectionData(
          title: 'Gross Profit',
          rows: [
            PnlPdfRowData(
              label: 'Gross Profit',
              values: grossProfit,
              isBold: true,
            ),
          ],
        ),
        PnlPdfSectionData(title: 'Operating Expenses', rows: opexRows),
        PnlPdfSectionData(
          title: 'Operating Income',
          rows: [
            PnlPdfRowData(
              label: 'Operating Income',
              values: operatingIncome,
              isBold: true,
            ),
          ],
        ),
        PnlPdfSectionData(title: 'Other Income / Expenses', rows: otherRows),
        PnlPdfSectionData(
          title: 'EBITDA (Reconciliation)',
          rows: [PnlPdfRowData(label: 'EBITDA', values: ebitda, isBold: true)],
        ),
      ],
      netProfit: netIncome,
    );
  }

  bool _isDepreciationExportLabel(String label) {
    final n = label.toLowerCase();
    return n.contains('depreciat');
  }

  bool _isAmortizationExportLabel(String label) {
    final n = label.toLowerCase();
    return n.contains('amortiz');
  }

  bool _isInterestExpenseExportLabel(String label) {
    final n = label.toLowerCase();
    if (!n.contains('interest')) return false;
    if (n.contains('income')) return false;
    return true;
  }

  bool _isTaxExpenseExportLabel(String label) {
    final n = label.toLowerCase();
    return n.contains('tax') || n.contains('irs') || n.contains('excise');
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

  bool _isCogsCategory(String label) {
    final n = label.toLowerCase();
    return n.contains('cogs') ||
        n.contains('cost of goods') ||
        n.contains('material') ||
        n.contains('labor') ||
        n.contains('overhead') ||
        n.contains('inventory');
  }

  bool _isOtherIncomeCategory(String label) {
    final n = label.toLowerCase();
    return n.contains('interest income') ||
        n.contains('other income') ||
        n.contains('gain') ||
        n.contains('refund');
  }

  bool _isOtherExpenseCategory(String label) {
    final n = label.toLowerCase();
    return n.contains('interest') ||
        n.contains('tax') ||
        n.contains('bank fee') ||
        n.contains('penalty') ||
        n.contains('other expense');
  }

  double _percentChange(double current, double previous) {
    if (previous.abs() < 0.000001) return 0;
    return ((current - previous) / previous.abs()) * 100;
  }

  bool _isComparisonUnavailable(double current, double previous) {
    return previous.abs() < 0.000001 && current.abs() >= 0.000001;
  }

  final numFormat = NumberFormat.currency(symbol: '\$', decimalDigits: 2);

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return GetBuilder<FinancialReportController>(
      tag: getCurrentOrganization!.id.toString(),
      builder: (controller) {
        if (controller.isLoading.value &&
            !controller.hasPresentedFinancialData) {
          return const Center(child: CircularProgressIndicator());
        }

        final numFormat = NumberFormat.currency(symbol: '\$', decimalDigits: 2);

        // KPI Calculations
        final double income = controller.totalIncome.value;
        final double prevIncome = controller.prevPeriodIncome.value;
        final double incomeChange = _percentChange(income, prevIncome);

        final double expenses = controller.totalExpenses.value;
        final double prevExpenses = controller.prevPeriodExpenses.value;
        final double expensesChange = _percentChange(expenses, prevExpenses);

        final double grossProfit = controller.grossProfit.value;
        final double prevGrossProfit = controller.prevPeriodGrossProfit.value;
        final double grossProfitChange = _percentChange(
          grossProfit,
          prevGrossProfit,
        );

        final double margin = controller.grossMarginPct.value.clamp(0, 100);
        final double prevMargin = controller.prevPeriodGrossMarginPct.value
            .clamp(0, 100);
        final double marginChange = _percentChange(margin, prevMargin);

        final double ebitda = controller.ebitda.value;
        final double prevEbitda = controller.prevPeriodEbitda.value;
        final double ebitdaChange = _percentChange(ebitda, prevEbitda);

        final double netProfit = controller.netIncome.value;
        final double prevNetProfit = controller.prevPeriodNetIncome.value;
        final double netProfitChange = _percentChange(netProfit, prevNetProfit);
        final bool incomeComparisonUnavailable = _isComparisonUnavailable(
          income,
          prevIncome,
        );
        final bool expensesComparisonUnavailable = _isComparisonUnavailable(
          expenses,
          prevExpenses,
        );
        final bool grossProfitComparisonUnavailable = _isComparisonUnavailable(
          grossProfit,
          prevGrossProfit,
        );
        final bool marginComparisonUnavailable = _isComparisonUnavailable(
          margin,
          prevMargin,
        );

        final String totalIncomeStr = numFormat.format(income);
        final String grossProfitStr = numFormat.format(grossProfit);

        final isDark = Theme.of(context).brightness == Brightness.dark;
        final screenWidth = MediaQuery.sizeOf(context).width;
        final isNarrow = screenWidth <= 1024;

        return Container(
          color: Theme.of(context).scaffoldBackgroundColor,
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
                            "Profit & Loss",
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
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              AppText(
                                "Profit & Loss",
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
                const SizedBox(height: 24),
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
                              reportType: ExportPdfReportType.profitLoss,
                              initialStartDate: _startDate,
                              initialEndDate: _endDate,
                              onExport: (request) async {
                                setState(() {
                                  _startDate = request.startDate;
                                  _endDate = request.endDate;
                                });
                                await controller.fetchAndAggregateData(
                                  startDate: request.startDate,
                                  endDate: request.endDate,
                                );
                                final liveData = await _buildPnlPdfData(
                                  request,
                                );
                                await PdfExportService()
                                    .exportProfitLossPresentationPdf(
                                      request,
                                      pnlData: liveData,
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
                              reportType: ExportPdfReportType.profitLoss,
                              initialStartDate: _startDate,
                              initialEndDate: _endDate,
                              onExport: (request) async {
                                setState(() {
                                  _startDate = request.startDate;
                                  _endDate = request.endDate;
                                });
                                await controller.fetchAndAggregateData(
                                  startDate: request.startDate,
                                  endDate: request.endDate,
                                );
                                _exportExcel(controller, request);
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
                            showUploadTaxDocumentDialog(type: 'pl'),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),

                isNarrow
                    ? Wrap(
                        spacing: 12,
                        runSpacing: 12,
                        children: [
                          SizedBox(
                            width: screenWidth - 32,
                            child: _premiumKPICard(
                              title: "Income",
                              value: numFormat.format(income),
                              change: incomeChange,
                              comparisonUnavailable:
                                  incomeComparisonUnavailable,
                              isCurrency: true,
                              timeframe: _getTimeframeLabel(),
                            ),
                          ),
                          SizedBox(
                            width: screenWidth - 32,
                            child: _premiumKPICard(
                              title: "Expenses",
                              value: numFormat.format(expenses),
                              change: expensesChange,
                              comparisonUnavailable:
                                  expensesComparisonUnavailable,
                              isCurrency: true,
                              timeframe: _getTimeframeLabel(),
                            ),
                          ),
                          SizedBox(
                            width: screenWidth - 32,
                            child: _premiumKPICard(
                              title: "Gross Profit",
                              value: numFormat.format(grossProfit),
                              change: grossProfitChange,
                              comparisonUnavailable:
                                  grossProfitComparisonUnavailable,
                              isCurrency: true,
                              timeframe: _getTimeframeLabel(),
                            ),
                          ),
                          SizedBox(
                            width: screenWidth - 32,
                            child: _premiumKPICard(
                              title: "% Margin",
                              value: "${margin.toStringAsFixed(1)}%",
                              change: marginChange,
                              comparisonUnavailable:
                                  marginComparisonUnavailable,
                              isCurrency: false,
                              timeframe: _getTimeframeLabel(),
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
                                title: "Income",
                                value: numFormat.format(income),
                                change: incomeChange,
                                comparisonUnavailable:
                                    incomeComparisonUnavailable,
                                isCurrency: true,
                                timeframe: _getTimeframeLabel(),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: _premiumKPICard(
                                title: "Expenses",
                                value: numFormat.format(expenses),
                                change: expensesChange,
                                comparisonUnavailable:
                                    expensesComparisonUnavailable,
                                isCurrency: true,
                                timeframe: _getTimeframeLabel(),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: _premiumKPICard(
                                title: "Gross Profit",
                                value: numFormat.format(grossProfit),
                                change: grossProfitChange,
                                comparisonUnavailable:
                                    grossProfitComparisonUnavailable,
                                isCurrency: true,
                                timeframe: _getTimeframeLabel(),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: _premiumKPICard(
                                title: "% Margin",
                                value: "${margin.toStringAsFixed(1)}%",
                                change: marginChange,
                                comparisonUnavailable:
                                    marginComparisonUnavailable,
                                isCurrency: false,
                                timeframe: _getTimeframeLabel(),
                              ),
                            ),
                          ],
                        ),
                      ),

                const SizedBox(height: 32),

                /// 🔹 Main Combined Chart Section
                _buildMainChartSection(controller),

                const SizedBox(height: 32),

                /// 🔹 Bottom Section: Revenue vs Expenses Growth & COGS vs Revenue growth
                isNarrow
                    ? Column(
                        children: [
                          _buildRevenueExpenseGrowthChart(controller),
                          const SizedBox(height: 16),
                          _buildCogsRevenueChart(controller),
                        ],
                      )
                    : Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: _buildRevenueExpenseGrowthChart(controller),
                          ),
                          const SizedBox(width: 16),
                          Expanded(child: _buildCogsRevenueChart(controller)),
                        ],
                      ),
                const RecentDocumentsWidget(
                  type: 'pl',
                  showViewAllAction: false,
                  showDeleteAction: true,
                ),
                const SizedBox(height: 24),
              ],
            ),
          ),
        );
      },
    );
  }

  /// 🔹 Outline button builder (for Filter/Export/Upload)
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
    String? timeframe,
    bool comparisonUnavailable = false,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bool isFlat = change.abs() < 0.000001;
    final bool isPositive = change > 0;
    final tooltipText = kpiTooltipTextForTitle(title);
    // Soft red color instead of harsh bright red
    final Color softRed = const Color(0xFFE57373);
    final Color changeColor = isFlat
        ? (isDark ? Colors.white54 : Colors.black45)
        : (isPositive ? const Color(0xFF19C37D) : softRed);
    final IconData changeIcon = isPositive
        ? Icons.arrow_upward
        : Icons.arrow_downward;

    // Negative values should be soft red
    final bool isNegativeValue =
        value.contains('-') || (isCurrency && value.startsWith('-\$'));
    final Color valueColor = isNegativeValue
        ? softRed
        : (isDark ? Colors.white : Colors.black87);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark
              ? Colors.yellow.withValues(alpha: 0.3)
              : Colors.black.withValues(alpha: 0.1),
          width: 0.5,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.03),
            blurRadius: 15,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Stack(
        children: [
          Center(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                AppText(
                  title,
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: isDark ? Colors.white70 : Colors.black54,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 12),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  child: AppText(
                    value,
                    fontSize: 28,
                    fontWeight: FontWeight.w900,
                    color: valueColor,
                    textAlign: TextAlign.center,
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
                            disableFormat: true,
                          ),
                        ],
                      ),
                    ),
                    AppText(
                      "vs previous $timeframe",
                      fontSize: 11,
                      color: isDark ? Colors.white30 : Colors.black45,
                      textAlign: TextAlign.center,
                      disableFormat: true,
                    ),
                  ],
                ),
              ],
            ),
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

  Widget _buildMainChartSection(FinancialReportController controller) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final series = controller.trendChartSeries;
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: isDark ? Colors.white.withValues(alpha: 0.08) : Colors.black12,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.15 : 0.05),
            blurRadius: 30,
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
                      "Profit & Loss Trends",
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                      color: isDark ? Colors.white : Colors.black87,
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        if (_startDate != null &&
                            _endDate != null &&
                            controller.trendGranularityLabel.isNotEmpty)
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              AppText(
                                "${DateFormat('MMM dd, yyyy').format(_startDate!)} – ${DateFormat('MMM dd, yyyy').format(_endDate!)}",
                                fontSize: 10,
                                fontWeight: FontWeight.w400,
                                color: isDark ? Colors.white38 : Colors.black45,
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
                                color: isDark ? Colors.white38 : Colors.black45,
                              ),
                            ],
                          )
                        else ...[
                          if (_startDate != null && _endDate != null)
                            AppText(
                              "${DateFormat('MMM dd, yyyy').format(_startDate!)} – ${DateFormat('MMM dd, yyyy').format(_endDate!)}",
                              fontSize: 10,
                              fontWeight: FontWeight.w400,
                              color: isDark ? Colors.white38 : Colors.black45,
                            ),
                          if (controller.trendGranularityLabel.isNotEmpty)
                            AppText(
                              controller.trendGranularityLabel,
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: isDark ? Colors.white38 : Colors.black45,
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
                  _buildPnLMetricToggles(isDark),
                  Container(
                    width: 1,
                    height: 18,
                    margin: const EdgeInsets.symmetric(horizontal: 8),
                    color: isDark ? Colors.white24 : Colors.black12,
                  ),
                  InkWell(
                    onTap: () => setState(
                      () => _comparePriorPeriod = !_comparePriorPeriod,
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
                                  () => _comparePriorPeriod = v ?? false,
                                ),
                                materialTapTargetSize:
                                    MaterialTapTargetSize.shrinkWrap,
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
                            color: isDark ? Colors.white54 : Colors.black45,
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
            child: series.isEmpty
                ? Center(
                    child: AppText(
                      "Data will appear for this range",
                      color: isDark ? Colors.white38 : Colors.black45,
                    ),
                  )
                : LayoutBuilder(
                    builder: (context, constraints) {
                      const leftAxis = 56.0;
                      final usableW = (constraints.maxWidth - leftAxis).clamp(
                        1.0,
                        double.infinity,
                      );
                      final n = series.length;
                      final groupW = _pnlTrendGroupWidth(n);
                      final centers = _barGroupCenterXsSpaceAround(
                        usableW,
                        n,
                        groupW,
                      );
                      final spotXN = centers.map((c) => c / usableW).toList();
                      return ClipRect(
                        child: Stack(
                          clipBehavior: Clip.hardEdge,
                          fit: StackFit.expand,
                          children: [
                            _buildPnLTrendBarChart(controller, series, isDark),
                            _buildPnLTrendLineOverlay(
                              controller,
                              series,
                              isDark,
                              spotXN: spotXN,
                              compactXAxis: n > 6,
                            ),
                          ],
                        ),
                      );
                    },
                  ),
          ),
          const SizedBox(height: 24),
          Align(
            alignment: Alignment.center,
            child: Wrap(
              alignment: WrapAlignment.center,
              spacing: 24,
              runSpacing: 8,
              children: [
                if (_showRevenue)
                  _legendItem(const Color(0xFF19C37D), "Revenue"),
                if (_showExpenses)
                  _legendItem(const Color(0xFF2B7FFF), "Expenses"),
                if (_showProfit)
                  _legendItem(
                    isDark ? Colors.white : Colors.black87,
                    "Profit",
                    isLine: true,
                  ),
                if (_comparePriorPeriod)
                  _legendItem(
                    isDark ? Colors.white54 : Colors.black45,
                    "Prior profit",
                    isLine: true,
                    isDashed: true,
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPnLMetricToggles(bool isDark) {
    return PopupMenuButton<String>(
      offset: const Offset(0, 40),
      color: isDark ? const Color(0xFF1E293B) : Colors.white,
      elevation: 8,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      onSelected: (value) {
        setState(() {
          if (value == "revenue") _showRevenue = !_showRevenue;
          if (value == "expense") _showExpenses = !_showExpenses;
          if (value == "profit") _showProfit = !_showProfit;
        });
      },
      itemBuilder: (context) => [
        CheckedPopupMenuItem<String>(
          value: "revenue",
          checked: _showRevenue,
          child: const AppText("Revenue", fontSize: 12),
        ),
        CheckedPopupMenuItem<String>(
          value: "expense",
          checked: _showExpenses,
          child: const AppText("Expense", fontSize: 12),
        ),
        CheckedPopupMenuItem<String>(
          value: "profit",
          checked: _showProfit,
          child: const AppText("Profit", fontSize: 12),
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

  /// Y-axis for the P&L trend bar + line overlay. When comparing prior period,
  /// prior buckets' net must be included or the dashed line maps outside the chart.
  ({double minY, double maxY}) _pnlTrendChartYBounds(
    List<Map<String, dynamic>> series,
    FinancialReportController controller,
  ) {
    double minVal = 0;
    double maxVal = 0;
    for (final d in series) {
      final inc = (d['income'] as num?)?.toDouble() ?? 0;
      final exp = (d['expense'] as num?)?.toDouble() ?? 0;
      final net = (d['net'] as num?)?.toDouble() ?? 0;
      if (_showRevenue && inc < minVal) minVal = inc;
      if (_showExpenses && exp < minVal) minVal = exp;
      if (_showProfit && net < minVal) minVal = net;
      if (_showRevenue && inc > maxVal) maxVal = inc;
      if (_showExpenses && exp > maxVal) maxVal = exp;
      if (_showProfit && net > maxVal) maxVal = net;
    }
    if (_comparePriorPeriod) {
      for (final d in controller.prevTrendChartSeries) {
        final net = (d['net'] as num?)?.toDouble() ?? 0;
        if (net < minVal) minVal = net;
        if (net > maxVal) maxVal = net;
      }
    }
    final double minY;
    if (minVal == 0) {
      minY = 0;
    } else {
      final interval = minVal.abs() > 50000 ? 10000.0 : 5000.0;
      minY = (minVal / interval).floor() * interval;
    }
    final double maxY;
    if (maxVal == 0) {
      maxY = 10000;
    } else {
      final interval = maxVal > 50000 ? 10000.0 : 5000.0;
      maxY = (maxVal / interval).ceil() * interval;
    }
    return (minY: minY, maxY: maxY);
  }

  /// Group center X positions for [BarChartAlignment.spaceAround] (same layout as fl_chart).
  List<double> _barGroupCenterXsSpaceAround(
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

  double _pnlTrendGroupWidth(int n) {
    final rodW = (320 / n).clamp(4.0, 18.0);
    var rodCount = 0;
    if (_showRevenue) rodCount++;
    if (_showExpenses) rodCount++;
    if (rodCount == 0) return 1.0;
    if (rodCount == 1) return rodW;
    return rodW * 2 + 6;
  }

  String _pnlTrendTooltipDateText(Map<String, dynamic> row) {
    final dateStr = row['tooltipDate']?.toString() ?? '';
    final bucketStart = row['bucketStart'];
    final bucketDate = bucketStart is DateTime
        ? bucketStart
        : DateTime.tryParse(bucketStart?.toString() ?? '');
    final hasSpecificDay = RegExp(
      r'\b[A-Za-z]{3,9}\s+\d{1,2}\b',
    ).hasMatch(dateStr);
    if (dateStr.isNotEmpty) {
      if (hasSpecificDay || bucketDate == null) {
        return dateStr;
      }
      return DateFormat('MMMM dd, yyyy').format(bucketDate);
    }
    if (bucketDate != null) {
      return DateFormat('MMM dd, yyyy').format(bucketDate);
    }
    return '';
  }

  Widget _buildPnLTrendBarChart(
    FinancialReportController controller,
    List<Map<String, dynamic>> series,
    bool isDark,
  ) {
    final yBounds = _pnlTrendChartYBounds(series, controller);
    final minY = yBounds.minY;
    final maxY = yBounds.maxY;
    final n = series.length;
    // Show every bucket on the x-axis (daily, weekly, monthly, quarterly) — user prefers full labels.
    final bool compactXAxis = n > 6;
    final ySpan = (maxY - minY).abs();
    final yInterval = ySpan < 1e-9 ? 1.0 : _niceAxisInterval(ySpan);
    const bool rotateXLabels = false;

    return BarChart(
      BarChartData(
        baselineY: 0,
        alignment: BarChartAlignment.spaceAround,
        minY: minY,
        maxY: maxY,
        // Values use clean shorthand; shown on hover / tap (not on the bar surface).
        barTouchData: BarTouchData(
          enabled: true,
          handleBuiltInTouches: true,
          touchTooltipData: BarTouchTooltipData(
            fitInsideHorizontally: true,
            fitInsideVertically: true,
            getTooltipColor: (_) =>
                isDark ? const Color(0xFF1E293B) : const Color(0xFF0F1E37),
            getTooltipItem: (group, groupIndex, rod, rodIndex) {
              final barCount = group.barRods.length;
              if (barCount > 1 && rodIndex > 0) {
                return null;
              }
              final i = group.x.toInt();
              if (i < 0 || i >= n) return null;
              final row = series[i];
              final tooltipDateText = _pnlTrendTooltipDateText(row);
              final inc = (row['income'] as num?)?.toDouble() ?? 0;
              final exp = (row['expense'] as num?)?.toDouble() ?? 0;
              final net = (row['net'] as num?)?.toDouble() ?? 0;
              const baseStyle = TextStyle(color: Colors.white, fontSize: 12);
              final children = <TextSpan>[
                TextSpan(
                  text: '$tooltipDateText\n',
                  style: const TextStyle(
                    color: Colors.white70,
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                    height: 1.35,
                  ),
                ),
              ];
              if (_showRevenue) {
                children.add(
                  TextSpan(
                    text: 'Revenue: ${_formatWholeCurrencyShorthand(inc)}\n',
                    style: const TextStyle(
                      color: Color(0xFF19C37D),
                      fontWeight: FontWeight.w800,
                      fontSize: 12,
                      height: 1.35,
                    ),
                  ),
                );
              }
              if (_showExpenses) {
                children.add(
                  TextSpan(
                    text: 'Expenses: ${_formatWholeCurrencyShorthand(exp)}\n',
                    style: const TextStyle(
                      color: Color(0xFF2B7FFF),
                      fontWeight: FontWeight.w800,
                      fontSize: 12,
                      height: 1.35,
                    ),
                  ),
                );
              }
              if (_showProfit) {
                children.add(
                  TextSpan(
                    text: 'Profit: ${_formatWholeCurrencyShorthand(net)}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w900,
                      fontSize: 12,
                    ),
                  ),
                );
              }
              return BarTooltipItem('', baseStyle, children: children);
            },
          ),
        ),
        gridData: FlGridData(
          show: true,
          drawVerticalLine: false,
          getDrawingHorizontalLine: (value) => FlLine(
            color: (isDark ? Colors.white : Colors.black).withValues(
              alpha: 0.05,
            ),
            strokeWidth: 1,
          ),
        ),
        borderData: FlBorderData(show: false),
        titlesData: FlTitlesData(
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 56,
              interval: yInterval,
              getTitlesWidget: (value, meta) {
                if ((value - meta.max).abs() < 0.01) {
                  return const SizedBox.shrink();
                }
                final text = _formatWholeCurrencyShorthand(value);
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: AppText(
                    text,
                    fontSize: 10,
                    color: isDark ? Colors.white54 : Colors.black54,
                    fontWeight: FontWeight.bold,
                  ),
                );
              },
            ),
          ),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: rotateXLabels ? 52 : (compactXAxis ? 48 : 36),
              interval: 1,
              getTitlesWidget: (value, _) {
                final i = value.toInt();
                if (i < 0 || i >= n) return const SizedBox.shrink();
                final label = series[i]['label']?.toString() ?? '';
                final child = AppText(
                  label,
                  fontSize: compactXAxis ? 8 : 10,
                  color: isDark ? Colors.white54 : Colors.black54,
                  fontWeight: FontWeight.bold,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                );
                return Padding(
                  padding: EdgeInsets.only(
                    top: rotateXLabels ? 2.0 : (compactXAxis ? 6.0 : 12.0),
                  ),
                  child: rotateXLabels
                      ? Transform.rotate(
                          angle: -0.45,
                          alignment: Alignment.topCenter,
                          child: SizedBox(
                            width: 72,
                            child: Align(
                              alignment: Alignment.topCenter,
                              child: child,
                            ),
                          ),
                        )
                      : child,
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
        barGroups: List.generate(n, (i) {
          final data = series[i];
          final inc = (data['income'] as num?)?.toDouble() ?? 0;
          final exp = (data['expense'] as num?)?.toDouble() ?? 0;
          final rods = <BarChartRodData>[];
          if (_showRevenue) {
            rods.add(
              BarChartRodData(
                toY: inc,
                color: const Color(0xFF19C37D),
                width: (320 / n).clamp(4.0, 18.0),
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(4),
                ),
                gradient: LinearGradient(
                  begin: Alignment.bottomCenter,
                  end: Alignment.topCenter,
                  colors: [
                    const Color(0xFF19C37D).withValues(alpha: 0.4),
                    const Color(0xFF19C37D),
                  ],
                ),
              ),
            );
          }
          if (_showExpenses) {
            rods.add(
              BarChartRodData(
                toY: exp,
                color: const Color(0xFF2B7FFF),
                width: (320 / n).clamp(4.0, 18.0),
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(4),
                ),
                gradient: LinearGradient(
                  begin: Alignment.bottomCenter,
                  end: Alignment.topCenter,
                  colors: [
                    const Color(0xFF2B7FFF).withValues(alpha: 0.4),
                    const Color(0xFF2B7FFF),
                  ],
                ),
              ),
            );
          }
          if (rods.isEmpty) {
            rods.add(
              BarChartRodData(toY: 0.001, color: Colors.transparent, width: 1),
            );
          }
          return BarChartGroupData(x: i, barsSpace: 6, barRods: rods);
        }),
      ),
    );
  }

  Widget _buildPnLTrendLineOverlay(
    FinancialReportController controller,
    List<Map<String, dynamic>> series,
    bool isDark, {
    required List<double> spotXN,
    required bool compactXAxis,
  }) {
    final yBounds = _pnlTrendChartYBounds(series, controller);
    final minY = yBounds.minY;
    final maxY = yBounds.maxY;
    final n = series.length;
    final profitColor = isDark ? Colors.white : Colors.black87;
    final prev = controller.prevTrendChartSeries;
    final prevN = prev.length;
    final compareLen = prevN < n ? prevN : n;
    const bool rotateXLabels = false;
    final bottomReserved = rotateXLabels ? 52.0 : (compactXAxis ? 48.0 : 36.0);

    final lineBars = <LineChartBarData>[];
    if (_showProfit) {
      lineBars.add(
        LineChartBarData(
          spots: List.generate(n, (i) {
            final net = (series[i]['net'] as num?)?.toDouble() ?? 0;
            final xn = i < spotXN.length ? spotXN[i] : 0.5;
            return FlSpot(xn, net);
          }),
          isCurved: true,
          preventCurveOverShooting: true,
          curveSmoothness: 0.35,
          color: profitColor,
          barWidth: 2,
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
          dotData: FlDotData(
            show: true,
            getDotPainter: (spot, p1, p2, p3) => FlDotCirclePainter(
              radius: n > 60 ? 2.0 : 3.0,
              color: profitColor,
              strokeWidth: 1.5,
              strokeColor: const Color(0xFF0F1E37),
            ),
          ),
        ),
      );
    }
    if (_comparePriorPeriod && compareLen > 0) {
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
          color: isDark ? Colors.white54 : Colors.black38,
          barWidth: 2,
          dashArray: [6, 4],
          dotData: const FlDotData(show: false),
        ),
      );
    }

    // Let pointer events hit the bar chart below so period values show on hover /
    // tap (clean shorthand); the line layer stays visible only.
    return IgnorePointer(
      ignoring: true,
      child: LineChart(
        LineChartData(
          baselineY: 0,
          minX: 0,
          maxX: 1,
          minY: minY,
          maxY: maxY,
          lineTouchData: const LineTouchData(enabled: false),
          gridData: const FlGridData(show: false),
          borderData: FlBorderData(show: false),
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
    );
  }

  Widget _buildRevenueExpenseGrowthChart(FinancialReportController controller) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final growthSeries = controller.chartData;
    final xAxisStep = _chartXAxisStep(growthSeries.length);
    final hideDenseDots = growthSeries.length > 18;
    final negativeAreaColor = const Color(0xFFE57373).withValues(alpha: 0.25);
    final negativeAreaSpots = growthSeries.asMap().entries.map((e) {
      final revenueGrowth = (e.value['revenueGrowth'] as num?)?.toDouble() ?? 0;
      final expenseGrowth = (e.value['expenseGrowth'] as num?)?.toDouble() ?? 0;
      final minGrowth = revenueGrowth < expenseGrowth
          ? revenueGrowth
          : expenseGrowth;
      return FlSpot(e.key.toDouble(), minGrowth < 0 ? minGrowth : 0);
    }).toList();
    final allValues = growthSeries
        .expand(
          (e) => [
            (e['revenueGrowth'] as num?)?.toDouble() ?? 0,
            (e['expenseGrowth'] as num?)?.toDouble() ?? 0,
          ],
        )
        .toList();
    final maxV = allValues.isEmpty
        ? 10.0
        : allValues.reduce((a, b) => a > b ? a : b);
    final minV = allValues.isEmpty
        ? -10.0
        : allValues.reduce((a, b) => a < b ? a : b);
    final maxY = ((maxV + 10) / 10).ceil() * 10.0;
    final minY = ((minV - 10) / 10).floor() * 10.0;
    final yInterval = _growthYAxisInterval(minY, maxY);

    return Container(
      height: 380,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: isDark ? Colors.white.withValues(alpha: 0.08) : Colors.black12,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.15 : 0.05),
            blurRadius: 30,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppText(
            "Revenue Growth vs Expense Growth",
            fontSize: 18,
            fontWeight: FontWeight.w900,
            color: isDark ? Colors.white : Colors.black87,
          ),
          const SizedBox(height: 8),
          if (_startDate != null && _endDate != null)
            AppText(
              "${DateFormat('MMM dd, yyyy').format(_startDate!)} – ${DateFormat('MMM dd, yyyy').format(_endDate!)}",
              fontSize: 11,
              color: isDark ? Colors.white38 : Colors.black54,
            ),
          const SizedBox(height: 32),
          Expanded(
            child: growthSeries.isEmpty
                ? Center(
                    child: AppText(
                      "Data will appear for this range",
                      color: isDark ? Colors.white38 : Colors.black45,
                    ),
                  )
                : LineChart(
                    LineChartData(
                      baselineY: 0,
                      minY: minY,
                      maxY: maxY,
                      lineTouchData: LineTouchData(
                        touchTooltipData: LineTouchTooltipData(
                          getTooltipItems: (touchedSpots) {
                            return touchedSpots.map((spot) {
                              if (spot.barIndex == 0) return null;
                              final label = spot.barIndex == 1
                                  ? "Revenue Growth"
                                  : "Expense Growth";
                              final isRevenue = spot.barIndex == 1;
                              final color = isRevenue
                                  ? const Color(0xFF19C37D)
                                  : const Color(0xFF2B7FFF);
                              return LineTooltipItem(
                                "$label: ",
                                TextStyle(
                                  color: isDark
                                      ? Colors.white70
                                      : Colors.black87,
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold,
                                ),
                                children: [
                                  TextSpan(
                                    text: _formatSignedPercent(spot.y),
                                    style: TextStyle(
                                      color: color,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w900,
                                    ),
                                  ),
                                ],
                              );
                            }).toList();
                          },
                          fitInsideHorizontally: true,
                          fitInsideVertically: true,
                        ),
                        getTouchedSpotIndicator:
                            (LineChartBarData barData, List<int> spotIndexes) {
                              return spotIndexes.map((index) {
                                return TouchedSpotIndicatorData(
                                  const FlLine(color: Colors.transparent),
                                  FlDotData(
                                    show: true,
                                    getDotPainter:
                                        (
                                          spot,
                                          percent,
                                          barData,
                                          index,
                                        ) => FlDotCirclePainter(
                                          radius: 4,
                                          color: barData.color ?? Colors.white,
                                          strokeWidth: 1.5,
                                          strokeColor: const Color(0xFF0F1E37),
                                        ),
                                  ),
                                );
                              }).toList();
                            },
                      ),
                      gridData: FlGridData(
                        show: true,
                        drawVerticalLine: false,
                        getDrawingHorizontalLine: (value) => FlLine(
                          color: (Get.isDarkMode ? Colors.white : Colors.black)
                              .withValues(alpha: 0.05),
                          strokeWidth: 1,
                        ),
                      ),
                      titlesData: FlTitlesData(
                        leftTitles: AxisTitles(
                          sideTitles: SideTitles(
                            showTitles: true,
                            reservedSize: 45,
                            interval: yInterval,
                            getTitlesWidget: (value, meta) {
                              if (value == meta.max || value == meta.min) {
                                return const SizedBox.shrink();
                              }
                              return AppText(
                                _formatPercentAxis(value),
                                fontSize: 10,
                                color: Get.isDarkMode
                                    ? Colors.white38
                                    : Colors.black45,
                                fontWeight: FontWeight.bold,
                              );
                            },
                          ),
                        ),
                        bottomTitles: AxisTitles(
                          sideTitles: SideTitles(
                            showTitles: true,
                            reservedSize: 36,
                            interval: 1,
                            getTitlesWidget: (value, _) {
                              final idx = value.toInt();
                              if (idx < 0 || idx >= growthSeries.length) {
                                return const SizedBox.shrink();
                              }
                              if (!_shouldShowXAxisLabel(
                                idx,
                                growthSeries.length,
                                xAxisStep,
                              )) {
                                return const SizedBox.shrink();
                              }
                              return Padding(
                                padding: const EdgeInsets.only(top: 12.0),
                                child: AppText(
                                  growthSeries[idx]['name'] ?? "",
                                  fontSize: 10,
                                  color: Get.isDarkMode
                                      ? Colors.white38
                                      : Colors.black45,
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
                      borderData: FlBorderData(show: false),
                      lineBarsData: [
                        LineChartBarData(
                          spots: negativeAreaSpots,
                          isCurved: true,
                          preventCurveOverShooting: true,
                          color: Colors.transparent,
                          barWidth: 0,
                          dotData: const FlDotData(show: false),
                          aboveBarData: BarAreaData(
                            show: true,
                            applyCutOffY: true,
                            cutOffY: 0,
                            color: negativeAreaColor,
                          ),
                        ),
                        LineChartBarData(
                          spots: growthSeries
                              .asMap()
                              .entries
                              .map(
                                (e) => FlSpot(
                                  e.key.toDouble(),
                                  (e.value['revenueGrowth'] as num?)
                                          ?.toDouble() ??
                                      0,
                                ),
                              )
                              .toList(),
                          isCurved: true,
                          preventCurveOverShooting: true,
                          color: const Color(0xFF19C37D),
                          barWidth: 3,
                          belowBarData: BarAreaData(
                            show: true,
                            applyCutOffY: true,
                            cutOffY: 0,
                            color: const Color(
                              0xFF19C37D,
                            ).withValues(alpha: 0.2),
                          ),
                          aboveBarData: BarAreaData(
                            show: true,
                            applyCutOffY: true,
                            cutOffY: 0,
                            color: const Color(
                              0xFFE57373,
                            ).withValues(alpha: 0.2),
                          ),
                          dotData: FlDotData(show: !hideDenseDots),
                        ),
                        LineChartBarData(
                          spots: growthSeries
                              .asMap()
                              .entries
                              .map(
                                (e) => FlSpot(
                                  e.key.toDouble(),
                                  (e.value['expenseGrowth'] as num?)
                                          ?.toDouble() ??
                                      0,
                                ),
                              )
                              .toList(),
                          isCurved: true,
                          preventCurveOverShooting: true,
                          color: const Color(0xFF2B7FFF),
                          barWidth: 3,
                          belowBarData: BarAreaData(
                            show: true,
                            applyCutOffY: true,
                            cutOffY: 0,
                            color: const Color(
                              0xFF2B7FFF,
                            ).withValues(alpha: 0.2),
                          ),
                          aboveBarData: BarAreaData(
                            show: true,
                            applyCutOffY: true,
                            cutOffY: 0,
                            color: const Color(
                              0xFFE57373,
                            ).withValues(alpha: 0.2),
                          ),
                          dotData: FlDotData(show: !hideDenseDots),
                        ),
                      ],
                    ),
                  ),
          ),
          const SizedBox(height: 24),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _legendItem(
                const Color(0xFF19C37D),
                "Revenue Growth",
                isLine: true,
              ),
              const SizedBox(width: 24),
              _legendItem(
                const Color(0xFF2B7FFF),
                "Expense Growth",
                isLine: true,
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// COGS growth % vs revenue growth % (same prior-period logic as other P&L charts).
  Widget _buildCogsRevenueChart(FinancialReportController controller) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final cogsSeries = controller.chartData;
    final xAxisStep = _chartXAxisStep(cogsSeries.length);
    final hideDenseDots = cogsSeries.length > 18;
    final negativeAreaColor = const Color(0xFFE57373).withValues(alpha: 0.25);
    final negativeAreaSpots = cogsSeries.asMap().entries.map((e) {
      final revenueGrowth = (e.value['revenueGrowth'] as num?)?.toDouble() ?? 0;
      final cogsGrowth = (e.value['cogsGrowth'] as num?)?.toDouble() ?? 0;
      final minGrowth = revenueGrowth < cogsGrowth ? revenueGrowth : cogsGrowth;
      return FlSpot(e.key.toDouble(), minGrowth < 0 ? minGrowth : 0);
    }).toList();
    final allValues = cogsSeries
        .expand(
          (e) => [
            (e['revenueGrowth'] as num?)?.toDouble() ?? 0,
            (e['cogsGrowth'] as num?)?.toDouble() ?? 0,
          ],
        )
        .toList();
    final maxV = allValues.isEmpty
        ? 10.0
        : allValues.reduce((a, b) => a > b ? a : b);
    final minV = allValues.isEmpty
        ? -10.0
        : allValues.reduce((a, b) => a < b ? a : b);
    final maxY = ((maxV + 10) / 10).ceil() * 10.0;
    final minY = ((minV - 10) / 10).floor() * 10.0;
    final yInterval = _growthYAxisInterval(minY, maxY);

    return Container(
      height: 380,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: isDark ? Colors.white.withValues(alpha: 0.08) : Colors.black12,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.15 : 0.05),
            blurRadius: 30,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppText(
            "COGS Growth vs Revenue Growth",
            fontSize: 18,
            fontWeight: FontWeight.w900,
            color: isDark ? Colors.white : Colors.black87,
          ),
          const SizedBox(height: 8),
          if (_startDate != null && _endDate != null)
            AppText(
              "${DateFormat('MMM dd, yyyy').format(_startDate!)} – ${DateFormat('MMM dd, yyyy').format(_endDate!)}",
              fontSize: 11,
              color: isDark ? Colors.white38 : Colors.black54,
            ),
          const SizedBox(height: 32),
          Expanded(
            child: cogsSeries.isEmpty
                ? Center(
                    child: AppText(
                      "Data will appear for this range",
                      color: isDark ? Colors.white38 : Colors.black45,
                    ),
                  )
                : LineChart(
                    LineChartData(
                      baselineY: 0,
                      minY: minY,
                      maxY: maxY,
                      lineTouchData: LineTouchData(
                        touchTooltipData: LineTouchTooltipData(
                          getTooltipColor: (_) => isDark
                              ? const Color(0xFF1E293B)
                              : const Color(0xFF0F1E37),
                          getTooltipItems: (touchedSpots) {
                            return touchedSpots.map((spot) {
                              if (spot.barIndex == 0) return null;
                              final label = spot.barIndex == 1
                                  ? "Revenue Growth"
                                  : "COGS Growth";
                              final isRevenue = spot.barIndex == 1;
                              final color = isRevenue
                                  ? const Color(0xFF19C37D)
                                  : orangeColor;
                              return LineTooltipItem(
                                "$label: ",
                                TextStyle(
                                  color: isDark
                                      ? Colors.white70
                                      : Colors.black87,
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold,
                                ),
                                children: [
                                  TextSpan(
                                    text: _formatSignedPercent(spot.y),
                                    style: TextStyle(
                                      color: color,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w900,
                                    ),
                                  ),
                                ],
                              );
                            }).toList();
                          },
                          fitInsideHorizontally: true,
                          fitInsideVertically: true,
                        ),
                        getTouchedSpotIndicator:
                            (LineChartBarData barData, List<int> spotIndexes) {
                              return spotIndexes.map((index) {
                                return TouchedSpotIndicatorData(
                                  const FlLine(color: Colors.transparent),
                                  FlDotData(
                                    show: true,
                                    getDotPainter:
                                        (
                                          spot,
                                          percent,
                                          barData,
                                          index,
                                        ) => FlDotCirclePainter(
                                          radius: 4,
                                          color: barData.color ?? Colors.white,
                                          strokeWidth: 1.5,
                                          strokeColor: const Color(0xFF0F1E37),
                                        ),
                                  ),
                                );
                              }).toList();
                            },
                      ),
                      gridData: FlGridData(
                        show: true,
                        drawVerticalLine: false,
                        getDrawingHorizontalLine: (value) => FlLine(
                          color: (Get.isDarkMode ? Colors.white : Colors.black)
                              .withValues(alpha: 0.05),
                          strokeWidth: 1,
                        ),
                      ),
                      titlesData: FlTitlesData(
                        leftTitles: AxisTitles(
                          sideTitles: SideTitles(
                            showTitles: true,
                            reservedSize: 45,
                            interval: yInterval,
                            getTitlesWidget: (value, meta) {
                              if (value == meta.max || value == meta.min) {
                                return const SizedBox.shrink();
                              }
                              return AppText(
                                _formatPercentAxis(value),
                                fontSize: 10,
                                color: Get.isDarkMode
                                    ? Colors.white38
                                    : Colors.black45,
                                fontWeight: FontWeight.bold,
                              );
                            },
                          ),
                        ),
                        bottomTitles: AxisTitles(
                          sideTitles: SideTitles(
                            showTitles: true,
                            reservedSize: 36,
                            interval: 1,
                            getTitlesWidget: (value, _) {
                              final idx = value.toInt();
                              if (idx < 0 || idx >= cogsSeries.length) {
                                return const SizedBox.shrink();
                              }
                              if (!_shouldShowXAxisLabel(
                                idx,
                                cogsSeries.length,
                                xAxisStep,
                              )) {
                                return const SizedBox.shrink();
                              }
                              return Padding(
                                padding: const EdgeInsets.only(top: 12.0),
                                child: AppText(
                                  cogsSeries[idx]['name'] ?? "",
                                  fontSize: 10,
                                  color: Get.isDarkMode
                                      ? Colors.white38
                                      : Colors.black45,
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
                      borderData: FlBorderData(show: false),
                      lineBarsData: [
                        LineChartBarData(
                          spots: negativeAreaSpots,
                          isCurved: true,
                          preventCurveOverShooting: true,
                          color: Colors.transparent,
                          barWidth: 0,
                          dotData: const FlDotData(show: false),
                          aboveBarData: BarAreaData(
                            show: true,
                            applyCutOffY: true,
                            cutOffY: 0,
                            color: negativeAreaColor,
                          ),
                        ),
                        LineChartBarData(
                          spots: cogsSeries
                              .asMap()
                              .entries
                              .map(
                                (e) => FlSpot(
                                  e.key.toDouble(),
                                  (e.value['revenueGrowth'] as num?)
                                          ?.toDouble() ??
                                      0,
                                ),
                              )
                              .toList(),
                          isCurved: true,
                          preventCurveOverShooting: true,
                          color: const Color(0xFF19C37D),
                          barWidth: 3,
                          belowBarData: BarAreaData(
                            show: true,
                            applyCutOffY: true,
                            cutOffY: 0,
                            color: const Color(
                              0xFF19C37D,
                            ).withValues(alpha: 0.2),
                          ),
                          aboveBarData: BarAreaData(
                            show: true,
                            applyCutOffY: true,
                            cutOffY: 0,
                            color: const Color(
                              0xFFE57373,
                            ).withValues(alpha: 0.2),
                          ),
                          dotData: FlDotData(show: !hideDenseDots),
                        ),
                        LineChartBarData(
                          spots: cogsSeries
                              .asMap()
                              .entries
                              .map(
                                (e) => FlSpot(
                                  e.key.toDouble(),
                                  (e.value['cogsGrowth'] as num?)?.toDouble() ??
                                      0,
                                ),
                              )
                              .toList(),
                          isCurved: true,
                          preventCurveOverShooting: true,
                          color: orangeColor,
                          barWidth: 3,
                          belowBarData: BarAreaData(
                            show: true,
                            applyCutOffY: true,
                            cutOffY: 0,
                            color: orangeColor.withValues(alpha: 0.2),
                          ),
                          aboveBarData: BarAreaData(
                            show: true,
                            applyCutOffY: true,
                            cutOffY: 0,
                            color: const Color(
                              0xFFE57373,
                            ).withValues(alpha: 0.2),
                          ),
                          dotData: FlDotData(show: !hideDenseDots),
                        ),
                      ],
                    ),
                  ),
          ),
          const SizedBox(height: 24),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _legendItem(
                const Color(0xFF19C37D),
                "Revenue Growth",
                isLine: true,
              ),
              const SizedBox(width: 24),
              _legendItem(orangeColor, "COGS Growth", isLine: true),
            ],
          ),
        ],
      ),
    );
  }

  Widget _legendItem(
    Color color,
    String label, {
    bool isBar = false,
    bool isLine = false,
    bool isDashed = false,
  }) {
    final isDark = Get.isDarkMode;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (isDashed)
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 5,
                height: 2,
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(width: 2),
              Container(
                width: 5,
                height: 2,
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ],
          )
        else
          Container(
            width: isLine ? 16 : 10,
            height: isLine ? 2 : 10,
            decoration: BoxDecoration(
              color: color,
              borderRadius: (isBar || isLine)
                  ? BorderRadius.circular(isBar ? 2 : 5)
                  : null,
              shape: (isBar || isLine) ? BoxShape.rectangle : BoxShape.circle,
            ),
          ),
        const SizedBox(width: 8),
        AppText(
          label,
          fontSize: 11,
          color: isDark ? Colors.white70 : Colors.black54,
          fontWeight: FontWeight.w500,
        ),
      ],
    );
  }

  /// Whole-dollar shorthand for chart axes: `$4`, `$10K`, `$100K`, `$1M` (no fractional K/M).
  String _formatWholeCurrencyShorthand(double value) {
    final sign = value < 0 ? '-' : '';
    final r = value.abs().round();
    if (r >= 1000000000) {
      final b = (r / 1000000000).round();
      return '$sign\$${b}B';
    }
    if (r >= 1000000) {
      final m = (r / 1000000).round();
      return '$sign\$${m}M';
    }
    if (r >= 1000) {
      final k = (r / 1000).round();
      if (k >= 1000) {
        final m = (r / 1000000).round();
        return '$sign\$${m}M';
      }
      return '$sign\$${k}K';
    }
    return '$sign\$$r';
  }

  double _niceAxisInterval(double maxY) {
    if (maxY <= 0) return 1;
    final raw = maxY / 4; // target ~4 major ticks
    final exponent = (math.log(raw) / math.ln10).floor();
    final magnitude = math.pow(10, exponent).toDouble();
    final normalized = raw / magnitude;
    double nice;
    if (normalized <= 1) {
      nice = 1;
    } else if (normalized <= 2) {
      nice = 2;
    } else if (normalized <= 5) {
      nice = 5;
    } else {
      nice = 10;
    }
    return nice * magnitude;
  }

  String _formatSignedPercent(double value) {
    final sign = value > 0 ? '+' : '';
    return '$sign${value.toStringAsFixed(1)}%';
  }

  int _chartXAxisStep(int pointCount) {
    if (pointCount <= 8) return 1;
    if (pointCount <= 14) return 2;
    if (pointCount <= 24) return 3;
    if (pointCount <= 40) return 5;
    if (pointCount <= 60) return 7;
    return 10;
  }

  bool _shouldShowXAxisLabel(int index, int total, int step) {
    if (total <= 1) return true;
    if (index == 0) return true;
    if (index == total - 1) {
      final remainder = (total - 1) % step;
      return remainder > (step / 2);
    }
    return index % step == 0;
  }

  double _growthYAxisInterval(double minY, double maxY) {
    final range = (maxY - minY).abs();
    if (range <= 0) return 10;

    // Keep around 5 y-axis labels to avoid overlap on large spikes.
    final rawStep = range / 5;
    final magnitude = math.pow(10, (math.log(rawStep) / math.ln10).floor());
    final normalized = rawStep / magnitude;

    double niceNormalized;
    if (normalized <= 1) {
      niceNormalized = 1;
    } else if (normalized <= 2) {
      niceNormalized = 2;
    } else if (normalized <= 5) {
      niceNormalized = 5;
    } else {
      niceNormalized = 10;
    }
    return niceNormalized * magnitude;
  }

  String _formatPercentAxis(double value) {
    final abs = value.abs();
    if (abs >= 1000) {
      return '${(value / 1000).toStringAsFixed(1)}K%';
    }
    return '${value.toInt()}%';
  }
}
