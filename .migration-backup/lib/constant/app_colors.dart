import 'package:flutter/material.dart';

const Color primaryColor = Color(0xff011026);
const Color scafoldBGColor = primaryColor;
const Color cardColor = Color.fromARGB(255, 12, 35, 70);
const Color textColor = Colors.black;
const Color buttonColor = Color(0xff2b7fff);
const Color navDisAbleColor = Color(0xff1A273B);
const Color navEnAbleColor = Color(0xff414C5C);
const Color orangeColor = Color(0xFFF5C542);
const Color greenColor = Color.fromARGB(255, 54, 139, 57);
const Color orangeBttonColor = Color(0xFFF5C542);

/// Centralized color definitions for both themes
class AppColorsDark {
  static const Color background = Color(0xff011026);
  static const Color surface = Color.fromARGB(255, 10, 35, 71);
  static const Color primary = Color(0xFFF5C542); // dark teal
  static const Color secondary = Color(0xFFF5C542);
  static const Color textPrimary = Colors.white;
  static const Color textSecondary = Colors.white70;
  static const Color divider = Colors.white24;
  static const Color success = Color(0xFF4CAF50);
  static const Color error = Color(0xFFE53935);
  static const Color warning = Color(0xFFFFC107);
}

class AppColorsLight {
  static const Color background = Color.fromARGB(
    220,
    242,
    243,
    247,
  ); // soft gray
  static const Color surface = Color(0xFFFFFFFF); // card white
  static const Color primary = Color(0xFFF5C542); // dark teal
  static const Color secondary = Color(0xFFF5C542); // orange accent
  static const Color textPrimary = Color(0xFF1A1A1A); // dark gray text
  static const Color textSecondary = Color(0xFF555555);
  static const Color divider = Color(0xFFDDDDDD);
  static const Color success = Color(0xFF4CAF50);
  static const Color error = Color(0xFFE53935);
  static const Color warning = Color(0xFFFFC107);
}
