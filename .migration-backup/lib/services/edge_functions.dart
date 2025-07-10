// ignore_for_file: constant_identifier_names

import 'dart:convert';
import 'dart:developer';

import 'package:booksmart/models/response_model.dart';
import 'package:booksmart/models/stripe_product_model.dart';
import 'package:booksmart/widgets/loading.dart';
import 'package:get/get.dart';

import '../utils/supabase.dart';

/// provide bank_id to refresh token
Future getPlaidToken({int? bankId}) async {
  return GetConnect()
      .post(
        'https://pvppwmkswnluidlwnnck.supabase.co/functions/v1/get_plad_token',
        bankId == null ? {} : {'bank_id': bankId},
        headers: {
          'Authorization':
              'Bearer ${supabase.auth.currentSession?.accessToken}',
          'Content-Type': 'application/json',
        },
      )
      .then((response) {
        log(jsonEncode(response.bodyString));
        if (response.isOk) {
          String? linkToken = response.body['link_token'];
          return linkToken;
        }
        return null;
      })
      .onError((e, x) {
        log(e.toString());
        log(x.toString());
        return null;
      });
}

Future<bool> connectPlaidBank(Map<String, dynamic> body) async {
  return GetConnect()
      .post(
        'https://pvppwmkswnluidlwnnck.supabase.co/functions/v1/plaid-connect-bank',
        body,
        headers: {
          'Authorization':
              'Bearer ${supabase.auth.currentSession?.accessToken}',
          'Content-Type': 'application/json',
        },
      )
      .then((value) {
        return true;
      })
      .onError((e, x) {
        log(e.toString());
        log(x.toString());
        return false;
      });
}

Future<bool> refreshPlaidAccessToken({
  required int bankId,
  required String publicToken,
}) async {
  return GetConnect()
      .post(
        'https://pvppwmkswnluidlwnnck.supabase.co/functions/v1/plaid_refresh_access_token',
        {'bank_id': bankId, 'public_token': publicToken},
        headers: {
          'Authorization':
              'Bearer ${supabase.auth.currentSession?.accessToken}',
          'Content-Type': 'application/json',
        },
      )
      .then((response) {
        log(jsonEncode(response.bodyString));
        if (response.isOk) {
          return true;
        }
        return false;
      })
      .onError((e, x) {
        log(e.toString());
        log(x.toString());
        return false;
      });
}

///{
///  "success": true,
///  "bank_id": 1,
///  "loops": 1,
///
///  "stats": {
///    "added": 0,
///    "modified": 0,
///    "removed": 0,
///    "upserted": 0,
///    "deleted": 0
///  },
///
///  "last_synced_at": "2026-01-21T06:26:14.797Z"
///}
Future<Map<String, dynamic>?> syncBankTransactions(int bankId) async {
  return GetConnect()
      .post(
        'https://pvppwmkswnluidlwnnck.supabase.co/functions/v1/plad_transaction_sync',
        {'bank_id': bankId},
        headers: {
          'Authorization':
              'Bearer ${supabase.auth.currentSession?.accessToken}',
          'Content-Type': 'application/json',
        },
      )
      .then((response) {
        log(jsonEncode(response.bodyString));
        if (response.isOk) {
          return response.body as Map<String, dynamic>?;
        }
        return null;
      })
      .onError((e, x) {
        log(e.toString());
        log(x.toString());
        return null;
      });
}

enum StripeCardAction {
  create_setup_intent,
  list_cards,
  set_default_card,
  delete_card,
}

/// Payload can be null if [action] is list_cards,
Future<Map<String, dynamic>> handleStripeCardManagement({
  required StripeCardAction action,
  String? paymentMethodId,
  bool isTestMode = true,
}) async {
  final String url =
      'https://pvppwmkswnluidlwnnck.supabase.co/functions/v1/stripe_card_manager${isTestMode ? "?test=true" : ""}';

  final session = supabase.auth.currentSession;
  if (session == null) throw Exception("User not logged in");

  final response = await GetConnect(timeout: Duration(seconds: 30)).post(
    url,
    jsonEncode({
      'action': action.name,
      'payload': paymentMethodId == null
          ? {}
          : {"payment_method_id": paymentMethodId},
    }),
    headers: {
      'Authorization': 'Bearer ${supabase.auth.currentSession?.accessToken}',
      'Content-Type': 'application/json',
    },
  );
  log(response.bodyString ?? "handleStripeCardManagement ::: null");

  if (response.statusCode != 200) {
    throw Exception('Error: ${response.body}');
  }

  return jsonDecode(response.bodyString ?? "{}") as Map<String, dynamic>;
}

