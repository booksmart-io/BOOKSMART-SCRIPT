import 'package:booksmart/models/deduction_rule_model.dart';
import 'package:booksmart/modules/admin/controllers/tax_deduction_rules_controller.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

class TaxDeductionRulesScreen extends StatefulWidget {
  const TaxDeductionRulesScreen({super.key});

  @override
  State<TaxDeductionRulesScreen> createState() =>
      _TaxDeductionRulesScreenState();
}

class _TaxDeductionRulesScreenState extends State<TaxDeductionRulesScreen> {
  late final TaxDeductionRulesController controller;

  @override
  void initState() {
    controller = Get.isRegistered<TaxDeductionRulesController>()
        ? Get.find<TaxDeductionRulesController>()
        : Get.put(TaxDeductionRulesController(), permanent: true);
    super.initState();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Tax Deduction Rules')),
      body: GetBuilder<TaxDeductionRulesController>(
        builder: (controller) {
          if (controller.isLoading && controller.groups.isEmpty) {
            return const Center(child: CircularProgressIndicator.adaptive());
          }

          return LayoutBuilder(
            builder: (context, constraints) {
              final isWide = constraints.maxWidth >= 900;
              final groups = _RuleGroupsPanel(controller: controller);
              final rules = _RulesPanel(controller: controller);

              if (!isWide) {
                return ListView(
                  padding: const EdgeInsets.all(16),
                  children: [groups, const SizedBox(height: 16), rules],
                );
              }

              return Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(width: 360, child: groups),
                  const VerticalDivider(width: 1),
                  Expanded(child: rules),
                ],
              );
            },
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showRuleGroupDialog(context, controller),
        icon: const Icon(Icons.add),
        label: const Text('Rule Group'),
      ),
    );
  }
}

class _RuleGroupsPanel extends StatelessWidget {
  const _RuleGroupsPanel({required this.controller});

  final TaxDeductionRulesController controller;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.all(16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Rule Groups',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                  ),
                ),
                IconButton(
                  tooltip: 'Refresh',
                  onPressed: controller.fetchInitialData,
                  icon: const Icon(Icons.refresh),
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (controller.groups.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Center(child: Text('No rule groups yet')),
              )
            else
              ...controller.groups.map(
                (group) => _RuleGroupTile(controller: controller, group: group),
              ),
          ],
        ),
      ),
    );
  }
}

class _RuleGroupTile extends StatelessWidget {
  const _RuleGroupTile({required this.controller, required this.group});

  final TaxDeductionRulesController controller;
  final DeductionRuleGroupModel group;

  @override
  Widget build(BuildContext context) {
    final isSelected = controller.selectedGroup?.id == group.id;

    return Card(
      elevation: isSelected ? 2 : 0,
      color: isSelected
          ? Theme.of(context).colorScheme.primaryContainer
          : Theme.of(context).colorScheme.surface,
      child: ListTile(
        selected: isSelected,
        title: Text(controller.jurisdictionName(group.stateId)),
        subtitle: Text(
          '${_dateLabel(group.validFrom)} - ${group.validTo == null ? 'Current' : _dateLabel(group.validTo!)}'
          '${group.description == null ? '' : '\n${group.description}'}',
        ),
        isThreeLine: group.description != null,
        onTap: () => controller.selectGroup(group),
        trailing: PopupMenuButton<String>(
          onSelected: (value) {
            if (value == 'edit') {
              _showRuleGroupDialog(context, controller, group: group);
            }
            if (value == 'delete') {
              _confirmDelete(
                context,
                title: 'Delete rule group?',
                message: 'Rules inside this group will also be deleted.',
                onConfirm: () => controller.deleteGroup(group.id),
              );
            }
          },
          itemBuilder: (context) => const [
            PopupMenuItem(value: 'edit', child: Text('Edit')),
            PopupMenuItem(value: 'delete', child: Text('Delete')),
          ],
        ),
      ),
    );
  }
}

class _RulesPanel extends StatelessWidget {
  const _RulesPanel({required this.controller});

  final TaxDeductionRulesController controller;

