import 'package:booksmart/helpers/date_formatter.dart';
import 'package:booksmart/widgets/custom_dialog.dart';
import 'package:booksmart/widgets/loading.dart';
import 'package:booksmart/widgets/snackbar.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../../../widgets/date_range_picker.dart';
import '../../../controllers/ai_stragey_controller.dart';
import '../../../controllers/grouped_transaction_controller.dart';
import '../../../controllers/organization_controller.dart';
import '../../../utils/ai_chat_utils.dart';

Future<dynamic> showGenerateStrategiesDialog() async {
  DateTimeRange activeRange = DateTimeRange(
    start: DateTime(DateTime.now().year, 1, 1),
    end: DateTime.now(),
  );

  return customDialog(
    title: "Generate Tax Strategies",
    child: StatefulBuilder(
      builder: (context, setState) {
        return SingleChildScrollView(
          padding: EdgeInsets.all(15),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DateRangePickerWidget(
                onDateRangeSelected: (start, end) {
                  setState(() {
                    activeRange = DateTimeRange(start: start, end: end);
                  });
                },
                initialText: "Select Date Range",
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 20,
                ),
              ),
              const SizedBox(height: 10),

              Text(
                "${formatDate(activeRange.start)} to ${formatDate(activeRange.end)}",
              ),

              const SizedBox(height: 10),

              // Info Container
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.info_outline, size: 20),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        "We will securely share your financial data within the selected date range, along with your business information, with our AI model to generate personalized tax strategies.\n\nAre you sure you want to proceed?",
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 20),

              // Buttons
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(
                    onPressed: () {
                      Navigator.pop(context);
                    },
                    child: const Text("Cancel"),
                  ),
                  const SizedBox(width: 10),
                  ElevatedButton(
                    onPressed: () async {
                      showLoading();
                      String groupTransactionControllerTag =
                          getGroupedTransactionControllerTag(
                            activeRange.start,
                            activeRange.end,
                          );
                      List<dynamic> financeData =
                          Get.isRegistered<GroupedTransactionController>(
                            tag: groupTransactionControllerTag,
                          )
                          ? Get.find<GroupedTransactionController>(
                              tag: groupTransactionControllerTag,
                            ).groupedTransactions
                          : await Get.put(
                              GroupedTransactionController(
                                startDate: activeRange.start,
                                endDate: activeRange.end,
                              ),
                              tag: groupTransactionControllerTag,
                              permanent: true,
                            ).loadData();

                      await generateAndStoreStrategies(
                        business: organizationControllerInstance
                            .currentOrganization!
                            .getJsonForAI(),
                        finances: financeData,
                        existingStrategies:
                            aiStrategyControllerInstance.strategies,
                      ).then((success) {
                        dismissLoadingWidget();
                        if (success) {
                          aiStrategyControllerInstance.loadStrategies();
                          Get.back();
                          showSnackBar("Strategies generated successfully");
                        } else {
                          somethingWentWrongSnackbar();
                        }
                      });
                    },
                    child: const Text("Proceed"),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    ),
  );
}
