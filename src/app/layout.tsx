import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getThemeBootstrapScript } from "@/theme/bootstrap";
import { ThemeProvider } from "@/theme/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hassan Gym & Fitness Coaching SaaS",
  description:
    "Web application foundation for Hassan Gym & Fitness Coaching SaaS.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: getThemeBootstrapScript() }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
