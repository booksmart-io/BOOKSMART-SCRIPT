class UserDocument {
  final int id;
  final int userId;
  final String name;
  final String fileUrl;
  final String? category;
  final String? taxYear;
  final int? fileSize; // bytes
  final String? mimeType;
  final DateTime createdAt;
  final Map<String, dynamic>? parsedData;

  final int? cpaId;
  final int? orderId;

  const UserDocument({
    required this.id,
    required this.userId,
    required this.name,
    required this.fileUrl,
    this.category,
    this.taxYear,
    this.fileSize,
    this.mimeType,
    required this.createdAt,
    this.parsedData,
    this.cpaId,
    this.orderId,
  });

  factory UserDocument.fromJson(Map<String, dynamic> json) {
    return UserDocument(
      id: json['id'] as int,
      userId: json['user_id'] as int,
      name: json['name'] as String,
      fileUrl: json['file_url'] as String,
      category: json['category'] as String?,
      taxYear: json['tax_year'] as String?,
      fileSize: json['file_size'] as int?,
      mimeType: json['mime_type'] as String?,
      createdAt: DateTime.parse(json['created_at'] as String),
      parsedData: json['parsed_data'] == null
          ? null
          : Map<String, dynamic>.from(json['parsed_data']),
      cpaId: json['cpa_id'] as int?,
      orderId: json['order_id'] as int?,
    );
  }

  Map<String, dynamic> toJson() => {
    'user_id': userId,
    'name': name,
    'file_url': fileUrl,
    if (category != null) 'category': category,
    if (taxYear != null) 'tax_year': taxYear,
    if (fileSize != null) 'file_size': fileSize,
    if (mimeType != null) 'mime_type': mimeType,
    if (cpaId != null) 'cpa_id': cpaId,
    if (orderId != null) 'order_id': orderId,
    if (parsedData != null) 'parsed_data': parsedData,
  };

  /// Human-readable file size (e.g. "2.34 MB").
  String get fileSizeLabel {
    if (fileSize == null) return '';
    final kb = fileSize! / 1024;
    if (kb < 1024) return '${kb.toStringAsFixed(1)} KB';
    final mb = kb / 1024;
    return '${mb.toStringAsFixed(2)} MB';
  }
}
