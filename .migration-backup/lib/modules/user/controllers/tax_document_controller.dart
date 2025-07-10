import 'dart:developer';
import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/services.dart';
import 'package:printing/printing.dart';
import 'package:booksmart/services/ai_extraction_service.dart';
import 'package:booksmart/modules/user/controllers/organization_controller.dart';
import 'package:path/path.dart' as p;
import 'package:intl/intl.dart';

import 'package:booksmart/models/financial_template_models.dart';
import 'package:booksmart/modules/user/ui/bank_statement/statement_review_screen.dart';
import 'package:booksmart/modules/user/ui/tax_filling/bs_reconciliation_dialog.dart';
import 'package:booksmart/modules/user/ui/tax_filling/manual_pnl_review_helper.dart';
import 'package:booksmart/modules/user/ui/tax_filling/pl_reconciliation_dialog.dart';
import 'package:booksmart/modules/user/ui/financial_statement/pdf_export_service.dart';
import 'package:booksmart/utils/balance_sheet_from_transactions.dart';
import 'package:booksmart/utils/pl_transaction_totals.dart';
import 'package:booksmart/models/transaction_model.dart';
import 'package:booksmart/models/user_document_model.dart';
import 'package:booksmart/modules/common/controllers/auth_controller.dart';
import 'package:booksmart/modules/user/controllers/financial_report_controller.dart';
import 'package:booksmart/services/document_parser_service.dart';
import 'package:booksmart/services/storage_service.dart';
import 'package:booksmart/supabase/buckets.dart';
import 'package:booksmart/supabase/tables.dart';
import 'package:booksmart/utils/supabase.dart';
import 'package:booksmart/widgets/app_text.dart';
import 'package:booksmart/widgets/snackbar.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:image_picker/image_picker.dart';

class _MultiPeriodSaveEntry {
  _MultiPeriodSaveEntry({
    required this.type,
    required this.displayName,
    required this.docDate,
    required this.template,
  });
  final String type;
  final String displayName;
  final DateTime docDate;
  final Object template;
}

class _ManualPeriodColumn {
  _ManualPeriodColumn({
    required this.year,
    required this.start,
    required this.end,
    this.displayLabel,
  });
  int year;
  DateTime start;
  DateTime end;
  /// Balance sheet column header (e.g. "2026 (As of May 3, 2026)").
  String? displayLabel;
}

enum _ManualCfFrequency { monthly, quarterly, yearly, custom }

class TaxDocumentController extends GetxController {
  // ── Reactive state ────────────────────────────────────────────────────────

  final documents = <UserDocument>[].obs;
  final isLoading = false.obs;
  final isUploading = false.obs;
  final extractedData = Rxn<dynamic>();
  final NumberFormat _moneyFmt = NumberFormat('#,##0.00');
  final DateFormat _dateFmt = DateFormat.yMMMd();

  DateTime? _uploadPeriodStart;
  DateTime? _uploadPeriodEnd;
  List<_MultiPeriodSaveEntry>? _multiPeriodExtracted;

  /// Balance Sheet upload: single As Of date (no range).
  DateTime? _uploadBalanceSheetAsOf;

  /// Manual review dialog (Balance Sheet): column generator state.
  DateTime _dialogBsAsOf = DateTime.now();
  int _dialogBsPeriodCount = 1;
  PdfViewType _dialogBsFreq = PdfViewType.yearly;
  int _dialogCfPeriodCount = 1;
  _ManualCfFrequency _dialogCfFreq = _ManualCfFrequency.yearly;

  /// When true, [UploadTaxDocWidget] should not show the generic success snackbar
  /// (P&L uploads show a reconciliation-specific message instead).
  bool suppressUploadSuccessSnack = false;

  // ── Form state (used by the upload dialog) ────────────────────────────────

