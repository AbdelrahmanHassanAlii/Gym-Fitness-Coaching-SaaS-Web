import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getLocaleDirection } from "@/i18n/locales";
import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { getThemeBootstrapScript } from "@/theme/bootstrap";
import { ThemeProvider } from "@/theme/ThemeProvider";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const { metadata } = getMessages(locale);

  return {
    title: metadata.title,
    description: metadata.description,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const locale = await getRequestLocale();
  const direction = getLocaleDirection(locale);

  return (
    <html lang={locale} dir={direction} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: getThemeBootstrapScript() }}
        />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
