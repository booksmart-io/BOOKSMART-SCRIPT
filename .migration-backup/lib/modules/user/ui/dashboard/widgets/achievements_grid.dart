import 'package:flutter/material.dart';
import '../../../../../widgets/app_text.dart';

class AchievementsGrid extends StatelessWidget {
  const AchievementsGrid({super.key});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: Container(
        padding: const EdgeInsets.all(15),
        height: 300,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (MediaQuery.sizeOf(context).width > 800) ...{
              const AppText(
                'Achievements Unlocked',
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
              const SizedBox(height: 15),
            },
            Column(
              spacing: 15,
              children: [
                _buildAchievementItem(
                  icon: Icons.monetization_on,
                  iconColor: Colors.amber,
                  title: 'First \$10K Month',
                  // xp: '30. At Least Mong', // Dummy text from image
                ),
                _buildAchievementItem(
                  icon: Icons.local_fire_department,
                  iconColor: Colors.orange,
                  title: '30-Day Profit Streak',
                  //   xp: '32. 0u XP', // Dummy text from image
                ),
                _buildAchievementItem(
                  icon: Icons.shield,
                  iconColor: Colors.blueAccent,
                  title: 'Debt Slayer',
                  // xp: '20. At Least 100 XP', // Dummy text from image
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAchievementItem({
    required IconData icon,
    required Color iconColor,
    required String title,
    // required String xp,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(12),
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
          const SizedBox(width: 15),
          // Text content
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                AppText(
                  title,
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  overflow: TextOverflow.ellipsis,
                ),
                // const SizedBox(height: 4),
                // AppText(xp, fontSize: 12, color: Colors.grey[400]),
              ],
            ),
          ),
          // Trailing placeholder badge as in UI
          Container(
            width: 100,
            height: 40,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8),
              gradient: LinearGradient(
                colors: [
                  Colors.white.withValues(alpha: 0.1),
                  iconColor.withValues(alpha: 0.2),
                ],
              ),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Stack(
                children: [
                  Positioned(
                    right: -10,
                    top: -10,
                    child: Icon(
                      icon,
                      color: iconColor.withValues(alpha: 0.1),
                      size: 50,
                    ),
                  ),
                  const Center(
                    child: AppText(
                      'UNLOCKED',
                      fontSize: 8,
                      fontWeight: FontWeight.bold,
                      color: Colors.white70,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
