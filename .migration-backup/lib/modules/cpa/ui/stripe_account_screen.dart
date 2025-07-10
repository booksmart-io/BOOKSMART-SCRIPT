import 'package:booksmart/widgets/custom_dialog.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../controllers/stripe_business_controller.dart';
import 'package:booksmart/helpers/currency_formatter.dart';

void goToStripeAccountScreen({bool shouldCloseBefore = false}) {
  if (kIsWeb) {
    if (shouldCloseBefore) {
      Get.back(); // close previous dialog
    }
    customDialog(
      child: const CPAStripeAccountScreen(),
      title: 'Stripe Account',
      barrierDismissible: true,
      actionWidgetList: [
        IconButton(
          icon: const Icon(Icons.refresh),
          onPressed: () {
            try {
              Get.find<StripeCPAController>().loadAccount();
            } catch (_) {}
          },
        ),
      ],
    );
  } else {
    if (shouldCloseBefore) {
      Get.off(() => const CPAStripeAccountScreen());
    } else {
      Get.to(() => const CPAStripeAccountScreen());
    }
  }
}

class CPAStripeAccountScreen extends StatefulWidget {
  const CPAStripeAccountScreen({super.key});

  @override
  State<CPAStripeAccountScreen> createState() => _CPAStripeAccountScreenState();
}

class _CPAStripeAccountScreenState extends State<CPAStripeAccountScreen> {
  late StripeCPAController controller;

  @override
  void initState() {
    super.initState();

    if (!Get.isRegistered<StripeCPAController>()) {
      controller = Get.put(StripeCPAController(), permanent: true);
      controller.loadAccount();
    } else {
      controller = Get.find<StripeCPAController>();
    }
  }

  Widget statusRow(String label, bool value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label),
          Icon(
            value ? Icons.check_circle : Icons.cancel,
            color: value ? Colors.green : Colors.red,
          ),
        ],
      ),
    );
  }

  Widget statusCard() {
    return Card(
      elevation: 3,
      margin: const EdgeInsets.symmetric(horizontal: 24),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            const Text(
              "Stripe Account Status",
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            statusRow("Account Created", controller.accountExists),
            statusRow("Onboarding Complete", controller.onboardingComplete),
            statusRow("Payouts Enabled", controller.payoutsEnabled),
          ],
        ),
      ),
    );
  }

  Widget balanceCard() {
    if (!controller.accountExists) return const SizedBox();

    return Card(
      elevation: 3,
      margin: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            const Text(
              "Balances",
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text("Available"),
                Text(
                  CurrencyUtils.format(
                    controller.formatAmount(controller.balanceAvailable),
                  ),
                  style: const TextStyle(
                    color: Colors.green,
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text("Pending"),
                Text(
                  CurrencyUtils.format(
                    controller.formatAmount(controller.balancePending),
                  ),
                  style: const TextStyle(
                    color: Colors.orange,
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget actionButton() {
    if (!controller.accountExists) {
      return ElevatedButton(
        onPressed: controller.createAccount,
        child: const Text("Create Account"),
      );
    }

    if (!controller.onboardingComplete) {
      return ElevatedButton(
        onPressed: controller.startOnboarding,
        child: const Text("Start Onboarding"),
      );
    }

    return ElevatedButton(
      onPressed: controller.openDashboard,
      child: const Text("Open Stripe Dashboard"),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: kIsWeb
          ? null
          : AppBar(
              title: const Text("Stripe Account"),
              centerTitle: true,
              actions: [
                IconButton(
                  icon: const Icon(Icons.refresh),
                  onPressed: controller.loadAccount,
                ),
              ],
            ),
      body: Obx(() {
        if (controller.loading.value) {
          return const Center(child: CircularProgressIndicator());
        }

        return Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            statusCard(),
            balanceCard(),
            const SizedBox(height: 20),
            actionButton(),
          ],
        );
      }),
    );
  }
}
