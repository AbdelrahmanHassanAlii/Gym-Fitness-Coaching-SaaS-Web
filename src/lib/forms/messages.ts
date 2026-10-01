import type { Locale } from "@/i18n/locales";

export const formValidationMessageKeys = [
  "required",
  "invalid",
  "tooShort",
  "tooLong",
] as const;

export type FormValidationMessageKey =
  (typeof formValidationMessageKeys)[number];

const messages: Record<Locale, Record<FormValidationMessageKey, string>> = {
  ar: {
    invalid: "القيمة غير صحيحة.",
    required: "هذا الحقل مطلوب.",
    tooLong: "القيمة أطول من المسموح.",
    tooShort: "القيمة أقصر من المطلوب.",
  },
  en: {
    invalid: "Enter a valid value.",
    required: "This field is required.",
    tooLong: "The value is too long.",
    tooShort: "The value is too short.",
  },
};

export function getFormValidationMessage(
  locale: Locale,
  key: FormValidationMessageKey,
): string {
  return messages[locale][key];
}
