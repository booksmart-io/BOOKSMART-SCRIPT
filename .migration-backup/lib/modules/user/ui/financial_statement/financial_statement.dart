import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/modules/user/ui/financial_statement/subpages/balance_sheet_tab.dart';
import 'package:booksmart/modules/user/ui/financial_statement/subpages/cash_flow_tab.dart';
import 'package:booksmart/modules/user/ui/financial_statement/subpages/profit_and_loss_tab.dart';

import '../transaction/transaction_list_screen.dart';

import 'package:get/get.dart';

import 'package:flutter/material.dart';

import 'package:booksmart/modules/user/controllers/financial_report_controller.dart';
import 'package:booksmart/modules/user/controllers/organization_controller.dart';

import 'subpages/financial_dashboard_tab.dart';

class FinincialTabController extends GetxController
    with GetTickerProviderStateMixin {
  late TabController tabController;

  RxInt currentIndex = 0.obs;

  @override
  void onInit() {
    super.onInit();
    tabController = TabController(length: 5, vsync: this);

    tabController.addListener(() {
      currentIndex.value = tabController.index;
    });
  }

  void changeTab(int index) {
    tabController.animateTo(index);
    currentIndex.value = index;
  }

  @override
  void onClose() {
    tabController.dispose();
    super.onClose();
  }
}

class FinancialReportScreen extends StatefulWidget {
  const FinancialReportScreen({super.key});

  @override
  State<FinancialReportScreen> createState() => _FinancialReportScreenState();
}

class _FinancialReportScreenState extends State<FinancialReportScreen> {
  FinincialTabController finincialTabController = Get.put(
    FinincialTabController(),
  );

  @override
  void initState() {
    super.initState();
    if (!Get.isRegistered<FinancialReportController>(tag: getCurrentOrganization!.id.toString())) {
      Get.put(FinancialReportController(), tag: getCurrentOrganization!.id.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final isNarrow = MediaQuery.sizeOf(context).width <= 1024;

    return Scaffold(
      backgroundColor: const Color(0xFF020E2C),
      body: Column(
        children: [
          Container(
            height: 58,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: const BoxDecoration(
              color: Color(0xFF020E2C),
            ),
            child: Row(
              children: [
                Expanded(
                  child: TabBar(
                    isScrollable: isNarrow,
                    tabAlignment: isNarrow ? TabAlignment.start : TabAlignment.fill,
                    controller: finincialTabController.tabController,
                    dividerColor: Colors.transparent,
                    indicatorSize: isNarrow
                        ? TabBarIndicatorSize.label
                        : TabBarIndicatorSize.tab,
                    indicatorColor: const Color(0xFFFFC72B),
                    indicatorWeight: 2,
                    labelPadding: EdgeInsets.symmetric(horizontal: isNarrow ? 12 : 6),
                    labelColor: Colors.white,
                    unselectedLabelColor: const Color(0xFF7F96BA),
                    labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                    unselectedLabelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                    tabs: const [
                      Tab(text: 'Dashboard'),
                      Tab(text: 'Transactions'),
                      Tab(text: 'Profit & Loss'),
                      Tab(text: 'Balance Sheet'),
                      Tab(text: 'Cash Flow'),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: TabBarView(
              controller: finincialTabController.tabController,
              children: const [
                FinancialDashboardTab(),
                TransactionListScreen(),
                ProfitLossScreen(),
                BalanceSheetTab(),
                CashFlowTab(),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
