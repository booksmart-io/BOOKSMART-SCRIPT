import 'dart:developer';

import 'package:booksmart/models/subscription_model.dart';
import 'package:booksmart/supabase/tables.dart';
import 'package:booksmart/utils/supabase.dart';
import 'package:get/get.dart';

import '../../common/controllers/auth_controller.dart';

class UserSubscriptionController extends GetxController {
  SubscriptionModel? subscription;
  bool isLoading = false;
  String? error;

  bool get hasActiveSubscription => subscription?.isActive ?? false;

  @override
  void onInit() {
    super.onInit();
    loadUserSubscription(shouldUpdateBefore: false);
  }

  Future<void> loadUserSubscription({bool shouldUpdateBefore = true}) async {
    final userId = authUser?.authId ?? supabase.auth.currentUser?.id;

    if (userId == null || userId.isEmpty) {
      subscription = null;
      error = "Unable to find the current user.";
      update();
      return;
    }

    isLoading = true;
    error = null;

    if (shouldUpdateBefore) {
      update();
    }

    try {
      final data = await supabase
          .from(SupabaseTable.subscriptions)
          .select()
          .eq('user_id', userId)
          .order('created_at', ascending: false)
          .limit(1)
          .maybeSingle();

      subscription = data == null ? null : SubscriptionModel.fromJson(data);
    } catch (e, stackTrace) {
      log(e.toString());
      log(stackTrace.toString());
      subscription = null;
      error = "Could not load your subscription status.";
    }

    isLoading = false;
    update();
  }
}
