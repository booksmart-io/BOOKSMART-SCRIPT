import 'package:flutter/material.dart';
import '../../../../../../constant/assets.dart';
import '../../../../../../constant/extras.dart';
import '../../../../../../routes/routes.dart';
import '../../../../user/ui/home/template/sidebar_icon.dart';

class WebSideBarAdmin extends StatelessWidget {
  const WebSideBarAdmin({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;

    bool isShowName =
        MediaQuery.of(context).size.width > sidebarSwitchingStandardWidth;

    return Material(
      color: isDark ? colorScheme.surface : Colors.white,
      child: SizedBox(
        width: getSideBarWidth(),
        child: Container(
          decoration: BoxDecoration(
            color: isDark
                ? colorScheme.surfaceContainerHighest.withValues(alpha: 0.2)
                : Colors.grey.shade100,
            border: Border(
              right: BorderSide(
                color: isDark
                    ? colorScheme.outlineVariant.withValues(alpha: 0.2)
                    : colorScheme.primary.withValues(alpha: 0.2),
              ),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: SingleChildScrollView(
                  child: Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.all(10),
                        child: Image.asset(
                          appLogo,
                          height: 60,
                          // color: isDark ? Colors.white : colorScheme.primary,
                        ),
                      ),

                      const SizedBox(height: 20),
                      SideBarIcon(
                        icon: Icons.dashboard_customize_outlined,
                        infoMessage: 'Dashboard',
                        routeName: Routes.adminHome,
                        isShowName: isShowName,
                      ),
                      SideBarIcon(
                        icon: Icons.people_alt_outlined,
                        infoMessage: 'Users',
                        routeName: Routes.adminUsers,
                        isShowName: isShowName,
                      ),
                      SideBarIcon(
                        icon: Icons.business_outlined,
                        infoMessage: 'CPAs',
                        routeName: Routes.adminCPAs,
                        isShowName: isShowName,
                      ),
                      SideBarIcon(
                        icon: Icons.category_outlined,
                        infoMessage: 'Categories',
                        routeName: Routes.adminCategories,
                        isShowName: isShowName,
                      ),
                      SideBarIcon(
                        icon: Icons.receipt_long_outlined,
                        infoMessage: 'Tax Rules',
                        routeName: Routes.adminTaxDeductions,
                        isShowName: isShowName,
                      ),
                      SideBarIcon(
                        icon: Icons.chat_bubble_outline,
                        infoMessage: 'Chat',
                        routeName: Routes.adminChat,
                        isShowName: isShowName,
                      ),
                    ],
                  ),
                ),
              ),
              const Divider(height: 1),
              SideBarIcon(
                icon: Icons.settings_outlined,
                infoMessage: 'Settings',
                routeName: Routes.adminSettings,
                isShowName: isShowName,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
