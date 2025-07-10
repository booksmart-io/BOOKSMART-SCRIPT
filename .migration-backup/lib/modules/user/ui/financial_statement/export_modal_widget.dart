import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'pdf_export_service.dart';

enum ExportPdfReportType { profitLoss, cashFlow, balanceSheet }

class ExportModalWidget {
  static Future<void> showPdfModal({
    required BuildContext context,
    required String companyName,
    required String companyAddress,
    required ExportPdfReportType reportType,
    Uint8List? logoBytes,
    DateTime? initialStartDate,
    DateTime? initialEndDate,
    bool useSingleDate = false,
    String singleDateLabel = 'As of Date',
    bool balanceSheetAdvancedExport = false,
    Future<void> Function(PdfExportRequest request)? onExport,
  }) async {
    await showDialog(
      context: context,
      builder: (_) => _PdfExportDialog(
        companyName: companyName,
        companyAddress: companyAddress,
        reportType: reportType,
        logoBytes: logoBytes,
        initialStartDate: initialStartDate,
        initialEndDate: initialEndDate,
        useSingleDate: useSingleDate,
        singleDateLabel: singleDateLabel,
        balanceSheetAdvancedExport: balanceSheetAdvancedExport,
        onExport: onExport,
        isExcel: false,
      ),
    );
  }

  static Future<void> showExcelModal({
    required BuildContext context,
    required String companyName,
    required String companyAddress,
    required ExportPdfReportType reportType,
    Uint8List? logoBytes,
    DateTime? initialStartDate,
    DateTime? initialEndDate,
    bool useSingleDate = false,
    String singleDateLabel = 'As of Date',
    bool balanceSheetAdvancedExport = false,
    required Future<void> Function(PdfExportRequest request) onExport,
  }) async {
    await showDialog(
      context: context,
      builder: (_) => _PdfExportDialog(
        companyName: companyName,
        companyAddress: companyAddress,
        reportType: reportType,
        logoBytes: logoBytes,
        initialStartDate: initialStartDate,
        initialEndDate: initialEndDate,
        useSingleDate: useSingleDate,
        singleDateLabel: singleDateLabel,
        balanceSheetAdvancedExport: balanceSheetAdvancedExport,
        onExport: onExport,
        isExcel: true,
      ),
    );
  }
}

class _PdfExportDialog extends StatefulWidget {
  const _PdfExportDialog({
    required this.companyName,
    required this.companyAddress,
    required this.reportType,
    this.logoBytes,
    this.initialStartDate,
    this.initialEndDate,
    this.useSingleDate = false,
    this.singleDateLabel = 'As of Date',
    this.balanceSheetAdvancedExport = false,
    this.onExport,
    this.isExcel = false,
  });

  final String companyName;
  final String companyAddress;
  final ExportPdfReportType reportType;
  final Uint8List? logoBytes;
  final DateTime? initialStartDate;
  final DateTime? initialEndDate;
  final bool useSingleDate;
  final String singleDateLabel;
  final bool balanceSheetAdvancedExport;
  final Future<void> Function(PdfExportRequest request)? onExport;
  final bool isExcel;

  @override
  State<_PdfExportDialog> createState() => _PdfExportDialogState();
}

class _PdfExportDialogState extends State<_PdfExportDialog> {
  final PdfExportService _service = PdfExportService();
  late DateTime _startDate;
  late DateTime _endDate;
  PdfViewType _viewType = PdfViewType.monthly;
  int _periodCount = 5;
  bool _isExporting = false;
  String? _validationError;

