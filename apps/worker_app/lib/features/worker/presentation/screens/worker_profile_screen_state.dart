part of 'worker_profile_screen.dart';

class WorkerProfileScreen extends StatefulWidget {
  const WorkerProfileScreen({super.key});

  @override
  State<WorkerProfileScreen> createState() => _WorkerProfileScreenState();
}

class _WorkerProfileScreenState extends State<WorkerProfileScreen> {
  static const _maxUploadBytes = 5 * 1024 * 1024;

  final _emailController = TextEditingController();
  final _emailOtpController = TextEditingController();
  final _phoneController = TextEditingController();
  final _phoneOtpController = TextEditingController();
  final List<_ExperienceDraft> _experiences = [];

  List<String> _skills = const [];
  List<String> _languages = const [];
  List<String> _positionIds = const [];
  List<TaxonomyDepartment> _taxonomy = const [];
  String? _gender;
  bool _whatsappAvailable = false;
  bool _phoneOtpSent = false;
  bool _emailOtpSent = false;
  late Future<WorkerMe> _future;
  bool _hydrated = false;
  bool _phoneChanging = false;
  bool _emailChanging = false;
  bool _uploading = false;
  bool _deletingAccount = false;
  CancelToken? _uploadCancelToken;
  String? _error;
  String? _success;
  String? _taxonomyError;

  @override
  void initState() {
    super.initState();
    _future = _load();
    _loadTaxonomy();
  }

  @override
  void dispose() {
    _uploadCancelToken?.cancel('Worker profile screen disposed.');
    _emailController.dispose();
    _emailOtpController.dispose();
    _phoneController.dispose();
    _phoneOtpController.dispose();
    for (final draft in _experiences) {
      draft.dispose();
    }
    super.dispose();
  }

  Future<WorkerMe> _load() {
    return context.read<WorkerRepository>().getMe();
  }

  Future<void> _loadTaxonomy() async {
    try {
      final taxonomy = await context.read<TaxonomyRepository>().list();
      if (!mounted) return;
      setState(() {
        _taxonomy = taxonomy;
        _taxonomyError = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _taxonomyError = 'Vəzifələr yüklənmədi.');
    }
  }

  Future<void> _refresh() async {
    setState(() {
      _hydrated = false;
      _phoneOtpSent = false;
      _emailOtpSent = false;
      _future = _load();
    });
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return ConstrainedPage(
      showBackdrop: true,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      child: FutureBuilder<WorkerMe>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const PremiumListSkeleton(itemCount: 3);
          }
          if (snapshot.hasError) {
            return ListView(
              children: [
                const SizedBox(height: 80),
                InlineMessage(
                  message: _message(
                    snapshot.error,
                    'Profil məlumatları yüklənmədi.',
                  ),
                  kind: InlineMessageKind.error,
                ),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: _refresh,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Yenidən cəhd et'),
                ),
              ],
            );
          }

          final worker = snapshot.data!;
          _hydrate(worker);

          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              children: [
                _ProfileOverview(
                  worker: worker,
                  gender: _gender,
                  languages: _languages,
                  skills: _skills,
                  positions: _selectedPositionNames(worker),
                  experiences: _experiencePayloadForSummary(),
                  uploading: _uploading,
                  onEditIdentity: () => _openIdentitySheet(worker),
                  onEditContact: () => _openContactSheet(worker),
                  onEditLanguages: _openLanguagesSheet,
                  onEditPositions: _openPositionsSheet,
                  onEditSkills: _openSkillsSheet,
                  onEditExperience: _openExperienceSheet,
                  onEditDocuments: () => _openDocumentsSheet(worker),
                ),
                const SizedBox(height: 14),
                const InlineMessage(
                  message:
                      'Əlaqə məlumatlarınız yalnız admin tərəfindən görünür. Müəssisələr profilinizin icazəli hissələrini görə bilər.',
                ),
                if (_error != null) ...[
                  const SizedBox(height: 14),
                  InlineMessage(
                    message: _error!,
                    kind: InlineMessageKind.error,
                  ),
                ],
                if (_success != null) ...[
                  const SizedBox(height: 14),
                  InlineMessage(
                    message: _success!,
                    kind: InlineMessageKind.success,
                  ),
                ],
                if (_taxonomyError != null) ...[
                  const SizedBox(height: 14),
                  InlineMessage(
                    message: _taxonomyError!,
                    kind: InlineMessageKind.error,
                  ),
                ],
                const SizedBox(height: 14),
                PremiumCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        AppStrings.accountAndPrivacy,
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 8),
                      const Text(AppStrings.deleteAccountDescription),
                      const SizedBox(height: 14),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton.icon(
                          onPressed: _deletingAccount
                              ? null
                              : _confirmAccountDeletion,
                          icon: _deletingAccount
                              ? const SizedBox.square(
                                  dimension: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.delete_forever_outlined),
                          label: const Text(AppStrings.deleteAccount),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: BrandColors.primaryBurgundy,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Future<void> _confirmAccountDeletion() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text(AppStrings.deleteAccountTitle),
        content: const Text(AppStrings.deleteAccountWarning),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text(AppStrings.cancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text(AppStrings.deleteAccount),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    final repository = context.read<WorkerRepository>();
    final auth = context.read<AuthController>();
    final roleSession = context.read<RoleSessionController>();
    setState(() {
      _deletingAccount = true;
      _error = null;
      _success = null;
    });

    try {
      await repository.deleteMyAccount();
      await auth.logout();
      await roleSession.clearRole();
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = _message(error, AppStrings.deleteAccountFailed);
      });
    } finally {
      if (mounted) {
        setState(() => _deletingAccount = false);
      }
    }
  }

