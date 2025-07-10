import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/modules/common/ui/chat/chat_screen.dart';
import 'package:booksmart/modules/cpa/controllers/service_controler.dart';
import 'package:flutter/foundation.dart';
import 'package:get/get.dart';

import '../../../../widgets/confirmation_dialog.dart';
import '../../../../widgets/custom_dialog.dart';

import 'package:booksmart/models/user_base_model.dart';
import 'package:booksmart/helpers/currency_formatter.dart';

void goToCpaDetailScreen(CpaModel cpa, {bool shouldCloseBefore = false}) {
  if (kIsWeb) {
    if (shouldCloseBefore) {
      Get.back(); // close previous dialog
    }
    customDialog(
      child: CpaDetailScreen(cpa: cpa),
      title: 'CPA Details',
      barrierDismissible: true,
      maxWidth: 800,
    );
  } else {
    if (shouldCloseBefore) {
      Get.off(() => CpaDetailScreen(cpa: cpa));
    } else {
      Get.to(() => CpaDetailScreen(cpa: cpa));
    }
  }
}

class CpaDetailScreen extends StatefulWidget {
  final CpaModel cpa;
  const CpaDetailScreen({super.key, required this.cpa});

  @override
  State<CpaDetailScreen> createState() => _CpaDetailScreenState();
}

class _CpaDetailScreenState extends State<CpaDetailScreen> {
  late ServiceController controller;
  late String controllerTag;

  @override
  void initState() {
    super.initState();
    controllerTag = widget.cpa.id.toString();

    if (Get.isRegistered<ServiceController>(tag: controllerTag)) {
      controller = Get.find<ServiceController>(tag: controllerTag);
    } else {
      controller = Get.put(
        ServiceController(cpaId: widget.cpa.id),
        tag: controllerTag,
        permanent: true,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    ColorScheme scheme = Get.theme.colorScheme;

    return Scaffold(
      appBar: kIsWeb ? null : AppBar(title: const Text("CPA Details")),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 15),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 20),

            // CPA Profile Card
            _buildCpaProfileCard(scheme),

            const SizedBox(height: 20),

            // TODO: show the CPA liscence number under the name of CPA

            // Services Section
            _buildServicesSection(scheme),

            const SizedBox(height: 30),
          ],
        ),
      ),
    );
  }

  Widget _buildServicesSection(ColorScheme scheme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.room_service, size: 20),
            const SizedBox(width: 6),
            AppText(
              "Offered Services",
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
          ],
        ),
        const SizedBox(height: 12),
        Obx(() {
          if (controller.isLoading.value) {
            return const Center(child: CircularProgressIndicator());
          }

          if (controller.services.isEmpty) {
            return AppText("No services listed yet.", color: Colors.grey);
          }

          return ListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: controller.services.length,
            itemBuilder: (context, index) {
              final service = controller.services[index];
              return Card(
                margin: const EdgeInsets.only(bottom: 12),
                child: ListTile(
                  title: AppText(service.title, fontWeight: FontWeight.bold),
                  subtitle: AppText(service.description, fontSize: 12),
                  trailing: AppText(
                    CurrencyUtils.format(service.price),
                    fontWeight: FontWeight.bold,
                  ),
                ),
              );
            },
          );
        }),
      ],
    );
  }

  Widget _buildCpaProfileCard(ColorScheme scheme) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.transparent),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Profile Image
              Stack(
                children: [
                  CircleAvatar(
                    radius: 40,
                    backgroundColor: scheme.primary.withValues(alpha: 0.1),
                    backgroundImage: widget.cpa.imgUrl.isNotEmpty
                        ? NetworkImage(widget.cpa.imgUrl)
                        : null,
                    child: widget.cpa.imgUrl.isEmpty
                        ? Icon(
                            Icons.person_outline,
                            size: 30,
                            color: scheme.primary,
                          )
                        : null,
                  ),
                  if (widget.cpa.verificationStatus ==
                      CpaVerificationStatus.approved)
                    Positioned(
                      bottom: 0,
                      right: 0,
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        decoration: BoxDecoration(
                          color: Colors.yellow[600],
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.verified,
                          size: 12,
                          color: Colors.black,
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AppText(
                      "${widget.cpa.firstName} ${widget.cpa.lastName}",
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                    const SizedBox(height: 4),
                    AppText(
                      "${widget.cpa.getExperienceInYears} years experience",
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                    ),
                    const SizedBox(height: 8),

                    // Star Rating
                    Row(
                      children: [
                        _buildStarRating(5.0), // Hardcoded pending reviews impl
                        const SizedBox(width: 8),
                        AppText("5.0 (0 reviews)", fontSize: 12),
                      ],
                    ),
                    const SizedBox(height: 8),

                    // Service Pricing
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.grey.shade800.withValues(alpha: 0.5),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: AppText(
                        "Starting at ${CurrencyUtils.format(widget.cpa.hourlyRate)} for standard filing",
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: 16),

          // Bio Section
          AppText(
            widget.cpa.professionalBio.isNotEmpty
                ? widget.cpa.professionalBio
                : "No professional bio available.",
            fontSize: 13,
          ),
          const SizedBox(height: 20),

          // Expertise Sections
          if (widget.cpa.specialties.isNotEmpty) ...[
            _buildSectionHeader("Specialties", Icons.receipt_long),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: widget.cpa.specialties
                  .map((e) => _buildTag(e))
                  .toList(),
            ),
            const SizedBox(height: 20),
          ],

          if (widget.cpa.stateFocuses.isNotEmpty) ...[
            _buildSectionHeader("State Focuses", Icons.map),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: widget.cpa.stateFocuses
                  .map((e) => _buildTag(e))
                  .toList(),
            ),
            const SizedBox(height: 24),
          ],

          // Response Time
          AppText("Typically replies within 24 hours", fontSize: 12),
          const SizedBox(height: 16),

          // Action Buttons
          AppButton(
            buttonText: "Send Message",
            onTapFunction: () {
              showConfirmationDialog(
                title: "Confirm Selection",
                description:
                    "Are you sure you'd like to connect with ${widget.cpa.firstName} ${widget.cpa.lastName}?",
                onYes: () {
                  Get.back(); // close confirm dialog
                  goToChatScreen(widget.cpa.data, shouldCloseBefore: false);
                },
              );
            },
            radius: 8,
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }

  Widget _buildStarRating(double rating) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(5, (index) {
        if (index < rating.floor()) {
          // Full star
          return Icon(Icons.star, color: Colors.yellow[600], size: 16);
        } else if (index == rating.floor() && rating % 1 != 0) {
          // Half star
          return Icon(Icons.star_half, color: Colors.yellow[600], size: 16);
        } else {
          // Empty star
          return Icon(Icons.star_border, color: Colors.yellow[600], size: 16);
        }
      }),
    );
  }

  Widget _buildSectionHeader(String title, IconData icon) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8.0),
      child: Row(
        children: [
          Icon(icon, size: 20),
          const SizedBox(width: 6),
          AppText(title, fontSize: 14, fontWeight: FontWeight.w600),
        ],
      ),
    );
  }

  Widget _buildTag(String text) {
    return Chip(
      label: AppText(text, fontSize: 12),
      side: BorderSide.none,
      backgroundColor: Colors.grey.shade800,
    );
  }
}
