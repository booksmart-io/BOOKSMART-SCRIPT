import 'dart:developer';

import 'package:booksmart/models/stripe_product_model.dart';
import 'package:booksmart/models/subscription_model.dart';
import 'package:booksmart/modules/user/controllers/stripe_card_controller.dart';
import 'package:booksmart/modules/user/controllers/user_subscription_controller.dart';
import 'package:booksmart/modules/user/ui/stripe/add_new_card_screen.dart';
import 'package:booksmart/services/edge_functions.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import '../controllers/subscription_controller.dart';

class SubscriptionScreen extends StatefulWidget {
  const SubscriptionScreen({super.key});

  @override
  State<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends State<SubscriptionScreen> {
  late final StripeCardController _stripeCardController;
  late final SubscriptionController _subscriptionController;
  late final UserSubscriptionController _userSubscriptionController;
  String? _subscribingPriceId;

  @override
  void initState() {
    super.initState();
    _subscriptionController = Get.isRegistered<SubscriptionController>()
        ? Get.find<SubscriptionController>()
        : Get.put(SubscriptionController(), permanent: true);
    _userSubscriptionController = Get.find<UserSubscriptionController>();

    _userSubscriptionController.loadUserSubscription();

    if (Get.isRegistered<StripeCardController>()) {
      _stripeCardController = Get.find<StripeCardController>();
    } else {
      _stripeCardController = Get.put(StripeCardController(), permanent: true);
    }
    _stripeCardController.loadCards();
  }

  Future<void> _createSubscription(StripePrice price) async {
    if (_subscribingPriceId != null) return;

    if (_stripeCardController.loading) {
      await _stripeCardController.loadCards();
    }

    if (_stripeCardController.cards.isEmpty) {
      goToAddNewCardScreen();
      Get.snackbar(
        "Add a card first",
        "Please add a payment card before choosing a subscription.",
        snackPosition: SnackPosition.BOTTOM,
      );
      return;
    }

    setState(() => _subscribingPriceId = price.id);

    try {
      final response = await createStripeSubscription(priceId: price.id);
      await _userSubscriptionController.loadUserSubscription();

      Get.snackbar(
        "Subscription created",
        "Status: ${response['status'] ?? 'created'}",
        snackPosition: SnackPosition.BOTTOM,
      );
    } catch (e, x) {
      log(e.toString());
      log(x.toString());
      Get.snackbar("Error", e.toString(), snackPosition: SnackPosition.BOTTOM);
    } finally {
      if (mounted) {
        setState(() => _subscribingPriceId = null);
      }
    }
  }

  StripePrice? _priceForInterval(StripePlan plan, String interval) {
    for (final price in plan.prices) {
      if (price.interval == interval) return price;
    }
    return null;
  }

  StripePlan? _planForSubscription(
    List<StripePlan> plans,
    SubscriptionModel? subscription,
  ) {
    if (subscription == null) return null;
    for (final plan in plans) {
      if (plan.id == subscription.stripeProductId) return plan;
    }
    return null;
  }

  StripePrice? _priceForSubscription(
    StripePlan? plan,
    SubscriptionModel? subscription,
  ) {
    if (plan == null || subscription == null) return null;
    for (final price in plan.prices) {
      if (price.id == subscription.stripePriceId) return price;
    }
    return null;
  }

  Future<void> _refreshSubscriptionScreen() async {
    await Future.wait([
      _subscriptionController.loadStripeSubscriptionPlans(
        shouldLoadBefore: false,
      ),
      _userSubscriptionController.loadUserSubscription(
        shouldUpdateBefore: false,
      ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).colorScheme.surface,
      body: SafeArea(
        child: GetBuilder<SubscriptionController>(
          builder: (SubscriptionController subscriptionController) {
            final plans = subscriptionController.subscriptionProducts;

            return GetBuilder<UserSubscriptionController>(
              builder: (UserSubscriptionController userSubscriptionController) {
                final currentPlan = _planForSubscription(
                  plans,
                  userSubscriptionController.subscription,
                );
                final currentPrice = _priceForSubscription(
                  currentPlan,
                  userSubscriptionController.subscription,
                );

                return Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 1120),
                    child: RefreshIndicator(
                      onRefresh: _refreshSubscriptionScreen,
                      child: SingleChildScrollView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 24,
                          vertical: 28,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            _SubscriptionHero(
                              subscription:
                                  userSubscriptionController.subscription,
                              plan: currentPlan,
                              price: currentPrice,
                              isLoading: userSubscriptionController.isLoading,
                              error: userSubscriptionController.error,
                              onRefresh: userSubscriptionController
                                  .loadUserSubscription,
                            ),
                            const SizedBox(height: 28),
                            _PlansHeader(
                              yearly: subscriptionController.isYearly,
                              onBillingChanged:
                                  subscriptionController.toggleBilling,
                            ),
                            const SizedBox(height: 24),
                            _PlansSection(
                              controller: subscriptionController,
                              currentSubscription:
                                  userSubscriptionController.subscription,
                              yearly: subscriptionController.isYearly,
                              subscribingPriceId: _subscribingPriceId,
                              priceForInterval: _priceForInterval,
                              onCreateSubscription: _createSubscription,
                            ),
                            const SizedBox(height: 28),
                            Text(
                              "Secure payment via Stripe. You can manage or cancel your plan at any time.",
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.bodyMedium
                                  ?.copyWith(
                                    color: Theme.of(
                                      context,
                                    ).colorScheme.onSurfaceVariant,
                                  ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

class _SubscriptionHero extends StatelessWidget {
  final SubscriptionModel? subscription;
  final StripePlan? plan;
  final StripePrice? price;
  final bool isLoading;
  final String? error;
  final VoidCallback onRefresh;

  const _SubscriptionHero({
    required this.subscription,
    required this.plan,
    required this.price,
    required this.isLoading,
    required this.error,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final statusColor = _statusColor(colorScheme, subscription?.status);

    return Container(
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            colorScheme.primary,
            Color.alphaBlend(
              Colors.black.withValues(alpha: 0.18),
              colorScheme.primary,
            ),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(28),
        boxShadow: [
          BoxShadow(
            color: colorScheme.primary.withValues(alpha: 0.18),
            blurRadius: 28,
            offset: const Offset(0, 16),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      "Subscription",
                      style: theme.textTheme.labelLarge?.copyWith(
                        color: colorScheme.onPrimary.withValues(alpha: 0.78),
                        letterSpacing: 0.4,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      _title,
                      style: theme.textTheme.headlineMedium?.copyWith(
                        color: colorScheme.onPrimary,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      _subtitle,
                      style: theme.textTheme.bodyLarge?.copyWith(
                        color: colorScheme.onPrimary.withValues(alpha: 0.82),
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 16),
              _StatusPill(
                label: isLoading
                    ? "Loading"
                    : subscription?.statusLabel ?? "No plan",
                backgroundColor: statusColor,
              ),
            ],
          ),
          const SizedBox(height: 24),
          if (isLoading)
            const LinearProgressIndicator(minHeight: 3)
          else if (error != null)
            _StatusError(message: error!, onRefresh: onRefresh)
          else
            _SubscriptionDetails(
              subscription: subscription,
              plan: plan,
              price: price,
            ),
        ],
      ),
    );
  }

  String get _title {
    if (subscription == null) return "You are currently on free access";
    if (subscription!.cancelAtPeriodEnd) {
      return "Your plan is active until ${_formatDate(subscription!.currentPeriodEnd)}";
    }
    return "Your subscription is ${subscription!.statusLabel}";
  }

  String get _subtitle {
    if (subscription == null) {
      return "Choose a plan below to unlock premium features for your bookkeeping workflow.";
    }
    if (subscription!.isTrialing && subscription!.trialEnd != null) {
      return "Your trial ends on ${_formatDate(subscription!.trialEnd!)}.";
    }
    if (subscription!.cancelAtPeriodEnd) {
      return "You will keep access until the end of the current billing period.";
    }
    return "Your billing period is up to date and your plan details are shown below.";
  }

  Color _statusColor(ColorScheme colorScheme, String? status) {
    switch (status) {
      case 'active':
      case 'trialing':
        return Colors.green.shade600;
      case 'past_due':
      case 'incomplete':
      case 'unpaid':
        return Colors.orange.shade700;
      case 'canceled':
        return colorScheme.error;
      default:
        return colorScheme.onPrimary.withValues(alpha: 0.18);
    }
  }
}

class _SubscriptionDetails extends StatelessWidget {
  final SubscriptionModel? subscription;
  final StripePlan? plan;
  final StripePrice? price;

  const _SubscriptionDetails({
    required this.subscription,
    required this.plan,
    required this.price,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    if (subscription == null) {
      return _DetailGrid(
        items: const [
          _DetailItem(
            icon: Icons.workspace_premium,
            label: "Current plan",
            value: "Free",
          ),
          _DetailItem(
            icon: Icons.lock_open,
            label: "Access",
            value: "Basic features",
          ),
          _DetailItem(
            icon: Icons.credit_card,
            label: "Billing",
            value: "No active subscription",
          ),
        ],
      );
    }

    final amount = price == null
        ? null
        : "\$${price!.amountInDollar.toStringAsFixed(0)}";
    final billing = price == null
        ? "Stripe price ${subscription!.stripePriceId}"
        : "$amount / ${price!.interval}";

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: colorScheme.onPrimary.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: colorScheme.onPrimary.withValues(alpha: 0.18),
        ),
      ),
      child: _DetailGrid(
        items: [
          _DetailItem(
            icon: Icons.workspace_premium,
            label: "Current plan",
            value:
                plan?.name ?? "Stripe product ${subscription!.stripeProductId}",
          ),
          _DetailItem(icon: Icons.payments, label: "Billing", value: billing),
          _DetailItem(
            icon: subscription!.cancelAtPeriodEnd
                ? Icons.event_busy
                : Icons.event_repeat,
            label: subscription!.cancelAtPeriodEnd
                ? "Access ends"
                : "Renews on",
            value: _formatDate(subscription!.currentPeriodEnd),
          ),
          if (subscription!.trialEnd != null)
            _DetailItem(
              icon: Icons.timer,
              label: "Trial ends",
              value: _formatDate(subscription!.trialEnd!),
            ),
        ],
      ),
    );
  }
}

class _DetailGrid extends StatelessWidget {
  final List<_DetailItem> items;

  const _DetailGrid({required this.items});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final itemWidth = constraints.maxWidth < 760
            ? constraints.maxWidth
            : (constraints.maxWidth - 24) / 2;

        return Wrap(
          spacing: 24,
          runSpacing: 18,
          children: items
              .map((item) => SizedBox(width: itemWidth, child: item))
              .toList(),
        );
      },
    );
  }
}

class _DetailItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _DetailItem({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Row(
      children: [
        Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(
            color: colorScheme.onPrimary.withValues(alpha: 0.16),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Icon(icon, color: colorScheme.onPrimary, size: 21),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: theme.textTheme.labelMedium?.copyWith(
                  color: colorScheme.onPrimary.withValues(alpha: 0.7),
                ),
              ),
              const SizedBox(height: 3),
              Text(
                value,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.titleMedium?.copyWith(
                  color: colorScheme.onPrimary,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _StatusPill extends StatelessWidget {
  final String label;
  final Color backgroundColor;

  const _StatusPill({required this.label, required this.backgroundColor});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelLarge?.copyWith(
          color: Colors.white,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _StatusError extends StatelessWidget {
  final String message;
  final VoidCallback onRefresh;

  const _StatusError({required this.message, required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colorScheme.onPrimary.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          Icon(Icons.info_outline, color: colorScheme.onPrimary),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              message,
              style: TextStyle(color: colorScheme.onPrimary),
            ),
          ),
          TextButton(
            onPressed: onRefresh,
            child: Text(
              "Retry",
              style: TextStyle(color: colorScheme.onPrimary),
            ),
          ),
        ],
      ),
    );
  }
}

class _PlansHeader extends StatelessWidget {
  final bool yearly;
  final ValueChanged<bool> onBillingChanged;

  const _PlansHeader({required this.yearly, required this.onBillingChanged});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return LayoutBuilder(
      builder: (context, constraints) {
        final title = Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              "Choose your plan",
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              "Upgrade when you are ready. Your current status stays visible above.",
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        );

        if (constraints.maxWidth < 650) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              title,
              const SizedBox(height: 16),
              _BillingToggle(yearly: yearly, onChanged: onBillingChanged),
            ],
          );
        }

        return Row(
          children: [
            Expanded(child: title),
            const SizedBox(width: 16),
            _BillingToggle(yearly: yearly, onChanged: onBillingChanged),
          ],
        );
      },
    );
  }
}

class _PlansSection extends StatelessWidget {
  final SubscriptionController controller;
  final SubscriptionModel? currentSubscription;
  final bool yearly;
  final String? subscribingPriceId;
  final StripePrice? Function(StripePlan plan, String interval)
  priceForInterval;
  final ValueChanged<StripePrice> onCreateSubscription;

  const _PlansSection({
    required this.controller,
    required this.currentSubscription,
    required this.yearly,
    required this.subscribingPriceId,
    required this.priceForInterval,
    required this.onCreateSubscription,
  });

  @override
  Widget build(BuildContext context) {
    if (controller.responseModel == null) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 48),
        child: Center(child: CircularProgressIndicator()),
      );
    }

    if (controller.responseModel!.isError) {
      return _PlansMessage(
        message: controller.responseModel!.errorMessage,
        onRetry: controller.loadStripeSubscriptionPlans,
      );
    }

    final plans = controller.subscriptionProducts;

    if (plans.isEmpty) {
      return _PlansMessage(
        message:
            "No subscription plans are available right now. Make sure your Stripe test products have active recurring prices.",
        onRetry: controller.loadStripeSubscriptionPlans,
      );
    }

    return Wrap(
      spacing: 20,
      runSpacing: 20,
      alignment: WrapAlignment.center,
      children: plans.map((plan) {
        final monthlyPrice = priceForInterval(plan, "month");
        final yearlyPrice = priceForInterval(plan, "year");
        final price = yearly ? yearlyPrice : monthlyPrice;

        final monthlyCost = (monthlyPrice?.amount ?? 0) / 100;
        final yearlyCost = (yearlyPrice?.amount ?? 0) / 100;

        final savings = monthlyPrice != null && yearlyPrice != null
            ? (monthlyCost * 12) - yearlyCost
            : 0.0;
        final isCurrentPlan =
            currentSubscription?.stripeProductId == plan.id &&
            currentSubscription?.stripePriceId == price?.id;

        return _PlanCard(
          planName: plan.name,
          description: plan.description,
          price: price == null ? null : price.amount / 100,
          interval: yearly ? "year" : "month",
          isPopular: plan.name.toLowerCase().contains("plus"),
          isCurrentPlan: isCurrentPlan,
          savings: yearly ? savings : 0,
          isLoading: price != null && subscribingPriceId == price.id,
          buttonLabel: isCurrentPlan
              ? "Current Plan"
              : "Purchase ${yearly ? "Yearly" : "Monthly"} Plan",
          onSelect:
              price != null && subscribingPriceId == null && !isCurrentPlan
              ? () => onCreateSubscription(price)
              : null,
        );
      }).toList(),
    );
  }
}

class _PlansMessage extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _PlansMessage({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.receipt_long_outlined,
            size: 42,
            color: theme.colorScheme.onSurfaceVariant,
          ),
          const SizedBox(height: 14),
          Text(
            message,
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyLarge,
          ),
          const SizedBox(height: 18),
          ElevatedButton(onPressed: onRetry, child: const Text("Reload plans")),
        ],
      ),
    );
  }
}

