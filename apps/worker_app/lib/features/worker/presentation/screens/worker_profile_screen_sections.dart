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
                  (position) => FilterChip(
                    label: Text('Vəzifə: ${position.nameAz}'),
                    selected: selectedIds.contains(position.id),
                    onSelected: (_) => onToggle(position.id),
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
                (value) => FilterChip(
                  label: Text(value),
                  selected: selected.contains(value),
                  onSelected: (_) => onToggle(value),
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

class _DocumentsEditorSection extends StatelessWidget {
  const _DocumentsEditorSection({
    required this.worker,
    required this.uploading,
    required this.onUploadHealthCertificate,
    required this.onUploadCriminalRecord,
  });

  final WorkerMe worker;
  final bool uploading;
  final Future<void> Function() onUploadHealthCertificate;
  final Future<void> Function() onUploadCriminalRecord;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionTitle(icon: Icons.upload_file_outlined, title: 'Sənəd yüklə'),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            OutlinedButton.icon(
              onPressed: uploading ? null : onUploadHealthCertificate,
              icon: const Icon(Icons.upload_file_outlined),
              label: const Text('Sağlamlıq arayışı'),
            ),
            OutlinedButton.icon(
              onPressed: uploading ? null : onUploadCriminalRecord,
              icon: const Icon(Icons.verified_user_outlined),
              label: const Text('Məhkumluq arayışı'),
            ),
          ],
        ),
        const SizedBox(height: 14),
        if (uploading) const SkeletonBlock(height: 10),
        if (worker.documents.isEmpty)
          const InlineMessage(message: 'Hələ sənəd yüklənməyib.')
        else
          ...worker.documents.map(
            (document) => ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.description_outlined),
              title: Text(
                _documentLabel(document.type),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              subtitle: Text(
                document.name ?? document.mimeType ?? '-',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
      ],
    );
  }
}
