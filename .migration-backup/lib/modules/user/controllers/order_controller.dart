import 'dart:developer';

import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/modules/common/controllers/auth_controller.dart';
import 'package:booksmart/services/crud_service.dart';
import 'package:booksmart/supabase/tables.dart';
import 'package:booksmart/utils/supabase.dart';
import 'package:get/get.dart';
import '../../../helpers/currency_formatter.dart';
import '../../../models/order_model.dart';
import '../../common/controllers/chat_controller.dart';
import 'package:booksmart/services/storage_service.dart';
import 'package:booksmart/supabase/buckets.dart';

import 'package:booksmart/models/user_base_model.dart';
import 'package:booksmart/modules/user/controllers/tax_document_controller.dart';
import 'package:booksmart/widgets/snackbar.dart';
import 'package:booksmart/widgets/loading.dart';

class OrderController extends GetxController {
  final isLoading = false.obs;

  // For order creation
  final titleController = TextEditingController();
  final cancellationController = TextEditingController();
  final descriptionController = TextEditingController();
  final amountController = TextEditingController();
  final daysToCompleteController = TextEditingController();
  final expirationDate = Rx<DateTime?>(null);
  final selectedServices = <String>[].obs;

  final activeOrders = <OrderModel>[].obs;
  final allOrders = <OrderModel>[].obs;

  @override
  void onInit() {
    super.onInit();
    final person = Get.find<AuthController>().person;
    if (person != null) {
      fetchActiveOrders();
      if (person.role == UserRole.cpa) {
        fetchAllOrders();
      }
    }
  }

  @override
  void onClose() {
    titleController.dispose();
    descriptionController.dispose();
    amountController.dispose();
    cancellationController.dispose();
    daysToCompleteController.dispose();
    super.onClose();
  }

