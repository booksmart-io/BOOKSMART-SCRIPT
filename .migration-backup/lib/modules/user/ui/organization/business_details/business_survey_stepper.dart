import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/constant/data.dart';
import 'package:booksmart/helpers/input_formatters.dart';
import 'package:booksmart/modules/user/controllers/organization_controller.dart';
import 'package:booksmart/widgets/custom_dialog.dart';
import 'package:booksmart/widgets/custom_drop_down.dart';
import 'package:booksmart/widgets/loading.dart';
import 'package:booksmart/widgets/snackbar.dart';
import 'package:dropdown_search/dropdown_search.dart';
import 'package:flutter/foundation.dart';
import 'package:get/get.dart';

import 'business_details_widgets.dart';

void goToBusinessSurvey({int? organizationId, bool shouldCloseBefore = false}) {
  if (kIsWeb) {
    if (shouldCloseBefore) {
      Get.back();
    }
    customDialog(
      child: BusinessSurveyStepper(organizationId: organizationId),
      title: 'Business Survey',
      barrierDismissible: false,
    );
  } else {
    if (shouldCloseBefore) {
      Get.off(() => BusinessSurveyStepper(organizationId: organizationId));
    } else {
      Get.to(() => BusinessSurveyStepper(organizationId: organizationId));
    }
  }
}

class BusinessSurveyStepper extends StatefulWidget {
  final int? organizationId;
  const BusinessSurveyStepper({super.key, this.organizationId});

  @override
  State<BusinessSurveyStepper> createState() => _BusinessSurveyStepperState();
}

class _BusinessSurveyStepperState extends State<BusinessSurveyStepper> {
  static const int _totalSteps = 10;
  static const List<MapEntry<String, String>> _debtCategories = [
    MapEntry('credit_cards', 'Credit Cards'),
    MapEntry('sba_loans', 'SBA Loans'),
    MapEntry('vehicle_loans', 'Vehicle Loans'),
    MapEntry('equipment_loans', 'Equipment Loans'),
    MapEntry('taxes_owed', 'Taxes Owed'),
    MapEntry('payroll_liabilities', 'Payroll Liabilities'),
    MapEntry('other', 'Other'),
  ];

  final PageController _pageController = PageController();
  final _stateKey = GlobalKey<DropdownSearchState<String>>();
  final _stateController = TextEditingController();
  final _industryController = TextEditingController();
  final _totalHouseAreaController = TextEditingController();
  final _dedicatedOfficeAreaController = TextEditingController();
  final _equipmentCostController = TextEditingController(text: '0');
  final Map<String, TextEditingController> _debtControllers = {
    for (final category in _debtCategories)
      category.key: TextEditingController(),
  };

  int _currentStep = 0;
  bool _isSaving = false;

  String? _filingStatus;
  String? _residencyStatus;
  bool? _multiStateActivity;
  List<String> _primaryIncomeTypes = [];
  List<String> _passiveIncome = [];
  List<String> _teamStructure = [];
  String? _accountingMethod;
  bool? _majorEquipment;
  String? _vehicleOwnership;
  String? _vehicleUsage;
  bool? _vehicleOver6kLbs;
  String? _homeOfficeType;
  String? _homeStatus;
  List<String> _techUsage = [];
  List<String> _realEstateInterests = [];
  bool? _hostsBusinessMeetings;
  String? _healthInsurance;
  List<String> _healthSavings = [];
  List<String> _familyEducation = [];
  String? _taxGoal;
  List<String> _retirementCurrent = [];
  String? _auditAppetite;
  double _vehiclePercent = 100;
  double _utilityPercent = 100;
  double _mealPercent = 100;

  @override
  void initState() {
    super.initState();
    _preFillData();
  }

