import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'web_sidebar.dart';

class WebTemplateCPA extends StatefulWidget {
  const WebTemplateCPA({
    super.key,
    required this.child,
    this.floatingActionButton,
  });
  final Widget child;
  final Widget? floatingActionButton;

  @override
  State<WebTemplateCPA> createState() => _WebTemplateCPAState();
}

class _WebTemplateCPAState extends State<WebTemplateCPA> {
  @override
  Widget build(BuildContext context) {
    return Material(
      child: SizedBox(
        height: Get.width,
        width: Get.height,
        child: Row(
          children: [
            WebSideBarCPA(),
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
