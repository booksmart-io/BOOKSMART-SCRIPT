import 'package:flutter_dotenv/flutter_dotenv.dart';

///
/// Stripe
///

String get getStripeTestPublishKey =>
    dotenv.env['STRIPE_TEST_PUBLISH_KEY'] ?? "---";
String get getStripeTestSecretKey =>
    dotenv.env['STRIPE_TEST_SECRET_KEY'] ?? "---";

String get getStripeLivePublishKey =>
    dotenv.env['STRIPE_LIVE_PUBLISH_KEY'] ?? "---";
String get getStripeLiveSecretKey =>
    dotenv.env['STRIPE_LIVE_SECRET_KEY'] ?? "---";

String get getOpenRouterAiTaxKey =>
    dotenv.env['OPENROUTER_AI_TAX_KEY'] ?? "---";
