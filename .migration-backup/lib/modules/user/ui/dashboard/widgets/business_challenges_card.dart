import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../../../../widgets/app_text.dart';

class BusinessChallengesCard extends StatelessWidget {
  const BusinessChallengesCard({super.key});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: Container(
        height: 300,
        padding: const EdgeInsets.all(15),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (MediaQuery.sizeOf(context).width > 800) ...{
              const AppText(
                'Business Challenges',
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
              const SizedBox(height: 20),
            },
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 25),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          spacing: 10,
                          children: [
                            AppText(
                              'Cashflow Warrior Challenge',
                              fontSize: 15,
                              fontWeight: FontWeight.bold,
                            ),
                            AppText(
                              'Goal: increase cashflow by 10%',
                              fontSize: 12,
                              color: Colors.grey,
                            ),
                          ],
                        ),
                      ),
                      Icon(
                        Icons.emoji_events,
                        color: Get.theme.primaryColor,
                        size: 40,
                      ),
                    ],
                  ),
                  const SizedBox(height: 25),
                  const Row(
                    children: [
                      _ChallengeStat(label: 'Progress', value: '5/10 Tasks'),
                      SizedBox(width: 24),
                      _ChallengeStat(label: 'Reward', value: 'Expert Badge'),
                    ],
                  ),
                  const SizedBox(height: 20),
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton(
                          onPressed: () {},
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Get.theme.primaryColor,
                            foregroundColor: Colors.black,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                          ),
                          child: const AppText(
                            'Fix This',
                            color: Colors.black,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      OutlinedButton.icon(
                        onPressed: () {},
                        icon: const Icon(Icons.info_outline, size: 16),
                        label: const AppText('Details', fontSize: 12),
                        style: OutlinedButton.styleFrom(
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                      ),
                    ],
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

class _ChallengeStat extends StatelessWidget {
  final String label;
  final String value;

  const _ChallengeStat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      spacing: 5,
      children: [
        AppText(label, fontSize: 10, color: Colors.grey),
        AppText(value, fontSize: 12, fontWeight: FontWeight.bold),
      ],
    );
  }
}
