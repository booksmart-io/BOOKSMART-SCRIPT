import 'package:flutter/material.dart';
import 'package:get/get.dart';

showSnackBar(
  String message, {
  String? title,
  bool isError = false,
  int seconds = 3,
  Color? begroundColor,
}) {
  Get.showSnackbar(
    GetSnackBar(
      title: title,
      messageText: Text(
        message,
        textAlign: title == null ? TextAlign.center : TextAlign.left,
        maxLines: 10,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 16,
          fontWeight: FontWeight.w500,
        ),
      ),
      backgroundColor: isError ? Colors.red : begroundColor ?? Colors.green,
      padding: const EdgeInsets.all(10),
      duration: Duration(seconds: seconds),
    ),
  );
}

void somethingWentWrongSnackbar() {
  showSnackBar("Something went wrong", isError: true);
}
