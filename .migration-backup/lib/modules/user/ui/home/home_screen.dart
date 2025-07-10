import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/modules/user/controllers/tax_document_controller.dart';
import 'package:booksmart/modules/user/ui/home/template/web_template.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart';
import 'package:get/get.dart';

import '../../../common/components/drawer_item_widget.dart';
import '../ai_insights/ai_insights_screen.dart';
import '../cpa/dashboard_screen.dart';
import '../dashboard/dashboard_screen.dart';
import '../financial_statement/financial_statement.dart';
import '../organization/switch_organization_dialog.dart';
import '../token/earn_tokens_screen.dart';

class BottomNavController extends GetxController {
  var currentIndex = 0.obs;

  void changePage(int index) {
    currentIndex.value = index;
    update();
  }
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  BottomNavController controller = Get.put(BottomNavController());

  final List<Map<String, dynamic>> _navItems = const [
    {'icon': Icons.home, 'label': 'Home'},
    {'icon': Icons.lightbulb, 'label': 'AI Tax Strategies'},
    {'icon': Icons.assessment, 'label': 'Reports'},
    // {'icon': Icons.receipt, 'label': 'Tax Filing'},
    {'icon': Icons.person_pin_circle, 'label': 'CPA Network'},
    {'icon': Icons.account_balance_wallet, 'label': 'Wallet'},
  ];

  final List<Widget> _pages = [
    DashboardScreen(),
    AiInsightsScreen(),
    FinancialReportScreen(),
    CpaNetworkScreen(),
    EarnTokensScreen(),
  ];

  List<String?> pageTitles = [
    null,
    "AI Tax Strategies",
    "Financial Reports",
    "Tax Filing",
    "CPA Network",
    "Wallet",
  ];
  FinincialTabController finincialTabController = Get.put(
    FinincialTabController(),
  );

  @override
  void initState() {
    super.initState();
    SchedulerBinding.instance.addPostFrameCallback((_) {
      final ctrl = Get.isRegistered<TaxDocumentController>()
          ? Get.find<TaxDocumentController>()
          : Get.put(TaxDocumentController());
      ctrl.checkPendingStatementReview();
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;

    final navDisableColor = isDark
        ? AppColorsDark.surface
        : AppColorsLight.surface;

    if (kIsWeb) {
      return WebTemplate(child: DashboardScreen());
    } else {
      return GetBuilder<BottomNavController>(
        builder: (controller) {
          String? title = pageTitles[controller.currentIndex.value];
          return Scaffold(
            extendBody: false,
            appBar: AppBar(
              leadingWidth: 45,
              centerTitle: false,
              title: title == null
                  ? Row(
                      children: [
                        Image.asset(appLogo, height: 20),
                        SizedBox(width: 3),
                        Text("BOOKSMART"),
                      ],
                    )
                  : Text(title),

              actions: [
                IconButton(
                  onPressed: () => Get.toNamed(Routes.settings),
                  icon: Icon(Icons.settings, color: colorScheme.onSurface),
                ),
              ],
            ),
            drawer: Drawer(
              backgroundColor: navDisableColor,
              child: SafeArea(
                child: Column(
                  children: [
                    DrawerHeader(
                      child: Row(
                        children: [
                          Image.asset(appLogo, height: 40),
                          const SizedBox(width: 12),
                          Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                "BOOKSMART",
                                style: TextStyle(
                                  color: colorScheme.onSurface,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text("Organization 1"),
                            ],
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: SingleChildScrollView(
                        child: Column(
                          children: [
                            DrawerItemWidget(
                              title: "Switch Organization",
                              onTap: () {
                                showSwitchOrganizationDialog();
                              },
                              trallingIcon: Icons.swap_horiz_outlined,
                            ),
                            DrawerItemWidget(
                              title: "Tax Filling",
                              onTap: () {
                                Get.toNamed(Routes.tax);
                              },
                            ),
                            DrawerItemWidget(
                              title: "Orders",
                              onTap: () {
                                Get.toNamed(Routes.userOrders);
                              },
                            ),
                            DrawerItemWidget(
                              title: "AI Chat",
                              onTap: () {
                                Get.toNamed(Routes.userAIchat);
                              },
                            ),
                            DrawerItemWidget(
                              title: "Subscription",
                              onTap: () {
                                Get.toNamed(Routes.subscription);
                              },
                            ),
                            DrawerItemWidget(
                              title: "Chat",
                              onTap: () {
                                Get.toNamed(Routes.chat);
                              },
                            ),
                          ],
                        ),
                      ),
                    ),
                    AppText("V 1.0.0", fontSize: 12, color: Colors.grey),
                  ],
                ),
              ),
            ),
            body: _pages[controller.currentIndex.value],
            bottomNavigationBar: Container(
              decoration: BoxDecoration(
                color: navDisableColor,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(25),
                  topRight: Radius.circular(25),
                ),
              ),
              padding: isIos
                  ? const EdgeInsets.only(bottom: 15)
                  : EdgeInsets.zero,
              height: 60 + MediaQuery.of(context).padding.bottom,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: List.generate(_navItems.length, (index) {
                  final isSelected = controller.currentIndex.value == index;
                  return SizedBox(
                    height: 50,
                    width: 50,
                    child: Material(
                      color: isSelected
                          ? Color(0xff414C5C)
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(15),
                      child: InkWell(
                        onTap: () => controller.changePage(index),
                        borderRadius: BorderRadius.circular(15),
                        child: Icon(
                          _navItems[index]['icon'],
                          size: 25,
                          color: isSelected
                              ? Colors.white
                              : colorScheme.onSurface.withValues(alpha: 0.7),
                        ),
                      ),
                    ),
                  );
                }),
              ),
            ),
          );
        },
      );
    }
  }
}
