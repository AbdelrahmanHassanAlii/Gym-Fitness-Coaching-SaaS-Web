import type { Locale } from "./locales";

export const messages = {
  ar: {
    metadata: {
      title: "منصة حسن للجيم والتدريب",
      description: "أساس تطبيق الويب لمنصة حسن للجيم والتدريب.",
    },
    publicHome: {
      eyebrow: "أساس الويب",
      title: "منصة حسن للجيم والتدريب",
      copy: "أساس تطبيق Next.js جاهز لواجهات طاقم الجيم، والمنصة، وتسجيل الدخول القادمة.",
      tokenPreviewLabel: "معاينة رموز الألوان الدلالية",
      tokenLabels: {
        danger: "خطر",
        primary: "أساسي",
        success: "نجاح",
        warning: "تحذير",
      },
    },
    localeSwitcher: {
      label: "لغة الواجهة",
    },
    themeControls: {
      appearanceLabel: "المظهر",
      resolvedPrefix: "المطبق",
      themeLabel: "السمة",
    },
    auth: {
      loading: "جارٍ التحقق من الجلسة...",
      login: {
        credentialLabel: "البريد الإلكتروني أو الهاتف",
        errorFallback: "تعذر إكمال تسجيل الدخول. حاول مرة أخرى.",
        loading: "جارٍ المتابعة...",
        mfaCredentialLabel: "رمز التحقق",
        mfaHelp: "أكمل التحقق متعدد العوامل للمتابعة.",
        mfaMethodLabel: "طريقة التحقق",
        mfaSubmit: "تحقق",
        passwordLabel: "كلمة المرور",
        submit: "تسجيل الدخول",
        title: "تسجيل الدخول",
      },
      protected: {
        copy: "هذه مساحة تحقق بسيطة لمسار الجلسة المحمية.",
        title: "جلسة مصادق عليها",
      },
    },
    access: {
      checking: "جارٍ التحقق من الصلاحية...",
      deniedTitle: "لا يمكنك الوصول",
      deniedAction: "ليست لديك صلاحية لهذا الإجراء.",
      unavailable: "تعذر تحميل معلومات الوصول. حاول مرة أخرى.",
    },
    staffShell: {
      portalLabel: "بوابة طاقم الجيم",
      localeLabel: "لغة الواجهة",
      account: {
        logout: "تسجيل الخروج",
        restricted: "الحساب مقيد حتى اكتمال التحقق",
      },
      branch: {
        allAssigned: "كل الفروع المسموح بها",
        label: "نطاق الفرع",
      },
      empty: {
        title: "لا توجد مساحة طاقم متاحة",
        copy: "هذا الحساب لا يملك عضوية طاقم نشطة في جيم مؤهل لهذه الواجهة.",
      },
      errors: {
        denied: "غير متاح لصلاحياتك الحالية",
        unavailable: "تعذر تحميل بيانات الواجهة",
      },
      loading: {
        access: "جارٍ التحقق من الوصول...",
        shell: "جارٍ تحميل واجهة الطاقم...",
        workspace: "جارٍ تحميل مساحات العمل...",
      },
      mobile: {
        close: "إغلاق التنقل",
        open: "فتح التنقل",
      },
      nav: {
        overview: {
          title: "نظرة عامة",
          description: "مساحة العمل الحالية",
        },
        workspace: {
          title: "المساحة والفروع",
          description: "إدارة إعدادات المساحة والفروع",
        },
        staff: {
          title: "الطاقم",
          description: "سيتم تنفيذ إدارة الطاقم لاحقًا",
        },
        leads: {
          title: "العملاء المحتملون",
          description: "سيتم تنفيذ مسار العملاء لاحقًا",
        },
        relationships: {
          title: "العلاقات",
          description: "سيتم تنفيذ علاقات المتدربين لاحقًا",
        },
        training: {
          title: "التدريب",
          description: "سيتم تنفيذ التدريب والتمارين لاحقًا",
        },
        nutrition: {
          title: "التغذية",
          description: "سيتم تنفيذ التغذية لاحقًا",
        },
        progress: {
          title: "التقدم والمتابعات",
          description: "سيتم تنفيذ التقدم والمتابعات لاحقًا",
        },
        documents: {
          title: "الملفات والمستندات",
          description: "سيتم تنفيذ المستندات لاحقًا",
        },
        notifications: {
          title: "الإشعارات",
          description: "سيتم تنفيذ الإشعارات لاحقًا",
        },
        analytics: {
          title: "اللوحات والتحليلات",
          description: "سيتم تنفيذ التحليلات لاحقًا",
        },
      },
      workspace: {
        label: "مساحة العمل",
        noWorkspace: "لا توجد مساحة طاقم",
      },
      overview: {
        title: "واجهة طاقم الجيم",
        copy: "هذه الواجهة تثبت التنقل، وسياق مساحة العمل، وحدود الوصول قبل تنفيذ شاشات المنتجات.",
      },
    },
    workspaceManagement: {
      title: "إدارة المساحة والفروع والطاقم",
      loading: "جارٍ تحميل بيانات الإدارة...",
      noWorkspace: {
        title: "لا توجد مساحة محددة",
        copy: "اختر مساحة طاقم مؤهلة من الواجهة قبل إدارة بياناتها.",
      },
      workspace: {
        title: "إعدادات المساحة",
      },
      branches: {
        title: "الفروع",
        empty: "لا توجد فروع في هذه المساحة حتى الآن.",
      },
      confirm: {
        archiveBranch: "هل تريد أرشفة {target}؟",
        endMembership: "هل تريد إنهاء عضوية {target}؟",
        removeAssignment: "هل تريد إزالة تعيين {target}؟",
        suspendMembership: "هل تريد إيقاف عضوية {target}؟",
      },
      staff: {
        title: "العضويات والطاقم",
        empty: "لا توجد عضويات طاقم قابلة للعرض.",
      },
      invite: {
        title: "دعوة عضو طاقم",
        help: "ترسل الدعوة وفق عقد الخادم الحالي ولا تحفظ رمز الدعوة في الواجهة.",
      },
      assignment: {
        title: "تعيينات الفروع",
        empty: "أضف فرعًا وعضو طاقم قبل إدارة التعيينات.",
        selectBranch: "اختر فرعًا للتعيين",
        selectMember: "عضو الطاقم",
      },
      fields: {
        address: "العنوان",
        branch: "الفروع",
        branchCode: "رمز الفرع",
        branchName: "اسم الفرع",
        city: "المدينة",
        defaultLanguage: "اللغة الافتراضية",
        email: "البريد الإلكتروني",
        expiresAt: "تاريخ انتهاء الدعوة",
        governorate: "المحافظة",
        name: "الاسم",
        phone: "الهاتف",
        roles: "الأدوار",
        timezone: "المنطقة الزمنية",
      },
      actions: {
        archive: "أرشفة",
        assign: "تعيين",
        create: "إنشاء",
        end: "إنهاء",
        invite: "إرسال الدعوة",
        reactivate: "إعادة التفعيل",
        removeAssignment: "إزالة التعيين",
        save: "حفظ",
        suspend: "إيقاف",
      },
      errors: {
        accessUnavailable: "معلومات الصلاحيات غير كافية لتفعيل هذا الإجراء.",
        conflict:
          "تغيرت البيانات على الخادم. حدّث الصفحة وراجع التغييرات قبل الحفظ.",
        denied: "رفض الخادم هذا الإجراء لصلاحيات الحساب الحالية.",
        malformed: "عاد الخادم ببيانات غير متوقعة، لذلك توقفت الواجهة بأمان.",
        unavailable: "تعذر تحميل بيانات الإدارة. حاول مرة أخرى.",
        validation: "راجع الحقول المطلوبة ثم حاول مرة أخرى.",
      },
      status: {
        saved: "تم حفظ التغيير.",
        sent: "تم إرسال الدعوة.",
      },
    },
  },
  en: {
    metadata: {
      title: "Hassan Gym & Fitness Coaching SaaS",
      description:
        "Web application foundation for Hassan Gym & Fitness Coaching SaaS.",
    },
    publicHome: {
      eyebrow: "Web foundation",
      title: "Hassan Gym & Fitness Coaching SaaS",
      copy: "The Next.js web application foundation is ready for the upcoming gym staff, platform, and authentication surfaces.",
      tokenPreviewLabel: "Semantic color token preview",
      tokenLabels: {
        danger: "Danger",
        primary: "Primary",
        success: "Success",
        warning: "Warning",
      },
    },
    localeSwitcher: {
      label: "Interface language",
    },
    themeControls: {
      appearanceLabel: "Appearance",
      resolvedPrefix: "Resolved",
      themeLabel: "Theme",
    },
    auth: {
      loading: "Checking session...",
      login: {
        credentialLabel: "Email or phone",
        errorFallback: "Sign-in could not be completed. Try again.",
        loading: "Continuing...",
        mfaCredentialLabel: "Verification code",
        mfaHelp: "Complete multi-factor verification to continue.",
        mfaMethodLabel: "Verification method",
        mfaSubmit: "Verify",
        passwordLabel: "Password",
        submit: "Sign in",
        title: "Sign in",
      },
      protected: {
        copy: "This is a small protected-route proof for the session layer.",
        title: "Authenticated session",
      },
    },
    access: {
      checking: "Checking access...",
      deniedTitle: "Access denied",
      deniedAction: "You do not have permission for this action.",
      unavailable: "Access information could not be loaded. Try again.",
    },
    staffShell: {
      portalLabel: "Gym Staff Portal",
      localeLabel: "Interface language",
      account: {
        logout: "Log out",
        restricted: "Account restricted until verification is complete",
      },
      branch: {
        allAssigned: "All permitted branches",
        label: "Branch context",
      },
      empty: {
        title: "No staff workspace available",
        copy: "This account does not have an active staff membership in an eligible gym workspace.",
      },
      errors: {
        denied: "Unavailable for your current access",
        unavailable: "Shell data could not be loaded",
      },
      loading: {
        access: "Checking access...",
        shell: "Loading staff shell...",
        workspace: "Loading workspaces...",
      },
      mobile: {
        close: "Close navigation",
        open: "Open navigation",
      },
      nav: {
        overview: {
          title: "Overview",
          description: "Current workspace shell",
        },
        workspace: {
          title: "Workspace & branches",
          description: "Manage workspace settings and branches",
        },
        staff: {
          title: "Staff",
          description: "Staff management arrives in a later issue",
        },
        leads: {
          title: "Leads",
          description: "Lead workflows arrive in a later issue",
        },
        relationships: {
          title: "Relationships",
          description: "Trainee relationships arrive in a later issue",
        },
        training: {
          title: "Training",
          description: "Training and workouts arrive in a later issue",
        },
        nutrition: {
          title: "Nutrition",
          description: "Nutrition workflows arrive in a later issue",
        },
        progress: {
          title: "Progress & check-ins",
          description: "Progress and check-ins arrive in a later issue",
        },
        documents: {
          title: "Files & documents",
          description: "File and document flows arrive in a later issue",
        },
        notifications: {
          title: "Notifications",
          description: "Notification workflows arrive in a later issue",
        },
        analytics: {
          title: "Dashboards & analytics",
          description: "Dashboards arrive in a later issue",
        },
      },
      workspace: {
        label: "Workspace",
        noWorkspace: "No staff workspace",
      },
      overview: {
        title: "Gym staff shell",
        copy: "This shell proves navigation, workspace context, and access boundaries before product screens are implemented.",
      },
    },
    workspaceManagement: {
      title: "Workspace, branch, and staff management",
      loading: "Loading management data...",
      noWorkspace: {
        title: "No workspace selected",
        copy: "Select an eligible staff workspace in the shell before managing it.",
      },
      workspace: {
        title: "Workspace settings",
      },
      branches: {
        title: "Branches",
        empty: "This workspace has no branches yet.",
      },
      confirm: {
        archiveBranch: "Archive {target}?",
        endMembership: "End membership {target}?",
        removeAssignment: "Remove assignment for {target}?",
        suspendMembership: "Suspend membership {target}?",
      },
      staff: {
        title: "Memberships and staff",
        empty: "There are no staff memberships to display.",
      },
      invite: {
        title: "Invite staff",
        help: "Invitations are sent through the verified Backend command; invitation tokens are not stored in the UI.",
      },
      assignment: {
        title: "Branch assignments",
        empty:
          "Create a branch and staff membership before managing assignments.",
        selectBranch: "Select branch to assign",
        selectMember: "Staff member",
      },
      fields: {
        address: "Address",
        branch: "Branches",
        branchCode: "Branch code",
        branchName: "Branch name",
        city: "City",
        defaultLanguage: "Default language",
        email: "Email",
        expiresAt: "Invitation expiry",
        governorate: "Governorate",
        name: "Name",
        phone: "Phone",
        roles: "Roles",
        timezone: "Timezone",
      },
      actions: {
        archive: "Archive",
        assign: "Assign",
        create: "Create",
        end: "End",
        invite: "Send invite",
        reactivate: "Reactivate",
        removeAssignment: "Remove assignment",
        save: "Save",
        suspend: "Suspend",
      },
      errors: {
        accessUnavailable: "Access facts are unavailable for this action.",
        conflict: "The server state changed. Refresh and review before saving.",
        denied: "The Backend rejected this action for the current access.",
        malformed:
          "The Backend returned unexpected data, so the UI failed closed.",
        unavailable: "Management data could not be loaded. Try again.",
        validation: "Review the required fields and try again.",
      },
      status: {
        saved: "Change saved.",
        sent: "Invitation sent.",
      },
    },
  },
} as const satisfies Record<Locale, Record<string, unknown>>;

export type Messages = (typeof messages)[Locale];

export function getMessages(locale: Locale): Messages {
  return messages[locale];
}
