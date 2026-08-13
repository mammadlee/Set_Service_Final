import type { AssignmentStatus, CompanyStatus, OrderStatus, WorkerStatus } from '../api/types';

type KnownStatus = WorkerStatus | CompanyStatus | OrderStatus | AssignmentStatus | 'open' | 'read' | 'unread' | 'checked_in' | 'waiting';

export const appStrings = {
  brand: 'SET Service',
  adminPanel: 'Super admin paneli',
  superAdmin: 'Super admin',
  logout: 'Çıxış et',
  openMenu: 'Menyunu aç',
  closeMenu: 'Menyunu bağla',
  close: 'Bağla',
  back: 'Geri',
  view: 'Bax',
  retry: 'Yenidən cəhd et',
  loading: 'Məlumatlar yüklənir...',
  empty: 'Məlumat tapılmadı',
  unknownError: 'Xəta baş verdi. Zəhmət olmasa yenidən cəhd edin.',
  unexpectedResponse: 'Serverdən gözlənilməyən cavab gəldi.',
  requestFailed: 'Sorğu yerinə yetirilmədi.',
  networkError: 'Şəbəkəyə qoşulmaq mümkün olmadı. Zəhmət olmasa internet bağlantısını və API ünvanını yoxlayın.',
  validationError: 'Məlumatları yoxlayın və yenidən cəhd edin.',
  tooManyRequests: 'Çox sayda sorğu göndərilib. Bir az sonra yenidən cəhd edin.',
  internalServerError: 'Serverdə xəta baş verdi. Bir az sonra yenidən cəhd edin.',
  corsDenied: 'Bu paneldən API-yə girişə icazə verilmir.',
  yes: 'Bəli',
  no: 'Xeyr',
  allStatuses: 'Bütün statuslar',
  previous: 'Əvvəlki',
  next: 'Növbəti',
  pageOf: (page: number, totalPages: number) => `Səhifə ${page} / ${Math.max(totalPages, 1)}`,
  requiredReason: 'Səbəb',
  reasonPlaceholder: 'Səbəbi aydın şəkildə yazın',
  cancel: 'Ləğv et',
  working: 'İcra olunur...',
  notAvailable: '-',

  nav: {
    dashboard: 'İdarə paneli',
    workers: 'İşçilər',
    companies: 'Müəssisələr',
    orders: 'Sifarişlər',
    assignments: 'Təyinatlar',
    attendance: 'Giriş-çıxış',
    qrDisplay: 'QR ekranı',
    reports: 'Hesabatlar',
    notifications: 'Bildirişlər',
  },

  auth: {
    title: 'SET Service admin paneli',
    subtitle: 'İşçi qüvvəsi əməliyyat paneli',
    loginTitle: 'Admin girişi',
    loginDescription: 'Davam etmək üçün daxili admin e-poçtunu və şifrəsini daxil edin.',
    email: 'E-poçt',
    emailPlaceholder: 'admin@setservice.az',
    password: 'Şifrə',
    passwordPlaceholder: 'Şifrənizi daxil edin',
    loginButton: 'Daxil ol',
    wait: 'Zəhmət olmasa gözləyin...',
    onlySuperAdmin: 'Admin panelinə yalnız daxili admin hesabı ilə daxil olmaq mümkündür.',
  },

  dashboard: {
    title: 'Əməliyyat paneli',
    description: 'SET Service əməliyyatları üzrə canlı icmal.',
    workers: 'İşçilər',
    companies: 'Müəssisələr',
    activeOrders: 'Aktiv sifarişlər',
    todayActiveOrders: 'Bugünkü aktiv sifarişlər',
    pendingOrders: 'Gözləyən sifarişlər',
    activeAssignments: 'Aktiv təyinatlar',
    checkedInToday: 'Bu gün giriş edənlər',
    rejectedAssignments: 'Rədd edilmiş təyinatlar',
    pendingWorkers: 'Təsdiq gözləyən işçilər',
    pendingCompanies: 'Təsdiq gözləyən müəssisələr',
    assignments: 'Təyinatlar',
    openAttendance: 'Açıq girişlər',
    verifiedTitle: 'Əsas axın təsdiqlənib',
    verifiedBody:
      'Giriş, işçi təsdiqi, müəssisə sifarişi, admin təyinatı, işçi qəbulu və QR ilə giriş-çıxış axını təsdiq sınağından keçirilib.',
  },

  workers: {
    title: 'İşçilərin idarə edilməsi',
    description: 'Təsdiq gözləyən işçiləri yoxlayın və qərar verin.',
    search: 'İşçi axtar',
    empty: 'Cari filtrə uyğun işçi tapılmadı.',
    detailTitle: 'İşçi məlumatları',
    detailDescription: 'Profil məlumatlarını, sənədləri və təsdiq statusunu yoxlayın.',
    name: 'Ad',
    phone: 'Telefon',
    email: 'E-poçt',
    position: 'Vəzifə',
    workerClass: 'İşçi sinfi',
    allClasses: 'Bütün siniflər',
    noWorkerClass: 'Sinif seçilməyib',
    classUpdated: 'İşçi sinfi yeniləndi.',
    updateClass: 'Sinfi yenilə',
    selectClass: 'Sinif seçin',
    clearClass: 'Sinfi sil',
    ratings: 'Reytinq tarixçəsi',
    noRatings: 'Hələ reytinq yoxdur.',
    ratingScore: 'Bal',
    ratingFeedback: 'Rəy',
    ratingOrder: 'Sifariş',
    ratingDate: 'Tarix',
    profilePhoto: 'Profil şəkli',
    skills: 'Bacarıqlar',
    languages: 'Dil bilikləri',
    workHistory: 'İş tarixçəsi',
    noData: 'Məlumat yoxdur.',
    status: 'Status',
    availability: 'Əlçatanlıq',
    available: 'Əlçatandır',
    unavailable: 'Əlçatan deyil',
    rating: 'Reytinq',
    rejectReason: 'Rədd səbəbi',
    documents: 'Sənədlər',
    noDocuments: 'Sənəd yüklənməyib.',
    openDocument: 'Aç',
    document: 'Sənəd',
    approve: 'İşçini təsdiqlə',
    reject: 'İşçini rədd et',
    approveTitle: 'İşçi təsdiqlənsin?',
    approveMessage: 'Bu işçi sistemə daxil olub işçi tətbiqi funksiyalarından istifadə edə biləcək.',
    rejectTitle: 'İşçi rədd edilsin?',
    rejectMessage: 'Rədd səbəbi mütləqdir və işçi profilində saxlanılacaq.',
  },

  companies: {
    title: 'Müəssisələrin idarə edilməsi',
    description: 'Müəssisə hesablarını təsdiqləyin və ya rədd edin.',
    search: 'Müəssisə axtar',
    empty: 'Cari filtrə uyğun müəssisə tapılmadı.',
    detailTitle: 'Müəssisə məlumatları',
    detailDescription: 'Müəssisənin təsdiq statusunu və sənədlərini yoxlayın.',
    name: 'Ad',
    contact: 'Əlaqədar şəxs',
    phone: 'Telefon',
    email: 'E-poçt',
    status: 'Status',
    docsUrl: 'Sənəd linki',
    rejectReason: 'Rədd səbəbi',
    documents: 'Sənədlər',
    noDocuments: 'Sənəd yüklənməyib.',
    approve: 'Müəssisəni təsdiqlə',
    reject: 'Müəssisəni rədd et',
    approveTitle: 'Müəssisə təsdiqlənsin?',
    approveMessage: 'Bu müəssisə sifariş yarada biləcək.',
    rejectTitle: 'Müəssisə rədd edilsin?',
    rejectMessage: 'Rədd səbəbi mütləqdir.',
  },

  orders: {
    title: 'Sifarişlər',
    description: 'Bütün müəssisə sifarişlərini və təyinat saylarını izləyin.',
    search: 'Sifariş axtar',
    empty: 'Cari filtrə uyğun sifariş tapılmadı.',
    detailTitle: 'Sifariş məlumatları',
    detailDescription: 'Sifariş tələblərini və təyin olunmuş işçiləri yoxlayın.',
    orderTitle: 'Başlıq',
    company: 'Müəssisə',
    category: 'Kateqoriya',
    categoryRequirements: 'Kateqoriya tələbləri',
    status: 'Status',
    workers: 'İşçi sayı',
    start: 'Başlama',
    end: 'Bitmə',
    location: 'Məkan',
    requiredWorkers: 'Tələb olunan işçi',
    assigned: 'Təyin olunub',
    payRate: 'Ödəniş məbləği',
    assignments: 'Təyinatlar',
    noAssignments: 'Hələ təyinat yoxdur.',
    worker: 'İşçi',
  },

  assignments: {
    title: 'Təyinatlar',
    description: 'Təsdiqlənmiş işçiləri aktiv sifarişlərə təyin edin və statusları izləyin.',
    createTitle: 'Təyinat yarat',
    createDescription: 'Yalnız aktiv sifarişlər və əlçatan təsdiqlənmiş işçilər göstərilir.',
    activeOrder: 'Aktiv sifariş',
    selectOrder: 'Sifariş seçin',
    capacity: (assigned: number, required: number) => `Tutum: ${assigned}/${required} işçi təyin olunub.`,
    category: 'Kateqoriya',
    remaining: (remaining: number, required: number) => `${remaining}/${required} qalıb`,
    approvedWorkers: 'Təsdiqlənmiş əlçatan işçilər',
    noAvailableWorkers: 'Əlçatan təsdiqlənmiş işçi tapılmadı.',
    assign: (count: number) => `${count || ''} işçi təyin et`.trim(),
    assigning: 'Təyin olunur...',
    filterByOrderId: 'Sifariş ID-si üzrə filtr',
    filterByWorkerId: 'İşçi ID-si üzrə filtr',
    empty: 'Cari filtrə uyğun təyinat tapılmadı.',
    worker: 'İşçi',
    order: 'Sifariş',
    company: 'Müəssisə',
    status: 'Status',
    assignedAt: 'Təyin tarixi',
    cancel: 'Ləğv et',
    cancelTitle: 'Təyinat ləğv edilsin?',
    cancelMessage: 'Bu, işçinin həmin təyinat üzrə gələcək giriş-çıxış əməliyyatlarının qarşısını alır.',
    cancelConfirm: 'Təyinatı ləğv et',
    detailTitle: 'Təyinat məlumatları',
    detailDescription: 'Təyinatın işçi, sifariş və status məlumatlarını yoxlayın.',
    id: 'Təyinat ID-si',
    kioskTitle: 'QR ekranı hazırdır',
    kioskCreate: 'QR ekranı yarat',
    kioskCreating: 'QR ekranı yaradılır...',
    kioskCopy: 'Linki köçür',
    kioskOpen: 'QR ekranını aç',
    kioskDeactivate: 'Deaktiv et',
    kioskDeactivateDone: 'QR ekranı deaktiv edildi.',
    kioskCopyDone: 'QR linki köçürüldü.',
    kioskWorkerAssignment: 'İşçi / təyinat',
    kioskLink: 'Link',
    kioskHelper:
      'Bu linki girişdəki tablet və ya brauzerdə açın. İşçilər mobil tətbiqdən QR kodu oxudaraq giriş-çıxış edəcəklər.',
    kioskRequiresAccepted:
      'QR ekranı yalnız işçi tərəfindən qəbul edilmiş və aktiv sifarişə bağlı təyinat üçün yaradıla bilər.',
  },

  reports: {
    title: 'Hesabatlar',
    description: 'Tarix aralığı, müəssisə, işçi və kateqoriya üzrə əməliyyat göstəriciləri.',
    filters: 'Filtrlər',
    startDate: 'Başlama tarixi',
    endDate: 'Bitmə tarixi',
    companyId: 'Müəssisə ID-si',
    workerId: 'İşçi ID-si',
    category: 'Kateqoriya',
    apply: 'Hesabatı yenilə',
    workerWorkCounts: 'İşçilər üzrə iş sayı',
    companyUsage: 'Müəssisələr üzrə istifadə',
    assignmentStats: 'Təyinat statistikası',
    attendanceStats: 'Davamiyyət statistikası',
    ratingStats: 'Reytinq statistikası',
    completed: 'Tamamlanmış',
    total: 'Cəmi',
    open: 'Açıq',
    average: 'Orta göstərici',
    count: 'Say',
    empty: 'Cari filtrə uyğun hesabat məlumatı yoxdur.',
  },

  attendance: {
    title: 'Giriş-çıxış',
    description: 'Təyinatlar üzrə işçi giriş və çıxış qeydlərini yoxlayın.',
    assignmentId: 'Təyinat ID-si',
    orderId: 'Sifariş ID-si',
    workerId: 'İşçi ID-si',
    allSessions: 'Bütün sessiyalar',
    openCheckIns: 'Açıq girişlər',
    completedSessions: 'Tamamlanmış sessiyalar',
    empty: 'Cari filtrə uyğun giriş-çıxış qeydi tapılmadı.',
    worker: 'İşçi',
    order: 'Sifariş',
    assignment: 'Təyinat',
    status: 'Status',
    statusWaiting: 'Gözlənilir',
    statusCheckedIn: 'Giriş edilib',
    statusCompleted: 'Tamamlanıb',
    checkIn: 'Giriş',
    checkOut: 'Çıxış',
    detailTitle: 'Giriş-çıxış məlumatları',
    detailDescription: 'Seçilmiş giriş-çıxış sessiyasını yoxlayın.',
    workerPhone: 'İşçi telefonu',
    company: 'Müəssisə',
    duration: 'Müddət',
    minutes: 'dəqiqə',
    metadata: 'Sessiya məlumatları',
    checkinLocation: 'Giriş məkanı',
    checkoutLocation: 'Çıxış məkanı',
    checkinNotes: 'Giriş qeydi',
    checkoutNotes: 'Çıxış qeydi',
    created: 'Yaradılıb',
    updated: 'Yenilənib',
  },

  qr: {
    title: 'QR kiosk ekranı',
    description: 'Qəbul edilmiş aktiv təyinat üçün ayrıca tablet linki yaradın. Kiosk QR kodu hər 30 saniyədən bir yeniləyir.',
    generateTitle: 'Kiosk linki yarat',
    generateDescription: 'Qəbul edilmiş təyinatı seçin. Admin istənilən uyğun təyinat üçün kiosk ekranı yarada bilər.',
    assignmentId: 'Təyinat ID-si',
    generate: 'QR yarat',
    generating: 'Yaradılır...',
    displayTitle: 'Kiosk linki',
    displayDescription: 'Bu linki ümumi istifadədə olan tablet və ya brauzerdə açın. İşçi QR kodu mobil tətbiqdən oxudaraq giriş və ya çıxış edə bilər.',
    assignment: 'Təyinat',
    order: 'Sifariş',
    expires: 'Vaxtı bitir',
    refreshesEvery: 'Hər 30 saniyədən bir yenilənir',
    refreshing: 'QR yenilənir...',
    lastUpdated: 'Son yenilənmə',
    manualFallback: 'Token əl ilə daxil etmək üçün ehtiyat variant kimi saxlanılır',
    copyToken: 'Tokeni köçür',
    empty: 'Hələ QR yaradılmayıb.',
  },

  notifications: {
    title: 'Bildirişlər',
    description: 'Əməliyyat axınlarından gələn admin bildirişləri.',
    markAllRead: 'Hamısını oxunmuş kimi qeyd et',
    unreadOnly: 'Yalnız oxunmamışlar',
    empty: 'Göstəriləcək bildiriş yoxdur.',
    markRead: 'Oxunmuş kimi qeyd et',
    read: 'Oxunub',
    unread: 'Oxunmayıb',
    jobAssigned: 'Yeni təyinat yaradıldı',
    jobAssignedBody: 'İşçiyə yeni təyinat verildi.',
    workerApproved: 'İşçi təsdiqləndi',
    workerApprovedBody: 'İşçi profili təsdiqləndi.',
    workerRejected: 'İşçi rədd edildi',
    workerRejectedBody: 'İşçi profili rədd edildi.',
    companyApproved: 'Müəssisə təsdiqləndi',
    companyApprovedBody: 'Müəssisə hesabı təsdiqləndi.',
    companyRejected: 'Müəssisə rədd edildi',
    companyRejectedBody: 'Müəssisə hesabı rədd edildi.',
    orderCreated: 'Yeni sifariş yaradıldı',
    orderCreatedBody: 'Müəssisə yeni sifariş yaratdı.',
    system: 'Sistem bildirişi',
    channels: {
      in_app: 'Tətbiqdaxili',
      sms: 'SMS',
      email: 'E-poçt',
      push: 'Mobil bildiriş',
    },
  },
};

