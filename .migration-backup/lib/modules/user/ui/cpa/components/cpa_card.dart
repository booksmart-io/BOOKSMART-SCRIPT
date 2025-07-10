import 'package:booksmart/widgets/custom_circle_avatar.dart';
import 'package:get/get.dart';
import 'package:booksmart/models/user_base_model.dart';
import 'package:booksmart/modules/common/ui/chat/chat_screen.dart';
import '../../../../../constant/exports.dart';
import '../detail_screen.dart';
import 'package:booksmart/helpers/currency_formatter.dart';

class CpaCard extends StatefulWidget {
  final CpaModel cpa;
  final bool isTopMatch;
  const CpaCard({super.key, required this.cpa, this.isTopMatch = false});

  @override
  State<CpaCard> createState() => _CpaCardState();
}

class _CpaCardState extends State<CpaCard> {
  bool isFavorite = false;

  @override
  Widget build(BuildContext context) {
    final scheme = Get.theme.colorScheme;
    final isDark = Get.theme.brightness == Brightness.dark;
    final cpa = widget.cpa;

    // Generate deterministic dummy ratings/reviews/tags based on ID
    final int idSeed = cpa.id;
    final double rating = 4.5 + ((idSeed * 7) % 5) * 0.1;
    final int reviewsCount = 50 + (idSeed * 13) % 150;
    
    // Derived business name placeholder
    final String businessName = "${cpa.lastName.toUpperCase()} & CO";
    final IconData businessIcon = (idSeed % 3 == 0) 
        ? Icons.insights_outlined 
        : (idSeed % 3 == 1) ? Icons.business_center_outlined : Icons.corporate_fare_outlined;

    // Tags
    final List<String> clientTags = (cpa.specialties.length >= 2) 
        ? cpa.specialties.sublist(0, 2) 
        : ["Small Business", "SaaS", "Real Estate"];

    // Location string
    final String locationStr = cpa.stateFocuses.isNotEmpty
        ? "${cpa.stateFocuses.first} • Virtual & In-Person"
        : "Nationwide • Virtual";

    return Container(
      margin: const EdgeInsets.only(bottom: 20),
      decoration: BoxDecoration(
        color: isDark ? scheme.surfaceContainerLow : Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: widget.isTopMatch
            ? Border.all(color: Colors.amber.shade600, width: 1.5)
            : Border.all(color: scheme.outlineVariant.withValues(alpha: 0.3)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.3 : 0.05),
            blurRadius: 12,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Stack(
        children: [
          // Content
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 10), // Space for badges/actions at top
                
                // Profile & Company Details Row
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Left Column: Avatar & Rating
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        CustomCircleAvatar(
                          imgUrl: cpa.imgUrl,
                          alternateText: cpa.firstName,
                          radius: 36,
                          backgroundColor: scheme.primary.withValues(alpha: 0.1),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.star, color: Colors.amber, size: 14),
                            const SizedBox(width: 2),
                            AppText(
                              rating.toStringAsFixed(1),
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                            ),
                          ],
                        ),
                        AppText(
                          "($reviewsCount reviews)",
                          fontSize: 10,
                          color: Colors.grey,
                        ),
                      ],
                    ),
                    const SizedBox(width: 16),
                    
                    // Right Column: Company Name/Icon, CPA Name, Specialties
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Business Logo Placeholder Row
                          Row(
                            children: [
                              Icon(businessIcon, size: 16, color: scheme.primary),
                              const SizedBox(width: 4),
                              Text(
                                businessName,
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold,
                                  letterSpacing: 1.2,
                                  color: scheme.primary,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          
                          // CPA Name
                          AppText(
                            "${cpa.firstName} ${cpa.lastName}, CPA",
                            fontWeight: FontWeight.bold,
                            fontSize: 16,
                          ),
                          const SizedBox(height: 4),
                          
                          // Specialties
                          Text(
                            cpa.specialties.isNotEmpty
                                ? cpa.specialties.join(" • ").toUpperCase()
                                : "TAX PLANNING • BOOKKEEPING • ADVISORY",
                            style: TextStyle(
                              fontSize: 10,
                              color: Colors.grey.shade600,
                              fontWeight: FontWeight.w500,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                
                const SizedBox(height: 12),
                const Divider(height: 1),
                const SizedBox(height: 12),
                
                // Tags
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: clientTags.map((tag) {
                    return Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
                        borderRadius: BorderRadius.circular(30),
                      ),
                      child: AppText(
                        tag,
                        fontSize: 11,
                        color: scheme.onSurfaceVariant,
                      ),
                    );
                  }).toList(),
                ),
                
                const SizedBox(height: 12),
                
                // Location & Starting Rate Row
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    // Location
                    Row(
                      children: [
                        Icon(Icons.location_on_outlined, size: 14, color: scheme.secondary),
                        const SizedBox(width: 4),
                        AppText(
                          locationStr,
                          fontSize: 12,
                          color: Colors.grey.shade600,
                        ),
                      ],
                    ),
                    
                    // Pricing
                    AppText(
                      "Starting at ${CurrencyUtils.format(cpa.hourlyRate)}/hr",
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                      color: scheme.primary,
                    ),
                  ],
                ),
                
                const SizedBox(height: 16),
                
                // Full Width Action Buttons
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () {
                          goToCpaDetailScreen(cpa);
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: scheme.primary,
                          foregroundColor: scheme.onPrimary,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          elevation: 0,
                        ),
                        child: const Text(
                          "View Profile",
                          style: TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    IconButton.filledTonal(
                      onPressed: () {
                        goToChatScreen(cpa.data, shouldCloseBefore: false);
                      },
                      style: IconButton.styleFrom(
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                        padding: const EdgeInsets.all(12),
                      ),
                      icon: const Icon(Icons.chat_bubble_outline),
                    ),
                  ],
                ),
              ],
            ),
          ),
          
          // TOP MATCH Badge
          if (widget.isTopMatch)
            Positioned(
              top: 10,
              left: 10,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.amber.shade600,
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(10),
                    bottomRight: Radius.circular(10),
                  ),
                ),
                child: const Text(
                  "TOP MATCH",
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.5,
                  ),
                ),
              ),
            ),
            
          // Favorite Icon (Heart)
          Positioned(
            top: 6,
            right: 6,
            child: IconButton(
              icon: Icon(
                isFavorite ? Icons.favorite : Icons.favorite_border,
                color: isFavorite ? Colors.red : Colors.grey,
              ),
              onPressed: () {
                setState(() {
                  isFavorite = !isFavorite;
                });
              },
            ),
          ),
        ],
      ),
    );
  }
}
