import 'package:booksmart/models/financial_template_models.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

/// BookSmart-side snapshot totals at the reconciliation date (read-only).
class BsReconciliationBook {
  const BsReconciliationBook({
    required this.totalAssets,
    required this.totalLiabilities,
    required this.equity,
  });

  final double totalAssets;
  final double totalLiabilities;
  final double equity;
}

/// Result after comparing uploaded balance sheet to BookSmart (never auto-saves).
enum BsReconciliationOutcome {
  /// Do not insert adjustment transactions; keep BookSmart as-is.
  keepBookSmart,

  /// User confirmed writing uploaded values as transactions.
  overrideWithUploaded,

  /// Defer — no DB writes from this flow.
  investigateDifference,
}

class BsReconciliationDialog extends StatefulWidget {
  const BsReconciliationDialog({
    super.key,
    required this.book,
    required this.uploaded,
    this.periodLabel,
  });

  final BsReconciliationBook book;
  final BalanceSheetTemplate uploaded;
  final String? periodLabel;

  @override
  State<BsReconciliationDialog> createState() => _BsReconciliationDialogState();
}

class _BsReconciliationDialogState extends State<BsReconciliationDialog> {
  static final _fmt = NumberFormat.currency(symbol: r'$', decimalDigits: 2);
  bool _confirmOverride = false;

  static const _eps = 0.01;

  double get _upAssets =>
      widget.uploaded.currentAssets + widget.uploaded.nonCurrentAssets;
  double get _upLiab =>
      widget.uploaded.currentLiabilities + widget.uploaded.longTermLiabilities;
  double get _upEquity => widget.uploaded.equity;

  bool get _hasMismatch =>
      (widget.book.totalAssets - _upAssets).abs() > _eps ||
      (widget.book.totalLiabilities - _upLiab).abs() > _eps ||
      (widget.book.equity - _upEquity).abs() > _eps;

  String _deltaSentence(String label, double bookVal, double uploadedVal) {
    final delta = uploadedVal - bookVal;
    if (delta.abs() <= _eps) return '';
    final d = _fmt.format(delta.abs());
    return 'Please account for the $d difference on $label by updating '
        'transactions or entering adjustments in BookSmart.';
  }