class _BillingToggle extends StatelessWidget {
  final bool yearly;
  final ValueChanged<bool> onChanged;

  const _BillingToggle({required this.yearly, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Container(
      padding: const EdgeInsets.all(5),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: colorScheme.outlineVariant),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _ToggleItem(
            title: "Monthly",
            selected: !yearly,
            onTap: () => onChanged(false),
          ),
          _ToggleItem(
            title: "Yearly",
            selected: yearly,
            onTap: () => onChanged(true),
          ),
        ],
      ),
    );
  }
}

class _ToggleItem extends StatelessWidget {
  final String title;
  final bool selected;
  final VoidCallback onTap;

  const _ToggleItem({
    required this.title,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? colorScheme.surface : Colors.transparent,
          borderRadius: BorderRadius.circular(999),
          boxShadow: selected
              ? [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.06),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ]
              : null,
        ),
        child: Text(
          title,
          style: TextStyle(
            fontWeight: FontWeight.w700,
            color: selected
                ? colorScheme.onSurface
                : colorScheme.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  final String planName;
  final String? description;
  final double? price;
  final String interval;
  final bool isPopular;
  final bool isCurrentPlan;
  final double savings;
  final bool isLoading;
  final String buttonLabel;
  final VoidCallback? onSelect;

  const _PlanCard({
    required this.planName,
    required this.description,
    required this.price,
    required this.interval,
    required this.isPopular,
    required this.isCurrentPlan,
    required this.savings,
    required this.isLoading,
    required this.buttonLabel,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final highlight = isCurrentPlan || isPopular;
    final priceText = price == null
        ? "Not available"
        : "\$${price!.toStringAsFixed(0)}";

    return AnimatedContainer(
      duration: const Duration(milliseconds: 220),
      width: 330,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: theme.cardColor,
        borderRadius: BorderRadius.circular(26),
        border: Border.all(
          color: highlight ? colorScheme.primary : colorScheme.outlineVariant,
          width: highlight ? 2 : 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: highlight ? 0.08 : 0.04),
            blurRadius: highlight ? 28 : 18,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (isCurrentPlan)
                _PlanBadge(label: "CURRENT PLAN", color: Colors.green.shade600),
              if (isPopular)
                _PlanBadge(label: "POPULAR", color: colorScheme.primary),
            ],
          ),
          if (isCurrentPlan || isPopular) const SizedBox(height: 14),
          Text(
            planName,
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w800,
            ),
          ),
          if (description?.isNotEmpty == true) ...[
            const SizedBox(height: 8),
            Text(
              description!,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: colorScheme.onSurfaceVariant,
                height: 1.35,
              ),
            ),
          ],
          const SizedBox(height: 18),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                priceText,
                style: theme.textTheme.displaySmall?.copyWith(
                  fontSize: 36,
                  fontWeight: FontWeight.w900,
                  color: price == null
                      ? colorScheme.onSurfaceVariant
                      : colorScheme.onSurface,
                ),
              ),
              if (price != null) ...[
                const SizedBox(width: 6),
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Text(
                    "/$interval",
                    style: TextStyle(color: colorScheme.onSurfaceVariant),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 12),
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 180),
            child: savings > 0
                ? Container(
                    key: const ValueKey("savings"),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.green.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      "Save \$${savings.toStringAsFixed(0)} per year",
                      style: TextStyle(
                        color: Colors.green.shade700,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  )
                : const SizedBox(key: ValueKey("no-savings"), height: 32),
          ),
          const SizedBox(height: 18),
          const _FeatureList(),
          const SizedBox(height: 22),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: onSelect,
              style: ElevatedButton.styleFrom(
                backgroundColor: isCurrentPlan
                    ? Colors.green.shade600
                    : colorScheme.primary,
                foregroundColor: Colors.white,
                disabledBackgroundColor: isCurrentPlan
                    ? Colors.green.shade600
                    : colorScheme.surfaceContainerHighest,
                disabledForegroundColor: isCurrentPlan
                    ? Colors.white
                    : colorScheme.onSurfaceVariant,
                padding: const EdgeInsets.symmetric(vertical: 15),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
              child: isLoading
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Text(price == null ? "Price unavailable" : buttonLabel),
            ),
          ),
        ],
      ),
    );
  }
}

class _PlanBadge extends StatelessWidget {
  final String label;
  final Color color;

  const _PlanBadge({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: Colors.white,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}

class _FeatureList extends StatelessWidget {
  const _FeatureList();

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    const features = ["Unlimited access", "Priority support", "Cancel anytime"];

    return Column(
      children: features
          .map(
            (feature) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                children: [
                  Icon(
                    Icons.check_circle,
                    size: 18,
                    color: Colors.green.shade600,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      feature,
                      style: TextStyle(color: colorScheme.onSurfaceVariant),
                    ),
                  ),
                ],
              ),
            ),
          )
          .toList(),
    );
  }
}

String _formatDate(DateTime date) {
  return DateFormat('MMM d, yyyy').format(date.toLocal());
}
