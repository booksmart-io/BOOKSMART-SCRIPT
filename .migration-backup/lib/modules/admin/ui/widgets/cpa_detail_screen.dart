import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/models/user_base_model.dart';
import 'package:booksmart/widgets/custom_dialog.dart';
import 'package:booksmart/modules/common/ui/chat/chat_screen.dart';
import 'package:get/get.dart';

void showCpaDetailsDialog(CpaModel user) {
  final String fullName = '${user.firstName} ${user.lastName}'.trim().isEmpty
      ? 'Unnamed CPA'
      : '${user.firstName} ${user.lastName}';

  customDialog(
    title: 'CPA Details',
    child: SingleChildScrollView(
      padding: const EdgeInsets.all(15),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          _infoRow('Name', fullName),
          _infoRow('Email', user.email),
          _infoRow(
            'Status',
            user.verificationStatus.name.toUpperCase(),
            valueColor: _statusColor(user.verificationStatus),
          ),
          _infoRow('Experience', '${user.getExperienceInYears} years'),
          _infoRow('License #', user.licenseNumber),

          0.04.verticalSpace,

          _listSection('Certifications', user.certifications),
          _listSection('Specialties', user.specialties),
          _listSection('State Focus', user.stateFocuses),

          if (user.professionalBio.isNotEmpty) ...[
            0.04.verticalSpace,
            const AppText('Professional Bio', fontWeight: FontWeight.w600),
            0.01.verticalSpace,
            AppText(user.professionalBio, fontSize: 13, color: Colors.grey),
          ],

          0.04.verticalSpace,

          _infoRow('Terms Agreed', user.termsAgreed ? 'Yes' : 'No'),

          if (user.certificationProofUrl.isNotEmpty)
            _infoRow('Certification Proof', 'Uploaded'),

          if (user.licenseCopyUrl.isNotEmpty)
            _infoRow('License Copy', 'Uploaded'),

          0.04.verticalSpace,
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () {
                Get.back(); // close dialog
                goToChatScreen(user.data, shouldCloseBefore: false);
              },
              icon: const Icon(Icons.message, color: Colors.black),
              label: Text('Message CPA', style: TextStyle(color: Colors.black)),
            ),
          ),
        ],
      ),
    ),
  );
}

Widget _infoRow(String label, String value, {Color? valueColor}) {
  return Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 120,
          child: AppText('$label:', fontWeight: FontWeight.w600, fontSize: 13),
        ),
        Expanded(
          child: AppText(
            value.isEmpty ? '-' : value,
            fontSize: 13,
            color: valueColor ?? Colors.grey[700],
          ),
        ),
      ],
    ),
  );
}

Widget _listSection(String title, List<String> items) {
  if (items.isEmpty) return const SizedBox.shrink();

  return Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Divider(),
      AppText(title, fontWeight: FontWeight.w600),
      0.01.verticalSpace,
      Wrap(
        spacing: 6,
        runSpacing: 6,
        children: items
            .map(
              (e) => Chip(label: Text(e), visualDensity: VisualDensity.compact),
            )
            .toList(),
      ),
    ],
  );
}

Color _statusColor(CpaVerificationStatus status) {
  switch (status) {
    case CpaVerificationStatus.approved:
      return Colors.green;
    case CpaVerificationStatus.pending:
      return Colors.orange;
    case CpaVerificationStatus.rejected:
      return Colors.red;
  }
}