enum StripeBusinessAccountAction {
  create_account,
  start_onboarding,
  open_dashboard,
  get_business_account_info,
}

///
/// {
///   "success": true,
///   "account_exists": true,
///   "stripe_account_id": "acct_1T8pVpR84xNUdMa7",
///   "onboarding_complete": true,
///   "payouts_enabled": true,
///   "charges_enabled": true,
///   "pending_requirements": [],
///   "balance_available": 0,
///   "balance_pending": 0
/// }
Future<Map<String, dynamic>> stripeConnectCPA({
  required StripeBusinessAccountAction action,
  Map<String, dynamic>? payload,
  bool isTestMode = true,
}) async {
  final session = supabase.auth.currentSession;
  if (session == null) throw Exception("User not logged in");

  final url = Uri.parse(
    'https://pvppwmkswnluidlwnnck.supabase.co/functions/v1/stripe_connect${isTestMode ? "?test=true" : ""}',
  );

  final response = await GetConnect().post(
    url.toString(),
    jsonEncode({'action': action.name, 'payload': payload ?? {}}),
    headers: {
      'Authorization': 'Bearer ${supabase.auth.currentSession?.accessToken}',
      'Content-Type': 'application/json',
    },
  );

  log(response.bodyString ?? "callStripeCPA ::: null");

  if (response.statusCode != 200) {
    throw Exception(response.bodyString ?? 'Unknown error');
  }

  return jsonDecode(response.bodyString ?? '{}') as Map<String, dynamic>;
}

Future<String?> processCpaOrderPayment({
  required int orderId,
  bool isTestMode = true,
}) async {
  try {
    final url = Uri.parse(
      'https://pvppwmkswnluidlwnnck.supabase.co/functions/v1/cpa_order_payment${isTestMode ? "?test=true" : ""}',
    );

    final response = await GetConnect(timeout: const Duration(seconds: 30))
        .post(
          url.toString(),
          jsonEncode({'order_id': orderId}),
          headers: {
            'Authorization':
                'Bearer ${supabase.auth.currentSession?.accessToken}',
            'Content-Type': 'application/json',
          },
        );

    log(response.bodyString ?? "processCpaOrderPayment ::: null");

    if (response.bodyString == null) {
      return "Unable to process payment. Please try again.";
    }

    final Map<String, dynamic> data = jsonDecode(response.bodyString!);

    if (response.isOk && data['success'] == true) {
      return null;
    }

    return data['error'] ??
        "Something went wrong while processing the payment.";
  } catch (e, x) {
    log(e.toString());
    log(x.toString());
    return "Something went wrong while processing the payment.";
  }
}

Future<Map<String, dynamic>> aiCategorization() async {
  final session = supabase.auth.currentSession;
  if (session == null) throw Exception("User not logged in");

  showLoading();
  log("Start Time: ${DateTime.now().toIso8601String()}");

  final response = await GetConnect(timeout: Duration(seconds: 60)).get(
    'https://pvppwmkswnluidlwnnck.supabase.co/functions/v1/ai_categorization',
    headers: {
      'Authorization': 'Bearer ${supabase.auth.currentSession?.accessToken}',
      'Content-Type': 'application/json',
    },
  );
  log("End Time: ${DateTime.now().toIso8601String()}");

  dismissLoadingWidget();

  log(response.bodyString ?? "aiCategorization ::: null");

  log("StatusCode: ${response.statusCode}");

  return jsonDecode(response.bodyString ?? '{}') as Map<String, dynamic>;
}

