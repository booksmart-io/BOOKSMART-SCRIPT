import 'package:booksmart/utils/pl_transaction_totals.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

/// Result of the P&L reconciliation step (after document review, before DB save).
enum PlReconciliationOutcome {
  /// Write [Revenue]/[COGS]/[OpEx] transactions from the upload.
  saveTransactions,

  /// Do not write P&L adjustment transactions; keep existing BookSmart data.
  keepBookSmart,

  /// Do not save; user should add or edit transactions first.
  addMissingTransactions,

  /// Do not save now; user will reconcile later.
  reviewLater,
}

class PlReconciliationDialog extends StatefulWidget {
  const PlReconciliationDialog({
    super.key,
    required this.book,
    required this.uploadedRevenue,
    required this.uploadedExpenses,
    this.periodLabel,
  });

  final PlBooksmartBuckets book;
  final double uploadedRevenue;
  final double uploadedExpenses;
  final String? periodLabel;

  @override
  State<PlReconciliationDialog> createState() => _PlReconciliationDialogState();
}

class _PlReconciliationDialogState extends State<PlReconciliationDialog> {
  static final _fmt = NumberFormat.currency(symbol: r'$', decimalDigits: 2);
  bool _confirmOverride = false;

  static const _eps = 0.01;

  bool get _hasMismatch =>
      (widget.book.income - widget.uploadedRevenue).abs() > _eps ||
      (widget.book.expense - widget.uploadedExpenses).abs() > _eps;

  @override
  Widget build(BuildContext context) {
    final revDiff = widget.uploadedRevenue - widget.book.income;
    final expDiff = widget.uploadedExpenses - widget.book.expense;

    return AlertDialog(
      backgroundColor: const Color(0xFF0A192F),
      title: const Text(
        'Reconcile P&L with BookSmart',
        style: TextStyle(
          color: Colors.white,
          fontSize: 18,
          fontWeight: FontWeight.bold,
        ),
      ),
      content: SizedBox(
        width: 520,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (widget.periodLabel != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(
                    widget.periodLabel!,
                    style: const TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                ),
              _table(revDiff, expDiff),
              const SizedBox(height: 12),
              if (_hasMismatch) ...[
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.amber.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.amber.withValues(alpha: 0.4)),
                  ),
                  child: const Text(
                    'Your uploaded statement does not match your current BookSmart '
                    'records for this period. Please update or add missing transactions, '
                    'or choose an option below.',
                    style: TextStyle(color: Colors.white, fontSize: 12, height: 1.35),
                  ),
                ),
                if (revDiff.abs() > _eps)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      'Revenue — BookSmart: ${_fmt.format(widget.book.income)}; '
                      'uploaded: ${_fmt.format(widget.uploadedRevenue)}. '
                      'Difference: ${_fmt.format(revDiff)}.',
                      style: const TextStyle(color: Colors.orangeAccent, fontSize: 11),
                    ),
                  ),
                if (expDiff.abs() > _eps)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      'Expenses — BookSmart: ${_fmt.format(widget.book.expense)}; '
                      'uploaded: ${_fmt.format(widget.uploadedExpenses)}. '
                      'Difference: ${_fmt.format(expDiff)}.',
                      style: const TextStyle(color: Colors.orangeAccent, fontSize: 11),
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
                    'Your uploaded revenue and expense totals match BookSmart for this period.',
                    style: TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFEAB308),
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    onPressed: () => Get.back(
                      result: PlReconciliationOutcome.saveTransactions,
                    ),
                    child: const Text(
                      'Submit — save to transactions',
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
                    onPressed: () => Get.back(result: PlReconciliationOutcome.keepBookSmart),
                    child: const Text('Keep BookSmart amount'),
                  ),
                  OutlinedButton(
                    onPressed: () => Get.back(
                      result: PlReconciliationOutcome.addMissingTransactions,
                    ),
                    child: const Text('Add missing transactions'),
                  ),
                  OutlinedButton(
                    onPressed: () => Get.back(result: PlReconciliationOutcome.reviewLater),
                    child: const Text('Review later'),
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
                    'Yes, I confirm I want to override the selected P&L values.',
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
                              result: PlReconciliationOutcome.saveTransactions,
                            )
                        : null,
                    child: const Text(
                      'Override with uploaded amount',
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

  Widget _table(double revDiff, double expDiff) {
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
        0: FlexColumnWidth(1.1),
        1: FlexColumnWidth(1),
        2: FlexColumnWidth(1),
        3: FlexColumnWidth(0.9),
        4: FlexColumnWidth(0.6),
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
            cell('Revenue'),
            cell(_fmt.format(widget.book.income)),
            cell(_fmt.format(widget.uploadedRevenue)),
            cell(_fmt.format(revDiff)),
            cell('Review'),
          ],
        ),
        TableRow(
          children: [
            cell('Expenses'),
            cell(_fmt.format(widget.book.expense)),
            cell(_fmt.format(widget.uploadedExpenses)),
            cell(_fmt.format(expDiff)),
            cell('Review'),
          ],
        ),
      ],
    );
  }
}

/// Shows reconciliation UI; returns null if dismissed without a terminal choice.
Future<PlReconciliationOutcome?> showPlReconciliationDialog({
  required PlBooksmartBuckets book,
  required double uploadedRevenue,
  required double uploadedExpenses,
  String? periodLabel,
}) {
  return Get.dialog<PlReconciliationOutcome>(
    PlReconciliationDialog(
      book: book,
      uploadedRevenue: uploadedRevenue,
      uploadedExpenses: uploadedExpenses,
      periodLabel: periodLabel,
    ),
    barrierDismissible: false,
  );
}