export function statusLabel(status: string): string {
  return (
    {
      draft: 'Qaralama',
      pending_otp: 'OTP təsdiqi gözlənilir',
      pending_approval: 'Admin təsdiqi gözlənilir',
      approved: 'Təsdiqlənib',
      rejected: 'Rədd edilib',
      suspended: 'Dayandırılıb',
      inactive: 'Aktiv deyil',
      active: 'Aktiv',
      completed: 'Tamamlanıb',
      cancelled: 'Ləğv edilib',
      assigned: 'Təyin olunub',
      accepted: 'Qəbul edilib',
      checked_in: 'Giriş edilib',
      waiting: 'Gözlənilir',
      open: 'Açıq',
      read: 'Oxunub',
      unread: 'Oxunmayıb',
    } satisfies Record<KnownStatus, string>
  )[status as KnownStatus] ?? status.replaceAll('_', ' ');
}

export function apiErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return appStrings.unknownError;

  const apiError = error as Error & { code?: string; status?: number };
  const mapped = apiError.code ? backendErrorMessage(apiError.code) : null;
  if (mapped) return mapped;

  if (looksLikeNetworkError(error.message)) return appStrings.networkError;
  if (apiError.status === 401) return 'Sessiya bitib. Zəhmət olmasa yenidən daxil olun.';
  if (apiError.status === 403) return 'Bu əməliyyat üçün icazəniz yoxdur.';
  if (apiError.status === 429) return appStrings.tooManyRequests;
  if (apiError.status && apiError.status >= 500) return appStrings.internalServerError;
  if (looksEnglish(error.message)) return appStrings.requestFailed;
  return error.message || appStrings.unknownError;
}

