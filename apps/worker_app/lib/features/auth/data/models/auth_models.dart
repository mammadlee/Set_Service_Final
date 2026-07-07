class WorkerProfile {
  const WorkerProfile({required this.id, required this.status});

  final String id;
  final String status;

  factory WorkerProfile.fromJson(Map<String, dynamic> json) {
    return WorkerProfile(
      id: json['id'] as String? ?? '',
      status: json['status'] as String? ?? '',
    );
  }
}

class CompanyAuthProfile {
  const CompanyAuthProfile({required this.id, required this.status});

  final String id;
  final String status;

  factory CompanyAuthProfile.fromJson(Map<String, dynamic> json) {
    return CompanyAuthProfile(
      id: json['id'] as String? ?? '',
      status: json['status'] as String? ?? '',
    );
  }
}

class AuthUser {
  const AuthUser({
    required this.id,
    required this.phone,
    this.email,
    required this.role,
    required this.name,
    this.worker,
    this.company,
    this.permissions = const [],
  });

  final String id;
  final String phone;
  final String? email;
  final String role;
  final String name;
  final WorkerProfile? worker;
  final CompanyAuthProfile? company;
  final List<String> permissions;

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    final workerJson = json['worker'];
    final companyJson = json['company'];
    return AuthUser(
      id: json['id'] as String? ?? '',
      phone: json['phone'] as String? ?? '',
      email: json['email'] as String?,
      role: json['role'] as String? ?? '',
      name: json['name'] as String? ?? '',
      worker: workerJson is Map<String, dynamic>
          ? WorkerProfile.fromJson(workerJson)
          : null,
      company: companyJson is Map<String, dynamic>
          ? CompanyAuthProfile.fromJson(companyJson)
          : null,
      permissions: _stringList(json['permissions']),
    );
  }
}

class AuthSession {
  const AuthSession({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
  });

  final String accessToken;
  final String refreshToken;
  final AuthUser user;

  factory AuthSession.fromJson(Map<String, dynamic> json) {
    return AuthSession(
      accessToken: json['access_token'] as String? ?? '',
      refreshToken: json['refresh_token'] as String? ?? '',
      user: AuthUser.fromJson(
        json['user'] as Map<String, dynamic>? ?? const {},
      ),
    );
  }
}

class OtpStartResult {
  const OtpStartResult({
    required this.otpSent,
    this.status,
    this.workerId,
    this.retryAfterSeconds,
  });

  final bool otpSent;
  final String? status;
  final String? workerId;
  final int? retryAfterSeconds;

  factory OtpStartResult.fromJson(Map<String, dynamic> json) {
    return OtpStartResult(
      otpSent: json['otp_sent'] == true,
      status: json['status'] as String?,
      workerId: json['worker_id'] as String?,
      retryAfterSeconds: json['retry_after_seconds'] is int
          ? json['retry_after_seconds'] as int
          : null,
    );
  }
}

class OtpVerificationResult {
  const OtpVerificationResult({
    required this.otpVerified,
    this.otpChallenge,
    this.status,
    this.workerId,
  });

  final bool otpVerified;
  final String? otpChallenge;
  final String? status;
  final String? workerId;

  factory OtpVerificationResult.fromJson(Map<String, dynamic> json) {
    return OtpVerificationResult(
      otpVerified:
          json['otp_verified'] == true || json['password_required'] == true,
      otpChallenge: json['otp_challenge'] as String?,
      status: json['status'] as String?,
      workerId: json['worker_id'] as String?,
    );
  }
}

class WorkerRegistrationVerification {
  const WorkerRegistrationVerification({
    required this.workerId,
    required this.status,
    required this.message,
  });

  final String workerId;
  final String status;
  final String message;

  factory WorkerRegistrationVerification.fromJson(Map<String, dynamic> json) {
    return WorkerRegistrationVerification(
      workerId: json['worker_id'] as String? ?? '',
      status: json['status'] as String? ?? '',
      message: json['message'] as String? ?? '',
    );
  }
}

class WorkerMe {
  const WorkerMe({
    required this.id,
    required this.name,
    required this.phone,
    required this.position,
    required this.positionIds,
    required this.positions,
    required this.email,
    required this.emailVerified,
    required this.emailVerifiedAt,
    required this.pendingEmail,
    required this.profilePhotoUrl,
    required this.skills,
    required this.languages,
    required this.documents,
    required this.workHistorySummary,
    required this.workHistory,
    required this.gender,
    required this.whatsappAvailable,
    required this.status,
    required this.availability,
    required this.workerClass,
    required this.ratingAverage,
    required this.ratingCount,
  });

