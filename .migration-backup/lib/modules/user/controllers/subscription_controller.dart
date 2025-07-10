import 'package:booksmart/models/response_model.dart';
import 'package:booksmart/services/edge_functions.dart';
import 'package:get/get.dart';

import '../../../models/stripe_product_model.dart';

class SubscriptionController extends GetxController {
  bool isYearly = false;

  Rx<ResponseModel?> rxResponseModel = Rx<ResponseModel?>(null);

  ResponseModel? get responseModel => rxResponseModel.value;

  List<StripePlan> products = [];

  List<StripePlan> get subscriptionProducts =>
      products.where((product) => product.isSubscription).toList();

  List<StripePlan> get tokenProducts =>
      products.where((product) => product.isTokens).toList();

  @override
  void onInit() {
    super.onInit();
    loadStripeSubscriptionPlans(shouldLoadBefore: false);
  }

  Future<void> loadStripeSubscriptionPlans({
    bool shouldLoadBefore = true,
  }) async {
    rxResponseModel.value = null;

    if (shouldLoadBefore) {
      update();
    }

    await getStripeSubscriptionPlans().then((reponse) {
      rxResponseModel.value = reponse;

      products = reponse.data;

      update();
    });
  }

  void toggleBilling(bool yearly) {
    isYearly = yearly;
    update();
  }
}
