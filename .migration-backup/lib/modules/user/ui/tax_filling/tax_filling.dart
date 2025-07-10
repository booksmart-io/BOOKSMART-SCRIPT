import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/models/user_document_model.dart';
import 'package:booksmart/modules/user/controllers/tax_document_controller.dart';
import 'package:booksmart/modules/user/ui/tax_filling/document_access_requests_dialog.dart';
import 'package:booksmart/modules/user/ui/tax_filling/upload_tax_doc_dialog.dart';
import 'package:dropdown_search/dropdown_search.dart';
import 'package:flutter/foundation.dart';
import 'package:get/get.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../../widgets/custom_drop_down.dart';

class TaxFillingScreen extends StatefulWidget {
  const TaxFillingScreen({super.key});

  @override
  State<TaxFillingScreen> createState() => _TaxFillingScreenState();
}

Color getTaxDocStatusColor(String status, bool isDark) {
  switch (status) {
    case 'Ready':
      return isDark ? Colors.greenAccent : Colors.green;
    case 'Review':
      return isDark ? Colors.orangeAccent : Colors.orange;
    case 'Missing':
      return isDark ? Colors.redAccent : Colors.red;
    default:
      return isDark ? Colors.grey[400]! : Colors.grey[700]!;
  }
}

class _TaxFillingScreenState extends State<TaxFillingScreen> {
  final yearDropdownKey = GlobalKey<DropdownSearchState<String>>();
  final docTypeDropdownKey = GlobalKey<DropdownSearchState<String>>();

  late final TaxDocumentController _ctrl;

  // Local search / filter state
  String _search = '';
  String? _selectedYear;
  String? _selectedCategory;

  @override
  void initState() {
    super.initState();
    _ctrl = Get.isRegistered<TaxDocumentController>()
        ? Get.find<TaxDocumentController>()
        : Get.put(TaxDocumentController());
  }

  List<UserDocument> get _filtered {
    var list = _ctrl.documents.toList();
    if (_search.isNotEmpty) {
      list = list
          .where((d) => d.name.toLowerCase().contains(_search.toLowerCase()))
          .toList();
    }
    if (_selectedYear != null) {
      list = list.where((d) => d.taxYear == _selectedYear).toList();
    }
    if (_selectedCategory != null) {
      list = list.where((d) => d.category == _selectedCategory).toList();
    }
    return list;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: kIsWeb ? null : AppBar(title: const Text('Tax Filing')),
      body: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          children: [
            // ── Search + Upload ──────────────────────────────────────────
            SizedBox(
              height: 35,
              width: Get.width,
              child: Row(
                spacing: 7,
                children: [
                  Expanded(
                    flex: 5,
                    child: AppTextField(
                      hintText: 'Search documents…',
                      keyboardType: TextInputType.text,
                      suffixWidget: const Icon(Icons.search),
                      onChanged: (v) => setState(() => _search = v),
                      padding: EdgeInsets.zero,
                    ),
                  ),
                  Expanded(
                    child: outlineButton(
                      'Upload',
                      onPressed: showUploadTaxDocumentDialog,
                      padding: EdgeInsets.symmetric(
                        vertical: 10,
                        horizontal: 3,
                      ),
                    ),
                  ),
                  Expanded(
                    child: outlineButton(
                      'Access',
                      onPressed: showDocumentAccessRequestsDialog,
                      padding: EdgeInsets.symmetric(
                        vertical: 10,
                        horizontal: 3,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 10),

            // ── Filters ───────────────────────────────────────────────────
            Row(
              spacing: 5,
              children: [
                _filterDropdown(
                  dropDownKey: yearDropdownKey,
                  label: 'Tax Year',
                  items: const ['2025', '2024', '2023', '2022'],
                  onChanged: (v) => setState(() => _selectedYear = v),
                ),
                _filterDropdown(
                  dropDownKey: docTypeDropdownKey,
                  label: 'Category',
                  items: const [
                    'Income',
                    'Expenses',
                    'Forms',
                    'Education',
                    'Other',
                  ],
                  onChanged: (v) => setState(() => _selectedCategory = v),
                ),
              ],
            ),

            const SizedBox(height: 10),

            // ── Document list ─────────────────────────────────────────────
            Expanded(
              child: Obx(() {
                if (_ctrl.isLoading.value) {
                  return const Center(child: CircularProgressIndicator());
                }

                final docs = _filtered;

                if (docs.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.folder_open,
                          size: 56,
                          color: Colors.grey.shade400,
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'No documents found.\nTap Upload to add one.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Colors.grey.shade500),
                        ),
                      ],
                    ),
                  );
                }

                return ListView.builder(
                  itemCount: docs.length,
                  itemBuilder: (context, index) {
                    return TaxDocumentCard(
                      doc: docs[index],
                      onDelete: () => _ctrl.deleteDocument(docs[index]),
                    );
                  },
                );
              }),
            ),
          ],
        ),
      ),
    );
  }

  Widget _filterDropdown({
    required GlobalKey<DropdownSearchState<String>> dropDownKey,
    required String label,
    required List<String> items,
    ValueChanged<String?>? onChanged,
  }) {
    return Expanded(
      child: CustomDropDownWidget<String>(
        dropDownKey: dropDownKey,
        label: label,
        hint: 'Select $label',
        items: items,
        onChanged: onChanged,
      ),
    );
  }
}

// ── Document card ────────────────────────────────────────────────────────────

class TaxDocumentCard extends StatelessWidget {
  const TaxDocumentCard({super.key, required this.doc, required this.onDelete});

  final UserDocument doc;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? Colors.white : Colors.black87;
    final subTextColor = isDark ? Colors.white60 : Colors.black54;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: () {
          if (doc.fileUrl.isNotEmpty) {
            final uri = Uri.tryParse(doc.fileUrl);
            if (uri != null) {
              launchUrl(uri, mode: LaunchMode.externalApplication);
            }
          }
        },
        child: ListTile(
          leading: Icon(TaxDocumentController.iconForMime(doc.mimeType)),
          title: Text(doc.name, style: TextStyle(color: textColor)),
          subtitle: Text(
            [
              if (doc.fileSizeLabel.isNotEmpty) doc.fileSizeLabel,
              if (doc.category != null) doc.category!,
            ].join(' · '),
            style: TextStyle(color: subTextColor, fontSize: 12),
          ),
          visualDensity: VisualDensity.compact,
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (doc.taxYear != null)
                Text(
                  doc.taxYear!,
                  style: TextStyle(
                    color: subTextColor,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              PopupMenuButton<String>(
                icon: const Icon(Icons.more_vert),
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'Delete', child: Text('Delete')),
                ],
                onSelected: (val) {
                  if (val == 'Delete') onDelete();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
