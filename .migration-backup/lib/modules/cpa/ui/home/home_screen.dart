import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/modules/common/ui/chat/chat_list_screen.dart';
import 'package:flutter/foundation.dart';
import 'package:get/get.dart';

import '../earning_screen.dart';
import '../dashboard_screen.dart';
import '../leads_screen.dart';
import 'template/web_template.dart';

class BottomNavControllerCPA extends GetxController {
  var currentIndex = 0.obs;

  void changePage(int index) {
    currentIndex.value = index;
    update();
  }
}

class HomeScreenCPA extends StatefulWidget {
  const HomeScreenCPA({super.key});

  @override
  State<HomeScreenCPA> createState() => _HomeScreenCPAState();
}

class _HomeScreenCPAState extends State<HomeScreenCPA> {
  BottomNavControllerCPA controller = Get.put(BottomNavControllerCPA());

  final List<Map<String, dynamic>> _navItems = const [
    {'icon': Icons.home, 'label': 'Dashboard'},
    {'icon': Icons.assessment, 'label': 'Leads'},
    {'icon': Icons.receipt, 'label': 'Earnings'},
    {'icon': Icons.chat, 'label': 'Chat'},
  ];

  final List<Widget> _pages = [
    DashboardScreenCPA(),
    LeadsScreenCPA(),
    EarningScreenCPA(),
    ChatListScreen(),
  ];

  List<String?> pageTitles = [null, "Leads", "Earnings", "Chat"];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;

    final navDisableColor = isDark
        ? AppColorsDark.surface
        : AppColorsLight.surface;

    if (kIsWeb) {
      return WebTemplateCPA(child: DashboardScreenCPA());
    } else {
      return GetBuilder<BottomNavControllerCPA>(
        builder: (controller) {
          String? title = pageTitles[controller.currentIndex.value];
          return Scaffold(
            extendBody: false,
            backgroundColor: colorScheme.surface,
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
                  onPressed: () => Get.toNamed(Routes.cpaSettings),
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
                            ],
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: SingleChildScrollView(child: Column(children: [])),
                    ),
                    Divider(),
                    AppText("V 1.0.0", fontSize: 16),
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
                        child: Center(
                          child: Icon(
                            _navItems[index]['icon'],
                            size: 25,
                            color: isSelected
                                ? Colors.white
                                : colorScheme.onSurface.withValues(alpha: 0.7),
                          ),
                        ),
                      ),
                    ),
                  );
                }),
              ),
            ),

            // Container(
            //   decoration: BoxDecoration(
            //     color: navDisableColor,
            //     borderRadius: const BorderRadius.only(
            //       topLeft: Radius.circular(25),
            //       topRight: Radius.circular(25),
            //     ),
            //   ),
            //   padding: isIos
            //       ? const EdgeInsets.only(bottom: 15)
            //       : EdgeInsets.zero,
            //   height: 60 + (isIos ? 15 : 0),
            //   child: Row(
            //     mainAxisAlignment: MainAxisAlignment.spaceAround,
            //     children: List.generate(_navItems.length - 1, (index) {
            //       final isSelected = controller.currentIndex.value == index;
            //       return InkWell(
            //         onTap: () => controller.changePage(index),
            //         borderRadius: BorderRadius.circular(15),
            //         child: Container(
            //           decoration: BoxDecoration(
            //             color: isSelected
            //                 ? Color(0xff414C5C)
            //                 : Colors.transparent,
            //             borderRadius: BorderRadius.circular(15),
            //           ),
            //           height: 60,
            //           child: Center(
            //             child: Icon(
            //               _navItems[index]['icon'],
            //               size: 25,
            //               color: isSelected
            //                   ? Colors.white
            //                   : colorScheme.onSurface.withValues(alpha: 0.7),
            //             ),
            //           ),
            //         ),
            //       );
            //     }),
            //   ),
            // ),
          );
        },
      );
    }
  }
}