  void _hydrate(WorkerMe worker) {
    if (_hydrated) return;
    _skills = worker.skills;
    _languages = worker.languages;
    _positionIds = worker.positionIds;
    _emailController.text = worker.pendingEmail ?? worker.email ?? '';
    _phoneController.text = worker.phone;
    _gender = _normalizedGender(worker.gender);
    _whatsappAvailable = worker.whatsappAvailable;
    _replaceExperiences(worker.workHistory);
    _hydrated = true;
  }

  Future<void> _saveProfile() async {
    final workHistory = _experiencePayload();
    if (workHistory == null) return;
    setState(() {
      _error = null;
      _success = null;
    });

    try {
      await context.read<WorkerRepository>().updateProfile(
        email: _emailController.text,
        positionIds: _positionIds,
        skills: _skills,
        languages: _languages,
        workHistory: workHistory,
        gender: _gender,
        whatsappAvailable: _whatsappAvailable,
        workHistorySummary: _experienceSummary(workHistory),
      );
      if (!mounted) return;
      _success = 'Profil yeniləndi.';
      await _refresh();
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Profil yenilənmədi.');
    }
  }

  Future<bool> _requestPhoneOtp(String rawPhone) async {
    final phone = _normalizePhone(rawPhone);
    if (!_validPhone(phone)) {
      if (mounted) {
        setState(
          () => _error =
              'Telefon nömrəsini beynəlxalq formatda daxil edin: +994501234567',
        );
      }
      return false;
    }
    setState(() {
      _phoneChanging = true;
      _error = null;
      _success = null;
    });
    try {
      await context.read<WorkerRepository>().requestPhoneChange(phone);
      if (!mounted) return false;
      setState(() {
        _phoneOtpSent = true;
        _success = 'OTP yeni telefon nömrəsinə göndərildi.';
      });
      return true;
    } on ApiException catch (error) {
      if (!mounted) return false;
      setState(() => _error = error.message);
    } catch (_) {
      if (!mounted) return false;
      setState(() => _error = 'Əməliyyat yerinə yetirilmədi.');
    } finally {
      if (mounted) setState(() => _phoneChanging = false);
    }
    return false;
  }

