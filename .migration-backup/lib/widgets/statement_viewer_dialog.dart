import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/models/user_document_model.dart';
import 'package:booksmart/models/financial_template_models.dart';
import 'package:booksmart/utils/currency_format.dart';

class StatementViewerDialog extends StatelessWidget {
  final UserDocument document;
  const StatementViewerDialog({super.key, required this.document});

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 40),
      child: StatementViewerCard(document: document),
    );
  }
}

class StatementViewerCard extends StatelessWidget {
  final UserDocument document;
  const StatementViewerCard({super.key, required this.document});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final backgroundColor = isDark
        ? const Color(0xFF071223)
        : const Color(0xFFF8FAFC);

    // Determine the statement type for rendering
    final cat = document.category?.toLowerCase() ?? '';
    final isPnL =
        cat.contains('profit') || cat.contains('pnl') || cat.contains('pl');
    final isBS = cat.contains('balance');
    final isCF = cat.contains('cash');

    return Container(
      width: 800,
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.1),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.5),
            blurRadius: 40,
            spreadRadius: -10,
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // --- PREMIUM HEADER BAR ---
          _buildHeader(context),

          // --- MAIN REPORT CONTENT ---
          Flexible(
            child: ClipRRect(
              borderRadius: const BorderRadius.only(
                bottomLeft: Radius.circular(24),
                bottomRight: Radius.circular(24),
              ),
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(40),
                child: Column(
                  children: [
                    if (isPnL)
                      _buildPnLTemplate(context, isDark)
                    else if (isBS)
                      _buildBalanceSheetTemplate(context, isDark)
                    else if (isCF)
                      _buildCashFlowTemplate(context, isDark)
                    else
                      _buildGenericView(isDark),

                    const SizedBox(height: 60),
                    _buildFooter(isDark),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
      decoration: const BoxDecoration(
        color: Color(0xFF0F1E37),
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(24),
          topRight: Radius.circular(24),
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(
              Icons.description_outlined,
              color: Color(0xFFEAB308),
              size: 24,
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AppText(
                  document.name,
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
                AppText(
                  "Visual Report Template • Standardized Financials",
                  fontSize: 12,
                  color: Colors.white60,
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: () =>
                Navigator.of(context, rootNavigator: true).maybePop(),
            icon: const Icon(Icons.close, color: Colors.white70),
          ),
        ],
      ),
    );
  }

  // --- P&L TEMPLATE VIEW ---
  Widget _buildPnLTemplate(BuildContext context, bool isDark) {
    if (document.parsedData == null) return _buildNoDataState(isDark);
    final pnl = ProfitAndLossTemplate.fromJson(document.parsedData!);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader(title: "PROFIT & LOSS STATEMENT", isDark: isDark),
        const SizedBox(height: 24),
        _buildReportRow(
          isDark: isDark,
          label: "REVENUE",
          value: pnl.revenue,
          isMajor: true,
        ),
        _buildReportRow(
          isDark: isDark,
          label: "Cost of Goods Sold (COGS)",
          value: -pnl.cogs,
        ),
        Divider(color: isDark ? Colors.white12 : Colors.black12, height: 32),
        _buildReportRow(
          isDark: isDark,
          label: "GROSS PROFIT",
          value: pnl.grossProfit,
          isTotal: true,
          color: const Color(0xFF19C37D),
        ),
        const SizedBox(height: 40),

        _buildReportRow(
          isDark: isDark,
          label: "OPERATING EXPENSES",
          value: -pnl.operatingExpenses,
        ),
        const SizedBox(height: 40),
        Divider(color: isDark ? Colors.white24 : Colors.black26, thickness: 2),

        _buildHeroTotal(
          isDark: isDark,
          label: "NET INCOME",
          value: pnl.netIncome,
        ),
      ],
    );
  }

  // --- BALANCE SHEET TEMPLATE VIEW ---
  Widget _buildBalanceSheetTemplate(BuildContext context, bool isDark) {
    if (document.parsedData == null) return _buildNoDataState(isDark);
    final bs = BalanceSheetTemplate.fromJson(document.parsedData!);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader(title: "BALANCE SHEET", isDark: isDark),
        const SizedBox(height: 24),

        AppText(
          "ASSETS",
          fontSize: 16,
          fontWeight: FontWeight.w900,
          color: const Color(0xFFEAB308),
        ),
        const SizedBox(height: 12),
        _buildReportRow(
          isDark: isDark,
          label: "Current Assets",
          value: bs.currentAssets,
        ),
        _buildReportRow(
          isDark: isDark,
          label: "Non-Current Assets",
          value: bs.nonCurrentAssets,
        ),
        _buildReportRow(
          isDark: isDark,
          label: "TOTAL ASSETS",
          value: bs.currentAssets + bs.nonCurrentAssets,
          isMajor: true,
          color: const Color(0xFF19C37D),
        ),

        const SizedBox(height: 40),

        AppText(
          "LIABILITIES & EQUITY",
          fontSize: 16,
          fontWeight: FontWeight.w900,
          color: const Color(0xFFEAB308),
        ),
        const SizedBox(height: 12),
        _buildReportRow(
          isDark: isDark,
          label: "Current Liabilities",
          value: bs.currentLiabilities,
        ),
        _buildReportRow(
          isDark: isDark,
          label: "Long-Term Liabilities",
          value: bs.longTermLiabilities,
        ),
        _buildReportRow(isDark: isDark, label: "Equity", value: bs.equity),
        _buildReportRow(
          isDark: isDark,
          label: "TOTAL LIABILITIES & EQUITY",
          value: bs.currentLiabilities + bs.longTermLiabilities + bs.equity,
          isMajor: true,
          color: const Color(0xFFEAB308),
        ),

        const SizedBox(height: 48),
        _buildBalanceCheck(
          bs.currentAssets + bs.nonCurrentAssets,
          bs.currentLiabilities + bs.longTermLiabilities + bs.equity,
        ),
      ],
    );
  }

  // --- CASH FLOW TEMPLATE VIEW ---
  Widget _buildCashFlowTemplate(BuildContext context, bool isDark) {
    if (document.parsedData == null) return _buildNoDataState(isDark);
    final cf = CashFlowTemplate.fromJson(document.parsedData!);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader(title: "CASH FLOW STATEMENT", isDark: isDark),
        const SizedBox(height: 24),

        _buildReportRow(
          isDark: isDark,
          label: "CASH FROM OPERATING ACTIVITIES",
          value: cf.operatingActivities,
          isMajor: true,
        ),
        _buildReportRow(
          isDark: isDark,
          label: "Net Operating Adjustments",
          value: cf.operatingAdjustments,
          isSub: true,
        ),
        _buildReportRow(
          isDark: isDark,
          label: "Working Capital Changes",
          value: cf.workingCapitalChanges,
          isSub: true,
        ),

        const SizedBox(height: 32),
        _buildReportRow(
          isDark: isDark,
          label: "CASH FROM INVESTING ACTIVITIES",
          value: cf.investingActivities,
          isMajor: true,
        ),
        _buildReportRow(
          isDark: isDark,
          label: "Asset Purchases & Disposals",
          value: cf.assetPurchases,
          isSub: true,
        ),

        const SizedBox(height: 32),
        _buildReportRow(
          isDark: isDark,
          label: "CASH FROM FINANCING ACTIVITIES",
          value: cf.financingActivities,
          isMajor: true,
        ),
        _buildReportRow(
          isDark: isDark,
          label: "Loan Payments & Debt",
          value: cf.loanActivities,
          isSub: true,
        ),
        _buildReportRow(
          isDark: isDark,
          label: "Owner Contributions / Distributions",
          value: cf.ownerContributions - cf.distributions,
          isSub: true,
        ),

        const SizedBox(height: 40),
        Divider(color: isDark ? Colors.white24 : Colors.black26, thickness: 2),
        _buildHeroTotal(
          isDark: isDark,
          label: "NET CASH",
          value:
              cf.operatingActivities +
              cf.investingActivities +
              cf.financingActivities,
        ),
      ],
    );
  }

  // --- REUSABLE PREMIUM UI COMPONENTS ---

  Widget _buildSectionHeader({required String title, required bool isDark}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AppText(
          title,
          fontSize: 24,
          fontWeight: FontWeight.w900,
          color: isDark ? Colors.white : Colors.black87,
        ),
        Container(
          margin: const EdgeInsets.only(top: 8),
          width: 60,
          height: 4,
          color: const Color(0xFFEAB308),
        ),
      ],
    );
  }

  Widget _buildReportRow({
    required bool isDark,
    required String label,
    required double value,
    bool isMajor = false,
    bool isTotal = false,
    bool isSub = false,
    Color? color,
  }) {
    return Padding(
      padding: EdgeInsets.only(top: isMajor ? 16 : 8, left: isSub ? 20 : 0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          AppText(
            label,
            fontSize: isMajor ? 15 : 14,
            fontWeight: isMajor || isTotal
                ? FontWeight.bold
                : FontWeight.normal,
            color: isDark
                ? (isMajor ? Colors.white : Colors.white70)
                : (isMajor ? Colors.black : Colors.black54),
          ),
          AppText(
            fmtCurrency(value),
            fontSize: isMajor ? 15 : 14,
            fontWeight: isMajor || isTotal ? FontWeight.w900 : FontWeight.w500,
            color:
                color ??
                (value >= 0
                    ? const Color(0xFF19C37D)
                    : const Color(0xFFE57373)),
          ),
        ],
      ),
    );
  }

  Widget _buildHeroTotal({
    required bool isDark,
    required String label,
    required double value,
  }) {
    return Container(
      margin: const EdgeInsets.only(top: 20),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF0F1E37) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
        ),
        boxShadow: isDark
            ? null
            : [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.05),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          AppText(
            label,
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: isDark ? Colors.white : Colors.black87,
          ),
          AppText(
            fmtCurrency(value),
            fontSize: 22,
            fontWeight: FontWeight.w900,
            color: value >= 0
                ? const Color(0xFF19C37D)
                : const Color(0xFFE57373),
          ),
        ],
      ),
    );
  }

  Widget _buildBalanceCheck(double assets, double libEq) {
    bool isBalanced = (assets - libEq).abs() < 1.0;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: BoxDecoration(
        color: isBalanced
            ? Colors.green.withValues(alpha: 0.05)
            : Colors.red.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: isBalanced
              ? Colors.green.withValues(alpha: 0.2)
              : Colors.red.withValues(alpha: 0.2),
        ),
      ),
      child: Row(
        children: [
          Icon(
            isBalanced ? Icons.check_circle : Icons.warning,
            color: isBalanced ? Colors.green : Colors.red,
            size: 16,
          ),
          const SizedBox(width: 8),
          AppText(
            isBalanced
                ? "ACCOUNTING EQUATION BALANCED"
                : "DISCREPANCY DETECTED IN STATEMENT",
            fontSize: 12,
            fontWeight: FontWeight.bold,
            color: isBalanced ? Colors.green : Colors.red,
          ),
        ],
      ),
    );
  }

  Widget _buildNoDataState(bool isDark) {
    return Center(
      child: Column(
        children: [
          const SizedBox(height: 100),
          Icon(
            Icons.analytics_outlined,
            size: 64,
            color: (isDark ? Colors.white : Colors.black).withValues(
              alpha: 0.1,
            ),
          ),
          const SizedBox(height: 16),
          AppText(
            "No extracted data available for this document.",
            color: isDark ? Colors.white38 : Colors.black38,
          ),
          const SizedBox(height: 100),
        ],
      ),
    );
  }

  Widget _buildGenericView(bool isDark) {
    return Center(
      child: Column(
        children: [
          const SizedBox(height: 100),
          AppText(
            "Document Metadata Loaded",
            fontSize: 20,
            fontWeight: FontWeight.bold,
            color: isDark ? Colors.white : Colors.black,
          ),
          const SizedBox(height: 8),
          AppText(
            "Category: ${document.category}",
            color: isDark ? Colors.white54 : Colors.black54,
          ),
          const SizedBox(height: 100),
        ],
      ),
    );
  }

  Widget _buildFooter(bool isDark) {
    return Column(
      children: [
        Divider(color: isDark ? Colors.white12 : Colors.black12),
        const SizedBox(height: 16),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.verified_user_outlined,
              size: 14,
              color: isDark ? Colors.white24 : Colors.black26,
            ),
            const SizedBox(width: 8),
            AppText(
              "Report Generated via BookSmart AI • ${document.createdAt.day}/${document.createdAt.month}/${document.createdAt.year}",
              fontSize: 11,
              color: isDark ? Colors.white24 : Colors.black26,
            ),
          ],
        ),
      ],
    );
  }
}
