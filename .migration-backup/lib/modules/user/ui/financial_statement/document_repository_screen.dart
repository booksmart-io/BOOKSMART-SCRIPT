import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/widgets/custom_dialog.dart';
import 'package:flutter/foundation.dart';
import 'package:get/get.dart';

void goToDocumentRepositoryScreen({bool shouldCloseBefore = false}) {
  if (kIsWeb) {
    if (shouldCloseBefore) {
      Get.back(); // close previous dialog
    }
    customDialog(
      child: const DocumentRepositoryScreen(),
      title: 'Document Repository',
      barrierDismissible: true,
    );
  } else {
    if (shouldCloseBefore) {
      Get.off(() => const DocumentRepositoryScreen());
    } else {
      Get.to(() => const DocumentRepositoryScreen());
    }
  }
}

class DocumentRepositoryScreen extends StatefulWidget {
  const DocumentRepositoryScreen({super.key});

  @override
  State<DocumentRepositoryScreen> createState() =>
      _DocumentRepositoryScreenState();
}

class _DocumentRepositoryScreenState extends State<DocumentRepositoryScreen> {
  final TextEditingController _searchController = TextEditingController();
  String _selectedCategory = 'All';

  final List<Map<String, dynamic>> _allDocuments = [
    {
      'title': 'W-9 Form - John Doe',
      'type': 'W-9',
      'category': 'Tax Forms',
      'date': 'Nov 15, 2024',
      'status': 'Uploaded',
      'color': Colors.green,
      'size': '2.4 MB',
    },
    {
      'title': '1099-INT - Bank of America',
      'type': '1099',
      'category': 'Income',
      'date': 'Jan 30, 2024',
      'status': 'Verified',
      'color': Colors.blue,
      'size': '1.8 MB',
    },
    {
      'title': 'Business Expense Receipts Q1',
      'type': 'Receipts',
      'category': 'Expenses',
      'date': 'Mar 20, 2024',
      'status': 'Uploaded',
      'color': Colors.green,
      'size': '5.2 MB',
    },
    {
      'title': 'W-2 - TechCorp Inc',
      'type': 'W-2',
      'category': 'Employment',
      'date': 'Feb 15, 2024',
      'status': 'Processed',
      'color': Colors.blue,
      'size': '3.1 MB',
    },
  ];

  final List<String> _categories = [
    'All',
    'W-9',
    '1099',
    'W-2',
    'Receipts',
    'Tax Forms',
    'Income',
    'Expenses',
    'Employment',
  ];

  List<Map<String, dynamic>> get _filteredDocuments {
    if (_searchController.text.isEmpty && _selectedCategory == 'All') {
      return _allDocuments;
    }

    return _allDocuments.where((doc) {
      final matchesSearch = doc['title'].toLowerCase().contains(
        _searchController.text.toLowerCase(),
      );
      final matchesCategory =
          _selectedCategory == 'All' ||
          doc['type'] == _selectedCategory ||
          doc['category'] == _selectedCategory;
      return matchesSearch && matchesCategory;
    }).toList();
  }

  Map<String, List<Map<String, dynamic>>> get _groupedDocuments {
    final Map<String, List<Map<String, dynamic>>> grouped = {};
    for (var doc in _filteredDocuments) {
      final category = doc['category'];
      grouped.putIfAbsent(category, () => []).add(doc);
    }
    return grouped;
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: kIsWeb ? null : AppBar(title: const Text("Document Repository")),
      body: Column(
        children: [
          // Search + Filter
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                // Search Bar
                TextField(
                  controller: _searchController,
                  decoration: InputDecoration(
                    filled: true,
                    fillColor: isDark
                        ? colorScheme.surfaceContainerHighest
                        : colorScheme.surfaceContainerHighest,
                    hintText: 'Search documents...',
                    hintStyle: TextStyle(
                      color: colorScheme.onSurface.withValues(alpha: 0.6),
                    ),
                    prefixIcon: Icon(
                      Icons.search,
                      color: colorScheme.onSurface.withValues(alpha: 0.6),
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: BorderSide.none,
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
                  ),
                  style: TextStyle(color: colorScheme.onSurface),
                  onChanged: (value) => setState(() {}),
                ),
                const SizedBox(height: 12),

                // Category Chips
                SizedBox(
                  height: 40,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: _categories.map((category) {
                      final isSelected = _selectedCategory == category;
                      return Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: FilterChip(
                          label: Text(
                            category,
                            style: TextStyle(
                              color: isSelected
                                  ? colorScheme.onPrimary
                                  : colorScheme.onSurfaceVariant,
                            ),
                          ),
                          selected: isSelected,
                          onSelected: (selected) {
                            setState(() {
                              _selectedCategory = selected ? category : 'All';
                            });
                          },
                          backgroundColor: colorScheme.surfaceContainerHighest,
                          selectedColor: colorScheme.primary,
                          checkmarkColor: colorScheme.onPrimary,
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ],
            ),
          ),

          // Documents List
          Expanded(
            child: _filteredDocuments.isEmpty
                ? Center(
                    child: AppText(
                      'Documents will appear here',
                      color: colorScheme.onSurfaceVariant,
                      fontSize: 16,
                    ),
                  )
                : ListView(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    children: _buildCategorySections(colorScheme),
                  ),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildCategorySections(ColorScheme colorScheme) {
    final grouped = _groupedDocuments;
    final List<Widget> widgets = [];

    grouped.forEach((category, documents) {
      widgets.add(
        Padding(
          padding: const EdgeInsets.only(top: 16, bottom: 8),
          child: AppText(
            category,
            color: colorScheme.onSurface,
            fontSize: 18,
            fontWeight: FontWeight.bold,
          ),
        ),
      );

      widgets.addAll(
        documents.map((doc) {
          return _documentTile(
            doc['title'],
            doc['type'],
            doc['date'],
            doc['status'],
            doc['color'],
            doc['size'],
            colorScheme,
          );
        }),
      );
    });

    return widgets;
  }

  Widget _documentTile(
    String title,
    String type,
    String date,
    String status,
    Color statusColor,
    String size,
    ColorScheme colorScheme,
  ) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: colorScheme.outline.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Title & Status
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: AppText(
                  title,
                  color: colorScheme.onSurface,
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: statusColor.withValues(alpha: 0.7)),
                ),
                child: AppText(
                  status,
                  color: statusColor,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          AppText(
            "Type: $type",
            color: colorScheme.onSurfaceVariant,
            fontSize: 14,
          ),
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              AppText(date, color: colorScheme.onSurfaceVariant, fontSize: 13),
              AppText(
                size,
                color: colorScheme.onSurfaceVariant.withValues(alpha: 0.8),
                fontSize: 12,
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Action Buttons
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              _actionButton(Icons.visibility, 'View', () {}, colorScheme),
              const SizedBox(width: 8),
              _actionButton(Icons.download, 'Download', () {}, colorScheme),
              const SizedBox(width: 8),
              _actionButton(Icons.share, 'Share', () {}, colorScheme),
            ],
          ),
        ],
      ),
    );
  }

  Widget _actionButton(
    IconData icon,
    String label,
    VoidCallback onPressed,
    ColorScheme colorScheme,
  ) {
    return TextButton.icon(
      onPressed: onPressed,
      icon: Icon(icon, size: 16, color: colorScheme.primary),
      label: AppText(label, color: colorScheme.primary, fontSize: 12),
      style: TextButton.styleFrom(
        backgroundColor: colorScheme.primary.withValues(alpha: 0.1),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
      ),
    );
  }
}
