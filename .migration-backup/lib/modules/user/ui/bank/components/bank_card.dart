import 'package:booksmart/models/bank_model.dart';
import 'package:booksmart/widgets/snackbar.dart';
import 'package:flutter/material.dart';
import 'package:jiffy/jiffy.dart';

import '../../../utils/plaid_connect_utils.dart';

class BankCard extends StatelessWidget {
  final BankModel bankModel;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  const BankCard({
    super.key,
    required this.bankModel,
    this.onEdit,
    this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    if (bankModel.accounts.isEmpty) return const SizedBox();

    final isDark = Theme.of(context).brightness == Brightness.dark;

    final Gradient backgroundGradient = isDark
        ? const LinearGradient(
            colors: [Color(0xFF1A1F38), Color(0xFF2C3E50)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          )
        : const LinearGradient(
            colors: [Color(0xFF8E2DE2), Color(0xFF4A00E0)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          );

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        gradient: backgroundGradient,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: isDark ? Colors.black54 : Colors.grey.withValues(alpha: 0.3),
            blurRadius: 12,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: Stack(
          children: [
            // Decorative background circles
            Positioned(
              right: -50,
              top: -50,
              child: CircleAvatar(
                radius: 100,
                backgroundColor: Colors.white.withValues(alpha: 0.1),
              ),
            ),

            Padding(
              padding: const EdgeInsets.all(15),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // --- HEADER ---
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          bankModel.institutionName.toUpperCase(),
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 18,
                            letterSpacing: 1.5,
                          ),
                        ),
                      ),
                      _buildActionsMenu(),
                    ],
                  ),
                  const SizedBox(height: 10),

                  // --- SUB-ACCOUNTS LIST ---
                  const Text(
                    "LINKED ACCOUNTS",
                    style: TextStyle(
                      color: Colors.white60,
                      fontSize: 10,
                      letterSpacing: 1.2,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const Divider(color: Colors.white24, height: 10),
                  const SizedBox(height: 10),

                  // Iterating through all accounts
                  ...bankModel.accounts.map(
                    (account) => Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  account.name,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w600,
                                    fontSize: 15,
                                  ),
                                ),
                                Text(
                                  "${account.type.toUpperCase()} • ${account.subtype ?? ''}",
                                  style: const TextStyle(
                                    color: Colors.white70,
                                    fontSize: 11,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Text(
                            "•••• ${account.mask ?? '0000'}",
                            style: const TextStyle(
                              fontFamily: 'Courier',
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  Row(
                    mainAxisAlignment: bankModel.requiresReauth
                        ? MainAxisAlignment.spaceBetween
                        : MainAxisAlignment.end,
                    children: [
                      if (bankModel.requiresReauth)
                        Material(
                          color: Colors.red,
                          borderRadius: BorderRadius.circular(10),
                          child: InkWell(
                            onTap: () {
                              hanldePlaidBankConnection(bankId: bankModel.id);
                            },
                            borderRadius: BorderRadius.circular(10),
                            child: Padding(
                              padding: const EdgeInsets.all(5),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                spacing: 10,
                                children: [
                                  Icon(
                                    Icons.sync_disabled,
                                    color: Colors.white,
                                    size: 20,
                                  ),
                                  Text(
                                    "Re-authenticate",
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      Material(
                        color: Colors.transparent,
                        borderRadius: BorderRadius.circular(10),
                        child: InkWell(
                          onTap: () {
                            if (bankModel.requiresReauth) {
                              showSnackBar(
                                "For security purposes, please re-authenticate your bank account connection. This measure is required to ensure continued secure access to your financial data.",
                                isError: true,
                              );
                              return;
                            }
                            handleSyncBankTransactions(bankId: bankModel.id);
                          },
                          borderRadius: BorderRadius.circular(10),
                          child: Padding(
                            padding: const EdgeInsets.all(5),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              spacing: 10,
                              children: [
                                Icon(
                                  Icons.refresh,
                                  color: Colors.white,
                                  size: 20,
                                ),
                                Text(
                                  "Last Sync: ${bankModel.lastSyncAt == null ? "Never" : Jiffy.parseFromDateTime(bankModel.lastSyncAt!).fromNow()}",
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActionsMenu() {
    if (onEdit == null && onDelete == null) return const SizedBox();
    return PopupMenuButton<String>(
      icon: const Icon(Icons.more_horiz, color: Colors.white),
      onSelected: (value) {
        if (value == 'edit') onEdit?.call();
        if (value == 'delete') onDelete?.call();
      },
      itemBuilder: (context) => [
        if (onEdit != null)
          const PopupMenuItem(
            value: 'edit',
            child: Row(
              children: [
                Icon(Icons.edit, size: 20),
                SizedBox(width: 8),
                Text('Edit Institution'),
              ],
            ),
          ),
        if (onDelete != null)
          const PopupMenuItem(
            value: 'delete',
            child: Row(
              children: [
                Icon(Icons.delete, size: 20, color: Colors.red),
                SizedBox(width: 8),
                Text('Remove Bank', style: TextStyle(color: Colors.red)),
              ],
            ),
          ),
      ],
    );
  }
}
