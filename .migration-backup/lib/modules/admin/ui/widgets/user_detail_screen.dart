import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/models/user_base_model.dart';
import 'package:booksmart/widgets/custom_circle_avatar.dart';
import 'package:booksmart/widgets/custom_dialog.dart';
import 'package:booksmart/modules/common/ui/chat/chat_screen.dart';
import 'package:booksmart/utils/supabase.dart';
import 'package:booksmart/supabase/tables.dart';
import 'package:get/get.dart';

import 'package:booksmart/helpers/date_formatter.dart';

void showUserDetailsDialog(PersonModel user) {
  final String fullName = '${user.firstName} ${user.lastName}'.trim().isEmpty
      ? 'Unnamed User'
      : '${user.firstName} ${user.lastName}';

  customDialog(
    title: 'User Details',
    child: FutureBuilder<List<dynamic>>(
      future: supabase
          .from(SupabaseTable.organization)
          .select('*, ${SupabaseTable.bank}(id)')
          .eq('owner_id', user.id),
      builder: (context, snapshot) {
        return SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // Profile Header
              Center(
                child: Column(
                  children: [
                    CustomCircleAvatar(
                      imgUrl: user.imgUrl,
                      alternateText: fullName,
                      radius: 40,
                    ),
                    const SizedBox(height: 12),
                    AppText(
                      fullName,
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                    const SizedBox(height: 4),
                    AppText(user.email, fontSize: 14),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              const Divider(),
              const SizedBox(height: 16),

              // Basic Info
              _infoRow('Phone', user.phoneNumber),
              _infoRow('Role', user.role.name.toUpperCase()),
              _infoRow('Joined', formatDate(user.createdAt)),

              const SizedBox(height: 24),

              // Organizations Section
              const AppText(
                'Organizations',
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
              const SizedBox(height: 8),
              if (snapshot.connectionState == ConnectionState.waiting)
                const Center(
                  child: Padding(
                    padding: EdgeInsets.all(20),
                    child: CircularProgressIndicator.adaptive(),
                  ),
                )
              else if (snapshot.hasError)
                AppText(
                  'Error loading organizations.',
                  color: Colors.red,
                  fontSize: 13,
                )
              else if (snapshot.data == null || snapshot.data!.isEmpty)
                const Text(
                  'No organizations linked to this user.',
                  style: TextStyle(
                    color: Colors.grey,
                    fontSize: 13,
                    fontStyle: FontStyle.italic,
                  ),
                )
              else
                ListView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: snapshot.data!.length,
                  itemBuilder: (context, index) {
                    final org = snapshot.data![index];
                    final String orgName = org['name'] ?? 'Unnamed Org';

                    // Bank counts
                    int bankCount = 0;
                    if (org[SupabaseTable.bank] != null) {
                      bankCount = (org[SupabaseTable.bank] as List).length;
                    }

                    return Card(
                      elevation: 0,
                      color: Colors.grey.withValues(alpha: 0.05),
                      margin: const EdgeInsets.only(bottom: 8),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 4,
                        ),
                        leading: CircleAvatar(
                          backgroundColor: Theme.of(
                            context,
                          ).colorScheme.primaryContainer,
                          child: Icon(
                            Icons.business,
                            color: Theme.of(
                              context,
                            ).colorScheme.onPrimaryContainer,
                            size: 20,
                          ),
                        ),
                        title: AppText(orgName, fontWeight: FontWeight.w600),
                        subtitle: AppText(
                          'Linked Banks: $bankCount',
                          fontSize: 12,
                          color: Colors.grey[700],
                        ),
                      ),
                    );
                  },
                ),

              const SizedBox(height: 32),

              // Action Button
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () {
                    Get.back(); // close dialog
                    goToChatScreen(user, shouldCloseBefore: false);
                  },
                  icon: const Icon(Icons.message, color: Colors.black),
                  label: const Text(
                    'Message User',
                    style: TextStyle(color: Colors.black),
                  ),
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    ),
  );
}

Widget _infoRow(String label, String value) {
  return Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 90,
          child: AppText(
            '$label:',
            fontWeight: FontWeight.w600,
            fontSize: 13,
            // color: Colors.grey[800],
          ),
        ),
        Expanded(
          child: AppText(
            value.isEmpty ? '-' : value,
            fontSize: 13,
            // color: Colors.black87,
          ),
        ),
      ],
    ),
  );
}
