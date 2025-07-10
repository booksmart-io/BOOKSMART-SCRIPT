import 'dart:developer';

import 'package:booksmart/services/edge_functions.dart';
import 'package:get/get.dart';
import 'package:url_launcher/url_launcher.dart';

class StripeCPAController extends GetxController {
  var loading = true.obs;
  var accountInfo = Rxn<Map<String, dynamic>>();

  bool get accountExists => accountInfo.value?['account_exists'] ?? false;
  bool get onboardingComplete =>
      accountInfo.value?['onboarding_complete'] ?? false;
  bool get payoutsEnabled => accountInfo.value?['payouts_enabled'] ?? false;

  int get balanceAvailable => accountInfo.value?['balance_available'] ?? 0;
  int get balancePending => accountInfo.value?['balance_pending'] ?? 0;

  double formatAmount(int amount) => amount / 100;

  Future<void> loadAccount() async {
    try {
      loading.value = true;

      final info = await stripeConnectCPA(
        action: StripeBusinessAccountAction.get_business_account_info,
      );

      accountInfo.value = info;
    } catch (e, x) {
      log(e.toString());
      log(x.toString());
    } finally {
      loading.value = false;
    }
  }

  Future<void> createAccount() async {
    try {
      loading.value = true;

      await stripeConnectCPA(
        action: StripeBusinessAccountAction.create_account,
      );

      await loadAccount();
    } catch (e) {
      log(e.toString());
    }
  }

  Future<void> startOnboarding() async {
    try {
      final res = await stripeConnectCPA(
        action: StripeBusinessAccountAction.start_onboarding,
      );

      final uri = Uri.parse(res['url']);

      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
    } catch (e) {
      log(e.toString());
    }
  }

  Future<void> openDashboard() async {
    try {
      final res = await stripeConnectCPA(
        action: StripeBusinessAccountAction.open_dashboard,
      );

      final uri = Uri.parse(res['url']);

      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
    } catch (e) {
      log(e.toString());
    }
  }
}
