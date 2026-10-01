"use client";

import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { AccessDecision } from "./types";

export function AccessGate({
  children,
  decision,
  denied,
  loading,
  mode = "fallback",
}: {
  children: ReactNode;
  decision: AccessDecision;
  denied?: ReactNode;
  loading?: ReactNode;
  mode?: "fallback" | "hide";
}) {
  if (decision.status === "allowed") {
    return <>{children}</>;
  }

  if (decision.status === "unresolved") {
    return <>{loading ?? null}</>;
  }

  if (mode === "hide") {
    return null;
  }

  return <>{denied ?? null}</>;
}

export function AccessControlledButton({
  children,
  decision,
  disabledReason,
  loadingLabel,
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  decision: AccessDecision;
  disabledReason: string;
  loadingLabel: string;
}) {
  const generatedId = useId();
  const disabled = buttonProps.disabled === true || !decision.allowed;
  const label =
    decision.status === "unresolved" ? loadingLabel : disabledReason;
  const stateId = `${buttonProps.id ?? generatedId}-access-state`;

  return (
    <button
      {...buttonProps}
      aria-describedby={disabled ? stateId : undefined}
      disabled={disabled}
    >
      {children}
      {disabled ? (
        <span hidden id={stateId}>
          {label}
        </span>
      ) : null}
    </button>
  );
}
