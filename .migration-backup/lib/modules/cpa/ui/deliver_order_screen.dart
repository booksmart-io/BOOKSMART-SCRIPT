import 'package:booksmart/constant/exports.dart';
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
      title: 'Order Request',
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
      appBar: kIsWeb ? null : AppBar(title: const Text("Order Request")),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Center(
              child: AppText(
                "Order Request",
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),

            // Instructions
            Card(
              clipBehavior: Clip.antiAlias,
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),

                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AppText(
                      "📋 Please upload the following deliverables:",
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                    const SizedBox(height: 8),
                    AppText(
                      "• Upload all required files\n• Ensure files are in supported formats\n• Maximum file size: 10MB per file",
                      fontSize: 12,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),

            // Deliverables List
            AppText("Deliverables", fontSize: 16, fontWeight: FontWeight.bold),
            const SizedBox(height: 6),

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
                buttonText: "Submit Order Request",
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

void showFileUploadOptions(BuildContext context) {
  showModalBottomSheet(
    context: context,
    builder: (context) => Container(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AppText(
            "Choose Upload Method",
            fontSize: 18,
            fontWeight: FontWeight.bold,
          ),
          const SizedBox(height: 20),
          ListTile(
            leading: const Icon(Icons.folder_open),
            title: const AppText("Choose from Device", fontSize: 14),
            onTap: () {
              Get.back();
              // Implement file picker
              Get.snackbar("Info", "File picker would open here");
            },
          ),
          const SizedBox(height: 4),
          ListTile(
            leading: const Icon(Icons.cloud_upload),
            title: const AppText("Upload from Cloud", fontSize: 14),
            onTap: () {
              Get.back();
              // Implement cloud upload
              Get.snackbar("Info", "Cloud storage picker would open here");
            },
          ),
          const SizedBox(height: 4),
          ListTile(
            leading: const Icon(Icons.camera_alt),
            title: const AppText("Take Photo", fontSize: 14),
            onTap: () {
              Get.back();
              // Implement camera
              Get.snackbar("Info", "Camera would open here");
            },
          ),
        ],
      ),
    ),
  );
}
