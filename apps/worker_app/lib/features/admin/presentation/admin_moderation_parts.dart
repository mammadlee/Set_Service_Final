part of 'admin_home_shell.dart';

String _moderationStatusLabel(String status) => switch (status) {
  'open' => 'Açıq',
  'reviewing' => 'Baxılır',
  'resolved' => 'Həll edilib',
  'dismissed' => 'Rədd edilib',
  _ => status,
};

String _moderationTargetLabel(String type) => switch (type) {
  'order' => 'Sifariş',
  'company_profile' => 'Müəssisə profili',
  'worker_profile' => 'İşçi profili',
  'rating' => 'Qiymətləndirmə',
  _ => type,
};

String _moderationReasonLabel(String reason) => switch (reason) {
  'inappropriate_content' => 'Uyğunsuz məzmun',
  'harassment' => 'Narahat etmə',
  'false_information' => 'Yanlış məlumat',
  'spam' => 'Spam',
  'privacy' => 'Məxfilik',
  'other' => 'Digər',
  _ => reason,
};

class _AdminModerationTab extends StatefulWidget {
  const _AdminModerationTab();

  @override
  State<_AdminModerationTab> createState() => _AdminModerationTabState();
}

class _AdminModerationTabState extends State<_AdminModerationTab> {
  late Future<AdminModerationReportPage> _future;
  String? _status = 'open';
  int _page = 1;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<AdminModerationReportPage> _load() => context
      .read<AdminRepository>()
      .listModerationReports(page: _page, status: _status);

  Future<void> _refresh() async {
    setState(() => _future = _load());
    await _future;
  }

  void _selectStatus(String? status) {
    setState(() {
      _status = status;
      _page = 1;
      _future = _load();
    });
  }

  void _selectPage(int page) {
    setState(() {
      _page = page;
      _future = _load();
    });
  }

  @override
  Widget build(BuildContext context) {
    return _AsyncView<AdminModerationReportPage>(
      future: _future,
      onRetry: _refresh,
      builder: (page) => RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final status in <String?>[
                  null,
                  'open',
                  'reviewing',
                  'resolved',
                  'dismissed',
                ])
                  ChoiceChip(
                    label: Text(status == null ? 'Hamısı' : _moderationStatusLabel(status)),
                    selected: _status == status,
                    onSelected: (_) => _selectStatus(status),
                  ),
              ],
            ),
            const SizedBox(height: 14),
            if (page.data.isEmpty)
              const InlineMessage(message: 'Bu filtr üzrə şikayət yoxdur.')
            else
              ...page.data.map(
                (report) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: PremiumCard(
                    onTap: () async {
                      await Navigator.of(context).push<void>(
                        MaterialPageRoute(
                          builder: (_) => _AdminModerationDetailScreen(reportId: report.id),
                        ),
                      );
                      if (mounted) await _refresh();
                    },
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _moderationTargetLabel(report.targetType),
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const SizedBox(height: 6),
                        Text(_moderationReasonLabel(report.reason)),
                        if (report.details?.trim().isNotEmpty == true) ...[
                          const SizedBox(height: 6),
                          Text(report.details!, softWrap: true),
                        ],
                        const SizedBox(height: 10),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            PremiumChip(label: _moderationStatusLabel(report.status)),
                            if (report.createdAt != null)
                              Text(_dateText(report.createdAt)),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            const SizedBox(height: 10),
            if (page.totalPages > 1)
              AdminActionGroup(
                actions: [
                  OutlinedButton(
                    onPressed: _page > 1 ? () => _selectPage(_page - 1) : null,
                    child: const Text('Əvvəlki'),
                  ),
                  OutlinedButton(
                    onPressed: _page < page.totalPages
                        ? () => _selectPage(_page + 1)
                        : null,
                    child: const Text('Növbəti'),
                  ),
                ],
              ),
            if (page.totalPages > 1)
              Center(child: Text('${page.page} / ${page.totalPages}')),
          ],
        ),
      ),
    );
  }
}

