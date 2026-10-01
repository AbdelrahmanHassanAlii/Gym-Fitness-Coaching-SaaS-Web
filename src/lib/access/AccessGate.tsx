"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
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
  const disabled = buttonProps.disabled === true || !decision.allowed;
  const label =
    decision.status === "unresolved" ? loadingLabel : disabledReason;

  return (
    <button
      {...buttonProps}
      aria-describedby={disabled ? `${buttonProps.id}-access-state` : undefined}
      disabled={disabled}
    >
      {children}
      {disabled ? (
        <span hidden id={`${buttonProps.id}-access-state`}>
          {label}
        </span>
      ) : null}
    </button>
  );
}
