import 'package:flutter/material.dart';
import '../../../../../constant/assets.dart';
import '../../../../../constant/extras.dart';
import '../../../../../routes/routes.dart';
import '../../organization/switch_organization_dialog.dart';
import 'sidebar_icon.dart';

class WebSideBar extends StatelessWidget {
  const WebSideBar({super.key});

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
                      SideBarIcon(
                        icon: Icons.swap_horiz_outlined,
                        infoMessage: 'Switch Organization',
                        routeName: "",
                        isShowName: isShowName,
                        onTap: () {
                          showSwitchOrganizationDialog();
                        },
                      ),
                      const SizedBox(height: 20),
                      SideBarIcon(
                        icon: Icons.dashboard_customize_outlined,
                        infoMessage: 'Dashboard',
                        routeName: Routes.userHome,
                        isShowName: isShowName,
                      ),
                      SideBarIcon(
                        icon: Icons.discount_outlined,
                        infoMessage: 'AI Strategy',
                        routeName: Routes.aiStrategy,
                        isShowName: isShowName,
                      ),
                      SideBarIcon(
                        icon: Icons.file_copy_outlined,
                        infoMessage: 'Financial Reports',
                        routeName: Routes.report,
                        isShowName: isShowName,
                      ),
                      SideBarIcon(
                        icon: Icons.healing_outlined,
                        infoMessage: 'Tax Filing',
                        routeName: Routes.tax,
                        isShowName: isShowName,
                      ),
                      SideBarIcon(
                        icon: Icons.person_pin_circle,
                        infoMessage: 'CPA Network',
                        routeName: Routes.cpaNetwork,
                        isShowName: isShowName,
                      ),
                      SideBarIcon(
                        icon: Icons.shopping_bag_outlined,
                        infoMessage: 'Orders',
                        routeName: Routes.userOrders,
                        isShowName: isShowName,
                      ),

                      SideBarIcon(
                        icon: Icons.token_outlined,
                        infoMessage: 'Tokens',
                        routeName: Routes.tokens,
                        isShowName: isShowName,
                      ),
                      SideBarIcon(
                        icon: Icons.chat_bubble_outline,
                        infoMessage: 'Chat',
                        routeName: Routes.chat,
                        isShowName: isShowName,
                      ),
                      SideBarIcon(
                        icon: Icons.blur_circular_rounded,
                        infoMessage: 'AI Chat',
                        routeName: Routes.userAIchat,
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
                routeName: Routes.settings,
                isShowName: isShowName,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
