import 'package:flutter/material.dart';
import '../../../../../widgets/app_text.dart';

class MissionsList extends StatelessWidget {
  const MissionsList({super.key});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: Container(
        padding: const EdgeInsets.all(15),
        height: 315,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (MediaQuery.sizeOf(context).width > 800) ...{
              const AppText(
                'Today\'s Missions',
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
              const SizedBox(height: 15),
            },
            Column(
              spacing: 15,
              children: [
                _buildMissionItem(
                  icon: Icons.folder,
                  iconColor: Colors.green,
                  title: 'Categorize 5 uncategorized...',
                  xp: '+550 XP',
                ),
                _buildMissionItem(
                  icon: Icons.local_fire_department,
                  iconColor: Colors.orange,
                  title: 'Pay down credit card balance',
                  xp: '+120 XP',
                ),
                _buildMissionItem(
                  icon: Icons.file_upload,
                  iconColor: Colors.blue,
                  title: 'Upload receipts for deductions',
                  xp: '+75 XP',
                ),
                _buildMissionItem(
                  icon: Icons.description,
                  iconColor: Colors.purple,
                  title: 'Review tax strategy suggestion',
                  xp: '+90 XP',
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMissionItem({
    required IconData icon,
    required Color iconColor,
    required String title,
    required String xp,
  }) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(5),
            decoration: BoxDecoration(
              color: iconColor.withValues(alpha: 0.2),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: iconColor, size: 20),
          ),

          const SizedBox(width: 12),
          Expanded(
            child: AppText(
              title,
              fontSize: 14,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          AppText(
            xp,
            fontSize: 12,
            color: Colors.green,
            fontWeight: FontWeight.bold,
          ),
        ],
      ),
    );
  }
}
