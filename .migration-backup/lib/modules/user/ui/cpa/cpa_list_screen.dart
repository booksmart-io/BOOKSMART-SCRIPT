// ignore_for_file: curly_braces_in_flow_control_structures

import 'package:booksmart/models/user_base_model.dart';
import 'package:booksmart/widgets/app_text.dart';
import 'package:dropdown_search/dropdown_search.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../../widgets/custom_dialog.dart';
import '../../../../widgets/custom_drop_down.dart';
import 'components/cpa_card.dart';
import '../../../admin/controllers/cpa_controller.dart';

void goToCpaListScreen({bool shouldCloseBefore = false}) {
  if (kIsWeb) {
    if (shouldCloseBefore) {
      Get.back(); // close previous dialog
    }
    customDialog(
      child: const CpaListScreen(),
      title: 'CPA List',
      barrierDismissible: true,
      maxWidth: 800,
    );
  } else {
    if (shouldCloseBefore) {
      Get.off(() => const CpaListScreen());
    } else {
      Get.to(() => const CpaListScreen());
    }
  }
}

class CpaListScreen extends StatefulWidget {
  const CpaListScreen({super.key});

  @override
  State<CpaListScreen> createState() => _CpaListScreenState();
}

class _CpaListScreenState extends State<CpaListScreen> {
  final TextEditingController searchController = TextEditingController();
  String searchQuery = "";

  final stateDropdownKey = GlobalKey<DropdownSearchState<String>>();
  final specialityDropdownKey = GlobalKey<DropdownSearchState<String>>();
  final ratingDropdownKey = GlobalKey<DropdownSearchState<String>>();
  final experienceDropdownKey = GlobalKey<DropdownSearchState<String>>();
  final pricingDropdownKey = GlobalKey<DropdownSearchState<String>>();

  // Filter State
  String? selectedState;
  String? selectedSpecialty;
  String? selectedRating;
  String? selectedExperience;
  String? selectedPricing;

  @override
  void initState() {
    super.initState();
    searchController.addListener(() {
      setState(() {
        searchQuery = searchController.text;
      });
    });
  }

  @override
  void dispose() {
    searchController.dispose();
    super.dispose();
  }

  void clearFilters() {
    stateDropdownKey.currentState?.clear();
    specialityDropdownKey.currentState?.clear();
    ratingDropdownKey.currentState?.clear();
    experienceDropdownKey.currentState?.clear();
    pricingDropdownKey.currentState?.clear();

    setState(() {
      selectedState = null;
      selectedSpecialty = null;
      selectedRating = null;
      selectedExperience = null;
      selectedPricing = null;
    });
  }

