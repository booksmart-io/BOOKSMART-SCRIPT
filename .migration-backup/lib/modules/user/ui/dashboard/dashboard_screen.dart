import 'package:booksmart/constant/app_colors.dart';
import 'package:booksmart/modules/user/ui/dashboard/widgets/business_challenges_card.dart';
import 'package:booksmart/modules/user/ui/dashboard/widgets/business_power_score_card.dart';
import 'package:booksmart/modules/user/ui/dashboard/widgets/missions_list.dart';
import 'package:booksmart/modules/user/ui/dashboard/widgets/ai_strategy_insight_list.dart';
import 'package:booksmart/modules/user/ui/dashboard/widgets/stats_header.dart';
import 'package:booksmart/modules/user/ui/dashboard/widgets/achievements_grid.dart';
import 'package:booksmart/modules/user/ui/dashboard/widgets/secondary_stats_cards.dart';
import 'package:flutter/material.dart';
import 'package:accordion/accordion.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: LayoutBuilder(
        builder: (context, constraints) {
          if (constraints.maxWidth > 1200) {
            return _buildDesktopLayout(context);
          } else if (constraints.maxWidth > 800) {
            return _buildTabletLayout(context);
          } else {
            return _buildMobileLayout(context);
          }
        },
      ),
    );
  }

  Widget _buildDesktopLayout(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          const StatsHeader(),
          const SizedBox(height: 24),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                flex: 2,
                child: Column(
                  children: [
                    const BusinessPowerScoreCard(),
                    const SizedBox(height: 24),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Expanded(child: MissionsList()),
                        const SizedBox(width: 24),
                        const Expanded(child: AiStrategyInsightList()),
                      ],
                    ),
                    const SizedBox(height: 24),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Expanded(child: AchievementsGrid()),
                        const SizedBox(width: 24),
                        const Expanded(child: BusinessChallengesCard()),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 24),
              const SizedBox(width: 350, child: SecondaryStatsCards()),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildTabletLayout(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          const StatsHeader(),
          const SizedBox(height: 20),
          const BusinessPowerScoreCard(),
          const SizedBox(height: 20),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Expanded(
                child: Column(
                  children: [
                    MissionsList(),
                    SizedBox(height: 20),
                    AchievementsGrid(),
                  ],
                ),
              ),
              const SizedBox(width: 20),
              const Expanded(
                child: Column(
                  children: [
                    AiStrategyInsightList(),
                    SizedBox(height: 20),
                    BusinessChallengesCard(),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          const SecondaryStatsCards(),
        ],
      ),
    );
  }

  Widget _buildMobileLayout(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final headerStyle = TextStyle(
      color: colorScheme.onSurface,
      fontSize: 16,
      fontWeight: FontWeight.bold,
    );
    final isDark = theme.brightness == Brightness.dark;
    final accordionColor = isDark
        ? AppColorsDark.surface
        : const Color.fromARGB(140, 220, 220, 220);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          const StatsHeader(),
          const SizedBox(height: 16),
          const BusinessPowerScoreCard(),
          const SizedBox(height: 16),
          buildDunAndBradstreetCard(),
          const SizedBox(height: 16),
          Accordion(
            maxOpenSections: 2,
            headerBackgroundColor: accordionColor,
            headerBackgroundColorOpened: accordionColor,
            contentBackgroundColor: accordionColor,
            contentBorderColor: accordionColor,
            contentBorderWidth: 0,
            contentHorizontalPadding: 16,
            contentVerticalPadding: 16,
            headerPadding: const EdgeInsets.symmetric(
              vertical: 12,
              horizontal: 15,
            ),
            disableScrolling: true,
            children: [
              AccordionSection(
                isOpen: false,
                leftIcon: Icon(
                  Icons.psychology_rounded,
                  color: colorScheme.secondary,
                ),
                header: Text('AI Insights', style: headerStyle),
                content: const AiStrategyInsightList(),
              ),
              AccordionSection(
                isOpen: false,
                leftIcon: Icon(Icons.assignment_rounded, color: Colors.teal),
                header: Text('Missions', style: headerStyle),
                content: const MissionsList(),
              ),

              AccordionSection(
                isOpen: false,
                leftIcon: Icon(
                  Icons.emoji_events_rounded,
                  color: Colors.amber[700],
                ),
                header: Text('Achievements', style: headerStyle),
                content: const AchievementsGrid(),
              ),
              AccordionSection(
                isOpen: false,
                leftIcon: Icon(
                  Icons.business_center_rounded,
                  color: colorScheme.tertiary,
                ),
                header: Text('Business Challenges', style: headerStyle),
                content: const BusinessChallengesCard(),
              ),
              AccordionSection(
                isOpen: false,
                leftIcon: const Icon(
                  Icons.bar_chart_rounded,
                  color: Colors.blueAccent,
                ),
                header: Text('Secondary Stats', style: headerStyle),
                content: const SecondaryStatsCards(),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
