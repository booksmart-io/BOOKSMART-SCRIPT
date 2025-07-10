import 'package:booksmart/widgets/app_text.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:dropdown_search/dropdown_search.dart';
import 'package:booksmart/models/order_model.dart';
import 'package:booksmart/modules/user/controllers/order_controller.dart';
import 'package:booksmart/widgets/custom_drop_down.dart';
import '../components/cpa_order_card.dart';

class UserOrdersScreen extends StatefulWidget {
  const UserOrdersScreen({super.key});

  @override
  State<UserOrdersScreen> createState() => _UserOrdersScreenState();
}

class _UserOrdersScreenState extends State<UserOrdersScreen> {
  /// Selected filter
  OrderStatus? selectedFilter;

  /// Dropdown key
  final GlobalKey<DropdownSearchState<OrderStatus?>> _filterKey =
      GlobalKey<DropdownSearchState<OrderStatus?>>();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Active Orders"), centerTitle: false),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            /// ==============================
            /// ACTIVE ORDERS HEADER + FILTER
            /// ==============================
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: const AppText(
                    "Active Orders",
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                  ),
                ),

                /// 🔽 Dropdown Filter
                SizedBox(
                  width: 130,
                  child: CustomDropDownWidget<OrderStatus?>(
                    dropDownKey: _filterKey,
                    label: "Filter Orders",
                    hint: "Filter by status",
                    selectedItem: selectedFilter,
                    items: [null, ...OrderStatus.values],
                    itemAsString: (status) {
                      if (status == null) return "All";
                      return status.name.capitalizeFirst!;
                    },
                    onChanged: (value) {
                      setState(() {
                        selectedFilter = value;
                      });
                    },
                  ),
                ),
              ],
            ),

            const SizedBox(height: 20),

            /// ==============================
            /// ACTIVE ORDERS LIST
            /// ==============================
            GetX<OrderController>(
              init: OrderController(),
              initState: (_) {
                Get.find<OrderController>().fetchActiveOrders();
              },
              builder: (controller) {
                if (controller.isLoading.value) {
                  return const Center(child: CircularProgressIndicator());
                }

                final filteredOrders = selectedFilter == null
                    ? controller.activeOrders
                    : controller.activeOrders.where((order) {
                        final orderStatusEnum = OrderStatus.fromString(
                          order.status.name,
                        );
                        return orderStatusEnum == selectedFilter;
                      }).toList();

                if (filteredOrders.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(vertical: 40),
                    child: Center(
                      child: Text(
                        "No orders found for this status",
                        style: TextStyle(color: Colors.grey),
                      ),
                    ),
                  );
                }

                return Column(
                  children: filteredOrders
                      .map((order) => OrderCard(order: order))
                      .toList(),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
