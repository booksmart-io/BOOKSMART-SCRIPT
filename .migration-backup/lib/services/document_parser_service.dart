import 'dart:developer';
import 'package:booksmart/services/ai_extraction_service.dart';
import 'package:image_picker/image_picker.dart';

class DocumentParserService {
  /// Parses a document and returns a map of extracted data
  /// Expected return format: {'income': double, 'expense': double, 'net': double}
  static Future<dynamic> parseDocument(
    XFile file, {
    String type = 'pnl',
  }) async {
    try {
      // Use AI for all document types (PDF, Images, CSV, etc.) for extraction as images/PDF are unstructured
      return await AIExtractionService.extractFinancialData(file, type);
    } catch (e, stack) {
      log('Error parsing document: $e\n$stack');
      return null;
    }
  }
}
