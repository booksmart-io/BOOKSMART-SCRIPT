import 'dart:developer';

import 'package:booksmart/services/edge_functions.dart';
import 'package:booksmart/widgets/custom_dialog.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:get/get.dart';

import '../../../../widgets/loading.dart';
import '../../../../widgets/snackbar.dart';
import '../../controllers/stripe_card_controller.dart';

void goToAddNewCardScreen({bool shouldCloseBefore = false}) {
  if (kIsWeb) {
    if (shouldCloseBefore) {
      Get.back(); // close previous dialog
    }
    customDialog(
      child: const AddCardScreen(),
      title: 'Add New Card',
      barrierDismissible: true,
      maxWidth: 500,
      maxHeight: 350,
    );
  } else {
    if (shouldCloseBefore) {
      Get.off(() => const AddCardScreen());
    } else {
      Get.to(() => const AddCardScreen());
    }
  }
}

class AddCardScreen extends StatefulWidget {
  const AddCardScreen({super.key});

  @override
  State<AddCardScreen> createState() => _AddCardScreenState();
}

class _AddCardScreenState extends State<AddCardScreen> {
  CardFieldInputDetails? card;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: kIsWeb
          ? null
          : AppBar(title: const Text("Add New Card"), centerTitle: true),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: theme.cardColor,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [
                  BoxShadow(
                    blurRadius: 8,
                    color: Colors.black.withValues(alpha: .05),
                  ),
                ],
              ),
              child: CardField(
                onCardChanged: (c) {
                  setState(() {
                    card = c;
                  });
                },
                style: TextStyle(color: Colors.white),
                decoration: const InputDecoration(border: InputBorder.none),
              ),
            ),
            const SizedBox(height: 30),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: card?.complete == true ? _addCard : null,
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                ),
                child: const Text("Add Card"),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _addCard() async {
    try {
      showLoading();
      final setupIntentResponse = await handleStripeCardManagement(
        action: StripeCardAction.create_setup_intent,
      );

      final clientSecret = setupIntentResponse['client_secret'];

      await Stripe.instance.confirmSetupIntent(
        paymentIntentClientSecret: clientSecret,
        params: PaymentMethodParams.card(
          paymentMethodData: PaymentMethodData(),
        ),
      );
      dismissLoadingWidget();

      Get.back(); // close the add card screen
      showSnackBar("Card added successfully");
      Get.find<StripeCardController>().loadCards();
    } catch (e, x) {
      dismissLoadingWidget();
      log(e.toString());
      log(x.toString());
      showSnackBar(e.toString(), title: "Error", isError: true);
    }
  }
}
