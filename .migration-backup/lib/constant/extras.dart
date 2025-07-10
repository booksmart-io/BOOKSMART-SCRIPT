import 'package:flutter/foundation.dart';
import 'package:get/get.dart';

bool get isIos => defaultTargetPlatform == TargetPlatform.iOS;

const double sidebarSwitchingStandardWidth = 1000;
double getSideBarWidth() {
  if (Get.width > sidebarSwitchingStandardWidth) {
    return 185;
  } else {
    return 50;
  }
}

bool isDevelopmentMode = !const bool.fromEnvironment('dart.vm.product');
