import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/modules/user/ui/ai_insights/subpages/ai_strategy_page.dart';
import 'package:get/get.dart';

import 'subpages/ai_deduction_page.dart';

class AiInsightsTabController extends GetxController
    with GetTickerProviderStateMixin {
  late TabController tabController;

  RxInt currentIndex = 0.obs;

  @override
  void onInit() {
    super.onInit();
    tabController = TabController(length: 2, vsync: this);

    tabController.addListener(() {
      if (!tabController.indexIsChanging) {
        currentIndex.value = tabController.index;
      }
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

class AiInsightsScreen extends StatefulWidget {
  const AiInsightsScreen({super.key});

  @override
  State<AiInsightsScreen> createState() => _AiInsightsScreenState();
}

class _AiInsightsScreenState extends State<AiInsightsScreen> {
  AiInsightsTabController taxTabController = Get.put(AiInsightsTabController());
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          TabBar(
            controller: taxTabController.tabController,
            dividerColor: Colors.transparent,
            labelPadding: const EdgeInsets.symmetric(horizontal: 5),
            indicatorColor: Get.theme.colorScheme.primary,
            indicatorWeight: 2.5,
            labelStyle: const TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 12,
            ),
            unselectedLabelStyle: TextStyle(
              fontWeight: FontWeight.normal,
              fontSize: 12,
            ),
            tabs: const [
              Tab(text: 'AI Strategy'),
              Tab(text: "AI Deduction"),
            ],
          ),

          Expanded(
            child: TabBarView(
              controller: taxTabController.tabController,

              children: [AiStrategyPage(), AIDeductionPage()],
            ),
          ),
        ],
      ),
    );
  }
}
