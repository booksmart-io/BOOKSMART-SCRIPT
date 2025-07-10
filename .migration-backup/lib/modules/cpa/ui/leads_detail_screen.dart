import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/modules/user/ui/cpa/order/create_order_screen.dart';
import 'package:flutter/foundation.dart';
import 'package:get/get.dart';

import '../../../widgets/custom_dialog.dart';

void goToLeadDetailScreen({
  required int userId,
  required String userName,
  bool shouldCloseBefore = false,
}) {
  if (kIsWeb) {
    if (shouldCloseBefore) {
      Get.back(); // close previous dialog
    }
    customDialog(
      child: LeadDetailScreen(userId: userId, userName: userName),
      title: 'Lead Details',
      barrierDismissible: true,
    );
  } else {
    if (shouldCloseBefore) {
      Get.off(() => LeadDetailScreen(userId: userId, userName: userName));
    } else {
      Get.to(() => LeadDetailScreen(userId: userId, userName: userName));
    }
  }
}

class LeadDetailScreen extends StatelessWidget {
  final int userId;
  final String userName;

  const LeadDetailScreen({
    super.key,
    required this.userId,
    required this.userName,
  });
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: kIsWeb ? null : AppBar(title: const Text('Lead Details')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(15),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const AppText(
              'Review this potential client’s details and strategies before deciding.',

              fontSize: 13,
            ),
            const SizedBox(height: 16),

            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Get.theme.colorScheme.surfaceContainerLow,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 25,

                    child: AppText(
                      userName.isNotEmpty ? userName.substring(0, 1).toUpperCase() : 'U',
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        AppText(
                          userName,

                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                        ),
                        AppText('Real Estate Agent', fontSize: 13),
                        AppText('California', fontSize: 13),
                      ],
                    ),
                  ),

                  // Gauge
                  Column(
                    children: [
                      Stack(
                        alignment: Alignment.center,
                        children: [
                          SizedBox(
                            height: 46,
                            width: 46,
                            child: CircularProgressIndicator(
                              value: 0.82,
                              color: Colors.amber,
                              backgroundColor: Colors.grey.shade800,
                              strokeWidth: 5,
                            ),
                          ),
                          const AppText(
                            '82%',
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            // color: Colors.white,
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      const AppText(
                        'Ready',
                        color: Colors.amber,
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                      ),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(height: 10),

            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.amber.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const AppText(
                    'Medium',
                    color: Colors.amber,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(width: 8),
                const AppText(
                  'Tax Readiness Score',
                  // color: Colors.grey,
                  fontSize: 12,
                ),
              ],
            ),

            const SizedBox(height: 24),

            // AI Suggested Strategies
            const AppText(
              'AI-SUGGESTED TAX STRATEGIES',
              // color: Colors.white,
              fontWeight: FontWeight.bold,
              fontSize: 13,
            ),
            const SizedBox(height: 8),
            GestureDetector(
              onTap: () {},
              child: Row(
                children: const [
                  AppText(
                    'View Strategies',
                    color: Colors.amber,
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                  Icon(Icons.chevron_right, color: Colors.amber, size: 18),
                ],
              ),
            ),

            const SizedBox(height: 20),

            // Uploaded Documents
            const AppText(
              'UPLOADED DOCUMENTS',

              fontWeight: FontWeight.bold,
              fontSize: 13,
            ),
            const SizedBox(height: 10),

            _buildFileTile('2024_Return_SJohnson.pdf', 'Tax Return'),
            _buildFileTile('2025_Q1_PnL.xlsx', 'Profit & Loss Statement'),
            _buildFileTile('Receipts_Jan-Mar.zip', 'Receipts/Invoices'),

            const SizedBox(height: 24),

            // Client Introduction
            const AppText(
              'CLIENT INTRODUCTION MESSAGE',
              //color: Colors.white,
              fontWeight: FontWeight.bold,
              fontSize: 13,
            ),
            const SizedBox(height: 8),
            AppText(
              "Hi, I'm a real estate agent and Uber driver. I've uploaded my receipts and last year's return.",
              //  color: Colors.grey.shade300,
              fontSize: 13,
            ),

            const SizedBox(height: 24),

            // Associated Messages
            const AppText(
              'ASSOCIATED MESSAGES',
              // color: Colors.white,
              fontWeight: FontWeight.bold,
              fontSize: 13,
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.green.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const AppText(
                    'Message',
                    color: Colors.greenAccent,
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(width: 8),
                const AppText('2h ago', color: Colors.grey, fontSize: 12),
              ],
            ),

            const SizedBox(height: 40),

            Row(
              spacing: 10,
              children: [
                Expanded(
                  child: AppButton(
                    radius: 8,
                    onTapFunction: () {},
                    buttonText: 'Message',
                  ),
                ),
                Expanded(
                  child: AppButton(
                    radius: 8,
                    onTapFunction: () {
                      goToCreateOrderCPAScreen(
                        userId: userId,
                        userName: userName,
                        shouldCloseBefore: false,
                      );
                    },
                    buttonText: 'Send Order Request',
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFileTile(String fileName, String description) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          const Icon(Icons.insert_drive_file, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AppText(fileName, fontSize: 13),
                AppText(description, color: Colors.grey, fontSize: 12),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