  final String id;
  final String name;
  final String phone;
  final String? position;
  final List<String> positionIds;
  final List<String> positions;
  final String? email;
  final bool emailVerified;
  final String? emailVerifiedAt;
  final String? pendingEmail;
  final String? profilePhotoUrl;
  final List<String> skills;
  final List<String> languages;
  final List<WorkerDocument> documents;
  final String? workHistorySummary;
  final List<WorkerExperience> workHistory;
  final String? gender;
  final bool whatsappAvailable;
  final String status;
  final bool availability;
  final String? workerClass;
  final double ratingAverage;
  final int ratingCount;

  factory WorkerMe.fromJson(Map<String, dynamic> json) {
    return WorkerMe(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      phone: json['phone'] as String? ?? '',
      position: json['position'] as String?,
      positionIds: _stringList(json['position_ids']),
      positions: _positionNames(json['positions']),
      email: json['email'] as String?,
      emailVerified: json['email_verified'] == true,
      emailVerifiedAt: json['email_verified_at'] as String?,
      pendingEmail: json['pending_email'] as String?,
      profilePhotoUrl: json['profile_photo_url'] as String?,
      skills: _stringList(json['skills']),
      languages: _stringList(json['languages']),
      documents: _documentList(json['documents']),
      workHistorySummary: json['work_history_summary'] as String?,
      workHistory: _experienceList(json['work_history']),
      gender: json['gender'] as String?,
      whatsappAvailable: json['whatsapp_available'] == true,
      status: json['status'] as String? ?? '',
      availability: json['availability'] == true,
      workerClass: json['worker_class'] as String?,
      ratingAverage: _double(json['rating_avg']),
      ratingCount: json['rating_count'] is int
          ? json['rating_count'] as int
          : 0,
    );
  }
}

class WorkerExperience {
  const WorkerExperience({
    required this.companyName,
    required this.position,
    required this.note,
  });

  final String companyName;
  final String position;
  final String note;

  factory WorkerExperience.fromJson(Map<String, dynamic> json) {
    return WorkerExperience(
      companyName: json['company_name'] as String? ?? '',
      position: json['position'] as String? ?? '',
      note: json['note'] as String? ?? '',
    );
  }

  Map<String, dynamic> toJson() => {
    'company_name': companyName,
    'position': position,
    if (note.trim().isNotEmpty) 'note': note.trim(),
  };
}

class WorkerDocument {
  const WorkerDocument({
    required this.type,
    required this.url,
    this.name,
    this.mimeType,
    this.uploadedAt,
    this.companyVisible = false,
  });

  final String type;
  final String url;
  final String? name;
  final String? mimeType;
  final String? uploadedAt;
  final bool companyVisible;

  factory WorkerDocument.fromJson(Map<String, dynamic> json) {
    return WorkerDocument(
      type: json['type'] as String? ?? '',
      url: json['url'] as String? ?? '',
      name: json['name'] as String?,
      mimeType: json['mime_type'] as String?,
      uploadedAt: json['uploaded_at'] as String?,
      companyVisible: json['company_visible'] == true,
    );
  }
}

List<String> _stringList(Object? value) {
  if (value is! List) return const [];
  return value
      .map((item) {
        if (item is String) return item;
        if (item is Map<String, dynamic>) return item['name'] as String? ?? '';
        return '';
      })
      .where((item) => item.trim().isNotEmpty)
      .toList(growable: false);
}

List<String> _positionNames(Object? value) {
  if (value is! List) return const [];
  return value
      .whereType<Map<String, dynamic>>()
      .map((item) => item['name_az'] as String? ?? '')
      .where((item) => item.trim().isNotEmpty)
      .toList(growable: false);
}

List<WorkerDocument> _documentList(Object? value) {
  if (value is! List) return const [];
  return value
      .whereType<Map<String, dynamic>>()
      .map(WorkerDocument.fromJson)
      .where((document) => document.type.isNotEmpty && document.url.isNotEmpty)
      .toList(growable: false);
}

List<WorkerExperience> _experienceList(Object? value) {
  if (value is! List) return const [];
  return value
      .whereType<Map<String, dynamic>>()
      .map(WorkerExperience.fromJson)
      .where(
        (item) =>
            item.companyName.trim().isNotEmpty ||
            item.position.trim().isNotEmpty ||
            item.note.trim().isNotEmpty,
      )
      .toList(growable: false);
}

double _double(Object? value) {
  if (value is num) return value.toDouble();
  return 0;
}
