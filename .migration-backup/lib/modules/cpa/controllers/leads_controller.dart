import 'dart:developer';
import 'package:booksmart/modules/common/controllers/auth_controller.dart';
import 'package:booksmart/utils/supabase.dart';
import 'package:booksmart/supabase/tables.dart';
import 'package:booksmart/modules/user/controllers/order_controller.dart';
import 'package:get/get.dart';
import 'package:jiffy/jiffy.dart';
import '../../../models/lead_model.dart';
import '../../../models/user_base_model.dart';

class LeadsController extends GetxController {
  final RxList<LeadModel> leads = <LeadModel>[].obs;
  final isLoading = false.obs;

  @override
  void onInit() {
    super.onInit();
    // Fetch leads only if current user is CPA
    if (Get.find<AuthController>().person?.role == UserRole.cpa) {
      fetchLeads();
      
      // Ensure OrderController is registered and listen to changes
      final orderCtrl = Get.isRegistered<OrderController>() 
          ? Get.find<OrderController>() 
          : Get.put(OrderController());
          
      ever(orderCtrl.allOrders, (_) => _updateChartData());
    }
  }

  Future<void> fetchLeads() async {
    try {
      isLoading.value = true;
      final currentCpaId = Get.find<AuthController>().person?.id;

      if (currentCpaId == null) {
        return;
      }

      // Fetch leads where cpa_id is current user
      // Also join with user table to get user details
      final response = await supabase
          .from(SupabaseTable.leads)
          .select('*, user:user_id(*)')
          .eq('cpa_id', currentCpaId)
          .order('created_at', ascending: false);

      final data = (response as List)
          .map((e) => LeadModel.fromJson(e))
          .toList();

      leads.assignAll(data);
      _updateChartData();
    } catch (e) {
      log("Error fetching leads: $e");
    } finally {
      isLoading.value = false;
    }
  }

  final chartData = <Map<String, dynamic>>[].obs;

  void _updateChartData() {
    final now = DateTime.now();
    final List<Map<String, dynamic>> data = [];

    // Last 7 months
    for (int i = 6; i >= 0; i--) {
      final monthDate = DateTime(now.year, now.month - i, 1);
      final monthName = Jiffy.parseFromDateTime(
        monthDate,
      ).format(pattern: 'MMM');

      final count = leads.where((l) {
        return l.createdAt.year == monthDate.year &&
            l.createdAt.month == monthDate.month;
      }).length;

      final orderController = Get.find<OrderController>();
      final ordersCount = orderController.allOrders.where((o) {
        return o.createdAt.year == monthDate.year &&
            o.createdAt.month == monthDate.month;
      }).length;

      data.add({
        'month': monthName,
        'leads': count.toDouble(),
        'orders': ordersCount.toDouble(),
      });
    }
    chartData.assignAll(data);
  }
}
