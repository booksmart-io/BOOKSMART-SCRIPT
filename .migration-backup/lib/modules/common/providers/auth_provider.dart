import 'dart:developer';

import 'package:booksmart/supabase/tables.dart';
import 'package:get/get.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../models/user_base_model.dart';
import '../../../routes/routes.dart';
import '../../../services/crud_service.dart';
import '../../../utils/initial_utils.dart';
import '../../../utils/supabase.dart';
import '../../../widgets/confirmation_dialog.dart';
import '../../../widgets/loading.dart';
import '../../../widgets/snackbar.dart';

bool get isUserLoggedIn => supabase.auth.currentSession != null;

String? get getCurrentLoggedUserId => supabase.auth.currentSession?.user.id;

bool get isEmailVerified =>
    supabase.auth.currentSession?.user.emailConfirmedAt != null;

UserRole? get getUserRoleFromSession {
  try {
    return UserRole.values.byName(
      supabase.auth.currentUser!.userMetadata?['role'],
    );
  } catch (e) {
    return null;
  }
}

Future<bool> createUserRow({
  required String userId,
  required String email,
  required UserRole role,
}) async {
  return SupabaseCrudService.insert(
        table: SupabaseTable.user,
        data: {
          "auth_id": userId,
          "email": email,
          "role": role.name,
          "first_name": "",
          "last_name": "",
          "phone_number": "",
        },
      )
      .then((_) {
        return true;
      })
      .onError((e, x) {
        log(e.toString());
        log(e.toString());
        return false;
      });
}

Future<void> signUpWithEmailPassword({
  required String email,
  required String password,
  required UserRole role,
}) async {
  showLoading();
  try {
    final response = await supabase.auth.signUp(
      email: email,
      password: password,
      data: <String, String>{'role': role.name},
    );
    if (response.user != null) {
      await createUserRow(userId: response.user!.id, email: email, role: role);
      String route = await getInitialRoute();
      dismissLoadingWidget();
      Get.offAndToNamed(route);
    } else {
      dismissLoadingWidget();
      somethingWentWrongSnackbar();
    }
  } on AuthApiException catch (e, x) {
    dismissLoadingWidget();
    log(e.toString());
    log(x.toString());
    showSnackBar(e.message, isError: true);
  } catch (e, x) {
    dismissLoadingWidget();
    log(e.toString());
    log(x.toString());
    somethingWentWrongSnackbar();
  }
}

Future<void> signinWithEmailPassword({
  required String email,
  required String password,
}) async {
  showLoading();
  try {
    final response = await supabase.auth.signInWithPassword(
      email: email,
      password: password,
    );

    if (response.user == null) {
      dismissLoadingWidget();
      somethingWentWrongSnackbar();
      return;
    }
    String route = await getInitialRoute();
    dismissLoadingWidget();
    Get.offAndToNamed(route);
  } on AuthApiException catch (e, x) {
    dismissLoadingWidget();
    log(e.toString());
    log(x.toString());
    showSnackBar(e.message, isError: true);
  } catch (e, x) {
    dismissLoadingWidget();
    log(e.toString());
    log(x.toString());
    somethingWentWrongSnackbar();
  }
}

void logOut() async {
  showConfirmationDialog(
    title: "Confirm Logout",
    description: "Are you sure you'd like to logout?",
    onYes: () async {
      Get.back(); // close the confirmation dialog
      showLoading();
      try {
        await Future.wait([
          Supabase.instance.client.auth.signOut(),
          Get.deleteAll(force: true),
        ]);
        dismissLoadingWidget();
        Get.offAllNamed(Routes.login);
      } catch (e) {
        dismissLoadingWidget();
        showSnackBar(e.toString(), isError: true);
        log('Logout error: $e');
      }
    },
  );
}
