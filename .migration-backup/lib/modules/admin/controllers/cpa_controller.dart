import 'dart:developer';

import 'package:booksmart/services/crud_service.dart';
import 'package:booksmart/supabase/tables.dart';
import 'package:get/get.dart';
import '../../../models/user_base_model.dart';

class AdminCpaController extends GetxController {
  final List<CpaModel> cpas = [];
  bool isLoading = false;

  String table = SupabaseTable.user; // or profiles/persons table

  @override
  void onInit() {
    super.onInit();
    fetchUsers();
  }

  Future<void> fetchUsers() async {
    try {
      isLoading = true;
      update();

      final result = await SupabaseCrudService.read(
        table: table,
        filters: {
          'role': 'cpa', // 👈 ONLY fetch users with role = user
        },
      );

      cpas.clear();

      if (result is List) {
        for (final json in result) {
          cpas.add(CpaModel.fromJson(json));
        }
      }
    } catch (e, s) {
      log('❌ fetchUsers error');
      log(e.toString());
      log(s.toString());
    } finally {
      isLoading = false;
      update();
    }
  }

  Future<void> updateVerificationStatus({
    required int cpaId,
    required CpaVerificationStatus status,
  }) async {
    try {
      await SupabaseCrudService.update(
        table: table,
        data: {'verification_status': status.name},
        filters: {'id': cpaId},
      );

      // refresh list
      await fetchUsers();
      update();
    } catch (e, s) {
      log('❌ updateVerificationStatus error');
      log(e.toString());
      log(s.toString());
    }
  }

  List<CpaModel> get approvedCpas => cpas
      .where((c) => c.verificationStatus == CpaVerificationStatus.approved)
      .toList();
}
