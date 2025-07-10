import 'package:booksmart/models/user_base_model.dart';
import 'package:booksmart/modules/admin/controllers/category_controler.dart';
import 'package:booksmart/modules/common/providers/user_profile_provider.dart';
import 'package:booksmart/routes/pages.dart';
import 'package:get/get.dart';

import '../modules/common/controllers/auth_controller.dart';
import '../modules/user/controllers/organization_controller.dart';
import '../modules/user/controllers/user_subscription_controller.dart';
import '../models/organization_model.dart';
import '../modules/common/providers/auth_provider.dart';
import '../modules/user/providers/organization_provider.dart';
import '../routes/routes.dart';

Future<String> getInitialRoute() async {
  if (!isUserLoggedIn) {
    return Routes.login;
  }

  if (!isEmailVerified) {
    return Routes.verifyEmail;
  }

  final Map<String, dynamic>? userData = await getUserProfile();

  if (userData == null) {
    return Routes.login;
  }

  Get.put(AuthController(userJson: userData), permanent: true);
  Get.put(CategoryAdminController(), permanent: true);

  if (authPerson?.role == UserRole.user) {
    Get.put(UserSubscriptionController(), permanent: true);

    final List<OrganizationModel> organizations = await getOrganizations(
      userId: authPerson?.id,
    );
    Get.put(OrganizationController(organizations), permanent: true);

    if (!isUserProfileCompleted(authUser!)) {
      return Routes.userProfile;
    }

    if (organizations.isEmpty) {
      return Routes.userOrganizations;
    }
  } else if (authPerson?.role == UserRole.cpa) {
    if (!isCPAProfileCompleted(authCpa!)) {
      return Routes.cpaProfile;
    }
    if (authCpa?.verificationStatus != CpaVerificationStatus.approved) {
      return Routes.cpaProfileUnderReview;
    }
  }

  return getHomeScreenRoute();
}

bool isUserProfileCompleted(UserModel user) {
  return user.firstName.isNotEmpty && user.lastName.isNotEmpty;
}

bool isCPAProfileCompleted(CpaModel cpa) {
  return cpa.firstName.isNotEmpty && cpa.lastName.isNotEmpty;
}
