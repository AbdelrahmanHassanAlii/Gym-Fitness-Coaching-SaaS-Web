"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuthSession } from "@/lib/auth";

export function AuthGate({
  children,
  loadingLabel,
}: {
  children: React.ReactNode;
  loadingLabel: string;
}) {
  const { bootstrap, state } = useAuthSession();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (state.status !== "unauthenticated") {
      return;
    }

    const query = searchParams.toString();
    const currentPath = `${pathname}${query === "" ? "" : `?${query}`}`;
    router.replace(`/login?next=${encodeURIComponent(currentPath)}`);
  }, [pathname, router, searchParams, state.status]);

  if (state.status !== "authenticated") {
    return (
      <main aria-busy="true" aria-live="polite">
        <p>{loadingLabel}</p>
      </main>
    );
  }

  return <>{children}</>;
}