  void _preFillData() {
    if (widget.organizationId == null) return;

    final org = organizationControllerInstance.organizations.firstWhereOrNull(
      (e) => e.id == widget.organizationId,
    );
    if (org == null) return;

    _filingStatus = org.filingStatus;
    _stateController.text = org.primaryState ?? '';
    _residencyStatus = org.residencyStatus;
    _multiStateActivity = org.multiStateActivity;
    _primaryIncomeTypes = org.primaryIncomeTypes ?? [];
    _industryController.text = org.industryNiche ?? '';
    _passiveIncome = org.passiveIncome ?? [];
    _teamStructure = org.teamStructure ?? [];
    _accountingMethod = org.accountingMethod;
    _majorEquipment = org.majorEquipment;
    _vehicleOwnership = org.vehicleOwnership;
    _vehicleUsage = org.vehicleUsage;
    _vehicleOver6kLbs = org.vehicleOver6kLbs;
    _homeOfficeType = org.homeOfficeType;
    _homeStatus = org.homeStatus;
    _techUsage = org.techUsage ?? [];
    _realEstateInterests = org.realEstateInterests ?? [];
    _hostsBusinessMeetings = org.hostsBusinessMeetings;
    _healthInsurance = org.healthInsurance;
    _healthSavings = org.healthSavings ?? [];
    _familyEducation = org.familyEducation ?? [];
    _taxGoal = org.taxGoal;
    _retirementCurrent = org.retirementCurrent ?? [];
    _auditAppetite = org.auditAppetite;
    _totalHouseAreaController.text = org.totalHouseAreaSqft?.toString() ?? '';
    _dedicatedOfficeAreaController.text =
        org.dedicatedOfficeAreaSqft?.toString() ?? '';
    _vehiclePercent = (org.businessVehiclePercent ?? 100).toDouble();
    _utilityPercent = (org.businessUtilityPercent ?? 100).toDouble();
    _mealPercent = (org.businessMealPercent ?? 100).toDouble();
    _equipmentCostController.text = (org.equipmentCost ?? 0).toString();

    org.debts?.forEach((key, value) {
      final controller = _debtControllers[key];
      if (controller != null && value != null) {
        controller.text = value.toString();
      }
    });
  }

