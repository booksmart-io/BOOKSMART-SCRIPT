import 'dart:convert';
import 'package:url_launcher/url_launcher.dart';

Future<void> downloadFile(String filename, List<int> bytes, {String mimeType = 'application/octet-stream'}) async {
  final base64String = base64.encode(bytes);
  final str = 'data:$mimeType;base64,$base64String';
  await launchUrl(Uri.parse(str));
}
