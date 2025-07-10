import 'package:booksmart/models/pending_transaction_model.dart';
import 'package:booksmart/modules/user/controllers/statement_import_controller.dart';
import 'package:booksmart/modules/user/ui/bank_statement/statement_row_edit_sheet.dart';
import 'package:booksmart/widgets/app_text.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

// Light bg → dark saturated; Dark bg → bright readable
Color _kGreen(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
        ? const Color(0xFF2ECC71)
        : const Color(0xFF1B6B3A);

Color _kRed(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
        ? const Color(0xFFE74C3C)
        : const Color(0xFF8B1A1A);
final _amtFmt = NumberFormat('#,##0.##', 'en_US');
final _dateFmt = DateFormat('MMM d, yyyy');

// ─── Public entry point (dialog) ────────────────────────────────────────────

void showStatementReviewDialog({required int importId}) {
  final tag = 'sic_$importId';
  Get.dialog<void>(
    Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      clipBehavior: Clip.antiAlias,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: 700,
          maxHeight: Get.height * 0.88,
        ),
        child: _ReviewContent(importId: importId, tag: tag),
      ),
    ),
    barrierDismissible: false,
  );
}

// ─── Route wrapper (kept for route compatibility) ────────────────────────────

class StatementReviewScreen extends StatelessWidget {
  final int importId;
  const StatementReviewScreen({super.key, required this.importId});

  @override
  Widget build(BuildContext context) {
    final tag = 'sic_page_$importId';
    return Scaffold(
      appBar: AppBar(
        title: Obx(() {
          final ctrl = Get.isRegistered<StatementImportController>(tag: tag)
              ? Get.find<StatementImportController>(tag: tag)
              : null;
          if (ctrl?.importStatus.value == 'completed') {
            return AppText(
              'Review Transactions (${ctrl!.rows.length})',
              fontSize: 16,
            );
          }
          return const AppText('Processing Statement', fontSize: 16);
        }),
        centerTitle: false,
        elevation: 0,
      ),
      body: _ReviewContent(importId: importId, tag: tag, isPage: true),
    );
  }
}

// ─── Shared content widget ───────────────────────────────────────────────────

class _ReviewContent extends StatelessWidget {
  final int importId;
  final String tag;
  final bool isPage;

  const _ReviewContent({
    required this.importId,
    required this.tag,
    this.isPage = false,
  });

  void _close(StatementImportController ctrl) {
    ctrl.cancelPolling();
    if (isPage) {
      Get.back();
    } else {
      Get.back(); // pops dialog
    }
    if (Get.isRegistered<StatementImportController>(tag: tag)) {
      Get.delete<StatementImportController>(tag: tag, force: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ctrl = Get.put(StatementImportController(importId), tag: tag);
    final theme = Theme.of(context);
    final onSurface = theme.colorScheme.onSurface;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // ── Header ──────────────────────────────────────────────────────────
        if (!isPage)
          Container(
            padding: const EdgeInsets.fromLTRB(20, 14, 8, 14),
            decoration: BoxDecoration(
              border: Border(
                bottom: BorderSide(color: onSurface.withValues(alpha: 0.1)),
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Obx(() {
                    final done = ctrl.importStatus.value == 'completed';
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        AppText(
                          done
                              ? 'Review Extracted Transactions'
                              : 'Processing Statement…',
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                        if (done && ctrl.rows.isNotEmpty)
                          AppText(
                            '${ctrl.rows.length} transaction${ctrl.rows.length == 1 ? '' : 's'} ready for review',
                            fontSize: 12,
                            color: onSurface.withValues(alpha: 0.5),
                          ),
                      ],
                    );
                  }),
                ),
                IconButton(
                  icon: const Icon(Icons.close, size: 20),
                  onPressed: () => _close(ctrl),
                  tooltip: 'Close',
                ),
              ],
            ),
          ),

        // ── Body ────────────────────────────────────────────────────────────
        Flexible(
          child: Obx(() {
            final status = ctrl.importStatus.value;

            if (status == 'processing') {
              return _ProcessingState(onClose: () => _close(ctrl));
            }
            if (status == 'failed') {
              return _FailedState(
                message: ctrl.errorMessage.value,
                onClose: () => _close(ctrl),
              );
            }
            if (ctrl.isLoading.value) {
              return const Center(
                child: Padding(
                  padding: EdgeInsets.all(48),
                  child: CircularProgressIndicator(),
                ),
              );
            }
            if (ctrl.rows.isEmpty) {
              return _DoneState(onClose: () => _close(ctrl));
            }
            return _ReviewList(
              ctrl: ctrl,
              onClose: () => _close(ctrl),
            );
          }),
        ),
      ],
    );
  }
}

