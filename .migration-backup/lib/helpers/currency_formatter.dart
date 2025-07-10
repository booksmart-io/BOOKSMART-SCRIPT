import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

class CurrencyUtils {
  static final NumberFormat _formatter = NumberFormat('#,##0.##', 'en_US');

  /// Format double → $1,234.56
  /// If 0 → just "$"
  static String format(num amount) {
    if (amount == 0) return '\$';
    return '\$${_formatter.format(amount)}';
  }

  /// Parse $1,234.56 → 1234.56
  static double parse(String text) {
    if (text.isEmpty || text == '\$') return 0.0;

    final cleaned = text.replaceAll('\$', '').replaceAll(',', '').trim();
    return double.tryParse(cleaned) ?? 0.0;
  }

  /// Format integer part with commas
  static String formatInteger(String value) {
    return NumberFormat(
      '#,###',
      'en_US',
    ).format(int.parse(value.isEmpty ? '0' : value));
  }
}

class CurrencyTextInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    String text = newValue.text;

    /// Allow empty
    if (text.isEmpty) return newValue;

    /// Keep digits + decimal only
    text = text.replaceAll(RegExp(r'[^\d.]'), '');

    /// Prevent multiple decimals
    if ('.'.allMatches(text).length > 1) {
      return oldValue;
    }

    /// Split parts
    final parts = text.split('.');
    String integerPart = parts[0];
    String decimalPart = parts.length > 1 ? parts[1] : '';

    /// Limit decimals
    if (decimalPart.length > 2) {
      decimalPart = decimalPart.substring(0, 2);
    }

    /// Format integer using shared utility
    final formattedInteger = CurrencyUtils.formatInteger(integerPart);

    /// Build result
    String result = '\$$formattedInteger';

    if (parts.length > 1) {
      result += '.$decimalPart';
    }

    /// Cursor at end (simple + stable)
    return TextEditingValue(
      text: result,
      selection: TextSelection.collapsed(offset: result.length),
    );
  }
}
