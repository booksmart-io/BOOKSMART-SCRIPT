import 'package:booksmart/constant/exports.dart';
import 'package:booksmart/models/document_access_request_model.dart';
import 'package:booksmart/modules/user/controllers/document_access_controller.dart';
import 'package:get/get.dart';

/// Entry point — called from the "Accessible to" button in TaxFillingScreen.
void showDocumentAccessRequestsDialog() {
  final ctrl = Get.isRegistered<DocumentAccessController>()
      ? Get.find<DocumentAccessController>()
      : Get.put(DocumentAccessController());

  // Refresh list every time the dialog opens
  ctrl.fetchRequestsForUser();

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
          constraints: const BoxConstraints(maxWidth: 520, maxHeight: 620),
          child: Material(
            color: Colors.transparent,
            child: _AccessRequestsContent(ctrl: ctrl),
          ),
        ),
      );
    },
    barrierDismissible: true,
    barrierLabel: 'documentAccessRequestsDialog',
  );
}

class _AccessRequestsContent extends StatelessWidget {
  final DocumentAccessController ctrl;
  const _AccessRequestsContent({required this.ctrl});

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // ── Header ───────────────────────────────────────────────────────────
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 8, 4),
          child: Row(
            children: [
              const Icon(Icons.people_alt_outlined, size: 22),
              const SizedBox(width: 8),
              const Expanded(
                child: AppText(
                  'Document Access Requests',
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

        // ── Body ─────────────────────────────────────────────────────────────
        Flexible(
          child: Obx(() {
            if (ctrl.isLoading.value) {
              return const SizedBox(
                height: 200,
                child: Center(child: CircularProgressIndicator()),
              );
            }

            final reqs = ctrl.requests;

            if (reqs.isEmpty) {
              return const Padding(
                padding: EdgeInsets.all(40),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.inbox_outlined, size: 56, color: Colors.grey),
                    SizedBox(height: 12),
                    Text(
                      'No access requests yet.',
                      style: TextStyle(color: Colors.grey),
                    ),
                  ],
                ),
              );
            }

            return ListView.separated(
              shrinkWrap: true,
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: reqs.length,
              separatorBuilder: (_, __) =>
                  const Divider(height: 1, indent: 16, endIndent: 16),
              itemBuilder: (ctx, i) =>
                  _RequestTile(request: reqs[i], ctrl: ctrl),
            );
          }),
        ),
      ],
    );
  }
}

class _RequestTile extends StatelessWidget {
  final DocumentAccessRequest request;
  final DocumentAccessController ctrl;

  const _RequestTile({required this.request, required this.ctrl});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final d = request.requestedAt.toLocal();
    final months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    final dateStr = '${months[d.month - 1]} ${d.day}, ${d.year}';

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── CPA name + date ────────────────────────────────────────────────
          Row(
            children: [
              CircleAvatar(
                radius: 20,
                backgroundColor: Colors.indigo.withValues(alpha: 0.15),
                backgroundImage:
                    (request.cpaImageUrl != null &&
                        request.cpaImageUrl!.isNotEmpty)
                    ? NetworkImage(request.cpaImageUrl!)
                    : null,
                child:
                    (request.cpaImageUrl == null ||
                        request.cpaImageUrl!.isEmpty)
                    ? Text(
                        _initials(request.cpaFullName),
                        style: const TextStyle(
                          color: Colors.indigo,
                          fontWeight: FontWeight.bold,
                          fontSize: 14,
                        ),
                      )
                    : null,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AppText(
                      request.cpaFullName,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Requested on $dateStr',
                      style: TextStyle(
                        fontSize: 11,
                        color: isDark ? Colors.white54 : Colors.black45,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              // Status chip
              _StatusChip(status: request.status),
            ],
          ),

          // ── Action buttons (only for pending) ─────────────────────────────
          if (request.status == DocumentAccessStatus.pending)
            Container(
              alignment: Alignment.centerRight,
              padding: const EdgeInsets.only(top: 12),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Reject
                  OutlinedButton.icon(
                    onPressed: () => ctrl.deleteRequest(request.id),
                    icon: const Icon(Icons.close, size: 16),
                    label: const Text('Reject'),

                    // for light-mode it should be grey
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.red,
                      side: const BorderSide(color: Colors.red),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 8,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  // Accept
                  ElevatedButton.icon(
                    onPressed: () => ctrl.updateStatus(
                      request.id,
                      DocumentAccessStatus.accepted,
                    ),
                    icon: const Icon(Icons.check, size: 16),
                    label: const Text('Accept'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 8,
                      ),
                    ),
                  ),
                ],
              ),
            ),

          // ── Action buttons (only for accepted) ────────────────────────────
          if (request.status == DocumentAccessStatus.accepted)
            Container(
              alignment: Alignment.centerRight,
              padding: const EdgeInsets.only(top: 12),
              child: GestureDetector(
                onTap: () => ctrl.deleteRequest(request.id),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    // Using red with low opacity for the background to match the "rejected" theme
                    color: Colors.red.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.remove_circle_outline,
                        size: 13,
                        color: Colors.red,
                      ),
                      const SizedBox(width: 4),
                      const Text(
                        'Remove Access',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: Colors.red,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  String _initials(String name) {
    final parts = name.trim().split(' ');
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts[0][0].toUpperCase();
    return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
  }
}

class _StatusChip extends StatelessWidget {
  final DocumentAccessStatus status;
  const _StatusChip({required this.status});

  @override
  Widget build(BuildContext context) {
    Color bg;
    Color fg;
    String label;
    IconData icon;

    switch (status) {
      case DocumentAccessStatus.accepted:
        bg = Colors.green.withValues(alpha: 0.12);
        fg = Colors.green;
        label = 'Accepted';
        icon = Icons.check_circle_outline;
        break;
      case DocumentAccessStatus.rejected:
        bg = Colors.red.withValues(alpha: 0.12);
        fg = Colors.red;
        label = 'Rejected';
        icon = Icons.cancel_outlined;
        break;
      case DocumentAccessStatus.pending:
        bg = Colors.orange.withValues(alpha: 0.12);
        fg = Colors.orange;
        label = 'Pending';
        icon = Icons.hourglass_top_rounded;
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: fg),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: fg,
            ),
          ),
        ],
      ),
    );
  }
}
