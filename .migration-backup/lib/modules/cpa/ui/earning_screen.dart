import 'package:booksmart/constant/exports.dart';
import 'package:lucide_icons/lucide_icons.dart';

class EarningScreenCPA extends StatefulWidget {
  const EarningScreenCPA({super.key});

  @override
  State<EarningScreenCPA> createState() => _EarningScreenCPAState();
}

class _EarningScreenCPAState extends State<EarningScreenCPA> {
  final List<Map<String, dynamic>> transactions = [
    {
      "date": "04/21",
      "title": "Lead purchase",
      "amount": "\$50",
      "status": true,
    },
    {"date": "04/17", "title": "Payout", "amount": "-\$175", "status": false},
    {
      "date": "04/10",
      "title": "Lead purchase",
      "amount": "\$75",
      "status": true,
    },
    {
      "date": "04/03",
      "title": "Lead purchase",
      "amount": "\$25",
      "status": true,
    },
  ];

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final width = MediaQuery.of(context).size.width;
    final isTablet = width > 600;
    final isDesktop = width > 900;

    return Scaffold(
      body: SingleChildScrollView(
        padding: EdgeInsets.all(isDesktop ? 24 : (isTablet ? 20 : 16)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 🔹 Earnings Overview Cards
            const AppText(
              'Earnings Overview',
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
            SizedBox(height: 16),

            // Responsive grid for earnings cards
            isDesktop
                ? _buildDesktopEarningsGrid(scheme)
                : isTablet
                ? _buildTabletEarningsGrid(scheme)
                : _buildMobileEarningsGrid(scheme),

            SizedBox(height: 24),

            // 🔹 Stats Card
            _buildClickableCard(
              onTap: () => _navigateToLeadAnalytics(),
              child: Container(
                padding: EdgeInsets.all(isDesktop ? 20 : (isTablet ? 18 : 16)),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [Colors.amberAccent, Colors.orangeAccent],
                          begin: Alignment.bottomLeft,
                          end: Alignment.topRight,
                        ),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(
                        LucideIcons.barChart3,
                        color: Colors.black,
                      ),
                    ),
                    SizedBox(width: isDesktop ? 16 : 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: const [
                          AppText(
                            'Leads Purchased',
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                          AppText(
                            'Accepted',
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: const [
                        AppText('8', fontSize: 16, fontWeight: FontWeight.bold),
                        AppText('5', fontSize: 16, fontWeight: FontWeight.bold),
                      ],
                    ),
                  ],
                ),
              ),
            ),

            SizedBox(height: 20),

            // 🧾 Transaction History
            const AppText(
              'Transaction History',
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
            SizedBox(height: 12),

            _buildClickableCard(
              onTap: () => _navigateToTransactionDetails(),
              child: Container(
                padding: EdgeInsets.all(isDesktop ? 20 : (isTablet ? 18 : 16)),
                // TODO: put seperation lines between the transactions
                child: Column(
                  children: transactions.map((tx) {
                    return Padding(
                      padding: EdgeInsets.symmetric(
                        horizontal: isDesktop ? 8 : 4,
                        vertical: isDesktop ? 12 : 8,
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            flex: 1,
                            child: AppText(
                              tx["date"],
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          Expanded(
                            flex: 2,
                            child: AppText(tx["title"], fontSize: 14),
                          ),
                          Expanded(
                            flex: 1,
                            child: Align(
                              alignment: Alignment.centerRight,
                              child: AppText(
                                tx["amount"],
                                fontSize: 14,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                          SizedBox(width: 6),
                          Icon(
                            tx["status"]
                                ? Icons.check_circle_outline
                                : Icons.remove_circle_outline,
                            color: tx["status"]
                                ? Colors.green
                                : Colors.redAccent,
                            size: 18,
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                ),
              ),
            ),

            SizedBox(height: 28),

            // ➕ Add Funds button
            SizedBox(
              width: double.infinity,
              child: AppButton(
                buttonText: "Add Funds",
                onTapFunction: () => _navigateToAddFunds(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // 📱 Mobile Earnings Grid
  Widget _buildMobileEarningsGrid(ColorScheme scheme) {
    return Column(
      children: [
        metricCard2(
          context,
          title: "Total Earnings",
          value: "\$255,000",
          icon: Icons.arrow_upward_rounded,
          iconColor: Colors.green,
          trendText: "12% vs last month",
          onTap: () {},
        ),

        SizedBox(height: 12),
        metricCard2(
          context,
          title: "Pending Payouts",
          value: "\$25,00",
          icon: Icons.arrow_upward_rounded,
          iconColor: Colors.green,
          trendText: "05% vs last month",
          onTap: () {},
        ),

        SizedBox(height: 12),
        metricCard2(
          context,
          title: "Lead Expenses",
          value: "\$325",
          icon: Icons.arrow_upward_rounded,
          iconColor: Colors.red,
          trendText: "last month",
          onTap: () {},
        ),
        SizedBox(height: 12),
        metricCard2(
          context,
          title: "Net Profit",
          value: "\$325",
          icon: Icons.arrow_downward,
          iconColor: Colors.red,
          trendText: "This month",
          onTap: () {},
        ),
      ],
    );
  }

  // 📟 Tablet Earnings Grid
  Widget _buildTabletEarningsGrid(ColorScheme scheme) {
    return Row(
      children: [
        Expanded(
          child: metricCard2(
            context,
            title: "Total Earnings",
            value: "\$255,000",
            icon: Icons.arrow_upward_rounded,
            iconColor: Colors.green,
            trendText: "12% vs last month",
            onTap: () {},
          ),
        ),
        SizedBox(width: 12),
        Expanded(
          child: metricCard2(
            context,
            title: "Pending Payouts",
            value: "\$25,00",
            icon: Icons.arrow_upward_rounded,
            iconColor: Colors.green,
            trendText: "05% vs last month",
            onTap: () {},
          ),
        ),
        SizedBox(width: 12),
        Expanded(
          child: metricCard2(
            context,
            title: "Lead Expenses",
            value: "\$325",
            icon: Icons.arrow_upward_rounded,
            iconColor: Colors.red,
            trendText: "This month",
            onTap: () {},
          ),
        ),
        SizedBox(width: 12),
        Expanded(
          child: metricCard2(
            context,
            title: "Net Profit",
            value: "\$325",
            icon: Icons.arrow_downward,
            iconColor: Colors.red,
            trendText: "This month",
            onTap: () {},
          ),
        ),
      ],
    );
  }

  // 🖥️ Desktop Earnings Grid
  Widget _buildDesktopEarningsGrid(ColorScheme scheme) {
    return Row(
      children: [
        Expanded(
          child: metricCard2(
            context,
            title: "Total Earnings",
            value: "\$255,000",
            icon: Icons.arrow_upward_rounded,
            iconColor: Colors.green,
            trendText: "12% vs last month",
            onTap: () {},
          ),
        ),
        SizedBox(width: 16),
        Expanded(
          child: metricCard2(
            context,
            title: "Pending Payouts",
            value: "\$25,00",
            icon: Icons.arrow_upward_rounded,
            iconColor: Colors.green,
            trendText: "05% vs last month",
            onTap: () {},
          ),
        ),
        SizedBox(width: 16),
        Expanded(
          child: metricCard2(
            context,
            title: "Lead Expenses",
            value: "\$325",
            icon: Icons.arrow_upward_rounded,
            iconColor: Colors.red,
            trendText: "This month",
            onTap: () {},
          ),
        ),
        SizedBox(width: 16),
        Expanded(
          child: metricCard2(
            context,
            title: "Net Profit",
            value: "\$325",
            icon: Icons.arrow_downward,
            iconColor: Colors.red,
            trendText: "This month",
            onTap: () {},
          ),
        ),
      ],
    );
  }

  // 🎯 Clickable Card Wrapper
  Widget _buildClickableCard({
    required Widget child,
    required VoidCallback onTap,
  }) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: onTap,
        child: Card(
          clipBehavior: Clip.antiAlias,
          elevation: 2,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            child: child,
          ),
        ),
      ),
    );
  }

  void _navigateToLeadAnalytics() {
    // Navigate to Lead Analytics
    // Get.to(() => const LeadAnalyticsScreen());
  }

  void _navigateToTransactionDetails() {
    // Navigate to Transaction Details
    // Get.to(() => const TransactionDetailsScreen());
  }

  void _navigateToAddFunds() {
    // Navigate to Add Funds screen
    // Get.to(() => const AddFundsScreen());
  }
}

Widget metricCard2(
  BuildContext context, {
  required String title,
  required String value,
  required IconData icon,
  required Color iconColor,
  required String trendText,
  void Function()? onTap,
}) {
  double thisScreenWidth = MediaQuery.sizeOf(context).width;

  final colorScheme = Theme.of(context).colorScheme;
  return FractionallySizedBox(
    widthFactor: thisScreenWidth > 1000 ? 1 : 1,
    child: Card(
      clipBehavior: Clip.antiAlias,
      margin: EdgeInsets.zero,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(16)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              AppText(
                title,
                fontSize: 13,
                fontWeight: FontWeight.bold,
                color: colorScheme.onSurface,
              ),
              AppText(
                value,
                fontSize: 17,
                fontWeight: FontWeight.bold,
                color: colorScheme.onSurface,
              ),
              const SizedBox(height: 3),
              Wrap(
                children: [
                  Icon(icon, color: iconColor, size: 16),
                  const SizedBox(width: 4),
                  AppText(
                    trendText,
                    fontSize: 14,
                    color: colorScheme.onSurfaceVariant,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
