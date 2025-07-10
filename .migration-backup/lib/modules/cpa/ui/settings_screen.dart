import 'package:booksmart/modules/common/controllers/auth_controller.dart';
import 'package:booksmart/models/user_base_model.dart';
import 'package:booksmart/modules/common/providers/auth_provider.dart';
import 'package:booksmart/modules/cpa/ui/cpa_services.dart';
import 'package:booksmart/modules/cpa/ui/stripe_account_screen.dart';
import 'package:booksmart/routes/routes.dart';
import 'package:booksmart/widgets/custom_circle_avatar.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../../../widgets/app_text.dart';

class SettingsScreenCPA extends StatefulWidget {
  const SettingsScreenCPA({super.key});

  @override
  State<SettingsScreenCPA> createState() => _SettingsScreenCPAState();
}

class _SettingsScreenCPAState extends State<SettingsScreenCPA> {
  bool _isDarkMode = Get.isDarkMode;
  CpaModel? cpa = authCpa;

  @override
  void initState() {
    super.initState();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      appBar: kIsWeb
          ? null
          : AppBar(title: Text("Settings"), centerTitle: false, elevation: 0),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Obx(() {
            if (authController.rxUser.value == null) {
              return SizedBox();
            }

            return Material(
              color: Colors.transparent,
              borderRadius: BorderRadius.circular(10),
              child: InkWell(
                onTap: () {
                  Get.toNamed(Routes.cpaProfile);
                },
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(10),
                    boxShadow: [
                      if (!isDark)
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.05),
                          blurRadius: 6,
                          offset: const Offset(0, 3),
                        ),
                    ],
                  ),
                  child: Row(
                    children: [
                      CustomCircleAvatar(
                        imgUrl: cpa?.imgUrl,
                        alternateText: cpa?.firstName,
                        radius: 26,
                      ),
                      // CircleAvatar(
                      //   radius: 26,
                      //   backgroundColor: colorScheme.primary,
                      //   child: AppText(
                      //     cpa!.firstName[0] + cpa!.lastName[0],
                      //     color: Colors.white,
                      //     fontSize: 14,
                      //   ),
                      // ),
                      const SizedBox(width: 12),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          AppText(
                            "${cpa?.firstName} ${cpa?.lastName}",
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                            color: colorScheme.onSurface,
                          ),
                          AppText(
                            cpa?.email ?? "---",
                            color: colorScheme.onSurface.withValues(alpha: 0.7),
                            fontSize: 14,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            );
          }),
          const SizedBox(height: 10),

          ListTile(
            title: AppText("Services", fontSize: 14),
            trailing: Icon(Icons.chevron_right, size: 14),
            onTap: () {
              goToCPAServicesScreen();
            },
          ),
          const SizedBox(height: 10),

          ListTile(
            title: AppText("Notifications", fontSize: 14),
            trailing: Icon(Icons.chevron_right, size: 14),
            onTap: () {},
          ),

          const SizedBox(height: 10),

          SwitchListTile.adaptive(
            title: AppText("Dark Mode", fontSize: 14),
            value: _isDarkMode,
            onChanged: (value) {
              setState(() => _isDarkMode = value);
              Get.changeThemeMode(value ? ThemeMode.dark : ThemeMode.light);
            },
            activeThumbColor: colorScheme.primary,
          ),

          const SizedBox(height: 10),
          buildTile("Stripe Account", () {
            goToStripeAccountScreen();
          }),
          const SizedBox(height: 10),

          buildTile("Delete Account", () {}),
          const SizedBox(height: 10),

          buildTile("Logout", () {
            logOut();
          }, isDestructive: true),
        ],
      ),
    );
  }
}

ListTile buildTile(
  String title,
  VoidCallback onTap, {
  bool isDestructive = false,
}) {
  ColorScheme colorScheme = Get.theme.colorScheme;
  return ListTile(
    title: AppText(
      title,
      fontSize: 14,
      color: isDestructive ? colorScheme.error : colorScheme.onSurface,
    ),
    trailing: Icon(Icons.chevron_right, size: 20),
    onTap: onTap,
  );
}
