import 'dart:developer';

import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/models/user_base_model.dart';
import 'package:booksmart/modules/common/providers/auth_provider.dart';
import 'package:booksmart/widgets/loading.dart';
import 'package:booksmart/widgets/snackbar.dart';
import 'package:get/get.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../../utils/supabase.dart';

class VerifyEmailScreen extends StatefulWidget {
  const VerifyEmailScreen({super.key});

  @override
  State<VerifyEmailScreen> createState() => _VerifyEmailScreenState();
}

class _VerifyEmailScreenState extends State<VerifyEmailScreen> {
  bool _isLoading = false;

  String? get email => supabase.auth.currentUser?.email;

  Future<void> resendEmail() async {
    setState(() => _isLoading = true);
    try {
      showLoading();
      await supabase.auth
          .resend(email: email, type: OtpType.signup)
          .then((ResendResponse response) {
            dismissLoadingWidget();
            showSnackBar("A new confirmation email has been sent to $email");
          })
          .onError((error, stackTrace) {
            dismissLoadingWidget();
            log(error.toString());
            log(stackTrace.toString());
          });
    } catch (e) {
      dismissLoadingWidget();
      showSnackBar(e.toString());
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> checkConfirmation() async {
    setState(() => _isLoading = true);
    try {
      await supabase.auth.refreshSession(); // refresh session
      final user = supabase.auth.currentUser;

      if (user?.emailConfirmedAt != null) {
        UserRole? role = getUserRoleFromSession;
        if (role == UserRole.user) {
          Get.offAllNamed(Routes.userProfile);
        } else if (role == UserRole.cpa) {
          Get.offAllNamed(Routes.cpaProfile);
        } else {
          Get.offAllNamed(Routes.login);
          somethingWentWrongSnackbar();
        }
        showSnackBar("Your email has been verified!");
      } else {
        showSnackBar(
          "Your email is still not verified. Please check your inbox.",
        );
      }
    } catch (e) {
      Get.snackbar("Error", e.toString(), snackPosition: SnackPosition.BOTTOM);
    } finally {
      setState(() => _isLoading = false);
    }
  }

  @override
  void initState() {
    super.initState();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!isUserLoggedIn || email == null) {
        Get.offAllNamed(Routes.login);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Verify Email")),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              AppText(
                "A confirmation link has been sent to: $email",
                fontSize: 16,
                textAlign: TextAlign.center,
              ),

              SizedBox(height: 10),

              AppButton(
                buttonText: _isLoading ? "Sending..." : "Resend Email",
                onTapFunction: _isLoading ? null : resendEmail,
              ),
              SizedBox(height: 10),
              AppButton(
                buttonText: _isLoading ? "Checking..." : "I have confirmed",
                onTapFunction: _isLoading ? null : checkConfirmation,
              ),
              SizedBox(height: 10),
              AppText(
                "Please check your inbox and spam folder if you don't see the email.",
                fontSize: 14,
                textAlign: TextAlign.center,
                color: Colors.grey,
              ),
              SizedBox(height: 10),
              AppButton(
                buttonText: "Logout",
                onTapFunction: () {
                  logOut();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