  /// The file chosen by the user (camera or gallery/device).
  XFile? pickedFile;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  @override
  void onInit() {
    super.onInit();
    fetchDocuments();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /// Loads all documents belonging to the current user.
  Future<void> fetchDocuments() async {
    final int? userId = authUser?.id;

    if (userId == null) return;

    try {
      isLoading.value = true;
      final result = await supabase
          .from(SupabaseTable.userDocuments)
          .select()
          .eq('user_id', userId)
          .order('created_at', ascending: false);

      documents.value = (result as List)
          .map((e) => UserDocument.fromJson(e))
          .toList();
    } catch (e, st) {
      log('TaxDocumentController.fetchDocuments error: $e\n$st');
      Get.snackbar('Error', 'Failed to load documents');
    } finally {
      isLoading.value = false;
    }
  }

  /// Picks a file from the camera (mobile-only).
  Future<void> pickFromCamera() async {
    try {
      final picker = ImagePicker();
      final file = await picker.pickImage(
        source: ImageSource.camera,
        imageQuality: 90,
      );
      if (file != null) {
        pickedFile = file;
        update(); // refresh dialog UI
      }
    } catch (e) {
      log('Camera pick error: $e');
      Get.snackbar('Error', 'Could not open camera');
    }
  }

  /// Picks a file from the device gallery / file system.
  Future<void> pickFromDevice() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.any,
        withData: kIsWeb,
      );
      if (result != null && result.files.isNotEmpty) {
        final platformFile = result.files.single;
        if (kIsWeb && platformFile.bytes != null) {
          pickedFile = XFile.fromData(
            platformFile.bytes!,
            name: platformFile.name,
          );
        } else if (platformFile.path != null) {
          pickedFile = XFile(platformFile.path!, name: platformFile.name);
        }
        update(); // refresh dialog UI
      }
    } catch (e) {
      log('Device pick error: $e');
      Get.snackbar('Error', 'Could not pick file');
    }
  }

  /// Returns importId (int) for PDF/image uploads so the caller can navigate
  /// to the review screen. Returns fileUrl (String) for other file types.
  Future<dynamic> uploadDocument({
    required String name,
    String? taxYear,
    String? category,
    String? type,
    DateTime? periodStart,
    DateTime? periodEnd,
    /// Required for Balance Sheet uploads; snapshot date for reconciliation.
    DateTime? balanceSheetAsOf,
    int? userId,
    int? orderId,
    int? cpaId,
    XFile? manualFile,
  }) async {
    final int? effectiveUserId = userId ?? authUser?.id;
    if (effectiveUserId == null) {
      showSnackBar('User not authenticated', isError: true);
      return null;
    }

    final XFile? fileToUpload = manualFile ?? pickedFile;
    if (fileToUpload == null) {
      showSnackBar('Please select a file first', isError: true);
      return null;
    }
    if (name.trim().isEmpty) {
      showSnackBar('Please enter a document name', isError: true);
      return null;
    }

    // Ensure name has the correct extension
    String finalName = name.trim();
    final extension = p.extension(fileToUpload.name).toLowerCase();
    if (extension.isNotEmpty && !finalName.toLowerCase().endsWith(extension)) {
      finalName = '$finalName$extension';
    }

    try {
      isUploading.value = true;
      _multiPeriodExtracted = null;
      _uploadBalanceSheetAsOf = null;
      _uploadPeriodStart = periodStart;
      _uploadPeriodEnd = periodEnd;

      final isBsCategory =
          category?.trim() == 'Balance Sheet' || _normalizeType(type) == 'bs';
      if (isBsCategory && balanceSheetAsOf != null) {
        final d = DateTime(
          balanceSheetAsOf.year,
          balanceSheetAsOf.month,
          balanceSheetAsOf.day,
        );
        _uploadBalanceSheetAsOf = d;
        _uploadPeriodStart = d;
        _uploadPeriodEnd = d;
      }

      // 1. Upload to Storage
      final mimeType = _guessMime(fileToUpload.name);
      final fileUrl = await uploadFileToSupabaseStorage(
        file: fileToUpload,
        bucketName: SupabaseStorageBucket.documents,
        contentType: mimeType,
      );

      if (fileUrl == null || fileUrl.isEmpty) {
        showSnackBar(
          'This adjustment cannot save because the document upload failed. Please re-upload the file and try again.',
          isError: true,
        );
        return null;
      }

      // 2. Get file size + test PDF text extraction
      int? fileSize;
      try {
        final bytes = await fileToUpload.readAsBytes();
        fileSize = bytes.length;
      } catch (_) {}

      // 3. Insert DB row
      final periodMeta = <String, dynamic>{};
      if (balanceSheetAsOf != null && isBsCategory) {
        periodMeta['as_of'] = DateTime(
          balanceSheetAsOf.year,
          balanceSheetAsOf.month,
          balanceSheetAsOf.day,
        ).toIso8601String();
      } else {
        if (periodStart != null) {
          periodMeta['period_start'] = periodStart.toIso8601String();
        }
        if (periodEnd != null) {
          periodMeta['period_end'] = periodEnd.toIso8601String();
        }
      }
      if (category != null && category.isNotEmpty) {
        periodMeta['document_category'] = category;
      }

      final payload = <String, dynamic>{
        'user_id': effectiveUserId,
        'name': finalName,
        'file_url': fileUrl,
        if (taxYear != null && taxYear.isNotEmpty) 'tax_year': taxYear,
        if (category != null && category.isNotEmpty) 'category': category,
        if (fileSize != null) 'file_size': fileSize,
        if (orderId != null) 'order_id': orderId,
        if (cpaId != null) 'cpa_id': cpaId,
        'mime_type': mimeType,
        'created_at': DateTime.now().toIso8601String(),
        'updated_at': DateTime.now().toIso8601String(),
        if (periodMeta.isNotEmpty) 'parsed_data': periodMeta,
      };

      final inserted = await supabase
          .from(SupabaseTable.userDocuments)
          .insert(payload)
          .select()
          .single();
      final int documentId = inserted['id'];

      final normalizedType = (category != null && category.isNotEmpty)
          ? _documentCategoryToParserType(category)
          : _normalizeType(type);
      if (normalizedType != null) {
        final parsedData = await DocumentParserService.parseDocument(
          fileToUpload,
          type: normalizedType,
        );

        if (parsedData != null) {
          extractedData.value = parsedData;
        } else {
          if (normalizedType == 'pnl') {
            extractedData.value = ProfitAndLossTemplate(
              revenue: 0,
              cogs: 0,
              grossProfit: 0,
              operatingExpenses: 0,
              netIncome: 0,
            );
          } else if (normalizedType == 'bs') {
            extractedData.value = BalanceSheetTemplate(
              currentAssets: 0,
              nonCurrentAssets: 0,
              currentLiabilities: 0,
              longTermLiabilities: 0,
              equity: 0,
            );
          } else {
            extractedData.value = CashFlowTemplate(
              operatingActivities: 0,
              investingActivities: 0,
              financingActivities: 0,
            );
          }
        }

        final confirmed =
            await _showReviewDialog(normalizedType, documentBaseName: finalName);
        if (!confirmed) return null;

        final orgId = getCurrentOrganization?.id;
        if (orgId != null) {
          Future<void> runSaveTransactions() async {
            if (_multiPeriodExtracted != null &&
                _multiPeriodExtracted!.isNotEmpty) {
              for (final entry in _multiPeriodExtracted!) {
                await _saveExtractedData(
                  effectiveUserId,
                  orgId,
                  entry.displayName,
                  entry.docDate,
                  entry.type,
                  templateOverride: entry.template,
                );
              }
              _multiPeriodExtracted = null;
            } else {
              final txDate = _uploadPeriodEnd ?? _effectiveTxDate(taxYear);
          await _saveExtractedData(
            effectiveUserId,
            orgId,
            finalName,
            txDate,
            normalizedType,
          );
            }
          }

          if (normalizedType == 'pnl') {
            suppressUploadSuccessSnack = true;
            final book = await fetchBooksmartPlBucketsForRange(
              orgId: orgId,
              rangeStart: _reconciliationRangeStart(taxYear),
              rangeEnd: _reconciliationRangeEnd(taxYear),
            );
            final upRev = _aggregateUploadedPnlRevenue();
            final upExp = _aggregateUploadedPnlExpenses();
            final reconResult =
                await showPlReconciliationDialog(
                      book: book,
                      uploadedRevenue: upRev,
                      uploadedExpenses: upExp,
                      periodLabel: _reconciliationPeriodLabel(taxYear),
                    ) ??
                    PlReconciliationOutcome.reviewLater;

            final shouldSaveTransactions =
                reconResult == PlReconciliationOutcome.saveTransactions;
            if (shouldSaveTransactions) {
              await runSaveTransactions();
            } else {
              _multiPeriodExtracted = null;
            }
            _snackbarAfterPnlReconciliation(
              reconResult,
              shouldSaveTransactions,
            );
          } else if (normalizedType == 'bs') {
            suppressUploadSuccessSnack = true;
            final uploaded = _activeBalanceSheetTemplateAfterReview();
            if (uploaded != null) {
              final asOf = _balanceSheetReconciliationAsOf();
              final book = await _fetchBooksmartBsBook(orgId, asOf);
              final reconResult =
                  await showBsReconciliationDialog(
                        book: book,
                        uploaded: uploaded,
                        periodLabel: _bsReconciliationPeriodLabel(taxYear),
                      ) ??
                      BsReconciliationOutcome.investigateDifference;

              final shouldSave =
                  reconResult == BsReconciliationOutcome.overrideWithUploaded;
              if (shouldSave) {
                await runSaveTransactions();
              } else {
                _multiPeriodExtracted = null;
              }
              _snackbarAfterBsReconciliation(reconResult, shouldSave);
            } else {
              await runSaveTransactions();
            }
          } else {
            await runSaveTransactions();
          }

          final tag = orgId.toString();
          if (Get.isRegistered<FinancialReportController>(tag: tag)) {
            final fc = Get.find<FinancialReportController>(tag: tag);
            fc.fetchAndAggregateData(
              startDate: fc.lastStartDate,
              endDate: fc.lastEndDate,
              balanceSheetAsOfSnapshot: fc.lastFetchBalanceSheetSnapshot,
            );
          }
        }
      // 4. Trigger bank statement pipeline — only for user's own PDF/image uploads
      } else if (manualFile == null &&
          userId == null &&
          (mimeType == 'application/pdf' || mimeType.startsWith('image/'))) {
        final importId = await _triggerStatementImport(
          documentId: documentId,
          fileUrl: fileUrl,
          mimeType: mimeType,
          fileToUpload: fileToUpload,
        );
        if (manualFile == null) pickedFile = null;
        await fetchDocuments();
        if (importId != null) return importId;
      }

      // 5. Reset picked file and refresh list (non-statement files)
      if (manualFile == null) {
        pickedFile = null;
      }
      await fetchDocuments();
      return fileUrl;
    } catch (e, st) {
      suppressUploadSuccessSnack = false;
      log('TaxDocumentController.uploadDocument error: $e\n$st');
      showSnackBar('Failed to upload document: $e', isError: true);
      return null;
    } finally {
      isUploading.value = false;
      update();
    }
  }

  String? _normalizeType(String? type) {
    if (type == null || type.trim().isEmpty) return null;
    final t = type.trim().toLowerCase();
    if (t == 'pl' || t == 'pnl' || t == 'profit_loss' || t == 'profitloss') {
      return 'pnl';
    }
    if (t == 'bs' || t == 'balance_sheet' || t == 'balancesheet') return 'bs';
    if (t == 'cf' || t == 'cash_flow' || t == 'cashflow') return 'cf';
    return null;
  }

  /// Maps upload UI labels to parser keys. `Transactions` → no statement parse.
  String? _documentCategoryToParserType(String? category) {
    if (category == null || category.isEmpty) return null;
    switch (category) {
      case 'Profit & Loss':
      case 'Income Statement':
        return 'pnl';
      case 'Balance Sheet':
        return 'bs';
      case 'Cash Flow Statement':
        return 'cf';
      case 'Transactions':
        return null;
      default:
        return null;
    }
  }

  List<_ManualPeriodColumn> _initialManualPeriodColumns(String type) {
    if (type == 'bs') {
      final as = DateTime(
        _dialogBsAsOf.year,
        _dialogBsAsOf.month,
        _dialogBsAsOf.day,
      );
      final n = _dialogBsPeriodCount.clamp(1, PdfExportService.maxColumns);
      final ends = PdfExportService.buildBalanceSheetSnapshotColumnEnds(
        asOf: as,
        viewType: _dialogBsFreq,
        periodCount: n,
      );
      final labels = PdfExportService.buildBalanceSheetSnapshotColumnLabels(
        ends,
        _dialogBsFreq,
        as,
      );
      return [
        for (var i = 0; i < ends.length; i++)
          _ManualPeriodColumn(
            year: ends[i].year,
            start: ends[i],
            end: ends[i],
            displayLabel: labels[i],
          ),
      ];
    }

    final s = _uploadPeriodStart;
    final e = _uploadPeriodEnd;
    final nowY = DateTime.now().year;
    if (s == null || e == null) {
      return [
        _ManualPeriodColumn(
          year: nowY,
          start: DateTime(nowY, 1, 1),
          end: DateTime(nowY, 12, 31),
        ),
      ];
    }
    if (e.isBefore(s)) {
      return [
        _ManualPeriodColumn(
          year: s.year,
          start: s,
          end: e,
        ),
      ];
    }
    final out = <_ManualPeriodColumn>[];
    for (var y = s.year; y <= e.year && out.length < 8; y++) {
      final yStart = DateTime(y, 1, 1);
      final yEnd = DateTime(y, 12, 31);
      out.add(
        _ManualPeriodColumn(
          year: y,
          start: yStart.isBefore(s) ? s : yStart,
          end: yEnd.isAfter(e) ? e : yEnd,
        ),
      );
    }
    if (out.isEmpty) {
      out.add(_ManualPeriodColumn(year: s.year, start: s, end: e));
    }
    return out;
  }

  List<int> _yearPickerRange() {
    final cap = DateTime.now().year;
    return [for (var y = cap; y >= 1960; y--) y];
  }

  String _sqlDateOnlyForTx(DateTime d) {
    final x = DateTime(d.year, d.month, d.day);
    return '${x.year}-${x.month.toString().padLeft(2, '0')}-${x.day.toString().padLeft(2, '0')}';
  }

  DateTime _sqlNextCalendarDay(DateTime d) =>
      DateTime(d.year, d.month, d.day + 1);

  Future<BsReconciliationBook> _fetchBooksmartBsBook(
    int orgId,
    DateTime asOf,
  ) async {
    final day = DateTime(asOf.year, asOf.month, asOf.day);
    try {
      final res = await supabase
          .from(SupabaseTable.transaction)
          .select()
          .eq('org_id', orgId)
          .gte('date_time', _sqlDateOnlyForTx(DateTime(2000, 1, 1)))
          .lt('date_time', _sqlDateOnlyForTx(_sqlNextCalendarDay(day)));
      final txs = (res as List)
          .map((e) => TransactionModel.fromJson(e))
          .toList();
      final m = BalanceSheetLineMetrics.computeThrough(txs, day);
      return BsReconciliationBook(
        totalAssets: m.totalAssets,
        totalLiabilities: m.totalLiabilities,
        equity: m.totalEquity,
      );
    } catch (e, st) {
      log('TaxDocumentController._fetchBooksmartBsBook: $e\n$st');
      return const BsReconciliationBook(
        totalAssets: 0,
        totalLiabilities: 0,
        equity: 0,
      );
    }
  }

  BalanceSheetTemplate? _activeBalanceSheetTemplateAfterReview() {
    if (_multiPeriodExtracted != null && _multiPeriodExtracted!.isNotEmpty) {
      for (var i = _multiPeriodExtracted!.length - 1; i >= 0; i--) {
        final e = _multiPeriodExtracted![i];
        if (e.type == 'bs' && e.template is BalanceSheetTemplate) {
          return e.template as BalanceSheetTemplate;
        }
      }
    }
    final d = extractedData.value;
    if (d is BalanceSheetTemplate) return d;
    return null;
  }

  DateTime _balanceSheetReconciliationAsOf() {
    if (_multiPeriodExtracted != null && _multiPeriodExtracted!.isNotEmpty) {
      final d = _multiPeriodExtracted!.last.docDate;
      return DateTime(d.year, d.month, d.day);
    }
    if (_uploadBalanceSheetAsOf != null) {
      return DateTime(
        _uploadBalanceSheetAsOf!.year,
        _uploadBalanceSheetAsOf!.month,
        _uploadBalanceSheetAsOf!.day,
      );
    }
    if (_uploadPeriodEnd != null) {
      return DateTime(
        _uploadPeriodEnd!.year,
        _uploadPeriodEnd!.month,
        _uploadPeriodEnd!.day,
      );
    }
    return DateTime.now();
  }

  String _bsReconciliationPeriodLabel(String? taxYear) {
    if (_uploadBalanceSheetAsOf != null) {
      return 'As of: ${_dateFmt.format(_uploadBalanceSheetAsOf!)}';
    }
    final s = _uploadPeriodStart;
    final e = _uploadPeriodEnd;
    if (s != null && e != null) {
      return 'Period: ${_dateFmt.format(s)} – ${_dateFmt.format(e)}';
    }
    final y = int.tryParse((taxYear ?? '').trim()) ?? DateTime.now().year;
    return 'Year: $y';
  }

  void _snackbarAfterBsReconciliation(
    BsReconciliationOutcome outcome,
    bool savedTransactions,
  ) {
    switch (outcome) {
      case BsReconciliationOutcome.overrideWithUploaded:
        showSnackBar(
          savedTransactions
              ? 'Your cash flow update was saved successfully.'
              : 'Reconciliation Required. Your uploaded cash flow statement does not match BookSmart\'s current data. Please reconcile the differences before applying changes.',
        );
        return;
      case BsReconciliationOutcome.keepBookSmart:
        showSnackBar(
          'Missing Transactions Required. BookSmart found a difference between your uploaded statement and existing transactions. Please add or update the missing transactions.',
        );
        return;
      case BsReconciliationOutcome.investigateDifference:
        showSnackBar(
          'Reconciliation Required. Your uploaded cash flow statement does not match BookSmart\'s current data. Please reconcile the differences before applying changes.',
        );
        return;
    }
  }

  void _syncBsManualPeriodColumns({
    required List<_ManualPeriodColumn> periodColumns,
    required Map<String, TextEditingController> controllers,
    required DateTime asOf,
    required int periodCount,
    required PdfViewType frequency,
  }) {
    for (var i = periodColumns.length - 1; i >= 0; i--) {
      _disposeControllersForColumn('bs', controllers, i);
    }
    periodColumns.clear();
    _dialogBsAsOf = DateTime(asOf.year, asOf.month, asOf.day);
    _dialogBsPeriodCount = periodCount.clamp(1, PdfExportService.maxColumns);
    _dialogBsFreq = frequency;
    final ends = PdfExportService.buildBalanceSheetSnapshotColumnEnds(
      asOf: _dialogBsAsOf,
      viewType: _dialogBsFreq,
      periodCount: _dialogBsPeriodCount,
    );
    final labels = PdfExportService.buildBalanceSheetSnapshotColumnLabels(
      ends,
      _dialogBsFreq,
      _dialogBsAsOf,
    );
    for (var i = 0; i < ends.length; i++) {
      periodColumns.add(
        _ManualPeriodColumn(
          year: ends[i].year,
          start: ends[i],
          end: ends[i],
          displayLabel: labels[i],
        ),
      );
    }
    for (var i = 0; i < periodColumns.length; i++) {
      _seedManualColumnControllers('bs', controllers, i);
    }
  }

  void _syncCfManualPeriodColumns({
    required List<_ManualPeriodColumn> periodColumns,
    required Map<String, TextEditingController> controllers,
    required int periodCount,
    required _ManualCfFrequency frequency,
  }) {
    for (var i = periodColumns.length - 1; i >= 0; i--) {
      _disposeControllersForColumn('cf', controllers, i);
    }
    periodColumns.clear();
    _dialogCfPeriodCount = periodCount.clamp(1, 8);
    _dialogCfFreq = frequency;

    final now = DateTime.now();
    final startAnchor = DateTime(
      (_uploadPeriodStart ?? now).year,
      (_uploadPeriodStart ?? now).month,
      (_uploadPeriodStart ?? now).day,
    );
    final endAnchor = DateTime(
      (_uploadPeriodEnd ?? now).year,
      (_uploadPeriodEnd ?? now).month,
      (_uploadPeriodEnd ?? now).day,
    );

    List<_ManualPeriodColumn> generated;
    if (frequency == _ManualCfFrequency.custom) {
      final spanDays = endAnchor.isBefore(startAnchor)
          ? 0
          : endAnchor.difference(startAnchor).inDays;
      generated = List<_ManualPeriodColumn>.generate(_dialogCfPeriodCount, (idx) {
        final start = DateTime(
          startAnchor.year,
          startAnchor.month,
          startAnchor.day,
        ).add(Duration(days: (spanDays + 1) * idx));
        final end = start.add(Duration(days: spanDays));
        return _ManualPeriodColumn(year: start.year, start: start, end: end);
      });
    } else {
      final out = <_ManualPeriodColumn>[];
      if (frequency == _ManualCfFrequency.monthly) {
        final anchor = DateTime(endAnchor.year, endAnchor.month, 1);
        for (var i = _dialogCfPeriodCount - 1; i >= 0; i--) {
          final periodMonth = DateTime(anchor.year, anchor.month - i, 1);
          final end = DateTime(periodMonth.year, periodMonth.month + 1, 0);
          out.add(
            _ManualPeriodColumn(
              year: periodMonth.year,
              start: periodMonth,
              end: end,
            ),
          );
        }
      } else if (frequency == _ManualCfFrequency.quarterly) {
        final qStartMonth = (((endAnchor.month - 1) ~/ 3) * 3) + 1;
        final anchor = DateTime(endAnchor.year, qStartMonth, 1);
        for (var i = _dialogCfPeriodCount - 1; i >= 0; i--) {
          final quarterStart = DateTime(anchor.year, anchor.month - (i * 3), 1);
          final quarterEnd = DateTime(
            quarterStart.year,
            quarterStart.month + 3,
            0,
          );
          out.add(
            _ManualPeriodColumn(
              year: quarterStart.year,
              start: quarterStart,
              end: quarterEnd,
            ),
          );
        }
      } else {
        final anchorYear = endAnchor.year;
        for (var i = _dialogCfPeriodCount - 1; i >= 0; i--) {
          final y = anchorYear - i;
          out.add(
            _ManualPeriodColumn(
              year: y,
              start: DateTime(y, 1, 1),
              end: DateTime(y, 12, 31),
            ),
          );
        }
      }
      generated = out;
    }

    periodColumns.addAll(generated);
    for (var i = 0; i < periodColumns.length; i++) {
      _seedManualColumnControllers('cf', controllers, i);
      _recalcCashFlowColumnFull(controllers, i);
    }
  }

  String _statementTypeLabel(String type) {
    switch (type) {
      case 'pnl':
        return 'Profit & Loss / Income Statement';
      case 'bs':
        return 'Balance Sheet';
      case 'cf':
        return 'Cash Flow Statement';
      default:
        return type;
    }
  }

  DateTime _effectiveTxDate(String? taxYear) {
    final yr = int.tryParse((taxYear ?? '').trim());
    if (yr == null || yr == DateTime.now().year) return DateTime.now();
    return DateTime(yr, 1, 1);
  }

  DateTime _reconciliationRangeStart(String? taxYear) {
    if (_uploadPeriodStart != null) return _uploadPeriodStart!;
    final y = int.tryParse((taxYear ?? '').trim()) ?? DateTime.now().year;
    return DateTime(y, 1, 1);
  }

  DateTime _reconciliationRangeEnd(String? taxYear) {
    if (_uploadPeriodEnd != null) return _uploadPeriodEnd!;
    final y = int.tryParse((taxYear ?? '').trim()) ?? DateTime.now().year;
    return DateTime(y, 12, 31);
  }

  String _reconciliationPeriodLabel(String? taxYear) {
    final s = _uploadPeriodStart;
    final e = _uploadPeriodEnd;
    if (s != null && e != null) {
      return 'Period: ${_dateFmt.format(s)} – ${_dateFmt.format(e)}';
    }
    final y = int.tryParse((taxYear ?? '').trim()) ?? DateTime.now().year;
    return 'Period: calendar year $y';
  }

  double _aggregateUploadedPnlRevenue() {
    if (_multiPeriodExtracted != null && _multiPeriodExtracted!.isNotEmpty) {
      var sum = 0.0;
      for (final entry in _multiPeriodExtracted!) {
        if (entry.type == 'pnl' && entry.template is ProfitAndLossTemplate) {
          sum += (entry.template as ProfitAndLossTemplate).revenue;
        }
      }
      return sum;
    }
    final d = extractedData.value;
    if (d is ProfitAndLossTemplate) return d.revenue;
    return 0;
  }

  double _aggregateUploadedPnlExpenses() {
    if (_multiPeriodExtracted != null && _multiPeriodExtracted!.isNotEmpty) {
      var sum = 0.0;
      for (final entry in _multiPeriodExtracted!) {
        if (entry.type == 'pnl' && entry.template is ProfitAndLossTemplate) {
          final p = entry.template as ProfitAndLossTemplate;
          sum += p.cogs.abs() + p.operatingExpenses.abs();
        }
      }
      return sum;
    }
    final d = extractedData.value;
    if (d is ProfitAndLossTemplate) {
      return d.cogs.abs() + d.operatingExpenses.abs();
    }
    return 0;
  }

  void _snackbarAfterPnlReconciliation(
    PlReconciliationOutcome outcome,
    bool savedTransactions,
  ) {
    switch (outcome) {
      case PlReconciliationOutcome.saveTransactions:
        showSnackBar(
          savedTransactions
              ? 'Your cash flow update was saved successfully.'
              : 'Reconciliation Required. Your uploaded cash flow statement does not match BookSmart\'s current data. Please reconcile the differences before applying changes.',
        );
        return;
      case PlReconciliationOutcome.keepBookSmart:
        showSnackBar(
          'Missing Transactions Required. BookSmart found a difference between your uploaded statement and existing transactions. Please add or update the missing transactions.',
        );
        return;
      case PlReconciliationOutcome.addMissingTransactions:
        showSnackBar(
          'Missing Transactions Required. BookSmart found a difference between your uploaded statement and existing transactions. Please add or update the missing transactions.',
        );
        return;
      case PlReconciliationOutcome.reviewLater:
        showSnackBar(
          'Reconciliation Required. Your uploaded cash flow statement does not match BookSmart\'s current data. Please reconcile the differences before applying changes.',
        );
        return;
    }
  }

  /// Clears [suppressUploadSuccessSnack] and returns the previous value.
  bool consumeSuppressUploadSuccessSnack() {
    final v = suppressUploadSuccessSnack;
    suppressUploadSuccessSnack = false;
    return v;
  }

  void _seedManualColumnControllers(
    String type,
    Map<String, TextEditingController> map,
    int i,
  ) {
    String k(String b) => '${b}__$i';
    if (type == 'pnl') {
      for (final field in ManualPnlKeys.allValueKeys) {
        final initial =
            field == ManualPnlKeys.taxRatePercent ? '0' : '0.00';
        map[k(field)] = TextEditingController(text: initial);
      }
    } else if (type == 'bs') {
      map[k('currentAssets')] = TextEditingController(text: '0.00');
      map[k('nonCurrentAssets')] = TextEditingController(text: '0.00');
      map[k('currentLiabilities')] = TextEditingController(text: '0.00');
      map[k('longTermLiabilities')] = TextEditingController(text: '0.00');
      map[k('equity')] = TextEditingController(text: '0.00');
    } else if (type == 'cf') {
      map[k('operatingActivities')] = TextEditingController(text: '0.00');
      map[k('operatingAdjustments')] = TextEditingController(text: '0.00');
      map[k('workingCapitalChanges')] = TextEditingController(text: '0.00');
      map[k('investingActivities')] = TextEditingController(text: '0.00');
      map[k('assetPurchases')] = TextEditingController(text: '0.00');
      map[k('investmentActivities')] = TextEditingController(text: '0.00');
      map[k('financingActivities')] = TextEditingController(text: '0.00');
      map[k('loanActivities')] = TextEditingController(text: '0.00');
      map[k('ownerContributions')] = TextEditingController(text: '0.00');
      map[k('distributions')] = TextEditingController(text: '0.00');
    }
  }

  void _disposeControllersForColumn(
    String type,
    Map<String, TextEditingController> controllers,
    int i,
  ) {
    final prefixes = type == 'pnl'
        ? ManualPnlKeys.allValueKeys
        : type == 'bs'
        ? [
            'currentAssets',
            'nonCurrentAssets',
            'currentLiabilities',
            'longTermLiabilities',
            'equity',
          ]
        : [
            'operatingActivities',
            'operatingAdjustments',
            'workingCapitalChanges',
            'investingActivities',
            'assetPurchases',
            'investmentActivities',
            'financingActivities',
            'loanActivities',
            'ownerContributions',
            'distributions',
          ];
    for (final p in prefixes) {
      final c = controllers.remove('${p}__$i');
      c?.dispose();
    }
  }

  void _onPnlDetailFieldEdited(Map<String, bool> o, int i, String key) {
    final s = '__$i';
    void clear(List<String> keys) {
      for (final k in keys) {
        o['$k$s'] = false;
      }
    }

    if (ManualPnlKeys.revenueInputs.contains(key)) {
      clear([
        ManualPnlKeys.totalRevenue,
        ManualPnlKeys.grossProfit,
        ManualPnlKeys.ebitda,
        ManualPnlKeys.taxExpense,
        ManualPnlKeys.netIncome,
      ]);
    } else if (ManualPnlKeys.cogsInputs.contains(key)) {
      clear([
        ManualPnlKeys.totalCogs,
        ManualPnlKeys.grossProfit,
        ManualPnlKeys.ebitda,
        ManualPnlKeys.taxExpense,
        ManualPnlKeys.netIncome,
      ]);
    } else if (ManualPnlKeys.opexInputs.contains(key)) {
      clear([
        ManualPnlKeys.totalOperatingExpenses,
        ManualPnlKeys.ebitda,
        ManualPnlKeys.taxExpense,
        ManualPnlKeys.netIncome,
      ]);
    } else if (key == ManualPnlKeys.depreciation ||
        key == ManualPnlKeys.amortization ||
        key == ManualPnlKeys.interestExpense) {
      clear([ManualPnlKeys.taxExpense, ManualPnlKeys.netIncome]);
    } else if (key == ManualPnlKeys.taxRatePercent) {
      clear([ManualPnlKeys.taxExpense, ManualPnlKeys.netIncome]);
    }
  }

  void _recalcDetailedPnlColumn(
    Map<String, TextEditingController> c,
    Map<String, bool> over,
    int i,
  ) {
    final s = '__$i';
    bool ov(String field) => over['$field$s'] == true;
    double gv(String field) =>
        _parseMoney(c['$field$s']?.text ?? '0');

    if (!ov(ManualPnlKeys.totalRevenue)) {
      var tr = 0.0;
      for (final k in ManualPnlKeys.revenueInputs) {
        tr += gv(k);
      }
      c['${ManualPnlKeys.totalRevenue}$s']?.text = _formatMoneyInput(tr);
    }

    if (!ov(ManualPnlKeys.totalCogs)) {
      var tc = 0.0;
      for (final k in ManualPnlKeys.cogsInputs) {
        tc += gv(k);
      }
      c['${ManualPnlKeys.totalCogs}$s']?.text = _formatMoneyInput(tc);
    }

    if (!ov(ManualPnlKeys.grossProfit)) {
      final tr = gv(ManualPnlKeys.totalRevenue);
      final tc = gv(ManualPnlKeys.totalCogs);
      c['${ManualPnlKeys.grossProfit}$s']?.text = _formatMoneyInput(tr - tc);
    }

    if (!ov(ManualPnlKeys.totalOperatingExpenses)) {
      var to = 0.0;
      for (final k in ManualPnlKeys.opexInputs) {
        to += gv(k);
      }
      c['${ManualPnlKeys.totalOperatingExpenses}$s']?.text =
          _formatMoneyInput(to);
    }

    if (!ov(ManualPnlKeys.ebitda)) {
      final gp = gv(ManualPnlKeys.grossProfit);
      final to = gv(ManualPnlKeys.totalOperatingExpenses);
      c['${ManualPnlKeys.ebitda}$s']?.text = _formatMoneyInput(gp - to);
    }

    if (!ov(ManualPnlKeys.taxExpense)) {
      final ebitda = gv(ManualPnlKeys.ebitda);
      final dep = gv(ManualPnlKeys.depreciation);
      final amort = gv(ManualPnlKeys.amortization);
      final intexp = gv(ManualPnlKeys.interestExpense);
      final pretax = ebitda - dep - amort - intexp;
      final rate = gv(ManualPnlKeys.taxRatePercent);
      c['${ManualPnlKeys.taxExpense}$s']?.text =
          _formatMoneyInput(pretax * (rate / 100.0));
    }

    if (!ov(ManualPnlKeys.netIncome)) {
      final ebitda = gv(ManualPnlKeys.ebitda);
      final dep = gv(ManualPnlKeys.depreciation);
      final amort = gv(ManualPnlKeys.amortization);
      final intexp = gv(ManualPnlKeys.interestExpense);
      final tax = gv(ManualPnlKeys.taxExpense);
      c['${ManualPnlKeys.netIncome}$s']?.text =
          _formatMoneyInput(ebitda - dep - amort - intexp - tax);
    }
  }

  void _recalcCashFlowColumnFull(Map<String, TextEditingController> c, int i) {
    final s = '__$i';
    final assetPurchases = _parseMoney(c['assetPurchases$s']?.text ?? '0');
    final investmentActivities =
        _parseMoney(c['investmentActivities$s']?.text ?? '0');
    c['investingActivities$s']?.text =
        _formatMoneyInput((-assetPurchases.abs()) + investmentActivities);
    final loanActivities = _parseMoney(c['loanActivities$s']?.text ?? '0');
    final ownerContributions =
        _parseMoney(c['ownerContributions$s']?.text ?? '0');
    final distributions = _parseMoney(c['distributions$s']?.text ?? '0');
    c['financingActivities$s']?.text = _formatMoneyInput(
      loanActivities + ownerContributions - distributions.abs(),
    );
  }

  double _netIncomeForPnlColumn(Map<String, TextEditingController> c, int i) {
    final s = '__$i';
    return _parseMoney(c['${ManualPnlKeys.netIncome}$s']?.text ?? '0');
  }

  dynamic _templateFromControllersColumn(
    String type,
    Map<String, TextEditingController> controllers,
    int i,
  ) {
    double v(String key) =>
        _parseMoney(controllers['${key}__$i']?.text ?? '0');
    if (type == 'pnl') {
      final totalRev = v(ManualPnlKeys.totalRevenue);
      final totalCogs = v(ManualPnlKeys.totalCogs);
      final totalOpex = v(ManualPnlKeys.totalOperatingExpenses);
      final dep = v(ManualPnlKeys.depreciation);
      final amort = v(ManualPnlKeys.amortization);
      final interest = v(ManualPnlKeys.interestExpense);
      final tax = v(ManualPnlKeys.taxExpense);
      final rolledOpex = totalOpex + dep + amort + interest + tax;
      return ProfitAndLossTemplate(
        revenue: totalRev,
        cogs: totalCogs,
        grossProfit: v(ManualPnlKeys.grossProfit),
        operatingExpenses: rolledOpex,
        netIncome: v(ManualPnlKeys.netIncome),
      );
    } else if (type == 'bs') {
      return BalanceSheetTemplate(
        currentAssets: v('currentAssets'),
        nonCurrentAssets: v('nonCurrentAssets'),
        currentLiabilities: v('currentLiabilities'),
        longTermLiabilities: v('longTermLiabilities'),
        equity: v('equity'),
      );
    }
    final investingByParts =
        (-v('assetPurchases').abs()) + v('investmentActivities');
    final financingByParts =
        v('loanActivities') + v('ownerContributions') - v('distributions').abs();
    final hasInvestingBreakdown =
        v('assetPurchases') != 0 || v('investmentActivities') != 0;
    final hasFinancingBreakdown =
        v('loanActivities') != 0 ||
        v('ownerContributions') != 0 ||
        v('distributions') != 0;

    return CashFlowTemplate(
      operatingActivities: v('operatingActivities'),
      operatingAdjustments: v('operatingAdjustments'),
      workingCapitalChanges: v('workingCapitalChanges'),
      investingActivities: hasInvestingBreakdown
          ? investingByParts
          : v('investingActivities'),
      assetPurchases: v('assetPurchases'),
      investmentActivities: v('investmentActivities'),
      financingActivities: hasFinancingBreakdown
          ? financingByParts
          : v('financingActivities'),
      loanActivities: v('loanActivities'),
      ownerContributions: v('ownerContributions'),
      distributions: v('distributions'),
    );
  }

  double _summaryBsColumn(Map<String, TextEditingController> c, int i) {
    double v(String k) => _parseMoney(c['${k}__$i']?.text ?? '0');
    return (v('currentAssets') + v('nonCurrentAssets')) -
        (v('currentLiabilities') + v('longTermLiabilities') + v('equity'));
  }

  double _summaryCfColumn(Map<String, TextEditingController> c, int i) {
    double v(String k) => _parseMoney(c['${k}__$i']?.text ?? '0');
    final investingByParts =
        (-v('assetPurchases').abs()) + v('investmentActivities');
    final financingByParts =
        v('loanActivities') + v('ownerContributions') - v('distributions').abs();
    final hasInvestingBreakdown =
        v('assetPurchases') != 0 || v('investmentActivities') != 0;
    final hasFinancingBreakdown =
        v('loanActivities') != 0 ||
        v('ownerContributions') != 0 ||
        v('distributions') != 0;
    final operating = v('operatingActivities');
    final investing = hasInvestingBreakdown
        ? investingByParts
        : v('investingActivities');
    final financing = hasFinancingBreakdown
        ? financingByParts
        : v('financingActivities');
    return operating + investing + financing;
  }

  List<Widget> _buildManualPnlDetailRows(
    List<_ManualPeriodColumn> periodColumns,
    Map<String, TextEditingController> controllers,
    Map<String, bool> pnlManualOverrides,
    void Function(void Function()) setLocalState,
  ) {
    final n = periodColumns.length;
    final specs = manualPnlRowSpecs();
    return [
      for (final spec in specs)
        if (spec.key == null)
          Padding(
            padding: const EdgeInsets.only(top: 10, bottom: 4),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                spec.label,
                style: const TextStyle(
                  color: Colors.white70,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          )
        else
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 200,
                    child: Text(
                      spec.label,
                      style: const TextStyle(color: Colors.white, fontSize: 11),
                    ),
                  ),
                  ...List.generate(n, (i) {
                    final fk = '${spec.key}__$i';
                    final ctrl = controllers[fk];
                    final isAuto =
                        ManualPnlKeys.autoKeys.contains(spec.key);
                    final overridden = pnlManualOverrides[fk] == true;
                    final isPercent = spec.isPercent;
                    return Padding(
                      padding: const EdgeInsets.only(right: 4),
                      child: SizedBox(
                        width: 118,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            TextFormField(
                              controller: ctrl,
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                decimal: true,
                                signed: true,
                              ),
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 11,
                              ),
                              decoration: InputDecoration(
                                prefixText: isPercent ? null : '\$ ',
                                suffixText: isPercent ? ' %' : null,
                                prefixStyle: const TextStyle(
                                  color: Colors.white70,
                                  fontSize: 10,
                                ),
                                suffixStyle: const TextStyle(
                                  color: Colors.white70,
                                  fontSize: 10,
                                ),
                                fillColor: Colors.white.withValues(alpha: 0.1),
                                filled: true,
                                isDense: true,
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 6,
                                  vertical: 8,
                                ),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(6),
                                ),
                              ),
                              onChanged: (_) {
                                final k = spec.key!;
                                if (isAuto) {
                                  pnlManualOverrides[fk] = true;
                                } else {
                                  _onPnlDetailFieldEdited(
                                    pnlManualOverrides,
                                    i,
                                    k,
                                  );
                                }
                                _recalcDetailedPnlColumn(
                                  controllers,
                                  pnlManualOverrides,
                                  i,
                                );
                                setLocalState(() {});
                              },
                            ),
                            if (isAuto && overridden) ...[
                              const Padding(
                                padding: EdgeInsets.only(top: 2),
                                child: Text(
                                  'Manually Overridden',
                                  style: TextStyle(
                                    color: Colors.orangeAccent,
                                    fontSize: 9,
                                  ),
                                ),
                              ),
                              TextButton(
                                onPressed: () {
                                  pnlManualOverrides[fk] = false;
                                  _recalcDetailedPnlColumn(
                                    controllers,
                                    pnlManualOverrides,
                                    i,
                                  );
                                  setLocalState(() {});
                                },
                                style: TextButton.styleFrom(
                                  padding: EdgeInsets.zero,
                                  minimumSize: Size.zero,
                                  tapTargetSize:
                                      MaterialTapTargetSize.shrinkWrap,
                                ),
                                child: const Text(
                                  'Use calculated',
                                  style: TextStyle(
                                    fontSize: 9,
                                    color: Colors.lightBlueAccent,
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    );
                  }),
                ],
              ),
            ),
          ),
    ];
  }

  List<Widget> _manualMetricRows(
    String type,
    List<_ManualPeriodColumn> periodColumns,
    Map<String, TextEditingController> controllers,
    void Function(String fieldBase, int col, [String? cfKey]) onField,
  ) {
    final n = periodColumns.length;
    if (type == 'pnl') {
      return [];
    }
    if (type == 'bs') {
      const defs = [
        ('Current Assets', 'currentAssets'),
        ('Non-Current Assets', 'nonCurrentAssets'),
        ('Current Liabilities', 'currentLiabilities'),
        ('Long-Term Liabilities', 'longTermLiabilities'),
        ('Equity', 'equity'),
      ];
      return [
        for (final def in defs)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 108,
                    child: Text(
                      def.$1,
                      style: const TextStyle(color: Colors.white, fontSize: 11),
                    ),
                  ),
                  ...List.generate(n, (i) {
                    final key = '${def.$2}__$i';
                    return SizedBox(
                      width: 115,
                      child: TextFormField(
                        controller: controllers[key],
                        keyboardType: TextInputType.number,
                        style: const TextStyle(color: Colors.white, fontSize: 12),
                        decoration: InputDecoration(
                          prefixText: '\$ ',
                          prefixStyle: const TextStyle(
                            color: Colors.white70,
                            fontSize: 11,
                          ),
                          fillColor: Colors.white.withValues(alpha: 0.1),
                          filled: true,
                          isDense: true,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(6),
                          ),
                        ),
                        onChanged: (_) => onField(def.$2, i),
                      ),
                    );
                  }),
                ],
              ),
            ),
          ),
      ];
    }
    const cfDefs = [
      ('Net Operating Activities', 'operatingActivities'),
      ('Operating adjustments', 'operatingAdjustments'),
      ('Working Capital changes', 'workingCapitalChanges'),
      ('Net Investing Activities', 'investingActivities'),
      ('Asset purchases', 'assetPurchases'),
      ('Investment activities', 'investmentActivities'),
      ('Net Financing Activities', 'financingActivities'),
      ('Loan activities (Debt)', 'loanActivities'),
      ('Owner contributions', 'ownerContributions'),
      ('Distributions / Dividends', 'distributions'),
    ];
    return [
      for (final def in cfDefs)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 108,
                  child: Text(
                    def.$1,
                    style: const TextStyle(color: Colors.white, fontSize: 10),
                  ),
                ),
                ...List.generate(n, (i) {
                  final key = '${def.$2}__$i';
                  final ro = def.$2 == 'investingActivities' ||
                      def.$2 == 'financingActivities';
                  return SizedBox(
                    width: 115,
                    child: TextFormField(
                      controller: controllers[key],
                      readOnly: ro,
                      keyboardType: TextInputType.number,
                      style: const TextStyle(color: Colors.white, fontSize: 12),
                      decoration: InputDecoration(
                        prefixText: '\$ ',
                        prefixStyle: const TextStyle(
                          color: Colors.white70,
                          fontSize: 11,
                        ),
                        fillColor: Colors.white.withValues(alpha: 0.1),
                        filled: true,
                        isDense: true,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(6),
                        ),
                      ),
                      onChanged: (_) {
                        if (!ro) onField(def.$2, i, def.$2);
                      },
                    ),
                  );
                }),
              ],
            ),
          ),
        ),
    ];
  }

  Widget _buildManualMultiReviewBody(
    BuildContext context,
    String type,
    List<_ManualPeriodColumn> periodColumns,
    Map<String, TextEditingController> controllers,
    void Function(void Function()) setLocalState, {
    Map<String, bool>? pnlManualOverrides,
  }) {
    void onField(String fieldBase, int col, [String? cfKey]) {
      if (type == 'cf' && cfKey != null) {
        _recalcCashFlowColumnFull(controllers, col);
      }
      setLocalState(() {});
    }

    void addPeriod() {
      if (type == 'bs') return;
      if (periodColumns.length >= 8) return;
      final last = periodColumns.last;
      final nextY = last.year + 1;
      periodColumns.add(
        _ManualPeriodColumn(
          year: nextY,
          start: DateTime(nextY, 1, 1),
          end: DateTime(nextY, 12, 31),
        ),
      );
      final idx = periodColumns.length - 1;
      _seedManualColumnControllers(type, controllers, idx);
      if (type == 'pnl' && pnlManualOverrides != null) {
        _recalcDetailedPnlColumn(controllers, pnlManualOverrides, idx);
      } else if (type == 'cf') {
        _recalcCashFlowColumnFull(controllers, idx);
      }
      setLocalState(() {});
    }

    void removeLastPeriod() {
      if (type == 'bs') return;
      if (periodColumns.length <= 1) return;
      final idx = periodColumns.length - 1;
      _disposeControllersForColumn(type, controllers, idx);
      periodColumns.removeLast();
      setLocalState(() {});
    }

    Future<void> pickColDate(int col, bool isStart) async {
      final colData = periodColumns[col];
      final initial = isStart ? colData.start : colData.end;
      final picked = await showDatePicker(
        context: context,
        initialDate: initial,
        firstDate: DateTime(1960),
        lastDate: DateTime(DateTime.now().year + 10, 12, 31),
      );
      if (picked == null) return;
      setLocalState(() {
        if (isStart) {
          periodColumns[col].start = picked;
        } else {
          periodColumns[col].end = picked;
        }
      });
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (type == 'bs') ...[
          const Align(
            alignment: Alignment.centerLeft,
            child: Text(
              'Define snapshot columns (As Of, number of periods, frequency). '
              'Oldest period is first; the last column is your As Of snapshot.',
              style: TextStyle(color: Colors.white54, fontSize: 11, height: 1.3),
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 10,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              SizedBox(
                width: 130,
                child: DropdownButtonFormField<int>(
                  initialValue: _dialogBsPeriodCount,
                  dropdownColor: const Color(0xFF1a2942),
                  decoration: const InputDecoration(
                    labelText: 'Periods',
                    labelStyle: TextStyle(color: Colors.white54, fontSize: 11),
                    isDense: true,
                  ),
                  style: const TextStyle(color: Colors.white, fontSize: 13),
                  items: [
                    for (var n = 1; n <= PdfExportService.maxColumns; n++)
                      DropdownMenuItem(value: n, child: Text('$n')),
                  ],
                  onChanged: (v) {
                    if (v == null) return;
                    _syncBsManualPeriodColumns(
                      periodColumns: periodColumns,
                      controllers: controllers,
                      asOf: _dialogBsAsOf,
                      periodCount: v,
                      frequency: _dialogBsFreq,
                    );
                    setLocalState(() {});
                  },
                ),
              ),
              SizedBox(
                width: 200,
                child: DropdownButtonFormField<PdfViewType>(
                  initialValue: _dialogBsFreq,
                  dropdownColor: const Color(0xFF1a2942),
                  decoration: const InputDecoration(
                    labelText: 'Frequency',
                    labelStyle: TextStyle(color: Colors.white54, fontSize: 11),
                    isDense: true,
                  ),
                  style: const TextStyle(color: Colors.white, fontSize: 13),
                  items: const [
                    DropdownMenuItem(
                      value: PdfViewType.monthly,
                      child: Text('Monthly'),
                    ),
                    DropdownMenuItem(
                      value: PdfViewType.quarterly,
                      child: Text('Quarterly'),
                    ),
                    DropdownMenuItem(
                      value: PdfViewType.yearly,
                      child: Text('Yearly'),
                    ),
                  ],
                  onChanged: (v) {
                    if (v == null) return;
                    _syncBsManualPeriodColumns(
                      periodColumns: periodColumns,
                      controllers: controllers,
                      asOf: _dialogBsAsOf,
                      periodCount: _dialogBsPeriodCount,
                      frequency: v,
                    );
                    setLocalState(() {});
                  },
                ),
              ),
              OutlinedButton.icon(
                onPressed: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: _dialogBsAsOf,
                    firstDate: DateTime(1960),
                    lastDate: DateTime(DateTime.now().year + 10, 12, 31),
                  );
                  if (picked == null) return;
                  _syncBsManualPeriodColumns(
                    periodColumns: periodColumns,
                    controllers: controllers,
                    asOf: picked,
                    periodCount: _dialogBsPeriodCount,
                    frequency: _dialogBsFreq,
                  );
                  setLocalState(() {});
                },
                icon: const Icon(Icons.calendar_today, size: 16),
                label: Text(
                  'As of: ${_dateFmt.format(_dialogBsAsOf)}',
                  style: const TextStyle(fontSize: 12),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
        ],
        if (type == 'cf') ...[
          const Align(
            alignment: Alignment.centerLeft,
            child: Text(
              'Set statement metadata, then edit each period values below.',
              style: TextStyle(color: Colors.white54, fontSize: 11, height: 1.3),
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 10,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              SizedBox(
                width: 210,
                child: DropdownButtonFormField<String>(
                  initialValue: 'Cash Flow Statement',
                  dropdownColor: const Color(0xFF1a2942),
                  decoration: const InputDecoration(
                    labelText: 'Statement type',
                    labelStyle: TextStyle(color: Colors.white54, fontSize: 11),
                    isDense: true,
                  ),
                  style: const TextStyle(color: Colors.white, fontSize: 13),
                  items: const [
                    DropdownMenuItem(
                      value: 'Cash Flow Statement',
                      child: Text('Cash Flow Statement'),
                    ),
                  ],
                  onChanged: null,
                ),
              ),
              SizedBox(
                width: 120,
                child: DropdownButtonFormField<int>(
                  initialValue: _dialogCfPeriodCount,
                  dropdownColor: const Color(0xFF1a2942),
                  decoration: const InputDecoration(
                    labelText: 'Periods',
                    labelStyle: TextStyle(color: Colors.white54, fontSize: 11),
                    isDense: true,
                  ),
                  style: const TextStyle(color: Colors.white, fontSize: 13),
                  items: [for (var n = 1; n <= 8; n++) DropdownMenuItem(value: n, child: Text('$n'))],
                  onChanged: (v) {
                    if (v == null) return;
                    _syncCfManualPeriodColumns(
                      periodColumns: periodColumns,
                      controllers: controllers,
                      periodCount: v,
                      frequency: _dialogCfFreq,
                    );
                    setLocalState(() {});
                  },
                ),
              ),
              SizedBox(
                width: 180,
                child: DropdownButtonFormField<_ManualCfFrequency>(
                  initialValue: _dialogCfFreq,
                  dropdownColor: const Color(0xFF1a2942),
                  decoration: const InputDecoration(
                    labelText: 'Frequency',
                    labelStyle: TextStyle(color: Colors.white54, fontSize: 11),
                    isDense: true,
                  ),
                  style: const TextStyle(color: Colors.white, fontSize: 13),
                  items: const [
                    DropdownMenuItem(
                      value: _ManualCfFrequency.monthly,
                      child: Text('Monthly'),
                    ),
                    DropdownMenuItem(
                      value: _ManualCfFrequency.quarterly,
                      child: Text('Quarterly'),
                    ),
                    DropdownMenuItem(
                      value: _ManualCfFrequency.yearly,
                      child: Text('Yearly'),
                    ),
                    DropdownMenuItem(
                      value: _ManualCfFrequency.custom,
                      child: Text('Custom'),
                    ),
                  ],
                  onChanged: (v) {
                    if (v == null) return;
                    _syncCfManualPeriodColumns(
                      periodColumns: periodColumns,
                      controllers: controllers,
                      periodCount: _dialogCfPeriodCount,
                      frequency: v,
                    );
                    setLocalState(() {});
                  },
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
        ] else if (type != 'bs') ...[
          Row(
            children: [
              TextButton.icon(
                onPressed: addPeriod,
                icon: const Icon(Icons.add, color: Colors.white70, size: 18),
                label: const Text(
                  'Add period',
                  style: TextStyle(color: Colors.white70),
                ),
              ),
              if (periodColumns.length > 1)
                TextButton.icon(
                  onPressed: removeLastPeriod,
                  icon: const Icon(Icons.remove, color: Colors.white70, size: 18),
                  label: const Text(
                    'Remove last period',
                    style: TextStyle(color: Colors.white70),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
        ],
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(width: 108),
              ...List.generate(periodColumns.length, (i) {
                final col = periodColumns[i];
                return SizedBox(
                  width: 200,
                  child: Card(
                    color: Colors.white.withValues(alpha: 0.06),
                    child: Padding(
                      padding: const EdgeInsets.all(8),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            _statementTypeLabel(type),
                            style: const TextStyle(
                              color: Colors.white70,
                              fontSize: 11,
                            ),
                          ),
                          const SizedBox(height: 6),
                          if (type == 'bs' && col.displayLabel != null) ...[
                            Text(
                              col.displayLabel!,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Snapshot: ${_dateFmt.format(col.end)}',
                              style: const TextStyle(
                                color: Colors.white38,
                                fontSize: 10,
                              ),
                            ),
                          ] else ...[
                            DropdownButtonFormField<int>(
                              initialValue: col.year,
                              dropdownColor: const Color(0xFF1a2942),
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 13,
                              ),
                              decoration: const InputDecoration(
                                labelText: 'Year',
                                labelStyle: TextStyle(
                                  color: Colors.white54,
                                  fontSize: 11,
                                ),
                                isDense: true,
                              ),
                              items: [
                                for (final y in _yearPickerRange())
                                  DropdownMenuItem(value: y, child: Text('$y')),
                              ],
                              onChanged: (v) {
                                if (v == null) return;
                                setLocalState(() {
                                  periodColumns[i].year = v;
                                });
                              },
                            ),
                            const SizedBox(height: 6),
                            OutlinedButton(
                              onPressed: () => pickColDate(i, true),
                              child: Text(
                                'Start: ${_dateFmt.format(col.start)}',
                                style: const TextStyle(
                                  fontSize: 11,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                            const SizedBox(height: 4),
                            OutlinedButton(
                              onPressed: () => pickColDate(i, false),
                              child: Text(
                                'End: ${_dateFmt.format(col.end)}',
                                style: const TextStyle(
                                  fontSize: 11,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                );
              }),
            ],
          ),
        ),
        const Divider(color: Colors.white24),
        if (type == 'pnl' && pnlManualOverrides != null)
          ..._buildManualPnlDetailRows(
            periodColumns,
            controllers,
            pnlManualOverrides,
            setLocalState,
          )
        else
          ..._manualMetricRows(type, periodColumns, controllers, onField),
      ],
    );
  }

  Future<bool> _showReviewDialog(
    String type, {
    required String documentBaseName,
  }) async {
    final data = extractedData.value;
    if (data == null) return false;

    final isManual = _isZeroTemplate(type);
    final controllers = <String, TextEditingController>{};
    var periodColumns = <_ManualPeriodColumn>[];
    if (isManual) {
      if (type == 'bs') {
        _dialogBsAsOf = _uploadBalanceSheetAsOf ?? DateTime.now();
        _dialogBsPeriodCount = 1;
        _dialogBsFreq = PdfViewType.yearly;
      } else if (type == 'cf') {
        _dialogCfPeriodCount = 1;
        _dialogCfFreq = _ManualCfFrequency.yearly;
      }
      periodColumns = _initialManualPeriodColumns(type);
    }
    final pnlManualOverrides =
        (isManual && type == 'pnl') ? <String, bool>{} : null;

    if (isManual) {
      for (var i = 0; i < periodColumns.length; i++) {
        _seedManualColumnControllers(type, controllers, i);
        if (type == 'pnl' && pnlManualOverrides != null) {
          _recalcDetailedPnlColumn(controllers, pnlManualOverrides, i);
        } else if (type == 'cf') {
          _recalcCashFlowColumnFull(controllers, i);
        }
      }
    } else if (type == 'pnl' && data is ProfitAndLossTemplate) {
      controllers['revenue'] = TextEditingController(
        text: _formatMoneyInput(data.revenue),
      );
      controllers['cogs'] = TextEditingController(
        text: _formatMoneyInput(data.cogs),
      );
      controllers['operatingExpenses'] = TextEditingController(
        text: _formatMoneyInput(data.operatingExpenses),
      );
      controllers['grossProfit'] = TextEditingController(
        text: _formatMoneyInput(data.grossProfit),
      );
      controllers['netIncome'] = TextEditingController(
        text: _formatMoneyInput(data.netIncome),
      );
    } else if (type == 'bs' && data is BalanceSheetTemplate) {
      controllers['currentAssets'] = TextEditingController(
        text: _formatMoneyInput(data.currentAssets),
      );
      controllers['nonCurrentAssets'] = TextEditingController(
        text: _formatMoneyInput(data.nonCurrentAssets),
      );
      controllers['currentLiabilities'] = TextEditingController(
        text: _formatMoneyInput(data.currentLiabilities),
      );
      controllers['longTermLiabilities'] = TextEditingController(
        text: _formatMoneyInput(data.longTermLiabilities),
      );
      controllers['equity'] = TextEditingController(
        text: _formatMoneyInput(data.equity),
      );
    } else if (type == 'cf' && data is CashFlowTemplate) {
      controllers['operatingActivities'] = TextEditingController(
        text: _formatMoneyInput(data.operatingActivities),
      );
      controllers['operatingAdjustments'] = TextEditingController(
        text: _formatMoneyInput(data.operatingAdjustments),
      );
      controllers['workingCapitalChanges'] = TextEditingController(
        text: _formatMoneyInput(data.workingCapitalChanges),
      );
      controllers['investingActivities'] = TextEditingController(
        text: _formatMoneyInput(data.investingActivities),
      );
      controllers['assetPurchases'] = TextEditingController(
        text: _formatMoneyInput(data.assetPurchases),
      );
      controllers['investmentActivities'] = TextEditingController(
        text: _formatMoneyInput(data.investmentActivities),
      );
      controllers['financingActivities'] = TextEditingController(
        text: _formatMoneyInput(data.financingActivities),
      );
      controllers['loanActivities'] = TextEditingController(
        text: _formatMoneyInput(data.loanActivities),
      );
      controllers['ownerContributions'] = TextEditingController(
        text: _formatMoneyInput(data.ownerContributions),
      );
      controllers['distributions'] = TextEditingController(
        text: _formatMoneyInput(data.distributions),
      );
    }

    final confirmed =
        await Get.dialog<bool>(
      StatefulBuilder(
        builder: (context, setLocalState) {
          void recalcCashFlow(String fieldKey) {
            if (type != 'cf') return;
            final assetPurchases =
                _parseMoney(controllers['assetPurchases']?.text ?? '0');
            final investmentActivities =
                _parseMoney(controllers['investmentActivities']?.text ?? '0');
            final loanActivities =
                _parseMoney(controllers['loanActivities']?.text ?? '0');
            final ownerContributions =
                _parseMoney(controllers['ownerContributions']?.text ?? '0');
            final distributions =
                _parseMoney(controllers['distributions']?.text ?? '0');

            if (fieldKey == 'assetPurchases' ||
                fieldKey == 'investmentActivities') {
              final investing = (-assetPurchases.abs()) + investmentActivities;
              controllers['investingActivities']?.text =
                  _formatMoneyInput(investing);
            }
            if (fieldKey == 'loanActivities' ||
                fieldKey == 'ownerContributions' ||
                fieldKey == 'distributions') {
              final financing =
                  loanActivities + ownerContributions - distributions.abs();
              controllers['financingActivities']?.text =
                  _formatMoneyInput(financing);
            }
          }

          return AlertDialog(
            backgroundColor: const Color(0xFF0A192F),
            title: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isManual ? 'Manual Review Template' : 'Review Extracted Data',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                if (isManual)
                  const Padding(
                    padding: EdgeInsets.only(top: 4),
                    child: Text(
                      'AI could not auto-read this. Please enter values below.',
                      style: TextStyle(color: Colors.orangeAccent, fontSize: 12),
                    ),
                  ),
              ],
            ),
            content: SizedBox(
              width: isManual
                  ? MediaQuery.sizeOf(context).width.clamp(320, 920)
                  : 450,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (isManual)
                      _buildManualMultiReviewBody(
                        context,
                        type,
                        periodColumns,
                        controllers,
                        setLocalState,
                        pnlManualOverrides: pnlManualOverrides,
                      ),
                    if (!isManual)
                    ..._buildReviewFields(
                      type,
                      controllers,
                      onFieldChanged: (fieldKey) {
                        recalcCashFlow(fieldKey);
                        setLocalState(() {});
                      },
                    ),
                    const SizedBox(height: 20),
                    const Divider(color: Colors.white24),
                    const SizedBox(height: 10),
                    if (isManual)
                    Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.05),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            AppText(
                              type == 'pnl'
                                  ? 'Net income by period'
                                  : _summaryLabel(type),
                              fontWeight: FontWeight.bold,
                              color: Colors.white70,
                            ),
                            const SizedBox(height: 8),
                            for (var i = 0; i < periodColumns.length; i++)
                              Padding(
                                padding: const EdgeInsets.symmetric(vertical: 2),
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Expanded(
                                      child: Text(
                                        type == 'bs' &&
                                                periodColumns[i].displayLabel !=
                                                    null
                                            ? periodColumns[i].displayLabel!
                                            : '${periodColumns[i].year} (${_dateFmt.format(periodColumns[i].start)}–${_dateFmt.format(periodColumns[i].end)})',
                                        style: const TextStyle(
                                          color: Colors.white54,
                                          fontSize: 11,
                                        ),
                                      ),
                                    ),
                                    AppText(
                                      _formatMoneyDisplay(
                                        type == 'pnl'
                                            ? _netIncomeForPnlColumn(
                                                controllers,
                                                i,
                                              )
                                            : type == 'bs'
                                            ? _summaryBsColumn(controllers, i)
                                            : _summaryCfColumn(controllers, i),
                                      ),
                                      fontWeight: FontWeight.w800,
                                      color:
                                          (type == 'pnl'
                                                  ? _netIncomeForPnlColumn(
                                                      controllers,
                                                      i,
                                                    )
                                                  : type == 'bs'
                                                  ? _summaryBsColumn(
                                                      controllers,
                                                      i,
                                                    )
                                                  : _summaryCfColumn(
                                                      controllers,
                                                      i,
                                                    )) >=
                                              0
                                          ? const Color(0xFF19C37D)
                                          : const Color(0xFFE57373),
                                    ),
                                  ],
                                ),
                              ),
                          ],
                        ),
                      )
                    else
                      Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.05),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          AppText(
                            _summaryLabel(type),
                            fontWeight: FontWeight.bold,
                            color: Colors.white70,
                          ),
                          AppText(
                              _formatMoneyDisplay(
                                _summaryValue(type, controllers),
                              ),
                            fontWeight: FontWeight.w900,
                            color: _summaryValue(type, controllers) >= 0
                                ? const Color(0xFF19C37D)
                                : const Color(0xFFE57373),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () =>
                    Navigator.of(context, rootNavigator: true).pop(false),
                child: const Text(
                  'Close',
                  style: TextStyle(color: Colors.white70),
                ),
              ),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFEAB308),
                  foregroundColor: Colors.black,
                ),
                onPressed: () {
                  if (isManual) {
                    _multiPeriodExtracted = [];
                    for (var i = 0; i < periodColumns.length; i++) {
                      final col = periodColumns[i];
                      final label =
                          '$documentBaseName (${col.year}: ${_dateFmt.format(col.start)}–${_dateFmt.format(col.end)})';
                      _multiPeriodExtracted!.add(
                        _MultiPeriodSaveEntry(
                          type: type,
                          displayName: label,
                          docDate: col.end,
                          template: _templateFromControllersColumn(
                            type,
                            controllers,
                            i,
                          ),
                        ),
                      );
                    }
                  } else {
                  _applyControllersToExtractedData(type, controllers);
                  }
                  Navigator.of(context, rootNavigator: true).pop(true);
                },
                child: const Text(
                  'Confirm & Save',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
              ),
            ],
          );
        },
      ),
      barrierDismissible: false,
    ) ??
            false;

    for (final c in controllers.values) {
      c.dispose();
    }
    return confirmed;
  }

  bool _isZeroTemplate(String type) {
    final data = extractedData.value;
    if (type == 'pnl' && data is ProfitAndLossTemplate) {
      return data.revenue == 0 &&
          data.cogs == 0 &&
          data.operatingExpenses == 0 &&
          data.netIncome == 0;
    }
    if (type == 'bs' && data is BalanceSheetTemplate) {
      return data.currentAssets == 0 &&
          data.nonCurrentAssets == 0 &&
          data.currentLiabilities == 0 &&
          data.longTermLiabilities == 0 &&
          data.equity == 0;
    }
    if (type == 'cf' && data is CashFlowTemplate) {
      return data.operatingActivities == 0 &&
          data.investingActivities == 0 &&
          data.financingActivities == 0;
    }
    return false;
  }

  String _summaryLabel(String type) {
    if (type == 'pnl') return 'Projected Net Income';
    if (type == 'bs') return 'Balance Difference';
    return 'Net Cash Change';
  }

  double _summaryValue(
    String type,
    Map<String, TextEditingController> controllers,
  ) {
    double v(String key) => _parseMoney(controllers[key]?.text ?? '0');
    if (type == 'pnl') {
      return (v('revenue') - v('cogs')) - v('operatingExpenses');
    }
    if (type == 'bs') {
      return (v('currentAssets') + v('nonCurrentAssets')) -
          (v('currentLiabilities') + v('longTermLiabilities') + v('equity'));
    }
    final investingByParts =
        (-v('assetPurchases').abs()) + v('investmentActivities');
    final financingByParts =
        v('loanActivities') + v('ownerContributions') - v('distributions').abs();
    final hasInvestingBreakdown =
        v('assetPurchases') != 0 ||
        v('investmentActivities') != 0;
    final hasFinancingBreakdown =
        v('loanActivities') != 0 ||
        v('ownerContributions') != 0 ||
        v('distributions') != 0;
    final operating = v('operatingActivities');
    final investing = hasInvestingBreakdown
        ? investingByParts
        : v('investingActivities');
    final financing = hasFinancingBreakdown
        ? financingByParts
        : v('financingActivities');
    return operating + investing + financing;
  }

  List<Widget> _buildReviewFields(
    String type,
    Map<String, TextEditingController> controllers,
    {ValueChanged<String>? onFieldChanged}
  ) {
    final fields = <Widget>[];
    if (type == 'pnl') {
      fields.add(
        _buildEditRow(
          'Revenue',
          controllers['revenue'],
          onChanged: () => onFieldChanged?.call('revenue'),
        ),
      );
      fields.add(
        _buildEditRow(
          'COGS',
          controllers['cogs'],
          onChanged: () => onFieldChanged?.call('cogs'),
        ),
      );
      fields.add(
        _buildEditRow(
          'Operating Expenses',
          controllers['operatingExpenses'],
          onChanged: () => onFieldChanged?.call('operatingExpenses'),
        ),
      );
      fields.add(
        _buildEditRow(
          'Gross Profit',
          controllers['grossProfit'],
          onChanged: () => onFieldChanged?.call('grossProfit'),
        ),
      );
      fields.add(
        _buildEditRow(
          'Net Income',
          controllers['netIncome'],
          onChanged: () => onFieldChanged?.call('netIncome'),
        ),
      );
    } else if (type == 'bs') {
      fields.add(
        _buildEditRow(
          'Current Assets',
          controllers['currentAssets'],
          onChanged: () => onFieldChanged?.call('currentAssets'),
        ),
      );
      fields.add(
        _buildEditRow(
          'Non-Current Assets',
          controllers['nonCurrentAssets'],
          onChanged: () => onFieldChanged?.call('nonCurrentAssets'),
        ),
      );
      fields.add(
        _buildEditRow(
          'Current Liabilities',
          controllers['currentLiabilities'],
          onChanged: () => onFieldChanged?.call('currentLiabilities'),
        ),
      );
      fields.add(
        _buildEditRow(
          'Long-Term Liabilities',
          controllers['longTermLiabilities'],
          onChanged: () => onFieldChanged?.call('longTermLiabilities'),
        ),
      );
      fields.add(
        _buildEditRow(
          'Equity',
          controllers['equity'],
          onChanged: () => onFieldChanged?.call('equity'),
        ),
      );
    } else if (type == 'cf') {
      fields.add(
        _buildEditRow(
          'Net Operating Activities',
          controllers['operatingActivities'],
          onChanged: () => onFieldChanged?.call('operatingActivities'),
        ),
      );
      fields.add(
        _buildEditRow(
          'Operating adjustments (e.g. Depreciation)',
          controllers['operatingAdjustments'],
          onChanged: () => onFieldChanged?.call('operatingAdjustments'),
        ),
      );
      fields.add(
        _buildEditRow(
          'Working Capital changes',
          controllers['workingCapitalChanges'],
          onChanged: () => onFieldChanged?.call('workingCapitalChanges'),
        ),
      );
      fields.add(const Divider(color: Colors.white24));
      fields.add(
        _buildEditRow(
          'Net Investing Activities',
          controllers['investingActivities'],
          onChanged: () => onFieldChanged?.call('investingActivities'),
        ),
      );
      fields.add(
        _buildEditRow(
          'Asset purchases',
          controllers['assetPurchases'],
          onChanged: () => onFieldChanged?.call('assetPurchases'),
        ),
      );
      fields.add(
        _buildEditRow(
          'Investment activities',
          controllers['investmentActivities'],
          onChanged: () => onFieldChanged?.call('investmentActivities'),
        ),
      );
      fields.add(const Divider(color: Colors.white24));
      fields.add(
        _buildEditRow(
          'Net Financing Activities',
          controllers['financingActivities'],
          onChanged: () => onFieldChanged?.call('financingActivities'),
        ),
      );
      fields.add(
        _buildEditRow(
          'Loan activities (Debt)',
          controllers['loanActivities'],
          onChanged: () => onFieldChanged?.call('loanActivities'),
        ),
      );
      fields.add(
        _buildEditRow(
          'Owner contributions',
          controllers['ownerContributions'],
          onChanged: () => onFieldChanged?.call('ownerContributions'),
        ),
      );
      fields.add(
        _buildEditRow(
          'Distributions / Dividends',
          controllers['distributions'],
          onChanged: () => onFieldChanged?.call('distributions'),
        ),
      );
    }
    return fields;
  }

  Widget _buildEditRow(
    String label,
    TextEditingController? controller, {
    bool readOnly = false,
    VoidCallback? onChanged,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(color: Colors.white, fontSize: 12)),
          const SizedBox(height: 4),
          TextFormField(
            controller: controller,
            readOnly: readOnly,
            keyboardType: TextInputType.number,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              prefixText: '\$ ',
              prefixStyle: const TextStyle(color: Colors.white70),
              fillColor: Colors.white.withValues(alpha: 0.1),
              filled: true,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
            ),
            onChanged: (_) => onChanged?.call(),
          ),
        ],
      ),
    );
  }

  void _applyControllersToExtractedData(
    String type,
    Map<String, TextEditingController> controllers,
  ) {
    double v(String key) => _parseMoney(controllers[key]?.text ?? '0');
    if (type == 'pnl') {
      final revenue = v('revenue');
      final cogs = v('cogs');
      final opex = v('operatingExpenses');
      final gross = revenue - cogs;
      final net = gross - opex;
      extractedData.value = ProfitAndLossTemplate(
        revenue: revenue,
        cogs: cogs,
        grossProfit: gross,
        operatingExpenses: opex,
        netIncome: net,
      );
    } else if (type == 'bs') {
      final ca = v('currentAssets');
      final nca = v('nonCurrentAssets');
      final cl = v('currentLiabilities');
      final ltl = v('longTermLiabilities');
      final eq = v('equity');
      extractedData.value = BalanceSheetTemplate(
        currentAssets: ca,
        nonCurrentAssets: nca,
        currentLiabilities: cl,
        longTermLiabilities: ltl,
        equity: eq,
      );
    } else {
      final investingByParts =
          (-v('assetPurchases').abs()) + v('investmentActivities');
      final financingByParts =
          v('loanActivities') + v('ownerContributions') - v('distributions').abs();
      final hasInvestingBreakdown =
          v('assetPurchases') != 0 || v('investmentActivities') != 0;
      final hasFinancingBreakdown =
          v('loanActivities') != 0 ||
          v('ownerContributions') != 0 ||
          v('distributions') != 0;

      extractedData.value = CashFlowTemplate(
        operatingActivities: v('operatingActivities'),
        operatingAdjustments: v('operatingAdjustments'),
        workingCapitalChanges: v('workingCapitalChanges'),
        investingActivities: hasInvestingBreakdown
            ? investingByParts
            : v('investingActivities'),
        assetPurchases: v('assetPurchases'),
        investmentActivities: v('investmentActivities'),
        financingActivities: hasFinancingBreakdown
            ? financingByParts
            : v('financingActivities'),
        loanActivities: v('loanActivities'),
        ownerContributions: v('ownerContributions'),
        distributions: v('distributions'),
      );
    }
  }

  double _parseMoney(String raw) {
    final cleaned = raw.replaceAll(RegExp(r'[^0-9.\-]'), '');
    if (cleaned.isEmpty || cleaned == '-' || cleaned == '.') return 0;
    return double.tryParse(cleaned) ?? 0;
  }

  String _formatMoneyInput(double value) => _moneyFmt.format(value);

  String _formatMoneyDisplay(double value) => '\$${_moneyFmt.format(value)}';

  Future<void> _saveExtractedData(
    int userId,
    int orgId,
    String name,
    DateTime docDate,
    String type, {
    dynamic templateOverride,
  }) async {
    final data = templateOverride ?? extractedData.value;
    if (data == null) return;

    final transactions = <Map<String, dynamic>>[];
    if (type == 'pnl' && data is ProfitAndLossTemplate) {
      transactions.add({'title': '[Revenue] $name', 'amount': data.revenue});
      transactions.add({'title': '[COGS] $name', 'amount': -data.cogs.abs()});
      transactions.add({
        'title': '[OpEx] $name',
        'amount': -data.operatingExpenses.abs(),
      });
    } else if (type == 'bs' && data is BalanceSheetTemplate) {
      transactions.add({
        'title': '[Asset:Current] $name',
        'amount': data.currentAssets,
      });
      transactions.add({
        'title': '[Asset:Non-Current] $name',
        'amount': data.nonCurrentAssets,
      });
      transactions.add({
        'title': '[Liab:Current] $name',
        'amount': -data.currentLiabilities.abs(),
      });
      transactions.add({
        'title': '[Liab:Long-Term] $name',
        'amount': -data.longTermLiabilities.abs(),
      });
      transactions.add({
        'title': '[Equity] $name',
        'amount': data.equity,
      });
    } else if (type == 'cf' && data is CashFlowTemplate) {
      // ChatGPT-aligned strict approach:
      // - Use section totals as authoritative for dashboard/KPIs
      // - Recompute investing/financing totals from details when provided
      // - Avoid double-counting by saving only section totals
      final hasInvestingBreakdown =
          data.assetPurchases != 0 || data.investmentActivities != 0;
      final hasFinancingBreakdown =
          data.loanActivities != 0 ||
          data.ownerContributions != 0 ||
          data.distributions != 0;

      final investingTotal = hasInvestingBreakdown
          ? (-data.assetPurchases.abs()) + data.investmentActivities
          : data.investingActivities;
      final financingTotal = hasFinancingBreakdown
          ? data.loanActivities +
                data.ownerContributions.abs() -
                data.distributions.abs()
          : data.financingActivities;

      transactions.add({
        'title': '[CF:Operating] $name',
        'amount': data.operatingActivities,
      });
      transactions.add({
        'title': '[CF:Investing] $name',
        'amount': investingTotal,
      });
      transactions.add({
        'title': '[CF:Financing] $name',
        'amount': financingTotal,
      });
    }

    for (final tx in transactions) {
      await supabase.from(SupabaseTable.transaction).insert({
        'user_id': userId,
        'org_id': orgId,
        'title': tx['title'],
        'amount': tx['amount'],
        'type': 'Business',
        'date_time': docDate.toIso8601String(),
      });
    }
  }

  /// Deletes [doc] from storage and from the database.
  Future<void> deleteDocument(UserDocument doc) async {
    try {
      isLoading.value = true;

      // 1. Delete from storage (best-effort)
      await deleteFileFromSupabase(doc.fileUrl);

      // 2. Delete from DB
      await supabase
          .from(SupabaseTable.userDocuments)
          .delete()
          .eq('id', doc.id);

      // 3. Remove from local list
      documents.remove(doc);
      Get.snackbar('Deleted', '${doc.name} has been removed');
    } catch (e, st) {
      log('TaxDocumentController.deleteDocument error: $e\n$st');
      Get.snackbar('Error', 'Failed to delete document');
    } finally {
      isLoading.value = false;
    }
  }

  // ── Pending review recovery (called on app load / org switch) ───────────────

  Future<void> checkPendingStatementReview() async {
    try {
      final userId = authUser?.id;
      final orgId = getCurrentOrganization?.id;
      if (userId == null || orgId == null) return;

      final results = await supabase
          .from(SupabaseTable.statementImports)
          .select('id, status')
          .eq('user_id', userId)
          .eq('org_id', orgId)
          .filter('status', 'in', '("processing","completed")')
          .order('created_at', ascending: false)
          .limit(1);

      final rows = results as List;
      if (rows.isEmpty) return;

      final importId = rows[0]['id'] as int;
      final status = rows[0]['status'] as String;

      if (status == 'completed') {
        final pending = (await supabase
            .from(SupabaseTable.pendingTransactions)
            .select('id')
            .eq('import_id', importId)
            .limit(1)) as List;
        if (pending.isEmpty) return;
      }

      await Future.delayed(const Duration(milliseconds: 1200));
      // ignore: use_build_context_synchronously
      showStatementReviewDialog(importId: importId);
    } catch (e) {
      log('checkPendingStatementReview error: $e');
    }
  }

  // ── Statement Import Pipeline ─────────────────────────────────────────────

  Future<int?> _triggerStatementImport({
    required int documentId,
    required String fileUrl,
    required String mimeType,
    required XFile fileToUpload,
  }) async {
    final userId = authUser?.id;
    final orgId = getCurrentOrganization?.id;
    log('_triggerStatementImport: userId=$userId orgId=$orgId fileUrl=$fileUrl');
    if (userId == null || orgId == null) {
      log('_triggerStatementImport: aborting — userId or orgId is null');
      return null;
    }

    // Pre-extract text from text-based PDFs (free, avoids OCR cost).
    // For scanned PDFs, render pages to PNG and upload so GPT-4o Vision can read them.
    String extractedText = '';
    bool isScanned = false;
    String effectiveFileUrl = fileUrl;
    String effectiveMimeType = mimeType;

    if (mimeType == 'application/pdf') {
      final bytes = await fileToUpload.readAsBytes();
      extractedText = AIExtractionService.extractPdfText(bytes.toList());
      isScanned = extractedText.length < 50;

      if (isScanned) {
        final pngFile = await _rasterizePdfToXFile(bytes, fileToUpload.name);
        if (pngFile != null) {
          final pngUrl = await uploadFileToSupabaseStorage(
            file: pngFile,
            bucketName: SupabaseStorageBucket.documents,
            contentType: 'image/png',
          );
          if (pngUrl != null && pngUrl.isNotEmpty) {
            effectiveFileUrl = pngUrl;
            effectiveMimeType = 'image/png';
            log('_triggerStatementImport: scanned PDF converted to PNG');
          }
        }
      }
    } else {
      isScanned = true;
    }

    // Extract storage path from effective URL
    final storagePath = effectiveFileUrl.contains('/documents/')
        ? effectiveFileUrl.split('/documents/').last
        : '';
    log('_triggerStatementImport: storagePath=$storagePath mime=$effectiveMimeType');
    if (storagePath.isEmpty) {
      log('_triggerStatementImport: aborting — could not extract storagePath from $effectiveFileUrl');
      return null;
    }

    try {
      final result = await supabase
          .from(SupabaseTable.statementImports)
          .insert({
            'user_id': userId,
            'org_id': orgId,
            'document_id': documentId,
            'document_path': storagePath,
            'mime_type': effectiveMimeType,
            'is_scanned': isScanned,
            'extracted_text': isScanned ? null : extractedText,
            'status': 'processing',
          })
          .select('id')
          .single();
      return result['id'] as int;
    } catch (e, st) {
      log('StatementImport trigger error: $e\n$st');
      showSnackBar('Statement import failed: $e', isError: true);
      return null;
    }
  }

  /// Renders all pages of a scanned PDF to a single combined PNG image.
  Future<XFile?> _rasterizePdfToXFile(List<int> pdfBytes, String originalName) async {
    try {
      final uint8Bytes = Uint8List.fromList(pdfBytes);
      final pageImages = <Uint8List>[];

      await for (final page in Printing.raster(uint8Bytes, dpi: 150)) {
        pageImages.add(await page.toPng());
      }

      if (pageImages.isEmpty) return null;

      final combined = pageImages.length == 1
          ? pageImages[0]
          : await _combinePngImages(pageImages);

      final baseName = originalName.replaceAll(RegExp(r'\.pdf$', caseSensitive: false), '');
      return XFile.fromData(combined, name: '${baseName}_scan.png', mimeType: 'image/png');
    } catch (e) {
      log('PDF rasterization error: $e');
      return null;
    }
  }

  /// Stacks multiple PNG images vertically into one PNG.
  Future<Uint8List> _combinePngImages(List<Uint8List> pngImages) async {
    final images = await Future.wait(
      pngImages.map((bytes) async {
        final codec = await ui.instantiateImageCodec(bytes);
        final frame = await codec.getNextFrame();
        return frame.image;
      }),
    );

    final maxWidth = images.map((img) => img.width).reduce(math.max);
    final totalHeight = images.fold<int>(0, (sum, img) => sum + img.height);

    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);

    double offsetY = 0;
    for (final image in images) {
      canvas.drawImage(image, Offset(0, offsetY), Paint());
      offsetY += image.height;
    }

    final picture = recorder.endRecording();
    final combined = await picture.toImage(maxWidth, totalHeight);
    final byteData = await combined.toByteData(format: ui.ImageByteFormat.png);
    return byteData!.buffer.asUint8List();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  String _guessMime(String fileName) {
    final ext = fileName.split('.').last.toLowerCase();
    switch (ext) {
      case 'pdf':
        return 'application/pdf';
      case 'png':
        return 'image/png';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'doc':
        return 'application/msword';
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      default:
        return 'application/octet-stream';
    }
  }

  /// Icon to show in the list based on mime type.
  static IconData iconForMime(String? mime) {
    if (mime == null) return Icons.insert_drive_file;
    if (mime.startsWith('image/')) return Icons.image;
    if (mime == 'application/pdf') return Icons.picture_as_pdf;
    if (mime.contains('word')) return Icons.description;
    if (mime.contains('spreadsheet') ||
        mime.contains('excel') ||
        mime.contains('csv')) {
      return Icons.table_chart;
    }
    if (mime.contains('presentation') || mime.contains('powerpoint')) {
      return Icons.slideshow;
    }
    if (mime.contains('zip') || mime.contains('compressed')) {
      return Icons.folder_zip;
    }
    if (mime.startsWith('text/')) return Icons.text_snippet;
    return Icons.insert_drive_file;
  }
}
