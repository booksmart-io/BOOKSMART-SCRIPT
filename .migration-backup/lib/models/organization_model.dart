import 'package:booksmart/helpers/json_helper.dart';

class OrganizationModel {
  final int id;
  final String name;
  final String? website;
  final String einTin;
  final String orgType;
  final String industry;
  final int? stateId;
  final String street;
  final String city;
  final String zip;
  final String? phone;
  final String? email;

  /// User.id
  final int ownerId;

  // 🇺🇸 US Tax Strategy Fields (Added for Onboarding)
  final String? filingStatus;
  final String? primaryState;
  final String? residencyStatus;
  final bool? multiStateActivity;
  final List<String>? primaryIncomeTypes;
  final String? industryNiche;
  final List<String>? passiveIncome;
  final List<String>? teamStructure;
  final String? accountingMethod;
  final bool? majorEquipment;
  final String? vehicleOwnership;
  final String? vehicleUsage;
  final bool? vehicleOver6kLbs;
  final String? homeOfficeType;
  final String? homeStatus;
  final List<String>? techUsage;
  final List<String>? realEstateInterests;
  final bool? hostsBusinessMeetings;
  final String? healthInsurance;
  final List<String>? healthSavings;
  final List<String>? familyEducation;
  final String? taxGoal;
  final List<String>? retirementCurrent;
  final String? auditAppetite;
  final double? totalHouseAreaSqft;
  final double? dedicatedOfficeAreaSqft;
  final int? businessVehiclePercent;
  final int? businessUtilityPercent;
  final int? businessMealPercent;
  final double? equipmentCost;
  final Map<String, dynamic>? debts;

  OrganizationModel({
    required this.id,
    required this.name,
    this.website,
    required this.einTin,
    required this.orgType,
    required this.industry,
    required this.stateId,
    required this.street,
    required this.city,
    required this.zip,
    this.phone,
    this.email,
    required this.ownerId,
    this.filingStatus,
    this.primaryState,
    this.residencyStatus,
    this.multiStateActivity,
    this.primaryIncomeTypes,
    this.industryNiche,
    this.passiveIncome,
    this.teamStructure,
    this.accountingMethod,
    this.majorEquipment,
    this.vehicleOwnership,
    this.vehicleUsage,
    this.vehicleOver6kLbs,
    this.homeOfficeType,
    this.homeStatus,
    this.techUsage,
    this.realEstateInterests,
    this.hostsBusinessMeetings,
    this.healthInsurance,
    this.healthSavings,
    this.familyEducation,
    this.taxGoal,
    this.retirementCurrent,
    this.auditAppetite,
    this.totalHouseAreaSqft,
    this.dedicatedOfficeAreaSqft,
    this.businessVehiclePercent,
    this.businessUtilityPercent,
    this.businessMealPercent,
    this.equipmentCost,
    this.debts,
  });

