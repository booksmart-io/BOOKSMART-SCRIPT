import 'dart:developer';

import 'package:booksmart/models/document_access_request_model.dart';
import 'package:booksmart/models/user_document_model.dart';
import 'package:booksmart/modules/common/controllers/auth_controller.dart';
import 'package:booksmart/supabase/tables.dart';
import 'package:booksmart/utils/supabase.dart';
import 'package:booksmart/widgets/snackbar.dart';
import 'package:booksmart/constant/global_context_key.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

class DocumentAccessController extends GetxController {
  // ── Reactive state ────────────────────────────────────────────────────────

  /// All access requests for the current user (populated by [fetchRequestsForUser]).
  final requests = <DocumentAccessRequest>[].obs;

  /// Documents belonging to a given user (populated by [fetchUserDocuments]).
  final userDocuments = <UserDocument>[].obs;

  final isLoading = false.obs;
  final isSending = false.obs;

  // ── Public API ────────────────────────────────────────────────────────────

  /// Loads all document-access requests where the current user is the **owner**
  /// (i.e. a CPA is requesting access to their documents).
  Future<void> fetchRequestsForUser() async {
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return;

    try {
      isLoading.value = true;

      // Fetch requests where user_id matches the current user's numeric id
      // and join the CPA's profile from the users table aliased as 'cpa'
      final result = await supabase
          .from(SupabaseTable.documentAccessRequests)
          .select(
            'id, order_id, cpa_id, user_id, status, requested_at, responded_at, created_at, updated_at,'
            'cpa:cpa_id(first_name, last_name, email, img_url)',
          )
          .eq('user_id', _currentNumericId())
          .order('created_at', ascending: false);

      requests.value = (result as List)
          .map((e) => DocumentAccessRequest.fromJson(e))
          .toList();
    } catch (e, st) {
      log('DocumentAccessController.fetchRequestsForUser error: $e\n$st');
      Get.snackbar('Error', 'Failed to load access requests');
    } finally {
      isLoading.value = false;
    }
  }

  /// Checks whether [cpaId] has been granted `accepted` access for [orderId].
  Future<bool> checkAccess(int orderId, int cpaId) async {
    try {
      final result = await supabase
          .from(SupabaseTable.documentAccessRequests)
          .select('id, status')
          .eq('order_id', orderId)
          .eq('cpa_id', cpaId)
          .maybeSingle();

      if (result == null) return false;
      return (result['status'] as String?) == 'accepted';
    } catch (e, st) {
      log('DocumentAccessController.checkAccess error: $e\n$st');
      return false;
    }
  }

  /// Returns the request for [orderId] & [cpaId], or for [userId] & [cpaId] if orderId is null.
  Future<DocumentAccessRequest?> getRequest({
    int? orderId,
    required int cpaId,
    int? userId,
  }) async {
    try {
      var query = supabase
          .from(SupabaseTable.documentAccessRequests)
          .select(
            'id, order_id, cpa_id, user_id, status, requested_at, responded_at, created_at, updated_at',
          )
          .eq('cpa_id', cpaId);

      if (orderId != null) {
        final data = await query.eq('order_id', orderId).maybeSingle();
        if (data == null) return null;
        return DocumentAccessRequest.fromJson(data);
      } else if (userId != null) {
        final list = await query
            .eq('user_id', userId)
            .order('created_at', ascending: false)
            .limit(1);
        final List dataList = list as List;
        if (dataList.isEmpty) return null;
        return DocumentAccessRequest.fromJson(dataList.first);
      } else {
        return null;
      }
    } catch (e, st) {
      log('DocumentAccessController.getRequest error: $e\n$st');
      return null;
    }
  }

