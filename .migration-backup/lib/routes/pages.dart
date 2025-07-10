import 'dart:developer';

import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/modules/admin/ui/settings_screen.dart';
import 'package:booksmart/modules/common/controllers/auth_controller.dart';
import 'package:booksmart/modules/user/controllers/organization_controller.dart';
import 'package:booksmart/modules/common/providers/auth_provider.dart';
import 'package:booksmart/modules/common/ui/chat/chat_list_screen.dart';
import 'package:booksmart/modules/cpa/ui/profile_screen.dart';
import 'package:booksmart/modules/cpa/ui/profile_under_review_screen.dart';
import 'package:booksmart/modules/cpa/ui/settings_screen.dart';
import 'package:booksmart/modules/common/ui/authentication/login_screen.dart';
import 'package:booksmart/modules/common/ui/authentication/signup_screen.dart';
import 'package:booksmart/modules/user/ui/cpa/dashboard_screen.dart';
import 'package:booksmart/modules/user/ui/cpa/order/orders_list_screen.dart';
import 'package:booksmart/modules/user/ui/home/template/web_template.dart';
import 'package:booksmart/modules/user/ui/bulk_review/bulk_review_screen.dart';
import 'package:booksmart/modules/user/ui/tax_filling/tax_filling.dart';
import 'package:booksmart/modules/user/ui/token/streak_unlocked_screen.dart';
import 'package:booksmart/utils/initial_utils.dart';
import 'package:flutter/foundation.dart';
import 'package:get/get.dart';
import '../models/user_base_model.dart';
import '../modules/admin/ui/categories_screen.dart';
import '../modules/admin/ui/cpa_list_screen.dart';
import '../modules/admin/ui/home/home_screen.dart';
import '../modules/admin/ui/home/template/web_template.dart';
import '../modules/admin/ui/tax_deduction_rules_screen.dart';
import '../modules/admin/ui/user_list_screen.dart';
import '../modules/common/ui/authentication/verify_email_screen.dart';
import '../modules/common/ui/error_screen.dart';
import '../modules/cpa/ui/earning_screen.dart';
import '../modules/cpa/ui/home/home_screen.dart';
import '../modules/cpa/ui/home/template/web_template.dart';
import '../modules/cpa/ui/leads_screen.dart';
import '../modules/cpa/ui/orders_screen.dart';
import '../modules/user/ui/ai_insights/ai_insights_screen.dart';
import '../modules/common/ui/authentication/forgot.dart';
import '../modules/user/ui/ai_insights/subpages/ai_strategy_chatting_screen.dart';
import '../modules/user/ui/financial_statement/financial_statement.dart';
import '../modules/user/ui/home/home_screen.dart';
import '../modules/user/ui/organization/organization_list_screen.dart';
import '../modules/user/ui/profile_screen.dart';
import '../modules/user/ui/rules_management/rules_management_screen.dart';
import '../modules/user/ui/settings/settings_screen.dart';
import '../modules/user/ui/subscription_screen.dart';
import '../modules/user/ui/token/earn_tokens_screen.dart';
import '../modules/user/ui/token/token_purchase_screen.dart';
import '../modules/user/ui/bank_statement/statement_review_screen.dart';