  Future<void> _showFilterDialog() async {
    await customDialog(
      title: "Filter CPAs",
      child: ListView(
        padding: EdgeInsets.all(15),
        shrinkWrap: true,
        children: [
          _buildFilterDropdown(
            label: "State",
            items: ['CA', 'NY', 'TX', 'FL', 'IL'],
            dropDownKey: stateDropdownKey,
            onChanged: (val) => selectedState = val,
            selectedItem: selectedState,
          ),
          const SizedBox(height: 16),
          _buildFilterDropdown(
            label: "Specialty",
            items: [
              'Tax Strategy',
              'Tax Deductions',
              'Business Taxation',
              'Small Business',
              'IRS Audit',
              'Tax Planning',
              'Corporate Tax',
              'International Tax',
              'Estate Planning',
            ],
            dropDownKey: specialityDropdownKey,
            onChanged: (val) => selectedSpecialty = val,
            selectedItem: selectedSpecialty,
          ),
          const SizedBox(height: 16),
          _buildFilterDropdown(
            label: "Rating",
            items: ['4.5+', '4.0+', '3.5+'],
            dropDownKey: ratingDropdownKey,
            onChanged: (val) => selectedRating = val,
            selectedItem: selectedRating,
          ),
          const SizedBox(height: 16),
          _buildFilterDropdown(
            label: "Experience",
            items: ['10+ years', '5+ years', '3+ years'],
            dropDownKey: experienceDropdownKey,
            onChanged: (val) => selectedExperience = val,
            selectedItem: selectedExperience,
          ),
          const SizedBox(height: 16),
          _buildFilterDropdown(
            label: "Pricing",
            items: ['Budget', 'Moderate', 'Premium'],
            dropDownKey: pricingDropdownKey,
            onChanged: (val) => selectedPricing = val,
            selectedItem: selectedPricing,
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton(
                onPressed: () {
                  clearFilters();
                  Get.back();
                },
                child: AppText("Reset", color: Colors.red, fontSize: 14),
              ),
              SizedBox(width: 10),
              TextButton(
                onPressed: () {
                  setState(() {}); // Trigger rebuild to apply filters
                  Get.back();
                },
                child: AppText("Apply", fontSize: 14),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildFilterDropdown({
    required String label,
    required List<String> items,
    required GlobalKey<DropdownSearchState<String>> dropDownKey,
    required Function(String?) onChanged,
    String? selectedItem,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AppText(label, fontWeight: FontWeight.w600, fontSize: 14),
        const SizedBox(height: 8),
        CustomDropDownWidget<String>(
          dropDownKey: dropDownKey,
          label: label,
          hint: "Select $label",
          items: items,
          selectedItem: selectedItem,
          onChanged: onChanged,
        ),
      ],
    );
  }

  bool get isAnyActiveFilter =>
      selectedState != null ||
      selectedSpecialty != null ||
      selectedRating != null ||
      selectedExperience != null ||
      selectedPricing != null;

  List<CpaModel> _filterCpas(List<CpaModel> cpas) {
    return cpas.where((cpa) {
      // 1. Search Query
      if (searchQuery.isNotEmpty) {
        final query = searchQuery.toLowerCase();
        final name = "${cpa.firstName} ${cpa.lastName}".toLowerCase();
        // Also search in bio or specialties if desired
        if (!name.contains(query)) {
          return false;
        }
      }

      // 2. State Filter
      if (selectedState != null && !cpa.stateFocuses.contains(selectedState)) {
        // Assuming stateFocuses holds state codes like 'CA'
        // If not exact match, logic might need adjustment
        return false;
      }

      // 3. Specialty Filter
      if (selectedSpecialty != null &&
          !cpa.specialties.contains(selectedSpecialty)) {
        return false;
      }

      // 4. Rating Filter (Placeholder logic since reviews not fully implemented)
      // if (selectedRating != null) ...

      // 5. Experience Filter
      if (selectedExperience != null) {
        int yearThreshold = 0;
        if (selectedExperience!.contains('10+')) {
          yearThreshold = 10;
        } else if (selectedExperience!.contains('5+'))
          yearThreshold = 5;
        else if (selectedExperience!.contains('3+'))
          yearThreshold = 3;

        if (cpa.getExperienceInYears < yearThreshold) return false;
      }

      // 6. Pricing Filter (Logic based on hourly rate ranges)
      if (selectedPricing != null) {
        if (selectedPricing == 'Budget' && cpa.hourlyRate > 100) return false;
        if (selectedPricing == 'Moderate' &&
            (cpa.hourlyRate <= 100 || cpa.hourlyRate > 250)) {
          return false;
        }
        if (selectedPricing == 'Premium' && cpa.hourlyRate <= 250) return false;
      }

      return true;
    }).toList();
  }

  Widget _buildActiveFilters() {
    if (!isAnyActiveFilter) return const SizedBox();

    final Map<String, VoidCallback> filters = {};
    if (selectedState != null) {
      filters[selectedState!] = () => setState(() => selectedState = null);
    }
    if (selectedSpecialty != null) {
      filters[selectedSpecialty!] = () =>
          setState(() => selectedSpecialty = null);
    }
    if (selectedRating != null) {
      filters[selectedRating!] = () => setState(() => selectedRating = null);
    }
    if (selectedExperience != null) {
      filters[selectedExperience!] = () =>
          setState(() => selectedExperience = null);
    }
    if (selectedPricing != null) {
      filters[selectedPricing!] = () => setState(() => selectedPricing = null);
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      width: double.infinity,
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: filters.entries.map((entry) {
          return Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: Get.theme.colorScheme.primary.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: Get.theme.colorScheme.primary),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                AppText(entry.key, fontSize: 12),
                const SizedBox(width: 4),
                GestureDetector(
                  onTap: entry.value,
                  child: Icon(
                    Icons.close,
                    size: 16,
                    color: Get.theme.colorScheme.primary,
                  ),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Get.theme.colorScheme;
    final isDark = Get.theme.brightness == Brightness.dark;

    return Scaffold(
      appBar: kIsWeb ? null : AppBar(title: const Text("CPAs")),
      body: GetBuilder<AdminCpaController>(
        init: AdminCpaController(),
        builder: (controller) {
          if (controller.isLoading) {
            return const Center(child: CircularProgressIndicator());
          }

          final allCpas = controller.approvedCpas;
          final filteredCpas = _filterCpas(allCpas);

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Search & Filter Header
              Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const AppText(
                              "CPA Network Directory",
                              fontWeight: FontWeight.bold,
                              fontSize: 22,
                            ),
                            const SizedBox(height: 4),
                            AppText(
                              isAnyActiveFilter || searchQuery.isNotEmpty
                                  ? "Showing ${filteredCpas.length} of ${allCpas.length} verified CPAs that fit your preferences."
                                  : "We found ${allCpas.length} verified CPAs that fit your preferences.",
                              fontSize: 12,
                              color: Colors.grey.shade600,
                            ),
                          ],
                        ),
                        IconButton.filledTonal(
                          icon: Badge(
                            isLabelVisible: isAnyActiveFilter,
                            child: const Icon(Icons.filter_list),
                          ),
                          onPressed: _showFilterDialog,
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    
                    // Search bar with magnifying glass button
                    Row(
                      children: [
                        Expanded(
                          child: Container(
                            decoration: BoxDecoration(
                              color: isDark ? scheme.surfaceContainerHigh : Colors.white,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.5)),
                            ),
                            child: TextField(
                              controller: searchController,
                              decoration: const InputDecoration(
                                hintText: "Search CPAs by name, specialties, or states...",
                                border: InputBorder.none,
                                contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          height: 44,
                          width: 44,
                          decoration: BoxDecoration(
                            color: Colors.amber.shade600,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(Icons.search, color: Colors.white),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              _buildActiveFilters(),

              Expanded(
                child: filteredCpas.isEmpty
                    ? const Center(
                        child: Text("No CPAs found matching your criteria."),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        itemCount: filteredCpas.length,
                        itemBuilder: (context, index) {
                          // Make the first one TOP MATCH as in the mockup for visual balance
                          return CpaCard(
                            cpa: filteredCpas[index],
                            isTopMatch: index == 0,
                          );
                        },
                      ),
              ),
            ],
          );
        },
      ),
    );
  }
}