// ─── State screens ───────────────────────────────────────────────────────────

class _ProcessingState extends StatelessWidget {
  final VoidCallback onClose;
  const _ProcessingState({required this.onClose});

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(40),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(),
          const SizedBox(height: 24),
          AppText(
            'Extracting transactions from your document…',
            fontSize: 15,
            fontWeight: FontWeight.w500,
            textAlign: TextAlign.center,
            color: onSurface,
          ),
          const SizedBox(height: 6),
          AppText(
            'This usually takes 20–60 seconds.',
            fontSize: 13,
            color: onSurface.withValues(alpha: 0.55),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 28),
          OutlinedButton(
            onPressed: onClose,
            child: const Text('Cancel'),
          ),
        ],
      ),
    );
  }
}

class _FailedState extends StatelessWidget {
  final String message;
  final VoidCallback onClose;
  const _FailedState({required this.message, required this.onClose});

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(40),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.error_outline, size: 52, color: _kRed(context)),
          const SizedBox(height: 16),
          AppText(
            'Processing Failed',
            fontSize: 18,
            fontWeight: FontWeight.w600,
            color: _kRed(context),
          ),
          const SizedBox(height: 8),
          AppText(
            message.isNotEmpty
                ? message
                : 'Something went wrong. Please try again.',
            fontSize: 14,
            textAlign: TextAlign.center,
            color: onSurface.withValues(alpha: 0.65),
          ),
          const SizedBox(height: 24),
          OutlinedButton(
            onPressed: onClose,
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }
}

class _DoneState extends StatelessWidget {
  final VoidCallback onClose;
  const _DoneState({required this.onClose});

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(40),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.check_circle_outline, size: 52, color: _kGreen(context)),
          const SizedBox(height: 16),
          AppText(
            'All Done!',
            fontSize: 18,
            fontWeight: FontWeight.w600,
            color: onSurface,
          ),
          const SizedBox(height: 8),
          AppText(
            'Approved transactions have been added to your records.',
            fontSize: 14,
            textAlign: TextAlign.center,
            color: onSurface.withValues(alpha: 0.65),
          ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: onClose,
            style: FilledButton.styleFrom(backgroundColor: _kGreen(context)),
            child: const Text('Done'),
          ),
        ],
      ),
    );
  }
}

// ─── Review list + footer ────────────────────────────────────────────────────

