// ignore_for_file: deprecated_member_use

import 'package:booksmart/models/user_base_model.dart';
import 'package:booksmart/modules/admin/controllers/cpa_controller.dart';
import 'package:booksmart/modules/admin/ui/widgets/cpa_detail_screen.dart';
import 'package:booksmart/widgets/app_text.dart';
import 'package:booksmart/widgets/custom_circle_avatar.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

class CpaListScreenAdmin extends StatefulWidget {
  const CpaListScreenAdmin({super.key});

  @override
  State<CpaListScreenAdmin> createState() => _CpaListScreenAdminState();
}

class _CpaListScreenAdminState extends State<CpaListScreenAdmin> {
  late AdminCpaController usersController;

  @override
  void initState() {
    if (Get.isRegistered<AdminCpaController>()) {
      usersController = Get.find<AdminCpaController>();
    } else {
      usersController = Get.put(AdminCpaController(), permanent: true);
    }
    super.initState();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("CPAs"),
        automaticallyImplyLeading: !kIsWeb,
      ),
      body: GetBuilder<AdminCpaController>(
        builder: (controller) {
          if (controller.isLoading) {
            return const Center(child: CircularProgressIndicator());
          }

          if (controller.cpas.isEmpty) {
            return const Center(child: AppText('No CPA found'));
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: controller.cpas.length,
            itemBuilder: (_, index) {
              final CpaModel user = controller.cpas[index];

              final String fullName = '${user.firstName} ${user.lastName}'
                  .trim();

              return Card(
                margin: const EdgeInsets.only(bottom: 12),
                child: ListTile(
                  leading: CustomCircleAvatar(
                    imgUrl: user.imgUrl,
                    alternateText: fullName,
                    radius: 25,
                  ),
                  //const CircleAvatar(child: Icon(Icons.person)),
                  title: AppText(
                    fullName.isEmpty ? 'Unnamed User' : fullName,
                    fontWeight: FontWeight.w600,
                  ),
                  subtitle: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [AppText(user.email, fontSize: 12)],
                  ),
                  trailing: _buildRoleChip(user),
                  onTap: () => showCpaDetailsDialog(user),
                ),
              );
            },
          );
        },
      ),
    );
  }

  // ================= ROLE CHIP =================

  Widget _buildRoleChip(CpaModel user) {
    final role = user.verificationStatus;

    Color bgColor;
    switch (role) {
      case CpaVerificationStatus.approved:
        bgColor = Colors.blueAccent;
        break;
      case CpaVerificationStatus.pending:
        bgColor = Colors.orangeAccent;
        break;
      case CpaVerificationStatus.rejected:
        bgColor = Colors.redAccent;
        break;
    }

    return InkWell(
      onTap: () {
        Get.dialog(UpdateCpaStatusDialog(user: user), barrierDismissible: true);
      },
      child: Chip(
        label: Text(role.name.toUpperCase()),
        backgroundColor: bgColor,
      ),
    );
  }
}

class UpdateCpaStatusDialog extends StatefulWidget {
  final CpaModel user;

  const UpdateCpaStatusDialog({super.key, required this.user});

  @override
  State<UpdateCpaStatusDialog> createState() => _UpdateCpaStatusDialogState();
}

class _UpdateCpaStatusDialogState extends State<UpdateCpaStatusDialog> {
  late CpaVerificationStatus selectedStatus;

  @override
  void initState() {
    super.initState();
    selectedStatus = widget.user.verificationStatus;
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Update Verification Status'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: CpaVerificationStatus.values.map((status) {
          return Container(
            margin: EdgeInsets.all(2),
            child: RadioListTile<CpaVerificationStatus>(
              title: Text(status.name.toUpperCase()),
              value: status,
              groupValue: selectedStatus,
              onChanged: (val) {
                if (val != null) {
                  setState(() {
                    selectedStatus = val;
                  });
                }
              },
            ),
          );
        }).toList(),
      ),
      actions: [
        TextButton(onPressed: () => Get.back(), child: const Text('Cancel')),
        ElevatedButton(
          onPressed: selectedStatus == widget.user.verificationStatus
              ? null
              : () {
                  Get.find<AdminCpaController>().updateVerificationStatus(
                    cpaId: widget.user.id,
                    status: selectedStatus,
                  );
                  Get.back();
                },
          child: const Text('Update', style: TextStyle(color: Colors.black)),
        ),
      ],
    );
  }
}
