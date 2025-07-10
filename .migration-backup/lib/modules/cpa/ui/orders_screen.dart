import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/models/order_model.dart';
import 'package:booksmart/modules/user/controllers/order_controller.dart';
import 'package:booksmart/modules/user/ui/cpa/components/cpa_order_card.dart';
import 'package:dropdown_search/dropdown_search.dart';
import 'package:get/get.dart';

import '../../../widgets/custom_drop_down.dart';

class OrdersScreenCPA extends StatefulWidget {
  const OrdersScreenCPA({super.key});

  @override
  State<OrdersScreenCPA> createState() => _OrdersScreenCPAState();
}

class _OrdersScreenCPAState extends State<OrdersScreenCPA> {
  /// Selected filter
  OrderStatus? selectedFilter;

  /// Dropdown key
  final GlobalKey<DropdownSearchState<OrderStatus?>> _filterKey =
      GlobalKey<DropdownSearchState<OrderStatus?>>();

  @override
  void initState() {
    super.initState();

    if (!Get.isRegistered<OrderController>()) {
      Get.put(OrderController(), permanent: true);
    }

    WidgetsBinding.instance.addPostFrameCallback((_) {
      Get.find<OrderController>().fetchActiveOrders();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: Row(
              children: [
                Expanded(
                  child: AppText(
                    "Orders",
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),

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
          ),

          const SizedBox(height: 10),

          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: GetX<OrderController>(
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
                    return const Center(
                      child: Text(
                        "No orders found",
                        style: TextStyle(color: Colors.grey),
                      ),
                    );
                  }

                  return ListView.builder(
                    padding: const EdgeInsets.only(bottom: 20),
                    itemCount: filteredOrders.length,
                    itemBuilder: (context, index) {
                      final order = filteredOrders[index];
                      return OrderCard(order: order);
                    },
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
