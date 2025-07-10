class AiTaxStrategyModel {
  final int id;
  final String userId;
  final int orgId;

  final String title;
  final String summary;
  final String? category;

  final double estimatedSavings;

  final String? riskLevel;
  final String? auditRisk;

  final List<String> implementationSteps;
  final List<String> tags;

  final DateTime? createdAt;

  AiTaxStrategyModel({
    required this.id,
    required this.userId,
    required this.orgId,
    required this.title,
    required this.summary,
    this.category,
    required this.estimatedSavings,
    this.riskLevel,
    this.auditRisk,
    required this.implementationSteps,
    required this.tags,
    this.createdAt,
  });

  /// 🔹 FROM JSON (Supabase → Flutter)
  factory AiTaxStrategyModel.fromJson(Map<String, dynamic> json) {
    return AiTaxStrategyModel(
      id: json['id'] ?? '',
      userId: json['user_id'] ?? '',
      orgId: json['org_id'] ?? 0,

      title: json['title'] ?? '',
      summary: json['summary'] ?? '',
      category: json['category'],

      estimatedSavings: (json['estimated_savings'] == null)
          ? 0.0
          : (json['estimated_savings'] as num).toDouble(),

      riskLevel: json['risk_level'],
      auditRisk: json['audit_risk'],

      implementationSteps: json['implementation_steps'] != null
          ? List<String>.from(json['implementation_steps'])
          : [],

      tags: json['tags'] != null ? List<String>.from(json['tags']) : [],

      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'])
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'org_id': orgId,

      'title': title,
      'summary': summary,
      'category': category,

      'estimated_savings': estimatedSavings,

      'risk_level': riskLevel,
      'audit_risk': auditRisk,

      'implementation_steps': implementationSteps,
      'tags': tags,

      'created_at': createdAt?.toIso8601String(),
    };
  }

  Map<String, dynamic> toAiContextJson() {
    return {'title': title, 'category': category, 'tags': tags};
  }

  Map<String, dynamic> toInsertJson({
    required String userId,
    required int orgId,
  }) {
    return {
      'user_id': userId,
      'org_id': orgId,
      'title': title,
      'summary': summary,
      'category': category,
      'estimated_savings': estimatedSavings,
      'risk_level': riskLevel,
      'audit_risk': auditRisk,
      'implementation_steps': implementationSteps,
      'tags': tags,
    };
  }
}
