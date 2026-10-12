import type { Locale } from "./locales";
const en = {
  title: "Permission profiles",
  edit: "Edit assignment",
  save: "Save assignment",
  cancel: "Cancel",
  loading: "Loading permission profiles…",
  selectorLoading: "Loading available profiles…",
  more: "Load more profiles",
  empty: "No permission profiles assigned.",
  unavailableName: "Unavailable profile",
  added: "Added profiles",
  removed: "Removed profiles",
  none: "None",
  statuses: {
    ACTIVE: "Active",
    ARCHIVED: "Archived",
    UNAVAILABLE: "Unavailable",
  },
  confirm: "Confirm profile replacement",
  confirmCopy: "Review the profile changes for",
  removeAll:
    "All assigned permission profiles will be removed. Explicit grants, if any, are not changed.",
  willRemove:
    "Archived and unavailable profiles will be removed if you save this replacement.",
  limit: "Select at most 20 permission profiles.",
  self: "You cannot change your own permission-profile assignment.",
  inactive: "Assignment editing requires an active membership and account.",
  select: "Select permission profiles",
  retry: "Retry",
  uncertain:
    "The result is uncertain. Retry the same request to check its outcome.",
  retryIntent: "Retry the same assignment request",
  changed: "Permission-profile assignment updated.",
  denied: "Permission-profile management is unavailable.",
  notFound: "Platform user not found.",
  conflict:
    "The assignment changed. Review the latest profiles before confirming a new change.",
  delegation:
    "The requested assignment cannot be delegated with your current authority.",
  lockout: "Required Platform management authority must remain available.",
  evaluation:
    "The change could not be safely evaluated. Contact an administrator for assistance.",
  failed: "Permission profiles are unavailable. Try again.",
  validation:
    "The assignment could not be accepted. Review the selected profiles.",
  keyReused:
    "This request cannot be reused. Review the current assignment and start a new change.",
  target: "Target member",
};
const ar: typeof en = {
  title: "ملفات الصلاحيات",
  edit: "تعديل التعيين",
  save: "حفظ التعيين",
  cancel: "إلغاء",
  loading: "جارٍ تحميل ملفات الصلاحيات…",
  selectorLoading: "جارٍ تحميل الملفات المتاحة…",
  more: "تحميل المزيد من الملفات",
  empty: "لا توجد ملفات صلاحيات معيّنة.",
  unavailableName: "ملف غير متاح",
  added: "الملفات المضافة",
  removed: "الملفات المحذوفة",
  none: "لا يوجد",
  statuses: { ACTIVE: "نشط", ARCHIVED: "مؤرشف", UNAVAILABLE: "غير متاح" },
  confirm: "تأكيد استبدال ملفات الصلاحيات",
  confirmCopy: "راجع تغييرات ملفات الصلاحيات للعضو",
  removeAll:
    "ستُحذف جميع ملفات الصلاحيات المعيّنة. لن تتغير المنح الصريحة إن وجدت.",
  willRemove: "ستُحذف الملفات المؤرشفة وغير المتاحة عند حفظ هذا الاستبدال.",
  limit: "اختر 20 ملف صلاحيات كحد أقصى.",
  self: "لا يمكنك تغيير ملفات الصلاحيات المعيّنة لنفسك.",
  inactive: "يتطلب تعديل التعيين عضوية وحسابًا نشطين.",
  select: "اختيار ملفات الصلاحيات",
  retry: "إعادة المحاولة",
  uncertain: "نتيجة الطلب غير مؤكدة. أعد محاولة الطلب نفسه للتحقق من نتيجته.",
  retryIntent: "إعادة محاولة طلب التعيين نفسه",
  changed: "تم تحديث تعيين ملفات الصلاحيات.",
  denied: "إدارة ملفات الصلاحيات غير متاحة.",
  notFound: "لم يتم العثور على عضو المنصة.",
  conflict: "تغيّر التعيين. راجع أحدث الملفات قبل تأكيد تغيير جديد.",
  delegation: "لا يمكن تفويض التعيين المطلوب باستخدام صلاحياتك الحالية.",
  lockout: "يجب الإبقاء على صلاحيات إدارة المنصة المطلوبة.",
  evaluation: "تعذر تقييم التغيير بأمان. تواصل مع المسؤول للمساعدة.",
  failed: "ملفات الصلاحيات غير متاحة. أعد المحاولة.",
  validation: "تعذر قبول التعيين. راجع الملفات المختارة.",
  keyReused:
    "لا يمكن إعادة استخدام هذا الطلب. راجع التعيين الحالي وابدأ تغييرًا جديدًا.",
  target: "العضو المستهدف",
};
export const profileAssignmentMessages = { en, ar };
export const getProfileAssignmentMessages = (locale: Locale) =>
  profileAssignmentMessages[locale];
