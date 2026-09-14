part of 'worker_profile_screen.dart';

const _skillOptions = [
  'Qonaqlarla peşəkar ünsiyyət',
  'Müştəri məmnuniyyətinin təmin edilməsi',
  'Komanda ilə işləmək bacarığı',
  'Vaxtın idarə olunması',
  'Stress altında işləmə bacarığı',
  'Rezervasiya proseslərinin idarə olunması',
  'Təsərrüfat xidməti və otaq yoxlaması standartları',
  'Təhlükəsizlik və gigiyena standartları (HACCP, ISO)',
  'Kassa və POS sistemi ilə işləmək',
  'Səliqə, etik davranış və təqdimat bacarığı',
  'Qida və içki (F&B) xidmətləri haqqında bilik',
  'Növbəli iş rejiminə uyğunlaşma',
];

const _languageOptions = [
  'Azərbaycan dili',
  'İngilis dili',
  'Rus dili',
  'Türk dili',
  'Ərəb dili',
];

class _SectionIcon extends StatelessWidget {
  const _SectionIcon(this.icon);

  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 42,
      height: 42,
      decoration: BoxDecoration(
        color: BrandColors.accentGold.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: BrandColors.accentGold.withValues(alpha: 0.32),
        ),
      ),
      child: Icon(icon, color: BrandColors.primaryBurgundy, size: 21),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.icon, required this.title});

  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _SectionIcon(icon),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );
  }
}

class _PositionPickerSection extends StatelessWidget {
  const _PositionPickerSection({
    required this.departments,
    required this.selectedIds,
    required this.onToggle,
  });

  final List<TaxonomyDepartment> departments;
  final List<String> selectedIds;
  final ValueChanged<String> onToggle;

  @override
  Widget build(BuildContext context) {
    final hasPositions = departments.any(
      (department) => department.subdepartments.any(
        (subdepartment) => subdepartment.positions.isNotEmpty,
      ),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionTitle(icon: Icons.work_outline, title: 'Vəzifələr'),
        const SizedBox(height: 10),
        if (!hasPositions)
          const InlineMessage(message: 'Aktiv vəzifə tapılmadı.')
        else
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: departments
                .where(
                  (department) => department.subdepartments.any(
                    (subdepartment) => subdepartment.positions.isNotEmpty,
                  ),
                )
                .map(
                  (department) => _TaxonomyDepartmentGroup(
                    department: department,
                    selectedIds: selectedIds,
                    onToggle: onToggle,
                  ),
                )
                .toList(growable: false),
          ),
      ],
    );
  }
}

class _TaxonomyDepartmentGroup extends StatelessWidget {
  const _TaxonomyDepartmentGroup({
    required this.department,
    required this.selectedIds,
    required this.onToggle,
  });

  final TaxonomyDepartment department;
  final List<String> selectedIds;
  final ValueChanged<String> onToggle;

  @override
  Widget build(BuildContext context) {
    final subdepartments = department.subdepartments
        .where((subdepartment) => subdepartment.positions.isNotEmpty)
        .toList(growable: false);

    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Şöbə',
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
              color: BrandColors.urbanGraphite,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            department.nameAz,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 12),
          ...subdepartments.map(
            (subdepartment) => _TaxonomySubdepartmentGroup(
              subdepartment: subdepartment,
              selectedIds: selectedIds,
              onToggle: onToggle,
            ),
          ),
        ],
      ),
    );
  }
}

class _TaxonomySubdepartmentGroup extends StatelessWidget {
  const _TaxonomySubdepartmentGroup({
    required this.subdepartment,
    required this.selectedIds,
    required this.onToggle,
  });

  final TaxonomySubdepartment subdepartment;
  final List<String> selectedIds;
  final ValueChanged<String> onToggle;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.subdirectory_arrow_right_rounded,
                color: BrandColors.primaryBurgundy,
                size: 18,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  'Departament: ${subdepartment.nameAz}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(
                    context,
                  ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: subdepartment.positions
                .map(
                  (position) => PremiumSelectableChip(
                    label: 'Vəzifə: ${position.nameAz}',
                    selected: selectedIds.contains(position.id),
                    onSelected: (_) => onToggle(position.id),
                    semanticPrefix: 'Vəzifə',
                  ),
                )
                .toList(growable: false),
          ),
        ],
      ),
    );
  }
}

class _ChipPickerSection extends StatelessWidget {
  const _ChipPickerSection({
    required this.title,
    required this.icon,
    required this.values,
    required this.selected,
    required this.onToggle,
    this.customController,
    this.onAddCustom,
  });

  final String title;
  final IconData icon;
  final List<String> values;
  final List<String> selected;
  final ValueChanged<String> onToggle;
  final TextEditingController? customController;
  final VoidCallback? onAddCustom;