export function backendErrorMessage(code: string): string | null {
  return (
    {
      INVALID_OTP: 'OTP kodu yanlışdır və ya vaxtı bitib.',
      VALIDATION_ERROR: appStrings.validationError,
      INVALID_PHONE: 'Telefon nömrəsi düzgün formatda deyil.',
      TOO_MANY_REQUESTS: appStrings.tooManyRequests,
      CORS_ORIGIN_DENIED: appStrings.corsDenied,
      INTERNAL_ERROR: appStrings.internalServerError,
      OTP_INVALID: 'OTP kodu yanlışdır.',
      OTP_EXPIRED: 'OTP kodunun vaxtı bitib.',
      OTP_BLOCKED: 'Çox sayda cəhd edildi. Bir az sonra yenidən cəhd edin.',
      OTP_RATE_LIMITED: 'Çox sayda OTP sorğusu göndərilib. Bir az sonra yenidən cəhd edin.',
      OTP_COOLDOWN: 'Yeni OTP istəmək üçün bir az gözləyin.',
      PHONE_ALREADY_REGISTERED: 'Bu telefon nömrəsi ilə artıq hesab yaradılıb.',
      EMAIL_ALREADY_REGISTERED: 'Bu e-poçt ünvanı ilə artıq hesab yaradılıb.',
      INVALID_CREDENTIALS: 'E-poçt ünvanı, telefon nömrəsi və ya şifrə yanlışdır.',
      OTP_LOGIN_DEPRECATED: 'OTP ilə giriş artıq aktiv deyil. Şifrə ilə daxil olun.',
      WORKER_NOT_FOUND: 'İşçi tapılmadı.',
      INVALID_WORKER_CLASS: 'İşçi sinfi düzgün deyil.',
      INVALID_FOC_TRAINING_FILTER: 'F.O.C. təlim filtri düzgün deyil.',
      DUPLICATE_RATING: 'Bu növbə üzrə reytinq artıq verilib.',
      RATING_NOT_AVAILABLE: 'Reytinq yalnız çıxış qeydə alındıqdan sonra verilə bilər.',
      COMPANY_NOT_FOUND: 'Müəssisə tapılmadı.',
      ORDER_NOT_FOUND: 'Sifariş tapılmadı.',
      INVALID_WORKER_STATUS: 'İşçi statusu yanlışdır.',
      INVALID_COMPANY_STATUS: 'Müəssisə statusu yanlışdır.',
      INVALID_REFRESH_TOKEN: 'Sessiya yeniləmə tokeni yanlışdır və ya vaxtı bitib.',
      WORKER_NOT_APPROVED: 'İşçi hesabı hələ təsdiqlənməyib.',
      COMPANY_NOT_APPROVED: 'Müəssisə hesabı hələ təsdiqlənməyib.',
      ACCOUNT_NOT_APPROVED: 'Hesab hələ təsdiqlənməyib.',
      ACCOUNT_INACTIVE: 'Hesab aktiv deyil.',
      ADMIN_ACCOUNT_INACTIVE: 'Admin hesabı aktiv deyil.',
      ADMIN_SESSION_INVALID: 'Admin sessiyası yenilənməlidir. Yenidən daxil olun.',
      ADMIN_PROFILE_MISSING: 'Admin profili tapılmadı.',
      ROLE_FORBIDDEN: 'Bu bölməyə giriş icazəniz yoxdur.',
      FORBIDDEN: 'Bu əməliyyat üçün icazəniz yoxdur.',
      UNAUTHORIZED: 'Sessiya bitib. Zəhmət olmasa yenidən daxil olun.',
      ASSIGNMENT_ALREADY_ACCEPTED: 'Bu təyinat artıq qəbul edilib.',
      ASSIGNMENT_ALREADY_REJECTED: 'Bu təyinat artıq rədd edilib.',
      ASSIGNMENT_ALREADY_CANCELLED: 'Bu təyinat artıq ləğv edilib.',
      ASSIGNMENT_ALREADY_COMPLETED: 'Bu təyinat artıq tamamlanıb.',
      ASSIGNMENT_COMPLETED: 'Tamamlanmış təyinat üzrə bu əməliyyat mümkün deyil.',
      ASSIGNMENT_NOT_FOUND: 'Təyinat tapılmadı.',
      ASSIGNMENT_NOT_ACCEPTED: 'Təyinat qəbul edilmiş və aktiv olmalıdır.',
      ASSIGNMENT_CANCELLED: 'Bu təyinat ləğv edilib.',
      ASSIGNMENT_STATUS_CONFLICT: 'Təyinat statusu dəyişib. Zəhmət olmasa yenidən yoxlayın.',
      ORDER_NOT_ACTIVE: 'Sifariş aktiv deyil.',
      ORDER_CAPACITY_EXCEEDED: 'Sifariş üçün tələb olunan işçi sayı aşılıb.',
      DUPLICATE_ASSIGNMENT: 'Bu işçi artıq həmin sifarişə təyin olunub.',
      DUPLICATE_WORKER_IDS: 'Eyni işçi bir təyinat sorğusunda təkrar seçilə bilməz.',
      ASSIGNMENT_CANCEL_CONFLICT: 'Təyinat dəyişdiyi üçün ləğv edilə bilmədi. Zəhmət olmasa yenidən yoxlayın.',
      WORKERS_NOT_FOUND: 'Seçilmiş işçilərdən biri tapılmadı.',
      WORKERS_NOT_AVAILABLE: 'Bütün seçilmiş işçilər təsdiqli və əlçatan olmalıdır.',
      ATTENDANCE_NOT_FOUND: 'Giriş-çıxış qeydi tapılmadı.',
      ATTENDANCE_ALREADY_CHECKED_IN: 'Bu təyinat üzrə artıq giriş edilib.',
      ATTENDANCE_ALREADY_COMPLETED: 'Bu təyinat üzrə giriş-çıxış artıq tamamlanıb.',
      ATTENDANCE_SESSION_ALREADY_EXISTS: 'Bu təyinat üzrə giriş-çıxış sessiyası artıq mövcuddur.',
      ATTENDANCE_NOT_CHECKED_IN: 'Çıxış üçün əvvəlcə giriş edilməlidir.',
      ATTENDANCE_NOT_AVAILABLE: 'Davamiyyət əməliyyatı mümkün deyil.',
      QR_TOKEN_INVALID: 'QR tokeni etibarlı deyil.',
      QR_TOKEN_EXPIRED: 'QR tokeninin vaxtı bitib.',
      NOTIFICATION_FORBIDDEN: 'Bu bildirişi yeniləmək üçün icazəniz yoxdur.',
      NOTIFICATION_NOT_FOUND: 'Bildiriş tapılmadı.',
    } satisfies Record<string, string>
  )[code] ?? null;
}