Future<ResponseModel> getStripeSubscriptionPlans() async {
  log(supabase.auth.currentSession?.accessToken ?? "---");
  return GetConnect(timeout: Duration(seconds: 60))
      .post(
        'https://pvppwmkswnluidlwnnck.supabase.co/functions/v1/get-subscription-plans?test=true',
        jsonEncode({}),
        headers: {
          'Authorization':
              'Bearer ${supabase.auth.currentSession?.accessToken}',
          'Content-Type': 'application/json',
        },
      )
      .then((response) {
        log("StatusCode: ${response.statusCode}");

        log(response.bodyString ?? "getSubscriptionPlans ::: null");

        Map<String, dynamic> data = jsonDecode(response.bodyString ?? '{}');

        if (!response.isOk) {
          return ResponseModel.error(
            error: data['error'] ?? 'Unable to load subscription plans.',
            statusCode: response.statusCode,
          );
        }

        final rawPlans = data["plans"] ?? data["data"];

        if (rawPlans is! List) {
          return ResponseModel.error(
            error: 'Subscription plans response is invalid.',
            statusCode: response.statusCode,
          );
        }

        if (rawPlans.isNotEmpty && rawPlans.first is Map) {
          final firstPlan = rawPlans.first as Map;
          if (firstPlan['object'] == 'payment_method') {
            return ResponseModel.error(
              error:
                  'Loaded saved cards instead of subscription plans. Please check the get-subscription-plans endpoint.',
              statusCode: response.statusCode,
            );
          }
        }

        return ResponseModel.value(
          rawPlans.where((e) => e is Map && e['prices'] is List).map((e) {
            return StripePlan.fromJson(e);
          }).toList(),
          response.statusCode,
        );
      })
      .onError((error, stackTrace) {
        log(error.toString());
        log(stackTrace.toString());
        return ResponseModel.error(error: error.toString(), statusCode: null);
      });
}

Future<Map<String, dynamic>> createStripeSubscription({
  required String priceId,
  bool isTestMode = true,
}) async {
  final session = supabase.auth.currentSession;
  if (session == null) throw Exception("User not logged in");

  final response = await GetConnect(timeout: const Duration(seconds: 60)).post(
    'https://pvppwmkswnluidlwnnck.supabase.co/functions/v1/create-subscription${isTestMode ? "?test=true" : ""}',
    jsonEncode({'price_id': priceId}),
    headers: {
      'Authorization': 'Bearer ${session.accessToken}',
      'Content-Type': 'application/json',
    },
  );

  log("StatusCode: ${response.statusCode}");
  log(response.bodyString ?? "createStripeSubscription ::: null");

  final Map<String, dynamic> data =
      jsonDecode(response.bodyString ?? '{}') as Map<String, dynamic>;

  if (!response.isOk) {
    throw Exception(data['error'] ?? 'Subscription creation failed');
  }

  return data;
}

Future<Map<String, dynamic>> purchaseTokens({
  required String priceId,
  bool isTestMode = true,
}) async {
  final session = supabase.auth.currentSession;
  if (session == null) throw Exception("User not logged in");

  final response = await GetConnect(timeout: const Duration(seconds: 60)).post(
    'https://pvppwmkswnluidlwnnck.supabase.co/functions/v1/purchase-tokens${isTestMode ? "?test=true" : ""}',
    jsonEncode({'price_id': priceId}),
    headers: {
      'Authorization': 'Bearer ${session.accessToken}',
      'Content-Type': 'application/json',
    },
  );

  log("StatusCode: ${response.statusCode}");
  log(response.bodyString ?? "purchaseTokens ::: null");

  final Map<String, dynamic> data =
      jsonDecode(response.bodyString ?? '{}') as Map<String, dynamic>;

  if (!response.isOk) {
    throw Exception(data['error'] ?? 'Token purchase failed');
  }

  return data;
}