  @override
  void dispose() {
    _pageController.dispose();
    _stateController.dispose();
    _industryController.dispose();
    _totalHouseAreaController.dispose();
    _dedicatedOfficeAreaController.dispose();
    _equipmentCostController.dispose();
    for (final controller in _debtControllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _saveAndNext() async {
    setState(() => _isSaving = true);
    showLoading();

    try {
      final data = _payloadForCurrentStep();
      if (widget.organizationId != null) {
        await organizationControllerInstance.updateTaxProfile(
          organizationId: widget.organizationId!,
          data: data,
        );
      }

      dismissLoadingWidget();
      setState(() => _isSaving = false);
      _goForward();
    } catch (_) {
      dismissLoadingWidget();
      setState(() => _isSaving = false);
      showSnackBar('Failed to save progress. Please try again.', isError: true);
    }
  }

  Map<String, dynamic> _payloadForCurrentStep() {
    switch (_currentStep) {
      case 0:
        return {
          'filing_status': _filingStatus,
          'primary_state': _stateController.text.trim().isEmpty
              ? null
              : _stateController.text.trim(),
          'residency_status': _residencyStatus,
          'multi_state_activity': _multiStateActivity,
        };
      case 1:
        return {
          'primary_income_types': _primaryIncomeTypes.isEmpty
              ? null
              : _primaryIncomeTypes,
          'industry_niche': _industryController.text.trim().isEmpty
              ? null
              : _industryController.text.trim(),
          'passive_income': _passiveIncome.isEmpty ? null : _passiveIncome,
        };
      case 2:
        return {
          'team_structure': _teamStructure.isEmpty ? null : _teamStructure,
          'accounting_method': _accountingMethod,
          'major_equipment': _majorEquipment,
        };
      case 3:
        return {
          'vehicle_ownership': _vehicleOwnership,
          'vehicle_usage': _vehicleUsage,
          'vehicle_over_6k_lbs': _vehicleOver6kLbs,
        };
      case 4:
        return {
          'home_office_type': _homeOfficeType,
          'home_status': _homeStatus,
          'tech_usage': _techUsage.isEmpty ? null : _techUsage,
        };
      case 5:
        return {
          'real_estate_interests': _realEstateInterests.isEmpty
              ? null
              : _realEstateInterests,
          'hosts_business_meetings': _hostsBusinessMeetings,
        };
      case 6:
        return {
          'health_insurance': _healthInsurance,
          'health_savings': _healthSavings.isEmpty ? null : _healthSavings,
          'family_education': _familyEducation.isEmpty
              ? null
              : _familyEducation,
        };
      case 7:
        return {
          'tax_goal': _taxGoal,
          'retirement_current': _retirementCurrent.isEmpty
              ? null
              : _retirementCurrent,
          'audit_appetite': _auditAppetite,
        };
      case 8:
        final totalHouseArea =
            double.tryParse(_totalHouseAreaController.text.trim()) ?? 0.0;
        final dedicatedOfficeArea =
            double.tryParse(_dedicatedOfficeAreaController.text.trim()) ?? 0.0;
        final businessArea = totalHouseArea > 0
            ? (dedicatedOfficeArea / totalHouseArea) * 100
            : 0.0;
        return {
          'total_house_area_sqft': totalHouseArea == 0 ? null : totalHouseArea,
          'dedicated_office_area_sqft': dedicatedOfficeArea == 0
              ? null
              : dedicatedOfficeArea,
          'business_area_sqft': businessArea == 0 ? null : businessArea,
          'business_vehicle_percent': _vehiclePercent.round(),
          'business_utility_percent': _utilityPercent.round(),
          'business_meal_percent': _mealPercent.round(),
        };
      case 9:
        return {
          'equipment_cost':
              double.tryParse(_equipmentCostController.text.trim()) ?? 0,
          'debts': _debtPayload(),
        };
      default:
        return {};
    }
  }

  Map<String, num>? _debtPayload() {
    final debts = <String, num>{};
    for (final entry in _debtControllers.entries) {
      final amount = double.tryParse(entry.value.text.trim());
      if (amount != null && amount > 0) {
        debts[entry.key] = amount;
      }
    }
    return debts.isEmpty ? null : debts;
  }

  void _goForward() {
    if (_currentStep < _totalSteps - 1) {
      _pageController.nextPage(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
      );
      setState(() => _currentStep++);
    } else {
      _finish();
    }
  }

  void _goBack() {
    if (_currentStep > 0) {
      _pageController.previousPage(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
      );
      setState(() => _currentStep--);
    } else {
      Get.back();
    }
  }

  void _finish() {
    if (kIsWeb) {
      Get.back();
    } else {
      Get.until((route) => route.isFirst);
    }
    showSnackBar('Business survey saved. Your AI strategy is being tailored.');
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      backgroundColor: colorScheme.surface,
      appBar: kIsWeb
          ? null
          : AppBar(
              automaticallyImplyLeading: false,
              title: const Text('Business Survey'),
              centerTitle: true,
            ),
      body: SafeArea(
        child: Column(
          children: [
            if (kIsWeb)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: AppText(
                    'Business Survey',
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: colorScheme.onSurface,
                  ),
                ),
              ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              child: TaxProgressBar(
                current: _currentStep + 1,
                total: _totalSteps,
              ),
            ),
            Expanded(
              child: PageView(
                controller: _pageController,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  _buildStep1(colorScheme),
                  _buildStep2(colorScheme),
                  _buildStep3(colorScheme),
                  _buildStep4(colorScheme),
                  _buildStep5(colorScheme),
                  _buildStep6(colorScheme),
                  _buildStep7(colorScheme),
                  _buildStep8(colorScheme),
                  _buildStep9(colorScheme),
                  _buildStep10(colorScheme),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
              decoration: BoxDecoration(
                color: colorScheme.surface,
                border: Border(
                  top: BorderSide(
                    color: colorScheme.outlineVariant.withValues(alpha: 0.7),
                  ),
                ),
              ),
              child: TaxNavButtons(
                onBack: _goBack,
                onSkip: _goForward,
                onNext: _saveAndNext,
                nextLabel: _currentStep == _totalSteps - 1
                    ? 'Save & Finish'
                    : 'Save & Next',
                showSkip: _currentStep != _totalSteps - 1,
                isLoading: _isSaving,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStepWrapper({
    required String title,
    required String subtitle,
    required IconData icon,
    required List<Widget> children,
  }) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      children: [
        TaxSectionTitle(icon: icon, title: title, subtitle: subtitle),
        const SizedBox(height: 20),
        ...children,
      ],
    );
  }

  Widget _buildStep1(ColorScheme colorScheme) {
    final stateOptions = organizationControllerInstance.states
        .map((state) => state.name)
        .where((name) => name.trim().isNotEmpty)
        .toList();

    return _buildStepWrapper(
      icon: Icons.gavel_rounded,
      title: 'Legal and Tax Identity',
      subtitle: 'Start with the basics that shape your filing strategy.',
      children: [
        _singleChoiceQuestion(
          icon: Icons.badge_rounded,
          title: 'How do you file your personal tax return?',
          description:
              'This helps match your business income to the right filing context.',
          example:
              'Example: Married Filing Jointly if you file one return with your spouse.',
          options: filingStatusOptions,
          selected: _filingStatus,
          onChanged: (value) => setState(() => _filingStatus = value),
        ),
        _questionCard(
          icon: Icons.map_rounded,
          title: 'What is your primary business state?',
          description:
              'Use the state where the business mainly operates or files taxes.',
          example:
              'Example: California if most revenue and operations are there.',
          child: stateOptions.isEmpty
              ? AppTextField(
                  controller: _stateController,
                  hintText: 'e.g. California, Texas',
                  maxLines: 1,
                )
              : CustomDropDownWidget<String>(
                  dropDownKey: _stateKey,
                  hint: 'Select state',
                  showSearchBox: true,
                  items: stateOptions,
                  selectedItem: _stateController.text.trim().isEmpty
                      ? null
                      : _stateController.text.trim(),
                  onChanged: (value) {
                    setState(() => _stateController.text = value ?? '');
                  },
                ),
        ),
        _singleChoiceQuestion(
          icon: Icons.home_rounded,
          title: 'What is your U.S. residency status?',
          description: 'Residency affects which income and deductions apply.',
          example:
              'Example: Resident Alien if you meet the IRS substantial presence test.',
          options: residencyStatusOptions,
          selected: _residencyStatus,
          onChanged: (value) => setState(() => _residencyStatus = value),
        ),
        _yesNoQuestion(
          icon: Icons.travel_explore_rounded,
          title: 'Do you operate, work, or own property in multiple states?',
          description:
              'Multi-state activity can create extra filing and deduction rules.',
          example:
              'Example: You live in Texas but earn client revenue in California.',
          value: _multiStateActivity,
          onChanged: (value) => setState(() => _multiStateActivity = value),
        ),
      ],
    );
  }

  Widget _buildStep2(ColorScheme colorScheme) {
    return _buildStepWrapper(
      icon: Icons.account_balance_wallet_rounded,
      title: 'Income and Entity Profile',
      subtitle:
          'Show how money enters the business so we can spot entity-level opportunities.',
      children: [
        _multiChoiceQuestion(
          icon: Icons.payments_rounded,
          title: 'Which income types describe you?',
          description:
              'Select every source that materially contributes to your income.',
          example: 'Example: 1099 Contractor plus Single-Member LLC.',
          options: incomeTypeOptions,
          selected: _primaryIncomeTypes,
          onChanged: (value) => setState(() => _primaryIncomeTypes = value),
        ),
        _questionCard(
          icon: Icons.storefront_rounded,
          title: 'What industry or niche best describes the business?',
          description:
              'Specific niches help us tailor deduction examples and benchmarks.',
          example:
              'Example: Mobile detailing, bookkeeping, SaaS consulting, or real estate.',
          child: AppTextField(
            controller: _industryController,
            hintText: 'e.g. Software consulting',
            maxLines: 1,
          ),
        ),
        _multiChoiceQuestion(
          icon: Icons.trending_up_rounded,
          title: 'Do you have passive or investment income?',
          description:
              'These streams may qualify for separate planning strategies.',
          example: 'Example: Rental income and capital gains from stock sales.',
          options: passiveIncomeOptions,
          selected: _passiveIncome,
          onChanged: (value) => setState(() => _passiveIncome = value),
        ),
      ],
    );
  }

  Widget _buildStep3(ColorScheme colorScheme) {
    return _buildStepWrapper(
      icon: Icons.business_center_rounded,
      title: 'Operations and Payroll',
      subtitle: 'Document the people and accounting setup behind the business.',
      children: [
        _multiChoiceQuestion(
          icon: Icons.groups_rounded,
          title: 'Who helps run the business?',
          description:
              'Team structure can unlock payroll, family employment, and contractor strategies.',
          example:
              'Example: Solo Operator with 1099 contractors during busy months.',
          options: teamStructureOptions,
          selected: _teamStructure,
          onChanged: (value) => setState(() => _teamStructure = value),
        ),
        _singleChoiceQuestion(
          icon: Icons.receipt_long_rounded,
          title: 'Which accounting method do you use?',
          description:
              'This determines when income and expenses are recognized.',
          example: 'Example: Cash Basis if you record income when paid.',
          options: accountingMethodOptions,
          selected: _accountingMethod,
          onChanged: (value) => setState(() => _accountingMethod = value),
        ),
        _yesNoQuestion(
          icon: Icons.precision_manufacturing_rounded,
          title: 'Did you buy major equipment over \$2,500 this year?',
          description:
              'Large purchases may qualify for Section 179 or bonus depreciation.',
          example:
              'Example: Cameras, machinery, servers, or specialized tools.',
          value: _majorEquipment,
          onChanged: (value) => setState(() => _majorEquipment = value),
        ),
      ],
    );
  }

  Widget _buildStep4(ColorScheme colorScheme) {
    return _buildStepWrapper(
      icon: Icons.directions_car_rounded,
      title: 'Vehicle and Travel Use',
      subtitle:
          'Vehicle deductions can be significant when usage is documented clearly.',
      children: [
        _singleChoiceQuestion(
          icon: Icons.car_rental_rounded,
          title: 'How is your business vehicle owned or leased?',
          description:
              'Ownership affects depreciation, lease deductions, and reimbursements.',
          example:
              'Example: Company Owned if the vehicle is titled to the business.',
          options: vehicleOwnershipOptions,
          selected: _vehicleOwnership,
          onChanged: (value) => setState(() => _vehicleOwnership = value),
        ),
        _singleChoiceQuestion(
          icon: Icons.route_rounded,
          title: 'How do you usually deduct vehicle use?',
          description: 'Choose the method closest to your records today.',
          example:
              'Example: Standard Mileage Rate if you track business miles.',
          options: vehicleUsageOptions,
          selected: _vehicleUsage,
          onChanged: (value) => setState(() => _vehicleUsage = value),
        ),
        _yesNoQuestion(
          icon: Icons.local_shipping_rounded,
          title: 'Is the vehicle over 6,000 pounds?',
          description:
              'Heavy vehicles can qualify for larger depreciation deductions.',
          example:
              'Example: Many work trucks and larger SUVs exceed this threshold.',
          value: _vehicleOver6kLbs,
          onChanged: (value) => setState(() => _vehicleOver6kLbs = value),
        ),
      ],
    );
  }

  Widget _buildStep5(ColorScheme colorScheme) {
    return _buildStepWrapper(
      icon: Icons.home_work_rounded,
      title: 'Workspace and Digital Tools',
      subtitle:
          'Capture your office setup and technology that supports the business.',
      children: [
        _singleChoiceQuestion(
          icon: Icons.desk_rounded,
          title: 'What kind of workspace do you use at home or off-site?',
          description:
              'Exclusive-use workspace can change home office eligibility.',
          example:
              'Example: Dedicated Room if the room is used only for business.',
          options: homeOfficeTypeOptions,
          selected: _homeOfficeType,
          onChanged: (value) => setState(() => _homeOfficeType = value),
        ),
        _singleChoiceQuestion(
          icon: Icons.house_rounded,
          title: 'What is your home ownership status?',
          description:
              'Rent, mortgage, and ownership can affect the available calculation method.',
          example:
              'Example: Rent if your business uses part of a rented apartment.',
          options: homeStatusOptions,
          selected: _homeStatus,
          onChanged: (value) => setState(() => _homeStatus = value),
        ),
        _multiChoiceQuestion(
          icon: Icons.devices_rounded,
          title: 'Which technology costs support your business?',
          description:
              'Select recurring or meaningful digital expenses used for work.',
          example:
              'Example: Home Internet for Business and premium software subscriptions.',
          options: techUsageOptions,
          selected: _techUsage,
          onChanged: (value) => setState(() => _techUsage = value),
        ),
      ],
    );
  }

  Widget _buildStep6(ColorScheme colorScheme) {
    return _buildStepWrapper(
      icon: Icons.apartment_rounded,
      title: 'Real Estate Strategy',
      subtitle:
          'Real estate can create powerful deductions when ownership and use are clear.',
      children: [
        _multiChoiceQuestion(
          icon: Icons.location_city_rounded,
          title: 'Which real estate interests apply to you?',
          description:
              'Select every property type connected to your household or business.',
          example: 'Example: Primary Residence plus Short-Term Rental.',
          options: realEstateInterestOptions,
          selected: _realEstateInterests,
          onChanged: (value) => setState(() => _realEstateInterests = value),
        ),
        _yesNoQuestion(
          icon: Icons.event_seat_rounded,
          title: 'Do you host business meetings or corporate minutes at home?',
          description: 'This can point to Augusta Rule planning opportunities.',
          example:
              'Example: Renting your home to your business for board meetings.',
          value: _hostsBusinessMeetings,
          onChanged: (value) => setState(() => _hostsBusinessMeetings = value),
        ),
      ],
    );
  }

  Widget _buildStep7(ColorScheme colorScheme) {
    return _buildStepWrapper(
      icon: Icons.favorite_rounded,
      title: 'Household Benefits',
      subtitle:
          'Health and family expenses often hide overlooked tax opportunities.',
      children: [
        _singleChoiceQuestion(
          icon: Icons.health_and_safety_rounded,
          title: 'How is your health insurance set up?',
          description:
              'Insurance type affects self-employed health deductions and HSA eligibility.',
          example: 'Example: Marketplace plan if you buy coverage through ACA.',
          options: healthInsuranceOptions,
          selected: _healthInsurance,
          onChanged: (value) => setState(() => _healthInsurance = value),
        ),
        _multiChoiceQuestion(
          icon: Icons.savings_rounded,
          title: 'Which health savings accounts do you use?',
          description:
              'These accounts may create above-the-line or payroll tax advantages.',
          example: 'Example: HSA Contributor if you fund an HSA with an HDHP.',
          options: healthSavingsOptions,
          selected: _healthSavings,
          onChanged: (value) => setState(() => _healthSavings = value),
        ),
        _multiChoiceQuestion(
          icon: Icons.school_rounded,
          title: 'Which education or family costs apply?',
          description:
              'Family-related costs can inform credits, reimbursements, or payroll strategies.',
          example: 'Example: Child in daycare and paying student loans.',
          options: familyEducationOptions,
          selected: _familyEducation,
          onChanged: (value) => setState(() => _familyEducation = value),
        ),
      ],
    );
  }

  Widget _buildStep8(ColorScheme colorScheme) {
    return _buildStepWrapper(
      icon: Icons.auto_awesome_rounded,
      title: 'Strategy Goals',
      subtitle:
          'Align recommendations with how much savings, growth, and risk you want.',
      children: [
        _singleChoiceQuestion(
          icon: Icons.flag_rounded,
          title: 'What is your primary tax goal right now?',
          description:
              'This keeps recommendations focused on the outcome you value most.',
          example: 'Example: Business Growth if you want to reinvest savings.',
          options: taxGoalOptions,
          selected: _taxGoal,
          onChanged: (value) => setState(() => _taxGoal = value),
        ),
        _multiChoiceQuestion(
          icon: Icons.elderly_rounded,
          title: 'Which retirement strategies are already in place?',
          description:
              'Existing plans help us avoid duplicate or conflicting recommendations.',
          example:
              'Example: Solo 401k/SEP IRA if you have a self-employed retirement plan.',
          options: retirementCurrentOptions,
          selected: _retirementCurrent,
          onChanged: (value) => setState(() => _retirementCurrent = value),
        ),
        _singleChoiceQuestion(
          icon: Icons.verified_user_rounded,
          title: 'How aggressive should the strategy be?',
          description:
              'Choose the risk posture you are comfortable documenting and defending.',
          example:
              'Example: Conservative if audit protection matters more than maximum savings.',
          options: auditAppetiteOptions,
          selected: _auditAppetite,
          onChanged: (value) => setState(() => _auditAppetite = value),
        ),
      ],
    );
  }

  Widget _buildStep9(ColorScheme colorScheme) {
    return _buildStepWrapper(
      icon: Icons.calculate_rounded,
      title: 'Deduction Percentages',
      subtitle:
          'Use practical percentages to estimate mixed personal and business use.',
      children: [
        _questionCard(
          icon: Icons.square_foot_rounded,
          title: 'How large is your home and dedicated office?',
          description:
              'This estimates the business-use percentage of your home.',
          example:
              'Example: 2,000 sqft home with a 200 sqft office equals about 10%.',
          child: Column(
            children: [
              AppTextField(
                hintText: 'Total home area (sqft)',
                controller: _totalHouseAreaController,
                keyboardType: TextInputType.number,
                inputFormatters: acceptDecimalValues(),
              ),
              const SizedBox(height: 10),
              AppTextField(
                hintText: 'Dedicated office area (sqft)',
                controller: _dedicatedOfficeAreaController,
                keyboardType: TextInputType.number,
                inputFormatters: acceptDecimalValues(),
              ),
            ],
          ),
        ),
        _sliderQuestion(
          icon: Icons.directions_car_filled_rounded,
          title: 'What percentage of vehicle use is business related?',
          description:
              'Estimate the business share based on mileage or usage logs.',
          example:
              'Example: 65% if 6,500 of 10,000 annual miles are business miles.',
          value: _vehiclePercent,
          onChanged: (value) => setState(() => _vehiclePercent = value),
        ),
        _sliderQuestion(
          icon: Icons.electrical_services_rounded,
          title: 'What percentage of utilities support the business?',
          description:
              'Use a practical split for internet, power, and other shared utilities.',
          example: 'Example: 20% if one room is used consistently for work.',
          value: _utilityPercent,
          onChanged: (value) => setState(() => _utilityPercent = value),
        ),
        _sliderQuestion(
          icon: Icons.restaurant_rounded,
          title: 'What percentage of meals are business related?',
          description:
              'Estimate only meals tied to client, team, or business travel activity.',
          example:
              'Example: 30% if most meals are personal but some are client meetings.',
          value: _mealPercent,
          onChanged: (value) => setState(() => _mealPercent = value),
        ),
      ],
    );
  }

  Widget _buildStep10(ColorScheme colorScheme) {
    return _buildStepWrapper(
      icon: Icons.inventory_2_rounded,
      title: 'Equipment and Debt',
      subtitle:
          'Finish with major equipment costs and any business liabilities.',
      children: [
        _questionCard(
          icon: Icons.construction_rounded,
          title: 'How much did you spend on business equipment this year?',
          description:
              'Enter the total cost of equipment, tools, hardware, or machinery bought for business use.',
          example:
              'Example: \$4,800 for a laptop, camera gear, and job-site tools.',
          child: AppTextField(
            controller: _equipmentCostController,
            hintText: '0',
            keyboardType: TextInputType.number,
            inputFormatters: acceptDecimalValues(),
            prefixWidget: const Icon(Icons.attach_money_rounded),
          ),
        ),
        _questionCard(
          icon: Icons.account_balance_rounded,
          title: 'Does your business owe money to anyone?',
          description:
              'Enter balances for each debt category that applies. Leave blank or 0 if none.',
          example:
              'Example: \$12,000 SBA loan and \$3,500 business credit card balance.',
          child: Column(
            children: [
              for (final category in _debtCategories) ...[
                _debtField(category.value, _debtControllers[category.key]!),
                if (category != _debtCategories.last)
                  const SizedBox(height: 10),
              ],
            ],
          ),
        ),
        _completionBanner(colorScheme),
      ],
    );
  }

  Widget _singleChoiceQuestion({
    required IconData icon,
    required String title,
    required String description,
    required String example,
    required List<String> options,
    required String? selected,
    required ValueChanged<String?> onChanged,
  }) {
    return _questionCard(
      icon: icon,
      title: title,
      description: description,
      example: example,
      child: Wrap(
        spacing: 10,
        runSpacing: 10,
        children: options.map((option) {
          return _choicePill(
            label: option,
            isSelected: selected == option,
            onTap: () => onChanged(option),
          );
        }).toList(),
      ),
    );
  }

  Widget _multiChoiceQuestion({
    required IconData icon,
    required String title,
    required String description,
    required String example,
    required List<String> options,
    required List<String> selected,
    required ValueChanged<List<String>> onChanged,
  }) {
    return _questionCard(
      icon: icon,
      title: title,
      description: '$description Select all that apply.',
      example: example,
      child: Wrap(
        spacing: 10,
        runSpacing: 10,
        children: options.map((option) {
          final isSelected = selected.contains(option);
          return _choicePill(
            label: option,
            isSelected: isSelected,
            onTap: () {
              final next = [...selected];
              if (isSelected) {
                next.remove(option);
              } else {
                next.add(option);
              }
              onChanged(next);
            },
          );
        }).toList(),
      ),
    );
  }

  Widget _yesNoQuestion({
    required IconData icon,
    required String title,
    required String description,
    required String example,
    required bool? value,
    required ValueChanged<bool> onChanged,
  }) {
    return _questionCard(
      icon: icon,
      title: title,
      description: description,
      example: example,
      child: YesNoToggle(value: value, onChanged: onChanged),
    );
  }

  Widget _sliderQuestion({
    required IconData icon,
    required String title,
    required String description,
    required String example,
    required double value,
    required ValueChanged<double> onChanged,
  }) {
    return _questionCard(
      icon: icon,
      title: title,
      description: description,
      example: example,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              AppText(
                '${value.round()}%',
                fontSize: 22,
                fontWeight: FontWeight.bold,
              ),
              const Spacer(),
              AppText(
                '0 - 100%',
                fontSize: 12,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ],
          ),
          Slider(
            value: value.clamp(0, 100),
            min: 0,
            max: 100,
            divisions: 100,
            label: '${value.round()}%',
            onChanged: onChanged,
          ),
        ],
      ),
    );
  }

  Widget _questionCard({
    required IconData icon,
    required String title,
    required String description,
    required String example,
    required Widget child,
  }) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: colorScheme.outlineVariant),
        boxShadow: [
          BoxShadow(
            color: colorScheme.shadow.withValues(alpha: 0.04),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: colorScheme.primaryContainer,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Icon(icon, color: colorScheme.onPrimaryContainer),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AppText(
                      title,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: colorScheme.onSurface,
                    ),
                    const SizedBox(height: 6),
                    AppText(
                      description,
                      fontSize: 13,
                      color: colorScheme.onSurfaceVariant,
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: colorScheme.secondaryContainer.withValues(alpha: 0.55),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  Icons.tips_and_updates_rounded,
                  color: colorScheme.onSecondaryContainer,
                  size: 18,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: AppText(
                    example,
                    fontSize: 12,
                    color: colorScheme.onSecondaryContainer,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          child,
        ],
      ),
    );
  }

  Widget _choicePill({
    required String label,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    final colorScheme = Theme.of(context).colorScheme;
    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: isSelected
              ? colorScheme.primary
              : colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: isSelected
                ? colorScheme.primary
                : colorScheme.outlineVariant,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (isSelected) ...[
              Icon(Icons.check_rounded, color: colorScheme.onPrimary, size: 16),
              const SizedBox(width: 6),
            ],
            AppText(
              label,
              fontSize: 13,
              fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
              color: isSelected
                  ? colorScheme.onPrimary
                  : colorScheme.onSurfaceVariant,
            ),
          ],
        ),
      ),
    );
  }

  Widget _debtField(String label, TextEditingController controller) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AppText(label, fontSize: 13, fontWeight: FontWeight.w600),
        const SizedBox(height: 6),
        AppTextField(
          controller: controller,
          hintText: '0',
          keyboardType: TextInputType.number,
          inputFormatters: acceptDecimalValues(),
          prefixWidget: const Icon(Icons.attach_money_rounded),
        ),
      ],
    );
  }

  Widget _completionBanner(ColorScheme colorScheme) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            colorScheme.primary.withValues(alpha: 0.16),
            colorScheme.tertiary.withValues(alpha: 0.10),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: colorScheme.primary.withValues(alpha: 0.25)),
      ),
      child: Row(
        children: [
          Icon(Icons.celebration_rounded, color: colorScheme.primary, size: 30),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AppText(
                  'Almost done',
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: colorScheme.primary,
                ),
                const SizedBox(height: 4),
                AppText(
                  'Save this final step and your AI tax strategy can use the full business profile.',
                  fontSize: 12,
                  color: colorScheme.onSurfaceVariant,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
