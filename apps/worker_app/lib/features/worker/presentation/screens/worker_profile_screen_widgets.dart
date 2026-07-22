part of 'worker_profile_screen.dart';

class _EmailVerificationBlock extends StatelessWidget {
  const _EmailVerificationBlock({
    required this.email,
    required this.currentEmail,
    required this.pendingEmail,
    required this.emailVerified,
    required this.otpSent,
    required this.loading,
    required this.otpController,
    required this.onSendCode,
    required this.onConfirm,
  });

  final String email;
  final String? currentEmail;
  final String? pendingEmail;
  final bool emailVerified;
  final bool otpSent;
  final bool loading;
  final TextEditingController otpController;
  final Future<void> Function() onSendCode;
  final Future<void> Function() onConfirm;

  @override
  Widget build(BuildContext context) {
    final hasEmail = email.trim().isNotEmpty;
    final hasPending = pendingEmail?.trim().isNotEmpty == true;
    final changed = hasEmail && email != (currentEmail ?? '');
    final verifiedCurrent = hasEmail && !changed && emailVerified;
    final needsVerification =
        hasEmail && (changed || hasPending || !verifiedCurrent);

    if (!hasEmail) {
      return const InlineMessage(message: 'Email daxil edilməyib.');
    }

    if (verifiedCurrent && !hasPending) {
      return const PremiumChip(
        label: 'Email təsdiqlənib',
        icon: Icons.verified_outlined,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        InlineMessage(
          message: hasPending
              ? 'Email təsdiqlənməyib: ${pendingEmail!.trim()}'
              : 'Email təsdiqlənməyib.',
        ),
        if (needsVerification) ...[
          const SizedBox(height: 10),
          LoadingButton(
            label: 'Təsdiq kodu göndər',
            icon: Icons.mark_email_unread_outlined,
            loading: loading && !otpSent,
            onPressed: loading ? null : onSendCode,
          ),
          if (otpSent || hasPending) ...[
            const SizedBox(height: 10),
            TextField(
              controller: otpController,
              keyboardType: TextInputType.number,
              maxLength: 6,
              decoration: const InputDecoration(
                labelText: 'Email təsdiq kodu',
                counterText: '',
                prefixIcon: Icon(Icons.pin_outlined),
              ),
            ),
            const SizedBox(height: 10),
            LoadingButton(
              label: 'Emaili təsdiqlə',
              icon: Icons.verified_outlined,
              loading: loading && otpSent,
              onPressed: loading ? null : onConfirm,
            ),
          ],
        ],
      ],
    );
  }
}

class _ProfileOverview extends StatelessWidget {
  const _ProfileOverview({
    required this.worker,
    required this.gender,
    required this.languages,
    required this.skills,
    required this.positions,
    required this.experiences,
    required this.uploading,
    required this.onEditIdentity,
    required this.onEditContact,
    required this.onEditLanguages,
    required this.onEditPositions,
    required this.onEditSkills,
    required this.onEditExperience,
    required this.onEditDocuments,
  });

  final WorkerMe worker;
  final String? gender;
  final List<String> languages;
  final List<String> skills;
  final List<String> positions;
  final List<WorkerExperience> experiences;
  final bool uploading;
  final VoidCallback onEditIdentity;
  final VoidCallback onEditContact;
  final VoidCallback onEditLanguages;
  final VoidCallback onEditPositions;
  final VoidCallback onEditSkills;
  final VoidCallback onEditExperience;
  final VoidCallback onEditDocuments;

