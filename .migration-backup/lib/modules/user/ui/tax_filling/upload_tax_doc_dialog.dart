import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/modules/user/controllers/tax_document_controller.dart';
import 'package:booksmart/modules/user/ui/bank_statement/statement_review_screen.dart';
import 'package:booksmart/widgets/snackbar.dart';
import 'package:dropdown_search/dropdown_search.dart';
import 'package:flutter/foundation.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';
import 'package:path/path.dart' as path;

import '../../../../widgets/custom_drop_down.dart';

/// Financial statement categories for uploads (order matches product spec).
const List<String> kFinancialStatementCategories = [
  'Balance Sheet',
  'Profit & Loss',
  'Income Statement',
  'Cash Flow Statement',
  'Transactions',
];

void showUploadTaxDocumentDialog({String? type}) {
  // Use Get.dialog (same overlay stack as review + reconciliation Get.dialog).
  // Get.generalDialog + nested Get.dialog often breaks Get.back / leaves taps blocked on web.
  Get.dialog<void>(
    Dialog(
      insetPadding: const EdgeInsets.all(20),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      backgroundColor: Get.isDarkMode
          ? Get.theme.colorScheme.surface
          : Colors.white,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: Material(
          color: Colors.transparent,
          child: UploadTaxDocWidget(type: type),
        ),
      ),
    ),
    barrierDismissible: true,
  );
}

class UploadTaxDocWidget extends StatefulWidget {
  const UploadTaxDocWidget({super.key, this.type});

  final String? type;

  @override
  State<UploadTaxDocWidget> createState() => _UploadTaxDocWidgetState();
}

class _UploadTaxDocWidgetState extends State<UploadTaxDocWidget> {
  static final _dateFmt = DateFormat.yMMMd();

  void _closeDropdownOverlays() {
    categoryDropdownKey.currentState?.closeDropDownSearch();
    yearDropdownKey.currentState?.closeDropDownSearch();
  }

  void _popUploadDialog() {
    FocusManager.instance.primaryFocus?.unfocus();
    _closeDropdownOverlays();
    if (!mounted) return;
    Navigator.of(context, rootNavigator: true).maybePop();
  }

  String get _dialogTitle {
    final t = widget.type?.toLowerCase();
    if (t == 'bs') return 'Upload Balance Sheet Document';
    if (t == 'cf') return 'Upload Cash Flow Document';
    if (t == 'pl' || t == 'pnl') return 'Upload Profit & Loss Document';
    return 'Upload Financial Document';
  }

  final yearDropdownKey = GlobalKey<DropdownSearchState<String>>();
  final categoryDropdownKey = GlobalKey<DropdownSearchState<String>>();
  final nameCtrl = TextEditingController();

  String? selectedYear;
  String? selectedCategory;
  DateTime? periodStart;
  DateTime? periodEnd;
  DateTime? balanceSheetAsOf;

  late final TaxDocumentController _ctrl;

  bool get _isBalanceSheetUpload =>
      (selectedCategory?.trim() == 'Balance Sheet') ||
      widget.type?.toLowerCase() == 'bs';

  String? _defaultCategoryForType() {
    switch (widget.type?.toLowerCase()) {
      case 'bs':
        return 'Balance Sheet';
      case 'cf':
        return 'Cash Flow Statement';
      case 'pl':
      case 'pnl':
        return 'Profit & Loss';
      default:
        return null;
    }
  }

  List<String> get _yearItems {
    final cap = DateTime.now().year;
    return [for (var y = cap; y >= 1960; y--) y.toString()];
  }

  @override
  void initState() {
    super.initState();
    final y = DateTime.now().year;
    selectedYear = y.toString();
    periodStart = DateTime(y, 1, 1);
    periodEnd = DateTime(y, 12, 31);
    selectedCategory = _defaultCategoryForType();
    balanceSheetAsOf = DateTime(y, DateTime.now().month, DateTime.now().day);
    _ctrl = Get.isRegistered<TaxDocumentController>()
        ? Get.find<TaxDocumentController>()
        : Get.put(TaxDocumentController());
  }

  @override
  void dispose() {
    nameCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickDate(
    BuildContext context, {
    required bool isStart,
  }) async {
    final initial = isStart
        ? (periodStart ?? DateTime.now())
        : (periodEnd ?? DateTime.now());
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(1960),
      lastDate: DateTime(DateTime.now().year + 10, 12, 31),
    );
    if (picked == null) return;
    setState(() {
      if (isStart) {
        periodStart = picked;
      } else {
        periodEnd = picked;
      }
    });
  }

