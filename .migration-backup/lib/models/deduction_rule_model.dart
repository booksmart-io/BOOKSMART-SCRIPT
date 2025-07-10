import '../helpers/json_helper.dart';

enum CalculationType { percentage, fixed }

typedef RuleType = CalculationType;

class DeductionRuleGroupModel {
  final int id;
  final int? stateId;
  final DateTime validFrom;
  final DateTime? validTo;
  final String? description;
  final DateTime createdAt;
  final DateTime updatedAt;

  DeductionRuleGroupModel({
    required this.id,
    required this.stateId,
    required this.validFrom,
    required this.validTo,
    required this.description,
    required this.createdAt,
    required this.updatedAt,
  });

  factory DeductionRuleGroupModel.fromJson(Map<String, dynamic> json) {
    return DeductionRuleGroupModel(
      id: handleResponseFromJson<int>(json, 'id') ?? 0,
      stateId: handleResponseFromJson<int>(json, 'state_id'),
      validFrom:
          DateTime.tryParse(
            handleResponseFromJson<String>(json, 'valid_from') ?? '',
          ) ??
          DateTime.now(),
      validTo: DateTime.tryParse(
        handleResponseFromJson<String>(json, 'valid_to') ?? '',
      ),
      description: handleResponseFromJson<String>(json, 'description'),
      createdAt:
          DateTime.tryParse(
            handleResponseFromJson<String>(json, 'created_at') ?? '',
          ) ??
          DateTime.now(),
      updatedAt:
          DateTime.tryParse(
            handleResponseFromJson<String>(json, 'updated_at') ?? '',
          ) ??
          DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'state_id': stateId,
      'valid_from': validFrom.toIso8601String().split('T').first,
      'valid_to': validTo?.toIso8601String().split('T').first,
      'description': description,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }
}

class DeductionRuleModel {
  final int id;
  final int deductionRuleGroupId;
  final int subCategoryId;
  final int? stateId;
  final int categoryId;
  final String? organizationColumnName;
  final CalculationType calculationType;
  final double value;
  final bool isPerTransaction;
  final double? maxDeductionPerTransaction;
  final DateTime createdAt;
  final DateTime updatedAt;

  DeductionRuleModel({
    required this.id,
    required this.deductionRuleGroupId,
    required this.subCategoryId,
    required this.stateId,
    required this.categoryId,
    required this.organizationColumnName,
    required this.calculationType,
    required this.value,
    required this.isPerTransaction,
    required this.maxDeductionPerTransaction,
    required this.createdAt,
    required this.updatedAt,
  });

  factory DeductionRuleModel.fromJson(Map<String, dynamic> json) {
    return DeductionRuleModel(
      id: handleResponseFromJson<int>(json, 'id') ?? 0,
      deductionRuleGroupId:
          handleResponseFromJson<int>(json, 'deduction_rule_group_id') ?? 0,
      subCategoryId: handleResponseFromJson<int>(json, 'sub_category_id') ?? 0,
      stateId: handleResponseFromJson<int>(json, 'state_id'),
      categoryId: handleResponseFromJson<int>(json, 'category_id') ?? -1,
      organizationColumnName: handleResponseFromJson<String>(
        json,
        'organization_column_name',
      ),
      calculationType: CalculationType.values.byName(
        handleResponseFromJson<String>(json, 'calculation_type') ??
            CalculationType.percentage.name,
      ),
      value: (handleResponseFromJson<num>(json, 'value') ?? 0).toDouble(),
      isPerTransaction:
          handleResponseFromJson<bool>(json, 'is_per_transaction') ?? false,
      maxDeductionPerTransaction: handleResponseFromJson<num>(
        json,
        'max_deduction_per_transaction',
      )?.toDouble(),
      createdAt:
          DateTime.tryParse(
            handleResponseFromJson<String>(json, 'created_at') ?? '',
          ) ??
          DateTime.now(),
      updatedAt:
          DateTime.tryParse(
            handleResponseFromJson<String>(json, 'updated_at') ?? '',
          ) ??
          DateTime.now(),
    );
  }

  CalculationType get ruleType => calculationType;

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'deduction_rule_group_id': deductionRuleGroupId,
      'sub_category_id': subCategoryId,
      'organization_column_name': organizationColumnName,
      'calculation_type': calculationType.name,
      'value': value,
      'is_per_transaction': isPerTransaction,
      'max_deduction_per_transaction': maxDeductionPerTransaction,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }
}
