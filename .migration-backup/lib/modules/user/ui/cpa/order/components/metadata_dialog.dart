import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/widgets/custom_drop_down.dart';
import 'package:dropdown_search/dropdown_search.dart';
import 'package:file_picker/file_picker.dart';
import 'package:get/get.dart';
import 'package:path/path.dart' as p; // Use alias 'p' to avoid name collisions

class DocumentMetadata {
  final String name;
  final String? year;
  final String? category;
  final XFile file;

  DocumentMetadata({
    required this.name,
    this.year,
    this.category,
    required this.file,
  });
}

Future<DocumentMetadata?> showDocumentMetadataDialog({XFile? file}) async {
  return await Get.generalDialog<DocumentMetadata>(
    pageBuilder: (context, animation, secondaryAnimation) {
      return Align(
        alignment: Alignment.center,
        child: Container(
          margin: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            color: Get.isDarkMode
                ? Get.theme.colorScheme.surface
                : Colors.white,
          ),
          constraints: const BoxConstraints(maxWidth: 450),
          child: Material(
            color: Colors.transparent,
            child: _MetadataDialogContent(initialFile: file),
          ),
        ),
      );
    },
    barrierDismissible: true,
    barrierLabel: 'showDocumentMetadataDialog',
  );
}

class _MetadataDialogContent extends StatefulWidget {
  final XFile? initialFile;
  const _MetadataDialogContent({this.initialFile});

  @override
  State<_MetadataDialogContent> createState() => _MetadataDialogContentState();
}

class _MetadataDialogContentState extends State<_MetadataDialogContent> {
  final List<String> categories = [
    'Income',
    'Expenses',
    'Forms',
    'Education',
    'Other',
  ];

  final yearDropdownKey = GlobalKey<DropdownSearchState<String>>();
  final categoryDropdownKey = GlobalKey<DropdownSearchState<String>>();

  // FIXED: Removed 'late final' to avoid the LateInitializationError
  // during complex build cycles.
  late TextEditingController nameCtrl;

  XFile? selectedFile;
  String? selectedYear;
  String? selectedCategory;

  @override
  void initState() {
    super.initState();
    selectedFile = widget.initialFile;

    // Initialize controller with initial text based on the file name
    String initialName = '';
    if (selectedFile != null) {
      initialName = p.basenameWithoutExtension(selectedFile!.name);
    }

    nameCtrl = TextEditingController(text: initialName);
  }

  @override
  void dispose() {
    nameCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickFile() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        withData: true,
        type: FileType.any,
      );

      if (result != null && result.files.single.bytes != null) {
        final f = result.files.single;
        setState(() {
          selectedFile = XFile.fromData(f.bytes!, name: f.name, path: f.path);
          // Only update name if it's currently empty to avoid overwriting user input
          if (nameCtrl.text.isEmpty) {
            nameCtrl.text = p.basenameWithoutExtension(f.name);
          }
        });
      }
    } catch (e) {
      Get.snackbar(
        "Error",
        "Error picking file: $e",
        snackPosition: SnackPosition.BOTTOM,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Center(
            child: AppText(
              'Add Document to Delivery',
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 20),

          // File Selection Area
          if (selectedFile == null)
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _pickFile,
                icon: const Icon(Icons.cloud_upload_outlined),
                label: const Text('Pick Document File'),
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
              ),
            )
          else
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.blue.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.blue.withValues(alpha: 0.3)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.insert_drive_file, color: Colors.blue),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          selectedFile!.name,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const Text(
                          'Selected File',
                          style: TextStyle(fontSize: 12, color: Colors.grey),
                        ),
                      ],
                    ),
                  ),
                  TextButton(onPressed: _pickFile, child: const Text('Change')),
                ],
              ),
            ),
          const SizedBox(height: 20),

          AppTextField(
            controller: nameCtrl,
            hintText: 'Document Name *',
            labelText: 'Document Name',
            keyboardType: TextInputType.name,
          ),
          const SizedBox(height: 12),

          CustomDropDownWidget<String>(
            dropDownKey: yearDropdownKey,
            label: 'Tax Year',
            hint: 'Select Year',
            items: const ['2026', '2025', '2024', '2023', '2022'],
            onChanged: (v) => setState(() => selectedYear = v),
          ),
          const SizedBox(height: 12),

          CustomDropDownWidget<String>(
            dropDownKey: categoryDropdownKey,
            label: 'Category',
            hint: 'Select Category',
            items: categories,
            onChanged: (v) => setState(() => selectedCategory = v),
          ),
          const SizedBox(height: 28),

          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Get.back(),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: const AppText('Cancel', color: Colors.white),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: AppButton(
                  buttonText: 'Process',
                  onTapFunction: () {
                    if (selectedFile == null) {
                      Get.snackbar('Required', 'Please select a file first');
                      return;
                    }
                    if (nameCtrl.text.trim().isEmpty) {
                      Get.snackbar('Required', 'Please enter a document name');
                      return;
                    }

                    Get.back(
                      result: DocumentMetadata(
                        name: nameCtrl.text.trim(),
                        year: selectedYear,
                        category: selectedCategory,
                        file: selectedFile!,
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
