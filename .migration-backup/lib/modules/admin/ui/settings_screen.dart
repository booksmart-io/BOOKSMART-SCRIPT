import 'package:booksmart/modules/common/controllers/auth_controller.dart';
import 'package:booksmart/models/user_base_model.dart';
import 'package:booksmart/modules/common/providers/auth_provider.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../../../widgets/app_text.dart';

class SettingsScreenAdmin extends StatefulWidget {
  const SettingsScreenAdmin({super.key});

  @override
  State<SettingsScreenAdmin> createState() => _SettingsScreenAdminState();
}

class _SettingsScreenAdminState extends State<SettingsScreenAdmin> {
  bool _isDarkMode = Get.isDarkMode;
  AdminModel? admin = authAdmin;

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
                      CircleAvatar(
                        radius: 26,
                        backgroundColor: colorScheme.primary,
                        child: AppText(
                          admin!.firstName[0] + admin!.lastName[0],
                          color: Colors.white,
                          fontSize: 14,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          AppText(
                            "${admin?.firstName} ${admin?.lastName}",
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                            color: colorScheme.onSurface,
                          ),
                          AppText(
                            admin?.email ?? "---",
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
