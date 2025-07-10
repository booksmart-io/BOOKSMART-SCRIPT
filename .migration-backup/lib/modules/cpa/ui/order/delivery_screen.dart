import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/modules/cpa/ui/deliver_order_screen.dart';
import 'package:booksmart/widgets/custom_dialog.dart';
import 'package:flutter/foundation.dart';
import 'package:get/get.dart';

void goToDeliverOrderScreen({bool shouldCloseBefore = false}) {
  if (kIsWeb) {
    if (shouldCloseBefore) {
      Get.back(); // close previous dialog
    }
    customDialog(
      child: const DeliverOrderScreen(),
      title: "Deliver your order",
      barrierDismissible: true,
    );
  } else {
    if (shouldCloseBefore) {
      Get.off(() => const DeliverOrderScreen());
    } else {
      Get.to(() => const DeliverOrderScreen());
    }
  }
}

class DeliverOrderScreen extends StatelessWidget {
  const DeliverOrderScreen({super.key});

  @override
  Widget build(BuildContext context) {
    //final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: kIsWeb ? null : AppBar(title: const Text("Deliver your order")),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AppText(
              "📋 Please upload the following deliverables:",
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
            const SizedBox(height: 8),

            // Deliverable Item 1
            _buildDeliverableItem(
              context,
              title: "Project Proposal Document",
              description: "Detailed project proposal in PDF format",
              isRequired: true,
            ),
            const SizedBox(height: 12),

            // Deliverable Item 2
            _buildDeliverableItem(
              context,
              title: "Design Mockups",
              description: "UI/UX design files (Figma, Sketch, or PDF)",
              isRequired: true,
            ),
            const SizedBox(height: 12),

            // Deliverable Item 3
            _buildDeliverableItem(
              context,
              title: "Source Code Files",
              description: "Complete source code in ZIP format",
              isRequired: true,
            ),
            const SizedBox(height: 12),

            // Deliverable Item 4
            _buildDeliverableItem(
              context,
              title: "Documentation",
              description: "Technical documentation and user guides",
              isRequired: false,
            ),
            const SizedBox(height: 12),

            // Deliverable Item 5
            _buildDeliverableItem(
              context,
              title: "Test Reports",
              description: "Quality assurance and testing reports",
              isRequired: false,
            ),
            const SizedBox(height: 30),

            // Submit Button
            SizedBox(
              width: double.infinity,
              child: AppButton(
                buttonText: "Submit",
                fontSize: 14,
                radius: 8,
                onTapFunction: () {
                  // Handle order submission
                  Get.back();
                  Get.snackbar(
                    "Success",
                    "Order request submitted successfully!",
                    snackPosition: SnackPosition.BOTTOM,
                  );
                },
              ),
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _buildDeliverableItem(
    BuildContext context, {
    required String title,
    required String description,
    required bool isRequired,
  }) {
    final colorScheme = Theme.of(context).colorScheme;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: Container(
        padding: const EdgeInsets.all(16),

        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          AppText(
                            title,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: colorScheme.onSurface,
                          ),
                          if (isRequired) ...[
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.red.withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(4),
                                border: Border.all(
                                  color: Colors.red.withValues(alpha: 0.3),
                                ),
                              ),
                              child: AppText(
                                "Required",
                                fontSize: 10,
                                color: Colors.red,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 4),
                      AppText(description, fontSize: 12),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () {
                  // Handle file upload
                  showFileUploadOptions(context);
                },
                icon: const Icon(Icons.upload_file, size: 18),
                label: const AppText("Upload File", fontSize: 14),
                style: OutlinedButton.styleFrom(
                  foregroundColor: colorScheme.primary,
                  side: BorderSide(color: colorScheme.primary),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