  Future<bool> _confirmPhoneChange(String rawPhone, String rawOtp) async {
    final phone = _normalizePhone(rawPhone);
    final otp = rawOtp.trim();
    if (!_validPhone(phone)) {
      if (mounted) {
        setState(
          () => _error =
              'Telefon nömrəsini beynəlxalq formatda daxil edin: +994501234567',
        );
      }
      return false;
    }
    if (!RegExp(r'^\d{6}$').hasMatch(otp)) {
      if (mounted) {
        setState(() => _error = '6 rəqəmli OTP kodu daxil edin.');
      }
      return false;
    }
    setState(() {
      _phoneChanging = true;
      _error = null;
      _success = null;
    });
    try {
      await context.read<WorkerRepository>().confirmPhoneChange(
        phone: phone,
        otpCode: otp,
      );
      if (!mounted) return false;
      _success = 'Telefon nömrəsi yeniləndi.';
      await _refresh();
      return mounted;
    } on ApiException catch (error) {
      if (!mounted) return false;
      setState(() => _error = error.message);
    } catch (_) {
      if (!mounted) return false;
      setState(() => _error = 'Əməliyyat yerinə yetirilmədi.');
    } finally {
      if (mounted) setState(() => _phoneChanging = false);
    }
    return false;
  }

  Future<bool> _requestEmailVerification(String rawEmail) async {
    final email = rawEmail.trim();
    if (email.isEmpty || !_validEmail(email)) {
      if (mounted) {
        setState(() => _error = 'Düzgün e-poçt ünvanı daxil edin.');
      }
      return false;
    }
    setState(() {
      _emailChanging = true;
      _error = null;
      _success = null;
    });
    try {
      await context.read<WorkerRepository>().requestEmailVerification(email);
      if (!mounted) return false;
      setState(() {
        _emailOtpSent = true;
        _success = 'Təsdiq kodu e-poçt ünvanına göndərildi.';
      });
      return true;
    } on ApiException catch (error) {
      if (!mounted) return false;
      setState(() => _error = error.message);
    } catch (_) {
      if (!mounted) return false;
      setState(() => _error = 'E-poçt təsdiq kodu göndərilmədi.');
    } finally {
      if (mounted) setState(() => _emailChanging = false);
    }
    return false;
  }

  Future<bool> _confirmEmailVerification(String rawOtp) async {
    final otp = rawOtp.trim();
    if (!RegExp(r'^\d{6}$').hasMatch(otp)) {
      if (mounted) {
        setState(() => _error = '6 rəqəmli təsdiq kodu daxil edin.');
      }
      return false;
    }
    setState(() {
      _emailChanging = true;
      _error = null;
      _success = null;
    });
    try {
      await context.read<WorkerRepository>().confirmEmailVerification(otp);
      if (!mounted) return false;
      _success = 'E-poçt təsdiqləndi.';
      await _refresh();
      return mounted;
    } on ApiException catch (error) {
      if (!mounted) return false;
      setState(() => _error = error.message);
    } catch (_) {
      if (!mounted) return false;
      setState(() => _error = 'E-poçt təsdiqlənmədi.');
    } finally {
      if (mounted) setState(() => _emailChanging = false);
    }
    return false;
  }

  Future<void> _pickAndUploadProfilePhoto() async {
    final file = await _pickFile(FileType.image);
    if (file == null) return;
    await _upload(
      (cancelToken) => context.read<WorkerRepository>().uploadProfilePhoto(
        fileName: file.name,
        path: file.path,
        bytes: file.bytes,
        fileSize: file.size,
        cancelToken: cancelToken,
      ),
    );
  }

  Future<void> _pickAndUploadDocument(String type) async {
    final file = await _pickFile(
      FileType.custom,
      allowedExtensions: const ['pdf', 'jpg', 'jpeg', 'png', 'webp'],
    );
    if (file == null) return;
    await _upload(
      (cancelToken) => context.read<WorkerRepository>().uploadDocument(
        type: type,
        fileName: file.name,
        path: file.path,
        bytes: file.bytes,
        fileSize: file.size,
        cancelToken: cancelToken,
      ),
    );
  }

