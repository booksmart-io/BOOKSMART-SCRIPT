import 'package:flutter/material.dart';
import 'package:syncfusion_flutter_gauges/gauges.dart';
import '../../../../../widgets/app_text.dart';

class SecondaryStatsCards extends StatelessWidget {
  const SecondaryStatsCards({super.key});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(15),
        child: Column(
          children: [
            if (MediaQuery.sizeOf(context).width > 800) ...{
              buildDunAndBradstreetCard(),
              const SizedBox(height: 12),
            },
            _buildFundingCard(),
            const SizedBox(height: 12),
            _buildBusinessCreditCard(),
            const SizedBox(height: 12),
            _buildTokenWalletCard(),
          ],
        ),
      ),
    );
  }

  Widget _buildFundingCard() {
    return Card(
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.green.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.account_balance_wallet,
                color: Colors.green,
              ),
            ),
            const SizedBox(width: 12),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AppText('Funding', fontSize: 14, fontWeight: FontWeight.bold),
                  AppText('Loan Ready', fontSize: 12, color: Colors.grey),
                ],
              ),
            ),
            const Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                AppText('82', fontSize: 18, fontWeight: FontWeight.bold),
                AppText('POINTS', fontSize: 10, color: Colors.grey),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBusinessCreditCard() {
    return Card(
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const AppText(
              'Business Credit (Dun & Bradstreet)',
              fontSize: 14,
              fontWeight: FontWeight.bold,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.account_box, color: Colors.green, size: 18),
                const SizedBox(width: 8),
                const AppText(
                  'PAYDEX',
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
                const Spacer(),
                AppText('Good', fontSize: 12, color: Colors.green),
                const Icon(Icons.chevron_right, color: Colors.grey, size: 16),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTokenWalletCard() {
    return Card(
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const AppText(
              'Token Wallet',
              fontSize: 14,
              fontWeight: FontWeight.bold,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.toll, color: Colors.white, size: 20),
                const SizedBox(width: 8),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      AppText(
                        '240 Tokens',
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                      AppText(
                        'Earned this month',
                        fontSize: 11,
                        color: Colors.grey,
                      ),
                    ],
                  ),
                ),
                const AppText('240', fontSize: 18, fontWeight: FontWeight.bold),
              ],
            ),
            const SizedBox(height: 12),
            _buildTokenActionItem(Icons.description, 'Allocate estimates'),
            _buildTokenActionItem(Icons.analytics, 'Gen monthly report'),
            _buildTokenActionItem(Icons.chat_bubble, 'Consult to advisor'),
            _buildTokenActionItem(
              Icons.lightbulb,
              'Get banking recommendations',
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTokenActionItem(IconData icon, String label) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Icon(icon, color: Colors.grey, size: 14),
          const SizedBox(width: 8),
          AppText(label, fontSize: 11, color: Colors.grey[300]),
        ],
      ),
    );
  }
}

Widget buildDunAndBradstreetCard() {
  return Card(
    elevation: 0,
    // color: Colors.white.withValues(alpha: 0.05),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const AppText(
                'Dun & Bradstreet',
                fontSize: 15,
                fontWeight: FontWeight.bold,
              ),
              AppText(
                'Verified Business',
                fontSize: 11,
                color: Colors.white.withValues(alpha: 0.4),
              ),
            ],
          ),
          const SizedBox(height: 15),
          Row(
            children: [
              SizedBox(
                width: 60,
                height: 60,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    SfRadialGauge(
                      axes: <RadialAxis>[
                        RadialAxis(
                          minimum: 0,
                          maximum: 100,
                          showLabels: false,
                          showTicks: false,
                          startAngle: 270,
                          endAngle: 270,
                          axisLineStyle: const AxisLineStyle(
                            thickness: 0.15,
                            thicknessUnit: GaugeSizeUnit.factor,
                            color: Colors.black12,
                          ),
                          pointers: const <GaugePointer>[
                            RangePointer(
                              value: 78,
                              width: 0.15,
                              sizeUnit: GaugeSizeUnit.factor,
                              gradient: SweepGradient(
                                colors: <Color>[
                                  Colors.redAccent,
                                  Colors.orangeAccent,
                                  Colors.greenAccent,
                                ],
                                stops: <double>[0.0, 0.5, 1.0],
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    const AppText(
                      '78',
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 15),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const AppText(
                    'Good',
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                  ),
                  Row(
                    children: [
                      const Icon(
                        Icons.arrow_drop_down,
                        color: Colors.white70,
                        size: 20,
                      ),
                      AppText(
                        'Good',
                        fontSize: 13,
                        color: Colors.white.withValues(alpha: 0.6),
                      ),
                    ],
                  ),
                ],
              ),
              const Spacer(),
              Icon(
                Icons.shield,
                color: Colors.amber.withValues(alpha: 0.7),
                size: 32,
              ),
            ],
          ),
          const SizedBox(height: 15),
          Container(
            height: 6,
            width: double.infinity,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(3),
              gradient: const LinearGradient(
                colors: [Colors.greenAccent, Colors.orangeAccent],
              ),
            ),
            child: Stack(
              children: [
                Positioned.fill(
                  child: Align(
                    alignment: Alignment.centerRight,
                    child: Container(
                      width: 100, // Placeholder for the grayed out part
                      color: Colors.black.withValues(alpha: 0.3),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              AppText(
                'Business age: 4 Years',
                fontSize: 11,
                color: Colors.white.withValues(alpha: 0.4),
              ),
              AppText(
                'Threshold: 60',
                fontSize: 11,
                color: Colors.white.withValues(alpha: 0.4),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}
