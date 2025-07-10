import 'package:flutter/material.dart';
import '../../../../../widgets/app_text.dart';

class AiStrategyInsightList extends StatelessWidget {
  const AiStrategyInsightList({super.key});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: Container(
        padding: const EdgeInsets.all(15),
        height: 315,
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(16)),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppText(
              'AI Insight',
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
            const FittedBox(
              fit: BoxFit.scaleDown,
              child: AppText(
                'Maximize Your Business Savings Potential!',
                fontSize: 16,
                color: Colors.white70,
              ),
            ),
            const SizedBox(height: 10),
            // Main Value Display
            const AppText(
              '\$6,470',
              fontSize: 48,
              fontWeight: FontWeight.bold,
              color: Colors.greenAccent,
            ),
            const AppText(
              'across 5 strategic insights',
              fontSize: 18,
              color: Colors.white,
            ),

            const SizedBox(height: 10),
            const AppText(
              'Unlock to view strategies on how to save your business up to \$6,470',
              textAlign: TextAlign.center,
              fontSize: 14,
              color: Colors.white60,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),

            const SizedBox(height: 20),

            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.lock, color: Colors.white, size: 20),
                  const SizedBox(width: 10),
                  const AppText(
                    'Unlock & View',
                    fontSize: 16,
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                  ),
                  const SizedBox(width: 10),
                  const AppText(
                    '150 Tokens',
                    fontSize: 16,
                    color: Colors.cyanAccent,
                    fontWeight: FontWeight.bold,
                  ),
                  const SizedBox(width: 8),
                  // Simple representation of the coin icon
                  const Icon(
                    Icons.currency_bitcoin,
                    color: Colors.amber,
                    size: 20,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
