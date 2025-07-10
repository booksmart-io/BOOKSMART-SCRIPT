import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/modules/cpa/ui/components/lead_card.dart';
import 'package:get/get.dart';
import '../controllers/leads_controller.dart';

class LeadsScreenCPA extends StatelessWidget {
  const LeadsScreenCPA({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.all(16.0),
            child: AppText("Leads", fontSize: 18, fontWeight: FontWeight.bold),
          ),
          Expanded(child: _buildLeadsTab()),
        ],
      ),
    );
  }

  // ---------------- LEADS TAB -----------------
  Widget _buildLeadsTab() {
    // ColorScheme colorScheme = Get.theme.colorScheme;
    return GetX<LeadsController>(
      init: LeadsController(),
      builder: (controller) {
        if (controller.isLoading.value) {
          return const Center(child: CircularProgressIndicator());
        }

        if (controller.leads.isEmpty) {
          return const Center(child: AppText("No leads yet"));
        }

        return ListView.separated(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          itemCount: controller.leads.length,
          separatorBuilder: (_, __) => const SizedBox(height: 12),
          itemBuilder: (context, index) {
            final lead = controller.leads[index];

            return LeadCard(lead: lead);
          },
        );
      },
    );
  }
}