var x = '''
You are a financial transaction categorization assistant.

STRICT RULES:
- Always return valid JSON array
- Never return null
- Only use provided IDs
- Do NOT guess randomly
- You MUST choose the closest matching category even if not perfect
- Never prefer generic categories over specific ones
- Transportation, Taxi, Ride Share, Uber → Travel
- Use Miscellaneous ONLY if no reasonable match exists

Categories:
[{"id":5,"name":"Other Expense","sub_categories":[{"id":78,"name":"Penalties & Settlements","category_id":5}]},{"id":6,"name":"Income","sub_categories":[{"id":80,"name":"Billable Expense Income","category_id":6},{"id":81,"name":"Discounts","category_id":6},{"id":82,"name":"Gross Receipts","category_id":6},{"id":83,"name":"Interest Earned","category_id":6},{"id":84,"name":"Refunds-Allowances","category_id":6},{"id":85,"name":"Sales","category_id":6},{"id":86,"name":"Shipping & Delivery Income","category_id":6},{"id":87,"name":"Uncategorized Income","category_id":6}]},{"id":7,"name":"Equity","sub_categories":[{"id":79,"name":"Retained Earnings","category_id":7}]},{"id":8,"name":"Cost of Goods Sold (COS)","sub_categories":[{"id":88,"name":"Cost of Labor – COS","category_id":8},{"id":89,"name":"Freight & Delivery – COS","category_id":8},{"id":90,"name":"Other Costs – COS","category_id":8},{"id":91,"name":"Purchases – COS","category_id":8},{"id":92,"name":"Subcontractors – COS","category_id":8},{"id":93,"name":"Supplies & Materials – COGS","category_id":8}]},{"id":9,"name":"Other Current Asset","sub_categories":[{"id":94,"name":"Prepaid Expenses","category_id":9},{"id":95,"name":"Uncategorized Asset","category_id":9},{"id":96,"name":"Undeposited Funds","category_id":9}]},{"id":4,"name":"Expense","sub_categories":[{"id":54,"name":"Advertising","category_id":4},{"id":55,"name":"Bad Debts","category_id":4},{"id":56,"name":"Bank Charges","category_id":4},{"id":57,"name":"Commissions & Fees","category_id":4},{"id":58,"name":"Cost of Labor – COS","category_id":4},{"id":59,"name":"Disposal Fees","category_id":4},{"id":60,"name":"Dues & Subscriptions","category_id":4},{"id":61,"name":"Freight & Delivery","category_id":4},{"id":62,"name":"Legal & Professional Fees","category_id":4},{"id":63,"name":"Meals and Entertainment","category_id":4},{"id":64,"name":"Miscellaneous","category_id":4},{"id":65,"name":"Office Expenses","category_id":4},{"id":66,"name":"Promotional","category_id":4},{"id":67,"name":"Rent or Lease","category_id":4},{"id":68,"name":"Repair & Maintenance","category_id":4},{"id":69,"name":"Shipping & Delivery Expense","category_id":4},{"id":70,"name":"Stationery & Printing","category_id":4},{"id":71,"name":"Subcontractors","category_id":4},{"id":72,"name":"Supplies","category_id":4},{"id":73,"name":"Taxes & Licenses","category_id":4},{"id":74,"name":"Tools","category_id":4},{"id":75,"name":"Travel","category_id":4},{"id":76,"name":"Travel Meals","category_id":4},{"id":77,"name":"Utilities","category_id":4}]}]

Transactions:
[{"id":124,"title":"McDonald's","description":"McDonald's | McDonald's | mcdonalds.com","plaid_category":{"primary":"FOOD_AND_DRINK","version":"v2","detailed":"FOOD_AND_DRINK_FAST_FOOD","confidence_level":"VERY_HIGH"}},{"id":125,"title":"Starbucks","description":"Starbucks | Starbucks | starbucks.com","plaid_category":{"primary":"FOOD_AND_DRINK","version":"v2","detailed":"FOOD_AND_DRINK_COFFEE","confidence_level":"VERY_HIGH"}},{"id":126,"title":"SparkFun","description":"SparkFun | FUN","plaid_category":{"primary":"ENTERTAINMENT","version":"v2","detailed":"ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS","confidence_level":"LOW"}},{"id":127,"title":"Uber 072515 SF**POOL**","description":"Uber 072515 SF**POOL** | Uber | uber.com","plaid_category":{"primary":"TRANSPORTATION","version":"v2","detailed":"TRANSPORTATION_TAXIS_AND_RIDE_SHARES","confidence_level":"VERY_HIGH"}},{"id":128,"title":"Uber 063015 SF**POOL**","description":"Uber 063015 SF**POOL** | Uber | uber.com","plaid_category":{"primary":"TRANSPORTATION","version":"v2","detailed":"TRANSPORTATION_TAXIS_AND_RIDE_SHARES","confidence_level":"VERY_HIGH"}},{"id":129,"title":"United Airlines","description":"United Airlines | United Airlines | united.com","plaid_category":{"primary":"TRAVEL","version":"v2","detailed":"TRAVEL_FLIGHTS","confidence_level":"VERY_HIGH"}},{"id":130,"title":"McDonald's","description":"McDonald's | McDonald's | mcdonalds.com","plaid_category":{"primary":"FOOD_AND_DRINK","version":"v2","detailed":"FOOD_AND_DRINK_FAST_FOOD","confidence_level":"VERY_HIGH"}},{"id":131,"title":"Starbucks","description":"Starbucks | Starbucks | starbucks.com","plaid_category":{"primary":"FOOD_AND_DRINK","version":"v2","detailed":"FOOD_AND_DRINK_COFFEE","confidence_level":"VERY_HIGH"}},{"id":132,"title":"SparkFun","description":"SparkFun | FUN","plaid_category":{"primary":"ENTERTAINMENT","version":"v2","detailed":"ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS","confidence_level":"LOW"}},{"id":133,"title":"Uber 072515 SF**POOL**","description":"Uber 072515 SF**POOL** | Uber | uber.com","plaid_category":{"primary":"TRANSPORTATION","version":"v2","detailed":"TRANSPORTATION_TAXIS_AND_RIDE_SHARES","confidence_level":"VERY_HIGH"}},{"id":134,"title":"Uber 063015 SF**POOL**","description":"Uber 063015 SF**POOL** | Uber | uber.com","plaid_category":{"primary":"TRANSPORTATION","version":"v2","detailed":"TRANSPORTATION_TAXIS_AND_RIDE_SHARES","confidence_level":"VERY_HIGH"}},{"id":135,"title":"United Airlines","description":"United Airlines | United Airlines | united.com","plaid_category":{"primary":"TRAVEL","version":"v2","detailed":"TRAVEL_FLIGHTS","confidence_level":"VERY_HIGH"}},{"id":140,"title":"Uber 072515 SF**POOL**","description":"Uber 072515 SF**POOL** | Uber | uber.com","plaid_category":{"primary":"TRANSPORTATION","version":"v2","detailed":"TRANSPORTATION_TAXIS_AND_RIDE_SHARES","confidence_level":"VERY_HIGH"}},{"id":4,"title":"Uber 063015 SF**POOL**","description":"Uber 063015 SF**POOL** | Uber | uber.com","plaid_category":{"primary":"TRANSPORTATION","version":"v2","detailed":"TRANSPORTATION_TAXIS_AND_RIDE_SHARES","confidence_level":"VERY_HIGH"}},{"id":5,"title":"United Airlines","description":"United Airlines | United Airlines | united.com","plaid_category":{"primary":"TRAVEL","version":"v2","detailed":"TRAVEL_FLIGHTS","confidence_level":"VERY_HIGH"}}]

Return ONLY JSON array:
[
  {
    "id": number,
    "category_id": number,
    "sub_category_id": number
  }
]

''';

