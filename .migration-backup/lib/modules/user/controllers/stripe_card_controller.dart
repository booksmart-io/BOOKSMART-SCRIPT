import 'dart:developer';

import 'package:booksmart/services/edge_functions.dart';
import 'package:get/get.dart';

class StripeCardController extends GetxController {
  List cards = [];
  bool loading = true;

  Future<void> loadCards() async {
    try {
      loading = true;
      update();

      final response = await handleStripeCardManagement(
        action: StripeCardAction.list_cards,
      );

      cards = response['data'] ?? [];
    } catch (e, x) {
      log(e.toString());
      log(x.toString());
    }

    loading = false;
    update();
  }

  Future<void> setDefault(String id) async {
    await handleStripeCardManagement(
      action: StripeCardAction.set_default_card,
      paymentMethodId: id,
    );

    await loadCards();
  }

  Future<void> deleteCard(String id) async {
    await handleStripeCardManagement(
      action: StripeCardAction.delete_card,
      paymentMethodId: id,
    );

    await loadCards();
  }
}
