import type {
  AssignmentStatus,
  CompanyStatus,
  OrderStatus,
  WorkerStatus,
} from "../api/types";

type KnownStatus =
  | WorkerStatus
  | CompanyStatus
  | OrderStatus
  | AssignmentStatus
  | "checked_in"
  | "waiting"
  | "read"
  | "unread";

export const appStrings = {
  brand: "SET Service",
  dashboardName: "Şirkət paneli",
  company: "Şirkət",
  logout: "Çıxış et",
  openMenu: "Menyunu aç",
  closeMenu: "Menyunu bağla",
  close: "Bağla",
  back: "Geri",
  view: "Bax",
  retry: "Yenidən cəhd et",
  cancel: "Ləğv et",
  working: "İcra olunur...",
  loading: "Məlumat yüklənir",
  empty: "Məlumat tapılmadı",
  notAvailable: "-",
  allStatuses: "Bütün statuslar",
  previous: "Əvvəlki",
  next: "Növbəti",
  pageOf: (page: number, totalPages: number) =>
    `Səhifə ${page} / ${Math.max(totalPages, 1)}`,
  requiredReason: "Səbəb",
  reasonPlaceholder: "Aydın səbəb yazın",
  unknownError: "Xəta baş verdi. Zəhmət olmasa yenidən cəhd edin.",
  unexpectedResponse: "Serverdən gözlənilməyən cavab gəldi.",
  requestFailed: "Sorğu yerinə yetirilmədi.",
  networkError:
    "Şəbəkə bağlantısı alınmadı. Zəhmət olmasa bağlantını və API ünvanını yoxlayın.",
  validationError: "Məlumatları yoxlayın və yenidən cəhd edin.",
  tooManyRequests:
    "Çox sayda sorğu göndərilib. Bir az sonra yenidən cəhd edin.",
  internalServerError:
    "Serverdə xəta baş verdi. Bir az sonra yenidən cəhd edin.",
  corsDenied: "Bu paneldən API-yə girişə icazə verilmir.",

  nav: {
    dashboard: "İdarə paneli",
    orders: "Sifarişlər",
    assignments: "Təyinatlar",
    attendance: "Giriş-çıxış",
    qrTokens: "QR tokenlər",
    notifications: "Bildirişlər",
  },

  auth: {
    title: "SET Service şirkət paneli",
    subtitle: "Sifariş və işçi qüvvəsi idarəetməsi",
    loginTitle: "Şirkət girişi",
    loginDescription: "Təsdiqlənmiş şirkət e-poçtu və şifrəsi ilə daxil olun.",
    email: "E-poçt",
    emailPlaceholder: "company@setservice.az",
    password: "Şifrə",
    passwordPlaceholder: "Şifrənizi daxil edin",
    loginButton: "Daxil ol",
    wait: "Zəhmət olmasa gözləyin...",
    refreshingSession: "Sessiya yoxlanılır...",
    onlyCompany: "Şirkət panelinə yalnız şirkət hesabı daxil ola bilər.",
    notApproved: "Şirkət hesabı hələ təsdiqlənməyib.",
  },

  accountState: {
    pendingTitle: "Təsdiq gözlənilir",
    pendingBody:
      "Şirkət panelinə giriş super admin təsdiqindən sonra aktiv olacaq.",
    rejectedTitle: "Şirkət hesabı rədd edilib",
    rejectedBody: "Hesab rədd edildiyi üçün panelə giriş mümkün deyil.",
    suspendedTitle: "Şirkət hesabı dayandırılıb",
    suspendedBody: "Hesab dayandırıldığı üçün panelə giriş müvəqqəti bağlıdır.",
    inactiveTitle: "Şirkət hesabı aktiv deyil",
    inactiveBody: "Hesab aktiv olmadığı üçün panelə giriş mümkün deyil.",
    unknownTitle: "Giriş mümkün deyil",
    unknownBody: "Şirkət hesabının statusu panelə giriş üçün uyğun deyil.",
    backToLogin: "Giriş səhifəsinə qayıt",
    currentStatus: "Cari status",
  },

  dashboard: {
    title: "Şirkət idarə paneli",
    description:
      "Sifarişləri, təyinatları və giriş-çıxış sessiyalarını izləyin.",
    createOrder: "Sifariş yarat",
    activeOrders: "Aktiv sifarişlər",
    allOrders: "Bütün sifarişlər",
    assignedWorkers: "Təyin olunmuş işçilər",
    acceptedAssignments: "Qəbul edilmiş təyinatlar",
    openAttendance: "Açıq girişlər",
    recentActivity: "Son aktivlik",
    recentActivityDescription: "Şirkət sifarişləriniz üzrə son təyinatlar.",
    completedSessions: (count: number) =>
      `${count} tamamlanmış giriş-çıxış sessiyası`,
    noRecentActivity: "Hələ təyinat aktivliyi yoxdur.",
  },

  orders: {
    title: "Sifarişlər",
    description: "Sifariş yaradın, tutumu izləyin və statusları idarə edin.",
    newOrder: "Yeni sifariş",
    closeForm: "Formanı bağla",
    createTitle: "Sifariş yarat",
    orderTitle: "Başlıq",
    category: "Kateqoriya",
    categoryRequirements: "Kateqoriya tələbləri",
    categoryRequirementsHelp: "Hər rol üzrə lazım olan işçi sayını ayrıca göstərin.",
    addCategory: "Kateqoriya əlavə et",
    removeCategory: "Sil",
    categoryNotes: "Qeyd",
    requiredWorkers: "Tələb olunan işçi",
    payRate: "Ödəniş",
    optional: "İstəyə bağlı",
    start: "Başlama vaxtı",
    end: "Bitmə vaxtı",
    location: "Məkan",
    skills: "Tələb olunan bacarıqlar",
    skillsPlaceholder: "Vergüllə ayırın, istəyə bağlı",
    descriptionField: "Təsvir",
    notes: "Qeydlər",
    create: "Sifariş yarat",
    creating: "Yaradılır...",
    search: "Sifariş axtar",
    historyFilter: "Sifariş tarixçəsi filtri",
    historyFilters: {
      active: "Aktiv",
      past: "Keçmiş",
      all: "Hamısı",
    },
    empty: "Cari filtrə uyğun sifariş tapılmadı.",
    status: "Status",
    workers: "İşçi sayı",
    detailTitle: "Sifariş detalları",
    detailDescription:
      "Sifariş tələblərini, tutumu və təyin olunmuş işçiləri yoxlayın.",
    assigned: "Təyin olunub",
    assignments: "Təyinatlar",
    noAssignments: "Hələ təyinat yoxdur.",
    worker: "İşçi",
    cancelTitle: "Sifariş ləğv edilsin?",
    cancelMessage:
      "Bu sifariş ləğv olunacaq və aktiv giriş-çıxış axınında istifadə edilməyəcək.",
    cancelConfirm: "Sifarişi ləğv et",
    invalidTitle: "Başlıq ən azı 3 simvol olmalıdır.",
    invalidCategory: "Kateqoriya ən azı 2 simvol olmalıdır.",
    duplicateCategory: "Eyni kateqoriya bir sifarişdə təkrar seçilə bilməz.",
    invalidLocation: "Məkan ən azı 2 simvol olmalıdır.",
    invalidDescription: "Təsvir ən azı 10 simvol olmalıdır.",
    invalidCount: "Tələb olunan işçi sayı müsbət olmalıdır.",
    invalidPayRate: "Ödəniş göstərilirsə, sıfırdan böyük olmalıdır.",
    invalidStart: "Başlama vaxtı gələcəkdə olmalıdır.",
    invalidEnd: "Bitmə vaxtı başlama vaxtından sonra olmalıdır.",
  },

  assignments: {
    title: "Təyinatlar",
    description:
      "Sifarişlərinizə bağlı işçi təyinatlarını görün və qəbul edilmiş təyinatlar üçün QR yaradın.",
    filterByOrderId: "Sifariş ID ilə filtr",
    filterByWorkerId: "İşçi ID ilə filtr",
    empty: "Cari filtrə uyğun təyinat tapılmadı.",
    worker: "İşçi",
    order: "Sifariş",
    status: "Status",
    shift: "Növbə",
    generateQr: "QR yarat",
    qrTitle: "Giriş-çıxış QR tokeni",
    qrDescription: (date: string) =>
      `Bu tokeni təyin olunmuş işçiyə göstərin. Vaxtı ${date} tarixində bitir.`,
    copyToken: "Tokeni kopyala",
    done: "Hazırdır",
    workerFallback: "İşçi",
    viewWorkerProfile: "Profilə bax",
    rateWorker: "Reytinq ver",
    checkoutIncomplete: "Checkout tamamlanmayıb",
    ratingTitle: "İşçini qiymətləndir",
    ratingDescription:
      "Reytinq yalnız həmin növbə üzrə checkout tamamlandıqdan sonra qəbul edilir.",
    ratingScore: "Reytinq",
    ratingFeedback: "Rəy",
    ratingFeedbackPlaceholder: "İstəyə bağlı qısa rəy yazın",
    ratingSubmit: "Reytinqi göndər",
    ratingSuccess: "Reytinq göndərildi.",
    invalidRating: "Reytinq 1 və 5 arasında olmalıdır.",
  },

  workerProfile: {
    title: "İşçi profili",
    description:
      "Bu profil yalnız şirkətinizin sifarişlərinə təyin olunmuş işçilər üçün görünür.",
    profilePhoto: "Profil şəkli",
    position: "Vəzifə",
    skills: "Bacarıqlar",
    languages: "Dil bilikləri",
    workHistory: "İş tarixçəsi",
    rating: "Reytinq",
    documents: "İcazəli sənədlər",
    noDocuments: "Göstəriləcək sənəd yoxdur.",
    noData: "Məlumat yoxdur.",
    contactHidden:
      "Telefon və şəxsi əlaqə məlumatları təhlükəsizlik üçün göstərilmir.",
  },

  attendance: {
    title: "Giriş-çıxış",
    description:
      "Sifariş təyinatlarınız üzrə giriş və çıxış sessiyalarını görün.",
    detailTitle: "Giriş-çıxış detalı",
    detailDescription: "İşçinin giriş-çıxış sessiyasını yoxlayın.",
    assignmentId: "Təyinat ID",
    orderId: "Sifariş ID",
    workerId: "İşçi ID",
    allSessions: "Bütün sessiyalar",
    openCheckIns: "Açıq girişlər",
    completedSessions: "Tamamlanmış sessiyalar",
    empty: "Cari filtrə uyğun giriş-çıxış qeydi tapılmadı.",
    worker: "İşçi",
    order: "Sifariş",
    status: "Status",
    checkIn: "Giriş",
    checkOut: "Çıxış",
    workerPhone: "İşçi telefonu",
    assignment: "Təyinat",
    duration: "Müddət",
    minutes: "dəqiqə",
    metadata: "Sessiya metadatası",
    checkinLocation: "Giriş məkanı",
    checkoutLocation: "Çıxış məkanı",
    checkinNotes: "Giriş qeydi",
    checkoutNotes: "Çıxış qeydi",
    created: "Yaradılıb",
    updated: "Yenilənib",
  },

  qr: {
    title: "QR tokenlər",
    description:
      "Qəbul edilmiş aktiv təyinatlar üçün təhlükəsiz giriş-çıxış QR tokeni yaradın.",
    generateTitle: "Token yarat",
    generateDescription:
      "Təyinat siyahısından qəbul edilmiş təyinat ID-sindən istifadə edin.",
    assignmentId: "Təyinat ID",
    generate: "QR token yarat",
    generating: "Yaradılır...",
    generatedTitle: "Yaradılmış token",
    displayTitle: "Dinamik QR ekranı",
    displayDescription:
      "Bu ekran tablet və ya brauzerdə açıq qala bilər. QR kod hər 30 saniyədən bir yenilənir.",
    refreshesEvery: "Hər 30 saniyədən bir yenilənir",
    refreshing: "QR yenilənir...",
    lastUpdated: "Son yenilənmə",
    manualFallback: "Manual token ehtiyat üçün saxlanılır",
    assignment: "Təyinat",
    order: "Sifariş",
    expires: "Vaxtı bitir",
    copyToken: "Tokeni kopyala",
    empty: "Hələ token yaradılmayıb.",
  },

  notifications: {
    title: "Bildirişlər",
    description:
      "Sifarişlər, təyinatlar və sistem əməliyyatları üzrə şirkət bildirişləri.",
    markAllRead: "Hamısını oxunmuş et",
    unreadOnly: "Yalnız oxunmamışlar",
    empty: "Göstəriləcək bildiriş yoxdur.",
    markRead: "Oxunmuş et",
    read: "Oxunub",
    unread: "Oxunmayıb",
    jobAssigned: "Yeni təyinat yaradıldı",
    jobAssignedBody: "Sifarişiniz üzrə işçiyə yeni təyinat verildi.",
    orderCreated: "Yeni sifariş yaradıldı",
    orderCreatedBody: "Yeni sifariş yaradıldı.",
    companyApproved: "Şirkət təsdiqləndi",
    companyApprovedBody: "Şirkət hesabı təsdiqləndi.",
    companyRejected: "Şirkət rədd edildi",
    companyRejectedBody: "Şirkət hesabı rədd edildi.",
    system: "Sistem bildirişi",
    genericBody: "Yeni bildirişiniz var.",
    channels: {
      in_app: "Tətbiqdaxili",
      sms: "SMS",
      email: "E-poçt",
      push: "Push",
    },
  },
};

