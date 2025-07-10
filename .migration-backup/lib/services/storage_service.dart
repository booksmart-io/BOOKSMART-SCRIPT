import 'dart:developer';

import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

import '../utils/supabase.dart';

Future<String?> uploadFileToSupabaseStorage({
  required XFile file,
  required String bucketName,
  bool isPublic = true,
  String? contentType,
}) async {
  final user = supabase.auth.currentUser;
  if (user == null) return null;

  try {
    final fileBytes = await file.readAsBytes();

    final filePath = '${user.id}/${Uuid().v4()}_${file.name}';

    await supabase.storage
        .from(bucketName)
        .uploadBinary(
          filePath,
          fileBytes,
          fileOptions: FileOptions(upsert: false, contentType: contentType),
        );

    if (isPublic) {
      return supabase.storage.from(bucketName).getPublicUrl(filePath);
    } else {
      return await supabase.storage
          .from(bucketName)
          .createSignedUrl(filePath, 60 * 60);
    }
  } catch (e, stack) {
    log('Upload Error: $e');
    log(stack.toString());
    return null;
  }
}

/// We are storing media path in our db, pass the same path,
/// it will auto extract bucketName and the delete that file
///
Future<bool> deleteFileFromSupabase(String storedPath) async {
  final parts = storedPath.split('/');
  if (parts.length < 2) return false; // invalid path

  final bucketName = parts.first;
  final relativePath = parts.sublist(1).join('/');

  return supabase.storage
      .from(bucketName)
      .remove([relativePath])
      .then((value) {
        return true;
      })
      .onError((error, stackTrace) {
        log(error.toString());
        log(stackTrace.toString());
        return false;
      });
}

Future<String?> getPrivateImageUrl({
  required String bucketName,
  required String filePath,
  int expiresInSeconds = 3600, // default 1 hour
}) async {
  final user = supabase.auth.currentUser;
  if (user == null) return null;

  try {
    final signedUrl = await supabase.storage
        .from(bucketName)
        .createSignedUrl(filePath, expiresInSeconds);

    return signedUrl;
  } catch (e, stack) {
    log('Signed URL Error: $e');
    log(stack.toString());
    return null;
  }
}