/*
              curl -L -X POST 'https://pvppwmkswnluidlwnnck.supabase.co/functions/v1/get-subscription-plans' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsImtpZCI6Im9wbEtraTNZYTFMY0I4RTEiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3B2cHB3bWtzd25sdWlkbHdubmNrLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI2NmVjMWZhNi0wYTIyLTQ0ZTAtYTM4ZC03Y2Q0OTY0MTUwODIiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzgxMTQxMTMyLCJpYXQiOjE3ODExMzc1MzIsImVtYWlsIjoic2hhaHphZHFhaXNhcmtoYW5AZ21haWwuY29tIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbCI6InNoYWh6YWRxYWlzYXJraGFuQGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaG9uZV92ZXJpZmllZCI6ZmFsc2UsInJvbGUiOiJ1c2VyIiwic3ViIjoiNjZlYzFmYTYtMGEyMi00NGUwLWEzOGQtN2NkNDk2NDE1MDgyIn0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoicGFzc3dvcmQiLCJ0aW1lc3RhbXAiOjE3ODExMzc1MzJ9XSwic2Vzc2lvbl9pZCI6ImM5YWMxMTNlLThlMzQtNGM5ZC1hOTQ4LWRjYzA4ZDRlYzg0ZiIsImlzX2Fub255bW91cyI6ZmFsc2V9.WKBrV08LZUwUMNHQX03HlChuWqO_2wyEJPga7rjdpz0' \
  -H 'Content-Type: application/json' \
  -H 'apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2cHB3bWtzd25sdWlkbHdubmNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2ODg1MjgsImV4cCI6MjA4MDI2NDUyOH0.Sa9fKeEn0jbbvswuyABNHrpb01E4iKfI65_1HgfPWsM' \
  --data '{"name":"Functions"}'
{"message":"Invalid credentials","code":"INVALID_CREDENTIALS"}   

*/
