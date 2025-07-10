import 'dart:developer';

import 'package:flutter/material.dart';
import 'package:get/get.dart';

showLoading({Color spinnerColor = Colors.black}) {
  Get.dialog(
    PopScope(
      canPop: false,
      child: Center(
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onLongPress: () {
              Get.back();
            },
            child: CircularProgressIndicator.adaptive(
              valueColor: AlwaysStoppedAnimation<Color>(spinnerColor),
            ),
          ),
        ),
      ),
    ),
    barrierDismissible: false,
    transitionCurve: Curves.bounceOut,
  );
}

void dismissLoadingWidget() {
  if (Get.isDialogOpen ?? false) {
    log("Is dialog open -> true");
    Get.back();
  }
}