export function statusLabel(status: string): string {
  return (
    (
      {
        draft: "Qaralama",
        pending_otp: "OTP təsdiqi gözlənilir",
        pending_approval: "Admin təsdiqi gözlənilir",
        approved: "Təsdiqlənib",
        rejected: "Rədd edilib",
        suspended: "Dayandırılıb",
        inactive: "Aktiv deyil",
        active: "Aktiv",
        completed: "Tamamlanıb",
        cancelled: "Ləğv edilib",
        assigned: "Təyin olunub",
        accepted: "Qəbul edilib",
        checked_in: "Giriş edilib",
        waiting: "Gözlənilir",
        read: "Oxunub",
        unread: "Oxunmayıb",
      } satisfies Record<KnownStatus, string>
    )[status as KnownStatus] ?? status.replaceAll("_", " ")
  );
}

export function accountState(status?: string | null) {
  if (status === "pending_approval") {
    return {
      title: appStrings.accountState.pendingTitle,
      body: appStrings.accountState.pendingBody,
    };
  }
  if (status === "rejected") {
    return {
      title: appStrings.accountState.rejectedTitle,
      body: appStrings.accountState.rejectedBody,
    };
  }
  if (status === "suspended") {
    return {
      title: appStrings.accountState.suspendedTitle,
      body: appStrings.accountState.suspendedBody,
    };
  }
  if (status === "inactive") {
    return {
      title: appStrings.accountState.inactiveTitle,
      body: appStrings.accountState.inactiveBody,
    };
  }
  return {
    title: appStrings.accountState.unknownTitle,
    body: appStrings.accountState.unknownBody,
  };
}

