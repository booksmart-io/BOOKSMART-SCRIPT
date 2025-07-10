import 'package:booksmart/models/stripe_product_model.dart';
import 'package:booksmart/modules/common/controllers/auth_controller.dart';
import 'package:booksmart/modules/user/controllers/subscription_controller.dart';
import 'package:booksmart/services/edge_functions.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

class TokenPurchaseScreen extends StatefulWidget {
  const TokenPurchaseScreen({super.key});

  @override
  State<TokenPurchaseScreen> createState() => _TokenPurchaseScreenState();
}

class _TokenPurchaseScreenState extends State<TokenPurchaseScreen> {
  late final SubscriptionController _subscriptionController;
  String? _purchasingPriceId;

  @override
  void initState() {
    super.initState();
    _subscriptionController = Get.isRegistered<SubscriptionController>()
        ? Get.find<SubscriptionController>()
        : Get.put(SubscriptionController(), permanent: true);

    if (_subscriptionController.responseModel == null) {
      _subscriptionController.loadStripeSubscriptionPlans(
        shouldLoadBefore: false,
      );
    }
  }

  Future<void> _refreshTokenProducts() async {
    await Future.wait([
      _subscriptionController.loadStripeSubscriptionPlans(
        shouldLoadBefore: false,
      ),
      if (Get.isRegistered<AuthController>()) authController.refereshUser(),
    ]);
  }

  Future<void> _selectTokenPack(StripePrice price) async {
    if (_purchasingPriceId != null) return;

    setState(() => _purchasingPriceId = price.id);

    try {
      final response = await purchaseTokens(priceId: price.id);
      if (Get.isRegistered<AuthController>()) {
        await authController.refereshUser();
      }

      Get.snackbar(
        "Token purchase started",
        "Payment status: ${response['status'] ?? 'processing'}",
        snackPosition: SnackPosition.BOTTOM,
      );
    } catch (e) {
      Get.snackbar(
        "Token purchase failed",
        e.toString(),
        snackPosition: SnackPosition.BOTTOM,
      );
    } finally {
      if (mounted) {
        setState(() => _purchasingPriceId = null);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: kIsWeb ? null : AppBar(title: const Text("Buy Tokens")),
      backgroundColor: Theme.of(context).colorScheme.surface,
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 980),
            child: RefreshIndicator(
              onRefresh: _refreshTokenProducts,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 28,
                ),
                child: GetBuilder<AuthController>(
                  builder: (_) {
                    return GetBuilder<SubscriptionController>(
                      builder: (controller) {
                        if (controller.responseModel == null) {
                          return const Padding(
                            padding: EdgeInsets.symmetric(vertical: 80),
                            child: Center(child: CircularProgressIndicator()),
                          );
                        }

                        if (controller.responseModel!.isError) {
                          return _TokenMessage(
                            message: controller.responseModel!.errorMessage,
                            onRetry: controller.loadStripeSubscriptionPlans,
                          );
                        }

                        final tokenProducts = controller.tokenProducts;
                        final tokenPacks = [
                          for (final product in tokenProducts)
                            for (final price in product.prices)
                              if (price.isOneTime)
                                _TokenPack(product: product, price: price),
                        ];

                        if (tokenPacks.isEmpty) {
                          return _TokenMessage(
                            message:
                                "No token packs are available right now. Make sure your Stripe token products have active one-time prices.",
                            onRetry: controller.loadStripeSubscriptionPlans,
                          );
                        }

                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            _TokenPurchaseHero(
                              tokenBalance: authUser?.tokenBalance ?? 0,
                            ),
                            const SizedBox(height: 28),
                            Text(
                              "Choose a token pack",
                              style: Theme.of(context).textTheme.headlineSmall
                                  ?.copyWith(fontWeight: FontWeight.w800),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              "Use tokens for premium strategies, boosts, and paid AI actions.",
                              style: Theme.of(context).textTheme.bodyMedium
                                  ?.copyWith(
                                    color: Theme.of(
                                      context,
                                    ).colorScheme.onSurfaceVariant,
                                  ),
                            ),
                            const SizedBox(height: 24),
                            Wrap(
                              spacing: 18,
                              runSpacing: 18,
                              children: tokenPacks
                                  .map(
                                    (pack) => _TokenPackCard(
                                      product: pack.product,
                                      price: pack.price,
                                      isLoading:
                                          _purchasingPriceId == pack.price.id,
                                      onSelect: () =>
                                          _selectTokenPack(pack.price),
                                    ),
                                  )
                                  .toList(),
                            ),
                          ],
                        );
                      },
                    );
                  },
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TokenPack {
  final StripePlan product;
  final StripePrice price;

  const _TokenPack({required this.product, required this.price});
}

class _TokenPurchaseHero extends StatelessWidget {
  final int tokenBalance;

  const _TokenPurchaseHero({required this.tokenBalance});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final backgroundColor = isDark
        ? colorScheme.surfaceContainerHighest
        : colorScheme.secondaryContainer;
    final foregroundColor = isDark
        ? colorScheme.onSurface
        : colorScheme.onSecondaryContainer;

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: colorScheme.outlineVariant),
        boxShadow: [
          if (!isDark)
            BoxShadow(
              color: colorScheme.shadow.withValues(alpha: 0.08),
              blurRadius: 26,
              offset: const Offset(0, 14),
            ),
        ],
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final header = Row(
            children: [
              Container(
                height: 62,
                width: 62,
                decoration: BoxDecoration(
                  color: colorScheme.primary.withValues(
                    alpha: isDark ? 0.18 : 0.12,
                  ),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  Icons.token_rounded,
                  color: colorScheme.primary,
                  size: 34,
                ),
              ),
              const SizedBox(width: 18),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      "Token Wallet",
                      style: theme.textTheme.headlineSmall?.copyWith(
                        color: foregroundColor,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      "Buy one-time token packs and spend them whenever you need premium features.",
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: foregroundColor.withValues(alpha: 0.74),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          );

          final balanceCard = _TokenBalanceCard(
            balance: tokenBalance,
            foregroundColor: foregroundColor,
          );

          if (constraints.maxWidth < 640) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [header, const SizedBox(height: 20), balanceCard],
            );
          }

          return Row(
            children: [
              Expanded(child: header),
              const SizedBox(width: 20),
              balanceCard,
            ],
          );
        },
      ),
    );
  }
}

