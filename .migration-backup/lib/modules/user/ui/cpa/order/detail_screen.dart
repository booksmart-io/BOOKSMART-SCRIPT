import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/models/user_base_model.dart';
import 'package:booksmart/modules/user/ui/cpa/order/components/metadata_dialog.dart';
import 'package:booksmart/services/edge_functions.dart';
import 'package:booksmart/widgets/confirmation_dialog.dart';
import 'package:booksmart/widgets/custom_dialog.dart';
import 'package:booksmart/widgets/loading.dart';
import 'package:booksmart/widgets/snackbar.dart';
import 'package:flutter/foundation.dart';
import 'package:get/get.dart';
import 'package:booksmart/models/order_model.dart';
import 'package:booksmart/modules/user/controllers/order_controller.dart';

import '../../../../common/controllers/auth_controller.dart';
import '../../../../common/ui/chat/chat_screen.dart';
import 'package:booksmart/models/user_document_model.dart';
import 'package:booksmart/modules/user/controllers/tax_document_controller.dart';
import 'package:booksmart/supabase/tables.dart';
import 'package:booksmart/utils/supabase.dart';
import 'package:url_launcher/url_launcher.dart';
import 'dart:developer';

void goToCpaOrderDetailScreen({
  bool shouldCloseBefore = false,
  required OrderModel order,
}) {
  if (kIsWeb) {
    if (shouldCloseBefore) {
      Get.back(); // close previous dialog
    }
    customDialog(
      child: CpaOrderDetailScreen(order: order),
      title: 'Order Details',
      barrierDismissible: true,
    );
  } else {
    if (shouldCloseBefore) {
      Get.off(() => CpaOrderDetailScreen(order: order));
    } else {
      Get.to(() => CpaOrderDetailScreen(order: order));
    }
  }
}

class CpaOrderDetailScreen extends StatefulWidget {
  final OrderModel order;
  const CpaOrderDetailScreen({super.key, required this.order});

  @override
  State<CpaOrderDetailScreen> createState() => _CpaOrderDetailScreenState();
}

class _CpaOrderDetailScreenState extends State<CpaOrderDetailScreen> {
  final List<UserDocument> _deliveryDocs = [];
  bool _isFetchingDocs = false;
  late OrderModel _currentOrder;

  @override
  void initState() {
    super.initState();
    _currentOrder = widget.order;
    if (!Get.isRegistered<OrderController>()) {
      Get.put(OrderController());
    }
    _fetchDeliveryDocs();
  }

