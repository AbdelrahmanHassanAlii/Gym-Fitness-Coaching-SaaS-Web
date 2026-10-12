"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useSupportSnapshot } from "@/lib/platform-support/support-context";
/** Native StaffShell must never mount under an active support banner. */
export function SupportRouteBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname(),
    router = useRouter(),
    snapshot = useSupportSnapshot();
  const blocked =
    (snapshot.context !== null || snapshot.pending) &&
    (pathname === "/app" || pathname.startsWith("/app/")) &&
    pathname !== "/app/support";
  useEffect(() => {
    if (blocked) router.replace("/app/support");
  }, [blocked, router]);
  return blocked ? null : children;
}
