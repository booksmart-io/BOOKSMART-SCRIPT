import 'package:booksmart/constant/exports.dart';
import 'package:accordion/accordion.dart';
import 'package:get/get.dart';

class DeductionScreen extends StatelessWidget {
  const DeductionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final textSecondary = isDark
        ? AppColorsDark.textSecondary
        : AppColorsLight.textSecondary;

    return Scaffold(
      appBar: AppBar(title: Text("Review Deductions")),
      backgroundColor: Get.theme.colorScheme.surface,
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              AppText(
                "BookSmart analyzed transactions and\nidentified potential tax deductions.",
                fontSize: 16,
                textAlign: TextAlign.center,
                color: textSecondary.withValues(alpha: 0.8),
              ),
              const SizedBox(height: 12),

              // ✅ Accordion list dynamically
              ...deductions.map((deduction) {
                return _deductionAccordion(
                  context,
                  status: deduction["status"] as bool,
                  icon: deduction["icon"] as IconData,
                  title: deduction["title"] as String,
                  amount: deduction["amount"] as String,
                  children: (deduction["items"] as List<dynamic>)
                      .map(
                        (item) => _deductionItem(
                          context,
                          item["name"] as String,
                          item["amount"] as String,
                          date: item["date"] as String?,
                        ),
                      )
                      .toList(),
                );
              }),
            ],
          ),
        ),
      ),
    );
  }

  Widget _deductionAccordion(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String amount,
    required bool status,
    required List<Widget> children,
  }) {
    final theme = Theme.of(context);
    //final colorScheme = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;

    final cardBackground = isDark
        ? AppColorsDark.surface
        : AppColorsLight.surface;
    final textPrimary = isDark
        ? AppColorsDark.textPrimary
        : AppColorsLight.textPrimary;
    final accentColor = isDark
        ? AppColorsDark.secondary
        : AppColorsLight.secondary;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      child: Accordion(
        disableScrolling: true,
        maxOpenSections: 1,
        contentVerticalPadding: 8,
        headerBackgroundColor: cardBackground,
        contentBackgroundColor: cardBackground,
        rightIcon: Icon(Icons.keyboard_arrow_down, color: accentColor),
        contentBorderRadius: 10,
        headerPadding: const EdgeInsets.symmetric(vertical: 6, horizontal: 14),
        paddingBetweenClosedSections: 0,
        paddingBetweenOpenSections: 0,
        children: [
          AccordionSection(
            isOpen: status,
            leftIcon: Icon(icon, color: accentColor, size: 26),
            headerBackgroundColor: cardBackground,
            header: Row(
              children: [
                Expanded(
                  child: AppText(
                    title,
                    fontSize: 16,
                    fontWeight: FontWeight.w500,
                    color: textPrimary,
                  ),
                ),
                AppText(
                  amount,
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: accentColor,
                ),
              ],
            ),
            content: Column(children: children),
          ),
        ],
      ),
    );
  }

  /// Sub-items inside Accordion
  static Widget _deductionItem(
    BuildContext context,
    String name,
    String amount, {
    String? date,
  }) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;

    final textPrimary = isDark
        ? AppColorsDark.textPrimary
        : AppColorsLight.textPrimary;
    final textSecondary = isDark
        ? AppColorsDark.textSecondary
        : AppColorsLight.textSecondary;
    final accentColor = isDark
        ? AppColorsDark.secondary
        : AppColorsLight.secondary;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 10),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AppText(
                  name,
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                  color: textPrimary,
                ),
                if (date != null)
                  AppText(
                    date,
                    fontSize: 13,
                    color: textSecondary.withValues(alpha: 0.7),
                  ),
              ],
            ),
          ),
          AppText(
            amount,
            fontSize: 15,
            fontWeight: FontWeight.bold,
            color: accentColor,
          ),
        ],
      ),
    );
  }
}
