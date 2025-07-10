import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:get/get.dart';

class AppText extends StatelessWidget {
  final String text;
  final double? fontSize;
  final TextAlign textAlign;
  final FontWeight fontWeight;
  final Color? color;
  final String? fontFamily;
  final TextStyle? themeStyle;
  final int? maxLines;
  final TextOverflow? overflow;
  final bool isUnderline;
  final bool disableFormat; // ✅ Added to prevent auto-capitalization

  const AppText(
    this.text, {
    super.key,

    this.fontSize,
    this.textAlign = TextAlign.left,
    this.fontWeight = FontWeight.normal,
    this.color,
    this.fontFamily,
    this.themeStyle,
    this.maxLines,
    this.overflow,
    this.isUnderline = false,
    this.disableFormat = false, // ✅ Default: false
  });

  String _formatText(String input) {
    if (input.isEmpty) return input;
    final numeric = num.tryParse(input.replaceAll(",", ""));
    if (numeric != null) {
      final formatter = NumberFormat.decimalPattern();
      return formatter.format(numeric);
    }
    return input[0].toUpperCase() + input.substring(1);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Get.theme;
    final defaultStyle = themeStyle ?? theme.textTheme.bodyMedium!;

    // ✅ Auto adjust color based on theme brightness if no color given
    final adaptiveColor =
        color ??
        (theme.brightness == Brightness.dark ? Colors.white : Colors.black);

    final processedText = disableFormat ? text : _formatText(text);

    return Text(
      processedText,
      textAlign: textAlign,
      maxLines: maxLines,
      overflow: overflow,
      style: defaultStyle.copyWith(
        color: adaptiveColor,
        fontFamily: fontFamily ?? defaultStyle.fontFamily,
        fontWeight: fontWeight,
        fontSize: fontSize != null ? fontSize! : defaultStyle.fontSize,
        decoration: isUnderline ? TextDecoration.underline : null, // ✅ Added
      ),
    );
  }
}

class FittedText extends StatelessWidget {
  const FittedText(
    this.text, {
    super.key,
    this.style,
    this.boxFit = BoxFit.scaleDown,
    this.alignment = Alignment.centerLeft,
    this.emptyText,
    this.textAlign,
  });

  final String text;
  final String? emptyText;
  final TextStyle? style;
  final BoxFit boxFit;
  final AlignmentGeometry alignment;
  final TextAlign? textAlign;
  @override
  Widget build(BuildContext context) {
    return FittedBox(
      fit: boxFit,
      alignment: alignment,
      child: Text(
        text.isEmpty ? emptyText ?? 'no-value' : text,
        style: style,
        textAlign: textAlign,
      ),
    );
  }
}
