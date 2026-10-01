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
      copy:
        "أساس تطبيق Next.js جاهز لواجهات طاقم الجيم، والمنصة، وتسجيل الدخول القادمة.",
    },
    localeSwitcher: {
      label: "لغة الواجهة",
    },
  },
  en: {
    metadata: {
      title: "Hassan Gym & Fitness Coaching SaaS",
      description: "Web application foundation for Hassan Gym & Fitness Coaching SaaS.",
    },
    publicHome: {
      eyebrow: "Web foundation",
      title: "Hassan Gym & Fitness Coaching SaaS",
      copy:
        "The Next.js web application foundation is ready for the upcoming gym staff, platform, and authentication surfaces.",
    },
    localeSwitcher: {
      label: "Interface language",
    },
  },
} as const satisfies Record<Locale, Record<string, unknown>>;

export type Messages = (typeof messages)[Locale];

export function getMessages(locale: Locale): Messages {
  return messages[locale];
}