  @override
  Widget build(BuildContext context) {
    final group = controller.selectedGroup;

    return Card(
      margin: const EdgeInsets.all(16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    group == null
                        ? 'Rules'
                        : 'Rules for ${controller.jurisdictionName(group.stateId)}',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                FilledButton.icon(
                  onPressed: group == null
                      ? null
                      : () => _showRuleDialog(context, controller),
                  icon: const Icon(Icons.add),
                  label: const Text('Rule'),
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (group == null)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: Center(child: Text('Create or select a rule group')),
              )
            else if (controller.rules.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: Center(child: Text('No rules in this group yet')),
              )
            else
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: DataTable(
                  columns: const [
                    DataColumn(label: Text('Category')),
                    DataColumn(label: Text('Sub-category')),
                    DataColumn(label: Text('Rule')),
                    DataColumn(label: Text('Actions')),
                  ],
                  rows: controller.rules
                      .map(
                        (rule) => DataRow(
                          cells: [
                            DataCell(
                              Text(
                                controller.categoryNameForSubCategory(
                                  rule.subCategoryId,
                                ),
                              ),
                            ),
                            DataCell(
                              Text(
                                controller.subCategoryName(rule.subCategoryId),
                              ),
                            ),
                            DataCell(Text(controller.describeRule(rule))),
                            DataCell(
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  IconButton(
                                    tooltip: 'Edit',
                                    onPressed: () => _showRuleDialog(
                                      context,
                                      controller,
                                      rule: rule,
                                    ),
                                    icon: const Icon(Icons.edit_outlined),
                                  ),
                                  IconButton(
                                    tooltip: 'Delete',
                                    onPressed: () => _confirmDelete(
                                      context,
                                      title: 'Delete rule?',
                                      message: 'This cannot be undone.',
                                      onConfirm: () =>
                                          controller.deleteRule(rule.id),
                                    ),
                                    icon: const Icon(Icons.delete_outline),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      )
                      .toList(),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

Future<void> _showRuleGroupDialog(
  BuildContext context,
  TaxDeductionRulesController controller, {
  DeductionRuleGroupModel? group,
}) async {
  int? selectedStateId = group?.stateId;
  DateTime validFrom = group?.validFrom ?? DateTime.now();
  DateTime? validTo = group?.validTo;
  final descriptionController = TextEditingController(
    text: group?.description ?? '',
  );

  await showDialog<void>(
    context: context,
    builder: (context) {
      return StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            title: Text(group == null ? 'Add Rule Group' : 'Edit Rule Group'),
            content: SizedBox(
              width: 420,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    DropdownButtonFormField<int?>(
                      initialValue: selectedStateId,
                      decoration: const InputDecoration(
                        labelText: 'Jurisdiction',
                        border: OutlineInputBorder(),
                      ),
                      items: [
                        const DropdownMenuItem<int?>(
                          value: null,
                          child: Text('Federal'),
                        ),
                        ...controller.states.map(
                          (state) => DropdownMenuItem<int?>(
                            value: state.id,
                            child: Text(state.name),
                          ),
                        ),
                      ],
                      onChanged: (value) =>
                          setState(() => selectedStateId = value),
                    ),
                    const SizedBox(height: 12),
                    _DateButton(
                      label: 'Valid From',
                      value: validFrom,
                      onChanged: (value) {
                        if (value != null) {
                          setState(() => validFrom = value);
                        }
                      },
                    ),
                    const SizedBox(height: 12),
                    _DateButton(
                      label: 'Valid To',
                      value: validTo,
                      isOptional: true,
                      onChanged: (value) => setState(() => validTo = value),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: descriptionController,
                      maxLines: 2,
                      decoration: const InputDecoration(
                        labelText: 'Description',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(onPressed: Get.back, child: const Text('Cancel')),
              FilledButton(
                onPressed: () {
                  controller.saveGroup(
                    id: group?.id,
                    stateId: selectedStateId,
                    validFrom: validFrom,
                    validTo: validTo,
                    description: descriptionController.text,
                  );
                  Get.back();
                },
                child: Text(group == null ? 'Add' : 'Update'),
              ),
            ],
          );
        },
      );
    },
  );
}

Future<void> _showRuleDialog(
  BuildContext context,
  TaxDeductionRulesController controller, {
  DeductionRuleModel? rule,
}) async {
  final group = controller.selectedGroup;
  if (group == null) return;

  int? selectedSubCategoryId = rule?.subCategoryId;
  String? organizationColumnName = rule?.organizationColumnName;
  CalculationType calculationType =
      rule?.calculationType ?? CalculationType.percentage;
  bool isPerTransaction = rule?.isPerTransaction ?? false;
  final valueController = TextEditingController(
    text: rule == null ? '' : rule.value.toString(),
  );
  final maxController = TextEditingController(
    text: rule?.maxDeductionPerTransaction?.toString() ?? '',
  );

  await showDialog<void>(
    context: context,
    builder: (context) {
      return StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            title: Text(rule == null ? 'Add Rule' : 'Edit Rule'),
            content: SizedBox(
              width: 520,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    DropdownButtonFormField<int>(
                      initialValue: selectedSubCategoryId,
                      decoration: const InputDecoration(
                        labelText: 'Sub-category',
                        border: OutlineInputBorder(),
                      ),
                      items: controller.subCategories
                          .map(
                            (sub) => DropdownMenuItem<int>(
                              value: sub.id,
                              child: Text(
                                '${controller.categoryNameForSubCategory(sub.id)} > ${sub.name}',
                              ),
                            ),
                          )
                          .toList(),
                      onChanged: (value) =>
                          setState(() => selectedSubCategoryId = value),
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String?>(
                      initialValue: organizationColumnName,
                      decoration: const InputDecoration(
                        labelText: 'Organization percentage first',
                        border: OutlineInputBorder(),
                      ),
                      items: [
                        const DropdownMenuItem<String?>(
                          value: null,
                          child: Text('None'),
                        ),
                        ...TaxDeductionRulesController.organizationColumns.map(
                          (column) => DropdownMenuItem<String?>(
                            value: column,
                            child: Text(column),
                          ),
                        ),
                      ],
                      onChanged: (value) =>
                          setState(() => organizationColumnName = value),
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<CalculationType>(
                      initialValue: calculationType,
                      decoration: const InputDecoration(
                        labelText: 'Calculation Type',
                        border: OutlineInputBorder(),
                      ),
                      items: CalculationType.values
                          .map(
                            (type) => DropdownMenuItem(
                              value: type,
                              child: Text(
                                type.name.capitalizeFirst ?? type.name,
                              ),
                            ),
                          )
                          .toList(),
                      onChanged: (value) => setState(
                        () => calculationType =
                            value ?? CalculationType.percentage,
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: valueController,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(
                        labelText: calculationType == CalculationType.percentage
                            ? 'Value (%)'
                            : 'Value (\$)',
                        border: const OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Apply per transaction'),
                      value: isPerTransaction,
                      onChanged: (value) =>
                          setState(() => isPerTransaction = value),
                    ),
                    if (isPerTransaction) ...[
                      const SizedBox(height: 12),
                      TextField(
                        controller: maxController,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Max deduction per transaction (optional)',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(onPressed: Get.back, child: const Text('Cancel')),
              FilledButton(
                onPressed: () {
                  final subCategoryId = selectedSubCategoryId;
                  final value = double.tryParse(valueController.text.trim());
                  final maxValue = maxController.text.trim().isEmpty
                      ? null
                      : double.tryParse(maxController.text.trim());

                  if (subCategoryId == null || value == null) return;

                  controller.saveRule(
                    id: rule?.id,
                    groupId: group.id,
                    subCategoryId: subCategoryId,
                    calculationType: calculationType,
                    value: value,
                    organizationColumnName: organizationColumnName,
                    isPerTransaction: isPerTransaction,
                    maxDeductionPerTransaction: isPerTransaction
                        ? maxValue
                        : null,
                  );
                  Get.back();
                },
                child: Text(rule == null ? 'Add' : 'Update'),
              ),
            ],
          );
        },
      );
    },
  );
}

Future<void> _confirmDelete(
  BuildContext context, {
  required String title,
  required String message,
  required VoidCallback onConfirm,
}) async {
  await showDialog<void>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(onPressed: Get.back, child: const Text('Cancel')),
        FilledButton(
          onPressed: () {
            onConfirm();
            Get.back();
          },
          child: const Text('Delete'),
        ),
      ],
    ),
  );
}

class _DateButton extends StatelessWidget {
  const _DateButton({
    required this.label,
    required this.value,
    required this.onChanged,
    this.isOptional = false,
  });

  final String label;
  final DateTime? value;
  final ValueChanged<DateTime?> onChanged;
  final bool isOptional;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: OutlinedButton(
            onPressed: () async {
              final picked = await showDatePicker(
                context: context,
                firstDate: DateTime(2000),
                lastDate: DateTime(2100),
                initialDate: value ?? DateTime.now(),
              );
              if (picked != null) onChanged(picked);
            },
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                '$label: ${value == null ? 'Current' : _dateLabel(value!)}',
              ),
            ),
          ),
        ),
        if (isOptional) ...[
          const SizedBox(width: 8),
          IconButton(
            tooltip: 'Clear',
            onPressed: () => onChanged(null),
            icon: const Icon(Icons.clear),
          ),
        ],
      ],
    );
  }
}

String _dateLabel(DateTime date) => date.toIso8601String().split('T').first;
