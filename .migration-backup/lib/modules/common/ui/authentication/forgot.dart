import 'package:booksmart/widgets/snackbar.dart';
import 'package:get/get.dart';
import '../../../../constant/exports.dart';

class ForgotResetPasswordScreen extends StatefulWidget {
  final bool isReset; // true = Reset, false = Forgot

  const ForgotResetPasswordScreen({super.key, required this.isReset});

  @override
  State<ForgotResetPasswordScreen> createState() =>
      _ForgotResetPasswordScreenState();
}

class _ForgotResetPasswordScreenState extends State<ForgotResetPasswordScreen> {
  final _formKey = GlobalKey<FormState>();

  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();

  bool _obscurePassword = true;
  bool _obscureConfirmPassword = true;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final textTheme = theme.textTheme;
    final isReset = widget.isReset;

    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final isMobile = constraints.maxWidth < 600;
            final isTablet =
                constraints.maxWidth >= 600 && constraints.maxWidth < 1024;

            final double padding = isMobile
                ? 16
                : isTablet
                ? 32
                : 64;
            final double maxWidth = isMobile ? double.infinity : 500;

            return SingleChildScrollView(
              padding: EdgeInsets.symmetric(horizontal: padding, vertical: 32),
              child: Center(
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    maxWidth: maxWidth,
                    minHeight:
                        constraints.maxHeight - 64, // Subtract vertical padding
                  ),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        0.05.verticalSpace,

                        /// 🔹 Title
                        AppText(
                          isReset ? "Reset Password" : "Forgot Password",
                          themeStyle: textTheme.displaySmall,
                          textAlign: TextAlign.center,
                        ),
                        0.01.verticalSpace,

                        /// 🔹 Subtitle
                        AppText(
                          isReset
                              ? "Enter your new password below"
                              : "Enter your email and we'll send you reset instructions",
                          themeStyle: theme.textTheme.bodyMedium,
                        ),
                        0.08.verticalSpace,

                        /// 🔹 Forgot Password → Email Field
                        if (!isReset)
                          AppTextField(
                            controller: _emailController,
                            hintText: "Email",
                            keyboardType: TextInputType.emailAddress,
                            maxLines: 1,

                            fieldValidator: (v) {
                              if (v == null || v.isEmpty) {
                                return "Enter your email";
                              }
                              if (!v.contains("@")) {
                                return "Enter a valid email";
                              }
                              return null;
                            },
                          ),

                        /// 🔹 Reset Password → New & Confirm
                        if (isReset) ...[
                          AppTextField(
                            controller: _passwordController,
                            hintText: "New Password",
                            keyboardType: TextInputType.text,
                            isSecureText: _obscurePassword,
                            maxLines: 1,

                            suffixWidget: IconButton(
                              icon: Icon(
                                _obscurePassword
                                    ? Icons.visibility_off_outlined
                                    : Icons.visibility_outlined,
                                color: theme.iconTheme.color?.withValues(
                                  alpha: 0.7,
                                ),
                              ),
                              onPressed: () => setState(
                                () => _obscurePassword = !_obscurePassword,
                              ),
                            ),
                            fieldValidator: (v) {
                              if (v == null || v.isEmpty) {
                                return "Enter your password";
                              }
                              if (v.length < 6) {
                                return "Password must be at least 6 characters";
                              }
                              return null;
                            },
                          ),
                          0.02.verticalSpace,
                          AppTextField(
                            controller: _confirmPasswordController,
                            hintText: "Confirm Password",
                            keyboardType: TextInputType.text,
                            isSecureText: _obscureConfirmPassword,
                            maxLines: 1,

                            suffixWidget: IconButton(
                              icon: Icon(
                                _obscureConfirmPassword
                                    ? Icons.visibility_off_outlined
                                    : Icons.visibility_outlined,
                                color: theme.iconTheme.color?.withValues(
                                  alpha: 0.7,
                                ),
                              ),
                              onPressed: () => setState(
                                () => _obscureConfirmPassword =
                                    !_obscureConfirmPassword,
                              ),
                            ),
                            fieldValidator: (v) {
                              if (v == null || v.isEmpty) {
                                return "Confirm your password";
                              }
                              if (v != _passwordController.text) {
                                return "Passwords do not match";
                              }
                              return null;
                            },
                          ),
                        ],
                        0.04.verticalSpace,

                        /// 🔹 Submit Button
                        AppButton(
                          fontSize: 16,
                          buttonText: isReset
                              ? "Reset Password"
                              : "Send Reset Link",
                          radius: 10,
                          onTapFunction: () {
                            if (_formKey.currentState?.validate() ?? false) {
                              if (isReset) {
                                showSnackBar(
                                  "Password has been reset!",
                                  title: "Success",
                                );

                                Get.offAllNamed(Routes.login);
                              } else {
                                Get.snackbar(
                                  "Email Sent",
                                  "Check your inbox to reset password.",
                                  snackPosition: SnackPosition.BOTTOM,
                                );
                                Get.back();
                              }
                            }
                          },
                        ),
                        0.06.verticalSpace,

                        /// 🔹 Back to Login
                        TextButton(
                          onPressed: () => Get.offAllNamed(Routes.login),
                          child: AppText(
                            "Back to Login",
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