  Widget _deltaGuidance(double aDiff, double lDiff, double eDiff) {
    final parts = <String>[
      if (aDiff.abs() > _eps)
        _deltaSentence('Total Assets', widget.book.totalAssets, _upAssets),
      if (lDiff.abs() > _eps)
        _deltaSentence(
          'Total Liabilities',
          widget.book.totalLiabilities,
          _upLiab,
        ),
      if (eDiff.abs() > _eps)
        _deltaSentence('Equity', widget.book.equity, _upEquity),
    ].where((s) => s.isNotEmpty).toList();

    if (parts.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final p in parts) ...[
          Text(
            '• $p',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 12,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 8),
        ],
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final aDiff = _upAssets - widget.book.totalAssets;
    final lDiff = _upLiab - widget.book.totalLiabilities;
    final eDiff = _upEquity - widget.book.equity;

    return AlertDialog(
      backgroundColor: const Color(0xFF0A192F),
      title: const Text(
        'Reconcile Balance Sheet with BookSmart',
        style: TextStyle(
          color: Colors.white,
          fontSize: 18,
          fontWeight: FontWeight.bold,
        ),
      ),
      content: SizedBox(
        width: 560,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.blue.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.blue.withValues(alpha: 0.35)),
                ),
                child: const Text(
                  'Please review and confirm differences before updating your '
                  'balance sheet. Nothing is saved to your ledger from this upload '
                  'until you explicitly choose an option below.',
                  style: TextStyle(color: Colors.white70, fontSize: 12, height: 1.35),
                ),
              ),
              const SizedBox(height: 12),
              if (widget.periodLabel != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(
                    widget.periodLabel!,
                    style: const TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                ),
              _table(aDiff, lDiff, eDiff),
              const SizedBox(height: 12),
              if (_hasMismatch) ...[
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.amber.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.amber.withValues(alpha: 0.4)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'BookSmart: ${_fmt.format(widget.book.totalAssets)} assets / '
                        '${_fmt.format(widget.book.totalLiabilities)} liabilities / '
                        '${_fmt.format(widget.book.equity)} equity.   '
                        'Uploaded: ${_fmt.format(_upAssets)} / ${_fmt.format(_upLiab)} / ${_fmt.format(_upEquity)}.',
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 11,
                          height: 1.35,
                        ),
                      ),
                      const SizedBox(height: 10),
                      const Text(
                        'Deltas (uploaded − BookSmart) are shown in the table. '
                        'BookSmart will not change unless you override.',
                        style: TextStyle(color: Colors.white, fontSize: 12, height: 1.35),
                      ),
                      const SizedBox(height: 10),
                      _deltaGuidance(aDiff, lDiff, eDiff),
                    ],
                  ),
                ),
              ] else ...[
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.green.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.green.withValues(alpha: 0.35)),
                  ),
                  child: const Text(
                    'Uploaded balance sheet lines match BookSmart for this As Of date.',
                    style: TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Totals match — you can confirm to record the uploaded balance sheet '
                  'as transactions, or still keep BookSmart only.',
                  style: TextStyle(color: Colors.white54, fontSize: 11, height: 1.3),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFEAB308),
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    onPressed: () => Get.back(
                      result: BsReconciliationOutcome.overrideWithUploaded,
                    ),
                    child: const Text(
                      'Confirm — save uploaded values to transactions',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 16),
              Text(
                _hasMismatch ? 'How do you want to proceed?' : 'Other options',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  OutlinedButton(
                    onPressed: () =>
                        Get.back(result: BsReconciliationOutcome.keepBookSmart),
                    child: const Text('Keep BookSmart values'),
                  ),
                  OutlinedButton(
                    onPressed: () => Get.back(
                      result: BsReconciliationOutcome.investigateDifference,
                    ),
                    child: const Text('Investigate difference'),
                  ),
                ],
              ),
              if (_hasMismatch) ...[
                const SizedBox(height: 12),
                const Divider(color: Colors.white24),
                const SizedBox(height: 8),
                CheckboxListTile(
                  value: _confirmOverride,
                  onChanged: (v) => setState(() => _confirmOverride = v ?? false),
                  activeColor: const Color(0xFFEAB308),
                  checkColor: Colors.black,
                  title: const Text(
                    'Yes, I confirm I want to write the uploaded balance sheet as transactions.',
                    style: TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                  controlAffinity: ListTileControlAffinity.leading,
                  contentPadding: EdgeInsets.zero,
                ),
                const SizedBox(height: 4),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFEAB308),
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    onPressed: _confirmOverride
                        ? () => Get.back(
                              result: BsReconciliationOutcome.overrideWithUploaded,
                            )
                        : null,
                    child: const Text(
                      'Override with uploaded values',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Get.back(),
          child: const Text('Back', style: TextStyle(color: Colors.white70)),
        ),
      ],
    );
  }

  Widget _table(double aDiff, double lDiff, double eDiff) {
    Widget cell(String t, {bool header = false}) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
        child: Text(
          t,
          style: TextStyle(
            color: header ? Colors.white : Colors.white70,
            fontSize: header ? 12 : 11,
            fontWeight: header ? FontWeight.bold : FontWeight.normal,
          ),
        ),
      );
    }

    return Table(
      border: TableBorder.all(color: Colors.white24),
      columnWidths: const {
        0: FlexColumnWidth(1.15),
        1: FlexColumnWidth(1),
        2: FlexColumnWidth(1),
        3: FlexColumnWidth(0.95),
        4: FlexColumnWidth(0.55),
      },
      children: [
        TableRow(
          children: [
            cell('Category', header: true),
            cell('BookSmart', header: true),
            cell('Uploaded', header: true),
            cell('Difference', header: true),
            cell('Action', header: true),
          ],
        ),
        TableRow(
          children: [
            cell('Total Assets'),
            cell(_fmt.format(widget.book.totalAssets)),
            cell(_fmt.format(_upAssets)),
            cell(_fmt.format(aDiff)),
            cell('Review'),
          ],
        ),
        TableRow(
          children: [
            cell('Total Liabilities'),
            cell(_fmt.format(widget.book.totalLiabilities)),
            cell(_fmt.format(_upLiab)),
            cell(_fmt.format(lDiff)),
            cell('Review'),
          ],
        ),
        TableRow(
          children: [
            cell('Equity'),
            cell(_fmt.format(widget.book.equity)),
            cell(_fmt.format(_upEquity)),
            cell(_fmt.format(eDiff)),
            cell('Review'),
          ],
        ),
      ],
    );
  }
}

Future<BsReconciliationOutcome?> showBsReconciliationDialog({
  required BsReconciliationBook book,
  required BalanceSheetTemplate uploaded,
  String? periodLabel,
}) {
  return Get.dialog<BsReconciliationOutcome>(
    BsReconciliationDialog(
      book: book,
      uploaded: uploaded,
      periodLabel: periodLabel,
    ),
    barrierDismissible: false,
  );
}
