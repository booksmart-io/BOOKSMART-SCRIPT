import '../constant/exports.dart';

class AppButton extends StatelessWidget {
  final String buttonText;
  final void Function()? onTapFunction;
  final bool isLoading;
  final Color? textColor;
  final Color? buttonColor;
  final double? radius;
  final double? fontSize;
  final Color? loaderColor;
  final Widget? iconWidget;
  final bool isRight;
  final EdgeInsetsGeometry? padding;

  const AppButton({
    super.key,
    required this.buttonText,
    this.onTapFunction,
    this.isLoading = false,
    this.textColor,
    this.buttonColor,
    this.radius,
    this.fontSize,
    this.loaderColor,
    this.iconWidget,
    this.isRight = false,
    this.padding = const EdgeInsets.symmetric(vertical: 2, horizontal: 6),
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return ElevatedButton(
      style: ElevatedButton.styleFrom(
        backgroundColor: buttonColor ?? scheme.secondary,
        foregroundColor: textColor ?? scheme.onSecondary,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radius ?? 8.0),
        ),
        padding: padding,
        elevation: 2,
      ),
      onPressed: isLoading ? null : onTapFunction,
      child: Center(
        child: isLoading
            ? CircularProgressIndicator(color: loaderColor ?? scheme.onPrimary)
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: iconWidget != null
                    ? isRight
                          ? [
                              Expanded(
                                child: Text(
                                  buttonText,
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    color: textColor ?? Colors.black,
                                    fontSize: fontSize ?? 14,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                              iconWidget!,
                            ]
                          : [
                              iconWidget!,
                              Expanded(
                                child: Text(
                                  buttonText,
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    color: textColor ?? Colors.black,
                                    fontSize: fontSize ?? 14,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ]
                    : [
                        Text(
                          buttonText,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: textColor ?? Colors.black,
                            fontSize: fontSize ?? 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
              ),
      ),
    );
  }
}

Widget outlineButton(
  String text, {
  required VoidCallback onPressed,
  EdgeInsetsGeometry? padding = const EdgeInsets.symmetric(
    horizontal: 20,
    vertical: 10,
  ),
}) {
  return InkWell(
    onTap: onPressed,
    borderRadius: BorderRadius.circular(12),
    child: Container(
      padding: padding,
      decoration: BoxDecoration(
        border: Border.all(color: orangeColor, width: 1.2),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Center(
        child: FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(
            text.toUpperCase(),
            style: TextStyle(
              color: orangeColor,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    ),
  );
}