class AppPages {
  static final routes = [
    // external
    GetPage(name: Routes.login, page: () => const LoginScreen()),
    GetPage(
      name: Routes.forgotReset,
      page: () => const ForgotResetPasswordScreen(isReset: true),
    ),
    GetPage(name: Routes.signUp, page: () => const SignupScreen()),
    GetPage(name: Routes.verifyEmail, page: () => const VerifyEmailScreen()),

    // internal-0
    GetPage(
      name: Routes.bulkReview,
      page: () => getRequiredScreen(const BulkReviewScreen(), UserRole.user),
    ),

    GetPage(
      name: Routes.buyTokens,
      page: () => getRequiredScreen(const TokenPurchaseScreen(), UserRole.user),
    ),
    GetPage(
      name: Routes.streakUnlocked,
      page: () =>
          getRequiredScreen(const StreakUnlockedScreen(), UserRole.user),
    ),
    GetPage(
      name: Routes.rulesManagement,
      page: () => getRequiredScreen(
        kIsWeb
            ? WebTemplate(child: RulesManagementScreen())
            : RulesManagementScreen(),
        UserRole.user,
      ),
    ),
    GetPage(
      name: Routes.subscription,
      page: () => getRequiredScreen(const SubscriptionScreen(), UserRole.user),
    ),

    // Web Side-bar
    GetPage(
      name: Routes.userHome,
      page: () => getRequiredScreen(HomeScreen(), UserRole.user),
    ),
    GetPage(
      name: Routes.report,
      page: () => getRequiredScreen(
        kIsWeb
            ? WebTemplate(child: FinancialReportScreen())
            : FinancialReportScreen(),
        UserRole.user,
      ),
    ),
    GetPage(
      name: Routes.tax,
      page: () => getRequiredScreen(
        kIsWeb ? WebTemplate(child: TaxFillingScreen()) : TaxFillingScreen(),
        UserRole.user,
      ),
    ),
    GetPage(
      name: Routes.tokens,
      page: () => getRequiredScreen(
        kIsWeb ? WebTemplate(child: EarnTokensScreen()) : EarnTokensScreen(),
        UserRole.user,
      ),
    ),

    GetPage(
      name: Routes.chat,
      page: () => getRequiredScreen(
        kIsWeb ? WebTemplate(child: ChatListScreen()) : ChatListScreen(),
        UserRole.user,
      ),
    ),
    GetPage(
      name: Routes.cpaNetwork,
      page: () => getRequiredScreen(
        kIsWeb ? WebTemplate(child: CpaNetworkScreen()) : CpaNetworkScreen(),
        UserRole.user,
      ),
    ),
    GetPage(
      name: Routes.userOrders,
      page: () => getRequiredScreen(
        kIsWeb ? WebTemplate(child: const UserOrdersScreen()) : const UserOrdersScreen(),
        UserRole.user,
      ),
    ),
    GetPage(
      name: Routes.settings,
      page: () => getRequiredScreen(
        kIsWeb ? WebTemplate(child: SettingsScreen()) : SettingsScreen(),
        UserRole.user,
      ),
    ),
    GetPage(
      name: Routes.aiStrategy,
      page: () => getRequiredScreen(
        kIsWeb ? WebTemplate(child: AiInsightsScreen()) : AiInsightsScreen(),
        UserRole.user,
      ),
    ),
    GetPage(
      name: Routes.userProfile,
      page: () => getRequiredScreen(
        kIsWeb ? WebTemplate(child: UserProfileScreen()) : UserProfileScreen(),
        UserRole.user,
      ),
    ),
    GetPage(
      name: Routes.userOrganizations,
      page: () => getRequiredScreen(
        kIsWeb
            ? WebTemplate(child: OrganizationListScreen())
            : OrganizationListScreen(),
        UserRole.user,
      ),
    ),

    GetPage(
      name: Routes.userAIchat,
      page: () => getRequiredScreen(
        kIsWeb
            ? WebTemplate(child: AIGenericChatScreen())
            : AIGenericChatScreen(),
        UserRole.user,
      ),
    ),

    GetPage(
      name: Routes.statementReview,
      page: () => getRequiredScreen(
        StatementReviewScreen(
          importId: int.parse(Get.parameters['import_id'] ?? '0'),
        ),
        UserRole.user,
      ),
    ),

    /// ====
    /// =====
    /// ======
    /// CPA MODULE ROUTES
    /// ======
    /// =====
    /// ====
    GetPage(
      name: Routes.cpaHome,
      page: () => getRequiredScreen(HomeScreenCPA(), UserRole.cpa),
    ),
    GetPage(
      name: Routes.cpaLeads,
      page: () => getRequiredScreen(
        kIsWeb ? WebTemplateCPA(child: LeadsScreenCPA()) : LeadsScreenCPA(),
        UserRole.cpa,
      ),
    ),
    GetPage(
      name: Routes.cpaOrders,
      page: () => getRequiredScreen(
        kIsWeb
            ? WebTemplateCPA(child: const OrdersScreenCPA())
            : const OrdersScreenCPA(),
        UserRole.cpa,
      ),
    ),
    GetPage(
      name: Routes.cpaBilling,
      page: () => getRequiredScreen(
        kIsWeb ? WebTemplateCPA(child: EarningScreenCPA()) : EarningScreenCPA(),
        UserRole.cpa,
      ),
    ),
    GetPage(
      name: Routes.cpaChat,
      page: () => getRequiredScreen(
        kIsWeb ? WebTemplateCPA(child: ChatListScreen()) : ChatListScreen(),
        UserRole.cpa,
      ),
    ),

    GetPage(
      name: Routes.cpaSettings,
      page: () => getRequiredScreen(
        kIsWeb
            ? WebTemplateCPA(child: SettingsScreenCPA())
            : const SettingsScreenCPA(),
        UserRole.cpa,
      ),
    ),

    GetPage(
      name: Routes.cpaProfile,
      page: () => getRequiredScreen(ProfileScreenCPA(), UserRole.cpa),
    ),
    GetPage(
      name: Routes.cpaProfileUnderReview,
      page: () =>
          getRequiredScreen(ProfileUnderReviewScreenCPA(), UserRole.cpa),
    ),

    /*
      =====
      ===== ADMIN MODULE ROUTES
      ===== 
    */
    GetPage(
      name: Routes.adminHome,
      page: () => getRequiredScreen(HomeScreenAdmin(), UserRole.admin),
    ),
    GetPage(
      name: Routes.adminUsers,
      page: () => getRequiredScreen(
        kIsWeb ? WebTemplateAdmin(child: UserListScreen()) : UserListScreen(),
        UserRole.admin,
      ),
    ),
    GetPage(
      name: Routes.adminCPAs,
      page: () => getRequiredScreen(
        kIsWeb
            ? WebTemplateAdmin(child: CpaListScreenAdmin())
            : CpaListScreenAdmin(),
        UserRole.admin,
      ),
    ),
    GetPage(
      name: Routes.adminCategories,
      page: () => getRequiredScreen(
        kIsWeb
            ? WebTemplateAdmin(child: AdminCategoriesScreen())
            : AdminCategoriesScreen(),
        UserRole.admin,
      ),
    ),
    GetPage(
      name: Routes.adminTaxDeductions,
      page: () => getRequiredScreen(
        kIsWeb
            ? WebTemplateAdmin(child: TaxDeductionRulesScreen())
            : TaxDeductionRulesScreen(),
        UserRole.admin,
      ),
    ),
    GetPage(
      name: Routes.adminSettings,
      page: () => getRequiredScreen(
        kIsWeb
            ? WebTemplateAdmin(child: SettingsScreenAdmin())
            : SettingsScreenAdmin(),
        UserRole.admin,
      ),
    ),
    GetPage(
      name: Routes.adminChat,
      page: () => getRequiredScreen(
        kIsWeb
            ? WebTemplateAdmin(child: const ChatListScreen())
            : const ChatListScreen(),
        UserRole.admin,
      ),
    ),
  ];
}