  Future<bool> createOrder({
    required int userId,
    List<String>? deliverables,
  }) async {
    double price = CurrencyUtils.parse(amountController.text);
    // Validation
    if (titleController.text.trim().isEmpty ||
        price <= 0 ||
        daysToCompleteController.text.trim().isEmpty ||
        expirationDate.value == null) {
      showSnackBar("Please fill in all required fields", isError: true);
      return false;
    }

    try {
      isLoading.value = true;
      final cpaId = Get.find<AuthController>().person?.id;

      if (cpaId == null) {
        showSnackBar("Authentication error: User not found", isError: true);
        return false;
      }

      final data = {
        'cpa_id': cpaId,
        'user_id': userId,
        'title': titleController.text.trim(),
        'description': descriptionController.text.trim(),
        'amount': price,
        'status': OrderStatus.pending.name,
        'days_to_complete': int.tryParse(daysToCompleteController.text.trim()),
        'expiration_date': expirationDate.value?.toIso8601String(),
        'services': selectedServices.toList(),
        if (deliverables != null) 'deliverables': deliverables,
        if (cancellationController.text.trim().isNotEmpty)
          'cancellation_policy': cancellationController.text.trim(),
      };

      final result = await SupabaseCrudService.insert(
        table: SupabaseTable.orders,
        data: data,
      );

      if (result != null) {
        // Handle automated chat message
        _sendOrderCreationChatMessage(result);

        _clearForm();
        showSnackBar("Order request sent successfully!");
        return true;
      } else {
        showSnackBar("Failed to send order request", isError: true);
        return false;
      }
    } catch (e) {
      log("Error creating order: $e");
      showSnackBar("An error occurred: ${e.toString()}", isError: true);
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  void _sendOrderCreationChatMessage(dynamic result) {
    try {
      if (Get.isRegistered<ChatController>()) {
        final chatController = Get.find<ChatController>();
        String orderIdStr = "";
        if (result is List && result.isNotEmpty) {
          orderIdStr = "Order #${result[0]['id']}";
        }
        final msg =
            "Order Request Sent $orderIdStr\nTitle: ${titleController.text.trim()}\nAmount: \$${amountController.text.trim()}\n\nPlease check your dashboard for details.";
        chatController.sendMessage(msg);
      }
    } catch (e) {
      log("Error sending auto-message: $e");
    }
  }

  Future<void> fetchActiveOrders() async {
    try {
      isLoading.value = true;
      final person = Get.find<AuthController>().person;
      if (person == null) return;

      final isCpa = person.role == UserRole.cpa;
      final userId = person.id;

      var query = supabase
          .from(SupabaseTable.orders)
          .select(isCpa ? '*, user:user_id(*)' : '*, cpa:cpa_id(*)')
          .neq('status', OrderStatus.cancelled.name)
          .neq('status', OrderStatus.completed.name);

      if (isCpa) {
        query = query.eq('cpa_id', userId);
      } else {
        query = query.eq('user_id', userId);
      }

      final result = await query.order('created_at', ascending: false);

      activeOrders.value = (result as List)
          .map((e) => OrderModel.fromJson(e))
          .toList();
    } catch (e) {
      log("Error fetching active orders: $e");
      // Optional: showSnackBar("Failed to load orders", isError: true);
    } finally {
      isLoading.value = false;
    }
  }

  Future<void> fetchAllOrders() async {
    try {
      final person = Get.find<AuthController>().person;
      if (person == null || person.role != UserRole.cpa) return;

      final result = await supabase
          .from(SupabaseTable.orders)
          .select('*, user:user_id(*)')
          .eq('cpa_id', person.id)
          .order('created_at', ascending: false);

      allOrders.value = (result as List)
          .map((e) => OrderModel.fromJson(e))
          .toList();
    } catch (e) {
      log("Error fetching all orders: $e");
    }
  }

  Future<void> updateOrderStatus(int orderId, OrderStatus status) async {
    try {
      isLoading.value = true;
      await SupabaseCrudService.update(
        table: SupabaseTable.orders,
        data: {'status': status.name},
        filters: {'id': orderId},
      );

      await fetchActiveOrders();

      if (status == OrderStatus.accepted) {
        showSnackBar("Order accepted!");
      } else if (status == OrderStatus.rejected) {
        showSnackBar("Order declined.", begroundColor: Colors.orange);
      }
    } catch (e) {
      log("Error updating order status: $e");
      showSnackBar("Failed to update status", isError: true);
    } finally {
      isLoading.value = false;
    }
  }

  Future<void> deliverOrder({
    required int orderId,
    required String message,
    required List<XFile> files,
    List<String> existingFiles = const [],
    List<Map<String, dynamic>>? fileMetadata,
    int? clientUserId,
  }) async {
    try {
      showLoading();
      isLoading.value = true;
      List<String> uploadedUrls = [];

      final taxDocCtrl = Get.isRegistered<TaxDocumentController>()
          ? Get.find<TaxDocumentController>()
          : Get.put(TaxDocumentController());

      final authController = Get.find<AuthController>();
      final cpaId = authController.person?.id;

      // 1. Upload Files loop
      for (int i = 0; i < files.length; i++) {
        final file = files[i];
        final metadata = (fileMetadata != null && i < fileMetadata.length)
            ? fileMetadata[i]
            : null;

        String? finalUrl;

        // Formal Upload with metadata
        if (metadata != null && clientUserId != null) {
          finalUrl = (await taxDocCtrl.uploadDocument(
            name: metadata['name'] ?? file.name,
            taxYear: metadata['year']?.toString(),
            category: metadata['category'],
            userId: clientUserId,
            orderId: orderId,
            cpaId: cpaId,
            manualFile: file,
          )) as String?;
        }

        // Fallback to storage directly
        finalUrl ??= await uploadFileToSupabaseStorage(
          file: file,
          bucketName: SupabaseStorageBucket.documents,
        );

        if (finalUrl != null) {
          uploadedUrls.add(finalUrl);
        } else {
          // Break the flow if a file fails to upload to prevent empty deliveries
          throw Exception("Could not upload file: ${file.name}");
        }
      }

      // 2. Update Database
      await SupabaseCrudService.update(
        table: SupabaseTable.orders,
        data: {
          'status': OrderStatus.delivered.name,
          'deliver_message': message,
          'deliver_at': DateTime.now().toIso8601String(),
          'delivery_files': [...existingFiles, ...uploadedUrls],
        },
        filters: {'id': orderId},
      );

      // 3. Refresh and UI Close
      await fetchActiveOrders();

      dismissLoadingWidget();

      // Close delivery dialog/bottomsheet ONLY on success
      if (Get.isDialogOpen ?? false) {
        Get.back();
      }

      showSnackBar("Order delivered successfully!");
    } catch (e) {
      dismissLoadingWidget();
      log("Error delivering order: $e");
      showSnackBar("Delivery failed: ${e.toString()}", isError: true);
    } finally {
      isLoading.value = false;
    }
  }

  void _clearForm() {
    titleController.clear();
    descriptionController.clear();
    amountController.clear();
    cancellationController.clear();
    daysToCompleteController.clear();
    expirationDate.value = null;
    selectedServices.clear();
  }
}
