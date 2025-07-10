import 'package:flutter/material.dart';
import '../../../../../constant/assets.dart';
import '../../../../../constant/extras.dart';
import '../../../../../routes/routes.dart';
import '../../../../user/ui/home/template/sidebar_icon.dart';

class WebSideBarCPA extends StatelessWidget {
  const WebSideBarCPA({super.key});

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
                        routeName: Routes.cpaHome,
                        isShowName: isShowName,
                      ),
                      SideBarIcon(
                        icon: Icons.healing_outlined,
                        infoMessage: 'Leads',
                        routeName: Routes.cpaLeads,
                        isShowName: isShowName,
                      ),
                      SideBarIcon(
                        icon: Icons.shopping_bag,
                        infoMessage: 'Orders',
                        routeName: Routes.cpaOrders,
                        isShowName: isShowName,
                      ),
                      SideBarIcon(
                        icon: Icons.file_copy_outlined,
                        infoMessage: 'Billing',
                        routeName: Routes.cpaBilling,
                        isShowName: isShowName,
                      ),

                      SideBarIcon(
                        icon: Icons.chat_bubble_outline,
                        infoMessage: 'Chat',
                        routeName: Routes.cpaChat,
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
                routeName: Routes.cpaSettings,
                isShowName: isShowName,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