  Future<PlatformFile?> _pickFile(
    FileType type, {
    List<String>? allowedExtensions,
  }) async {
    final result = await FilePicker.pickFiles(
      type: type,
      allowedExtensions: allowedExtensions,
      allowMultiple: false,
      withData: kIsWeb,
    );
    if (!mounted) return null;
    final file = result?.files.single;
    if (file == null || (kIsWeb ? file.bytes == null : file.path == null)) {
      setState(() {
        _error = 'Fayl seçilmədi.';
        _success = null;
      });
      return null;
    }
    if (file.size > _maxUploadBytes) {
      setState(() {
        _error = 'Fayl ölçüsü 5 MB-dan böyük olmamalıdır.';
        _success = null;
      });
      return null;
    }
    final extension = file.extension?.toLowerCase();
    final acceptedExtensions =
        allowedExtensions ?? const ['jpg', 'jpeg', 'png', 'webp'];
    if (extension == null || !acceptedExtensions.contains(extension)) {
      setState(() {
        _error = 'Dəstəklənməyən fayl formatı.';
        _success = null;
      });
      return null;
    }
    return file;
  }

  Future<void> _upload(
    Future<WorkerMe> Function(CancelToken cancelToken) action,
  ) async {
    if (_uploading) return;
    final cancelToken = CancelToken();
    _uploadCancelToken = cancelToken;
    setState(() {
      _uploading = true;
      _error = null;
      _success = null;
    });
    try {
      await action(cancelToken);
      if (!mounted) return;
      _success = 'Fayl yükləndi.';
      await _refresh();
    } on ApiException catch (error) {
      if (!mounted) return;
      _error = error.message;
    } catch (_) {
      if (!mounted) return;
      _error = 'Profil yenilənmədi.';
    } finally {
      if (identical(_uploadCancelToken, cancelToken)) {
        _uploadCancelToken = null;
      }
      if (mounted) setState(() => _uploading = false);
    }
  }

  List<String> _toggle(List<String> source, String value) {
    return source.contains(value)
        ? source.where((item) => item != value).toList(growable: false)
        : [...source, value];
  }

