import 'package:get/get.dart';
import '../../../../constant/exports.dart';
import '../../../../models/user_base_model.dart';
import '../../../../routes/pages.dart';
import '../../providers/auth_provider.dart';
import 'login_screen.dart';

class SignupScreen extends StatefulWidget {
  const SignupScreen({super.key});

  @override
  State<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends State<SignupScreen> {
  final _formKey = GlobalKey<FormState>();

  final _emailController = TextEditingController(
    text: isDevelopmentMode ? "shahzadqaisarkhan@gmail.com" : null,
  );
  final _passwordController = TextEditingController(
    text: isDevelopmentMode ? "Sp17bcs052@" : null,
  );
  final _confirmPasswordController = TextEditingController(
    text: isDevelopmentMode ? "Sp17bcs052@" : null,
  );

  bool _obscurePassword = true;
  bool _obscureConfirmPassword = true;
  bool isCPA = false;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

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
            final double maxWidth = isMobile ? double.infinity : 480;

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
                          "Create Account",
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                        0.01.verticalSpace,
                        AppText(
                          "Sign up to get started with BookSmart",
                          fontSize: 14,
                        ),
                        0.05.verticalSpace,
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
                        AppTextField(
                          controller: _passwordController,
                          hintText: "Password",
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
                        0.02.verticalSpace,

                        StatefulBuilder(
                          builder: (context, cpaState) {
                            return SwitchListTile.adaptive(
                              value: isCPA,
                              title: const Text("Sign up as CPA"),
                              visualDensity: VisualDensity.compact,
                              dense: true,
                              onChanged: (value) {
                                cpaState(() {
                                  isCPA = value;
                                });
                              },
                            );
                          },
                        ),
                        0.04.verticalSpace,

                        /// 🔹 Sign Up Button
                        AppButton(
                          buttonText: "Sign Up",
                          fontSize: 16,
                          radius: 10,
                          onTapFunction: () async {
                            if (_formKey.currentState!.validate()) {
                              await signUpWithEmailPassword(
                                email: _emailController.text.trim(),
                                password: _passwordController.text,
                                role: isCPA ? UserRole.cpa : UserRole.user,
                              );
                            }
                          },
                        ),
                        0.06.verticalSpace,

                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            AppText("Already have an account?", fontSize: 14),
                            TextButton(
                              onPressed: () =>
                                  Get.to(() => const LoginScreen()),
                              child: AppText(
                                "Sign In",
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
