import 'dart:developer';

import 'package:booksmart/constant/data.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:jiffy/jiffy.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../../models/transaction_model.dart';
import '../../../../admin/controllers/category_controler.dart';
import '../../../controllers/bank_controller.dart';
import '../add_transaction_manual.dart';
import 'package:booksmart/helpers/currency_formatter.dart';

String? getBankAccountName({
  required int? bankId,
  required String? bankAccountId,
}) {
  final bankController = bankControllerInstance;
  return bankController.banks
      .firstWhereOrNull((bank) => bank.id == bankId)
      ?.accounts
      .firstWhereOrNull((account) => account.plaidAccountId == bankAccountId)
      ?.name;
}

class TransactionCard extends StatelessWidget {
  final TransactionModel transaction;

  const TransactionCard({super.key, required this.transaction});

  @override
  Widget build(BuildContext context) {
    final categoryController = Get.find<CategoryAdminController>();
    // Determine if income or expense
    final bool isPositive = transaction.amount >= 0;
    final Color statusColor = isPositive ? Colors.green.shade600 : Colors.grey;
    final String amountPrefix = isPositive ? "" : "-";

    return Card(
      margin: EdgeInsets.zero,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: Theme.of(
            context,
          ).colorScheme.outlineVariant.withValues(alpha: 0.5),
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => goToAddTransactionScreen(transaction: transaction),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // 1. Color Indicator Side Bar
              Container(width: 6, color: statusColor),

              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(12.0),
                  child: Column(
                    children: [
                      // Top Row: Title and Amount
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text(
                              transaction.title,
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(
                                "$amountPrefix ${CurrencyUtils.format(transaction.amount.abs())}",
                                style: TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                  color: statusColor,
                                ),
                              ),
                              if (transaction.filePath != null &&
                                  transaction.filePath!.isNotEmpty)
                                IconButton(
                                  visualDensity: VisualDensity.compact,
                                  onPressed: () {
                                    log(transaction.filePath!);
                                    launchUrl(
                                      Uri.parse(transaction.filePath!),
                                      mode: LaunchMode.externalApplication,
                                    );
                                  },
                                  icon: const Icon(
                                    Icons.description_outlined,
                                    size: 18,
                                    color: Colors.blueGrey,
                                  ),
                                  padding: EdgeInsets.zero,
                                  constraints: const BoxConstraints(),
                                ),
                            ],
                          ),
                        ],
                      ),

                      const SizedBox(height: 4),

                      // Middle Row: Category and Subcategory
                      Row(
                        children: [
                          Icon(
                            Icons.category_outlined,
                            size: 14,
                            color: Colors.grey.shade600,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            transaction.category == null
                                ? "---"
                                : "${categoryController.getCategoryName(transaction.category!)} • ${categoryController.getSubCategoryName(transaction.subcategory)}",
                            style: TextStyle(
                              fontSize: 13,
                              color: Colors.grey.shade700,
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 8),

                      // Bottom Row: Date, Bank, and Tags
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          // Date and Bank info
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                Jiffy.parseFromDateTime(
                                  transaction.dateTime,
                                ).yMMMdjm,
                                style: const TextStyle(
                                  fontSize: 11,
                                  color: Colors.grey,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Row(
                                children: [
                                  const Icon(
                                    Icons.account_balance_wallet_outlined,
                                    size: 12,
                                    color: Colors.blueGrey,
                                  ),
                                  const SizedBox(width: 4),
                                  Text(
                                    getBankAccountName(
                                          bankId: transaction.bankId,
                                          bankAccountId:
                                              transaction.bankAccountId,
                                        ) ??
                                        "Manual",
                                    style: const TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600,
                                      color: Colors.blueGrey,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),

                          // Badges (Business/Personal & Deductible)
                          Row(
                            children: [
                              _buildBadge(
                                transaction.type,
                                transaction.type == businessTransactionType
                                    ? Colors.teal
                                    : Colors.orange,
                              ),
                              if (transaction.deductible) ...[
                                const SizedBox(width: 4),
                                _buildBadge("Deductible", Colors.grey),
                              ],
                            ],
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBadge(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withValues(alpha: 0.3), width: 0.5),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 10,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }
}
