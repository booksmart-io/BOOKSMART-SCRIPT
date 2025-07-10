import 'package:flutter/material.dart';
import 'package:get/get.dart';

class SideBarIcon extends StatefulWidget {
  const SideBarIcon({
    super.key,
    required this.icon,
    required this.infoMessage,
    required this.routeName,
    this.isShowName = true,
    this.onTap,
  });

  final IconData icon;
  final String infoMessage;
  final String routeName;
  final bool isShowName;
  final void Function()? onTap;

  @override
  State<SideBarIcon> createState() => _SideBarIconState();
}

class _SideBarIconState extends State<SideBarIcon> {
  bool isHover = false;
  late bool isSelected;

  @override
  void initState() {
    super.initState();
    isSelected = Get.currentRoute == widget.routeName;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;

    final iconColor = isHover || isSelected
        ? colorScheme.primary
        : (isDark ? Colors.white70 : Colors.black54);

    final textColor = isHover || isSelected
        ? colorScheme.primary
        : (isDark ? Colors.white : Colors.black87);

    final bgColor = isSelected
        ? (isDark
              ? Colors.white.withValues(alpha: 0.1)
              : colorScheme.primary.withValues(alpha: 0.08))
        : Colors.transparent;

    return Material(
      color: bgColor,
      child: Tooltip(
        message: widget.isShowName ? '' : widget.infoMessage,
        waitDuration: const Duration(milliseconds: 400),
        decoration: BoxDecoration(
          color: Colors.black87,
          borderRadius: BorderRadius.circular(6),
        ),
        textStyle: const TextStyle(color: Colors.white),
        child: InkWell(
          onTap:
              widget.onTap ??
              () {
                if (Get.currentRoute != widget.routeName) {
                  Get.toNamed(widget.routeName);
                }
              },
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
            child: MouseRegion(
              cursor: SystemMouseCursors.click,
              onEnter: (_) => setState(() => isHover = true),
              onExit: (_) => setState(() => isHover = false),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(widget.icon, color: iconColor, size: 22),
                  if (widget.isShowName) ...[
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        widget.infoMessage,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: isSelected
                              ? FontWeight.bold
                              : FontWeight.normal,
                          color: textColor,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
