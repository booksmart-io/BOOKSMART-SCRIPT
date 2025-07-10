import 'package:booksmart/modules/common/ui/chat/chat_screen.dart';
import 'package:booksmart/widgets/custom_circle_avatar.dart';
import 'package:booksmart/models/order_model.dart';
import 'package:booksmart/models/user_base_model.dart';
import 'package:booksmart/modules/common/controllers/auth_controller.dart';
import 'package:booksmart/helpers/currency_formatter.dart';
import 'package:get/get.dart';
import '../../../../../constant/exports.dart';
import '../order/detail_screen.dart';

class OrderCard extends StatelessWidget {
  final OrderModel order;
  const OrderCard({super.key, required this.order});

  Color getStatusColor(OrderStatus status) {
    switch (status) {
      case OrderStatus.completed:
        return Colors.green;
      case OrderStatus.pending:
        return Colors.orange;
      case OrderStatus.cancelled:
      case OrderStatus.rejected:
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final authController = Get.find<AuthController>();
    final isCpa = authController.person?.role == UserRole.cpa;
    final target = isCpa ? order.user : order.cpa;
    final defaultLabel = isCpa ? "User" : "CPA";

    // Try to treat target as CPA if we want to show experience,
    // but target is PersonModel. In a real app we might cast or have a getter.
    final targetName = target != null
        ? "${target.firstName} ${target.lastName}"
        : defaultLabel;

    return Container(
      margin: const EdgeInsets.only(bottom: 15),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.1),
            blurRadius: 6,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: () {
            goToCpaOrderDetailScreen(order: order);
          },
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Profile Section (Left)
                Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CustomCircleAvatar(
                      imgUrl: target?.imgUrl ?? "",
                      alternateText: target?.firstName ?? "U",
                      radius: 30,
                      backgroundColor: scheme.primary.withValues(alpha: 0.1),
                    ),
                    const SizedBox(height: 5),
                    if (order.userReviewStars != null) ...[
                      FittedText(
                        "⭐" * order.userReviewStars!.toInt(),
                        style: const TextStyle(fontSize: 8),
                      ),
                      AppText(
                        "${order.userReviewStars!.toStringAsFixed(1)} Rating",
                        fontSize: 10,
                      ),
                    ] else ...[
                      const FittedText("⭐⭐⭐⭐⭐", style: TextStyle(fontSize: 8)),
                      const AppText("New Order", fontSize: 10),
                    ],
                  ],
                ),
                const SizedBox(width: 15),

                // Details Section (Center)
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: AppText(
                              targetName,
                              fontWeight: FontWeight.w700,
                              fontSize: 14,
                            ),
                          ),
                          AppText(
                            "#${order.id}",
                            fontSize: 10,
                            color: Colors.grey,
                          ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      AppText(
                        order.title,
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      AppText(
                        "Amount: ${CurrencyUtils.format(order.amount)}",
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: scheme.primary,
                      ),
                      const SizedBox(height: 8),

                      // Services Tags
                      if (order.services.isNotEmpty)
                        SizedBox(
                          width: double.infinity,
                          child: Wrap(
                            spacing: 5,
                            runSpacing: 5,
                            children: order.services.take(3).map((tag) {
                              return Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 6,
                                  vertical: 2,
                                ),
                                decoration: BoxDecoration(
                                  color: scheme.primary.withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(
                                    color: scheme.primary.withValues(
                                      alpha: 0.5,
                                    ),
                                  ),
                                ),
                                child: Text(
                                  tag,
                                  style: TextStyle(
                                    fontSize: 9,
                                    color: scheme.primary,
                                  ),
                                ),
                              );
                            }).toList(),
                          ),
                        ),
                    ],
                  ),
                ),

                // Actions & Status Section (Right)
                const SizedBox(width: 10),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: getStatusColor(
                          order.status,
                        ).withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        order.status.name.toUpperCase(),
                        style: TextStyle(
                          fontSize: 9,
                          color: getStatusColor(order.status),
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    const SizedBox(height: 15),
                    IconButton(
                      visualDensity: VisualDensity.compact,
                      onPressed: () {
                        if (target != null) {
                          goToChatScreen(target, shouldCloseBefore: false);
                        }
                      },
                      icon: const Icon(Icons.chat_bubble_outline, size: 20),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