  factory OrganizationModel.fromJson(Map<String, dynamic> json) {
    return OrganizationModel(
      id: json['id'],
      name: json['name'],
      website: json['website'],
      einTin: json['ein_tin'],
      orgType: json['org_type'],
      industry: json['industry'],
      stateId: json['state'] is int
          ? json['state']
          : int.tryParse(json['state']?.toString() ?? ''),
      street: json['street'],
      city: json['city'],
      zip: json['zip'],
      phone: json['phone'],
      email: json['email'],
      ownerId: json['owner_id'],
      filingStatus: json['filing_status'],
      primaryState: json['primary_state'],
      residencyStatus: json['residency_status'],
      multiStateActivity: json['multi_state_activity'],
      primaryIncomeTypes: _parseList(json['primary_income_types']),
      industryNiche: json['industry_niche'],
      passiveIncome: _parseList(json['passive_income']),
      teamStructure: _parseList(json['team_structure']),
      accountingMethod: json['accounting_method'],
      majorEquipment: json['major_equipment'],
      vehicleOwnership: json['vehicle_ownership'],
      vehicleUsage: json['vehicle_usage'],
      vehicleOver6kLbs: json['vehicle_over_6k_lbs'],
      homeOfficeType: json['home_office_type'],
      homeStatus: json['home_status'],
      techUsage: _parseList(json['tech_usage']),
      realEstateInterests: _parseList(json['real_estate_interests']),
      hostsBusinessMeetings: json['hosts_business_meetings'],
      healthInsurance: json['health_insurance'],
      healthSavings: _parseList(json['health_savings']),
      familyEducation: _parseList(json['family_education']),
      taxGoal: json['tax_goal'],
      retirementCurrent: _parseList(json['retirement_current']),
      auditAppetite: json['audit_appetite'],
      totalHouseAreaSqft: handleResponseFromJson<double?>(
        json,
        'total_house_area_sqft',
      ),
      dedicatedOfficeAreaSqft: handleResponseFromJson<double?>(
        json,
        'dedicated_office_area_sqft',
      ),
      businessVehiclePercent: json['business_vehicle_percent'],
      businessUtilityPercent: json['business_utility_percent'],
      businessMealPercent: json['business_meal_percent'],
      equipmentCost: handleResponseFromJson<double?>(json, 'equipment_cost'),
      debts: _parseMap(json['debts']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'website': website,
      'ein_tin': einTin,
      'org_type': orgType,
      'industry': industry,
      'state': stateId,
      'street': street,
      'city': city,
      'zip': zip,
      'phone': phone,
      'email': email,
      'owner_id': ownerId,
      'filing_status': filingStatus,
      'primary_state': primaryState,
      'residency_status': residencyStatus,
      'multi_state_activity': multiStateActivity,
      'primary_income_types': primaryIncomeTypes,
      'industry_niche': industryNiche,
      'passive_income': passiveIncome,
      'team_structure': teamStructure,
      'accounting_method': accountingMethod,
      'major_equipment': majorEquipment,
      'vehicle_ownership': vehicleOwnership,
      'vehicle_usage': vehicleUsage,
      'vehicle_over_6k_lbs': vehicleOver6kLbs,
      'home_office_type': homeOfficeType,
      'home_status': homeStatus,
      'tech_usage': techUsage,
      'real_estate_interests': realEstateInterests,
      'hosts_business_meetings': hostsBusinessMeetings,
      'health_insurance': healthInsurance,
      'health_savings': healthSavings,
      'family_education': familyEducation,
      'tax_goal': taxGoal,
      'retirement_current': retirementCurrent,
      'audit_appetite': auditAppetite,
      'total_house_area_sqft': totalHouseAreaSqft,
      'dedicated_office_area_sqft': dedicatedOfficeAreaSqft,
      'business_vehicle_percent': businessVehiclePercent,
      'business_utility_percent': businessUtilityPercent,
      'business_meal_percent': businessMealPercent,
      'equipment_cost': equipmentCost,
      'debts': debts,
    };
  }

  static List<String>? _parseList(dynamic data) {
    if (data == null) return null;
    if (data is List) return data.map((e) => e.toString()).toList();
    return null;
  }

  static Map<String, dynamic>? _parseMap(dynamic data) {
    if (data == null) return null;
    if (data is Map) {
      return data.map((key, value) => MapEntry(key.toString(), value));
    }
    return null;
  }

  Map<String, dynamic> getJsonForAI() {
    return {
      'name': name,
      'website': website,
      'ein_tin': einTin,
      'org_type': orgType,
      'industry': industry,
      'filing_status': filingStatus,
      'primary_state': primaryState,
      'residency_status': residencyStatus,
      'multi_state_activity': multiStateActivity,
      'primary_income_types': primaryIncomeTypes,
      'industry_niche': industryNiche,
      'passive_income': passiveIncome,
      'team_structure': teamStructure,
      'accounting_method': accountingMethod,
      'major_equipment': majorEquipment,
      'vehicle_ownership': vehicleOwnership,
      'vehicle_usage': vehicleUsage,
      'vehicle_over_6k_lbs': vehicleOver6kLbs,
      'home_office_type': homeOfficeType,
      'home_status': homeStatus,
      'tech_usage': techUsage,
      'real_estate_interests': realEstateInterests,
      'hosts_business_meetings': hostsBusinessMeetings,
      'health_insurance': healthInsurance,
      'health_savings': healthSavings,
      'family_education': familyEducation,
      'tax_goal': taxGoal,
      'retirement_current': retirementCurrent,
      'audit_appetite': auditAppetite,
      'total_house_area_sqft': totalHouseAreaSqft,
      'dedicated_office_area_sqft': dedicatedOfficeAreaSqft,
      'business_vehicle_percent': businessVehiclePercent,
      'business_utility_percent': businessUtilityPercent,
      'business_meal_percent': businessMealPercent,
      'equipment_cost': equipmentCost,
      'debts': debts,
    };
  }
}
