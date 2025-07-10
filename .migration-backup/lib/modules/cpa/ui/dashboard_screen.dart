import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/models/order_model.dart';
import 'package:booksmart/modules/user/controllers/order_controller.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:get/get.dart';
import '../../common/controllers/chat_controller.dart';
import '../controllers/leads_controller.dart';
import 'components/lead_card.dart';

class DashboardScreenCPA extends StatefulWidget {
  const DashboardScreenCPA({super.key});

  @override
  State<DashboardScreenCPA> createState() => _DashboardScreenCPAState();
}

class _DashboardScreenCPAState extends State<DashboardScreenCPA> {
  final chatController = Get.put(ChatController());
  final leadsController = Get.put(LeadsController());
  final orderController = Get.isRegistered<OrderController>()
      ? Get.find<OrderController>()
      : Get.put(OrderController());

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final width = MediaQuery.of(context).size.width;

    return Scaffold(
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(15),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ==== STATS GRID ====
            LayoutBuilder(
              builder: (context, constraints) {
                int crossCount = width > 1000
                    ? 4
                    : width > 700
                    ? 2
                    : 2;
                return GridView.count(
                  shrinkWrap: true,
                  crossAxisCount: crossCount,
                  childAspectRatio: width > 1000
                      ? 2
                      : width > 700
                      ? 3
                      : 1.5,
                  crossAxisSpacing: 1,
                  mainAxisSpacing: 1,
                  physics: const NeverScrollableScrollPhysics(),
                  children: [
                    Obx(
                      () => _buildStatCard(
                        'Total Leads',
                        '${leadsController.leads.length}',
                        Colors.amber,
                        Icons.leaderboard,
                      ),
                    ),
                    Obx(
                      () => _buildStatCard(
                        'Orders',
                        '${orderController.allOrders.length}',
                        Colors.teal,
                        Icons.shopping_cart,
                      ),
                    ),
                    Obx(() {
                      final acceptedClients = orderController.allOrders
                          .where(
                            (o) =>
                                o.status != OrderStatus.pending &&
                                o.status != OrderStatus.rejected &&
                                o.status != OrderStatus.cancelled,
                          )
                          .map((o) => o.userId)
                          .toSet()
                          .length;
                      return _buildStatCard(
                        'Accepted Clients',
                        '$acceptedClients',
                        Colors.green,
                        Icons.verified_user,
                      );
                    }),
                    // orders/leads ratio
                    Obx(() {
                      final totalLeads = leadsController.leads.length;
                      final totalOrders = orderController.allOrders.length;
                      final conversionRate = totalLeads == 0
                          ? 0
                          : (totalOrders / totalLeads * 100).toInt();
                      return _buildStatCard(
                        'Conversion Rate',
                        '$conversionRate%',
                        Colors.blue,
                        Icons.percent,
                      );
                    }),
                  ],
                );
              },
            ),

            const SizedBox(height: 24),

            // ==== LEADS MANAGEMENT CHART ====
            Container(
              decoration: BoxDecoration(
                color: scheme.surface.withValues(alpha: 0.9),
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.05),
                    blurRadius: 5,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const AppText(
                    'Leads vs Orders (Monthly)',
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                  const SizedBox(height: 16),
                  Obx(() {
                    final data = leadsController.chartData;
                    if (data.isEmpty) {
                      return const SizedBox(
                        height: 220,
                        child: Center(child: Text("No data")),
                      );
                    }

                    return SizedBox(
                      height: 220,
                      child: BarChart(
                        BarChartData(
                          backgroundColor: Colors.transparent,
                          gridData: FlGridData(show: false),
                          borderData: FlBorderData(show: false),
                          titlesData: FlTitlesData(
                            leftTitles: const AxisTitles(
                              sideTitles: SideTitles(showTitles: false),
                            ),
                            topTitles: const AxisTitles(
                              sideTitles: SideTitles(showTitles: false),
                            ),
                            rightTitles: const AxisTitles(
                              sideTitles: SideTitles(showTitles: false),
                            ),
                            bottomTitles: AxisTitles(
                              sideTitles: SideTitles(
                                showTitles: true,
                                getTitlesWidget: (value, meta) {
                                  int index = value.toInt();
                                  if (index < 0 || index >= data.length) {
                                    return const SizedBox();
                                  }
                                  return Padding(
                                    padding: const EdgeInsets.only(top: 8),
                                    child: AppText(
                                      data[index]['month'],
                                      fontSize: 12,
                                      fontWeight: FontWeight.w500,
                                    ),
                                  );
                                },
                                reservedSize: 28,
                              ),
                            ),
                          ),
                          barGroups: data.asMap().entries.map((entry) {
                            int index = entry.key;
                            double leads = entry.value['leads'];
                            double orders = entry.value['orders'];

                            return BarChartGroupData(
                              x: index,
                              barsSpace: 6,
                              barRods: [
                                BarChartRodData(
                                  toY: leads,
                                  gradient: const LinearGradient(
                                    colors: [Colors.amberAccent, Colors.amber],
                                    begin: Alignment.bottomCenter,
                                    end: Alignment.topCenter,
                                  ),
                                  borderRadius: BorderRadius.circular(6),
                                  width: 12,
                                ),
                                BarChartRodData(
                                  toY: orders,
                                  gradient: const LinearGradient(
                                    colors: [Colors.blueAccent, Colors.blue],
                                    begin: Alignment.bottomCenter,
                                    end: Alignment.topCenter,
                                  ),
                                  borderRadius: BorderRadius.circular(6),
                                  width: 12,
                                ),
                              ],
                            );
                          }).toList(),
                        ),
                      ),
                    );
                  }),
                  const SizedBox(height: 10),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      _buildLegend(Colors.amber, 'Leads'),
                      const SizedBox(width: 20),
                      _buildLegend(Colors.blueAccent, 'Orders'),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(height: 24),

            // ==== LEADS MANAGEMENT LIST ====
            const AppText(
              'Recent Leads',
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
            const SizedBox(height: 12),
            GetX<LeadsController>(
              init: LeadsController(),
              builder: (controller) {
                if (controller.isLoading.value) {
                  return const Center(child: CircularProgressIndicator());
                }

                if (controller.leads.isEmpty) {
                  return const Text("No recent leads");
                }

                // Show top 5 leads
                final displayLeads = controller.leads.take(5).toList();

                return ListView.separated(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: displayLeads.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 12),
                  itemBuilder: (context, index) {
                    final lead = displayLeads[index];

                    return LeadCard(lead: lead);
                  },
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  // ==== STAT CARD ====
  Widget _buildStatCard(
    String title,
    String value,
    Color color,
    IconData icon,
  ) {
    return Card(
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      elevation: 2,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: color.withValues(alpha: 0.1),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(width: 5),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.center,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  FittedText(
                    title,
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                  ),
                  AppText(
                    value,
                    fontSize: 30,
                    fontWeight: FontWeight.bold,
                    color: color,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ==== LEGEND ====
  Widget _buildLegend(Color color, String label) {
    return Row(
      children: [
        Container(width: 12, height: 12, color: color),
        const SizedBox(width: 6),
        AppText(label, fontSize: 12, fontWeight: FontWeight.w500),
      ],
    );
  }
}