  Future<void> _fetchDeliveryDocs() async {
    if (_currentOrder.deliveryFiles == null ||
        _currentOrder.deliveryFiles!.isEmpty) {
      return;
    }
    try {
      setState(() => _isFetchingDocs = true);
      final result = await supabase
          .from(SupabaseTable.userDocuments)
          .select()
          .eq('order_id', _currentOrder.id);

      if (mounted) {
        setState(() {
          _deliveryDocs.addAll(
            (result as List).map((e) => UserDocument.fromJson(e)).toList(),
          );
          _isFetchingDocs = false;
        });
      }
    } catch (e) {
      log("Error fetching delivery docs: $e");
      if (mounted) setState(() => _isFetchingDocs = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: kIsWeb ? null : AppBar(title: const Text("Order Details")),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Order Header with Status
            _buildOrderHeader(context),
            const SizedBox(height: 24),
            // CPA Info
            if (_currentOrder.cpa != null)
              ListTile(
                leading: CircleAvatar(
                  backgroundColor: Colors.grey,
                  backgroundImage: NetworkImage(_currentOrder.cpa!.imgUrl),
                ),
                title: Text(
                  "${_currentOrder.cpa!.firstName} ${_currentOrder.cpa!.lastName}",
                ),
                subtitle: Text(_currentOrder.cpa!.email),
                trailing: IconButton(
                  onPressed: () {
                    goToChatScreen(_currentOrder.cpa!);
                  },
                  icon: const Icon(Icons.chat_bubble_outline),
                ),
              ),
            const SizedBox(height: 24),
            // Order Information
            _buildOrderInfoSection(context),
            const SizedBox(height: 24),
            // Description Section
            if (_currentOrder.description != null &&
                _currentOrder.description!.isNotEmpty)
              _buildDescriptionSection(context),
            const SizedBox(height: 24),
            // Delivery Details Section
            if ((_currentOrder.deliverMessage != null &&
                    _currentOrder.deliverMessage!.isNotEmpty) ||
                (_currentOrder.deliveryFiles != null &&
                    _currentOrder.deliveryFiles!.isNotEmpty))
              _buildDeliveryDetailsSection(context),
            // Action Buttons
            if (_currentOrder.status == OrderStatus.pending) ...[
              if (authPerson?.role != UserRole.cpa)
                _buildActionButtons(context),
              const SizedBox(height: 20),
            ],
            if ((_currentOrder.status == OrderStatus.accepted ||
                    _currentOrder.status == OrderStatus.revision) &&
                authPerson?.role == UserRole.cpa) ...[
              SizedBox(
                width: double.infinity,
                child: AppButton(
                  buttonText: _currentOrder.status == OrderStatus.revision
                      ? "Re-Deliver Order"
                      : "Deliver Order",
                  onTapFunction: () {
                    _showDeliverOrderDialog(
                      context,
                      isReDelivery:
                          _currentOrder.status == OrderStatus.revision,
                    );
                  },
                ),
              ),
              const SizedBox(height: 20),
            ],
            if (_currentOrder.status == OrderStatus.delivered &&
                authPerson?.role != UserRole.cpa) ...[
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () {
                        showConfirmationDialog(
                          title: "Reject Delivery",
                          description:
                              "Are you sure you want to reject this delivery and ask for revision?",
                          onYes: () async {
                            await Get.find<OrderController>().updateOrderStatus(
                              _currentOrder.id,
                              OrderStatus.revision,
                            );
                            Get.back();
                          },
                        );
                      },
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: const BorderSide(color: Colors.red),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      child: const AppText("Reject Delivery", fontSize: 13),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () {
                        Get.generalDialog(
                          barrierDismissible: true,
                          barrierLabel: "Accept Delivery",
                          pageBuilder: (context, anim1, anim2) {
                            bool isAccepting = false;
                            return StatefulBuilder(
                              builder: (context, setDialogState) {
                                return Align(
                                  alignment: Alignment.center,
                                  child: Card(
                                    margin: const EdgeInsets.all(30),
                                    child: Container(
                                      constraints: const BoxConstraints(
                                        maxWidth: 320,
                                      ),
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 10,
                                        vertical: 10,
                                      ),
                                      child: Column(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Align(
                                            alignment: Alignment.centerRight,
                                            child: Padding(
                                              padding: const EdgeInsets.only(
                                                right: 10,
                                              ),
                                              child: SizedBox(
                                                width: 30,
                                                height: 30,
                                                child: IconButton(
                                                  onPressed: () => Get.back(),
                                                  icon: const Icon(Icons.close),
                                                  iconSize: 20,
                                                  padding: EdgeInsets.zero,
                                                ),
                                              ),
                                            ),
                                          ),
                                          const Text(
                                            "Accept Delivery",
                                            style: TextStyle(
                                              fontSize: 18,
                                              fontWeight: FontWeight.bold,
                                            ),
                                          ),
                                          const SizedBox(height: 20),
                                          const Padding(
                                            padding: EdgeInsets.symmetric(
                                              horizontal: 20,
                                            ),
                                            child: Text(
                                              "Are you sure you want to accept this delivery? The order will be marked as completed.",
                                              textAlign: TextAlign.center,
                                              style: TextStyle(
                                                fontSize: 16,
                                                height: 1.2,
                                                decoration: TextDecoration.none,
                                              ),
                                            ),
                                          ),
                                          const SizedBox(height: 20),
                                          ElevatedButton(
                                            onPressed: isAccepting
                                                ? null
                                                : () async {
                                                    setDialogState(
                                                      () => isAccepting = true,
                                                    );

                                                    await Get.find<
                                                          OrderController
                                                        >()
                                                        .updateOrderStatus(
                                                          _currentOrder.id,
                                                          OrderStatus.completed,
                                                        );

                                                    Get.back(); // Close dialog

                                                    showSnackBar(
                                                      "Delivery accepted successfully",
                                                      title:
                                                          "✔ Delivery Accepted",
                                                      begroundColor:
                                                          Colors.green,
                                                    );

                                                    setState(() {
                                                      _currentOrder =
                                                          OrderModel.fromJson({
                                                            ..._currentOrder
                                                                .toJson(),
                                                            'status':
                                                                OrderStatus
                                                                    .completed
                                                                    .name,
                                                          });
                                                    });
                                                  },
                                            child: isAccepting
                                                ? Row(
                                                    mainAxisSize:
                                                        MainAxisSize.min,
                                                    children: const [
                                                      SizedBox(
                                                        width: 16,
                                                        height: 16,
                                                        child:
                                                            CircularProgressIndicator(
                                                              strokeWidth: 2,
                                                            ),
                                                      ),
                                                      SizedBox(width: 8),
                                                      Text("Processing..."),
                                                    ],
                                                  )
                                                : const Text("Yes"),
                                          ),
                                          const SizedBox(height: 20),
                                        ],
                                      ),
                                    ),
                                  ),
                                );
                              },
                            );
                          },
                        );
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      child: const AppText(
                        "Accept Delivery",
                        fontSize: 13,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildOrderHeader(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    Color statusColor = Colors.grey;
    if (_currentOrder.status == OrderStatus.completed) {
      statusColor = Colors.green;
    }
    if (_currentOrder.status == OrderStatus.pending) {
      statusColor = Colors.orange;
    }
    if (_currentOrder.status == OrderStatus.rejected ||
        _currentOrder.status == OrderStatus.cancelled) {
      statusColor = Colors.red;
    }

    return Card(
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(10),
        child: Column(
          children: [
            AppText(
              "Order #${_currentOrder.id}",
              fontSize: 14,
              fontWeight: FontWeight.bold,
            ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: statusColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: statusColor),
              ),
              child: AppText(
                _currentOrder.status.name.toUpperCase(),
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: statusColor,
              ),
            ),
            const SizedBox(height: 8),
            AppText(
              _currentOrder.title,
              fontSize: 16,
              color: colorScheme.onSurface,
              textAlign: TextAlign.center,
              fontWeight: FontWeight.bold,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildOrderInfoSection(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const AppText(
          " Order Information",
          fontSize: 16,
          fontWeight: FontWeight.bold,
        ),
        const SizedBox(height: 12),
        Card(
          clipBehavior: Clip.antiAlias,
          child: Container(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                if (_currentOrder.daysToComplete != null)
                  _buildInfoRow(
                    "Days to Complete",
                    "${_currentOrder.daysToComplete} Days",
                  ),
                if (_currentOrder.expirationDate != null)
                  _buildInfoRow(
                    "Expiration Date",
                    _formatDate(_currentOrder.expirationDate!),
                  ),
                _buildInfoRow("Cost", "\$${_currentOrder.amount}"),
                if (_currentOrder.deliverables != null &&
                    _currentOrder.deliverables!.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  const Divider(),
                  const SizedBox(height: 10),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      AppText(
                        "Deliverables",
                        fontSize: 14,
                        color: Colors.grey[600],
                        fontWeight: FontWeight.w500,
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: _currentOrder.deliverables!.map((e) {
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 4),
                              child: Text(
                                "• $e",
                                style: const TextStyle(fontSize: 13),
                                textAlign: TextAlign.right,
                              ),
                            );
                          }).toList(),
                        ),
                      ),
                    ],
                  ),
                ],
                if (_currentOrder.cancellationPolicy != null &&
                    _currentOrder.cancellationPolicy!.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  const Divider(),
                  const SizedBox(height: 10),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      AppText(
                        "Cancellation Policy",
                        fontSize: 14,
                        color: Colors.grey[600],
                        fontWeight: FontWeight.w500,
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Text(
                          _currentOrder.cancellationPolicy!,
                          style: const TextStyle(fontSize: 13),
                          textAlign: TextAlign.right,
                        ),
                      ),
                    ],
                  ),
                ],
                if (_currentOrder.services.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  const Divider(),
                  const SizedBox(height: 10),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      AppText(
                        "Services",
                        fontSize: 14,
                        color: Colors.grey[600],
                        fontWeight: FontWeight.w500,
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Wrap(
                          alignment: WrapAlignment.end,
                          spacing: 4,
                          runSpacing: 4,
                          children: _currentOrder.services.map((e) {
                            return Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: Theme.of(
                                  context,
                                ).primaryColor.withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                e,
                                style: TextStyle(
                                  fontSize: 11,
                                  color: Theme.of(context).primaryColor,
                                ),
                              ),
                            );
                          }).toList(),
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildDescriptionSection(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const AppText(
          "  Description",
          fontSize: 14,
          fontWeight: FontWeight.bold,
        ),
        const SizedBox(height: 8),
        Card(
          margin: EdgeInsets.zero,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Text(_currentOrder.description!),
          ),
        ),
      ],
    );
  }

  Widget _buildDeliveryDetailsSection(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const AppText(
          "  Delivery Details",
          fontSize: 14,
          fontWeight: FontWeight.bold,
        ),
        const SizedBox(height: 8),
        Card(
          margin: EdgeInsets.zero,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_currentOrder.deliverMessage != null &&
                    _currentOrder.deliverMessage!.isNotEmpty) ...[
                  Text(_currentOrder.deliverMessage!),
                  const SizedBox(height: 16),
                ],
                if (_currentOrder.deliveryFiles != null &&
                    _currentOrder.deliveryFiles!.isNotEmpty) ...[
                  const AppText(
                    "Attached Files",
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                  ),
                  const SizedBox(height: 8),
                  if (_isFetchingDocs)
                    const Center(
                      child: Padding(
                        padding: EdgeInsets.all(8),
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    ),
                  if (_deliveryDocs.isNotEmpty)
                    Column(
                      children: _deliveryDocs
                          .map(
                            (doc) => buildUnifiedFileCard(
                              name: doc.name,
                              category: doc.category,
                              year: doc.taxYear,
                              mimeType: doc.mimeType,
                              onView: () async {
                                final uri = Uri.tryParse(doc.fileUrl);
                                if (uri != null && await canLaunchUrl(uri)) {
                                  await launchUrl(uri);
                                }
                              },
                              onDelete: authPerson?.role == UserRole.cpa
                                  ? () {} // Placeholder as requested
                                  : null,
                            ),
                          )
                          .toList(),
                    )
                  else if (_currentOrder.deliveryFiles != null &&
                      _currentOrder.deliveryFiles!.isNotEmpty)
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: _currentOrder.deliveryFiles!.map((url) {
                        final uri = Uri.tryParse(url);
                        final filename =
                            uri?.pathSegments.last.split('_').last ??
                            "Document";
                        return ActionChip(
                          label: Text(
                            filename,
                            style: const TextStyle(fontSize: 12),
                          ),
                          avatar: const Icon(Icons.download, size: 16),
                          onPressed: () async {
                            if (uri != null && await canLaunchUrl(uri)) {
                              await launchUrl(uri);
                            } else {
                              Get.snackbar(
                                "Error",
                                "Could not open file link.",
                              );
                            }
                          },
                        );
                      }).toList(),
                    ),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _buildActionButtons(BuildContext context) {
    final controller = Get.find<OrderController>();
    return Column(
      children: [
        Obx(() {
          if (authUser?.role != UserRole.cpa) {
            return Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () {
                      _showDeclineReasonDialog(context, controller);
                    },
                    // style: OutlinedButton.styleFrom(
                    //   foregroundColor: colorScheme.error,
                    //   side: BorderSide(color: colorScheme.error),
                    //   padding: const EdgeInsets.symmetric(vertical: 14),
                    // ),
                    child: const AppText("Decline Order", fontSize: 14),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () async {
                      showConfirmationDialog(
                        title: "Are you sure!",
                        description:
                            "Please review all order details carefully. By clicking Accept, your default payment method will be charged.",
                        onYes: () async {
                          Get.close(2);
                          showLoading();
                          await processCpaOrderPayment(
                            orderId: _currentOrder.id,
                          ).then((value) {
                            dismissLoadingWidget();
                            if (value == null) {
                              showSnackBar(
                                "Please wait while we process your payment.",
                              );
                              controller.fetchActiveOrders();
                            } else {
                              showSnackBar(value, isError: true);
                            }
                          });
                        },
                      );
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: const AppText(
                      "Accept Order",
                      fontSize: 14,
                      color: Colors.white,
                    ),
                  ),
                ),
              ],
            );
          }
          return const SizedBox.shrink();
        }),
      ],
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          AppText(
            label,
            fontSize: 14,
            color: Colors.grey[600],
            fontWeight: FontWeight.w500,
          ),
          AppText(value, fontSize: 14, fontWeight: FontWeight.w600),
        ],
      ),
    );
  }

  String _formatDate(DateTime date) {
    return "${date.month}/${date.day}/${date.year}";
  }

  void _showDeclineReasonDialog(
    BuildContext context,
    OrderController controller,
  ) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (context) => Container(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppText(
              "Decline Order",
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
            const SizedBox(height: 16),
            const Text("Are you sure you want to decline this order?"),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Get.back(),
                    child: const AppText("Cancel", fontSize: 14),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: AppButton(
                    buttonText: "Decline",
                    buttonColor: Colors.red,
                    textColor: Colors.white,
                    onTapFunction: () async {
                      await controller.updateOrderStatus(
                        _currentOrder.id,
                        OrderStatus.rejected,
                      );
                      Get.back();
                      Get.back();
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
          ],
        ),
      ),
    );
  }

  void _showDeliverOrderDialog(
    BuildContext context, {
    bool isReDelivery = false,
  }) {
    if (kIsWeb) {
      customDialog(
        child: DeliverOrderWidget(
          order: _currentOrder,
          isReDelivery: isReDelivery,
        ),
        title: isReDelivery ? "Re-Deliver Order" : "Deliver Order",
        barrierDismissible: true,
      );
    } else {
      Get.to(
        () => Scaffold(
          appBar: AppBar(
            title: Text(isReDelivery ? "Re-Deliver Order" : "Deliver Order"),
          ),
          body: SingleChildScrollView(
            child: DeliverOrderWidget(
              order: _currentOrder,
              isReDelivery: isReDelivery,
            ),
          ),
        ),
      );
    }
  }
}

