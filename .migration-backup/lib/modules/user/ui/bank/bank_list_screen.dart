import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/modules/user/controllers/bank_controller.dart';
import 'package:booksmart/modules/user/controllers/organization_controller.dart';
import 'package:booksmart/modules/user/utils/plaid_connect_utils.dart';
import 'package:booksmart/widgets/custom_dialog.dart';
import 'package:booksmart/modules/user/ui/bank/components/bank_card.dart';
import 'package:flutter/foundation.dart';
import 'package:get/get.dart';

void goToBanksListScreen({bool shouldCloseBefore = false}) {
  if (kIsWeb) {
    if (shouldCloseBefore) {
      Get.back();
    }
    customDialog(
      child: const BanksListScreen(),
      title: 'Bank Accounts',
      barrierDismissible: true,
    );
  } else {
    if (shouldCloseBefore) {
      Get.off(() => const BanksListScreen());
    } else {
      Get.to(() => const BanksListScreen());
    }
  }
}

class BanksListScreen extends StatefulWidget {
  const BanksListScreen({super.key});

  @override
  State<BanksListScreen> createState() => _BanksListScreenState();
}

class _BanksListScreenState extends State<BanksListScreen> {
  late BankController bankController;

  @override
  void initState() {
    if (Get.isRegistered<BankController>(
      tag: getCurrentOrganization?.id.toString(),
    )) {
      bankController = bankControllerInstance;
    } else {
      bankController = Get.put(
        BankController(),
        tag: getCurrentOrganization?.id.toString(),
        permanent: true,
      );
    }

    super.initState();
  }

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;

    return Scaffold(
      appBar: kIsWeb ? null : AppBar(title: const Text("Bank Accounts")),
      body: GetBuilder<BankController>(
        tag: getCurrentOrganization?.id.toString(),
        builder: (controller) {
          if (controller.isLoading.value) {
            return const Center(child: CircularProgressIndicator());
          }
          return controller.banks.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      SizedBox(
                        height: screenHeight * 0.3,
                        child: Image.asset(gifBank, fit: BoxFit.contain),
                      ),
                      0.02.verticalSpace,
                      AppText(
                        "No bank accounts added yet.",
                        themeStyle: Theme.of(context).textTheme.bodyMedium,
                        fontWeight: FontWeight.bold,
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                )
              : RefreshIndicator.adaptive(
                  onRefresh: () async {
                    await controller.loadBanks();
                  },
                  child: ListView.builder(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 10,
                    ),
                    itemCount: controller.banks.length,
                    itemBuilder: (context, index) {
                      final bank = controller.banks[index];
                      return BankCard(
                        key: ValueKey(bank.id),
                        bankModel: bank,
                        // onEdit: () {},
                        // onDelete: () {
                        //   Get.defaultDialog(
                        //     title: "Confirm Delete",
                        //     middleText:
                        //         "Are you sure you want to delete ${bank.institutionName}?",
                        //     textConfirm: "Delete",
                        //     textCancel: "Cancel",
                        //     confirmTextColor: Colors.white,
                        //     onConfirm: () async {
                        //       Get.back();
                        //       await controller.deleteBank(bank.id);
                        //     },
                        //     onCancel: () => Get.back(),
                        //   );
                        // },
                      );
                    },
                  ),
                );
        },
      ),
      bottomNavigationBar: Container(
        height: 45,
        padding: EdgeInsets.symmetric(horizontal: 20),
        margin: EdgeInsets.only(
          bottom: MediaQuery.of(context).padding.bottom + 10,
        ),
        child: AppButton(
          buttonText: "Connect Bank Account",
          fontSize: 14,
          onTapFunction: () {
            hanldePlaidBankConnection();
          },
          radius: 9,
          isRight: true,
          iconWidget: Container(
            color: Colors.white,
            child: const Icon(Icons.add),
          ),
        ),
      ),
    );
  }
}
