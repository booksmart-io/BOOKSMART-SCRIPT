import 'package:flutter/material.dart';
import 'widgets/strategy_card.dart';
import 'widgets/boost_card.dart';
import 'widgets/buy_tokens_panel.dart';
import 'widgets/token_history_panel.dart';
import 'widgets/section_header.dart';

class EarnTokensScreen extends StatelessWidget {
  const EarnTokensScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: LayoutBuilder(
        builder: (context, constraints) {
          final bool isWide = constraints.maxWidth > 1100;
          final bool isMedium =
              constraints.maxWidth > 700 && constraints.maxWidth <= 1100;

          return SingleChildScrollView(
            child: Column(
              children: [
                Align(
                  alignment: Alignment.centerRight,
                  child: _buildTopNav(context),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 24,
                    vertical: 16,
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Main Content
                      Expanded(
                        flex: 3,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _buildWalletHeader(context),
                            const SizedBox(height: 32),
                            const SectionHeader(
                              title: "Premium Strategy Store",
                            ),
                            _buildStrategyGrid(isWide, isMedium),
                            const SizedBox(height: 32),
                            const SectionHeader(
                              title: "Premium Strategy Store",
                            ), // Second store in UI
                            _buildStrategyGrid(
                              isWide,
                              isMedium,
                              secondRow: true,
                            ),
                            const SizedBox(height: 32),
                            const SectionHeader(title: "Power Boosts"),
                            _buildBoostsGrid(isWide, isMedium),
                            const SizedBox(height: 32),
                            const SectionHeader(
                              title: "Exclusive Level Unlocks",
                            ),
                            _buildExclusiveUnlocks(isWide, isMedium),

                            // Move Sidebar to bottom if not Wide
                            if (!isWide) ...[
                              const SizedBox(height: 32),
                              const BuyTokensPanel(),
                              const SizedBox(height: 24),
                              const TokenHistoryPanel(),
                            ],
                          ],
                        ),
                      ),

                      // Sidebar for Desktop
                      if (isWide) ...[
                        const SizedBox(width: 32),
                        const Expanded(
                          flex: 1,
                          child: Column(
                            children: [
                              BuyTokensPanel(),
                              SizedBox(height: 24),
                              TokenHistoryPanel(),
                              SizedBox(height: 24),
                              TokenHistoryPanel(), // Second one in UI
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildTopNav(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24.0),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _topNavCounter(context, Icons.monetization_on, "240", Colors.amber),
          const SizedBox(width: 16),
          _topNavCounter(
            context,
            Icons.security,
            "6,420",
            Colors.greenAccent,
            extra: "5 Days",
          ),
        ],
      ),
    );
  }

  Widget _topNavCounter(
    BuildContext context,
    IconData icon,
    String value,
    Color color, {
    String? extra,
  }) {
    final colorScheme = Theme.of(context).colorScheme;

    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      margin: EdgeInsets.zero,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Row(
          children: [
            Icon(icon, color: color, size: 18),
            const SizedBox(width: 8),
            Text(
              value,
              style: TextStyle(
                color: colorScheme.onSurface,
                fontWeight: FontWeight.bold,
              ),
            ),
            if (extra != null) ...[
              const SizedBox(width: 8),
              Icon(
                Icons.local_fire_department,
                color: Colors.orange[400],
                size: 16,
              ),
              const SizedBox(width: 4),
              Text(
                extra,
                style: TextStyle(
                  color: colorScheme.onSurface.withValues(alpha: 0.7),
                  fontSize: 12,
                ),
              ),
            ],
            Icon(
              Icons.arrow_drop_down,
              color: colorScheme.onSurface.withValues(alpha: 0.5),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildWalletHeader(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Card(
      margin: EdgeInsets.zero,
      child: Container(
        height: 130,
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 32),

        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: colorScheme.primary.withValues(alpha: .1),
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: colorScheme.primary.withValues(alpha: 0.2),
                    blurRadius: 20,
                    spreadRadius: 5,
                  ),
                ],
              ),
              child: Icon(
                Icons.monetization_on,
                color: colorScheme.primary,
                size: 48,
              ),
            ),
            const SizedBox(width: 24),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  "Token Wallet",
                  style: TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                    color: colorScheme.onPrimary,
                  ),
                ),
                // const SizedBox(height: 8),
                Row(
                  children: [
                    Icon(
                      Icons.local_fire_department,
                      color: Colors.orange[400],
                      size: 18,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      "240",
                      style: TextStyle(
                        color: colorScheme.onPrimary,
                        fontWeight: FontWeight.bold,
                        fontSize: 18,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      "Tokens",
                      style: TextStyle(
                        color: colorScheme.onPrimary.withValues(alpha: 0.6),
                        fontSize: 16,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStrategyGrid(
    bool isWide,
    bool isMedium, {
    bool secondRow = false,
  }) {
    int crossAxisCount = isWide ? 2 : 1;
    if (isMedium) crossAxisCount = 2;

    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: crossAxisCount,
      mainAxisSpacing: 20,
      crossAxisSpacing: 20,
      childAspectRatio: isWide ? 2.3 : (isMedium ? 2.0 : 2.5),
      children: secondRow
          ? const [
              StrategyCard(
                title: "AI Tax Strategy Deep Dive",
                subtitle: "Personalized 3 scenario tax optimization model",
                price: "150 Tokens",
                buttonText: "Unlock Strategy",
                icon: Icons.description_outlined,
                bonus: "+150 Tokens",
              ),
              StrategyCard(
                title: "Loan Readiness Simulation",
                subtitle: "See approval odds before applying",
                price: "200 Tokens",
                buttonText: "Run Simulation",
                icon: Icons.account_balance_outlined,
              ),
              StrategyCard(
                title: "CPA Quick Review",
                subtitle: "AI pre review of books before CPA meeting",
                price: "180 Tokens",
                buttonText: "Generate Review",
                icon: Icons.article_outlined,
                bonus: "+180 Tokens",
              ),
              StrategyCard(
                title: "Revenue Growth Forecast",
                subtitle: "12 month revenue projection model",
                price: "220 Tokens",
                buttonText: "Scan Now",
                icon: Icons.trending_up,
              ),
            ]
          : const [
              StrategyCard(
                title: "AI Tax Strategy Deep Dive",
                subtitle: "Personalized 3 scenario tax optimization model",
                price: "150 Tokens",
                buttonText: "Unlock Strategy",
                icon: Icons.description_outlined,
              ),
              StrategyCard(
                title: "Credit Score Boost",
                subtitle: "Step-by-step utilization restructuring plan",
                price: "120 Tokens",
                buttonText: "Activate Plan",
                icon: Icons.speed_rounded,
              ),
            ],
    );
  }

  Widget _buildBoostsGrid(bool isWide, bool isMedium) {
    int crossAxisCount = isWide ? 2 : 1;
    if (isMedium) crossAxisCount = 2;

    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: crossAxisCount,
      mainAxisSpacing: 20,
      crossAxisSpacing: 20,
      childAspectRatio: isWide ? 3.0 : (isMedium ? 2.5 : 3.5),
      children: const [
        BoostCard(
          title: "Double XP Boost",
          subtitle: "Double XP on missions for 24 hours.",
          price: "80 Tokens",
          reward: "+ 80 Tokens",
          icon: Icons.bolt,
        ),
        BoostCard(
          title: "7 Day Streak Shield",
          subtitle: "Protect streak if you miss one day.",
          price: "60 Tokens",
          reward: "+ 60 Tokens",
          icon: Icons.shield_outlined,
        ),
      ],
    );
  }

  Widget _buildExclusiveUnlocks(bool isWide, bool isMedium) {
    return Builder(
      builder: (context) {
        final colorScheme = Theme.of(context).colorScheme;

        return Card(
          margin: EdgeInsets.zero,
          child: Container(
            padding: const EdgeInsets.all(24),

            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.lock_outline,
                  color: colorScheme.onSurface.withValues(alpha: 0.3),
                  size: 24,
                ),
                const SizedBox(width: 12),
                Text(
                  "Reach Level 10 to unlock exclusive strategies",
                  style: TextStyle(
                    color: colorScheme.onSurface.withValues(alpha: 0.5),
                    fontSize: 14,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
