import 'package:booksmart/modules/common/controllers/auth_controller.dart';
import 'package:booksmart/models/service_model.dart';
import 'package:booksmart/modules/cpa/controllers/service_controler.dart';
import 'package:booksmart/widgets/custom_dialog.dart' show customDialog;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../../../widgets/app_text.dart';
import 'package:booksmart/helpers/currency_formatter.dart';

void goToCPAServicesScreen({bool shouldCloseBefore = false}) {
  if (kIsWeb) {
    if (shouldCloseBefore) {
      Get.back();
    }
    customDialog(
      child: const CpaServicesScreen(),
      title: 'Services',
      barrierDismissible: true,
    );
  } else {
    if (shouldCloseBefore) {
      Get.off(() => const CpaServicesScreen());
    } else {
      Get.to(() => const CpaServicesScreen());
    }
  }
}

class CpaServicesScreen extends StatefulWidget {
  const CpaServicesScreen({super.key});

  @override
  State<CpaServicesScreen> createState() => _CpaServicesScreenState();
}

class _CpaServicesScreenState extends State<CpaServicesScreen> {
  late ServiceController controller;

  @override
  void initState() {
    super.initState();
    controller = Get.put(ServiceController(cpaId: authCpa!.id));
  }

  void _showServiceDialog({ServiceModel? service}) {
    final titleController = TextEditingController(text: service?.title);
    final descController = TextEditingController(text: service?.description);
    final priceController = TextEditingController(
      text: service?.price.toString(),
    );

    Get.dialog(
      AlertDialog(
        title: AppText(
          service == null ? "Add New Service" : "Edit Service",
          fontWeight: FontWeight.bold,
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: titleController,
              decoration: const InputDecoration(labelText: "Service Title"),
            ),
            SizedBox(height: 6),
            TextField(
              controller: descController,
              decoration: const InputDecoration(labelText: "Description"),
            ),
            SizedBox(height: 6),
            TextField(
              controller: priceController,
              decoration: const InputDecoration(labelText: "Price"),
              keyboardType: TextInputType.number,
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Get.back(), child: const Text("Cancel")),
          ElevatedButton(
            onPressed: () async {
              if (titleController.text.isEmpty ||
                  priceController.text.isEmpty) {
                Get.snackbar("Error", "Title and Price are required");
                return;
              }
              final price = double.tryParse(priceController.text);
              if (price == null) {
                Get.snackbar("Error", "Invalid price");
                return;
              }

              bool success;
              if (service == null) {
                success = await controller.addService(
                  title: titleController.text,
                  description: descController.text,
                  price: price,
                );
              } else {
                success = await controller.updateService(
                  serviceId: service.id,
                  title: titleController.text,
                  description: descController.text,
                  price: price,
                );
              }

              if (success) {
                Get.back();
              }
            },
            child: Text(service == null ? "Add" : "Update"),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: kIsWeb
          ? null
          : AppBar(
              title: const Text("Manage Services"),
              centerTitle: false,
              elevation: 0,
            ),
      body: Obx(() {
        if (controller.isLoading.value) {
          return const Center(child: CircularProgressIndicator());
        }

        if (controller.services.isEmpty) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(
                  Icons.inventory_2_outlined,
                  size: 60,
                  color: Colors.grey,
                ),
                const SizedBox(height: 16),
                AppText("No services available.", color: Colors.grey),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: () => _showServiceDialog(),
                  child: const Text("Add Your First Service"),
                ),
              ],
            ),
          );
        }

        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: controller.services.length,
          itemBuilder: (context, index) {
            final service = controller.services[index];
            return Card(
              margin: const EdgeInsets.only(bottom: 12),
              child: ListTile(
                onTap: () => _showServiceDialog(service: service),
                title: AppText(service.title, fontWeight: FontWeight.bold),
                subtitle: AppText(service.description, fontSize: 12),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    AppText(
                      CurrencyUtils.format(service.price),
                      fontWeight: FontWeight.bold,
                    ),
                    const SizedBox(width: 8),
                    IconButton(
                      icon: const Icon(
                        Icons.delete,
                        color: Colors.red,
                        size: 20,
                      ),
                      onPressed: () {
                        Get.defaultDialog(
                          title: "Delete Service",
                          middleText:
                              "Are you sure you want to delete this service?",
                          textConfirm: "Delete",
                          textCancel: "Cancel",
                          confirmTextColor: Colors.white,
                          onConfirm: () async {
                            final success = await controller.deleteService(
                              service.id,
                            );
                            if (success) {
                              Get.back();
                            }
                          },
                        );
                      },
                    ),
                  ],
                ),
              ),
            );
          },
        );
      }),
      floatingActionButton: Obx(() {
        return controller.services.isNotEmpty
            ? FloatingActionButton(
                onPressed: () => _showServiceDialog(),
                child: const Icon(Icons.add),
              )
            : const SizedBox();
      }),
    );
  }
}
