part of 'company_home_shell.dart';

class _AssignmentCard extends StatefulWidget {
  const _AssignmentCard(this.assignment, {this.checkoutCompleted = false});

  final Assignment assignment;
  final bool checkoutCompleted;

  @override
  State<_AssignmentCard> createState() => _AssignmentCardState();
}

class _AssignmentCardState extends State<_AssignmentCard> {
  bool _rating = false;

  @override
  Widget build(BuildContext context) {
    final assignment = widget.assignment;
    final statusHelp = AppStrings.assignmentStatusHelp(assignment.status);
    return Premium3DCard(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    assignment.worker.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                StatusPill(status: assignment.status),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              assignment.order.location,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 4),
            Text(
              assignment.order.title,
              style: Theme.of(
                context,
              ).textTheme.bodyLarge?.copyWith(color: BrandColors.mutedBrown),
            ),
            if (statusHelp != null) ...[
              const SizedBox(height: 8),
              InlineMessage(message: statusHelp),
            ],
            if (assignment.status == 'accepted') ...[
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  OutlinedButton.icon(
                    onPressed: () => _showQr(context, assignment.id),
                    icon: const Icon(Icons.qr_code_2),
                    label: const Text(AppStrings.generateQrToken),
                  ),
                  OutlinedButton.icon(
                    onPressed: () => _showKioskInfo(context),
                    icon: const Icon(Icons.tablet_mac_outlined),
                    label: const Text('QR ekranı yarat'),
                  ),
                  OutlinedButton.icon(
                    onPressed: () => _openWorkerProfile(context),
                    icon: const Icon(Icons.badge_outlined),
                    label: const Text(AppStrings.viewProfile),
                  ),
                ],
              ),
            ],
            if (_isPotentiallyRateableAssignment(assignment)) ...[
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: widget.checkoutCompleted && !_rating
                    ? () => _rateWorker(context)
                    : null,
                icon: const Icon(Icons.star_outline),
                label: Text(
                  _rating
                      ? AppStrings.working
                      : widget.checkoutCompleted
                      ? AppStrings.rateWorker
                      : AppStrings.checkoutIncomplete,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _openWorkerProfile(BuildContext context) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) =>
            _CompanyWorkerProfileScreen(workerId: widget.assignment.workerId),
      ),
    );
  }

  Future<void> _showQr(BuildContext context, String assignmentId) async {
    try {
      final qr = await context.read<CompanyRepository>().generateQrToken(
        assignmentId,
      );
      if (!context.mounted) return;
      await showDialog<void>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text(AppStrings.generateQrToken),
          content: SelectableText(qr.token),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text(AppStrings.close),
            ),
          ],
        ),
      );
    } on ApiException catch (error) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  Future<void> _showKioskInfo(BuildContext context) async {
    await showDialog<void>(
      context: context,
      builder: (_) => const AlertDialog(
        title: Text('QR ekranı'),
        content: Text(
          'Məkan üçün kiosk linkləri admin panelindən yaradılır və sifarişə və ya növbəyə əsasən aktiv edilir. Bu ekranda yalnız birdəfəlik QR tokeni göstərilir.',
        ),
      ),
    );
  }

  // ignore: unused_element
  Future<void> _createKiosk(BuildContext context, String assignmentId) async {
    try {
      final kiosk = await context.read<CompanyRepository>().createKioskSession(
        assignmentId,
      );
      if (!context.mounted) return;
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('QR ekranı'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Bu linki girişdəki tablet brauzerində açın.'),
              const SizedBox(height: 10),
              SelectableText(kiosk.kioskUrl),
              const SizedBox(height: 10),
              Text(
                'QR hər ${kiosk.refreshIntervalSeconds} saniyədən bir yenilənir.',
              ),
            ],
          ),
          actions: [
            TextButton.icon(
              onPressed: () => _openKioskUrl(dialogContext, kiosk.kioskUrl),
              icon: const Icon(Icons.open_in_new),
              label: const Text('QR ekranını aç'),
            ),
            TextButton.icon(
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: kiosk.kioskUrl));
                if (!dialogContext.mounted) return;
                ScaffoldMessenger.of(dialogContext).showSnackBar(
                  const SnackBar(content: Text('QR linki köçürüldü.')),
                );
              },
              icon: const Icon(Icons.copy_outlined),
              label: const Text('QR linkini köçür'),
            ),
            TextButton.icon(
              onPressed: () async {
                await context.read<CompanyRepository>().revokeKioskSession(
                  kiosk.id,
                );
                if (!dialogContext.mounted) return;
                Navigator.of(dialogContext).pop();
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('QR ekranı deaktiv edildi.')),
                );
              },
              icon: const Icon(Icons.block_outlined),
              label: const Text('Deaktiv et'),
            ),
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text(AppStrings.close),
            ),
          ],
        ),
      );
    } on ApiException catch (error) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  Future<void> _openKioskUrl(BuildContext context, String url) async {
    if (!KioskUrlPolicy.isAllowed(url)) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text(AppStrings.kioskUrlBlocked)));
      return;
    }

    final uri = Uri.parse(url.trim());
    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('QR linkini açmaq mümkün olmadı.')),
      );
    }
  }

  Future<void> _rateWorker(BuildContext context) async {
    final result = await showDialog<_RatingInput>(
      context: context,
      builder: (_) => const _RateWorkerDialog(),
    );
    if (result == null || !context.mounted) return;
    setState(() => _rating = true);
    try {
      await context.read<CompanyRepository>().rateWorker(
        assignmentId: widget.assignment.id,
        score: result.score,
        feedback: result.feedback,
      );
      if (!context.mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text(AppStrings.ratingSent)));
    } on ApiException catch (error) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.message)));
    } finally {
      if (mounted) setState(() => _rating = false);
    }
  }
}

