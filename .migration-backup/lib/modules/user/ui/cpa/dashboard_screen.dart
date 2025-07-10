import 'package:booksmart/models/user_base_model.dart';
import 'package:booksmart/modules/user/ui/cpa/cpa_list_screen.dart';
import '../../../admin/controllers/cpa_controller.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../../../widgets/app_text.dart';
import 'components/cpa_card.dart';

class CpaNetworkScreen extends StatefulWidget {
  const CpaNetworkScreen({super.key});

  @override
  State<CpaNetworkScreen> createState() => _CpaNetworkScreenState();
}

class _CpaNetworkScreenState extends State<CpaNetworkScreen> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Get.theme.colorScheme;
    final isDark = Get.theme.brightness == Brightness.dark;
    final size = MediaQuery.of(context).size;
    final isDesktop = size.width >= 1000;
    final isTablet = size.width >= 600 && size.width < 1000;

    return GetBuilder<AdminCpaController>(
      init: AdminCpaController(),
      builder: (controller) {
        return Scaffold(
          body: SingleChildScrollView(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Top Section (Header + USA Map illustration side-by-side on desktop)
                if (isDesktop)
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        flex: 3,
                        child: _buildHeaderAndSearch(scheme, isDark),
                      ),
                      const SizedBox(width: 40),
                      Expanded(
                        flex: 1,
                        child: _buildUSAMapWidget(
                          scheme,
                          isDark,
                          controller.approvedCpas,
                        ),
                      ),
                    ],
                  )
                else ...[
                  _buildHeaderAndSearch(scheme, isDark),
                  const SizedBox(height: 20),
                  _buildUSAMapWidget(scheme, isDark, controller.approvedCpas),
                ],

                const SizedBox(height: 30),

                // Horizontal Stats Row
                _buildStatsRow(
                  scheme,
                  isDark,
                  isDesktop,
                  isTablet,
                  controller.approvedCpas,
                ),

                const SizedBox(height: 40),

                // Top Rated CPAs header
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const AppText(
                          "Top Rated CPAs",
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                        const SizedBox(height: 4),
                        AppText(
                          "Trusted by business owners like you.",
                          fontSize: 14,
                          color: Colors.grey.shade600,
                        ),
                      ],
                    ),
                    TextButton.icon(
                      onPressed: () => goToCpaListScreen(),
                      icon: const Icon(Icons.arrow_forward),
                      label: const Text("View All CPAs"),
                    ),
                  ],
                ),

                const SizedBox(height: 20),

                // Top Rated CPAs list/grid
                // (existing GetBuilder content remains unchanged)
                GetBuilder<AdminCpaController>(
                  init: AdminCpaController(),
                  builder: (controller) {
                    if (controller.isLoading) {
                      return const Center(
                        child: Padding(
                          padding: EdgeInsets.symmetric(vertical: 40),
                          child: CircularProgressIndicator(),
                        ),
                      );
                    }

                    if (controller.approvedCpas.isEmpty) {
                      return const Center(
                        child: Padding(
                          padding: EdgeInsets.symmetric(vertical: 40),
                          child: Text("No CPAs available"),
                        ),
                      );
                    }

                    final cpas = controller.approvedCpas.take(3).toList();

                    if (isDesktop) {
                      return Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: CpaCard(cpa: cpas[0], isTopMatch: true),
                          ),
                          if (cpas.length > 1) ...[
                            const SizedBox(width: 20),
                            Expanded(child: CpaCard(cpa: cpas[1])),
                          ],
                          if (cpas.length > 2) ...[
                            const SizedBox(width: 20),
                            Expanded(child: CpaCard(cpa: cpas[2])),
                          ],
                        ],
                      );
                    } else if (isTablet) {
                      return Wrap(
                        spacing: 20,
                        runSpacing: 20,
                        children: [
                          SizedBox(
                            width: (size.width - 68) / 2,
                            child: CpaCard(cpa: cpas[0], isTopMatch: true),
                          ),
                          if (cpas.length > 1)
                            SizedBox(
                              width: (size.width - 68) / 2,
                              child: CpaCard(cpa: cpas[1]),
                            ),
                          if (cpas.length > 2)
                            SizedBox(
                              width: (size.width - 68) / 2,
                              child: CpaCard(cpa: cpas[2]),
                            ),
                        ],
                      );
                    } else {
                      return Column(
                        children: cpas.map((cpa) {
                          final isFirst = cpas.indexOf(cpa) == 0;
                          return CpaCard(cpa: cpa, isTopMatch: isFirst);
                        }).toList(),
                      );
                    }
                  },
                ),

                const SizedBox(height: 40),

                // Browse by Specialty section
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const AppText(
                      "Browse by Specialty",
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                    TextButton.icon(
                      onPressed: () => goToCpaListScreen(),
                      icon: const Icon(Icons.arrow_forward),
                      label: const Text("View All Specialties"),
                    ),
                  ],
                ),

                const SizedBox(height: 20),

                // Specialties Grid
                _buildSpecialtiesGrid(
                  scheme,
                  isDark,
                  isDesktop,
                  isTablet,
                  controller.approvedCpas,
                ),

                const SizedBox(height: 50),

                // Bottom value prop footer
                _buildBottomFooter(scheme, isDark, isDesktop),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildHeaderAndSearch(ColorScheme scheme, bool isDark) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const AppText("CPA Network", fontSize: 32, fontWeight: FontWeight.bold),
        const SizedBox(height: 8),
        AppText(
          "Connect with trusted CPAs who understand your goals and help you grow.",
          fontSize: 15,
          color: Colors.grey.shade600,
        ),
        const SizedBox(height: 24),

        // Search Bar Row
        Row(
          children: [
            Expanded(
              child: Container(
                decoration: BoxDecoration(
                  color: isDark ? scheme.surfaceContainerHigh : Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(
                        alpha: isDark ? 0.2 : 0.05,
                      ),
                      blurRadius: 8,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: TextField(
                  controller: _searchController,
                  decoration: const InputDecoration(
                    hintText:
                        "Search by name, specialty, industry, or location...",
                    border: InputBorder.none,
                    contentPadding: EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 14,
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Container(
              height: 48,
              width: 48,
              decoration: BoxDecoration(
                color: Colors.amber.shade600,
                borderRadius: BorderRadius.circular(12),
              ),
              child: IconButton(
                onPressed: () {
                  goToCpaListScreen();
                },
                icon: const Icon(Icons.search, color: Colors.white),
              ),
            ),
          ],
        ),

        const SizedBox(height: 16),

        // Quick filter pills
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              _buildFilterChip("All Specialties", scheme, isDark),
              _buildFilterChip("Location", scheme, isDark),
              _buildFilterChip("Industry", scheme, isDark),
              _buildFilterChip("Pricing", scheme, isDark),
              _buildFilterChip("More Filters", scheme, isDark, isLast: true),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildFilterChip(
    String label,
    ColorScheme scheme,
    bool isDark, {
    bool isLast = false,
  }) {
    return InkWell(
      onTap: () => goToCpaListScreen(),
      child: Container(
        margin: const EdgeInsets.only(right: 8),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: isDark ? scheme.surfaceContainerHigh : Colors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: scheme.outlineVariant.withValues(alpha: 0.5),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppText(label, fontSize: 13, fontWeight: FontWeight.w500),
            const SizedBox(width: 4),
            Icon(
              isLast ? Icons.tune : Icons.keyboard_arrow_down,
              size: 16,
              color: Colors.grey,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildUSAMapWidget(
    ColorScheme scheme,
    bool isDark,
    List<CpaModel> cpas,
  ) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark
            ? scheme.surfaceContainerLow
            : Colors.amber.shade50.withValues(alpha: 0.3),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.amber.shade200.withValues(alpha: 0.5)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    // Stack of user avatars
                    SizedBox(
                      width: 70,
                      height: 32,
                      child: Stack(
                        children: [
                          Positioned(
                            left: 0,
                            child: CircleAvatar(
                              radius: 14,
                              backgroundColor: scheme.primary,
                              child: const Text(
                                "A",
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 10,
                                ),
                              ),
                            ),
                          ),
                          Positioned(
                            left: 16,
                            child: CircleAvatar(
                              radius: 14,
                              backgroundColor: scheme.secondary,
                              child: const Text(
                                "J",
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 10,
                                ),
                              ),
                            ),
                          ),
                          Positioned(
                            left: 32,
                            child: CircleAvatar(
                              radius: 14,
                              backgroundColor: Colors.teal,
                              child: const Text(
                                "S",
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 10,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          AppText(
                            cpas.length.toString(),
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                          ),
                          AppText(
                            "Available Nationwide",
                            fontSize: 11,
                            color: Colors.grey.shade600,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatsRow(
    ColorScheme scheme,
    bool isDark,
    bool isDesktop,
    bool isTablet,
    List<CpaModel> cpas,
  ) {
    // Compute dynamic stats
    final totalCpas = cpas.length.toString();
    final Set<String> stateSet = {};
    for (final cpa in cpas) {
      stateSet.addAll(cpa.stateFocuses);
    }
    final statesCovered = stateSet.length.toString();
    final stats = [
      {
        "icon": Icons.people_outline,
        "value": totalCpas,
        "label": "CPAs Available",
      },
      {
        "icon": Icons.map_outlined,
        "value": statesCovered,
        "label": "States Covered",
      },
      {"icon": Icons.star_outline, "value": "4.9", "label": "Average Rating"},
      {"icon": Icons.access_time, "value": "24hr", "label": "Avg. Response"},
      {
        "icon": Icons.verified_user_outlined,
        "value": "100%",
        "label": "Verified CPAs",
      },
    ];

    if (isDesktop) {
      return Container(
        padding: const EdgeInsets.symmetric(vertical: 20),
        decoration: BoxDecoration(
          color: isDark ? scheme.surfaceContainerHigh : Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.03),
              blurRadius: 10,
            ),
          ],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: stats.map((stat) => _buildStatItem(stat, scheme)).toList(),
        ),
      );
    } else {
      return GridView.count(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        crossAxisCount: isTablet ? 3 : 2,
        childAspectRatio: 2.2,
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        children: stats.map((stat) {
          return Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: isDark ? scheme.surfaceContainerHigh : Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: scheme.outlineVariant.withValues(alpha: 0.3),
              ),
            ),
            child: _buildStatItem(stat, scheme),
          );
        }).toList(),
      );
    }
  }

  // Updated: Removed static stats and specialties definitions; will compute dynamically in GetBuilder.
  // The methods will now accept controller data.
}

Widget _buildStatItem(Map<String, dynamic> stat, ColorScheme scheme) {
  return Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      CircleAvatar(
        backgroundColor: scheme.primary.withValues(alpha: 0.08),
        child: Icon(stat["icon"] as IconData, color: scheme.primary, size: 20),
      ),
      const SizedBox(width: 12),
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          AppText(
            stat["value"] as String,
            fontSize: 16,
            fontWeight: FontWeight.bold,
          ),
          AppText(
            stat["label"] as String,
            fontSize: 12,
            color: Colors.grey.shade600,
          ),
        ],
      ),
    ],
  );
}

Widget _buildSpecialtiesGrid(
  ColorScheme scheme,
  bool isDark,
  bool isDesktop,
  bool isTablet,
  List<CpaModel> cpas,
) {
  // Define static list of specialty metadata (icon, title, color)
  final specialtyMeta = [
    {
      "icon": Icons.analytics_outlined,
      "title": "Tax Planning",
      "color": Colors.indigo,
    },
    {
      "icon": Icons.menu_book_outlined,
      "title": "Bookkeeping",
      "color": Colors.purple,
    },
    {
      "icon": Icons.lightbulb_outline,
      "title": "Business Advisory",
      "color": Colors.orange,
    },
    {
      "icon": Icons.payments_outlined,
      "title": "Payroll Services",
      "color": Colors.amber,
    },
    {
      "icon": Icons.gavel_outlined,
      "title": "Audit & Assurance",
      "color": Colors.green,
    },
    {
      "icon": Icons.badge_outlined,
      "title": "Industry Specialists",
      "color": Colors.blue,
    },
  ];

  // Compute counts dynamically
  final specialties = specialtyMeta.map((meta) {
    final count = cpas
        .where((c) => c.specialties.contains(meta["title"]))
        .length;
    return {
      "icon": meta["icon"],
      "title": meta["title"],
      "count": "${count.toString()} CPAs",
      "color": meta["color"],
    };
  }).toList();

  return GridView.builder(
    shrinkWrap: true,
    physics: const NeverScrollableScrollPhysics(),
    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
      crossAxisCount: isDesktop ? 6 : (isTablet ? 3 : 2),
      crossAxisSpacing: 16,
      mainAxisSpacing: 16,
      childAspectRatio: 1.1,
    ),
    itemCount: specialties.length,
    itemBuilder: (context, index) {
      final item = specialties[index];
      final color = item["color"] as Color;
      return InkWell(
        onTap: () => goToCpaListScreen(),
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: isDark ? scheme.surfaceContainerHigh : Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: scheme.outlineVariant.withValues(alpha: 0.3),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.02),
                blurRadius: 8,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              CircleAvatar(
                backgroundColor: color.withValues(alpha: 0.1),
                child: Icon(item["icon"] as IconData, color: color, size: 20),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AppText(
                    item["title"] as String,
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                  ),
                  const SizedBox(height: 2),
                  AppText(
                    item["count"] as String,
                    fontSize: 11,
                    color: Colors.grey,
                  ),
                ],
              ),
            ],
          ),
        ),
      );
    },
  );
}

