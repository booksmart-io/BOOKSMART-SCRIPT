import 'package:booksmart/constant/data.dart';
import 'package:booksmart/models/cash_flow_manual_entry_model.dart';
import 'package:booksmart/models/transaction_model.dart';
import 'package:booksmart/supabase/tables.dart';
import 'package:booksmart/utils/supabase.dart';

class CashFlowManualEntryService {
  Future<void> saveManualEntry({
    required int userId,
    required int orgId,
    required CashFlowManualEntryModel entry,
  }) async {
    final String titleTag =
        (entry.isNonCash && entry.section == CashFlowManualSection.operating)
        ? '[CF:Adjustments]'
        : entry.sectionTag;

    final tx = TransactionModel(
      id: -1,
      title: titleTag,
      amount: entry.amount,
      category: null,
      subcategory: null,
      type: businessTransactionType,
      deductible: true,
      description: entry.notes.trim(),
      dateTime: entry.date,
      userId: userId,
      orgId: orgId,
    );
    final payload = tx.toJson()..remove('id');
    await supabase.from(SupabaseTable.transaction).insert(payload);
  }

  CashFlowManualSection suggestSection(String categoryOrNotes) {
    final text = categoryOrNotes.toLowerCase();
    if (text.contains('capex') ||
        text.contains('asset purchase') ||
        text.contains('equipment') ||
        text.contains('investment')) {
      return CashFlowManualSection.investing;
    }
    if (text.contains('loan') ||
        text.contains('debt') ||
        text.contains('contribution') ||
        text.contains('draw') ||
        text.contains('dividend') ||
        text.contains('equity')) {
      return CashFlowManualSection.financing;
    }
    if (text.contains('depreciation') ||
        text.contains('amortization') ||
        text.contains('write-off') ||
        text.contains('impairment')) {
      return CashFlowManualSection.operating;
    }
    return CashFlowManualSection.other;
  }
}
