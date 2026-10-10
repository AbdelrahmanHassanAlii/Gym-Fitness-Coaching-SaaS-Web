"use client";

import { createContext, useContext, type ReactNode } from "react";
import type {
  MembershipId,
  PlatformFoundationPermission,
  UserId,
} from "@/contracts";

export interface PlatformAuthority {
  accessVersion: number;
  allows: (permission: PlatformFoundationPermission) => boolean;
  membershipId: MembershipId;
  principalId: UserId;
  refresh: () => Promise<void>;
  sessionGeneration: number;
  validUntil: string | null;
}

const PlatformAuthorityContext = createContext<PlatformAuthority | null>(null);

export function PlatformAuthorityProvider({
  authority,
  children,
}: {
  authority: PlatformAuthority;
  children: ReactNode;
}) {
  return (
    <PlatformAuthorityContext.Provider value={authority}>
      {children}
    </PlatformAuthorityContext.Provider>
  );
}

export function usePlatformAuthority(): PlatformAuthority {
  const authority = useContext(PlatformAuthorityContext);
  if (authority === null) {
    throw new Error(
      "usePlatformAuthority must be used within PlatformAuthorityProvider",
    );
  }
  return authority;
}
