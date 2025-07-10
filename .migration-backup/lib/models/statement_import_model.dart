class StatementImportModel {
  final int id;
  final int userId;
  final int orgId;
  final int? documentId;
  final String documentPath;
  final String mimeType;
  final String status;
  final String? errorMessage;
  final int rowsExtracted;
  final int rowsApproved;
  final int rowsRejected;
  final DateTime createdAt;
  final DateTime updatedAt;

  StatementImportModel.fromJson(Map<String, dynamic> j)
      : id = j['id'],
        userId = j['user_id'],
        orgId = j['org_id'],
        documentId = j['document_id'],
        documentPath = j['document_path'] ?? '',
        mimeType = j['mime_type'] ?? '',
        status = j['status'] ?? 'pending',
        errorMessage = j['error_message'],
        rowsExtracted = j['rows_extracted'] ?? 0,
        rowsApproved = j['rows_approved'] ?? 0,
        rowsRejected = j['rows_rejected'] ?? 0,
        createdAt = DateTime.parse(j['created_at']),
        updatedAt = DateTime.parse(j['updated_at']);
}
