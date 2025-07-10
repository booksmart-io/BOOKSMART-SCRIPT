// ignore_for_file: unused_local_variable

import 'package:booksmart/models/transaction_model.dart';

/// Calendar date only (local components of [d]).
DateTime bsDateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

/// Cash-like opening balance: sum of signed amounts for txs strictly before [day] (midnight).
double bsOpeningCashBeforeDay(List<TransactionModel> all, DateTime day) {
  final start = bsDateOnly(day);
  double sum = 0;
  for (final tx in all) {
    final td = bsDateOnly(tx.dateTime);
    if (!td.isBefore(start)) continue;
    final t = tx.title.toLowerCase();
    if (t.contains('cash') ||
        t.contains('bank') ||
        t.contains('checking') ||
        t.contains('savings')) {
      sum += tx.amount;
    }
  }
  return sum;
}

/// Transactions through end of [throughDay] inclusive.
List<TransactionModel> bsTransactionsThrough(
  List<TransactionModel> all,
  DateTime throughDay,
) {
  final end = bsDateOnly(throughDay);
  return all.where((t) => !bsDateOnly(t.dateTime).isAfter(end)).toList();
}

const List<String> _bsExpenseKeywords = <String>[
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

bool _bsMatchesExpenseKeyword(String title) {
  for (final kw in _bsExpenseKeywords) {
    if (title.contains(kw)) return true;
  }
  return false;
}

/// Single source of truth for Balance Sheet line items from a transaction list
/// (same rules as [FinancialReportController] aggregation).
class BalanceSheetLineMetrics {
  const BalanceSheetLineMetrics({
    required this.totalAssets,
    required this.totalLiabilities,
    required this.currentAssetsBreakdown,
    required this.fixedAssetsBreakdown,
    required this.otherAssetsBreakdown,
    required this.currentLiabilitiesBreakdown,
    required this.longTermLiabilitiesBreakdown,
    required this.ownerEquityBreakdown,
    required this.netIncome,
  });

  final double totalAssets;
  final double totalLiabilities;
  final Map<String, double> currentAssetsBreakdown;
  final Map<String, double> fixedAssetsBreakdown;
  final Map<String, double> otherAssetsBreakdown;
  final Map<String, double> currentLiabilitiesBreakdown;
  final Map<String, double> longTermLiabilitiesBreakdown;
  final Map<String, double> ownerEquityBreakdown;
  final double netIncome;

  double get totalEquity => totalAssets - totalLiabilities;

  /// Cumulative snapshot through [throughDay] using the same logic as the dashboard.
  static BalanceSheetLineMetrics computeThrough(
    List<TransactionModel> fullSnapshotSource,
    DateTime throughDay,
  ) {
    final txs = bsTransactionsThrough(fullSnapshotSource, throughDay);
    final opening = bsOpeningCashBeforeDay(fullSnapshotSource, throughDay);
    return compute(txs, opening);
  }

  static BalanceSheetLineMetrics compute(
    List<TransactionModel> transactions,
    double openingCash,
  ) {
    Map<String, double> getTotals(List<TransactionModel> txs) {
      double inc = 0, exp = 0, cg = 0, opx = 0, dep = 0;
      for (final tx in txs) {
        final title = tx.title.toLowerCase();
        final amt = tx.amount.abs();
        final bool isAL =
            title.contains('[asset') ||
            title.contains('[liab') ||
            title.contains('equity') ||
            title.contains('[cf:');

        if (title.startsWith('[revenue]')) {
          inc += amt;
        } else if (title.startsWith('[cogs]') ||
            title.contains('cost of goods')) {
          exp += amt;
          cg += amt;
        } else if (title.startsWith('[opex]')) {
          exp += amt;
          opx += amt;
        } else if (isAL) {
        } else {
          final bool isKnownExpense = _bsMatchesExpenseKeyword(title);
          if (isKnownExpense) {
            exp += amt;
            opx += amt;
          } else if (title.contains('credit card payment') ||
              title.contains('transfer to') ||
              title.contains('autopay')) {
          } else if (tx.amount > 0) {
            inc += amt;
          } else {
            exp += amt;
            opx += amt;
          }
        }
        if (title.contains('depreciation') || title.contains('amortization')) {
          dep += amt;
        }
      }
      return {
        'income': inc,
        'expense': exp,
        'cogs': cg,
        'opex': opx,
        'dep': dep,
      };
    }

    final cT = getTotals(transactions);
    final netIncome = (cT['income'] ?? 0) - (cT['expense'] ?? 0);

    double opAdj = 0,
        wcChg = 0,
        opOther = 0,
        astPur = 0,
        invAct = 0,
        loanAct = 0,
        ownCont = 0,
        dist = 0,
        finOther = 0;
    double cashTotal = 0;
    double taggedCurrentAssetsTotal = 0;
    double arTotal = 0;
    double inventoryTotal = 0;
    double fixedAssetsTotal = 0;
    double otherAssetsTotal = 0;
    double curLiabTotal = 0;
    double longTermLiabTotal = 0;
    double equityTotalItems = 0;

    for (final tx in transactions) {
      final absAmt = tx.amount.abs();
      final title = tx.title.toLowerCase();
      final bool isAL =
          title.contains('[asset') ||
          title.contains('[liab') ||
          title.contains('equity') ||
          title.contains('[cf:');

      final bool isCashLike =
          title.contains('cash') ||
          title.contains('bank') ||
          title.contains('checking') ||
          title.contains('savings');
      final bool isTaggedCurrentAsset = title.contains('[asset:current]');
      final bool isReceivableLike =
          title.contains('receivable') || title.contains('customer owes');
      final bool isInventoryLike =
          title.contains('inventory') || title.contains('stock');
      final bool isFixedAssetLike =
          title.contains('equipment') ||
          title.contains('property') ||
          title.contains('vehicle') ||
          title.contains('furniture') ||
          title.contains('[asset:non-current]');
      final bool isCurrentLiabilityLike =
          title.contains('payable') ||
          title.contains('credit card') ||
          title.contains('[liab:current]');
      final bool isLongTermLiabilityLike =
          title.contains('loan') ||
          title.contains('mortgage') ||
          title.contains('debt:long') ||
          title.contains('[liab:long-term]');
      final bool isEquityLike =
          title.contains('equity') ||
          title.contains('capital') ||
          title.contains('[equity]');
      final bool isAssetLike =
          title.contains('[asset') || title.contains('asset');
      final bool isCurrentForOther =
          title.contains('cash') ||
          title.contains('bank') ||
          title.contains('receivable') ||
          title.contains('inventory') ||
          title.contains('[asset:current]');
      final bool isFixedForOther =
          title.contains('equipment') ||
          title.contains('property') ||
          title.contains('vehicle') ||
          title.contains('[asset:non-current]');

      if (isCashLike) cashTotal += absAmt;
      if (isTaggedCurrentAsset) taggedCurrentAssetsTotal += absAmt;
      if (isReceivableLike) arTotal += absAmt;
      if (isInventoryLike) inventoryTotal += absAmt;
      if (isFixedAssetLike) {
        fixedAssetsTotal += title.contains('depreciation') ? -absAmt : absAmt;
      }
      if (isAssetLike && !isCurrentForOther && !isFixedForOther) {
        otherAssetsTotal += absAmt;
      }
      if (isCurrentLiabilityLike) curLiabTotal += absAmt;
      if (isLongTermLiabilityLike) longTermLiabTotal += absAmt;
      if (isEquityLike) equityTotalItems += absAmt;

      bool isIncome = false;
      bool isExpense = false;
      bool isCogs = false;

      if (title.startsWith('[revenue]')) {
        isIncome = true;
      } else if (title.startsWith('[cogs]') ||
          title.contains('cost of goods')) {
        isExpense = true;
        isCogs = true;
      } else if (title.startsWith('[opex]')) {
        isExpense = true;
      } else if (isAL) {
      } else {
        final bool isKnownExpense = _bsMatchesExpenseKeyword(title);
        if (isKnownExpense) {
          isExpense = true;
        } else if (title.contains('credit card payment') ||
            title.contains('transfer to') ||
            title.contains('autopay')) {
        } else if (tx.amount > 0) {
          isIncome = true;
        } else {
          isExpense = true;
        }
      }

      if (!isAL) {
      } else {
        if (title.contains('[cf:manual:operating]') ||
            title.contains('[cf:manual:other]')) {
          opOther += tx.amount;
        } else if (title.contains('receivable') ||
            title.contains('inventory') ||
            title.contains('payable') ||
            title.contains('[cf:workingcapital]')) {
          wcChg += tx.amount;
        } else if (title.contains('[cf:op:other]') ||
            title.contains('[cf:operating]') ||
            title.contains('other operating')) {
          opOther += tx.amount;
        }

        if (title.contains('[cf:manual:investing]') ||
            title.contains('[cf:invest:other]') ||
            title.contains('other investing')) {
          invAct += tx.amount;
        } else if (title.contains('equipment') ||
            title.contains('property') ||
            title.contains('[cf:investing]') ||
            title.contains('asset purchase')) {
          astPur += tx.amount;
        } else if (title.contains('investment')) {
          invAct += tx.amount;
        }

        if (title.contains('[cf:manual:financing]')) {
          finOther += tx.amount;
        } else if (title.contains('loan') ||
            title.contains('debt') ||
            title.contains('[cf:financing]') ||
            title.contains('loan activities')) {
          loanAct += tx.amount;
        } else if (title.contains('contribution') ||
            title.contains('[cf:contribution]')) {
          ownCont += tx.amount;
        } else if (title.contains('distribution') ||
            title.contains('dividend') ||
            title.contains('owner draw') ||
            title.contains('[cf:distributions]')) {
          dist += tx.amount;
        } else if (title.contains('[cf:finance:other]') ||
            title.contains('other financing')) {
          finOther += tx.amount;
        }
      }

      if (title.contains('depreciation') ||
          title.contains('amortization') ||
          title.contains('[cf:adjustments]')) {
        opAdj += absAmt;
      }
    }

    final operatingCashFlow = netIncome + opAdj + wcChg + opOther;
    final investingCashFlow = astPur + invAct;
    final financingCashFlow = loanAct + ownCont + dist + finOther;
    final netChangeInCash =
        operatingCashFlow + investingCashFlow + financingCashFlow;
    final endingCashBalance = openingCash + netChangeInCash;

    final computedCashForBsRaw = cashTotal.abs() > 0.0001
        ? cashTotal
        : endingCashBalance;
    // Keep cash non-negative on the balance sheet; route negative cash to a
    // short-term overdraft liability line instead.
    final overdraftLiability = computedCashForBsRaw < 0
        ? computedCashForBsRaw.abs()
        : 0.0;
    final computedCashForBs = computedCashForBsRaw < 0
        ? 0.0
        : computedCashForBsRaw;
    final retainedEarnings = netIncome;

    final currentAssetsBreakdown = <String, double>{
      if (taggedCurrentAssetsTotal > 0)
        'Current Assets': taggedCurrentAssetsTotal,
      'Cash': computedCashForBs,
      'Accounts Receivable': arTotal,
      if (inventoryTotal > 0) 'Inventory': inventoryTotal,
    };
    final fixedAssetsBreakdown = <String, double>{
      'Fixed Assets': fixedAssetsTotal,
    };
    final otherAssetsBreakdown = <String, double>{
      'Other Assets': otherAssetsTotal,
    };
    final currentLiabilitiesBreakdown = <String, double>{
      'Current Liabilities': curLiabTotal,
      if (overdraftLiability > 0) 'Bank Overdraft': overdraftLiability,
    };
    final longTermLiabilitiesBreakdown = <String, double>{
      'Long-Term Liabilities': longTermLiabTotal,
    };
    final ownerEquityBreakdown = <String, double>{
      if (equityTotalItems.abs() > 0.0001) "Owner's Equity": equityTotalItems,
      'Retained Earnings': retainedEarnings,
    };

    final totalAssets =
        computedCashForBs +
        arTotal +
        inventoryTotal +
        fixedAssetsTotal +
        otherAssetsTotal;
    final totalLiabilities =
        curLiabTotal + longTermLiabTotal + overdraftLiability;

    return BalanceSheetLineMetrics(
      totalAssets: totalAssets,
      totalLiabilities: totalLiabilities,
      currentAssetsBreakdown: currentAssetsBreakdown,
      fixedAssetsBreakdown: fixedAssetsBreakdown,
      otherAssetsBreakdown: otherAssetsBreakdown,
      currentLiabilitiesBreakdown: currentLiabilitiesBreakdown,
      longTermLiabilitiesBreakdown: longTermLiabilitiesBreakdown,
      ownerEquityBreakdown: ownerEquityBreakdown,
      netIncome: netIncome,
    );
  }
}
