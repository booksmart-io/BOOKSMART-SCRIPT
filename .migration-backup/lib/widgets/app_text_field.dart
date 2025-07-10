import '../constant/exports.dart';

class AppTextField extends StatelessWidget {
  final String? hintText;
  final String? labelText;
  final TextEditingController? controller;
  final void Function(String)? onChanged;
  final VoidCallback? onEditingComplete;
  final void Function(String)? onFieldSubmit;
  final TextInputAction? textInputAction;
  final bool isEnabled;
  final Widget? suffixWidget;
  final Widget? prefixWidget;
  final List<TextInputFormatter>? inputFormatters;
  final bool isSecureText;
  final TextInputType? keyboardType;
  final int? maxLines;
  final String? Function(String?)? fieldValidator;
  final TextCapitalization textCapitalization;
  final EdgeInsetsGeometry? padding;

  const AppTextField({
    super.key,
    this.hintText,
    this.labelText,
    this.controller,
    this.onChanged,
    this.onEditingComplete,
    this.onFieldSubmit,
    this.textInputAction,
    this.isEnabled = true,
    this.suffixWidget,
    this.prefixWidget,
    this.inputFormatters,
    this.isSecureText = false,
    this.keyboardType,
    this.maxLines,
    this.fieldValidator,
    this.textCapitalization = TextCapitalization.sentences,
    this.padding,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final textColor = theme.brightness == Brightness.dark
        ? Colors.white
        : Colors.black87;

    return Padding(
      padding: padding ?? const EdgeInsets.symmetric(vertical: 3),
      child: TextFormField(
        controller: controller,
        onChanged: onChanged,
        onEditingComplete: onEditingComplete,
        onFieldSubmitted: onFieldSubmit,
        textInputAction: textInputAction ?? TextInputAction.done,
        style: TextStyle(color: textColor, fontSize: 15),
        obscureText: isSecureText,
        inputFormatters: inputFormatters,
        validator: fieldValidator,
        maxLines: maxLines,
        keyboardType: keyboardType,
        enabled: isEnabled,
        textCapitalization: textCapitalization,
        decoration: InputDecoration(
          hintText: hintText,
          suffixIcon: suffixWidget,
          prefixIcon: prefixWidget,
          // labelText: hintText,

          // 🪄 All styling (borders, hintStyle, colors) comes from theme.inputDecorationTheme
        ),
      ),
    );
  }
}
