import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/widgets/custom_dialog.dart';
import 'package:flutter/foundation.dart';
import 'package:get/get.dart';

void goToSponsoredOffersScreen({bool shouldCloseBefore = false}) {
  if (kIsWeb) {
    if (shouldCloseBefore) {
      // Get.back(); // close previous dialog
    }
    customDialog(
      child: const SponsoredOffersScreen(),
      title: 'Sponsored Offers',
      barrierDismissible: true,
    );
  } else {
    if (shouldCloseBefore) {
      Get.off(() => const SponsoredOffersScreen());
    } else {
      Get.to(() => const SponsoredOffersScreen());
    }
  }
}

class SponsoredOffersScreen extends StatelessWidget {
  const SponsoredOffersScreen({super.key});

  Widget offerCard(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    // final textTheme = Theme.of(context).textTheme;

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colorScheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colorScheme.secondary),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppText("SPONSORED OFFER", fontSize: 14, fontWeight: FontWeight.bold),
          const SizedBox(height: 8),
          AppText(
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur ac diam vel libero varius lacinia.",

            fontSize: 14,
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              AppText(
                "Dismiss",
                color: colorScheme.onSurface.withValues(alpha: 0.6),
                fontSize: 15,
              ),
              AppText(
                "Learn More >",
                color: colorScheme.secondary,
                fontSize: 15,
                fontWeight: FontWeight.w600,
                isUnderline: true,
              ),
            ],
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: kIsWeb ? null : AppBar(title: const Text("Sponsored Offers")),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [offerCard(context), offerCard(context), offerCard(context)],
      ),
    );
  }
}