  Future<void> _pickBalanceSheetAsOf(BuildContext context) async {
    final initial = balanceSheetAsOf ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(1960),
      lastDate: DateTime(DateTime.now().year + 10, 12, 31),
    );
    if (picked == null) return;
    setState(() {
      balanceSheetAsOf = DateTime(picked.year, picked.month, picked.day);
    });
  }

  Future<void> _save(BuildContext context) async {
    final result = await _ctrl.uploadDocument(
      name: nameCtrl.text,
      taxYear: selectedYear,
      category: selectedCategory,
      type: widget.type,
      periodStart: _isBalanceSheetUpload ? null : periodStart,
      periodEnd: _isBalanceSheetUpload ? null : periodEnd,
      balanceSheetAsOf:
          _isBalanceSheetUpload ? balanceSheetAsOf : null,
    );
    if (result is int) {
      _popUploadDialog();
      showStatementReviewDialog(importId: result);
    } else if (result != null) {
      _popUploadDialog();
      if (!_ctrl.consumeSuppressUploadSuccessSnack()) {
        showSnackBar('Document Uploaded Successfully');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return GetBuilder<TaxDocumentController>(
      builder: (ctrl) {
        final pickedName = ctrl.pickedFile != null
            ? path.basename(ctrl.pickedFile!.path)
            : null;

        return SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AppText(
                _dialogTitle,
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
              const SizedBox(height: 15),

              Row(
                spacing: 10,
                children: [
                  if (!kIsWeb)
                    Expanded(
                      child: SizedBox(
                        height: 130,
                        child: Card(
                          child: InkWell(
                            borderRadius: BorderRadius.circular(8),
                            onTap: ctrl.isUploading.value
                                ? null
                                : ctrl.pickFromCamera,
                            child: const Padding(
                              padding: EdgeInsets.all(10),
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(Icons.camera_alt_outlined, size: 36),
                                  SizedBox(height: 8),
                                  FittedBox(
                                    fit: BoxFit.scaleDown,
                                    child: AppText(
                                      'Scan From Camera',
                                      fontSize: 14,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),

                  Expanded(
                    child: SizedBox(
                      height: 130,
                      child: Card(
                        child: InkWell(
                          borderRadius: BorderRadius.circular(8),
                          onTap: ctrl.isUploading.value
                              ? null
                              : ctrl.pickFromDevice,
                          child: const Padding(
                            padding: EdgeInsets.all(10),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.upload_file, size: 36),
                                SizedBox(height: 8),
                                FittedBox(
                                  fit: BoxFit.scaleDown,
                                  child: AppText(
                                    'Upload From Device',
                                    fontSize: 14,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),

              if (pickedName != null) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    const Icon(Icons.attach_file, size: 16),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        pickedName,
                        style: const TextStyle(fontSize: 13),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, size: 16),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                      onPressed: () {
                        ctrl.pickedFile = null;
                        ctrl.update();
                      },
                    ),
                  ],
                ),
              ],

              const SizedBox(height: 10),

              AppTextField(
                controller: nameCtrl,
                hintText: 'Document Name *',
                keyboardType: TextInputType.name,
              ),
              const SizedBox(height: 10),

              CustomDropDownWidget<String>(
                dropDownKey: categoryDropdownKey,
                label: 'Document category *',
                hint: 'Select category',
                items: kFinancialStatementCategories,
                selectedItem: selectedCategory,
                onChanged: (v) => setState(() => selectedCategory = v),
              ),
              const SizedBox(height: 10),

              CustomDropDownWidget<String>(
                dropDownKey: yearDropdownKey,
                label: 'Year',
                hint: 'Select year',
                items: _yearItems,
                selectedItem: selectedYear,
                onChanged: (v) {
                  setState(() {
                    selectedYear = v;
                    final yi = int.tryParse(v ?? '');
                    if (yi != null && !_isBalanceSheetUpload) {
                      periodStart = DateTime(yi, 1, 1);
                      periodEnd = DateTime(yi, 12, 31);
                    }
                  });
                },
              ),
              const SizedBox(height: 12),

              if (_isBalanceSheetUpload) ...[
                Align(
                  alignment: Alignment.centerLeft,
                  child: AppText(
                    'As Of Date (required) *',
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: () => _pickBalanceSheetAsOf(context),
                  icon: const Icon(Icons.calendar_today, size: 18),
                  label: Text(
                    balanceSheetAsOf == null
                        ? 'Select As Of date *'
                        : 'As Of: ${_dateFmt.format(balanceSheetAsOf!)}',
                  ),
                ),
              ] else ...[
                Align(
                  alignment: Alignment.centerLeft,
                  child: AppText(
                    'Document period (required) *',
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => _pickDate(context, isStart: true),
                        icon: const Icon(Icons.calendar_today, size: 18),
                        label: Text(
                          periodStart == null
                              ? 'Start date *'
                              : 'Start: ${_dateFmt.format(periodStart!)}',
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => _pickDate(context, isStart: false),
                        icon: const Icon(Icons.calendar_today, size: 18),
                        label: Text(
                          periodEnd == null
                              ? 'End date *'
                              : 'End: ${_dateFmt.format(periodEnd!)}',
                        ),
                      ),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 20),

              Row(
                spacing: 10,
                children: [
                  Expanded(
                    child: SizedBox(
                      height: 44,
                      child: outlineButton(
                        "Close",
                        onPressed: () {
                          ctrl.pickedFile = null;
                          ctrl.update();
                          _popUploadDialog();
                        },
                      ),
                    ),
                  ),
                  Expanded(
                    child: SizedBox(
                      height: 44,
                      child: Obx(
                        () => AppButton(
                          buttonText: ctrl.isUploading.value
                              ? 'Uploading…'
                              : 'Save',
                          onTapFunction: ctrl.isUploading.value
                              ? null
                              : () => _validateAndSave(context, ctrl),
                          radius: 10,
                          fontSize: 12,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 20,
                            vertical: 10,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _validateAndSave(
    BuildContext context,
    TaxDocumentController ctrl,
  ) async {
    FocusManager.instance.primaryFocus?.unfocus();
    _closeDropdownOverlays();
    if (selectedCategory == null || selectedCategory!.isEmpty) {
      showSnackBar('Please select a document category', isError: true);
      return;
    }
    if (selectedYear == null || selectedYear!.isEmpty) {
      showSnackBar('Please select a year', isError: true);
      return;
    }
    if (_isBalanceSheetUpload) {
      if (balanceSheetAsOf == null) {
        showSnackBar('Please select an As Of date', isError: true);
        return;
      }
    } else {
      if (periodStart == null || periodEnd == null) {
        showSnackBar(
          'Please select start and end dates for the document period',
          isError: true,
        );
        return;
      }
      if (periodEnd!.isBefore(periodStart!)) {
        showSnackBar(
          'End date must be on or after the start date',
          isError: true,
        );
        return;
      }
    }
    await _save(context);
  }
}
