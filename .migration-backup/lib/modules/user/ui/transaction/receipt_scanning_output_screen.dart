// ignore_for_file: use_build_context_synchronously

import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/widgets/snackbar.dart';
import 'package:camera/camera.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:get/get.dart';

Future<Map<String, dynamic>?> openReceiptScanner() async {
  if (kIsWeb) {
    return await Get.dialog(const ReceiptFilePickerDialog());
  } else {
    return await Get.to(() => const ReceiptScanningOutputScreen());
  }
}

// ====================
// Mobile Receipt Scanner
// ====================
class ReceiptScanningOutputScreen extends StatefulWidget {
  const ReceiptScanningOutputScreen({super.key});

  @override
  State<ReceiptScanningOutputScreen> createState() =>
      _ReceiptScanningOutputScreenState();
}

class _ReceiptScanningOutputScreenState
    extends State<ReceiptScanningOutputScreen> {
  XFile? _selectedFile;
  Uint8List? _selectedFileBytes; // preview

  String merchant = "PHOSPHOR";
  String date = "April 21, 2024";
  double amount = 29.99;

  /// Capture image from camera
  Future<void> _captureImage() async {
    try {
      final cameras = await availableCameras();
      final firstCamera = cameras.first;

      final image = await Navigator.push<XFile?>(
        context,
        MaterialPageRoute(
          builder: (_) => TakePictureScreen(camera: firstCamera),
        ),
      );

      if (image != null) {
        final bytes = await image.readAsBytes();
        setState(() {
          _selectedFile = image;
          _selectedFileBytes = bytes;
        });
      }
    } catch (e) {
      showSnackBar("Error accessing camera: $e", isError: true);
    }
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _captureImage());
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(title: const Text("Receipt Scanner")),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Container(
              height: 200,
              width: double.infinity,
              decoration: BoxDecoration(
                color: colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(12),
              ),
              child: _selectedFileBytes != null
                  ? Image.memory(_selectedFileBytes!, fit: BoxFit.cover)
                  : Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.receipt_long,
                            size: 50,
                            color: colorScheme.onSurface.withValues(alpha: 0.5),
                          ),
                          const SizedBox(height: 8),
                          const AppText("No receipt captured"),
                        ],
                      ),
                    ),
            ),
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                ElevatedButton.icon(
                  onPressed: _captureImage,
                  icon: const Icon(Icons.camera_alt),
                  label: const AppText("Retake Photo"),
                ),
                const SizedBox(width: 16),
                if (_selectedFileBytes != null)
                  ElevatedButton(
                    onPressed: () {
                      setState(() {
                        _selectedFile = null;
                        _selectedFileBytes = null;
                      });
                    },

                    child: const AppText("Remove"),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _selectedFileBytes == null
                  ? null
                  : () {
                      Navigator.pop(context, {
                        'merchant': merchant,
                        'date': date,
                        'amount': amount,
                        'imagePath': _selectedFile?.path,
                        'fileBytes': _selectedFileBytes,
                      });
                    },
              child: const AppText("Attach to Transaction"),
            ),
          ],
        ),
      ),
    );
  }
}

// ====================
// Camera Screen
// ====================
class TakePictureScreen extends StatefulWidget {
  final CameraDescription camera;
  const TakePictureScreen({super.key, required this.camera});

  @override
  State<TakePictureScreen> createState() => _TakePictureScreenState();
}

class _TakePictureScreenState extends State<TakePictureScreen> {
  late CameraController _controller;
  late Future<void> _initializeControllerFuture;

  @override
  void initState() {
    super.initState();
    _controller = CameraController(widget.camera, ResolutionPreset.medium);
    _initializeControllerFuture = _controller.initialize();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(title: const Text("Capture Receipt")),
      body: FutureBuilder<void>(
        future: _initializeControllerFuture,
        builder: (_, snapshot) {
          if (snapshot.connectionState == ConnectionState.done) {
            return CameraPreview(_controller);
          } else {
            return Center(
              child: CircularProgressIndicator(color: colorScheme.primary),
            );
          }
        },
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () async {
          await _initializeControllerFuture;
          final image = await _controller.takePicture();
          Navigator.pop(context, image);
        },
        child: Icon(Icons.camera_alt, color: colorScheme.onPrimary),
      ),
    );
  }
}

// ====================
// Web File Picker Dialog
// ====================
class ReceiptFilePickerDialog extends StatefulWidget {
  const ReceiptFilePickerDialog({super.key});

  @override
  State<ReceiptFilePickerDialog> createState() =>
      _ReceiptFilePickerDialogState();
}

class _ReceiptFilePickerDialogState extends State<ReceiptFilePickerDialog> {
  XFile? _selectedFile;
  Uint8List? _selectedFileBytes;

  Future<void> _pickFile() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.image,
      withData: true,
    );

    if (result != null && result.files.single.bytes != null) {
      setState(() {
        _selectedFileBytes = result.files.single.bytes;
        _selectedFile = XFile(result.files.single.path ?? "");
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final isDesktop = MediaQuery.of(context).size.width > 600;

    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: isDesktop ? 420 : double.infinity,
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const AppText(
                "Upload Receipt",
                fontWeight: FontWeight.bold,
                fontSize: 16,
              ),
              const SizedBox(height: 16),

              /// Upload Area
              InkWell(
                onTap: _pickFile,
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  height: 180,
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: colorScheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: _selectedFileBytes == null
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: const [
                              Icon(Icons.upload_file, size: 48),
                              SizedBox(height: 8),
                              AppText("Select receipt image"),
                            ],
                          ),
                        )
                      : ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.memory(
                            _selectedFileBytes!,
                            fit: BoxFit.cover,
                          ),
                        ),
                ),
              ),

              const SizedBox(height: 20),

              /// Buttons
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (_selectedFileBytes != null)
                    OutlinedButton(
                      onPressed: () {
                        setState(() {
                          _selectedFile = null;
                          _selectedFileBytes = null;
                        });
                      },
                      child: const AppText("Remove"),
                    ),

                  if (_selectedFileBytes != null) const SizedBox(width: 12),

                  ElevatedButton(
                    onPressed: _selectedFileBytes == null
                        ? null
                        : () => Navigator.pop(context, {
                            'imagePath': _selectedFile?.path,
                            'fileBytes': _selectedFileBytes,
                          }),
                    child: const AppText("Attach Receipt"),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