Widget getRequiredScreen(Widget desiredWidget, UserRole role) {
  log("=== ${Get.currentRoute} === ");
  if (isUserLoggedIn && Get.isRegistered<AuthController>()) {
    if (authPerson?.role == role) {
      if (role == UserRole.user) {
        bool isUserProfileOk = isUserProfileCompleted(authUser!);
        bool isOrganizationsOk = isAnyOrganizationAvailable;

        if (isUserProfileOk && isOrganizationsOk) {
          return desiredWidget;
        } else {
          if (!isUserProfileOk && Get.currentRoute == Routes.userProfile) {
            return desiredWidget;
          } else if (!isOrganizationsOk &&
              Get.currentRoute == Routes.userOrganizations) {
            return desiredWidget;
          } else if (!isUserProfileOk) {
            return const ErrorScreen(routeError: RouteError.userProfile);
          } else if (!isOrganizationsOk) {
            return const ErrorScreen(routeError: RouteError.userOrganization);
          }
        }
      } else if (role == UserRole.cpa) {
        bool isCPAProfileOk = isCPAProfileCompleted(authCpa!);
        bool isVerified =
            authCpa?.verificationStatus == CpaVerificationStatus.approved;
        if (isCPAProfileOk && isVerified) {
          return desiredWidget;
        } else {
          // can access profile in any case
          if (Get.currentRoute == Routes.cpaProfile) {
            return desiredWidget;
          } else if (!isVerified &&
              Get.currentRoute == Routes.cpaProfileUnderReview) {
            return desiredWidget;
          } else if (!isCPAProfileOk) {
            return const ErrorScreen(routeError: RouteError.cpaProfile);
          } else if (!isVerified) {
            return const ErrorScreen(
              routeError: RouteError.cpaProfileUnderReview,
            );
          }
        }
      }
      return desiredWidget;
    } else {
      return const ErrorScreen(routeError: RouteError.permissionDenied);
    }
  } else {
    return const ErrorScreen(routeError: RouteError.login);
  }
}

String getHomeScreenRoute() {
  switch (authPerson?.role) {
    case UserRole.user:
      return Routes.userHome;
    case UserRole.cpa:
      return Routes.cpaHome;
    case UserRole.admin:
      return Routes.adminHome;
    default:
      return "---error---";
  }
}
