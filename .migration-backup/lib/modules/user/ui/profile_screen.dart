import 'dart:developer';

import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/modules/common/controllers/auth_controller.dart';
import 'package:booksmart/modules/common/providers/user_profile_provider.dart';
import 'package:booksmart/services/storage_service.dart';
import 'package:booksmart/supabase/buckets.dart';
import 'package:booksmart/widgets/snackbar.dart';
import 'package:flutter/foundation.dart';
import '../../../models/user_base_model.dart';

class UserProfileScreen extends StatefulWidget {
  const UserProfileScreen({super.key});

  @override
  State<UserProfileScreen> createState() => _UserProfileScreenState();
}

class _UserProfileScreenState extends State<UserProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  final _scrollController = ScrollController();

  final _firstNameCtrl = TextEditingController();
  final _middleNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();

  final TextEditingController middleNameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();

  final _imagePicker = ImagePicker();

  // Profile image upload
  XFile? _profileImage; // selected file (kept for upload)
  Uint8List?
  _profileImageBytes; // in-memory bytes for preview (works on web + mobile)
  String? _profileImageUrl; // remote URL (from server)

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadProfile();
    });
  }

  @override
  void dispose() {
    _scrollController.dispose();
    _firstNameCtrl.dispose();
    _middleNameCtrl.dispose();
    _lastNameCtrl.dispose();

    _phoneCtrl.dispose();
    super.dispose();
  }

  UserModel? user = authUser;

  Future<void> _loadProfile() async {
    _firstNameCtrl.text = user!.firstName;
    _lastNameCtrl.text = user!.lastName;
    _phoneCtrl.text = user!.phoneNumber;

    _profileImageUrl = user!.imgUrl;
    setState(() {
      _buildProfileImageSection();
    });
  }

  /// Pick image from gallery and store bytes for preview.
  Future<void> _pickImage() async {
    if (kIsWeb) {
      _pickFromSource(ImageSource.gallery);
      return;
    }

    showModalBottomSheet(
      context: context,
      builder: (_) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt),
              title: const Text("Take Photo"),
              onTap: () {
                Navigator.pop(context);
                _pickFromSource(ImageSource.camera);
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: const Text("Choose from Gallery"),
              onTap: () {
                Navigator.pop(context);
                _pickFromSource(ImageSource.gallery);
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickFromSource(ImageSource source) async {
    try {
      final XFile? pickedFile = await _imagePicker.pickImage(
        source: source,
        imageQuality: 85,
        preferredCameraDevice: CameraDevice.front,
      );

      if (pickedFile != null) {
        final bytes = await pickedFile.readAsBytes();
        setState(() {
          _profileImage = pickedFile;
          _profileImageBytes = bytes;
        });
      }
    } catch (e) {
      debugPrint('Image picker error: $e');
    }
  }

  Future<void> _saveProfile() async {
    if (!_formKey.currentState!.validate()) return;

    try {
      if (_profileImage != null) {
        final uploadedUrl = await uploadFileToSupabaseStorage(
          file: _profileImage!,
          bucketName: SupabaseStorageBucket.userImages,
        );

        if (uploadedUrl != null && uploadedUrl.isNotEmpty) {
          _profileImageUrl = uploadedUrl;
          _profileImage = null;
          _profileImageBytes = null;
        }
      }

      // Prepare payload
      final Map<String, dynamic> payload = <String, dynamic>{
        'first_name': _firstNameCtrl.text.trim(),
        'last_name': _lastNameCtrl.text.trim(),
        'phone_number': _phoneCtrl.text.trim().isEmpty
            ? null
            : _phoneCtrl.text.trim(),
        'middle_name': _middleNameCtrl.text.trim(),
        if (_profileImageUrl != null && _profileImageUrl!.isNotEmpty)
          'img_url': _profileImageUrl,
        'updated_at': DateTime.now().toIso8601String(),
      };
      payload.removeWhere((key, value) => value == null);

      await updateUserProfile(data: payload);

      showSnackBar('Profile updated successfully', title: 'Success');
    } catch (e) {
      log('Profile update failed: $e');
      showSnackBar('Failed to update profile: ${e.toString()}', title: 'Error');
    }
  }

  Widget _buildProfileImageSection() {
    ImageProvider? avatarImage;

    // Prefer local preview bytes if present (user just picked an image)
    if (_profileImageBytes != null) {
      avatarImage = MemoryImage(_profileImageBytes!);
    } else if (_profileImageUrl != null && _profileImageUrl!.isNotEmpty) {
      // Fall back to network image (uploaded previously)
      avatarImage = NetworkImage(_profileImageUrl!);
    } else {
      avatarImage = null;
    }

    return Stack(
      alignment: Alignment.bottomRight,
      children: [
        GestureDetector(
          onTap: _pickImage,
          child: CircleAvatar(
            radius: 50,
            backgroundColor: Colors.grey.shade300,
            backgroundImage: avatarImage,
            child: avatarImage == null
                ? const Icon(Icons.camera_alt, size: 30, color: Colors.grey)
                : null,
          ),
        ),
        SizedBox(
          width: 30,
          height: 30,
          child: IconButton.filled(
            onPressed: _pickImage,
            icon: Icon(Icons.camera_alt),
            padding: EdgeInsets.zero,
            iconSize: 20,
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: kIsWeb ? null : AppBar(title: const Text('My Profile')),
      body: Scrollbar(
        thumbVisibility: true,
        radius: const Radius.circular(10),
        thickness: 6,
        controller: _scrollController,
        trackVisibility: true,
        child: SingleChildScrollView(
          controller: _scrollController,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 500),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    /// 🔹 Title
                    AppText(
                      "Set Up Your Profile",
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      textAlign: TextAlign.center,
                    ),

                    0.05.verticalSpace,

                    // Profile Image
                    _buildProfileImageSection(),

                    0.03.verticalSpace,

                    ...[
                      AppTextField(
                        controller: _firstNameCtrl,
                        hintText: "First Name *",
                        keyboardType: TextInputType.name,
                        maxLines: 1,
                        fieldValidator: (v) {
                          if (v == null || v.trim().isEmpty) {
                            return "Enter first name";
                          }
                          return null;
                        },
                      ),
                      0.02.verticalSpace,
                      AppTextField(
                        controller: _middleNameCtrl,
                        hintText: "Middle Name",
                        keyboardType: TextInputType.name,
                        maxLines: 1,
                      ),
                      0.02.verticalSpace,
                      AppTextField(
                        controller: _lastNameCtrl,
                        hintText: "Last Name *",
                        keyboardType: TextInputType.name,
                        maxLines: 1,
                        fieldValidator: (v) {
                          if (v == null || v.trim().isEmpty) {
                            return "Enter last name";
                          }
                          return null;
                        },
                      ),
                      0.02.verticalSpace,
                      AppTextField(
                        controller: _phoneCtrl,
                        hintText: "Phone Number",
                        keyboardType: TextInputType.phone,
                        maxLines: 1,
                        fieldValidator: (v) {
                          if (v != null && v.isNotEmpty && v.length < 6) {
                            return "Enter a valid phone number";
                          }
                          return null;
                        },
                      ),
                      0.06.verticalSpace,
                      AppButton(
                        buttonText: "Save Changes",
                        fontSize: 16,
                        radius: 8,
                        onTapFunction: _saveProfile,
                      ),
                      0.05.verticalSpace,
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