  @override
  Widget build(BuildContext context) {
    final allValues = {
      ...values,
      ...selected.where((item) => !values.contains(item)),
    }.toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionTitle(icon: icon, title: title),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: allValues
              .map(
                (value) => PremiumSelectableChip(
                  label: value,
                  selected: selected.contains(value),
                  onSelected: (_) => onToggle(value),
                  semanticPrefix: title,
                ),
              )
              .toList(growable: false),
        ),
        if (customController != null && onAddCustom != null) ...[
          const SizedBox(height: 14),
          TextField(
            controller: customController,
            decoration: const InputDecoration(
              labelText: 'Yeni bacarıq əlavə et',
              prefixIcon: Icon(Icons.add_circle_outline),
            ),
            onSubmitted: (_) => onAddCustom!(),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: onAddCustom,
            icon: const Icon(Icons.add),
            label: const Text('Əlavə et'),
          ),
        ],
      ],
    );
  }
}

class _ExperienceEditorSection extends StatelessWidget {
  const _ExperienceEditorSection({
    required this.drafts,
    required this.onAdd,
    required this.onRemove,
  });

  final List<_ExperienceDraft> drafts;
  final VoidCallback onAdd;
  final ValueChanged<_ExperienceDraft> onRemove;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        OutlinedButton.icon(
          onPressed: onAdd,
          icon: const Icon(Icons.add),
          label: const Text('Təcrübə əlavə et'),
        ),
        const SizedBox(height: 12),
        ...drafts.asMap().entries.map((entry) {
          final index = entry.key + 1;
          final draft = entry.value;
          final company = draft.companyController.text.trim();
          final position = draft.positionController.text.trim();
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: ExpansionTile(
              initiallyExpanded: false,
              tilePadding: EdgeInsets.zero,
              childrenPadding: const EdgeInsets.only(bottom: 12),
              leading: const Icon(
                Icons.business_center_outlined,
                color: BrandColors.primaryBurgundy,
              ),
              title: Text(
                company.isEmpty ? 'İş təcrübəsi $index' : company,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              subtitle: Text(
                position.isEmpty ? 'Vəzifə əlavə edin' : position,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              children: [
                TextField(
                  controller: draft.companyController,
                  decoration: const InputDecoration(
                    labelText: 'Müəssisə adı',
                    prefixIcon: Icon(Icons.business_outlined),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: draft.positionController,
                  decoration: const InputDecoration(
                    labelText: 'Vəzifə',
                    prefixIcon: Icon(Icons.badge_outlined),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: draft.noteController,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    labelText: 'Qısa qeyd',
                    prefixIcon: Icon(Icons.notes_outlined),
                  ),
                ),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton.icon(
                    onPressed: drafts.length > 1 ? () => onRemove(draft) : null,
                    icon: const Icon(Icons.delete_outline),
                    label: const Text('Sil'),
                  ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }
}

class WorkerDocumentsSection extends StatelessWidget {
  const WorkerDocumentsSection({
    required this.worker,
    required this.uploading,
    required this.uploadProgress,
    required this.errorMessage,
    required this.successMessage,
    required this.onUploadHealthCertificate,
    required this.onUploadCriminalRecord,
    required this.onOpenDocument,
    super.key,
  });

  final WorkerMe worker;
  final bool uploading;
  final double? uploadProgress;
  final String? errorMessage;
  final String? successMessage;
  final Future<void> Function() onUploadHealthCertificate;
  final Future<void> Function() onUploadCriminalRecord;
  final Future<void> Function(WorkerDocument document) onOpenDocument;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionTitle(icon: Icons.upload_file_outlined, title: 'Sənəd yüklə'),
        const SizedBox(height: 12),
        LayoutBuilder(
          builder: (context, constraints) {
            final health = OutlinedButton.icon(
              onPressed: uploading ? null : onUploadHealthCertificate,
              icon: const Icon(Icons.health_and_safety_outlined),
              label: const Text('Sağlamlıq arayışı'),
            );
            final criminal = OutlinedButton.icon(
              onPressed: uploading ? null : onUploadCriminalRecord,
              icon: const Icon(Icons.verified_user_outlined),
              label: const Text('Məhkumluq arayışı'),
            );
            if (constraints.maxWidth < 360) {
              return Column(
                children: [
                  SizedBox(width: double.infinity, child: health),
                  const SizedBox(height: 10),
                  SizedBox(width: double.infinity, child: criminal),
                ],
              );
            }
            return Row(
              children: [
                Expanded(child: health),
                const SizedBox(width: 10),
                Expanded(child: criminal),
              ],
            );
          },
        ),
        const SizedBox(height: 14),
        if (uploading) ...[
          Semantics(
            label: 'Sənəd yüklənir',
            value: uploadProgress == null
                ? null
                : '${(uploadProgress! * 100).round()} faiz',
            child: LinearProgressIndicator(value: uploadProgress),
          ),
          const SizedBox(height: 8),
          Text(
            uploadProgress == null
                ? 'Sənəd yüklənir...'
                : 'Sənəd ${(uploadProgress! * 100).round()}% yüklənib',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: BrandColors.mutedBrown,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 14),
        ],
        if (errorMessage != null) ...[
          InlineMessage(message: errorMessage!, kind: InlineMessageKind.error),
          const SizedBox(height: 12),
        ],
        if (successMessage != null) ...[
          InlineMessage(
            message: successMessage!,
            kind: InlineMessageKind.success,
          ),
          const SizedBox(height: 12),
        ],
        if (worker.documents.isEmpty)
          const InlineMessage(
            key: ValueKey('worker-documents-empty'),
            message: 'Hələ sənəd yüklənməyib.',
          )
        else
          ...worker.documents.map(
            (document) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: PremiumCard(
                key: ValueKey('worker-document-${document.type}'),
                padding: const EdgeInsets.all(14),
                onTap:
                    document.available && document.effectiveDownloadPath != null
                    ? () => onOpenDocument(document)
                    : null,
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        color: BrandColors.primaryBurgundy.withValues(
                          alpha: 0.08,
                        ),
                        borderRadius: BorderRadius.circular(13),
                      ),
                      child: Icon(
                        document.mimeType == 'application/pdf'
                            ? Icons.picture_as_pdf_outlined
                            : Icons.image_outlined,
                        color: BrandColors.primaryBurgundy,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _documentLabel(document.type),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.titleMedium
                                ?.copyWith(fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 7),
                          Align(
                            alignment: Alignment.centerLeft,
                            child: _DocumentStateBadge(document: document),
                          ),
                          const SizedBox(height: 5),
                          Text(
                            _documentName(document),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.bodyMedium
                                ?.copyWith(color: BrandColors.darkText),
                          ),
                          const SizedBox(height: 7),
                          Wrap(
                            spacing: 10,
                            runSpacing: 5,
                            children: [
                              if (document.sizeBytes != null)
                                _DocumentMeta(
                                  icon: Icons.data_usage_outlined,
                                  label: _formatBytes(document.sizeBytes!),
                                ),
                              if (_formatUploadedAt(document.uploadedAt) !=
                                  null)
                                _DocumentMeta(
                                  icon: Icons.schedule_outlined,
                                  label: _formatUploadedAt(
                                    document.uploadedAt,
                                  )!,
                                ),
                              _DocumentMeta(
                                icon: document.companyVisible
                                    ? Icons.visibility_outlined
                                    : Icons.lock_outline_rounded,
                                label: document.companyVisible
                                    ? 'Müəssisəyə görünür'
                                    : 'Məxfi sənəd',
                              ),
                            ],
                          ),
                          if (document.available &&
                              document.effectiveDownloadPath != null) ...[
                            const SizedBox(height: 8),
                            Text(
                              'Açmaq üçün toxunun',
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(
                                    color: BrandColors.primaryBurgundy,
                                    fontWeight: FontWeight.w700,
                                  ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _DocumentStateBadge extends StatelessWidget {
  const _DocumentStateBadge({required this.document});

  final WorkerDocument document;

  @override
  Widget build(BuildContext context) {
    final ready =
        document.available &&
        document.status == 'ready' &&
        document.scanStatus == 'clean';
    final label = ready
        ? 'Yüklənib'
        : document.status == 'legacy'
        ? 'Yenidən yükləyin'
        : document.scanStatus == 'unscanned'
        ? 'Yoxlanılır'
        : document.status;

    return Container(
      constraints: const BoxConstraints(minHeight: 28),
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: (ready ? BrandColors.accentGold : BrandColors.urbanGraphite)
            .withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: ready
              ? BrandColors.accentGold
              : BrandColors.urbanGraphite.withValues(alpha: 0.5),
        ),
      ),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: ready ? BrandColors.darkText : BrandColors.urbanGraphite,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _DocumentMeta extends StatelessWidget {
  const _DocumentMeta({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: BrandColors.mutedBrown),
        const SizedBox(width: 4),
        Text(
          label,
          style: Theme.of(
            context,
          ).textTheme.labelSmall?.copyWith(color: BrandColors.mutedBrown),
        ),
      ],
    );
  }
}

String _documentName(WorkerDocument document) {
  final name = document.name?.trim();
  if (name != null && name.isNotEmpty) return name;
  final mime = document.mimeType?.trim();
  if (mime != null && mime.isNotEmpty) return mime;
  return 'Fayl adı təqdim edilməyib';
}

String _formatBytes(int bytes) {
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
  return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
}

String? _formatUploadedAt(String? value) {
  final date = value == null ? null : DateTime.tryParse(value);
  if (date == null) return null;
  return DateFormat('dd.MM.yyyy, HH:mm').format(date.toLocal());
}