  bool get _isBalanceSheetAdvanced =>
      widget.balanceSheetAdvancedExport &&
      widget.reportType == ExportPdfReportType.balanceSheet;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _endDate = widget.initialEndDate ?? DateTime(now.year, now.month, now.day);
    _startDate = widget.useSingleDate
        ? _endDate
        : (widget.initialStartDate ??
              DateTime(_endDate.year, _endDate.month - 2, 1));
    if (_isBalanceSheetAdvanced) {
      _periodCount = 5;
      _viewType = PdfViewType.quarterly;
    }
    _validate();
  }

  Future<void> _pickStartDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _startDate,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked == null) return;
    setState(() {
      _startDate = DateTime(picked.year, picked.month, picked.day);
      if (_endDate.isBefore(_startDate)) {
        _endDate = _startDate;
      }
      _validate();
    });
  }

  Future<void> _pickEndDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _endDate,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked == null) return;
    setState(() {
      _endDate = DateTime(picked.year, picked.month, picked.day);
      if (widget.useSingleDate) {
        _startDate = _endDate;
      } else if (_endDate.isBefore(_startDate)) {
        _startDate = _endDate;
      }
      _validate();
    });
  }

  void _validate() {
    if (_isBalanceSheetAdvanced) {
      _validationError =
          PdfExportService.validateBalanceSheetPeriodCount(_periodCount);
      return;
    }
    if (widget.useSingleDate) {
      _validationError = null;
      return;
    }
    _validationError = _service.validateRange(_startDate, _endDate, _viewType);
  }

  String _helperText() {
    switch (_viewType) {
      case PdfViewType.monthly:
        return 'Monthly: max 5 months';
      case PdfViewType.quarterly:
        return 'Quarterly: max 5 quarters (~15 months)';
      case PdfViewType.yearly:
        return 'Yearly: max 5 years';
    }
  }

  String _columnPreviewText() {
    if (_isBalanceSheetAdvanced) {
      final ends = PdfExportService.buildBalanceSheetSnapshotColumnEnds(
        asOf: _endDate,
        viewType: _viewType,
        periodCount: _periodCount,
      );
      final labels = PdfExportService.buildBalanceSheetSnapshotColumnLabels(
        ends,
        _viewType,
        _endDate,
      );
      final joined = labels.isEmpty ? '-' : labels.join(', ');
      return '${labels.length}/5 columns: $joined';
    }
    final labels = _service.buildBucketLabels(_startDate, _endDate, _viewType);
    final joined = labels.isEmpty ? '-' : labels.join(', ');
    return '${labels.length}/5 columns: $joined';
  }

  Future<void> _runExport() async {
    _validate();
    if (_validationError != null) {
      setState(() {});
      return;
    }
    final labels = _isBalanceSheetAdvanced
        ? PdfExportService.buildBalanceSheetSnapshotColumnLabels(
            PdfExportService.buildBalanceSheetSnapshotColumnEnds(
              asOf: _endDate,
              viewType: _viewType,
              periodCount: _periodCount,
            ),
            _viewType,
            _endDate,
          )
        : _service.buildBucketLabels(_startDate, _endDate, _viewType);
    if (labels.length > PdfExportService.maxColumns) {
      setState(() {
        _validationError =
            'Too many columns selected. Reduce range to ${PdfExportService.maxColumns} or less.';
      });
      return;
    }

    setState(() => _isExporting = true);
    try {
      late final PdfExportRequest request;
      if (_isBalanceSheetAdvanced) {
        final ends = PdfExportService.buildBalanceSheetSnapshotColumnEnds(
          asOf: _endDate,
          viewType: _viewType,
          periodCount: _periodCount,
        );
        request = PdfExportRequest(
          startDate: ends.first,
          endDate: _endDate,
          viewType: _viewType,
          templateVariant: PdfTemplateVariant.templateA,
          companyName: widget.companyName,
          companyAddress: widget.companyAddress,
          logoBytes: widget.logoBytes,
          balanceSheetSnapshotEnds: ends,
        );
      } else {
        final DateTime startForExport = widget.useSingleDate
            ? _endDate
            : _startDate;
        final DateTime endForExport = _endDate;
        final PdfViewType viewTypeForExport = widget.useSingleDate
            ? PdfViewType.monthly
            : _viewType;
        request = PdfExportRequest(
          startDate: startForExport,
          endDate: endForExport,
          viewType: viewTypeForExport,
          templateVariant: PdfTemplateVariant.templateA,
          companyName: widget.companyName,
          companyAddress: widget.companyAddress,
          logoBytes: widget.logoBytes,
        );
      }
      if (widget.onExport != null) {
        await widget.onExport!(request);
      } else {
        if (widget.isExcel) {
          throw Exception('Excel export handler is not configured.');
        }
        switch (widget.reportType) {
          case ExportPdfReportType.profitLoss:
            await _service.exportProfitLossPresentationPdf(request);
            break;
          case ExportPdfReportType.cashFlow:
            await _service.exportCashFlowPresentationPdf(request);
            break;
          case ExportPdfReportType.balanceSheet:
            throw Exception('Balance Sheet export handler is not configured.');
        }
      }
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            widget.isExcel ? 'Excel export started.' : 'PDF export started.',
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            widget.isExcel
                ? 'Excel export failed: $e'
                : 'PDF export failed: $e',
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _isExporting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final dropdownFg = isDark ? Colors.white : Colors.black87;
    final dropdownMenuBg =
        isDark ? const Color(0xFF1E293B) : theme.colorScheme.surface;

    final labels = _isBalanceSheetAdvanced
        ? PdfExportService.buildBalanceSheetSnapshotColumnLabels(
            PdfExportService.buildBalanceSheetSnapshotColumnEnds(
              asOf: _endDate,
              viewType: _viewType,
              periodCount: _periodCount,
            ),
            _viewType,
            _endDate,
          )
        : _service.buildBucketLabels(_startDate, _endDate, _viewType);
    final hasError = _validationError != null;

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: SizedBox(
        width: 520,
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                widget.isExcel ? 'Export Excel' : 'Export PDF',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 16),
              if (_isBalanceSheetAdvanced) ...[
                Row(
                  children: [
                    Expanded(
                      child: _dateTile(
                        label: 'As Of Date',
                        value: _endDate,
                        onTap: _pickEndDate,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    const Text(
                      'Number of periods',
                      style: TextStyle(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(width: 12),
                    DropdownButton<int>(
                      value: _periodCount,
                      dropdownColor: dropdownMenuBg,
                      style: TextStyle(
                        color: dropdownFg,
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                      iconEnabledColor: dropdownFg,
                      underline: Container(
                        height: 1,
                        color: isDark
                            ? Colors.white.withValues(alpha: 0.35)
                            : Colors.black.withValues(alpha: 0.35),
                      ),
                      items: [1, 2, 3, 4, 5]
                          .map(
                            (n) => DropdownMenuItem<int>(
                              value: n,
                              child: Text(
                                '$n',
                                style: TextStyle(
                                  color: dropdownFg,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          )
                          .toList(),
                      onChanged: (v) {
                        if (v == null) return;
                        setState(() {
                          _periodCount = v;
                          _validate();
                        });
                      },
                    ),
                  ],
                ),
              ] else if (widget.useSingleDate)
                Row(
                  children: [
                    Expanded(
                      child: _dateTile(
                        label: widget.singleDateLabel,
                        value: _endDate,
                        onTap: _pickEndDate,
                      ),
                    ),
                  ],
                )
              else
                Row(
                  children: [
                    Expanded(
                      child: _dateTile(
                        label: 'Start Date',
                        value: _startDate,
                        onTap: _pickStartDate,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _dateTile(
                        label: 'End Date',
                        value: _endDate,
                        onTap: _pickEndDate,
                      ),
                    ),
                  ],
                ),
              if (!_isBalanceSheetAdvanced) const SizedBox(height: 14),
              if (_isBalanceSheetAdvanced) const SizedBox(height: 8),
              const Text(
                'Frequency',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: [
                  _viewChip(PdfViewType.monthly, 'Monthly'),
                  _viewChip(PdfViewType.quarterly, 'Quarterly'),
                  _viewChip(PdfViewType.yearly, 'Yearly'),
                ],
              ),
              const SizedBox(height: 12),
              const SizedBox(height: 12),
              Text(
                _helperText(),
                style: TextStyle(
                  color: Theme.of(
                    context,
                  ).textTheme.bodySmall?.color?.withValues(alpha: 0.8),
                  fontSize: 12,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                _columnPreviewText(),
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              if (hasError) ...[
                const SizedBox(height: 8),
                Text(
                  _validationError!,
                  style: const TextStyle(color: Colors.red, fontSize: 12),
                ),
              ] else if (labels.length > PdfExportService.maxColumns) ...[
                const SizedBox(height: 8),
                const Text(
                  'Too many columns selected. Reduce range to 5 or less.',
                  style: TextStyle(color: Colors.red, fontSize: 12),
                ),
              ],
              const SizedBox(height: 18),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  ElevatedButton(
                    onPressed: _isExporting
                        ? null
                        : () => Navigator.of(context).pop(),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(
                        0xFF1E3A8A,
                      ).withValues(alpha: 0.35),
                      foregroundColor: Colors.white,
                      disabledBackgroundColor: const Color(
                        0xFF1E3A8A,
                      ).withValues(alpha: 0.2),
                      disabledForegroundColor: Colors.white54,
                      side: const BorderSide(color: Colors.white, width: 0.8),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 24,
                        vertical: 12,
                      ),
                    ),
                    child: const Text('Close'),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton(
                    onPressed: (_isExporting ||
                            hasError ||
                            labels.length > PdfExportService.maxColumns)
                        ? null
                        : _runExport,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(
                        0xFF1E3A8A,
                      ).withValues(alpha: 0.35),
                      foregroundColor: Colors.white,
                      disabledBackgroundColor: const Color(
                        0xFF1E3A8A,
                      ).withValues(alpha: 0.2),
                      disabledForegroundColor: Colors.white54,
                      side: const BorderSide(color: Colors.white, width: 0.8),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 24,
                        vertical: 12,
                      ),
                    ),
                    child: _isExporting
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Text(
                            widget.isExcel ? 'Download Excel' : 'Download PDF',
                          ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _viewChip(PdfViewType type, String label) {
    final selected = _viewType == type;
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) {
        setState(() {
          _viewType = type;
          _validate();
        });
      },
    );
  }

  Widget _dateTile({
    required String label,
    required DateTime value,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          border: Border.all(color: Colors.grey.shade400),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: const TextStyle(fontSize: 12)),
            const SizedBox(height: 4),
            Text(
              DateFormat('MMM dd, yyyy').format(value),
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }
}
