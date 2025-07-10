import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/widgets/custom_dialog.dart';
import 'package:flutter/foundation.dart';
import 'package:get/get.dart';

import 'token_purchase_screen.dart';

void goToBuyTokensScreen({bool shouldCloseBefore = false}) {
  if (kIsWeb) {
    if (shouldCloseBefore) {
      Get.back(); // close previous dialog
    }
    customDialog(
      child: const TokenPurchaseScreen(),
      title: 'Buy Tokens',
      barrierDismissible: true,
    );
  } else {
    if (shouldCloseBefore) {
      Get.off(() => const TokenPurchaseScreen());
    } else {
      Get.to(() => const TokenPurchaseScreen());
    }
  }
}

class BuyTokensScreen extends StatelessWidget {
  const BuyTokensScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const TokenPurchaseScreen();
  }
}