class _CompanyWorkerProfileScreen extends StatefulWidget {
  const _CompanyWorkerProfileScreen({required this.workerId});

  final String workerId;

  @override
  State<_CompanyWorkerProfileScreen> createState() =>
      _CompanyWorkerProfileScreenState();
}

class _CompanyWorkerProfileScreenState
    extends State<_CompanyWorkerProfileScreen> {
  late Future<CompanyVisibleWorkerProfile> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<CompanyVisibleWorkerProfile> _load() {
    return context.read<CompanyRepository>().getWorkerProfile(widget.workerId);
  }

  Future<void> _refresh() async {
    setState(() => _future = _load());
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text(AppStrings.viewProfile)),
      body: _AsyncView<CompanyVisibleWorkerProfile>(
        future: _future,
        onRetry: _refresh,
        builder: (profile) => RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              PremiumHeroPanel(
                title: profile.name,
                subtitle: profile.position.isEmpty
                    ? AppStrings.worker
                    : profile.position,
                compact: true,
                leading: CircleAvatar(
                  radius: 26,
                  backgroundColor: BrandColors.white.withValues(alpha: 0.18),
                  backgroundImage: profile.profilePhotoUrl == null
                      ? null
                      : NetworkImage(profile.profilePhotoUrl!),
                  child: profile.profilePhotoUrl == null
                      ? const Icon(
                          Icons.person_outline,
                          color: BrandColors.white,
                        )
                      : null,
                ),
                children: [
                  PremiumChip(
                    label:
                        '★ ${profile.ratingAverage.toStringAsFixed(1)} (${profile.ratingCount})',
                    icon: Icons.star_outline,
                    dark: true,
                  ),
                ],
              ),
              const SizedBox(height: 12),
              _ChipSection(title: AppStrings.skills, values: profile.skills),
              const SizedBox(height: 12),
              _ChipSection(
                title: AppStrings.languages,
                values: profile.languages,
              ),
              const SizedBox(height: 12),
              PremiumCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      AppStrings.workHistory,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    if (profile.workHistory.isNotEmpty)
                      ...profile.workHistory.map(
                        (item) => ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const Icon(Icons.timeline_outlined),
                          title: Text(item.companyName),
                          subtitle: Text(
                            [
                              item.position,
                              if (item.note.trim().isNotEmpty) item.note,
                            ].join('\n'),
                          ),
                        ),
                      )
                    else
                      Text(
                        profile.workHistorySummary?.trim().isNotEmpty == true
                            ? profile.workHistorySummary!
                            : AppStrings.noData,
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              PremiumCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      AppStrings.documents,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    if (profile.documents.isEmpty)
                      const Text(AppStrings.noDocumentsUploaded)
                    else
                      ...profile.documents.map(
                        (document) => ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const Icon(Icons.description_outlined),
                          title: Text(
                            document.name?.isNotEmpty == true
                                ? document.name!
                                : document.type,
                          ),
                          subtitle: Text(document.type),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ChipSection extends StatelessWidget {
  const _ChipSection({required this.title, required this.values});

  final String title;
  final List<String> values;

  @override
  Widget build(BuildContext context) {
    return PremiumCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 10),
          if (values.isEmpty)
            const Text(AppStrings.noData)
          else
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: values
                  .map((value) => PremiumChip(label: value))
                  .toList(growable: false),
            ),
        ],
      ),
    );
  }
}

class _RateWorkerDialog extends StatefulWidget {
  const _RateWorkerDialog();

  @override
  State<_RateWorkerDialog> createState() => _RateWorkerDialogState();
}

class _RateWorkerDialogState extends State<_RateWorkerDialog> {
  int _score = 5;
  final _feedback = TextEditingController();

  @override
  void dispose() {
    _feedback.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text(AppStrings.rateWorker),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          DropdownButtonFormField<int>(
            value: _score,
            decoration: const InputDecoration(labelText: AppStrings.rating),
            items: [5, 4, 3, 2, 1]
                .map(
                  (score) =>
                      DropdownMenuItem(value: score, child: Text('$score/5')),
                )
                .toList(),
            onChanged: (value) => setState(() => _score = value ?? 5),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _feedback,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(
              labelText: AppStrings.ratingFeedback,
              hintText: AppStrings.ratingFeedbackHint,
            ),
          ),
          const SizedBox(height: 8),
          const Text(AppStrings.ratingAvailableAfterCheckout),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text(AppStrings.cancel),
        ),
        ElevatedButton(
          onPressed: () => Navigator.of(
            context,
          ).pop(_RatingInput(score: _score, feedback: _feedback.text)),
          child: const Text(AppStrings.confirm),
        ),
      ],
    );
  }
}

class _RatingInput {
  const _RatingInput({required this.score, required this.feedback});

  final int score;
  final String feedback;
}
