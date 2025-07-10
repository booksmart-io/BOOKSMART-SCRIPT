enum CashFlowManualSection { operating, investing, financing, other }

class CashFlowManualEntryModel {
  CashFlowManualEntryModel({
    required this.section,
    required this.category,
    required this.amount,
    required this.date,
    this.notes = '',
    this.isNonCash = false,
  });

  final CashFlowManualSection section;
  final String category;
  final double amount;
  final DateTime date;
  final String notes;
  final bool isNonCash;

  String get sectionTag {
    switch (section) {
      case CashFlowManualSection.operating:
        return '[CF:Manual:Operating]';
      case CashFlowManualSection.investing:
        return '[CF:Manual:Investing]';
      case CashFlowManualSection.financing:
        return '[CF:Manual:Financing]';
      case CashFlowManualSection.other:
        return '[CF:Manual:Other]';
    }
  }

  String get transactionTitle {
    final cleanCategory = category.trim().isEmpty ? 'Manual Entry' : category.trim();
    return '$sectionTag $cleanCategory';
  }
}
