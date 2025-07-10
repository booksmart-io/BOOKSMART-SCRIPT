import 'package:booksmart/constant/app_colors.dart';
import 'package:flutter/material.dart';

class BuyTokensPanel extends StatelessWidget {
  const BuyTokensPanel({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Card(
      margin: EdgeInsets.zero,
      child: Container(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              "Buy More Tokens",
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: colorScheme.onSurface,
              ),
            ),
            const SizedBox(height: 20),
            _priceRow(context, "100 Tokens", "\$ 9", "+ 20 Tokens", 0.3),
            _priceRow(context, "300 Tokens", "\$ 24", "+ 75 Tokens", 0.6),
            _priceRow(context, "750 Tokens", "\$ 55", "+ 200 Tokens", 0.8),
            _priceRow(context, "1,500 Tokens", "\$ 89", "+ 500 Tokens", 0.95),
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(10),

                /// ✅ OUTLINE INSTEAD OF FILL
                border: Border.all(color: orangeColor, width: 1.2),
              ),
              child: const Center(
                child: Text(
                  "Buy Tokens",
                  style: TextStyle(
                    color: orangeBttonColor,
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _priceRow(
    BuildContext context,
    String tokens,
    String price,
    String bonus,
    double progress,
  ) {
    final colorScheme = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                tokens,
                style: TextStyle(
                  color: colorScheme.onSurface,
                  fontWeight: FontWeight.w600,
                  fontSize: 15,
                ),
              ),
              Text(
                bonus,
                style: TextStyle(
                  color: isDark ? Colors.amber[400] : Colors.orange[800],
                  fontWeight: FontWeight.bold,
                  fontSize: 13,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Text(
                price,
                style: TextStyle(
                  color: colorScheme.onSurfaceVariant,
                  fontSize: 13,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: progress,
                    backgroundColor: colorScheme.outlineVariant.withValues(
                      alpha: 0.3,
                    ),
                    valueColor: AlwaysStoppedAnimation<Color>(
                      isDark ? Colors.amber[600]! : Colors.orange[600]!,
                    ),
                    minHeight: 6,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