export function apiErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return appStrings.unknownError;

  const apiError = error as Error & { code?: string; status?: number };
  const mapped = apiError.code ? backendErrorMessage(apiError.code) : null;
  if (mapped) return mapped;

  if (looksLikeNetworkError(error.message)) return appStrings.networkError;
  if (apiError.status === 401)
    return "Sessiya bitib. Zəhmət olmasa yenidən daxil olun.";
  if (apiError.status === 403) return "Bu əməliyyat üçün icazəniz yoxdur.";
  if (apiError.status === 429) return appStrings.tooManyRequests;
  if (apiError.status && apiError.status >= 500)
    return appStrings.internalServerError;
  if (looksEnglish(error.message)) return appStrings.requestFailed;
  return error.message || appStrings.unknownError;
}

export function backendErrorMessage(code: string): string | null {
  return (
    (
      {
        INVALID_OTP: "OTP kodu yanlışdır və ya vaxtı bitib.",
        VALIDATION_ERROR: appStrings.validationError,
        INVALID_PHONE: "Telefon nömrəsi düzgün formatda deyil.",
        TOO_MANY_REQUESTS: appStrings.tooManyRequests,
        CORS_ORIGIN_DENIED: appStrings.corsDenied,
        INTERNAL_ERROR: appStrings.internalServerError,
        OTP_INVALID: "OTP kodu yanlışdır.",
        OTP_EXPIRED: "OTP kodunun vaxtı bitib.",
        OTP_BLOCKED: "Çox sayda cəhd edildi. Bir az sonra yenidən cəhd edin.",
        OTP_RATE_LIMITED:
          "Çox sayda OTP sorğusu göndərilib. Bir az sonra yenidən cəhd edin.",
        OTP_COOLDOWN: "Yeni OTP istəmək üçün bir az gözləyin.",
        PHONE_ALREADY_REGISTERED:
          "Bu telefon nömrəsi ilə artıq hesab yaradılıb.",
        EMAIL_ALREADY_REGISTERED:
          "Bu e-poçt ünvanı ilə artıq hesab yaradılıb.",
        INVALID_CREDENTIALS:
          "E-poçt və ya şifrə yanlışdır.",
        OTP_LOGIN_DEPRECATED:
          "OTP ilə giriş artıq aktiv deyil. Şifrə ilə daxil olun.",
        COMPANY_NOT_APPROVED: "Şirkət hesabı hələ təsdiqlənməyib.",
        ACCOUNT_NOT_APPROVED: "Hesab hələ təsdiqlənməyib.",
        ACCOUNT_INACTIVE: "Hesab aktiv deyil.",
        COMPANY_NOT_FOUND: "Şirkət tapılmadı.",
        ORDER_NOT_FOUND: "Sifariş tapılmadı.",
        ORDER_NOT_ACTIVE: "Sifariş aktiv deyil.",
        ORDER_ALREADY_CANCELLED: "Sifariş artıq ləğv edilib.",
        ORDER_ALREADY_COMPLETED:
          "Tamamlanmış sifarişi ləğv etmək mümkün deyil.",
        ORDER_CANCEL_CONFLICT:
          "Sifariş dəyişdiyi üçün ləğv edilə bilmədi. Yenidən yoxlayın.",
        INVALID_ORDER_START: "Başlama vaxtı gələcəkdə olmalıdır.",
        INVALID_ORDER_END: "Bitmə vaxtı başlama vaxtından sonra olmalıdır.",
        ROLE_FORBIDDEN: "Bu bölməyə giriş icazəniz yoxdur.",
        FORBIDDEN: "Bu əməliyyat üçün icazəniz yoxdur.",
        UNAUTHORIZED: "Sessiya bitib. Zəhmət olmasa yenidən daxil olun.",
        INVALID_REFRESH_TOKEN:
          "Sessiya yeniləmə tokeni yanlışdır və ya vaxtı bitib.",
        ASSIGNMENT_NOT_FOUND: "Təyinat tapılmadı.",
        ASSIGNMENT_NOT_ACCEPTED: "Təyinat qəbul edilmiş və aktiv olmalıdır.",
        ASSIGNMENT_ALREADY_ACCEPTED: "Təyinat artıq qəbul edilib.",
        ASSIGNMENT_ALREADY_REJECTED: "Təyinat artıq rədd edilib.",
        ASSIGNMENT_CANCELLED: "Bu təyinat ləğv edilib.",
        ASSIGNMENT_COMPLETED: "Bu təyinat tamamlanıb.",
        ORDER_CAPACITY_EXCEEDED: "Sifariş üçün tələb olunan işçi sayı aşılıb.",
        DUPLICATE_RATING: "Bu növbə üzrə işçiyə artıq reytinq verilib.",
        RATING_NOT_AVAILABLE:
          "Reytinq yalnız checkout tamamlandıqdan sonra verilə bilər.",
        QR_TOKEN_INVALID: "QR token yanlışdır.",
        QR_TOKEN_EXPIRED: "QR tokenin vaxtı bitib.",
        ATTENDANCE_NOT_FOUND: "Giriş-çıxış qeydi tapılmadı.",
        ATTENDANCE_ALREADY_CHECKED_IN: "Bu təyinat üçün artıq giriş edilib.",
        ATTENDANCE_ALREADY_COMPLETED:
          "Bu giriş-çıxış sessiyası artıq tamamlanıb.",
        ATTENDANCE_NOT_CHECKED_IN: "Çıxış üçün əvvəlcə giriş edilməlidir.",
        NOTIFICATION_FORBIDDEN: "Bu bildirişi yeniləmək üçün icazəniz yoxdur.",
        NOTIFICATION_NOT_FOUND: "Bildiriş tapılmadı.",
      } satisfies Record<string, string>
    )[code] ?? null
  );
}