  Future<void> _openIdentitySheet(WorkerMe worker) async {
    var draftGender = _gender;
    await _showEditSheet(
      title: 'Şəxsi məlumatlar',
      icon: Icons.badge_outlined,
      builder: (setSheetState) {
        final photoUrl = _photoUrl(worker.profilePhotoUrl);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 34,
                  backgroundColor: BrandColors.accentGold.withValues(
                    alpha: 0.18,
                  ),
                  backgroundImage: photoUrl == null
                      ? null
                      : NetworkImage(photoUrl),
                  child: photoUrl == null
                      ? const Icon(
                          Icons.person_outline,
                          color: BrandColors.primaryBurgundy,
                          size: 34,
                        )
                      : null,
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        worker.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 6),
                      PremiumChip(
                        label:
                            '${worker.ratingAverage.toStringAsFixed(1)} (${worker.ratingCount})',
                        icon: Icons.star_outline,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: _uploading
                  ? null
                  : () async {
                      await _pickAndUploadProfilePhoto();
                      setSheetState(() {});
                    },
              icon: const Icon(Icons.photo_camera_outlined),
              label: const Text('Profil şəklini yenilə'),
            ),
            const SizedBox(height: 18),
            _SectionTitle(icon: Icons.wc_outlined, title: 'Cins'),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilterChip(
                  label: const Text('Kişi'),
                  selected: draftGender == 'male',
                  onSelected: (_) => setSheetState(() => draftGender = 'male'),
                ),
                FilterChip(
                  label: const Text('Qadın'),
                  selected: draftGender == 'female',
                  onSelected: (_) =>
                      setSheetState(() => draftGender = 'female'),
                ),
              ],
            ),
          ],
        );
      },
      onSave: () async {
        setState(() => _gender = draftGender);
        await _saveProfile();
        return true;
      },
    );
  }

  Future<void> _openContactSheet(WorkerMe worker) async {
    final emailController = TextEditingController(
      text: worker.pendingEmail ?? worker.email ?? '',
    );
    final emailOtpController = TextEditingController();
    final phoneController = TextEditingController(text: worker.phone);
    final phoneOtpController = TextEditingController();
    var draftWhatsapp = _whatsappAvailable;
    var draftPhoneOtpSent = _phoneOtpSent;
    var draftEmailOtpSent = _emailOtpSent;

    try {
      await _showEditSheet(
        title: 'Əlaqə məlumatları',
        icon: Icons.contact_phone_outlined,
        builder: (setSheetState) {
          final phoneChanged =
              _normalizePhone(phoneController.text) !=
              _normalizePhone(worker.phone);
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                controller: phoneController,
                keyboardType: TextInputType.phone,
                onChanged: (_) => setSheetState(() {}),
                decoration: const InputDecoration(
                  labelText: 'Telefon nömrəsi',
                  hintText: '+994501234567',
                  prefixIcon: Icon(Icons.phone_outlined),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: emailController,
                keyboardType: TextInputType.emailAddress,
                onChanged: (_) => setSheetState(() {}),
                decoration: const InputDecoration(
                  labelText: 'E-poçt',
                  hintText: 'ad@numune.az',
                  prefixIcon: Icon(Icons.email_outlined),
                ),
              ),
              const SizedBox(height: 10),
              _EmailVerificationBlock(
                email: emailController.text.trim(),
                currentEmail: worker.email,
                pendingEmail: worker.pendingEmail,
                emailVerified: worker.emailVerified,
                otpSent: draftEmailOtpSent,
                loading: _emailChanging,
                otpController: emailOtpController,
                onSendCode: () async {
                  final sent = await _requestEmailVerification(
                    emailController.text,
                  );
                  setSheetState(() => draftEmailOtpSent = sent);
                },
                onConfirm: () async {
                  final confirmed = await _confirmEmailVerification(
                    emailOtpController.text,
                  );
                  if (confirmed) emailOtpController.clear();
                  setSheetState(() {});
                },
              ),
              const SizedBox(height: 8),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: draftWhatsapp,
                onChanged: (value) =>
                    setSheetState(() => draftWhatsapp = value ?? false),
                title: const Text('Bu nömrə ilə WhatsApp hesabı mövcuddur'),
                controlAffinity: ListTileControlAffinity.leading,
              ),
              if (phoneChanged) ...[
                const SizedBox(height: 8),
                const InlineMessage(
                  message:
                      'Telefon nömrəsi yalnız OTP təsdiqindən sonra giriş üçün istifadə olunan nömrə kimi yenilənəcək.',
                ),
                const SizedBox(height: 10),
                LoadingButton(
                  label: 'OTP göndər',
                  icon: Icons.sms_outlined,
                  loading: _phoneChanging && !draftPhoneOtpSent,
                  onPressed: () async {
                    final sent = await _requestPhoneOtp(phoneController.text);
                    setSheetState(() => draftPhoneOtpSent = sent);
                  },
                ),
                if (draftPhoneOtpSent) ...[
                  const SizedBox(height: 10),
                  TextField(
                    controller: phoneOtpController,
                    keyboardType: TextInputType.number,
                    maxLength: 6,
                    decoration: const InputDecoration(
                      labelText: 'OTP kodu',
                      prefixIcon: Icon(Icons.pin_outlined),
                    ),
                  ),
                  LoadingButton(
                    label: 'Telefonu təsdiqlə',
                    icon: Icons.verified_outlined,
                    loading: _phoneChanging,
                    onPressed: () async {
                      final confirmed = await _confirmPhoneChange(
                        phoneController.text,
                        phoneOtpController.text,
                      );
                      if (confirmed) phoneOtpController.clear();
                      setSheetState(() {});
                    },
                  ),
                ],
              ],
            ],
          );
        },
        onSave: () async {
          if (!mounted) return false;
          setState(() {
            _emailController.text = emailController.text.trim();
            _whatsappAvailable = draftWhatsapp;
            _phoneOtpSent = draftPhoneOtpSent;
            _emailOtpSent = draftEmailOtpSent;
          });
          await _saveProfile();
          return mounted;
        },
      );
    } finally {
      await Future<void>.delayed(const Duration(milliseconds: 350));
      emailController.dispose();
      emailOtpController.dispose();
      phoneController.dispose();
      phoneOtpController.dispose();
    }
  }

  Future<void> _openLanguagesSheet() {
    var draftLanguages = [..._languages];
    return _showEditSheet(
      title: 'Dillər',
      icon: Icons.translate_outlined,
      builder: (setSheetState) => _ChipPickerSection(
        title: 'Dil bilikləri',
        icon: Icons.translate_outlined,
        values: _languageOptions,
        selected: draftLanguages,
        onToggle: (value) {
          setSheetState(() => draftLanguages = _toggle(draftLanguages, value));
        },
      ),
      onSave: () async {
        setState(() => _languages = draftLanguages);
        await _saveProfile();
        return true;
      },
    );
  }

  Future<void> _openPositionsSheet() {
    var draftPositionIds = [..._positionIds];
    return _showEditSheet(
      title: 'Vəzifələr',
      icon: Icons.work_outline,
      builder: (setSheetState) => _PositionPickerSection(
        departments: _taxonomy,
        selectedIds: draftPositionIds,
        onToggle: (value) {
          setSheetState(
            () => draftPositionIds = _toggle(draftPositionIds, value),
          );
        },
      ),
      onSave: () async {
        setState(() => _positionIds = draftPositionIds);
        await _saveProfile();
        return true;
      },
    );
  }

  Future<void> _openSkillsSheet() async {
    var draftSkills = [..._skills];
    final customController = TextEditingController();

    try {
      await _showEditSheet(
        title: 'Bacarıqlar',
        icon: Icons.auto_awesome_outlined,
        builder: (setSheetState) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _ChipPickerSection(
              title: 'Bacarıqlar',
              icon: Icons.auto_awesome_outlined,
              values: _skillOptions,
              selected: draftSkills,
              onToggle: (value) {
                setSheetState(() => draftSkills = _toggle(draftSkills, value));
              },
              customController: customController,
              onAddCustom: () {
                final value = customController.text.trim();
                if (value.isEmpty) return;
                final exists = draftSkills.any(
                  (item) => item.toLowerCase() == value.toLowerCase(),
                );
                if (!exists) {
                  setSheetState(() => draftSkills = [...draftSkills, value]);
                }
                customController.clear();
              },
            ),
          ],
        ),
        onSave: () async {
          setState(() => _skills = draftSkills);
          await _saveProfile();
          return true;
        },
      );
    } finally {
      await Future<void>.delayed(const Duration(milliseconds: 350));
      customController.dispose();
    }
  }

  Future<void> _openExperienceSheet() async {
    final current = _experiencePayloadForSummary();
    final drafts = current
        .map(_ExperienceDraft.fromExperience)
        .toList(growable: true);
    final retiredDrafts = <_ExperienceDraft>[];
    if (drafts.isEmpty) drafts.add(_ExperienceDraft());

    try {
      await _showEditSheet(
        title: 'İş təcrübəsi',
        icon: Icons.history_outlined,
        builder: (setSheetState) => _ExperienceEditorSection(
          drafts: drafts,
          onAdd: () => setSheetState(() => drafts.add(_ExperienceDraft())),
          onRemove: (draft) {
            if (drafts.length <= 1) return;
            setSheetState(() {
              drafts.remove(draft);
              retiredDrafts.add(draft);
            });
          },
        ),
        onSave: () async {
          final payload = _experiencePayloadFrom(drafts, reportErrors: true);
          if (payload == null) return false;
          setState(() => _replaceExperiences(payload));
          await _saveProfile();
          return true;
        },
      );
    } finally {
      await Future<void>.delayed(const Duration(milliseconds: 350));
      for (final draft in drafts) {
        draft.dispose();
      }
      for (final draft in retiredDrafts) {
        draft.dispose();
      }
    }
  }

  Future<void> _openDocumentsSheet(WorkerMe worker) {
    return _showEditSheet(
      title: 'Sənədlər',
      icon: Icons.folder_copy_outlined,
      saveLabel: 'Bağla',
      builder: (setSheetState) => _DocumentsEditorSection(
        worker: worker,
        uploading: _uploading,
        onUploadHealthCertificate: () async {
          await _pickAndUploadDocument('health_certificate');
          setSheetState(() {});
        },
        onUploadCriminalRecord: () async {
          await _pickAndUploadDocument('criminal_record');
          setSheetState(() {});
        },
      ),
      onSave: () async => true,
    );
  }

  Future<void> _showEditSheet({
    required String title,
    required IconData icon,
    required Widget Function(StateSetter setSheetState) builder,
    required Future<bool> Function() onSave,
    String saveLabel = 'Yadda saxla',
    VoidCallback? onCancel,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: false,
      backgroundColor: BrandColors.transparent,
      builder: (sheetContext) {
        var sheetSaving = false;
        return StatefulBuilder(
          builder: (context, setSheetState) {
            void safeSetSheetState(VoidCallback callback) {
              if (sheetContext.mounted) setSheetState(callback);
            }

            return _PremiumEditSheet(
              title: title,
              icon: icon,
              saveLabel: saveLabel,
              saving: sheetSaving,
              onCancel: () {
                if (sheetSaving) return;
                if (mounted) onCancel?.call();
                Navigator.of(sheetContext).pop();
              },
              onSave: () async {
                if (sheetSaving || !mounted || !sheetContext.mounted) return;
                safeSetSheetState(() => sheetSaving = true);
                final shouldClose = await onSave();
                if (!sheetContext.mounted) return;
                safeSetSheetState(() => sheetSaving = false);
                if (shouldClose) Navigator.of(sheetContext).pop();
              },
              child: builder(safeSetSheetState),
            );
          },
        );
      },
    );
  }

  void _replaceExperiences(List<WorkerExperience> experiences) {
    for (final draft in _experiences) {
      draft.dispose();
    }
    _experiences
      ..clear()
      ..addAll(
        experiences.isEmpty
            ? [_ExperienceDraft()]
            : experiences.map(_ExperienceDraft.fromExperience),
      );
  }

  List<WorkerExperience>? _experiencePayload() {
    return _experiencePayloadFrom(_experiences, reportErrors: true);
  }

  List<WorkerExperience>? _experiencePayloadFrom(
    List<_ExperienceDraft> drafts, {
    required bool reportErrors,
  }) {
    final items = <WorkerExperience>[];
    for (final draft in drafts) {
      final company = draft.companyController.text.trim();
      final position = draft.positionController.text.trim();
      final note = draft.noteController.text.trim();
      if (company.isEmpty && position.isEmpty && note.isEmpty) continue;
      if (company.isEmpty || position.isEmpty) {
        if (reportErrors) setState(() => _error = 'Bu xana mütləqdir.');
        return null;
      }
      items.add(
        WorkerExperience(companyName: company, position: position, note: note),
      );
    }
    return items;
  }

  List<WorkerExperience> _experiencePayloadForSummary() {
    return _experiencePayloadFrom(_experiences, reportErrors: false) ??
        const <WorkerExperience>[];
  }

  String _experienceSummary(List<WorkerExperience> items) {
    return items
        .map((item) {
          final note = item.note.trim().isEmpty ? '' : ' - ${item.note.trim()}';
          return '${item.companyName} / ${item.position}$note';
        })
        .join('\n');
  }

  List<String> _selectedPositionNames(WorkerMe worker) {
    final positionById = {
      for (final department in _taxonomy)
        for (final subdepartment in department.subdepartments)
          for (final position in subdepartment.positions)
            position.id: position.nameAz,
    };
    final names = _positionIds
        .map((id) => positionById[id])
        .whereType<String>()
        .where((name) => name.trim().isNotEmpty)
        .toList(growable: false);
    if (names.isNotEmpty) return names;
    if (worker.positions.isNotEmpty) return worker.positions;
    final legacy = worker.position?.trim();
    return legacy == null || legacy.isEmpty ? const [] : [legacy];
  }

  String _normalizePhone(String value) =>
      value.replaceAll(RegExp(r'[\s().-]'), '');

  bool _validPhone(String value) {
    return RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(value);
  }

  bool _validEmail(String value) {
    return RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(value);
  }

  String? _normalizedGender(String? value) {
    return value == 'male' || value == 'female' ? value : null;
  }

  String _message(Object? error, String fallback) {
    return error is ApiException ? error.message : fallback;
  }
}
