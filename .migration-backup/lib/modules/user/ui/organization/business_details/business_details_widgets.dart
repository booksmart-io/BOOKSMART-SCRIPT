// Shared widgets used across all 8 US Tax Strategy onboarding screens.
// Import this file in each tax screen instead of importing from screen 1.

import 'package:booksmart/constant/exports.dart';
import 'package:get/get.dart';

/// ─── Progress Bar ────────────────────────────────────────────────────────────
class TaxProgressBar extends StatelessWidget {
  final int current;
  final int total;
  const TaxProgressBar({super.key, required this.current, this.total = 9});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.flag_rounded, size: 16, color: colorScheme.primary),
            const SizedBox(width: 6),
            AppText(
              'Step $current of $total',
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: colorScheme.primary,
            ),
          ],
        ),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: current / total,
            minHeight: 6,
            backgroundColor: colorScheme.surfaceContainerHighest,
            color: colorScheme.primary,
          ),
        ),
      ],
    );
  }
}

/// ─── Section Title Card ───────────────────────────────────────────────────────
class TaxSectionTitle extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  const TaxSectionTitle({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colorScheme.primary.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colorScheme.primary.withValues(alpha: 0.2)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: colorScheme.primary.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: colorScheme.primary, size: 22),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AppText(title, fontSize: 17, fontWeight: FontWeight.bold),
                const SizedBox(height: 4),
                AppText(
                  subtitle,
                  fontSize: 13,
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

/// ─── Yes / No Toggle ─────────────────────────────────────────────────────────
class YesNoToggle extends StatelessWidget {
  final bool? value;
  final ValueChanged<bool> onChanged;
  const YesNoToggle({super.key, required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Row(
      children: [
        TaxToggleChip(
          label: 'Yes',
          isSelected: value == true,
          color: colorScheme.primary,
          onTap: () => onChanged(true),
        ),
        const SizedBox(width: 12),
        TaxToggleChip(
          label: 'No',
          isSelected: value == false,
          color: colorScheme.error,
          onTap: () => onChanged(false),
        ),
      ],
    );
  }
}

/// ─── Individual Toggle Chip ───────────────────────────────────────────────────
class TaxToggleChip extends StatelessWidget {
  final String label;
  final bool isSelected;
  final Color color;
  final VoidCallback onTap;
  const TaxToggleChip({
    super.key,
    required this.label,
    required this.isSelected,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 10),
        decoration: BoxDecoration(
          color: isSelected
              ? color.withValues(alpha: 0.15)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isSelected ? color : Colors.grey.withValues(alpha: 0.4),
            width: isSelected ? 1.5 : 1,
          ),
        ),
        child: AppText(
          label,
          fontSize: 14,
          fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
          color: isSelected ? color : null,
        ),
      ),
    );
  }
}

/// ─── AI Insight Chip ─────────────────────────────────────────────────────────
class TaxInsightChip extends StatelessWidget {
  final String text;
  const TaxInsightChip({super.key, required this.text});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.amber.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.amber.withValues(alpha: 0.4)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.lightbulb_outline, size: 16, color: Colors.amber),
          const SizedBox(width: 8),
          Expanded(
            child: AppText(
              text,
              fontSize: 12,
              color: colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

/// ─── Navigation Buttons ───────────────────────────────────────────────────────
class TaxNavButtons extends StatelessWidget {
  final VoidCallback? onBack;
  final VoidCallback onSkip;
  final VoidCallback onNext;
  final String nextLabel;
  final bool showSkip;
  final bool isLoading;

  const TaxNavButtons({
    super.key,
    this.onBack,
    required this.onSkip,
    required this.onNext,
    this.nextLabel = 'Save & Next',
    this.showSkip = true,
    this.isLoading = false,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Get.theme.colorScheme;
    return Row(
      children: [
        Expanded(
          child: OutlinedButton(
            onPressed: isLoading ? null : onBack,
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
              side: BorderSide(color: colorScheme.outline),
              foregroundColor: colorScheme.onSurface,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
            child: const AppText('Back', fontWeight: FontWeight.w500),
          ),
        ),
        const SizedBox(width: 10),
        if (showSkip) ...[
          Expanded(
            child: OutlinedButton(
              onPressed: isLoading ? null : onSkip,
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                side: BorderSide(color: colorScheme.outline),
                foregroundColor: colorScheme.onSurface,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              child: const AppText('Skip', fontWeight: FontWeight.w500),
            ),
          ),
          const SizedBox(width: 10),
        ],
        Expanded(
          flex: 2,
          child: ElevatedButton(
            onPressed: isLoading ? null : onNext,
            style: ElevatedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
              backgroundColor: colorScheme.primary,
              foregroundColor: colorScheme.onPrimary,
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
            child: isLoading
                ? SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: colorScheme.onPrimary,
                    ),
                  )
                : AppText(
                    nextLabel,
                    color: colorScheme.onPrimary,
                    fontWeight: FontWeight.w600,
                  ),
          ),
        ),
      ],
    );
  }
}