export function notificationTitle(type: string, fallback: string): string {
  return (
    (
      {
        job_assigned: appStrings.notifications.jobAssigned,
        order_created: appStrings.notifications.orderCreated,
        company_approved: appStrings.notifications.companyApproved,
        company_rejected: appStrings.notifications.companyRejected,
        system: appStrings.notifications.system,
      } satisfies Record<string, string>
    )[type] ?? safeNotificationText(fallback, appStrings.notifications.system)
  );
}

export function notificationBody(type: string, fallback: string): string {
  return (
    (
      {
        job_assigned: appStrings.notifications.jobAssignedBody,
        order_created: appStrings.notifications.orderCreatedBody,
        company_approved: appStrings.notifications.companyApprovedBody,
        company_rejected: appStrings.notifications.companyRejectedBody,
      } satisfies Record<string, string>
    )[type] ??
    safeNotificationText(fallback, appStrings.notifications.genericBody)
  );
}

export function notificationChannel(channel: string): string {
  return (
    (appStrings.notifications.channels as Record<string, string>)[channel] ??
    channel.replaceAll("_", " ")
  );
}

function looksEnglish(value: string): boolean {
  const text = value.toLowerCase();
  return (
    text.includes("validation error") ||
    text.includes("internal server error") ||
    text.includes("too many requests") ||
    text.includes("failed") ||
    text.includes("invalid") ||
    text.includes("required") ||
    text.includes("unable") ||
    text.includes("not found") ||
    text.includes("forbidden") ||
    text.includes("unauthorized") ||
    text.includes("request")
  );
}

function looksLikeNetworkError(value: string): boolean {
  const text = value.toLowerCase();
  return (
    text.includes("failed to fetch") ||
    text.includes("networkerror") ||
    text.includes("load failed")
  );
}

function safeNotificationText(value: string, fallback: string): string {
  const text = value.trim();
  if (!text) return fallback;
  if (looksGeneratedEnglishNotification(text)) return fallback;
  return text;
}

function looksGeneratedEnglishNotification(value: string): boolean {
  const text = value.toLowerCase();
  return (
    looksEnglish(value) ||
    text.includes("approved") ||
    text.includes("rejected") ||
    text.includes("assigned") ||
    text.includes("created") ||
    text.includes("cancelled") ||
    text.includes("worker") ||
    text.includes("company") ||
    text.includes("order") ||
    text.includes("assignment") ||
    text.includes("attendance") ||
    text.includes("notification") ||
    text.includes("system") ||
    text.includes("job")
  );
}
