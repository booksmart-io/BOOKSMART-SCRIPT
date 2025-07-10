import 'package:booksmart/modules/user/ui/stripe/add_new_card_screen.dart';
import 'package:booksmart/widgets/custom_dialog.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../controllers/stripe_card_controller.dart';

void goToCardListScreen({bool shouldCloseBefore = false}) {
  if (kIsWeb) {
    if (shouldCloseBefore) {
      Get.back(); // close previous dialog
    }
    customDialog(
      child: const CardListScreen(),
      title: 'Add New Card',
      barrierDismissible: true,
      actionWidgetList: [
        IconButton(
          icon: const Icon(Icons.refresh),
          onPressed: () {
            try {
              Get.find<StripeCardController>().loadCards();
            } catch (_) {}
          },
        ),
      ],
    );
  } else {
    if (shouldCloseBefore) {
      Get.off(() => const CardListScreen());
    } else {
      Get.to(() => const CardListScreen());
    }
  }
}

class CardListScreen extends StatefulWidget {
  const CardListScreen({super.key});

  @override
  State<CardListScreen> createState() => _CardListScreenState();
}

class _CardListScreenState extends State<CardListScreen> {
  late StripeCardController controller;

  @override
  void initState() {
    super.initState();

    if (!Get.isRegistered<StripeCardController>()) {
      controller = Get.put(StripeCardController(), permanent: true);
      controller.loadCards();
    } else {
      controller = Get.find<StripeCardController>();
    }
  }

  Widget _cardItem(dynamic card) {
    final last4 = card['card']['last4'];
    final brand = card['card']['brand'];
    final isDefault = card['is_default'] as bool;

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      elevation: 3,
      child: ListTile(
        leading: Icon(
          Icons.credit_card,
          color: Theme.of(context).colorScheme.primary,
        ),
        title: Text(
          "$brand •••• $last4",
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: isDefault
            ? Text(
                "Default Card",
                style: TextStyle(color: Theme.of(context).colorScheme.primary),
              )
            : null,
        trailing: PopupMenuButton(
          itemBuilder: (_) => [
            const PopupMenuItem(value: "default", child: Text("Set Default")),
            const PopupMenuItem(value: "delete", child: Text("Delete")),
          ],
          onSelected: (v) {
            if (v == "default") controller.setDefault(card['id']);
            if (v == "delete") controller.deleteCard(card['id']);
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return GetBuilder<StripeCardController>(
      builder: (controller) {
        return Scaffold(
          appBar: kIsWeb
              ? null
              : AppBar(
                  title: const Text("Saved Cards"),
                  centerTitle: true,
                  actions: [
                    IconButton(
                      icon: const Icon(Icons.refresh),
                      onPressed: controller.loadCards,
                    ),
                  ],
                ),
          body: controller.loading
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: controller.loadCards,
                  child: controller.cards.isEmpty
                      ? const Center(child: Text("No saved cards"))
                      : ListView.builder(
                          itemCount: controller.cards.length,
                          itemBuilder: (_, i) => _cardItem(controller.cards[i]),
                        ),
                ),
          floatingActionButton: FloatingActionButton.extended(
            onPressed: () {
              goToAddNewCardScreen();
            },
            icon: const Icon(Icons.add),
            label: const Text("Add Card"),
          ),
        );
      },
    );
  }
}
