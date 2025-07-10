part of './user_base_model.dart';

enum CpaVerificationStatus { pending, approved, rejected }

class CpaModel extends Core {
  final List<String> certifications;
  final String licenseNumber;
  final DateTime? careerStartDate;
  final String professionalBio;
  final List<String> specialties;
  final List<String> stateFocuses;
  final String certificationProofUrl;
  final String licenseCopyUrl;
  final bool termsAgreed;
  final double hourlyRate;

  final CpaVerificationStatus verificationStatus;
  final int? verifiedBy;
  final DateTime? verifiedAt;

  final String? stripeBusinessAccountId;
  final String? stripeAccountId;
  final bool stripePayoutsEnabled;

  int get getExperienceInYears {
    if (careerStartDate == null) {
      return 0;
    }
    int difference = DateTime.now().year - (careerStartDate!.year);

    if (difference == 0) {
      return 1;
    } else {
      return difference;
    }
  }

  CpaModel({
    required super.data,
    required this.certifications,
    required this.licenseNumber,
    required this.careerStartDate,
    required this.professionalBio,
    required this.specialties,
    required this.stateFocuses,
    required this.certificationProofUrl,
    required this.licenseCopyUrl,
    required this.termsAgreed,
    required this.hourlyRate,
    required this.verificationStatus,
    required this.verifiedBy,
    required this.verifiedAt,
    required this.stripeBusinessAccountId,
    required this.stripeAccountId,
    required this.stripePayoutsEnabled,
  });

  factory CpaModel.fromJson(Map<String, dynamic> json) {
    return CpaModel(
      data: PersonModel.fromJson(json),

      certifications: ((json["certifications"] as List?) ?? [])
          .map((x) => x.toString())
          .toList(),
      licenseNumber:
          handleResponseFromJson<String>(json, "license_number") ?? "",
      careerStartDate: DateTime.tryParse(
        handleResponseFromJson<String>(json, "career_start_date") ?? "",
      ),
      professionalBio:
          handleResponseFromJson<String>(json, "professional_bio") ?? "",
      specialties: (handleResponseFromJson<List>(json, "specialties") ?? [])
          .map((e) => e.toString())
          .toList(),
      stateFocuses: (handleResponseFromJson<List>(json, "state_focuses") ?? [])
          .map((e) => e.toString())
          .toList(),
      certificationProofUrl:
          handleResponseFromJson<String>(json, "certification_proof_url") ?? "",
      licenseCopyUrl:
          handleResponseFromJson<String>(json, "license_copy_url") ?? "",
      termsAgreed: handleResponseFromJson<bool>(json, "terms_agreed") ?? false,
      hourlyRate: (handleResponseFromJson<num>(json, "hourly_rate") ?? 50.0)
          .toDouble(),
      verificationStatus: () {
        String status =
            handleResponseFromJson<String>(json, "verification_status") ??
            CpaVerificationStatus.pending.name;

        return CpaVerificationStatus.values.byName(status);
      }(),
      verifiedBy: handleResponseFromJson<int?>(json, "verified_by"),
      verifiedAt: DateTime.tryParse(
        handleResponseFromJson<String?>(json, "verified_at") ?? "",
      ),
      stripeBusinessAccountId: handleResponseFromJson<String?>(
        json,
        "stripe_business_account_id",
      ),
      stripeAccountId: handleResponseFromJson<String?>(
        json,
        "stripe_account_id",
      ),
      stripePayoutsEnabled:
          handleResponseFromJson<bool?>(json, "stripe_payouts_enabled") ??
          false,
    );
  }

  Map<String, dynamic> toJson() {
    return super.data.toJson()..addAll({
      "certifications": certifications,
      "license_number": licenseNumber,
      "career_start_date": careerStartDate?.toIso8601String(),
      "professional_bio": professionalBio,
      "specialties": specialties,
      "state_focuses": stateFocuses,
      "certification_proof_url": certificationProofUrl,
      "license_copy_url": licenseCopyUrl,
      "terms_agreed": termsAgreed,
      "hourly_rate": hourlyRate,
      "verification_status": verificationStatus,
      "verified_by": verifiedBy,
      "verified_at": verifiedAt?.toIso8601String(),
      "stripe_business_account_id": stripeBusinessAccountId,
      "stripe_account_id": stripeAccountId,
      "stripe_payouts_enabled": stripePayoutsEnabled,
    });
  }
}