class _TokenBalanceCard extends StatelessWidget {
  final int balance;
  final Color foregroundColor;

  const _TokenBalanceCard({
    required this.balance,
    required this.foregroundColor,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
      decoration: BoxDecoration(
        color: colorScheme.surface.withValues(alpha: 0.64),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: colorScheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            "Current balance",
            style: theme.textTheme.labelLarge?.copyWith(
              color: foregroundColor.withValues(alpha: 0.68),
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.monetization_on, color: colorScheme.primary, size: 22),
              const SizedBox(width: 8),
              Text(
                "$balance",
                style: theme.textTheme.headlineSmall?.copyWith(
                  color: foregroundColor,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(width: 6),
              Text(
                "tokens",
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: foregroundColor.withValues(alpha: 0.72),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _TokenPackCard extends StatelessWidget {
  final StripePlan product;
  final StripePrice price;
  final bool isLoading;
  final VoidCallback onSelect;

  const _TokenPackCard({
    required this.product,
    required this.price,
    required this.isLoading,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final tokenLabel = price.tokenAmount == null
        ? product.name
        : "${price.tokenAmount} Tokens";

    return Container(
      width: 300,
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: isDark ? colorScheme.surfaceContainerHighest : theme.cardColor,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: colorScheme.outlineVariant),
        boxShadow: [
          if (!isDark)
            BoxShadow(
              color: colorScheme.shadow.withValues(alpha: 0.06),
              blurRadius: 18,
              offset: const Offset(0, 10),
            ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.monetization_on, color: colorScheme.secondary, size: 32),
          const SizedBox(height: 16),
          Text(
            tokenLabel,
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w900,
            ),
          ),
          if (product.description?.isNotEmpty == true) ...[
            const SizedBox(height: 8),
            Text(
              product.description!,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: colorScheme.onSurfaceVariant,
              ),
            ),
          ],
          const SizedBox(height: 18),
          Text(
            _formatPrice(price.amountInDollar),
            style: theme.textTheme.displaySmall?.copyWith(
              fontWeight: FontWeight.w900,
              color: colorScheme.onSurface,
            ),
          ),
          const SizedBox(height: 22),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: isLoading ? null : onSelect,
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
              child: isLoading
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text("Buy Tokens"),
            ),
          ),
        ],
      ),
    );
  }
}

class _TokenMessage extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _TokenMessage({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Container(
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: colorScheme.outlineVariant),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.token_outlined,
            size: 42,
            color: colorScheme.onSurfaceVariant,
          ),
          const SizedBox(height: 14),
          Text(
            message,
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyLarge,
          ),
          const SizedBox(height: 18),
          ElevatedButton(
            onPressed: onRetry,
            child: const Text("Reload products"),
          ),
        ],
      ),
    );
  }
}

String _formatPrice(double amount) {
  final isWholeDollar = amount == amount.roundToDouble();
  return "\$${amount.toStringAsFixed(isWholeDollar ? 0 : 2)}";
}
