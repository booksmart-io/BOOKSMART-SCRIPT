import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../routes/pages.dart';
import '../../../routes/routes.dart';

enum RouteError {
  doesntExist,
  login,
  permissionDenied,
  // user
  userProfile,
  userOrganization,
  // cpa
  cpaProfile,
  cpaProfileUnderReview,
}

class ErrorScreen extends StatelessWidget {
  const ErrorScreen({super.key, this.routeError = RouteError.doesntExist});

  final RouteError routeError;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Get.theme.colorScheme.surface,
      body: LayoutBuilder(
        builder: (context, constraints) {
          final bool isWide = constraints.maxWidth > 900;

          return Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(
                  maxWidth: 600, // 🔑 important for web
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _homeIcon(),
                    const SizedBox(height: 24),
                    _errorContent(context, isWide),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  // -------------------------
  // HOME ICON
  // -------------------------
  Widget _homeIcon() {
    return GestureDetector(
      onTap: () => Get.offNamed(getHomeScreenRoute()),
      child: Icon(Icons.home_rounded, color: Get.theme.primaryColor, size: 96),
    );
  }

  // -------------------------
  // SWITCH HANDLER
  // -------------------------
  Widget _errorContent(BuildContext context, bool isWide) {
    switch (routeError) {
      case RouteError.login:
        return _errorBlock(
          title: 'Please Login To Continue',
          description: 'You need to be logged in to access this page.',
          buttonText: 'Login',
          icon: Icons.login_rounded,
          onPressed: () => Get.offNamed(Routes.login),
          isWide: isWide,
        );
      case RouteError.permissionDenied:
        return _errorBlock(
          title: "Access Denied",
          description: "You don't have permission to access this route.",
          buttonText: 'Go Back Home',
          icon: Icons.lock_outline_rounded,
          onPressed: () => Get.offNamed(getHomeScreenRoute()),
          isWide: isWide,
        );

      ///
      ///
      ///========
      ///====USER=====
      ///=======
      ///
      ///
      case RouteError.userProfile:
        return _errorBlock(
          title: 'Profile Missing',
          description: 'Please complete your profile to continue.',
          buttonText: 'Create Profile',
          icon: Icons.person_add_alt_1,
          onPressed: () => Get.offNamed(Routes.userProfile),
          isWide: isWide,
        );
      case RouteError.userOrganization:
        return _errorBlock(
          title: 'Organization Required',
          description: 'You must join or create an organization first.',
          buttonText: 'Go to Organization',
          icon: Icons.business,
          onPressed: () => Get.offNamed(Routes.userOrganizations),
          isWide: isWide,
        );

      ///
      ///
      ///========
      ///====CPA=====
      ///=======
      ///
      ///

      case RouteError.cpaProfile:
        return _errorBlock(
          title: 'CPA Profile Missing',
          description: 'Please complete your profile to continue.',
          buttonText: 'Create Profile',
          icon: Icons.person_add_alt_1,
          onPressed: () => Get.offNamed(Routes.cpaProfile),
          isWide: isWide,
        );

      case RouteError.cpaProfileUnderReview:
        return _errorBlock(
          title: 'Profile Under Review',
          description: 'Your CPA profile is currently under review.',
          buttonText: 'Go to Review',
          icon: Icons.hourglass_top_rounded,
          onPressed: () => Get.offNamed(Routes.cpaProfileUnderReview),
          isWide: isWide,
        );

      case RouteError.doesntExist:
        return _errorBlock(
          title: "Sorry!",
          description: "This route doesn't exist.",
          buttonText: 'Go Home',
          icon: Icons.arrow_back_rounded,
          onPressed: () => Get.offNamed(getHomeScreenRoute()),
          isWide: isWide,
        );
    }
  }

  // -------------------------
  // REUSABLE UI BLOCK
  // -------------------------
  Widget _errorBlock({
    required String title,
    required String description,
    required String buttonText,
    required IconData icon,
    required VoidCallback onPressed,
    required bool isWide,
  }) {
    return Column(
      children: [
        Text(
          title,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: isWide ? 32 : 26,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 12),
        Text(
          description,
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: isWide ? 18 : 16),
        ),
        const SizedBox(height: 32),
        ElevatedButton(
          onPressed: onPressed,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [Icon(icon), const SizedBox(width: 8), Text(buttonText)],
          ),
        ),
      ],
    );
  }
}
