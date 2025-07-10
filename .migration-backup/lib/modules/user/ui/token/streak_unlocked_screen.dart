import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/widgets/custom_dialog.dart';
import 'package:flutter/foundation.dart';
import 'package:get/get.dart';

void goToStreakUnlockedScreen({bool shouldCloseBefore = false}) {
  if (kIsWeb) {
    if (shouldCloseBefore) {
      Get.back(); // close previous dialog
    }
    customDialog(
      child: const StreakUnlockedScreen(),
      title: 'Streak Rewards',
      barrierDismissible: true,
    );
  } else {
    if (shouldCloseBefore) {
      Get.off(() => const StreakUnlockedScreen());
    } else {
      Get.to(() => const StreakUnlockedScreen());
    }
  }
}

class StreakUnlockedScreen extends StatelessWidget {
  const StreakUnlockedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      appBar: kIsWeb
          ? null
          : AppBar(centerTitle: true, title: const Text("Streak Rewards")),
      body: LayoutBuilder(
        builder: (context, constraints) {
          final width = constraints.maxWidth;
          final isTablet = width > 600;
          final isDesktop = width > 1024;

          final double titleSize = isDesktop
              ? 28
              : isTablet
              ? 26
              : 24;
          final double subTextSize = isDesktop
              ? 20
              : isTablet
              ? 18
              : 16;
          final double iconSize = isDesktop
              ? 120
              : isTablet
              ? 100
              : 80;
          final padding = EdgeInsets.all(isDesktop ? 40 : 20);

          final progress = 3 / 7;

          return Center(
            child: SingleChildScrollView(
              padding: padding,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  AppText(
                    "Streak Unlocked!",
                    fontSize: titleSize,
                    fontWeight: FontWeight.bold,
                    textAlign: TextAlign.center,
                    color: colorScheme.onSurface,
                  ),
                  const SizedBox(height: 24),

                  Icon(Icons.monetization_on, size: iconSize),
                  const SizedBox(height: 20),

                  AppText(
                    "+100 Tokens",
                    fontSize: subTextSize + 4,
                    fontWeight: FontWeight.bold,
                    color: colorScheme.onSurface,
                  ),
                  AppText(
                    "Earned",
                    fontSize: subTextSize,
                    color: colorScheme.onSurface.withValues(alpha: 0.8),
                  ),

                  const SizedBox(height: 24),

                  // Progress bar
                  Container(
                    width: isDesktop
                        ? 400
                        : isTablet
                        ? 300
                        : 220,
                    height: 8,
                    decoration: BoxDecoration(
                      color: colorScheme.onSurface.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: FractionallySizedBox(
                      alignment: Alignment.centerLeft,
                      widthFactor: progress,
                      child: Container(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  AppText(
                    "Day 3   Earn 7 days → Earn 500 tokens",
                    fontSize: subTextSize - 1,
                    color: colorScheme.onSurface.withValues(alpha: 0.8),
                    textAlign: TextAlign.center,
                  ),

                  const SizedBox(height: 24),

                  // Tomorrow's Challenge Card
                  Container(
                    width: double.infinity,
                    padding: EdgeInsets.all(isTablet ? 16 : 12),
                    decoration: BoxDecoration(
                      color: colorScheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: [
                        if (!isDark)
                          BoxShadow(
                            color: Colors.black12,
                            blurRadius: 6,
                            offset: const Offset(0, 3),
                          ),
                      ],
                    ),
                    child: Column(
                      children: [
                        AppText(
                          "Tomorrow's Challenge",
                          fontSize: subTextSize,
                          fontWeight: FontWeight.bold,
                          textAlign: TextAlign.center,
                          color: colorScheme.onSurface,
                        ),
                        const SizedBox(height: 6),
                        AppText(
                          "Upload 2 receipts → +50 tokens",
                          fontSize: subTextSize - 1,
                          textAlign: TextAlign.center,
                          color: colorScheme.onSurface.withValues(alpha: 0.9),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 30),

                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      foregroundColor: Colors.black,
                      padding: EdgeInsets.symmetric(
                        vertical: isTablet ? 16 : 14,
                        horizontal: isTablet ? 80 : 60,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                      elevation: 3,
                    ),
                    onPressed: () {
                      Get.toNamed(Routes.tokenWallet);
                    },
                    child: AppText(
                      "Claim Reward",
                      fontSize: subTextSize,
                      textAlign: TextAlign.center,
                      color: Colors.black,
                    ),
                  ),

                  const SizedBox(height: 24),

                  InkWell(
                    onTap: () => Get.toNamed(Routes.tokenWallet),
                    child: AppText(
                      "View Token Wallet",
                      fontSize: subTextSize,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
