import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/models/document_access_request_model.dart';
import 'package:booksmart/models/lead_model.dart';
import 'package:booksmart/models/user_document_model.dart';
import 'package:booksmart/modules/common/controllers/auth_controller.dart';
import 'package:booksmart/modules/user/controllers/document_access_controller.dart';
import 'package:booksmart/modules/user/controllers/tax_document_controller.dart';
import 'package:get/get.dart';
import 'package:url_launcher/url_launcher.dart';

/// Entry point — called from the "Documents" button in LeadsScreenCPA.
void showUserDocumentsDialog({required LeadModel lead}) {
  // Ensure controller is available
  if (!Get.isRegistered<DocumentAccessController>()) {
    Get.put(DocumentAccessController());
  }

  Get.generalDialog(
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
          constraints: const BoxConstraints(maxWidth: 480, maxHeight: 600),
          child: Material(
            color: Colors.transparent,
            child: _UserDocumentsDialogContent(lead: lead),
          ),
        ),
      );
    },
    barrierDismissible: true,
    barrierLabel: 'userDocumentsDialog',
  );
}

Future<void> _launchUrl(String url) async {
  final Uri uri = Uri.parse(url);
  if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
    Get.snackbar('Error', 'Could not open document');
  }
}

class _UserDocumentsDialogContent extends StatefulWidget {
  final LeadModel lead;
  const _UserDocumentsDialogContent({required this.lead});

  @override
  State<_UserDocumentsDialogContent> createState() =>
      _UserDocumentsDialogContentState();
}

class _UserDocumentsDialogContentState
    extends State<_UserDocumentsDialogContent> {
  final _ctrl = Get.find<DocumentAccessController>();

  /// null = still loading, true = access granted, false = no access
  bool? _hasAccess;
  DocumentAccessRequest? _existingRequest;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final cpaId = authPerson?.id ?? -1;
    final req = await _ctrl.getRequest(
      cpaId: cpaId,
      userId: widget.lead.userId,
    );

    if (!mounted) return;

    setState(() {
      _existingRequest = req;
      _hasAccess = req?.status == DocumentAccessStatus.accepted;
      _loading = false;
    });

    if (_hasAccess == true) {
      // Pass both so the controller can fallback if authId is missing
      await _ctrl.fetchUserDocuments(widget.lead.userId);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const SizedBox(
        height: 200,
        child: Center(child: CircularProgressIndicator()),
      );
    }

    return _hasAccess == true
        ? _DocumentsGrantedView(ctrl: _ctrl)
        : _NoAccessView(
            lead: widget.lead,
            ctrl: _ctrl,
            existingRequest: _existingRequest,
            onRequestSent: () => setState(() {
              _existingRequest = DocumentAccessRequest(
                id: -1,
                orderId: null,
                cpaId: authPerson?.id ?? -1,
                userId: widget.lead.userId,
                status: DocumentAccessStatus.pending,
                requestedAt: DateTime.now(),
                createdAt: DateTime.now(),
                updatedAt: DateTime.now(),
              );
            }),
          );
  }
}

// ── Granted: show document list ──────────────────────────────────────────────

class _DocumentsGrantedView extends StatelessWidget {
  final DocumentAccessController ctrl;
  const _DocumentsGrantedView({required this.ctrl});

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      if (ctrl.isLoading.value) {
        return const SizedBox(
          height: 200,
          child: Center(child: CircularProgressIndicator()),
        );
      }

