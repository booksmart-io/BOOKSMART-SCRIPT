import 'package:flutter/material.dart';
import 'package:get/get.dart';

Future<T?> customDialog<T>({
  required String title,
  required Widget child,
  bool barrierDismissible = true,
  double? maxWidth = 600,
  double? maxHeight,
  EdgeInsetsGeometry titleRowPadding = const EdgeInsets.symmetric(
    horizontal: 10,
    vertical: 10,
  ),
  List<Widget> actionWidgetList = const [],
}) {
  double borderRadiuss = 20;
  return Get.generalDialog<T>(
    pageBuilder: (context, animation, secondaryAnimation) {
      return Align(
        alignment: Alignment.center,
        child: Container(
          constraints: BoxConstraints(
            maxWidth: maxWidth ?? double.infinity,
            maxHeight: maxHeight ?? double.infinity,
          ),
          margin: const EdgeInsets.all(30),
          decoration: BoxDecoration(
            color: Theme.of(context).scaffoldBackgroundColor,
            borderRadius: BorderRadius.circular(borderRadiuss),
            border: Border.all(color: Colors.grey.shade300, width: 1),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(borderRadiuss),
            child: Material(
              color: Colors.transparent,
              borderRadius: BorderRadius.circular(borderRadiuss),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Padding(
                    padding: titleRowPadding,
                    child: Row(
                      spacing: 3,
                      children: [
                        Expanded(
                          child: Text(
                            title,
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                            ),
                          ),
                        ),
                        ...actionWidgetList,
                        IconButton(
                          onPressed: () {
                            Get.back();
                          },
                          icon: const Icon(Icons.cancel_outlined),
                        ),
                      ],
                    ),
                  ),
                  Flexible(child: child),
                ],
              ),
            ),
          ),
        ),
      );
    },
    barrierDismissible: barrierDismissible,
    barrierLabel: "$title-${child.hashCode}",
  ).then((value) {
    return value;
  });
}
