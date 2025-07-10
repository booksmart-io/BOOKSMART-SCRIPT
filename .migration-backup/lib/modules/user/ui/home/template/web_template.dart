import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'web_sidebar.dart';

class WebTemplate extends StatefulWidget {
  const WebTemplate({
    super.key,
    required this.child,
    this.floatingActionButton,
  });
  final Widget child;
  final Widget? floatingActionButton;

  @override
  State<WebTemplate> createState() => _WebTemplateState();
}

class _WebTemplateState extends State<WebTemplate> {
  @override
  Widget build(BuildContext context) {
    return Material(
      child: SizedBox(
        height: Get.width,
        width: Get.height,
        child: Row(
          children: [
            WebSideBar(),
            Flexible(
              child: Scaffold(
                backgroundColor: Colors.white,
                body: widget.child,
                floatingActionButton: widget.floatingActionButton,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
