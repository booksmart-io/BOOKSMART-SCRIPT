import "package:universal_html/html.dart" as html;
import 'dart:typed_data';

Future<void> downloadFile(
  String filename,
  List<int> bytes, {
  String mimeType = 'application/octet-stream',
}) async {
  final blob = html.Blob([Uint8List.fromList(bytes)], mimeType);
  final url = html.Url.createObjectUrlFromBlob(blob);
  final anchor = html.AnchorElement(href: url)
    ..setAttribute('download', filename)
    ..style.display = 'none';
  html.document.body?.children.add(anchor);
  anchor.click();
  html.document.body?.children.remove(anchor);

  // Delay revocation to ensure download completes before URL is destroyed
  Future.delayed(const Duration(seconds: 5), () {
    html.Url.revokeObjectUrl(url);
  });
}
