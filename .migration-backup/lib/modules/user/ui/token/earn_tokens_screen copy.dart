// ignore_for_file: file_names

import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/modules/user/ui/token/buy_tokens_screen.dart';
import 'package:booksmart/modules/user/ui/token/streak_unlocked_screen.dart';

class EarnTokensScreen extends StatelessWidget {
  const EarnTokensScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final colorScheme = theme.colorScheme;

    return Scaffold(
      // appBar: AppBar(
      //   leading: IconButton(
      //     icon: const Icon(Icons.arrow_back),
      //     onPressed: () {
      //       if (Get.previousRoute.isNotEmpty) {
      //         Get.back();
      //       } else if (Navigator.canPop(context)) {
      //         Navigator.pop(context);
      //       } else {
      //         Get.offAllNamed(Routes.home);
      //       }
      //     },
      //   ),
      //   title: AppText(
      //      "Earn Tokens",
      //     fontSize: 20,
      //     fontWeight: FontWeight.bold,
      //     color: colorScheme.onSurface,
      //   ),
      //   centerTitle: true,
      //   backgroundColor: theme.scaffoldBackgroundColor,
      //   elevation: 0,
      // ),
      body: LayoutBuilder(
        builder: (context, constraints) {
          final isTablet = constraints.maxWidth > 600;
          final isDesktop = constraints.maxWidth > 1024;

          final padding = EdgeInsets.all(isDesktop ? 40 : 20);

          return SingleChildScrollView(
            padding: padding,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                AppText(
                  "Earn Free Tokens",
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Icon(
                  Icons.monetization_on,
                  color: colorScheme.secondary,
                  size: isDesktop ? 120 : 80,
                ),
                const SizedBox(height: 8),
                AppText(
                  "Watch short ads and get rewarded instantly.",
                  fontSize: 16,
                  textAlign: TextAlign.center,
                  color: isDark
                      ? AppColorsDark.textSecondary
                      : AppColorsLight.textSecondary,
                ),
                const SizedBox(height: 30),

                // Reward Tiles
                _rewardTile(
                  context,
                  "Watch 1 Ad",
                  "+50 Tokens",
                  isTablet,
                  isDesktop,
                ),
                const SizedBox(height: 12),
                _rewardTile(
                  context,
                  "Watch 3 Ads",
                  "+200 Tokens (Bonus!)",
                  isTablet,
                  isDesktop,
                ),
                const SizedBox(height: 12),
                _rewardTile(
                  context,
                  "Daily Streak",
                  "2 / 3 ads completed today",
                  isTablet,
                  isDesktop,
                ),
                const SizedBox(height: 30),

                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Expanded(
                      child: AppButton(
                        buttonText: "Buy Tokens",
                        radius: 8,
                        onTapFunction: () =>
                            goToBuyTokensScreen(shouldCloseBefore: false),
                      ),
                    ),
                    SizedBox(width: 10),
                    Expanded(
                      child: AppButton(
                        buttonText: "Use Tokens Now",
                        radius: 8,
                        onTapFunction: () {},
                      ),
                    ),
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _rewardTile(
    BuildContext context,
    String title,
    String subtitle,
    bool isTablet,
    bool isDesktop,
  ) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: colorScheme.secondary.withValues(alpha: 0.5)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AppText(title, fontSize: 14, fontWeight: FontWeight.w600),
              const SizedBox(height: 4),
              AppText(subtitle, fontSize: 14),
            ],
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: colorScheme.secondary,
              foregroundColor: Colors.black,
              padding: EdgeInsets.symmetric(
                horizontal: isDesktop ? 28 : 20,
                vertical: isDesktop ? 16 : 12,
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            onPressed: () => goToStreakUnlockedScreen(shouldCloseBefore: false),
            child: const AppText(
              "PLAY",
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: Colors.black,
            ),
          ),
        ],
      ),
    );
  }
}
