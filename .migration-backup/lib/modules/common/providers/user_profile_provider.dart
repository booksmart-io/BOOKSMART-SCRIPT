import 'dart:developer';

import 'package:booksmart/modules/common/controllers/auth_controller.dart';
import 'package:booksmart/supabase/tables.dart';
import 'package:booksmart/widgets/loading.dart';

import '../../../services/crud_service.dart';
import 'auth_provider.dart';

Future<Map<String, dynamic>?> getUserProfile({String? userAuthId}) async {
  final String? id = userAuthId ?? getCurrentLoggedUserId;
  if (id == null) {
    return null;
  }

  log("Fetching user profile for ID: $id");

  return SupabaseCrudService.read(
        table: SupabaseTable.user,
        filters: {"auth_id": id},
        single: true,
      )
      .then((value) {
        return value as Map<String, dynamic>?;
      })
      .onError((e, x) {
        log(e.toString());
        log(x.toString());
        return null;
      });
}

Future<bool> updateUserProfile({
  required Map<String, dynamic> data,
  String? userAuthId,
}) async {
  final String? id = userAuthId ?? getCurrentLoggedUserId;
  if (id == null) {
    return false;
  }

  showLoading();

  return SupabaseCrudService.update(
        table: SupabaseTable.user,
        filters: {"auth_id": id},
        data: data,
      )
      .then((value) {
        return authController.refereshUser().then((value) {
          dismissLoadingWidget();
          return true;
        });
      })
      .onError((e, x) {
        dismissLoadingWidget();
        log(e.toString());
        log(x.toString());
        return false;
      });
}
