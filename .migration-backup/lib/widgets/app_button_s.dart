import '../constant/exports.dart';

class AppButton2 extends StatelessWidget {
  final String buttonText;
  final void Function() onTapFunction;
  final bool isLoading;
  final Color? textColor;
  final Color? buttonColorr;
  final double? radius;
  final double? fontSize;
  final double? width;
  final double? height;

  const AppButton2({
    super.key,
    required this.buttonText,
    required this.onTapFunction,
    this.isLoading = false,
    this.textColor,
    this.buttonColorr,
    this.radius,
    this.fontSize,
    this.width,
    this.height,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: isLoading ? null : onTapFunction,
      borderRadius: BorderRadius.circular(radius ?? 25.0),
      child: Container(
        width: width ?? MediaQuery.of(context).size.width,
        height: height ?? 50,
        decoration: BoxDecoration(
          color: buttonColorr ?? buttonColor,
          borderRadius: BorderRadius.circular(radius ?? 25.0),
        ),
        child: Center(
          child: isLoading
              ? const CircularProgressIndicator(
                  valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                )
              : AppText(
                  buttonText,
                  fontSize: fontSize ?? 14,
                  fontWeight: FontWeight.w500,
                  color: textColor ?? Colors.white,
                  textAlign: TextAlign.center,
                ),
        ),
      ),
    );
  }
}
