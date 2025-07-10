import 'package:flutter/material.dart';
import '../../../../../widgets/app_text.dart';

class StatsHeader extends StatelessWidget {
  const StatsHeader({super.key});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        _buildStatItem(
          icon: Icons.local_fire_department,
          iconColor: Colors.orange,
          label: 'Streak: 4 days',
        ),
        const SizedBox(width: 16),
        _buildStatItem(
          icon: Icons.star_border,
          iconColor: Colors.green,
          label: '340 XP',
        ),
      ],
    );
  }

  Widget _buildStatItem({
    required IconData icon,
    required Color iconColor,
    required String label,
  }) {
    return Row(
      children: [
        Icon(icon, color: iconColor, size: 22),
        const SizedBox(width: 4),
        AppText(label, fontSize: 14, fontWeight: FontWeight.w600),
      ],
    );
  }
}