class _ReviewList extends StatelessWidget {
  final StatementImportController ctrl;
  final VoidCallback onClose;
  const _ReviewList({required this.ctrl, required this.onClose});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final onSurface = cs.onSurface;
    final duplicateCount = ctrl.rows.where((r) => r.isDuplicate).length;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Summary banner
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
          color: cs.surfaceContainerHighest,
          child: AppText(
            '${ctrl.rows.length} transaction${ctrl.rows.length == 1 ? '' : 's'} found'
            '${duplicateCount > 0 ? '  ·  $duplicateCount possible duplicate${duplicateCount > 1 ? 's' : ''}' : ''}',
            fontSize: 12,
            color: onSurface.withValues(alpha: 0.6),
          ),
        ),

        // Scrollable transaction list
        Flexible(
          child: ListView.builder(
            shrinkWrap: true,
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
            itemCount: ctrl.rows.length,
            itemBuilder: (_, i) => _TransactionCard(
              row: ctrl.rows[i],
              controller: ctrl,
            ),
          ),
        ),

        // Bottom action bar
        Container(
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
          decoration: BoxDecoration(
            border: Border(
              top: BorderSide(color: onSurface.withValues(alpha: 0.1)),
            ),
          ),
          child: Row(
            children: [
              Expanded(
                child: FilledButton(
                  onPressed: () async {
                    final ok = await _confirm(
                      context,
                      'Approve All',
                      'Add all ${ctrl.rows.length} transactions to your records?',
                    );
                    if (ok == true) ctrl.approveAll();
                  },
                  style: FilledButton.styleFrom(backgroundColor: _kGreen(context)),
                  child: Text('Approve All (${ctrl.rows.length})'),
                ),
              ),
              const SizedBox(width: 12),
              OutlinedButton(
                onPressed: () async {
                  final ok = await _confirm(
                    context,
                    'Reject All',
                    'Discard all ${ctrl.rows.length} transactions?',
                  );
                  if (ok == true) ctrl.rejectAll();
                },
                style: OutlinedButton.styleFrom(foregroundColor: _kRed(context)),
                child: const Text('Reject All'),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Future<bool?> _confirm(
      BuildContext context, String title, String message) {
    return showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
  }
}

// ─── Transaction card ────────────────────────────────────────────────────────

class _TransactionCard extends StatelessWidget {
  final PendingTransactionModel row;
  final StatementImportController controller;

  const _TransactionCard({
    required this.row,
    required this.controller,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final isCredit = row.transactionType == 'credit';
    final amountColor = isCredit ? _kGreen(context) : _kRed(context);
    final amountStr =
        '${isCredit ? '+' : '−'}\$${_amtFmt.format(row.amount.abs())}';

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(color: cs.outlineVariant.withValues(alpha: 0.55)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Duplicate warning
          if (row.isDuplicate)
            Container(
              width: double.infinity,
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
              decoration: BoxDecoration(
                color: Colors.amber.withValues(alpha: 0.15),
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(8)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.warning_amber_rounded,
                      size: 13, color: Colors.amber),
                  const SizedBox(width: 5),
                  AppText(
                    'Possible duplicate',
                    fontSize: 11,
                    color: Colors.amber.shade700,
                  ),
                ],
              ),
            ),

          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                // Left: date, title, category
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      AppText(
                        _dateFmt.format(row.dateTime),
                        fontSize: 11,
                        color: cs.onSurface.withValues(alpha: 0.5),
                      ),
                      const SizedBox(height: 3),
                      AppText(
                        row.title,
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: cs.onSurface,
                      ),
                      if (row.categoryId != null) ...[
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            Icon(
                              Icons.label_outline,
                              size: 11,
                              color: cs.onSurface.withValues(alpha: 0.4),
                            ),
                            const SizedBox(width: 3),
                            AppText(
                              'Category assigned',
                              fontSize: 11,
                              color: cs.onSurface.withValues(alpha: 0.4),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                // Right: amount + action buttons
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    AppText(
                      amountStr,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: amountColor,
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _ActionBtn(
                          icon: Icons.edit_outlined,
                          color: cs.onSurface.withValues(alpha: 0.55),
                          bgColor: cs.onSurface.withValues(alpha: 0.07),
                          tooltip: 'Edit',
                          onTap: () => showStatementRowEditSheet(
                              context, row, controller),
                        ),
                        const SizedBox(width: 6),
                        _ActionBtn(
                          icon: Icons.check,
                          color: _kGreen(context),
                          bgColor: _kGreen(context).withValues(alpha: 0.15),
                          tooltip: 'Approve',
                          onTap: () => controller.approveTransaction(row),
                        ),
                        const SizedBox(width: 6),
                        _ActionBtn(
                          icon: Icons.close,
                          color: _kRed(context),
                          bgColor: _kRed(context).withValues(alpha: 0.15),
                          tooltip: 'Reject',
                          onTap: () => controller.rejectTransaction(row),
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Action button ───────────────────────────────────────────────────────────

class _ActionBtn extends StatelessWidget {
  final IconData icon;
  final Color color;
  final Color bgColor;
  final String tooltip;
  final VoidCallback onTap;

  const _ActionBtn({
    required this.icon,
    required this.color,
    required this.bgColor,
    required this.tooltip,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(color: bgColor, shape: BoxShape.circle),
          child: Icon(icon, size: 15, color: color),
        ),
      ),
    );
  }
}
