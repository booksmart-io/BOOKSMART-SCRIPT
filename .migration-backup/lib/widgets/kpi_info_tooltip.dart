import 'package:flutter/material.dart';

const Map<String, String> _kpiTooltipCopyByTitle = {
  'Gross Profit':
      'What you keep after paying to deliver your product or service.\n'
          'Goal: Higher is better.\n'
          'Watch out: Low or negative means you are not covering your core costs.',
  'Margins':
      'How much you keep from every \$1 you make.\n'
          'Good: 20%+\n'
          'Strong: 40%+\n'
          'Watch out: Below 10% means most of your money is being spent.',
  '% Margin':
      'How much you keep from every \$1 you make.\n'
          'Good: 20%+\n'
          'Strong: 40%+\n'
          'Watch out: Below 10% means most of your money is being spent.',
  'Current Ratio':
      'Can you pay your bills soon with what you have right now?\n'
          'Good: 1.5 to 3\n'
          'Watch out: Below 1 means you may not cover short term bills.',
  'Debt / Equity Ratio':
      'How much you owe vs what you own.\n'
          'Good: Below 1\n'
          'Strong: Below 0.5\n'
          'Watch out: Above 2 means heavy reliance on debt.',
  'Return on Equity':
      'How well your money is turning into profit.\n'
          'Good: 10%+\n'
          'Strong: 20%+\n'
          'Watch out: Low or negative means your money is not working well.',
  'Return on Equity (ROE)':
      'How well your money is turning into profit.\n'
          'Good: 10%+\n'
          'Strong: 20%+\n'
          'Watch out: Low or negative means your money is not working well.',
  'Total Assets':
      'Everything your business owns that has value.\n'
          'Goal: Growing over time.\n'
          'Watch out: Flat or shrinking may signal slow growth.',
  'Money In':
      'All the cash coming into your business.\n'
          'Goal: Consistently increasing.\n'
          'Watch out: Drops can signal revenue issues.',
  'Money Out':
      'All the cash leaving your business.\n'
          'Goal: Controlled and aligned with growth.\n'
          'Watch out: Growing faster than Money In reduces profit.',
};

String? kpiTooltipTextForTitle(String title) => _kpiTooltipCopyByTitle[title];

class KpiInfoTooltipIcon extends StatefulWidget {
  const KpiInfoTooltipIcon({
    required this.message,
    required this.semanticLabel,
    super.key,
  });

  final String message;
  final String semanticLabel;

  @override
  State<KpiInfoTooltipIcon> createState() => _KpiInfoTooltipIconState();
}

class _KpiInfoTooltipIconState extends State<KpiInfoTooltipIcon> {
  final GlobalKey<TooltipState> _tooltipKey = GlobalKey<TooltipState>();

  void _showTooltip() {
    _tooltipKey.currentState?.ensureTooltipVisible();
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final backgroundColor = isDark
        ? const Color(0xFF0F1E37)
        : const Color(0xFFF8FAFC);
    final foregroundColor = isDark ? Colors.white : const Color(0xFF0F172A);

    return Semantics(
      label: widget.semanticLabel,
      button: true,
      child: Tooltip(
        key: _tooltipKey,
        richMessage: _buildTooltipSpan(
          _extractTitleFromSemanticLabel(widget.semanticLabel),
          widget.message,
          foregroundColor,
        ),
        waitDuration: const Duration(milliseconds: 220),
        showDuration: const Duration(seconds: 5),
        preferBelow: false,
        margin: const EdgeInsets.symmetric(horizontal: 12),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: backgroundColor,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: isDark
                ? Colors.white.withValues(alpha: 0.12)
                : const Color(0xFFCBD5E1),
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: isDark ? 0.25 : 0.08),
              blurRadius: 14,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        textStyle: TextStyle(
          color: foregroundColor,
          fontSize: 12,
          height: 1.3,
        ),
        child: FocusableActionDetector(
          mouseCursor: SystemMouseCursors.click,
          onShowFocusHighlight: (isFocused) {
            if (isFocused) {
              _showTooltip();
            }
          },
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: _showTooltip,
            child: Transform.translate(
              offset: const Offset(0, -6),
              child: Icon(
                Icons.info_outline_rounded,
                size: 16,
                color: colorScheme.onSurfaceVariant.withValues(alpha: 0.85),
              ),
            ),
          ),
        ),
      ),
    );
  }

  String _extractTitleFromSemanticLabel(String label) {
    const prefix = 'More information about ';
    if (label.startsWith(prefix)) {
      final t = label.substring(prefix.length).trim();
      if (t.isNotEmpty) return t;
    }
    return 'KPI Info';
  }

  InlineSpan _buildTooltipSpan(String title, String message, Color textColor) {
    final lines = message
        .split('\n')
        .map((e) => e.trim())
        .where((e) => e.isNotEmpty)
        .toList();
    final intro = lines.isNotEmpty ? lines.first : '';
    final detailLines = lines.length > 1 ? lines.skip(1).toList() : const <String>[];

    return TextSpan(
      style: TextStyle(color: textColor, fontSize: 12, height: 1.3),
      children: [
        TextSpan(
          text: '$title\n',
          style: TextStyle(
            color: textColor,
            fontWeight: FontWeight.w900,
            fontSize: 13,
          ),
        ),
        if (intro.isNotEmpty)
          TextSpan(
            text: '$intro\n',
            style: TextStyle(
              color: textColor.withValues(alpha: 0.78),
              fontWeight: FontWeight.w300,
            ),
          ),
        ...detailLines.expand((line) {
          final idx = line.indexOf(':');
          if (idx > 0) {
            final lead = line.substring(0, idx).trim();
            final rest = line.substring(idx + 1).trim();
            return <InlineSpan>[
              TextSpan(
                text: '• $lead: ',
                style: TextStyle(
                  color: textColor.withValues(alpha: 0.9),
                  fontWeight: FontWeight.w800,
                ),
              ),
              TextSpan(
                text: '$rest\n',
                style: TextStyle(
                  color: textColor.withValues(alpha: 0.72),
                  fontWeight: FontWeight.w300,
                ),
              ),
            ];
          }
          return <InlineSpan>[
            TextSpan(
              text: '• $line\n',
              style: TextStyle(
                color: textColor.withValues(alpha: 0.72),
                fontWeight: FontWeight.w300,
              ),
            ),
          ];
        }),
      ],
    );
  }
}