class DeliverOrderWidget extends StatefulWidget {
  final OrderModel order;
  final bool isReDelivery;

  const DeliverOrderWidget({
    super.key,
    required this.order,
    this.isReDelivery = false,
  });

  @override
  State<DeliverOrderWidget> createState() => _DeliverOrderWidgetState();
}

class _DeliverOrderWidgetState extends State<DeliverOrderWidget> {
  final _messageController = TextEditingController();
  final List<DocumentMetadata> _selectedDocuments = [];
  final List<UserDocument> _existingDocs = [];
  bool _isFetchingDocs = false;

  @override
  void initState() {
    super.initState();
    if (widget.isReDelivery) {
      _messageController.text = widget.order.deliverMessage ?? "";
      _fetchExistingDocs();
    }
  }

  Future<void> _fetchExistingDocs() async {
    try {
      setState(() => _isFetchingDocs = true);
      final result = await supabase
          .from(SupabaseTable.userDocuments)
          .select()
          .eq('order_id', widget.order.id);

      if (mounted) {
        setState(() {
          _existingDocs.addAll(
            (result as List).map((e) => UserDocument.fromJson(e)).toList(),
          );
          _isFetchingDocs = false;
        });
      }
    } catch (e) {
      log("Error fetching existing docs: $e");
      if (mounted) setState(() => _isFetchingDocs = false);
    }
  }

