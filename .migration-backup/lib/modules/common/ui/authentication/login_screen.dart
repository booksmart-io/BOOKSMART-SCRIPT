import 'package:booksmart/modules/common/providers/auth_provider.dart';
import 'package:booksmart/routes/pages.dart';
import 'package:flutter/foundation.dart';
import 'package:sign_in_button/sign_in_button.dart';
import 'package:get/get.dart';
import '../../../../constant/exports.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final TextEditingController _emailController = TextEditingController(
    text: isDevelopmentMode ? "shahzadqaisarkhan@gmail.com" : null,
  );
  final TextEditingController _passwordController = TextEditingController(
    text: isDevelopmentMode ? "Sp17bcs052@" : null,
  );
  bool _obscurePassword = true;

  @override
  void initState() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (isUserLoggedIn) {
        Get.offAndToNamed(getHomeScreenRoute());
      }
    });
    super.initState();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            // Responsive breakpoints
            bool isMobile = constraints.maxWidth < 600;
            bool isTablet =
                constraints.maxWidth >= 600 && constraints.maxWidth < 1024;
            double padding = isMobile
                ? 16
                : isTablet
                ? 32
                : 64;
            double maxWidth = isMobile ? double.infinity : 500;

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

                        // Welcome Text
                        AppText(
                          "Welcome to BookSmart",
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                        0.01.verticalSpace,
                        AppText(
                          "Login with your email and password to continue",
                          fontSize: 14,
                        ),
                        0.08.verticalSpace,
                        // Email Field
                        AppTextField(
                          controller: _emailController,
                          hintText: "Email",
                          keyboardType: TextInputType.emailAddress,
                          maxLines: 1,
                          fieldValidator: (v) {
                            if (v == null || v.isEmpty) {
                              return "Enter your email";
                            }
                            if (!v.contains("@")) return "Enter a valid email";
                            return null;
                          },
                        ),
                        0.02.verticalSpace,

                        // Password Field
                        AppTextField(
                          controller: _passwordController,
                          hintText: "Password",
                          keyboardType: TextInputType.text,
                          isSecureText: _obscurePassword,
                          maxLines: 1,

                          suffixWidget: IconButton(
                            icon: Icon(
                              _obscurePassword
                                  ? Icons.visibility_off
                                  : Icons.visibility,
                              color: scheme.onSurface.withValues(alpha: 0.6),
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

                        // Forgot Password Link
                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton(
                            onPressed: () {
                              Get.toNamed(Routes.forgotReset);
                            },
                            child: AppText(
                              "Forgot Password?",
                              fontSize: 14,

                              // fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                        0.02.verticalSpace,

                        // Login Button
                        AppButton(
                          fontSize: 16,
                          buttonText: "Sign In",
                          radius: 8,
                          onTapFunction: () async {
                            if (_formKey.currentState!.validate()) {
                              await signinWithEmailPassword(
                                email: _emailController.text,
                                password: _passwordController.text,
                              );
                            }
                          },
                        ),
                        0.06.verticalSpace,

                        Row(
                          children: [
                            Expanded(
                              child: Divider(color: scheme.outlineVariant),
                            ),
                            Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                              ),
                              child: Text(
                                "or continue with",
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  color: scheme.onSurface.withValues(
                                    alpha: 0.7,
                                  ),
                                ),
                              ),
                            ),
                            Expanded(
                              child: Divider(color: scheme.outlineVariant),
                            ),
                          ],
                        ),
                        0.04.verticalSpace,

                        // Social Login Buttons
                        SignInButton(
                          Buttons.google,
                          text: "Sign in with Google",
                          textStyle: TextStyle(color: Colors.black),
                          onPressed: () {
                            Get.offAllNamed(Routes.userHome);
                          },
                        ),
                        SizedBox(height: 10),
                        SignInButton(
                          Buttons.apple,
                          textStyle: TextStyle(color: Colors.black),
                          padding: kIsWeb
                              ? EdgeInsets.symmetric(vertical: 15)
                              : EdgeInsets.zero,
                          text: "Sign in with Apple",
                          onPressed: () {
                            Get.offAllNamed(Routes.userHome);
                          },
                        ),
                        0.01.verticalSpace,

                        // Signup Redirect
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              "Don't have an account?",
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: scheme.onSurface.withValues(alpha: 0.8),
                              ),
                            ),
                            TextButton(
                              onPressed: () => Get.toNamed(Routes.signUp),
                              child: AppText(
                                "Sign Up",
                                fontSize: 14,
                                color: scheme.primary,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
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
