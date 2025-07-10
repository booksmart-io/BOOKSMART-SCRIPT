import 'package:intl/intl.dart';

/// Formats a [value] as a US dollar currency string.
/// Produces output like: $1,234.56 or ($1,234.56)
String fmtCurrency(double value, {int decimals = 2}) {
  final fmt = NumberFormat('#,##0${decimals > 0 ? '.${'0' * decimals}' : ''}', 'en_US');
  if (value < 0) {
    return '(\$${fmt.format(value.abs())})';
  }
  return '\$${fmt.format(value)}';
}

/// Compact format for chart axis labels: $1K, $1.5M, ($4K)
String fmtCompact(double value) {
  final absVal = value.abs();
  String formatted;
  if (absVal >= 1000000) {
    final m = absVal / 1000000;
    formatted = '\$${m.truncateToDouble() == m ? m.toStringAsFixed(0) : m.toStringAsFixed(1)}M';
  } else if (absVal >= 1000) {
    final k = absVal / 1000;
    formatted = '\$${k.truncateToDouble() == k ? k.toStringAsFixed(0) : k.toStringAsFixed(1)}K';
  } else {
    formatted = '\$${absVal.toStringAsFixed(0)}';
  }
  return value < 0 ? '($formatted)' : formatted;
}
