import 'package:booksmart/models/pending_transaction_model.dart';
import 'package:booksmart/modules/admin/controllers/category_controler.dart';
import 'package:booksmart/modules/user/controllers/statement_import_controller.dart';
import 'package:booksmart/modules/user/ui/transaction/category_selection_screen.dart';
import 'package:booksmart/widgets/app_text.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

Future<void> showStatementRowEditSheet(
  BuildContext context,
  PendingTransactionModel row,
  StatementImportController controller,
) {
  return showDialog(
    context: context,
    builder: (_) => Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 460),
        child: _StatementRowEditSheet(row: row, controller: controller),
      ),
    ),
  );
}

class _StatementRowEditSheet extends StatefulWidget {
  final PendingTransactionModel row;
  final StatementImportController controller;

  const _StatementRowEditSheet({required this.row, required this.controller});

  @override
  State<_StatementRowEditSheet> createState() => _StatementRowEditSheetState();
}

class _StatementRowEditSheetState extends State<_StatementRowEditSheet> {
  late final TextEditingController _titleCtrl;
  late final TextEditingController _amountCtrl;
  late final TextEditingController _descCtrl;
  late DateTime _selectedDate;
  late String _transactionType;
  int? _categoryId;
  int? _subCategoryId;
  late final CategoryAdminController _catCtrl;

  @override
  void initState() {
    super.initState();
    _catCtrl = Get.isRegistered<CategoryAdminController>()
        ? Get.find<CategoryAdminController>()
        : Get.put(CategoryAdminController());
    _titleCtrl = TextEditingController(text: widget.row.title);
    _amountCtrl =
        TextEditingController(text: widget.row.amount.toStringAsFixed(2));
    _descCtrl = TextEditingController(text: widget.row.description);
    _selectedDate = widget.row.dateTime;
    _transactionType = widget.row.transactionType;
    _categoryId = widget.row.categoryId;
    _subCategoryId = widget.row.subCategoryId;
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _amountCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(2000),
      lastDate: DateTime.now(),
    );
    if (picked != null) setState(() => _selectedDate = picked);
  }

  Future<void> _pickCategory() async {
    final result = await goToCategorySelectionScreen(
      selectedCategory: _categoryId,
      selectedSubcategory: _subCategoryId,
    );
    if (result != null && result is Map) {
      setState(() {
        _categoryId = result['categoryId'];
        _subCategoryId = result['subcategoryId'];
      });
    }
  }

  void _saveAndApprove() {
    final amount = double.tryParse(_amountCtrl.text.trim());
    if (amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a valid amount')),
      );
      return;
    }
    if (_titleCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a title')),
      );
      return;
    }

    Navigator.pop(context);
    widget.controller.editAndApprove(widget.row, {
      'title': _titleCtrl.text.trim(),
      'amount': amount,
      'date_time': _selectedDate.toIso8601String(),
      'description': _descCtrl.text.trim(),
      'transaction_type': _transactionType,
      if (_categoryId != null) 'category_id': _categoryId,
      if (_subCategoryId != null) 'sub_category_id': _subCategoryId,
    });
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final dateStr = DateFormat('MMM d, yyyy').format(_selectedDate);

    return SingleChildScrollView(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            children: [
              AppText('Edit Transaction', fontSize: 16,
                  color: colorScheme.onSurface),
              const Spacer(),
              IconButton(
                icon: const Icon(Icons.close),
                onPressed: () => Navigator.pop(context),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Title
          TextField(
            controller: _titleCtrl,
            decoration: const InputDecoration(
              labelText: 'Title / Merchant',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),

          // Amount
          TextField(
            controller: _amountCtrl,
            keyboardType:
                const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'^\d+\.?\d{0,2}'))
            ],
            decoration: const InputDecoration(
              labelText: 'Amount',
              prefixText: '\$',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),

          // Date picker
          OutlinedButton.icon(
            onPressed: _pickDate,
            icon: const Icon(Icons.calendar_today, size: 16),
            label: Text(dateStr),
          ),
          const SizedBox(height: 12),

          // Debit / Credit toggle
          Row(
            children: [
              AppText('Type:', fontSize: 14, color: colorScheme.onSurface),
              const SizedBox(width: 12),
              ChoiceChip(
                label: const Text('Debit'),
                selected: _transactionType == 'debit',
                onSelected: (_) =>
                    setState(() => _transactionType = 'debit'),
              ),
              const SizedBox(width: 8),
              ChoiceChip(
                label: const Text('Credit'),
                selected: _transactionType == 'credit',
                onSelected: (_) =>
                    setState(() => _transactionType = 'credit'),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Category
          OutlinedButton.icon(
            onPressed: _pickCategory,
            icon: const Icon(Icons.category_outlined, size: 16),
            label: Text(
              _categoryId != null
                  ? '${_catCtrl.getCategoryName(_categoryId!)}${_subCategoryId != null ? ' / ${_catCtrl.getSubCategoryName(_subCategoryId)}' : ''}'
                  : 'Select Category',
            ),
          ),
          const SizedBox(height: 20),

          // Save & Approve
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _saveAndApprove,
              child: const Text('Save & Approve'),
            ),
          ),
          const SizedBox(height: 8),

          // Cancel
          SizedBox(
            width: double.infinity,
            child: TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
          ),
        ],
      ),
    );
  }
}