      final docs = ctrl.userDocuments;

      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 8, 4),
            child: Row(
              children: [
                const Icon(Icons.folder_open, size: 22),
                const SizedBox(width: 8),
                const Expanded(
                  child: AppText(
                    'User Documents',
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Get.back(),
                ),
              ],
            ),
          ),
          const Divider(height: 1),

          // List
          if (docs.isEmpty)
            const Padding(
              padding: EdgeInsets.all(32),
              child: Column(
                children: [
                  Icon(Icons.folder_open, size: 48, color: Colors.grey),
                  SizedBox(height: 12),
                  Text(
                    'No documents uploaded yet.',
                    style: TextStyle(color: Colors.grey),
                  ),
                ],
              ),
            )
          else
            Flexible(
              child: ListView.builder(
                shrinkWrap: true,
                padding: const EdgeInsets.symmetric(vertical: 8),
                itemCount: docs.length,
                itemBuilder: (ctx, i) {
                  final doc = docs[i];
                  return _DocTile(doc: doc);
                },
              ),
            ),

          // Close button
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
            child: SizedBox(
              width: double.infinity,
              child: AppButton(
                buttonText: 'Close',
                onTapFunction: () => Get.back(),
              ),
            ),
          ),
        ],
      );
    });
  }
}

class _DocTile extends StatelessWidget {
  final UserDocument doc;
  const _DocTile({required this.doc});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final subColor = isDark ? Colors.white60 : Colors.black54;

    return ListTile(
      leading: Icon(TaxDocumentController.iconForMime(doc.mimeType)),
      title: Text(doc.name),
      subtitle: Text(
        [
          if (doc.fileSizeLabel.isNotEmpty) doc.fileSizeLabel,
          if (doc.category != null) doc.category!,
          if (doc.taxYear != null) doc.taxYear!,
        ].join(' · '),
        style: TextStyle(fontSize: 12, color: subColor),
      ),
      dense: true,
      trailing: IconButton(
        onPressed: () => _launchUrl(doc.fileUrl),
        icon: const Icon(Icons.download),
      ),
    );
  }
}

// ── No access: show request button ───────────────────────────────────────────

class _NoAccessView extends StatelessWidget {
  final LeadModel lead;
  final DocumentAccessController ctrl;
  final DocumentAccessRequest? existingRequest;
  final VoidCallback onRequestSent;

  const _NoAccessView({
    required this.lead,
    required this.ctrl,
    required this.existingRequest,
    required this.onRequestSent,
  });

  @override
  Widget build(BuildContext context) {
    final isPending = existingRequest?.status == DocumentAccessStatus.pending;
    final isRejected = existingRequest?.status == DocumentAccessStatus.rejected;

    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Header
          Row(
            children: [
              const Icon(Icons.lock_outline, size: 22),
              const SizedBox(width: 8),
              const Expanded(
                child: AppText(
                  'Documents',
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close),
                onPressed: () => Get.back(),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // Status icon
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.orange.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: Icon(
              isPending
                  ? Icons.hourglass_top_rounded
                  : isRejected
                  ? Icons.cancel_outlined
                  : Icons.lock_outline,
              size: 48,
              color: isPending
                  ? Colors.orange
                  : isRejected
                  ? Colors.red
                  : Colors.orange,
            ),
          ),
          const SizedBox(height: 16),

          AppText(
            isPending
                ? 'Request Pending'
                : isRejected
                ? 'Access Denied'
                : 'No Document Access',
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
          const SizedBox(height: 8),
          Text(
            isPending
                ? 'Your document access request is awaiting user approval.'
                : isRejected
                ? 'The user rejected your access request.'
                : 'You do not have access to this user\'s documents. '
                      'Send a request to ask the user to share their documents with you.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
          ),
          const SizedBox(height: 24),

          // Button — shown only if no pending/rejected request
          if (!isPending)
            Obx(
              () => AppButton(
                buttonText: ctrl.isSending.value
                    ? 'Sending…'
                    : isRejected
                    ? 'Re-Send Document Access Request'
                    : 'Send Document Access Request',
                onTapFunction: ctrl.isSending.value
                    ? null
                    : () async {
                        final cpaId = authPerson?.id ?? -1;
                        final success = await ctrl.sendAccessRequest(
                          // no orderId
                          cpaId: cpaId,
                          userId: lead.userId,
                        );
                        if (success) {
                          onRequestSent();
                        }
                      },
              ),
            ),

          if (isPending)
            AppButton(buttonText: 'Close', onTapFunction: () => Get.back()),
        ],
      ),
    );
  }
}
