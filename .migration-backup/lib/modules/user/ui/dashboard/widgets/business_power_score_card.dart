import 'package:flutter/material.dart';
import 'package:syncfusion_flutter_gauges/gauges.dart';
import '../../../../../widgets/app_text.dart';

class BusinessPowerScoreCard extends StatelessWidget {
  const BusinessPowerScoreCard({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;

    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(15),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AppText(
              'Business Power Score (BPS)',
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: colorScheme.onSurface,
            ),
            const SizedBox(height: 20),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  flex: 2,
                  child: Column(
                    children: [
                      SizedBox(
                        height: 220,
                        child: SfRadialGauge(
                          axes: <RadialAxis>[
                            RadialAxis(
                              minimum: 0,
                              maximum: 100,
                              startAngle: 150,
                              endAngle: 30,
                              radiusFactor: 0.95,
                              showLastLabel: true,
                              labelFormat: '{value}',
                              axisLabelStyle: GaugeTextStyle(
                                color: colorScheme.onSurfaceVariant,
                                fontSize: 10,
                                fontFamily:
                                    theme.textTheme.bodyMedium?.fontFamily,
                              ),
                              majorTickStyle: MajorTickStyle(
                                length: 0.1,
                                thickness: 1.5,
                                color: colorScheme.onSurface.withValues(
                                  alpha: 0.5,
                                ),
                              ),
                              minorTickStyle: MinorTickStyle(
                                length: 0.05,
                                thickness: 1,
                                color: colorScheme.onSurface.withValues(
                                  alpha: 0.2,
                                ),
                              ),
                              axisLineStyle: AxisLineStyle(
                                thickness: 0.12,
                                thicknessUnit: GaugeSizeUnit.factor,
                                cornerStyle: CornerStyle.bothCurve,
                                color: isDark
                                    ? Colors.black12
                                    : colorScheme.surfaceContainerHighest,
                              ),
                              pointers: const <GaugePointer>[
                                RangePointer(
                                  value: 80,
                                  width: 0.12,
                                  sizeUnit: GaugeSizeUnit.factor,
                                  cornerStyle: CornerStyle.bothCurve,
                                  gradient: SweepGradient(
                                    colors: <Color>[
                                      Colors.redAccent,
                                      Colors.orange,
                                      Colors.yellow,
                                      Colors.greenAccent,
                                      Colors.cyan,
                                    ],
                                    stops: <double>[0.0, 0.25, 0.5, 0.75, 1.0],
                                  ),
                                ),
                                MarkerPointer(
                                  value: 80,
                                  markerType: MarkerType.circle,
                                  color: Colors.white,
                                  markerWidth: 8,
                                  markerHeight: 8,
                                ),
                              ],
                              annotations: <GaugeAnnotation>[
                                GaugeAnnotation(
                                  angle: 90,
                                  positionFactor: 0.2,
                                  widget: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      AppText(
                                        '80',
                                        fontSize: 42,
                                        fontWeight: FontWeight.bold,
                                        color: colorScheme.onSurface,
                                      ),
                                      AppText(
                                        'Good',
                                        fontSize: 16,
                                        color: colorScheme.onSurfaceVariant,
                                      ),
                                    ],
                                  ),
                                ),
                                // GaugeAnnotation(
                                //   angle: 90,
                                //   positionFactor: 0.8,
                                //   widget: AppText(
                                //     '\$ 4725.0004',
                                //     fontSize: 12,
                                //     color: colorScheme.onSurface.withValues(
                                //       alpha: 0.3,
                                //     ),
                                //     fontFamily: 'monospace',
                                //   ),
                                // ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 20),
                Expanded(
                  flex: 3,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Flexible(
                            child: FittedText(
                              'Level 8',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                color: colorScheme.onSurface,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Flexible(
                            child: FittedText(
                              'Entrepreneur',
                              style: TextStyle(
                                fontSize: 14,
                                color: colorScheme.onSurfaceVariant,
                              ),
                            ),
                          ),
                          // const Spacer(),
                          const Icon(Icons.star, color: Colors.amber, size: 18),
                        ],
                      ),
                      const SizedBox(height: 12),
                      LinearProgressIndicator(
                        value: 0.75,
                        backgroundColor: colorScheme.onSurface.withValues(
                          alpha: 0.1,
                        ),
                        valueColor: const AlwaysStoppedAnimation<Color>(
                          Colors.orangeAccent,
                        ),
                        minHeight: 6,
                        borderRadius: BorderRadius.circular(3),
                      ),
                      const SizedBox(height: 20),
                      AppText(
                        'Cashflow Builder',
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        color: colorScheme.onSurface,
                      ),
                      const SizedBox(height: 12),
                      LinearProgressIndicator(
                        value: 0.6,
                        backgroundColor: colorScheme.onSurface.withValues(
                          alpha: 0.1,
                        ),
                        valueColor: const AlwaysStoppedAnimation<Color>(
                          Colors.amber,
                        ),
                        minHeight: 6,
                        borderRadius: BorderRadius.circular(3),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          AppText(
                            'Next rank: Profit Machine',
                            fontSize: 11,
                            color: colorScheme.onSurface.withValues(
                              alpha: 0.54,
                            ),
                          ),
                          AppText(
                            'Streak: 3.500',
                            fontSize: 11,
                            color: colorScheme.onSurface.withValues(
                              alpha: 0.54,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      Align(
                        alignment: Alignment.centerRight,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 8,
                          ),
                          decoration: BoxDecoration(
                            color: colorScheme.onSurface.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                              color: colorScheme.onSurface.withValues(
                                alpha: 0.1,
                              ),
                            ),
                          ),
                          child: Row(
                            spacing: 5,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Expanded(
                                child: FittedText(
                                  'Todays XP Potential:',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: colorScheme.onSurface.withValues(
                                      alpha: 0.7,
                                    ),
                                  ),
                                ),
                              ),
                              Flexible(
                                child: const FittedText(
                                  '+340 XP',
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.bold,
                                    color: Colors.greenAccent,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
