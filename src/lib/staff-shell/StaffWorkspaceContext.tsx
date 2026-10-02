"use client";

import { createContext, useContext } from "react";
import type { StaffShellContext, StaffWorkspaceOption } from "./model";

export type StaffWorkspaceContextValue = {
  shellContext: StaffShellContext | null;
  workspace: StaffWorkspaceOption | null;
};

const StaffWorkspaceContext = createContext<StaffWorkspaceContextValue>({
  shellContext: null,
  workspace: null,
});

export function StaffWorkspaceProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: StaffWorkspaceContextValue;
}) {
  return (
    <StaffWorkspaceContext.Provider value={value}>
      {children}
    </StaffWorkspaceContext.Provider>
  );
}

export function useStaffWorkspaceContext(): StaffWorkspaceContextValue {
  return useContext(StaffWorkspaceContext);
}