  void _pickFiles() async {
    try {
      final metadata = await showDocumentMetadataDialog();
      if (metadata != null) {
        setState(() {
          _selectedDocuments.add(metadata);
        });
      }
    } catch (e) {
      Get.snackbar("Error", "Error picking files: $e");
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<OrderController>();
    return Container(
      padding: const EdgeInsets.all(20),
      width: kIsWeb ? 500 : double.infinity,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppTextField(
            controller: _messageController,
            hintText: "Add a description or message...",
            labelText: "Delivery Message",
            maxLines: 4,
            textInputAction: TextInputAction.newline,
          ),
          const SizedBox(height: 16),
          const Text(
            "Attachments",
            style: TextStyle(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          if (_isFetchingDocs)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(8.0),
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),

          if (_existingDocs.isNotEmpty || _selectedDocuments.isNotEmpty)
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Unified list header omitted for cleaner look, or added if needed
                ..._existingDocs.map(
                  (doc) => buildUnifiedFileCard(
                    name: doc.name,
                    category: doc.category,
                    year: doc.taxYear,
                    mimeType: doc.mimeType,
                    onDelete: () => setState(() => _existingDocs.remove(doc)),
                    onView: () async {
                      final uri = Uri.tryParse(doc.fileUrl);
                      if (uri != null && await canLaunchUrl(uri)) {
                        await launchUrl(uri);
                      }
                    },
                  ),
                ),
                ..._selectedDocuments.map(
                  (doc) => buildUnifiedFileCard(
                    name: doc.name,
                    category: doc.category,
                    year: doc.year,
                    isNew: true,
                    onDelete: () =>
                        setState(() => _selectedDocuments.remove(doc)),
                  ),
                ),
              ],
            ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: _pickFiles,
            icon: const Icon(Icons.attach_file),
            label: const Text("Select Files"),
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: AppButton(
              buttonText: "Deliver",
              onTapFunction: () async {
                if (_messageController.text.trim().isEmpty) {
                  Get.snackbar("Error", "Please add a delivery message");
                  return;
                }
                await controller.deliverOrder(
                  orderId: widget.order.id,
                  message: _messageController.text.trim(),
                  files: _selectedDocuments.map((e) => e.file).toList(),
                  existingFiles: _existingDocs.map((e) => e.fileUrl).toList(),
                  fileMetadata: _selectedDocuments
                      .map(
                        (e) => {
                          'name': e.name,
                          'year': e.year,
                          'category': e.category,
                        },
                      )
                      .toList(),
                  clientUserId: widget.order.userId,
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

Widget buildUnifiedFileCard({
  required String name,
  String? category,
  String? year,
  String? mimeType,
  bool isNew = false,
  VoidCallback? onDelete,
  VoidCallback? onView,
}) {
  return Card(
    margin: const EdgeInsets.only(bottom: 10),
    child: ListTile(
      dense: true,
      leading: Icon(
        TaxDocumentController.iconForMime(mimeType),
        color: isNew ? Colors.blue : null,
        size: 24,
      ),
      title: Text(
        name,
        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
      ),
      subtitle: (category != null || year != null)
          ? Text(
              [
                if (category != null) category,
                if (year != null) year,
              ].join(' · '),
              style: const TextStyle(fontSize: 11),
            )
          : null,
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (onView != null)
            IconButton(
              icon: const Icon(Icons.download, size: 18),
              onPressed: onView,
              tooltip: 'View Document',
              visualDensity: VisualDensity.compact,
            ),
          if (onDelete != null)
            IconButton(
              icon: const Icon(
                Icons.delete_outline,
                color: Colors.red,
                size: 18,
              ),
              onPressed: onDelete,
              tooltip: 'Remove',
              visualDensity: VisualDensity.compact,
            ),
        ],
      ),
    ),
  );
}
