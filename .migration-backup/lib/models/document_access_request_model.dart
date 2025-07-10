enum DocumentAccessStatus {
  pending,
  accepted,
  rejected;

  static DocumentAccessStatus fromString(String s) {
    return DocumentAccessStatus.values.firstWhere(
      (e) => e.name == s,
      orElse: () => DocumentAccessStatus.pending,
    );
  }
}

class DocumentAccessRequest {
  final int id;
  final int? orderId;
  final int cpaId;
  final int userId;
  final DocumentAccessStatus status;
  final DateTime requestedAt;
  final DateTime? respondedAt;
  final DateTime createdAt;
  final DateTime updatedAt;

  // Joined fields (optional, returned via select with join)
  final String? cpaFirstName;
  final String? cpaLastName;
  final String? cpaEmail;
  final String? cpaImageUrl;

  const DocumentAccessRequest({
    required this.id,
    this.orderId,
    required this.cpaId,
    required this.userId,
    required this.status,
    required this.requestedAt,
    this.respondedAt,
    required this.createdAt,
    required this.updatedAt,
    this.cpaFirstName,
    this.cpaLastName,
    this.cpaEmail,
    this.cpaImageUrl,
  });

  String get cpaFullName {
    final first = cpaFirstName ?? '';
    final last = cpaLastName ?? '';
    final full = '$first $last'.trim();
    return full.isEmpty ? (cpaEmail ?? 'Unknown CPA') : full;
  }

  factory DocumentAccessRequest.fromJson(Map<String, dynamic> json) {
    // The cpa join may come as json['cpa'] or json['users'] depending on the query
    final cpaMap = json['cpa'] as Map<String, dynamic>?;
    return DocumentAccessRequest(
      id: json['id'] as int,
      orderId: json['order_id'] as int?,
      cpaId: json['cpa_id'] as int,
      userId: json['user_id'] as int,
      status: DocumentAccessStatus.fromString(
        json['status'] as String? ?? 'pending',
      ),
      requestedAt:
          DateTime.tryParse(json['requested_at'] as String? ?? '') ??
          DateTime.now(),
      respondedAt: json['responded_at'] != null
          ? DateTime.tryParse(json['responded_at'] as String)
          : null,
      createdAt:
          DateTime.tryParse(json['created_at'] as String? ?? '') ??
          DateTime.now(),
      updatedAt:
          DateTime.tryParse(json['updated_at'] as String? ?? '') ??
          DateTime.now(),
      cpaFirstName: cpaMap?['first_name'] as String?,
      cpaLastName: cpaMap?['last_name'] as String?,
      cpaEmail: cpaMap?['email'] as String?,
      cpaImageUrl: cpaMap?['img_url'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
    if (orderId != null) 'order_id': orderId,
    'cpa_id': cpaId,
    'user_id': userId,
    'status': status.name,
    'requested_at': requestedAt.toIso8601String(),
    if (respondedAt != null) 'responded_at': respondedAt!.toIso8601String(),
  };
}