Widget _buildBottomFooter(ColorScheme scheme, bool isDark, bool isDesktop) {
  final benefits = [
    {
      "icon": Icons.handshake_outlined,
      "title": "Stronger Relationships",
      "desc": "Stay connected with your CPA all year long.",
    },
    {
      "icon": Icons.trending_up,
      "title": "Better Financial Outcomes",
      "desc": "Proactive advice. Smarter decisions. More growth.",
    },
    {
      "icon": Icons.explore_outlined,
      "title": "More Than Taxes",
      "desc": "Strategic guidance for every stage of your financial journey.",
    },
  ];

  if (isDesktop) {
    return Row(
      children: benefits.map((b) {
        final isLast = benefits.indexOf(b) == benefits.length - 1;
        return Expanded(
          child: Row(
            children: [
              Expanded(child: _buildBenefitCard(b, scheme, isDark)),
              if (!isLast) const SizedBox(width: 20),
            ],
          ),
        );
      }).toList(),
    );
  } else {
    return Column(
      children: benefits
          .map(
            (b) => Padding(
              padding: const EdgeInsets.only(bottom: 16.0),
              child: _buildBenefitCard(b, scheme, isDark),
            ),
          )
          .toList(),
    );
  }
}

Widget _buildBenefitCard(
  Map<String, dynamic> b,
  ColorScheme scheme,
  bool isDark,
) {
  return Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: isDark ? scheme.surfaceContainerLow : Colors.grey.shade50,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.3)),
    ),
    child: Row(
      children: [
        CircleAvatar(
          backgroundColor: scheme.primary.withValues(alpha: 0.08),
          child: Icon(b["icon"] as IconData, color: scheme.primary),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AppText(
                b["title"] as String,
                fontSize: 14,
                fontWeight: FontWeight.bold,
              ),
              const SizedBox(height: 4),
              AppText(
                b["desc"] as String,
                fontSize: 12,
                color: Colors.grey.shade600,
              ),
            ],
          ),
        ),
      ],
    ),
  );
}
