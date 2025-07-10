// ignore_for_file: depend_on_referenced_packages

import 'dart:convert';

import 'package:archive/archive.dart';
import 'package:excel/excel.dart' as excel_lib;
import 'package:intl/intl.dart';
import 'package:xml/xml.dart';

import 'package:booksmart/utils/downloader.dart';

class BalanceSheetExcelExportRequest {
  BalanceSheetExcelExportRequest({
    required this.companyName,
    required this.asOfDate,
    required this.periodLabels,
    required this.assets,
    required this.liabilities,
    required this.equity,
    this.fileNamePrefix = 'Balance_Sheet_Analysis',
    this.collapseSectionsByDefault = true,
  });

  final String companyName;
  final DateTime asOfDate;
  final List<String> periodLabels;
  final List<BalanceSheetExcelRow> assets;
  final List<BalanceSheetExcelRow> liabilities;
  final List<BalanceSheetExcelRow> equity;
  final String fileNamePrefix;
  final bool collapseSectionsByDefault;
}

class BalanceSheetExcelRow {
  BalanceSheetExcelRow({
    required this.label,
    required this.valuesByPeriod,
    this.selected = true,
    this.isUserInput = false,
    this.isCalculated = false,
    this.group,
  });

  final String label;
  final Map<String, double> valuesByPeriod;
  final bool selected;
  final bool isUserInput;
  final bool isCalculated;
  final String? group;
}

