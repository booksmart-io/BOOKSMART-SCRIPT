import 'dart:convert';
import 'dart:developer';

import 'package:booksmart/modules/user/controllers/bank_controller.dart';
import 'package:booksmart/services/edge_functions.dart';
import 'package:booksmart/widgets/loading.dart';
import 'package:booksmart/widgets/snackbar.dart';
import 'package:plaid_flutter/plaid_flutter.dart';

import '../../common/controllers/auth_controller.dart';
import '../controllers/organization_controller.dart';

Future<void> hanldePlaidBankConnection({int? bankId}) async {
  if (authUser == null || getCurrentOrganization == null) {
    showSnackBar("User or Organization not found", isError: true);
    return;
  }
  showLoading();

  String? linkToken = await getPlaidToken(bankId: bankId);

  if (linkToken == null) {
    dismissLoadingWidget();
    showSnackBar("Unable to get link token", isError: true);
    return;
  }

  LinkTokenConfiguration configuration = LinkTokenConfiguration(
    token: linkToken,
  );

  await PlaidLink.create(configuration: configuration);

  PlaidLink.onSuccess.listen((success) async {
    Map<String, dynamic> data = success.toJson();
    log("Success: ${jsonEncode(data)}");

    if (bankId == null) {
      try {
        await connectPlaidBank(
          _getPlaidBody(
            publicToken: success.publicToken,
            metadata: success.metadata,
            userId: authUser!.id.toString(),
            orgId: getCurrentOrganization!.id.toString(),
          ),
        );
        dismissLoadingWidget();
        showSnackBar("Bank connected successfully");
      } catch (e, s) {
        log(e.toString());
        log(s.toString());
        dismissLoadingWidget();
        showSnackBar("Bank connection failed", isError: true);
      } finally {
        bankControllerInstance.loadBanks();
      }
    } else {
      try {
        await refreshPlaidAccessToken(
          bankId: bankId,
          publicToken: success.publicToken,
        );
        dismissLoadingWidget();
        showSnackBar("Bank refreshed successfully");
      } catch (e, s) {
        log(e.toString());
        log(s.toString());
        dismissLoadingWidget();
        showSnackBar("Bank refresh failed", isError: true);
      } finally {
        bankControllerInstance.loadBanks();
      }
    }
  });

  PlaidLink.onExit.listen((exit) {
    log("Exit: ${jsonEncode(exit.toJson())}");
    dismissLoadingWidget();
    showSnackBar("Bank connection failed", isError: true);
  });

  PlaidLink.open();
}

Map<String, dynamic> _getPlaidBody({
  required String publicToken,
  required LinkSuccessMetadata metadata,
  required String userId,
  required String orgId,
}) {
  return <String, dynamic>{
    'user_id': userId,
    'org_id': orgId,
    'publicToken': publicToken,
    'institution': {
      'id': metadata.institution?.id,
      'name': metadata.institution?.name,
    },
  };
}

Future<void> handleSyncBankTransactions({required int bankId}) async {
  showLoading();

  await syncBankTransactions(bankId)
      .then((Map<String, dynamic>? responseJson) {
        dismissLoadingWidget();

        bankControllerInstance.loadBanks();
        if (responseJson == null) {
          showSnackBar("Sync failed", isError: true);
          return;
        }
        final stats = responseJson['stats'] as Map<String, dynamic>;
        List<String> parts = [];
        if (stats['added'] > 0) {
          parts.add("${stats['added']} Transactions added");
        }
        if (stats['modified'] > 0) {
          parts.add("${stats['modified']} Transactions modified");
        }
        if (stats['removed'] > 0) {
          parts.add("${stats['removed']} Transactions removed");
        }

        String message = parts.isEmpty ? "No changes found" : parts.join(', ');
        showSnackBar(message, title: "Sync complete");
      })
      .onError((e, x) {
        log(e.toString());
        log(x.toString());
        dismissLoadingWidget();
        showSnackBar("Unable to sync bank", isError: true);
      });
}