class _AdminModerationDetailScreen extends StatefulWidget {
  const _AdminModerationDetailScreen({required this.reportId});

  final String reportId;

  @override
  State<_AdminModerationDetailScreen> createState() =>
      _AdminModerationDetailScreenState();
}

class _AdminModerationDetailScreenState
    extends State<_AdminModerationDetailScreen> {
  late Future<AdminModerationReport> _future;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _future = context.read<AdminRepository>().getModerationReport(widget.reportId);
  }

  Future<void> _refresh() async {
    setState(() => _future = context.read<AdminRepository>()
        .getModerationReport(widget.reportId));
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    final canManage = context.watch<AdminAuthController>()
        .hasPermission('manage_moderation');
    return Scaffold(
      appBar: AppBar(title: const Text('Şikayətə baxış')),
      body: _AdminBackdrop(
        child: _AsyncView<AdminModerationReport>(
          future: _future,
          onRetry: _refresh,
          builder: (report) => RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                PremiumCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _moderationTargetLabel(report.targetType),
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      const SizedBox(height: 10),
                      PremiumChip(label: _moderationStatusLabel(report.status)),
                      const SizedBox(height: 12),
                      _DetailTile('Səbəb', _moderationReasonLabel(report.reason)),
                      _DetailTile('Hədəf', report.targetLabel ?? report.targetId),
                      _DetailTile('Göndərən', report.reporterName ?? report.reporterRole),
                      _DetailTile('Açıqlama', report.details?.trim().isNotEmpty == true
                          ? report.details!
                          : AppStrings.noData),
                      _DetailTile('Yaradılıb', _dateText(report.createdAt)),
                      if (report.reviewedAt != null)
                        _DetailTile('Baxılıb', _dateText(report.reviewedAt)),
                      if (report.resolutionNote?.trim().isNotEmpty == true)
                        _DetailTile('Qərar qeydi', report.resolutionNote!),
                    ],
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  InlineMessage(message: _error!, kind: InlineMessageKind.error),
                ],
                if (canManage &&
                    (report.status == 'open' || report.status == 'reviewing')) ...[
                  const SizedBox(height: 16),
                  AdminActionGroup(
                    stackBelow: 500,
                    actions: [
                      if (report.status == 'open')
                        OutlinedButton(
                          onPressed: _saving ? null : () => _review('reviewing'),
                          child: const Text('Baxışa götür'),
                        ),
                      ElevatedButton(
                        onPressed: _saving ? null : () => _review('resolved'),
                        child: const Text('Həll et'),
                      ),
                      OutlinedButton(
                        onPressed: _saving ? null : () => _review('dismissed'),
                        style: OutlinedButton.styleFrom(foregroundColor: BrandColors.error),
                        child: const Text('Rədd et'),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _review(String status) async {
    final noteController = TextEditingController();
    String? note;
    try {
      note = await showDialog<String>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          scrollable: true,
          title: Text(_moderationStatusLabel(status)),
          content: TextField(
            controller: noteController,
            maxLines: 3,
            minLines: 2,
            decoration: const InputDecoration(labelText: 'Qərar qeydi (istəyə bağlı)'),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text(AppStrings.cancel),
            ),
            ElevatedButton(
              onPressed: () => Navigator.of(dialogContext).pop(noteController.text),
              child: const Text(AppStrings.confirm),
            ),
          ],
        ),
      );
    } finally {
      WidgetsBinding.instance.addPostFrameCallback((_) => noteController.dispose());
    }
    if (note == null || !mounted) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final report = await context.read<AdminRepository>().updateModerationReport(
        widget.reportId,
        status: status,
        resolutionNote: note.trim().isEmpty ? null : note.trim(),
      );
      if (mounted) setState(() => _future = Future.value(report));
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}
