import 'package:booksmart/models/transaction_model.dart';
import 'package:booksmart/supabase/tables.dart';
import 'package:booksmart/utils/supabase.dart';

/// BookSmart P&L buckets for a date range, using the same classification
/// rules as [FinancialReportController] (income vs total expenses).
class PlBooksmartBuckets {
  const PlBooksmartBuckets({required this.income, required this.expense});

  final double income;
  final double expense;
}

String _sqlDateLocal(DateTime d) {
  final x = DateTime(d.year, d.month, d.day);
  final mm = x.month.toString().padLeft(2, '0');
  final dd = x.day.toString().padLeft(2, '0');
  return '${x.year}-$mm-$dd';
}

DateTime _nextDay(DateTime d) => DateTime(d.year, d.month, d.day + 1);

/// Duplicated from [FinancialReportController] for consistent bucketing.
const _expenseKeywords = <String>[
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

bool _matchesExpenseKeyword(String title) {
  for (final kw in _expenseKeywords) {
    if (title.contains(kw)) return true;
  }
  return false;
}

PlBooksmartBuckets plBooksmartBucketsFromTransactions(
  List<TransactionModel> txs,
) {
  double inc = 0, exp = 0;
  for (final tx in txs) {
    final title = tx.title.toLowerCase();
    final amt = tx.amount.abs();
    final isAL = title.contains('[asset') ||
        title.contains('[liab') ||
        title.contains('equity') ||
        title.contains('[cf:');

    if (title.startsWith('[revenue]')) {
      inc += amt;
    } else if (title.startsWith('[cogs]') || title.contains('cost of goods')) {
      exp += amt;
    } else if (title.startsWith('[opex]')) {
      exp += amt;
    } else if (isAL) {
      continue;
    } else if (_matchesExpenseKeyword(title)) {
      exp += amt;
    } else if (title.contains('credit card payment') ||
        title.contains('transfer to') ||
        title.contains('autopay')) {
      continue;
    } else if (tx.amount > 0) {
      inc += amt;
    } else {
      exp += amt;
    }
  }
  return PlBooksmartBuckets(income: inc, expense: exp);
}

/// Loads transactions for [orgId] in \[rangeStart, rangeEnd\] (calendar inclusive)
/// and returns income / expense totals without changing dashboard state.
Future<PlBooksmartBuckets> fetchBooksmartPlBucketsForRange({
  required int orgId,
  required DateTime rangeStart,
  required DateTime rangeEnd,
}) async {
  var start = DateTime(rangeStart.year, rangeStart.month, rangeStart.day);
  var end = DateTime(rangeEnd.year, rangeEnd.month, rangeEnd.day);
  if (start.isAfter(end)) {
    final t = start;
    start = end;
    end = t;
  }

  final res = await supabase
      .from(SupabaseTable.transaction)
      .select()
      .eq('org_id', orgId)
      .gte('date_time', _sqlDateLocal(start))
      .lt('date_time', _sqlDateLocal(_nextDay(end)));

  final txs = (res as List)
      .map((e) => TransactionModel.fromJson(e))
      .toList();
  return plBooksmartBucketsFromTransactions(txs);
}
