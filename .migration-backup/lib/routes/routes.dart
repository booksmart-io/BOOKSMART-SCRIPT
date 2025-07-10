abstract class Routes {
  static const String login = '/login';
  static const String forgotReset = '/forgot-reset';
  static const String signUp = '/sign-up';
  static const String verifyEmail = '/verify-email';

  /// The bottom-bar screen for mobile and side-bar for web
  static const String userHome = '/user/';

  // web-side-bar routes
  static const String tax = '/user/tax';
  static const String cpaNetwork = '/user/cpa-network';
  static const String userOrders = '/user/orders';
  static const String tokens = '/user/token';
  static const String report = '/user/reports';
  static const String chat = '/user/chat';
  static const String settings = '/user/settings';

  //
  static const String earnTokens = '/user/earn-tokens';
  static const String bulkReview = '/user/bulk-review';
  static const String buyTokens = '/user/buy-tokens';
  static const String streakUnlocked = '/user/streak-unlocked';
  static const String tokenWallet = '/user/token-wallet';
  static const String rulesManagement = '/user/rules-management';
  static const String subscription = '/user/subscription';
  static const String userOrganizations = '/user/organizations';

  static const String aiStrategy = '/user/ai-strategy';
  static const String userProfile = '/user/profile';
  static const String userAIchat = '/user/ai-chat';
  static const String statementReview = '/user/statement-review';

  /// ====
  /// =====
  /// ======
  /// CPA MODULE ROUTES
  /// ======
  /// =====
  /// ====

  static const String cpaHome = '/cpa/';
  static const String cpaLeads = '/cpa/leads';
  static const String cpaOrders = '/cpa/orders';
  static const String cpaBilling = '/cpa/earnings';
  static const String cpaChat = '/cpa/chat';
  static const String cpaSettings = '/cpa/settings';
  static const String cpaProfile = '/cpa/profile';
  static const String cpaProfileUnderReview = '/cpa/profile-under-review';

  /// ====
  /// =====
  /// ======
  /// Admin MODULE ROUTES
  /// ======
  /// =====
  /// ====

  static const String adminHome = '/admin/';
  static const String adminUsers = '/admin/users';
  static const String adminCPAs = '/admin/cpas';
  static const String adminCategories = '/admin/categories';
  static const String adminTaxDeductions = '/admin/tax-deductions';
  static const String adminSettings = '/admin/settings';
  static const String adminChat = '/admin/chat';
}
