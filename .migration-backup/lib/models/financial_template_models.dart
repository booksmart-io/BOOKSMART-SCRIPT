class ProfitAndLossTemplate {
  final double revenue;
  final double cogs;
  final double grossProfit;
  final double operatingExpenses;
  final double netIncome;

  ProfitAndLossTemplate({
    required this.revenue,
    required this.cogs,
    required this.grossProfit,
    required this.operatingExpenses,
    required this.netIncome,
  });

  factory ProfitAndLossTemplate.fromJson(Map<String, dynamic> json) {
    return ProfitAndLossTemplate(
      revenue: (json['revenue'] ?? 0.0).toDouble(),
      cogs: (json['cost_of_goods_sold'] ?? 0.0).toDouble(),
      grossProfit: (json['gross_profit'] ?? 0.0).toDouble(),
      operatingExpenses: (json['operating_expenses'] ?? 0.0).toDouble(),
      netIncome: (json['net_income'] ?? 0.0).toDouble(),
    );
  }

  Map<String, dynamic> toJson() => {
    'revenue': revenue,
    'cost_of_goods_sold': cogs,
    'gross_profit': grossProfit,
    'operating_expenses': operatingExpenses,
    'net_income': netIncome,
  };
}

class BalanceSheetTemplate {
  final double currentAssets;
  final double nonCurrentAssets;
  final double currentLiabilities;
  final double longTermLiabilities;
  final double equity;

  BalanceSheetTemplate({
    required this.currentAssets,
    required this.nonCurrentAssets,
    required this.currentLiabilities,
    required this.longTermLiabilities,
    required this.equity,
  });

  factory BalanceSheetTemplate.fromJson(Map<String, dynamic> json) {
    return BalanceSheetTemplate(
      currentAssets: (json['assets']?['current'] ?? 0.0).toDouble(),
      nonCurrentAssets: (json['assets']?['non_current'] ?? 0.0).toDouble(),
      currentLiabilities: (json['liabilities']?['current'] ?? 0.0).toDouble(),
      longTermLiabilities: (json['liabilities']?['long_term'] ?? 0.0)
          .toDouble(),
      equity: (json['equity'] ?? 0.0).toDouble(),
    );
  }

  Map<String, dynamic> toJson() => {
    'assets': {'current': currentAssets, 'non_current': nonCurrentAssets},
    'liabilities': {
      'current': currentLiabilities,
      'long_term': longTermLiabilities,
    },
    'equity': equity,
  };
}

class CashFlowTemplate {
  final double operatingActivities;
  final double operatingAdjustments;
  final double workingCapitalChanges;
  final double assetPurchases;
  final double investmentActivities;
  final double loanActivities;
  final double ownerContributions;
  final double distributions;
  final double investingActivities;
  final double financingActivities;

  CashFlowTemplate({
    required this.operatingActivities,
    this.operatingAdjustments = 0.0,
    this.workingCapitalChanges = 0.0,
    this.assetPurchases = 0.0,
    this.investmentActivities = 0.0,
    this.loanActivities = 0.0,
    this.ownerContributions = 0.0,
    this.distributions = 0.0,
    required this.investingActivities,
    required this.financingActivities,
  });

  factory CashFlowTemplate.fromJson(Map<String, dynamic> json) {
    return CashFlowTemplate(
      operatingActivities: (json['operating_activities'] ?? 0.0).toDouble(),
      operatingAdjustments: (json['operating_adjustments'] ?? 0.0).toDouble(),
      workingCapitalChanges: (json['working_capital_changes'] ?? 0.0)
          .toDouble(),
      assetPurchases: (json['asset_purchases'] ?? 0.0).toDouble(),
      investmentActivities: (json['investment_activities'] ?? 0.0).toDouble(),
      loanActivities: (json['loan_activities'] ?? 0.0).toDouble(),
      ownerContributions: (json['owner_contributions'] ?? 0.0).toDouble(),
      distributions: (json['distributions'] ?? 0.0).toDouble(),
      investingActivities: (json['investing_activities'] ?? 0.0).toDouble(),
      financingActivities: (json['financing_activities'] ?? 0.0).toDouble(),
    );
  }

  Map<String, dynamic> toJson() => {
    'operating_activities': operatingActivities,
    'operating_adjustments': operatingAdjustments,
    'working_capital_changes': workingCapitalChanges,
    'asset_purchases': assetPurchases,
    'investment_activities': investmentActivities,
    'loan_activities': loanActivities,
    'owner_contributions': ownerContributions,
    'distributions': distributions,
    'investing_activities': investingActivities,
    'financing_activities': financingActivities,
  };
}
