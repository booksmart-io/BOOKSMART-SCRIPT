import 'dart:developer';
import 'package:booksmart/utils/supabase.dart';
import 'package:get/get.dart';
import 'organization_controller.dart';

String getGroupedTransactionControllerTag(
  DateTime startDate,
  DateTime endDate,
) {
  return "${startDate.toIso8601String()}-${endDate.toIso8601String()}-${organizationControllerInstance.currentOrganization?.id}";
}

class GroupedTransactionController extends GetxController {
  final DateTime startDate;
  final DateTime endDate;

  List<dynamic> groupedTransactions = [];

  GroupedTransactionController({
    required this.startDate,
    required this.endDate,
  });

  Future<List<dynamic>> loadData() async {
    var rpcParams = {
      'p_org_id': organizationControllerInstance.currentOrganization?.id,
      'p_start_date': startDate.toIso8601String(),
      'p_end_date': endDate.toIso8601String(),
    };

    final dynamic response = await supabase.rpc(
      'get_subcategory_totals',
      params: rpcParams,
    );

    log("RPC: get_subcategory_totals: $response");

    groupedTransactions = response;

    return response;
  }
}
