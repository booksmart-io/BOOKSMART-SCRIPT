import 'dart:developer';

import 'package:booksmart/services/crud_service.dart';
import 'package:booksmart/supabase/tables.dart';
import 'package:get/get.dart';
import '../../../models/user_base_model.dart';

class AdminUsersController extends GetxController {
  final List<PersonModel> users = [];
  RxBool isLoading = false.obs;

  String table = SupabaseTable.user; // or profiles/persons table

  @override
  void onInit() {
    super.onInit();
    fetchUsers();
  }

  Future<void> fetchUsers() async {
    try {
      isLoading.value = true;

      final result = await SupabaseCrudService.read(
        table: table,
        filters: {
          'role': 'user', // 👈 ONLY fetch users with role = user
        },
      );

      users.clear();

      if (result is List) {
        for (final json in result) {
          users.add(PersonModel.fromJson(json));
        }
      }
    } catch (e, s) {
      log('❌ fetchUsers error');
      log(e.toString());
      log(s.toString());
    } finally {
      isLoading.value = false;
      update();
    }
  }
}
