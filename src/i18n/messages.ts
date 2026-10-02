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
          description: "سيتم تنفيذ إدارة المساحة لاحقًا",
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
          description: "Workspace management arrives in a later issue",
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
  },
} as const satisfies Record<Locale, Record<string, unknown>>;

export type Messages = (typeof messages)[Locale];

export function getMessages(locale: Locale): Messages {
  return messages[locale];
}
