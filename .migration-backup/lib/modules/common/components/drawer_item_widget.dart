import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../widgets/app_text.dart';

class DrawerItemWidget extends StatelessWidget {
  const DrawerItemWidget({
    super.key,
    required this.title,
    required this.onTap,
    this.trallingIcon,
  });
  final String title;
  final VoidCallback onTap;
  final IconData? trallingIcon;

  @override
  Widget build(BuildContext context) {
    ColorScheme colorScheme = Get.theme.colorScheme;
    return Material(
      shape: UnderlineInputBorder(
        borderSide: BorderSide(width: 0.1, color: colorScheme.onSurface),
      ),
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
          child: Row(
            children: [
              AppText(title, fontSize: 15, color: colorScheme.onSurface),
              const Spacer(),
              Icon(
                trallingIcon ?? Icons.chevron_right,
                color: colorScheme.onSurface.withValues(alpha: 0.7),
                size: 21,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
