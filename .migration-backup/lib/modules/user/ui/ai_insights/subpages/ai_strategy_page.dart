import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/models/ai_tax_strategy_model.dart';
import 'package:booksmart/modules/user/controllers/ai_stragey_controller.dart';
import 'package:get/get.dart';
import 'package:percent_indicator/circular_percent_indicator.dart';

import '../../../controllers/organization_controller.dart';
import 'ai_strategy_chatting_screen.dart';
import 'generate_ai_strategies_dialog.dart';

class AiStrategyPage extends StatefulWidget {
  const AiStrategyPage({super.key});

  @override
  State<AiStrategyPage> createState() => _AiStrategyPageState();
}

class _AiStrategyPageState extends State<AiStrategyPage> {
  late AiStrategyController controller;

  @override
  void initState() {
    super.initState();

    try {
      controller = aiStrategyControllerInstance;
    } catch (e) {
      controller = Get.put(
        AiStrategyController(),
        tag: getCurrentOrganization?.id.toString(),
        permanent: true,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: GetBuilder<AiStrategyController>(
        tag: getCurrentOrganization?.id.toString(),
        builder: (controller) {
          if (controller.isLoading.value) {
            return const Center(child: CircularProgressIndicator());
          }
          return Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,

              children: [
                Card(
                  margin: EdgeInsets.zero,
                  child: Container(
                    padding: const EdgeInsets.all(10),
                    width: double.infinity,
                    child: Column(
                      children: [
                        AppText(
                          "Deduction Optimization Level",
                          fontWeight: FontWeight.w600,
                          fontSize: 15,
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 5),
                        CircularPercentIndicator(
                          radius: 60.0,
                          lineWidth: 8.0,
                          percent:
                              AiStrategyController.deductionOptimizationPercent,
                          animation: true,
                          animationDuration: 1200,
                          circularStrokeCap: CircularStrokeCap.round,
                          center: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              AppText(
                                '${controller.deductionOptimizationPercentDisplay.toStringAsFixed(0)}%',
                                fontWeight: FontWeight.bold,
                                fontSize: 16,
                                textAlign: TextAlign.center,
                              ),
                              const SizedBox(height: 4),
                              AppText(
                                '${controller.deductionsNotUtilizedPercentDisplay.toStringAsFixed(0)}% of deductions\nnot yet utilized',
                                fontSize: 9,
                                textAlign: TextAlign.center,
                              ),
                            ],
                          ),
                          // backgroundColor: scheme.primary.withValues(alpha:
                          //   0.1,
                          // ), // light ring
                          progressColor: greenColor,
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 15),

                Row(
                  spacing: 10,
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _buildStatCard(
                      context,
                      title: "Additional Deductions Found",
                      amount: controller.additionalDeductionsFoundDisplay,
                      color: greenColor,
                    ),
                    _buildStatCard(
                      context,
                      title: "Potential Tax Savings",
                      amount:
                          '\$${controller.totalPotentialSavings.toStringAsFixed(0)}',
                      color: greenColor,
                    ),
                  ],
                ),
                const SizedBox(height: 15),

                /// ---------- Tax Strategies ----------
                Align(
                  alignment: Alignment.centerLeft,
                  child: AppText(
                    "Tax Strategies & Insights",
                    fontWeight: FontWeight.w600,
                    fontSize: 15,
                  ),
                ),
                const SizedBox(height: 10),

                ElevatedButton(
                  onPressed: () async {
                    showGenerateStrategiesDialog();
                  },
                  child: const Text("Generate Strategies"),
                ),

                if (controller.strategies.isEmpty)
                  Expanded(
                    child: Center(
                      child: AppText(
                        "No strategies found",
                        themeStyle: Theme.of(context).textTheme.bodyMedium,
                        fontWeight: FontWeight.bold,
                        textAlign: TextAlign.center,
                      ),
                    ),
                  )
                else
                  Expanded(
                    child: ListView.builder(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 20,
                        vertical: 10,
                      ),
                      itemCount: controller.strategies.length,
                      itemBuilder: (context, index) {
                        final strategy = controller.strategies[index];
                        return _buildStrategyTile(context, strategy);
                      },
                    ),
                  ),

                // _buildStrategyTile(
                //   context,
                //   amount: "\$650",
                //   description:
                //       "Contribute to a retirement account to increase your deductions",
                //   buttonLabel: "Ask BookSmart AI",
                //   color: greenColor,
                //   category: 'Retirement Account',
                //   risk: 'Low',
                //   title: "Retirement Account",
                // ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildStatCard(
    BuildContext context, {
    required String title,
    required String amount,
    required Color color,
  }) {
    final scheme = Theme.of(context).colorScheme;

    return Expanded(
      child: Card(
        margin: EdgeInsets.zero,

        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Column(
            children: [
              AppText(
                title,
                fontSize: 10,
                textAlign: TextAlign.center,
                color: scheme.onSurface.withValues(alpha: 0.8),
              ),
              AppText(
                amount,
                fontWeight: FontWeight.bold,
                fontSize: 16,
                textAlign: TextAlign.center,
                color: color,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStrategyTile(BuildContext context, AiTaxStrategyModel strategy) {
    final scheme = Theme.of(context).colorScheme;

    Color riskColor;
    switch (strategy.riskLevel?.toLowerCase()) {
      case 'low':
        riskColor = Colors.green;
        break;
      case 'medium':
        riskColor = Colors.orange;
        break;
      case 'high':
        riskColor = Colors.red;
        break;
      default:
        riskColor = scheme.primary;
    }

    final amount = "\$${strategy.estimatedSavings.toStringAsFixed(0)}";

    return Card(
      elevation: 3,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Row(
          spacing: 5,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  /// Title + Amount
                  AppText(
                    strategy.title,
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                  ),

                  const SizedBox(height: 6),

                  /// Summary
                  AppText(
                    strategy.summary,
                    fontSize: 12,
                    color: scheme.onSurface.withValues(alpha: 0.7),
                  ),

                  const SizedBox(height: 10),

                  /// Chips
                  Row(
                    children: [
                      _chip(strategy.category ?? "---", scheme.primary),
                      const SizedBox(width: 6),
                      _chip(strategy.riskLevel ?? "---", riskColor),
                    ],
                  ),
                ],
              ),
            ),
            Column(
              spacing: 10,
              children: [
                AppText(
                  amount,
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                  color: scheme.primary,
                ),
                SizedBox(
                  width: 95,
                  // height: 32,
                  child: AppButton(
                    buttonText: "Ask BookSmart AI",
                    onTapFunction: () {
                      goToAiChatScreen(strategy: strategy);
                    },
                    fontSize: 10,
                    radius: 8,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// Small reusable chip
  Widget _chip(String text, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
      ),
      child: AppText(
        text,
        fontSize: 10,
        color: color,
        fontWeight: FontWeight.w500,
      ),
    );
  }
}