export function notificationTitle(type: string, fallback: string): string {
  return (
    {
      job_assigned: appStrings.notifications.jobAssigned,
      worker_approved: appStrings.notifications.workerApproved,
      worker_rejected: appStrings.notifications.workerRejected,
      company_approved: appStrings.notifications.companyApproved,
      company_rejected: appStrings.notifications.companyRejected,
      order_created: appStrings.notifications.orderCreated,
      system: appStrings.notifications.system,
    } satisfies Record<string, string>
  )[type] ?? fallback;
}

export function notificationBody(type: string, fallback: string): string {
  return (
    {
      job_assigned: appStrings.notifications.jobAssignedBody,
      worker_approved: appStrings.notifications.workerApprovedBody,
      worker_rejected: appStrings.notifications.workerRejectedBody,
      company_approved: appStrings.notifications.companyApprovedBody,
      company_rejected: appStrings.notifications.companyRejectedBody,
      order_created: appStrings.notifications.orderCreatedBody,
    } satisfies Record<string, string>
  )[type] ?? fallback;
}

export function notificationChannel(channel: string): string {
  return (
    appStrings.notifications.channels as Record<string, string>
  )[channel] ?? channel.replaceAll('_', ' ');
}

function looksEnglish(value: string): boolean {
  const text = value.toLowerCase();
  return (
    text.includes('failed') ||
    text.includes('failed to fetch') ||
    text.includes('validation error') ||
    text.includes('internal server error') ||
    text.includes('too many requests') ||
    text.includes('invalid') ||
    text.includes('required') ||
    text.includes('unable') ||
    text.includes('not found') ||
    text.includes('forbidden') ||
    text.includes('unauthorized') ||
    text.includes('request')
  );
}

function looksLikeNetworkError(value: string): boolean {
  const text = value.toLowerCase();
  return (
    text.includes('failed to fetch') ||
    text.includes('networkerror') ||
    text.includes('load failed') ||
    text.includes('internet')
  );
}