class BalanceSheetExcelService {
  Future<void> exportAnalysisExcel(
    BalanceSheetExcelExportRequest request,
  ) async {
    final List<String> periods = request.periodLabels
        .where((e) => e.trim().isNotEmpty)
        .toList();
    if (periods.isEmpty) {
      throw ArgumentError('At least one period is required.');
    }

    final excel = excel_lib.Excel.createExcel();
    final excel_lib.Sheet sheet = excel['Balance Sheet'];
    excel.delete('Sheet1');

    final int periodCount = periods.length;
    final int labelCol = 0;
    final int firstSymbolCol = 1;
    int symbolColForPeriod(int index) => firstSymbolCol + (index * 2);
    int amountColForPeriod(int index) => symbolColForPeriod(index) + 1;
    final int totalSymbolCol = symbolColForPeriod(periodCount);
    final int totalAmountCol = totalSymbolCol + 1;
    final int colCount = totalAmountCol + 1;

    final titleStyle = excel_lib.CellStyle(
      bold: true,
      fontSize: 19,
      fontColorHex: excel_lib.ExcelColor.fromHexString('FFFFFFFF'),
      backgroundColorHex: excel_lib.ExcelColor.fromHexString('FF134A85'),
      horizontalAlign: excel_lib.HorizontalAlign.Center,
    );
    final subTitleStyle = excel_lib.CellStyle(
      bold: false,
      fontSize: 16,
      fontColorHex: excel_lib.ExcelColor.fromHexString('FFFFFFFF'),
      backgroundColorHex: excel_lib.ExcelColor.fromHexString('FF1F5C99'),
      horizontalAlign: excel_lib.HorizontalAlign.Center,
    );
    final companyStyle = excel_lib.CellStyle(
      bold: true,
      fontSize: 18,
      fontColorHex: excel_lib.ExcelColor.fromHexString('FFFFFFFF'),
      backgroundColorHex: excel_lib.ExcelColor.fromHexString('FF134A85'),
      horizontalAlign: excel_lib.HorizontalAlign.Left,
    );
    final companyMetaStyle = excel_lib.CellStyle(
      bold: false,
      fontSize: 12,
      fontColorHex: excel_lib.ExcelColor.fromHexString('FFFFFFFF'),
      backgroundColorHex: excel_lib.ExcelColor.fromHexString('FF1F5C99'),
      horizontalAlign: excel_lib.HorizontalAlign.Left,
    );
    final headerStyle = excel_lib.CellStyle(
      bold: true,
      fontColorHex: excel_lib.ExcelColor.fromHexString('FF1F1F1F'),
      backgroundColorHex: excel_lib.ExcelColor.fromHexString('FF7391AF'),
      horizontalAlign: excel_lib.HorizontalAlign.Center,
    );
    final sectionBandStyle = excel_lib.CellStyle(
      bold: true,
      fontColorHex: excel_lib.ExcelColor.fromHexString('FFFFFFFF'),
      backgroundColorHex: excel_lib.ExcelColor.fromHexString('FF7391AF'),
    );
    final subSectionLabelStyle = excel_lib.CellStyle(
      bold: true,
      horizontalAlign: excel_lib.HorizontalAlign.Left,
    );
    final labelStyle = excel_lib.CellStyle(
      bold: false,
      horizontalAlign: excel_lib.HorizontalAlign.Left,
    );
    final userInputLabelStyle = excel_lib.CellStyle(
      bold: false,
      fontColorHex: excel_lib.ExcelColor.fromHexString('FF22577A'),
      horizontalAlign: excel_lib.HorizontalAlign.Left,
    );
    final calculatedLabelStyle = excel_lib.CellStyle(
      bold: true,
      fontColorHex: excel_lib.ExcelColor.fromHexString('FF1D3557'),
      horizontalAlign: excel_lib.HorizontalAlign.Left,
    );
    final currencyStyle = excel_lib.CellStyle(
      numberFormat: const excel_lib.CustomNumericNumFormat(
        formatCode: r'$#,##0.00;[Red]($#,##0.00)',
      ),
      horizontalAlign: excel_lib.HorizontalAlign.Right,
    );
    final negativeCurrencyStyle = excel_lib.CellStyle(
      fontColorHex: excel_lib.ExcelColor.fromHexString('FFBE4141'),
      numberFormat: const excel_lib.CustomNumericNumFormat(
        formatCode: r'$#,##0.00;[Red]($#,##0.00)',
      ),
      horizontalAlign: excel_lib.HorizontalAlign.Right,
    );
    final dollarStyle = excel_lib.CellStyle(
      bold: true,
      horizontalAlign: excel_lib.HorizontalAlign.Center,
    );
    final emptySymbolStyle = excel_lib.CellStyle(
      horizontalAlign: excel_lib.HorizontalAlign.Center,
    );
    final emptyAmountStyle = excel_lib.CellStyle(
      horizontalAlign: excel_lib.HorizontalAlign.Right,
    );
    final totalLabelStyle = excel_lib.CellStyle(
      bold: true,
      backgroundColorHex: excel_lib.ExcelColor.fromHexString('FFE7F1FC'),
      horizontalAlign: excel_lib.HorizontalAlign.Left,
    );
    final totalDollarStyle = excel_lib.CellStyle(
      bold: true,
      backgroundColorHex: excel_lib.ExcelColor.fromHexString('FFE7F1FC'),
      horizontalAlign: excel_lib.HorizontalAlign.Center,
    );
    final totalCurrencyStyle = excel_lib.CellStyle(
      bold: true,
      backgroundColorHex: excel_lib.ExcelColor.fromHexString('FFE7F1FC'),
      numberFormat: const excel_lib.CustomNumericNumFormat(
        formatCode: r'$#,##0.00;[Red]($#,##0.00)',
      ),
      horizontalAlign: excel_lib.HorizontalAlign.Right,
    );
    final balanceCheckStyle = excel_lib.CellStyle(
      bold: true,
      fontColorHex: excel_lib.ExcelColor.fromHexString('FFFFFFFF'),
      backgroundColorHex: excel_lib.ExcelColor.fromHexString('FF133E6E'),
      numberFormat: const excel_lib.CustomNumericNumFormat(
        formatCode: r'$#,##0.00;[Red]($#,##0.00)',
      ),
      horizontalAlign: excel_lib.HorizontalAlign.Right,
    );

    void setCell(
      int col,
      int row,
      excel_lib.CellValue value, [
      excel_lib.CellStyle? style,
    ]) {
      final cell = sheet.cell(
        excel_lib.CellIndex.indexByColumnRow(columnIndex: col, rowIndex: row),
      );
      cell.value = value;
      if (style != null) {
        cell.cellStyle = style;
      }
    }

    void fillRowWithStyle(int row, excel_lib.CellStyle style) {
      for (int c = 0; c < colCount; c++) {
        // A single whitespace keeps the cell "materialized" so style is visible in Excel.
        setCell(c, row, excel_lib.TextCellValue(' '), style);
      }
    }

    String cleanLabel(String label) {
      final RegExp tag = RegExp(r'^\s*\[[^\]]+\]\s*');
      return label.replaceFirst(tag, '').trim();
    }

    String resolveGroup(BalanceSheetExcelRow row, String fallback) {
      if (row.group != null && row.group!.trim().isNotEmpty) {
        return row.group!.trim();
      }
      final Match? m = RegExp(r'^\s*\[([^\]]+)\]').firstMatch(row.label);
      if (m != null) return m.group(1)!.trim().toUpperCase();
      return fallback;
    }

    // Fill complete header rows so the highlight spans full width.
    fillRowWithStyle(0, titleStyle);
    fillRowWithStyle(1, companyMetaStyle);
    fillRowWithStyle(2, subTitleStyle);
    fillRowWithStyle(3, companyMetaStyle);
    setCell(
      labelCol,
      0,
      excel_lib.TextCellValue(request.companyName),
      companyStyle,
    );
    setCell(
      labelCol,
      1,
      excel_lib.TextCellValue('1234 Anytown St.'),
      companyMetaStyle,
    );
    setCell(
      labelCol,
      2,
      excel_lib.TextCellValue('City, State 12345'),
      companyMetaStyle,
    );
    setCell(
      labelCol,
      3,
      excel_lib.TextCellValue('Phone: (000) 000-0000'),
      companyMetaStyle,
    );
    setCell(
      firstSymbolCol,
      0,
      excel_lib.TextCellValue('BALANCE SHEET'),
      titleStyle,
    );
    setCell(
      firstSymbolCol,
      2,
      excel_lib.TextCellValue(
        'As of ${DateFormat('MMMM dd,').format(request.asOfDate)}',
      ),
      subTitleStyle,
    );
    sheet.merge(
      excel_lib.CellIndex.indexByColumnRow(
        columnIndex: firstSymbolCol,
        rowIndex: 0,
      ),
      excel_lib.CellIndex.indexByColumnRow(
        columnIndex: totalAmountCol,
        rowIndex: 0,
      ),
    );
    sheet.merge(
      excel_lib.CellIndex.indexByColumnRow(
        columnIndex: firstSymbolCol,
        rowIndex: 2,
      ),
      excel_lib.CellIndex.indexByColumnRow(
        columnIndex: totalAmountCol,
        rowIndex: 2,
      ),
    );
    sheet.setMergedCellStyle(
      excel_lib.CellIndex.indexByColumnRow(
        columnIndex: firstSymbolCol,
        rowIndex: 0,
      ),
      titleStyle,
    );
    sheet.setMergedCellStyle(
      excel_lib.CellIndex.indexByColumnRow(
        columnIndex: firstSymbolCol,
        rowIndex: 2,
      ),
      subTitleStyle,
    );
    sheet.setRowHeight(0, 24);
    sheet.setRowHeight(1, 18);
    sheet.setRowHeight(2, 18);
    sheet.setRowHeight(3, 18);
    for (int c = 0; c < colCount; c++) {
      if (c == labelCol) {
        sheet.setColumnWidth(c, 40);
      } else if (c.isOdd) {
        sheet.setColumnWidth(c, 5.2);
      } else {
        // Wide enough for $#,##0.00 so Excel does not show ####### in narrow columns.
        sheet.setColumnWidth(c, 24);
      }
    }

    int rowCursor = 6;
    final List<_OutlineGroup> outlineGroups = <_OutlineGroup>[];

    void writeSectionHeader(String title) {
      setCell(
        labelCol,
        rowCursor,
        excel_lib.TextCellValue(title),
        sectionBandStyle,
      );
      for (int i = 0; i < periodCount; i++) {
        setCell(
          amountColForPeriod(i),
          rowCursor,
          excel_lib.TextCellValue(periods[i]),
          sectionBandStyle,
        );
        sheet.merge(
          excel_lib.CellIndex.indexByColumnRow(
            columnIndex: symbolColForPeriod(i),
            rowIndex: rowCursor,
          ),
          excel_lib.CellIndex.indexByColumnRow(
            columnIndex: amountColForPeriod(i),
            rowIndex: rowCursor,
          ),
        );
        sheet.setMergedCellStyle(
          excel_lib.CellIndex.indexByColumnRow(
            columnIndex: symbolColForPeriod(i),
            rowIndex: rowCursor,
          ),
          sectionBandStyle,
        );
      }
      setCell(
        totalAmountCol,
        rowCursor,
        excel_lib.TextCellValue('TOTAL'),
        sectionBandStyle,
      );
      sheet.merge(
        excel_lib.CellIndex.indexByColumnRow(
          columnIndex: totalSymbolCol,
          rowIndex: rowCursor,
        ),
        excel_lib.CellIndex.indexByColumnRow(
          columnIndex: totalAmountCol,
          rowIndex: rowCursor,
        ),
      );
      sheet.setMergedCellStyle(
        excel_lib.CellIndex.indexByColumnRow(
          columnIndex: totalSymbolCol,
          rowIndex: rowCursor,
        ),
        sectionBandStyle,
      );
      rowCursor += 1;
    }

    _SectionAnchor writeGroupedSection({
      required String sectionTitle,
      required Map<String, List<BalanceSheetExcelRow>> groupedRows,
      required List<int>? collectGroupTotalRows,
      required String finalTotalLabel,
    }) {
      writeSectionHeader(sectionTitle);

      final List<int> groupTotalRows = <int>[];

      for (final MapEntry<String, List<BalanceSheetExcelRow>> entry
          in groupedRows.entries) {
        final String groupName = entry.key;
        final List<BalanceSheetExcelRow> rows = entry.value.where((row) {
          if (!row.selected && !row.isUserInput && !row.isCalculated) {
            return false;
          }
          final bool hasValues = periods.any(
            (period) => (row.valuesByPeriod[period] ?? 0) != 0,
          );
          return hasValues || row.isUserInput || row.isCalculated;
        }).toList();
        if (rows.isEmpty) continue;

        setCell(
          labelCol,
          rowCursor,
          excel_lib.TextCellValue(groupName),
          subSectionLabelStyle,
        );
        rowCursor += 1;

        final int detailStart = rowCursor;
        for (final BalanceSheetExcelRow row in rows) {
          final excel_lib.CellStyle rowLabelStyle = row.isCalculated
              ? calculatedLabelStyle
              : (row.isUserInput ? userInputLabelStyle : labelStyle);
          setCell(
            labelCol,
            rowCursor,
            excel_lib.TextCellValue('   ${cleanLabel(row.label)}'),
            rowLabelStyle,
          );

          for (int i = 0; i < periodCount; i++) {
            final String periodKey = periods[i];
            final bool hasKey = row.valuesByPeriod.containsKey(periodKey);
            final double value = row.valuesByPeriod[periodKey] ?? 0;
            final bool isEmpty = !hasKey || value.abs() < 1e-9;
            if (isEmpty) {
              setCell(
                symbolColForPeriod(i),
                rowCursor,
                excel_lib.TextCellValue(''),
                emptySymbolStyle,
              );
              setCell(
                amountColForPeriod(i),
                rowCursor,
                excel_lib.TextCellValue(''),
                emptyAmountStyle,
              );
            } else {
              setCell(
                symbolColForPeriod(i),
                rowCursor,
                excel_lib.TextCellValue('\$'),
                dollarStyle,
              );
              setCell(
                amountColForPeriod(i),
                rowCursor,
                excel_lib.DoubleCellValue(value),
                value < 0 ? negativeCurrencyStyle : currencyStyle,
              );
            }
          }
          final String firstPeriodCol = _columnLetter(amountColForPeriod(0));
          final String lastPeriodCol = _columnLetter(
            amountColForPeriod(periodCount - 1),
          );
          final int excelRow = rowCursor + 1;
          setCell(
            totalSymbolCol,
            rowCursor,
            excel_lib.TextCellValue('\$'),
            dollarStyle,
          );
          setCell(
            totalAmountCol,
            rowCursor,
            excel_lib.FormulaCellValue(
              '=SUM($firstPeriodCol$excelRow:$lastPeriodCol$excelRow)',
            ),
            currencyStyle,
          );
          rowCursor += 1;
        }
        final int detailEnd = rowCursor - 1;

        setCell(
          labelCol,
          rowCursor,
          excel_lib.TextCellValue('TOTAL $groupName'),
          totalLabelStyle,
        );
        for (int i = 0; i < periodCount; i++) {
          final String col = _columnLetter(amountColForPeriod(i));
          setCell(
            symbolColForPeriod(i),
            rowCursor,
            excel_lib.TextCellValue('\$'),
            totalDollarStyle,
          );
          setCell(
            amountColForPeriod(i),
            rowCursor,
            excel_lib.FormulaCellValue(
              '=SUM($col${detailStart + 1}:$col${detailEnd + 1})',
            ),
            totalCurrencyStyle,
          );
        }
        final String totalCol = _columnLetter(totalAmountCol);
        setCell(
          totalSymbolCol,
          rowCursor,
          excel_lib.TextCellValue('\$'),
          totalDollarStyle,
        );
        setCell(
          totalAmountCol,
          rowCursor,
          excel_lib.FormulaCellValue(
            '=SUM($totalCol${detailStart + 1}:$totalCol${detailEnd + 1})',
          ),
          totalCurrencyStyle,
        );

        groupTotalRows.add(rowCursor);
        if (collectGroupTotalRows != null) {
          collectGroupTotalRows.add(rowCursor);
        }
        if (detailStart <= detailEnd) {
          outlineGroups.add(
            _OutlineGroup(
              startRowOneBased: detailStart + 1,
              endRowOneBased: detailEnd + 1,
              summaryRowOneBased: rowCursor + 1,
              collapsed: request.collapseSectionsByDefault,
            ),
          );
        }
        rowCursor += 2;
      }

      final int sectionTotalRow = rowCursor;
      setCell(
        labelCol,
        sectionTotalRow,
        excel_lib.TextCellValue(finalTotalLabel),
        balanceCheckStyle,
      );
      if (groupTotalRows.isEmpty) {
        for (int i = 0; i < periodCount; i++) {
          setCell(
            symbolColForPeriod(i),
            sectionTotalRow,
            excel_lib.TextCellValue('\$'),
            balanceCheckStyle,
          );
          setCell(
            amountColForPeriod(i),
            sectionTotalRow,
            const excel_lib.DoubleCellValue(0),
            balanceCheckStyle,
          );
        }
        setCell(
          totalSymbolCol,
          sectionTotalRow,
          excel_lib.TextCellValue('\$'),
          balanceCheckStyle,
        );
        setCell(
          totalAmountCol,
          sectionTotalRow,
          const excel_lib.DoubleCellValue(0),
          balanceCheckStyle,
        );
      } else {
        for (int i = 0; i < periodCount; i++) {
          final String amountCol = _columnLetter(amountColForPeriod(i));
          final String formula =
              '=(${groupTotalRows.map((r) => '$amountCol${r + 1}').join('+')})';
          setCell(
            symbolColForPeriod(i),
            sectionTotalRow,
            excel_lib.TextCellValue('\$'),
            balanceCheckStyle,
          );
          setCell(
            amountColForPeriod(i),
            sectionTotalRow,
            excel_lib.FormulaCellValue(formula),
            balanceCheckStyle,
          );
        }
        final String totalCol = _columnLetter(totalAmountCol);
        final String totalFormula =
            '=(${groupTotalRows.map((r) => '$totalCol${r + 1}').join('+')})';
        setCell(
          totalSymbolCol,
          sectionTotalRow,
          excel_lib.TextCellValue('\$'),
          balanceCheckStyle,
        );
        setCell(
          totalAmountCol,
          sectionTotalRow,
          excel_lib.FormulaCellValue(totalFormula),
          balanceCheckStyle,
        );
      }
      rowCursor += 2;
      return _SectionAnchor(totalRowZeroBased: sectionTotalRow);
    }

    final Map<String, List<BalanceSheetExcelRow>> assetGroups =
        <String, List<BalanceSheetExcelRow>>{};
    for (final BalanceSheetExcelRow row in request.assets) {
      final String group = resolveGroup(row, 'CURRENT ASSETS');
      assetGroups.putIfAbsent(group, () => <BalanceSheetExcelRow>[]).add(row);
    }

    final Map<String, List<BalanceSheetExcelRow>> liabAndEquityGroups =
        <String, List<BalanceSheetExcelRow>>{};
    for (final BalanceSheetExcelRow row in request.liabilities) {
      final String group = resolveGroup(row, 'CURRENT LIABILITIES');
      liabAndEquityGroups
          .putIfAbsent(group, () => <BalanceSheetExcelRow>[])
          .add(row);
    }
    for (final BalanceSheetExcelRow row in request.equity) {
      final String group = resolveGroup(row, 'OWNER\'S EQUITY');
      liabAndEquityGroups
          .putIfAbsent(group, () => <BalanceSheetExcelRow>[])
          .add(row);
    }

    final _SectionAnchor assetsAnchor = writeGroupedSection(
      sectionTitle: 'ASSETS',
      groupedRows: assetGroups,
      collectGroupTotalRows: null,
      finalTotalLabel: 'TOTAL ASSETS',
    );
    final _SectionAnchor liabEqAnchor = writeGroupedSection(
      sectionTitle: 'LIABILITIES AND OWNER\'S EQUITY',
      groupedRows: liabAndEquityGroups,
      collectGroupTotalRows: null,
      finalTotalLabel: 'TOTAL LIABILITIES AND OWNER\'S EQUITY',
    );

    // Analysis summary block (kept on the same sheet, below template layout).
    final int summaryHeaderRow = rowCursor + 1;
    final int summaryStartRow = summaryHeaderRow + 1;
    setCell(
      labelCol,
      summaryHeaderRow,
      excel_lib.TextCellValue('Balance Sheet Summary'),
      headerStyle,
    );
    for (int i = 0; i < periodCount; i++) {
      setCell(
        amountColForPeriod(i),
        summaryHeaderRow,
        excel_lib.TextCellValue(periods[i]),
        headerStyle,
      );
      sheet.merge(
        excel_lib.CellIndex.indexByColumnRow(
          columnIndex: symbolColForPeriod(i),
          rowIndex: summaryHeaderRow,
        ),
        excel_lib.CellIndex.indexByColumnRow(
          columnIndex: amountColForPeriod(i),
          rowIndex: summaryHeaderRow,
        ),
      );
      sheet.setMergedCellStyle(
        excel_lib.CellIndex.indexByColumnRow(
          columnIndex: symbolColForPeriod(i),
          rowIndex: summaryHeaderRow,
        ),
        headerStyle,
      );
    }
    setCell(
      totalAmountCol,
      summaryHeaderRow,
      excel_lib.TextCellValue('TOTAL'),
      headerStyle,
    );
    sheet.merge(
      excel_lib.CellIndex.indexByColumnRow(
        columnIndex: totalSymbolCol,
        rowIndex: summaryHeaderRow,
      ),
      excel_lib.CellIndex.indexByColumnRow(
        columnIndex: totalAmountCol,
        rowIndex: summaryHeaderRow,
      ),
    );
    sheet.setMergedCellStyle(
      excel_lib.CellIndex.indexByColumnRow(
        columnIndex: totalSymbolCol,
        rowIndex: summaryHeaderRow,
      ),
      headerStyle,
    );

    setCell(
      labelCol,
      summaryStartRow,
      excel_lib.TextCellValue('Assets'),
      totalLabelStyle,
    );
    setCell(
      labelCol,
      summaryStartRow + 1,
      excel_lib.TextCellValue('Liabilities + Equity'),
      totalLabelStyle,
    );
    for (int p = 0; p < periodCount; p++) {
      final String col = _columnLetter(amountColForPeriod(p));
      setCell(
        symbolColForPeriod(p),
        summaryStartRow,
        excel_lib.TextCellValue('\$'),
        totalDollarStyle,
      );
      setCell(
        amountColForPeriod(p),
        summaryStartRow,
        excel_lib.FormulaCellValue(
          '=$col${assetsAnchor.totalRowZeroBased + 1}',
        ),
        totalCurrencyStyle,
      );
      setCell(
        symbolColForPeriod(p),
        summaryStartRow + 1,
        excel_lib.TextCellValue('\$'),
        totalDollarStyle,
      );
      setCell(
        amountColForPeriod(p),
        summaryStartRow + 1,
        excel_lib.FormulaCellValue(
          '=$col${liabEqAnchor.totalRowZeroBased + 1}',
        ),
        totalCurrencyStyle,
      );
    }
    setCell(
      totalSymbolCol,
      summaryStartRow,
      excel_lib.TextCellValue('\$'),
      totalDollarStyle,
    );
    setCell(
      totalAmountCol,
      summaryStartRow,
      excel_lib.FormulaCellValue(
        '=${_columnLetter(totalAmountCol)}${assetsAnchor.totalRowZeroBased + 1}',
      ),
      totalCurrencyStyle,
    );
    setCell(
      totalSymbolCol,
      summaryStartRow + 1,
      excel_lib.TextCellValue('\$'),
      totalDollarStyle,
    );
    setCell(
      totalAmountCol,
      summaryStartRow + 1,
      excel_lib.FormulaCellValue(
        '=${_columnLetter(totalAmountCol)}${liabEqAnchor.totalRowZeroBased + 1}',
      ),
      totalCurrencyStyle,
    );

    final int balanceCheckRow = summaryStartRow + 2;
    setCell(
      labelCol,
      balanceCheckRow,
      excel_lib.TextCellValue('Balance Check (A - L&E)'),
      totalLabelStyle,
    );
    for (int p = 0; p < periodCount; p++) {
      final String col = _columnLetter(amountColForPeriod(p));
      setCell(
        symbolColForPeriod(p),
        balanceCheckRow,
        excel_lib.TextCellValue('\$'),
        totalDollarStyle,
      );
      setCell(
        amountColForPeriod(p),
        balanceCheckRow,
        excel_lib.FormulaCellValue(
          '=$col${summaryStartRow + 1}-$col${summaryStartRow + 2}',
        ),
        balanceCheckStyle,
      );
    }
    setCell(
      totalSymbolCol,
      balanceCheckRow,
      excel_lib.TextCellValue('\$'),
      totalDollarStyle,
    );
    final String totalColLetter = _columnLetter(totalAmountCol);
    setCell(
      totalAmountCol,
      balanceCheckRow,
      excel_lib.FormulaCellValue(
        '=$totalColLetter${summaryStartRow + 1}-$totalColLetter${summaryStartRow + 2}',
      ),
      balanceCheckStyle,
    );

    final List<int>? bytes = excel.encode();
    if (bytes == null) return;

    final List<int> groupedBytes = _applyRowGroupingToFirstSheet(
      bytes,
      outlineGroups,
      collapseByDefault: request.collapseSectionsByDefault,
    );
    await downloadFile(
      '${request.fileNamePrefix}_${DateFormat('yyyyMMdd').format(request.asOfDate)}.xlsx',
      groupedBytes,
      mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  }

  List<int> _applyRowGroupingToFirstSheet(
    List<int> xlsxBytes,
    List<_OutlineGroup> groups, {
    required bool collapseByDefault,
  }) {
    if (groups.isEmpty) return xlsxBytes;
    try {
      final Archive archive = ZipDecoder().decodeBytes(
        xlsxBytes,
        verify: false,
      );
      final ArchiveFile? sheetFile = archive.findFile(
        'xl/worksheets/sheet1.xml',
      );
      if (sheetFile == null || !sheetFile.isFile) return xlsxBytes;

      final String xmlText = utf8.decode(sheetFile.content as List<int>);
      final XmlDocument doc = XmlDocument.parse(xmlText);
      final XmlElement worksheet = doc.rootElement;
      final XmlElement? sheetData = worksheet.getElement('sheetData');
      if (sheetData == null) return xlsxBytes;

      final Map<int, XmlElement> rowMap = <int, XmlElement>{};
      for (final XmlElement row in sheetData.findElements('row')) {
        final int? rowIndex = int.tryParse(row.getAttribute('r') ?? '');
        if (rowIndex != null) {
          rowMap[rowIndex] = row;
        }
      }

      for (final _OutlineGroup group in groups) {
        for (int r = group.startRowOneBased; r <= group.endRowOneBased; r++) {
          final XmlElement? row = rowMap[r];
          if (row == null) continue;
          row.setAttribute('outlineLevel', '1');
          if (collapseByDefault && group.collapsed) {
            row.setAttribute('hidden', '1');
          } else {
            row.removeAttribute('hidden');
          }
        }
        final XmlElement? summaryRow = rowMap[group.summaryRowOneBased];
        if (summaryRow != null && collapseByDefault && group.collapsed) {
          summaryRow.setAttribute('collapsed', '1');
        }
      }

      final XmlElement? sheetFormatPr = worksheet.getElement('sheetFormatPr');
      sheetFormatPr?.setAttribute('outlineLevelRow', '1');

      XmlElement? sheetPr = worksheet.getElement('sheetPr');
      if (sheetPr == null) {
        sheetPr = XmlElement(XmlName('sheetPr'));
        worksheet.children.insert(0, sheetPr);
      }
      if (sheetPr.getElement('outlinePr') == null) {
        sheetPr.children.add(
          XmlElement(XmlName('outlinePr'), <XmlAttribute>[
            XmlAttribute(XmlName('summaryBelow'), '1'),
            XmlAttribute(XmlName('summaryRight'), '1'),
            XmlAttribute(XmlName('showOutlineSymbols'), '1'),
          ]),
        );
      }

      final XmlElement? sheetViews = worksheet.getElement('sheetViews');
      if (sheetViews != null) {
        final Iterable<XmlElement> views = sheetViews.findElements('sheetView');
        if (views.isNotEmpty) {
          views.first.setAttribute('showOutlineSymbols', '1');
        }
      }

      final List<int> patched = utf8.encode(doc.toXmlString(pretty: false));
      archive.addFile(
        ArchiveFile('xl/worksheets/sheet1.xml', patched.length, patched),
      );
      return ZipEncoder().encode(archive) ?? xlsxBytes;
    } catch (_) {
      return xlsxBytes;
    }
  }

  String _columnLetter(int columnIndexZeroBased) {
    int index = columnIndexZeroBased + 1;
    String result = '';
    while (index > 0) {
      final int rem = (index - 1) % 26;
      result = String.fromCharCode(65 + rem) + result;
      index = (index - 1) ~/ 26;
    }
    return result;
  }
}

class _SectionAnchor {
  _SectionAnchor({required this.totalRowZeroBased});

  final int totalRowZeroBased;
}

class _OutlineGroup {
  _OutlineGroup({
    required this.startRowOneBased,
    required this.endRowOneBased,
    required this.summaryRowOneBased,
    required this.collapsed,
  });

  final int startRowOneBased;
  final int endRowOneBased;
  final int summaryRowOneBased;
  final bool collapsed;
}
