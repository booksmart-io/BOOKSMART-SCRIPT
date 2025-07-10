import 'package:booksmart/models/service_model.dart';
import 'package:booksmart/services/crud_service.dart';
import 'package:booksmart/supabase/tables.dart';
import 'package:booksmart/widgets/loading.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

class ServiceController extends GetxController {
  final int cpaId;
  ServiceController({required this.cpaId});

  RxList<ServiceModel> services = <ServiceModel>[].obs;
  RxBool isLoading = true.obs;

  @override
  void onInit() {
    super.onInit();
    fetchServices();
  }

  Future<void> fetchServices() async {
    isLoading.value = true;
    try {
      final res = await SupabaseCrudService.read(
        table: SupabaseTable.cpaServices,
        filters: {"cpa_id": cpaId},
      );
      if (res != null && res is List) {
        services.value = res.map((e) => ServiceModel.fromJson(e)).toList();
      }
    } catch (e) {
      debugPrint("Error fetching services: $e");
    } finally {
      isLoading.value = false;
    }
  }

  Future<bool> addService({
    required String title,
    required String description,
    required double price,
  }) async {
    showLoading();
    try {
      await SupabaseCrudService.create(
        table: SupabaseTable.cpaServices,
        data: {
          "title": title,
          "description": description,
          "price": price,
          "cpa_id": cpaId,
        },
      );
      await fetchServices();
      return true;
    } catch (e) {
      Get.snackbar("Error", "Failed to add service");
      return false;
    } finally {
      dismissLoadingWidget();
    }
  }

  Future<bool> updateService({
    required int serviceId,
    required String title,
    required String description,
    required double price,
  }) async {
    showLoading();
    try {
      await SupabaseCrudService.update(
        table: SupabaseTable.cpaServices,
        filters: {"id": serviceId},
        data: {"title": title, "description": description, "price": price},
      );
      await fetchServices();
      return true;
    } catch (e) {
      Get.snackbar("Error", "Failed to update service");
      return false;
    } finally {
      dismissLoadingWidget();
    }
  }

  Future<bool> deleteService(int serviceId) async {
    try {
      await SupabaseCrudService.delete(
        table: SupabaseTable.cpaServices,
        filters: {"id": serviceId},
        isShowLoading: true,
      );
      services.removeWhere((e) => e.id == serviceId);
      return true;
    } catch (e) {
      Get.snackbar("Error", "Failed to delete service");
      return false;
    }
  }
}
