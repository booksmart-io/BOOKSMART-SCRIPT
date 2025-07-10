import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

extension ContextExtensions on BuildContext {
  // Get the height of the screen
  double get screenHeight => MediaQuery.of(this).size.height;

  // Get the width of the screen
  double get screenWidth => MediaQuery.of(this).size.width;
}

extension SpacingExtensions on num {
  Widget get verticalSpace => Builder(
        builder: (context) {
          final h = MediaQuery.of(context).size.height;
          return SizedBox(
            height: h * this,
          );
        },
      );

  Widget get horizontalSpace => Builder(
        builder: (context) {
          final w = MediaQuery.of(context).size.width;
          return SizedBox(
            width: w * this,
          );
        },
      );
}

extension StringExtensions on String {
  // Extension to get a substring up to a specified length
  String getSubString(int len) {
    if (length < len) {
      return this;
    } else {
      return substring(0, len);
    }
  }

  // Extension to capitalize the first letter of a string
  String capitalizeFirstLetter() {
    if (isEmpty) {
      return this;
    }
    return this[0].toUpperCase() + substring(1);
  }
}

extension DateTimeExtensions on DateTime {
  // Extension to format DateTime as a readable string
  String format([String pattern = 'yyyy-MM-dd']) {
    return DateFormat(pattern).format(this);
  }

  // Extension to get the time ago in words (e.g., "2 hours ago")
  String timeAgo() {
    final now = DateTime.now();
    final difference = now.difference(this);

    if (difference.inDays > 0) {
      return '${difference.inDays} day${difference.inDays > 1 ? 's' : ''} ago';
    } else if (difference.inHours > 0) {
      return '${difference.inHours} hour${difference.inHours > 1 ? 's' : ''} ago';
    } else if (difference.inMinutes > 0) {
      return '${difference.inMinutes} minute${difference.inMinutes > 1 ? 's' : ''} ago';
    } else {
      return 'just now';
    }
  }
}




///      ---------------   How to use

// height: context.screenHeight * 0.5,  // 50% of the screen height
// width: context.screenWidth * 0.8,    // 80% of the screen width

    // Text('First Text'),
    // 0.05.verticalSpace,  // 5% of the screen height as space
    // Text('Second Text'),
    // 0.1.horizontalSpace, // 10% of the screen width as space


  // String text = "Hello, Flutter!";
  // print(text.getSubString(5)); // Output: Hello
  // print(text.capitalizeFirstLetter()); // Output: Hello, Flutter!

  // DateTime now = DateTime.now();
  // print(now.format()); // Output: Current date in 'yyyy-MM-dd HH:mm:ss' format
  // print(now.timeAgo()); // Output: just now

