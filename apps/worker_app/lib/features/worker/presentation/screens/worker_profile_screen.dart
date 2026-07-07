import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/network/api_exception.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../shared/widgets/constrained_page.dart';
import '../../../../shared/widgets/inline_message.dart';
import '../../../../shared/widgets/loading_button.dart';
import '../../../../shared/widgets/premium_components.dart';
import '../../../auth/data/models/auth_models.dart';
import '../../../taxonomy/data/taxonomy_repository.dart';
import '../../data/worker_repository.dart';

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
                      'Əlaqə məlumatlarınız yalnız adminə görünür. Müəssisələr profilinizin icazəli hissələrini görə bilir.',
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
              ],
            ),
          );
        },
      ),
    );
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
      setState(() => _error = 'Əməliyyat alınmadı.');
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
      setState(() => _error = 'Əməliyyat alınmadı.');
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
      setState(() => _error = 'Email təsdiq kodu göndərilmədi.');
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
      _success = 'Email təsdiqləndi.';
      await _refresh();
      return mounted;
    } on ApiException catch (error) {
      if (!mounted) return false;
      setState(() => _error = error.message);
    } catch (_) {
      if (!mounted) return false;
      setState(() => _error = 'Email təsdiqlənmədi.');
    } finally {
      if (mounted) setState(() => _emailChanging = false);
    }
    return false;
  }

  Future<void> _pickAndUploadProfilePhoto() async {
    final file = await _pickFile(FileType.image);
    if (file == null) return;
    await _upload(
      () => context.read<WorkerRepository>().uploadProfilePhoto(
        file.path!,
        file.name,
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
      () => context.read<WorkerRepository>().uploadDocument(
        type: type,
        path: file.path!,
        fileName: file.name,
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
      withData: false,
    );
    if (!mounted) return null;
    final file = result?.files.single;
    if (file?.path == null) {
      setState(() {
        _error = 'Fayl seçilmədi.';
        _success = null;
      });
      return null;
    }
    if (file!.size > _maxUploadBytes) {
      setState(() {
        _error = 'Fayl ölçüsü 5 MB-dan böyük olmamalıdır.';
        _success = null;
      });
      return null;
    }
    return file;
  }

  Future<void> _upload(Future<WorkerMe> Function() action) async {
    setState(() {
      _uploading = true;
      _error = null;
      _success = null;
    });
    try {
      await action();
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
                title: const Text('Bu nömrədə WhatsApp mövcuddur'),
                controlAffinity: ListTileControlAffinity.leading,
              ),
              if (phoneChanged) ...[
                const SizedBox(height: 8),
                const InlineMessage(
                  message:
                      'Telefon yalnız OTP təsdiqindən sonra giriş nömrəniz kimi yenilənəcək.',
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

const _skillOptions = [
  'Qonaqlarla peşəkar ünsiyyət',
  'Müştəri məmnuniyyətinin təmin edilməsi',
  'Komanda ilə işləmək bacarığı',
  'Vaxtın idarə olunması',
  'Stress altında işləmə bacarığı',
  'Rezervasiya proseslərinin idarə olunması',
  'Housekeeping və otaq yoxlaması standartları',
  'Təhlükəsizlik və gigiyena standartları (HACCP, ISO)',
  'Kassa və POS sistemi ilə işləmək',
  'Səliqə, etik davranış və təqdimat bacarığı',
  'F&B xidmətləri haqqında bilik',
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
                company.isEmpty ? 'Təcrübə $index' : company,
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
              label: const Text('Sağlamlıq sənədi'),
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

class _ExperienceDraft {
  _ExperienceDraft({
    String companyName = '',
    String position = '',
    String note = '',
  }) : companyController = TextEditingController(text: companyName),
       positionController = TextEditingController(text: position),
       noteController = TextEditingController(text: note);

  factory _ExperienceDraft.fromExperience(WorkerExperience experience) {
    return _ExperienceDraft(
      companyName: experience.companyName,
      position: experience.position,
      note: experience.note,
    );
  }

  final TextEditingController companyController;
  final TextEditingController positionController;
  final TextEditingController noteController;

  void dispose() {
    companyController.dispose();
    positionController.dispose();
    noteController.dispose();
  }
}

String? _photoUrl(String? value) {
  if (value == null || value.trim().isEmpty) return null;
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }
  return '${AppConfig.rawBaseUrl}${value.startsWith('/') ? '' : '/'}$value';
}

String _documentLabel(String type) {
  return switch (type) {
    'health_certificate' => 'Sağlamlıq sənədi',
    'criminal_record' => 'Məhkumluq arayışı',
    _ => type,
  };
}