  @override
  Widget build(BuildContext context) {
    final photoUrl = _photoUrl(worker.profilePhotoUrl);

    return PremiumCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 18, 14, 16),
            child: Stack(
              children: [
                Align(
                  alignment: Alignment.topLeft,
                  child: IconButton(
                    onPressed: onEditIdentity,
                    tooltip: 'Şəxsi məlumatlar',
                    icon: const Icon(Icons.star_border_rounded, size: 30),
                    color: BrandColors.primaryBurgundy,
                  ),
                ),
                Center(
                  child: Column(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(2),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: const Color(0xFFFF9C9C)),
                        ),
                        child: CircleAvatar(
                          radius: 40,
                          backgroundColor: const Color(0xFFFFE5E2),
                          backgroundImage: photoUrl == null
                              ? null
                              : NetworkImage(photoUrl),
                          child: photoUrl == null
                              ? const Icon(
                                  Icons.person_outline,
                                  color: BrandColors.primaryBurgundy,
                                  size: 44,
                                )
                              : null,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        worker.name,
                        textAlign: TextAlign.center,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.headlineSmall
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Divider(
            height: 1,
            color: BrandColors.accentGold.withValues(alpha: 0.45),
          ),
          _ProfileMenuRow(
            title: 'Vəzifə',
            summary: positions.isEmpty
                ? 'Vəzifə seçilməyib'
                : positions.take(2).join(', '),
            icon: Icons.work_outline,
            onTap: onEditPositions,
          ),
          _ProfileMenuRow(
            title: 'Cins',
            summary: _genderLabel(gender),
            icon: Icons.wc_outlined,
            onTap: onEditIdentity,
          ),
          _ProfileMenuRow(
            title: 'Əlaqə',
            summary: 'Düzəltmək üçün açın',
            icon: Icons.phone_outlined,
            onTap: onEditContact,
          ),
          _ProfileMenuRow(
            title: 'Dillər',
            summary: languages.isEmpty
                ? 'Dil seçilməyib'
                : languages.take(3).join(', '),
            icon: Icons.translate_outlined,
            onTap: onEditLanguages,
          ),
          _ProfileMenuRow(
            title: 'Bacarıqlar',
            summary: skills.isEmpty
                ? 'Bacarıq seçilməyib'
                : '${skills.length} bacarıq seçilib',
            icon: Icons.auto_awesome_outlined,
            onTap: onEditSkills,
          ),
          _ProfileMenuRow(
            title: 'İş təcrübəsi',
            summary: experiences.isEmpty
                ? 'Təcrübə əlavə edilməyib'
                : '${experiences.length} iş təcrübəsi',
            icon: Icons.history_outlined,
            onTap: onEditExperience,
          ),
          _ProfileMenuRow(
            title: 'Sənədlər',
            summary: uploading
                ? 'Yüklənir...'
                : worker.documents.isEmpty
                ? 'Sənəd yüklənməyib'
                : '${worker.documents.length} sənəd yüklənib',
            icon: Icons.description_outlined,
            onTap: onEditDocuments,
            isLast: true,
          ),
        ],
      ),
    );
  }

  String _genderLabel(String? value) {
    return switch (value) {
      'male' => 'Kişi',
      'female' => 'Qadın',
      _ => 'Cins seçilməyib',
    };
  }
}

class _ProfileMenuRow extends StatelessWidget {
  const _ProfileMenuRow({
    required this.title,
    required this.icon,
    required this.summary,
    required this.onTap,
    this.isLast = false,
  });

  final String title;
  final IconData icon;
  final String summary;
  final VoidCallback onTap;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '$title: $summary',
      button: true,
      child: InkWell(
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 58),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(
                color: isLast
                    ? BrandColors.transparent
                    : BrandColors.accentGold.withValues(alpha: 0.22),
              ),
            ),
          ),
          child: Row(
            children: [
              Icon(icon, color: BrandColors.primaryBurgundy, size: 22),
              const SizedBox(width: 14),
              Expanded(
                child: Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: Colors.black,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              const Icon(
                Icons.edit_rounded,
                color: BrandColors.primaryBurgundy,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PremiumEditSheet extends StatelessWidget {
  const _PremiumEditSheet({
    required this.title,
    required this.icon,
    required this.child,
    required this.onCancel,
    required this.onSave,
    required this.saveLabel,
    required this.saving,
  });

  final String title;
  final IconData icon;
  final Widget child;
  final VoidCallback onCancel;
  final VoidCallback onSave;
  final String saveLabel;
  final bool saving;

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    return AnimatedPadding(
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
      padding: EdgeInsets.only(bottom: bottomInset),
      child: Align(
        alignment: Alignment.bottomCenter,
        child: Material(
          color: BrandColors.transparent,
          child: Container(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.sizeOf(context).height * 0.9,
            ),
            decoration: const BoxDecoration(
              color: BrandColors.creamBackground,
              borderRadius: BorderRadius.vertical(top: Radius.circular(30)),
            ),
            child: SafeArea(
              top: false,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const SizedBox(height: 10),
                  Container(
                    width: 46,
                    height: 4,
                    decoration: BoxDecoration(
                      color: BrandColors.accentGold,
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(18, 16, 12, 10),
                    child: Row(
                      children: [
                        _SectionIcon(icon),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.titleLarge
                                ?.copyWith(fontWeight: FontWeight.w700),
                          ),
                        ),
                        IconButton(
                          onPressed: saving ? null : onCancel,
                          tooltip: 'Bağla',
                          icon: const Icon(Icons.close_rounded),
                          color: BrandColors.urbanGraphite,
                        ),
                      ],
                    ),
                  ),
                  Flexible(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(18, 4, 18, 18),
                      child: child,
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.fromLTRB(18, 12, 18, 18),
                    decoration: BoxDecoration(
                      color: BrandColors.cardCream,
                      border: Border(
                        top: BorderSide(
                          color: BrandColors.accentGold.withValues(alpha: 0.28),
                        ),
                      ),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: saving ? null : onCancel,
                            child: const Text('Ləğv et'),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: LoadingButton(
                            label: saveLabel,
                            icon: Icons.check_rounded,
                            loading: saving,
                            onPressed: onSave,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
