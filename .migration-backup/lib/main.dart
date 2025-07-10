// ignore_for_file: deprecated_member_use

import 'dart:developer';
import 'package:booksmart/constant/env_data.dart';
import 'package:booksmart/modules/common/providers/auth_provider.dart';
import 'package:booksmart/utils/initial_utils.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:get/get.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_strategy/url_strategy.dart';
import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/routes/pages.dart';

import 'modules/common/ui/error_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  setPathUrlStrategy();

  await Future.wait([
    Supabase.initialize(
      url: 'https://pvppwmkswnluidlwnnck.supabase.co',
      anonKey:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2cHB3bWtzd25sdWlkbHdubmNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2ODg1MjgsImV4cCI6MjA4MDI2NDUyOH0.Sa9fKeEn0jbbvswuyABNHrpb01E4iKfI65_1HgfPWsM',
    ),
    dotenv.load(fileName: ".env"),
  ]);
  Stripe.publishableKey = getStripeTestPublishKey;
  Stripe.instance.applySettings();

  log("isUserLoggedin: $isUserLoggedIn");

  String initialRoute = await getInitialRoute();
  runApp(MyApp(initialRoute: initialRoute));
}

class MyApp extends StatelessWidget {
  const MyApp({super.key, required this.initialRoute});
  final String initialRoute;

  @override
  Widget build(BuildContext context) {
    return GetMaterialApp(
      title: 'BookSmart',
      debugShowCheckedModeBanner: false,
      scaffoldMessengerKey: scaffoldMessengerKey,
      navigatorKey: navigatorKey,
      theme: AppTheme.lightTheme(),
      darkTheme: AppTheme.darkTheme(),
      themeMode: ThemeMode.dark,
      initialRoute: initialRoute,
      getPages: AppPages.routes,
      defaultTransition: kIsWeb ? Transition.noTransition : null,
      unknownRoute: GetPage(name: '/notfound', page: () => ErrorScreen()),
    );
  }
}