  /// Sends a new access request from a CPA to a user for a given order or lead.
  Future<bool> sendAccessRequest({
    int? orderId,
    required int cpaId,
    required int userId,
  }) async {
    try {
      isSending.value = true;

      final data = <String, dynamic>{
        'cpa_id': cpaId,
        'user_id': userId,
        'status': 'pending',
        'requested_at': DateTime.now().toIso8601String(),
        'created_at': DateTime.now().toIso8601String(),
        'updated_at': DateTime.now().toIso8601String(),
      };

      if (orderId != null) {
        data['order_id'] = orderId;
      }

      await supabase.from(SupabaseTable.documentAccessRequests).insert(data);
      Get.back();
      showSnackBar('Request Sent');
      // Get.snackbar('Request Sent', 'Document access request sent successfully');
      return true;
    } catch (e, st) {
      log('DocumentAccessController.sendAccessRequest error: $e\n$st');
      // Handle duplicate (already requested)
      if (e.toString().contains('unique') || e.toString().contains('23505')) {
        Get.snackbar(
          'Already Requested',
          'You have already sent an access request for this order',
        );
      } else {
        Get.snackbar('Error', 'Failed to send access request');
      }
      return false;
    } finally {
      isSending.value = false;
    }
  }

  /// Updates the status of an existing request (accept / reject).
  Future<void> updateStatus(int requestId, DocumentAccessStatus status) async {
    try {
      isLoading.value = true;

      await supabase
          .from(SupabaseTable.documentAccessRequests)
          .update({
            'status': status.name,
            'responded_at': DateTime.now().toIso8601String(),
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', requestId);

      // Update local list
      final idx = requests.indexWhere((r) => r.id == requestId);
      if (idx != -1) {
        final old = requests[idx];
        requests[idx] = DocumentAccessRequest(
          id: old.id,
          orderId: old.orderId,
          cpaId: old.cpaId,
          userId: old.userId,
          status: status,
          requestedAt: old.requestedAt,
          respondedAt: DateTime.now(),
          createdAt: old.createdAt,
          updatedAt: DateTime.now(),
          cpaFirstName: old.cpaFirstName,
          cpaLastName: old.cpaLastName,
          cpaEmail: old.cpaEmail,
          cpaImageUrl: old.cpaImageUrl,
        );
        requests.refresh();
      }

      Get.snackbar('Updated', 'Request ${status.name}');
    } catch (e, st) {
      log('DocumentAccessController.updateStatus error: $e\n$st');
      Get.snackbar('Error', 'Failed to update status');
    } finally {
      isLoading.value = false;
    }
  }

  /// Deletes a request (used when user rejects or removes access).
  Future<void> deleteRequest(int requestId) async {
    try {
      isLoading.value = true;

      // Using select() to verify if any rows were actually affected by the delete
      final List result = await supabase
          .from(SupabaseTable.documentAccessRequests)
          .delete()
          .eq('id', requestId)
          .select();

      log('Delete request result: $result');

      if (result.isEmpty) {
        log('⚠️ Warning: No rows were deleted for request ID: $requestId. This might be due to RLS policies.');
      }

      // Update local list
      requests.removeWhere((r) => r.id == requestId);
      requests.refresh();

      // Use ScaffoldMessenger for a more stable notification that doesn't rely on GetX's overlay context
      scaffoldMessengerKey.currentState?.showSnackBar(
        SnackBar(
          content: const Text('Access request removed'),
          backgroundColor: Colors.green,
          duration: const Duration(seconds: 2),
        ),
      );
    } catch (e, st) {
      log('DocumentAccessController.deleteRequest error: $e\n$st');
      scaffoldMessengerKey.currentState?.showSnackBar(
        SnackBar(
          content: Text('Failed to delete request: $e'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      isLoading.value = false;
    }
  }

  /// Fetches documents for a user.
  ///
  Future<void> fetchUserDocuments(int userId) async {
    try {
      isLoading.value = true;
      userDocuments.clear();

      final result = await supabase
          .from(SupabaseTable.userDocuments)
          .select()
          .eq('user_id', userId)
          .order('created_at', ascending: false);

      final List data = result as List;
      log(
        '✅ DocumentAccessController: query success. Found ${data.length} documents for $userId',
      );

      userDocuments.value = data.map((e) => UserDocument.fromJson(e)).toList();
    } catch (e, st) {
      log('❌ DocumentAccessController.fetchUserDocuments error: $e\n$st');
      Get.snackbar('Error', 'Failed to load documents');
    } finally {
      isLoading.value = false;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /// Returns the numeric (bigint) user id of the currently signed-in user.
  int _currentNumericId() {
    return authPerson?.id ?? -1;
  }
}
