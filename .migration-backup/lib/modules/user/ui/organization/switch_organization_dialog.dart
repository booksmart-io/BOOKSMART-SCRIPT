import 'package:booksmart/modules/user/controllers/organization_controller.dart';
import 'package:booksmart/widgets/snackbar.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../../models/organization_model.dart';

void showSwitchOrganizationDialog() {
  Get.generalDialog(
    pageBuilder: (context, animation, secondaryAnimation) {
      return Align(
        alignment: Alignment.center,
        child: Container(
          margin: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            color: Get.isDarkMode
                ? Get.theme.colorScheme.surface
                : Colors.white,
          ),
          constraints: const BoxConstraints(maxWidth: 350),
          child: Material(
            color: Colors.transparent,
            child: GetBuilder<OrganizationController>(
              builder: (controller) {
                if (controller.isLoading.value) {
                  return const Center(child: CircularProgressIndicator());
                }

                if (controller.organizations.isEmpty) {
                  return const Center(child: Text("No organizations found"));
                }

                return SingleChildScrollView(
                  padding: const EdgeInsets.all(15),
                  child: Column(
                    spacing: 10,
                    children: controller.organizations.map((
                      OrganizationModel org,
                    ) {
                      bool isCurrent = getCurrentOrganization == org;
                      return Material(
                        color: isCurrent
                            ? Get.theme.colorScheme.primary
                            : Colors.transparent,
                        borderRadius: BorderRadius.circular(10),
                        child: ListTile(
                          leading: const Icon(Icons.business),
                          title: Text(org.name),
                          subtitle: Text(org.einTin),
                          onTap: () {
                            Get.back();
                            showSnackBar('Switched to ${org.name}');
                            organizationControllerInstance.switchOrganization(
                              org,
                            );
                          },
                        ),
                      );
                    }).toList(),
                  ),
                );
              },
            ),
          ),
        ),
      );
    },
    barrierDismissible: true,
    barrierLabel: "showSwitchOrganizationDialog",
  );
}
