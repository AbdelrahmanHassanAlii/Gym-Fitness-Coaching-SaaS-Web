"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  PlatformEffectiveAccessDecisionsDto,
  PlatformFoundationPermission,
} from "@/contracts";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { getLocaleDirection, type Locale } from "@/i18n/locales";
import { useAuthSession } from "@/lib/auth";
import { isApiError } from "@/lib/api";
import {
  isPlatformAccessVersionConflict,
  platformAccessKeys,
  platformDecisionRequests,
  requestPlatformContext,
  requestPlatformEffectiveAccessDecisions,
} from "@/lib/platform-access";
import { ThemeControls } from "@/theme/ThemeControls";
import styles from "./platform-shell.module.css";

export interface PlatformShellLabels {
  account: { logout: string; restricted: string };
  errors: {
    accessDenied: string;
    failed: string;
    malformed: string;
    membershipEnded: string;
    membershipRequired: string;
    membershipSuspended: string;
    mfaRequired: string;
    restricted: string;
    supportForbidden: string;
  };
  home: { availableSections: string; noSections: string };
  loading: { access: string; context: string };
  localeLabel: string;
  mobile: { close: string; open: string };
  nav: Record<
    "home" | "operations" | "users" | "workspaces",
    { description: string; title: string }
  >;
  portalLabel: string;
  retry: string;
  themeControls: {
    appearanceLabel: string;
    resolvedPrefix: string;
    themeLabel: string;
  };
}

type PlatformAccessState =
  | "UNRESOLVED_AUTH"
  | "LOADING_PLATFORM_CONTEXT"
  | "NO_PLATFORM_MEMBERSHIP"
  | "MFA_REQUIRED"
  | "MEMBERSHIP_SUSPENDED"
  | "MEMBERSHIP_ENDED"
  | "LOADING_DECISIONS"
  | "READY"
  | "DENIED"
  | "FAILED"
  | "STALE_RETRY"
  | "SESSION_RESTRICTED"
  | "SUPPORT_FORBIDDEN";

const navigationPermissions = {
  operations: "audit.platform.read",
  users: "platform_users.read",
  workspaces: "platform_workspaces.manage",
} as const satisfies Record<string, PlatformFoundationPermission>;

export function PlatformShell({
  children,
  labels,
  locale,
}: {
  children: ReactNode;
  labels: PlatformShellLabels;
  locale: Locale;
}) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { apiClient, generation, logout, markSessionExpired, state } =
    useAuthSession();
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [isRecovering, setRecovering] = useState(false);
  const [expiredDecisionIdentity, setExpiredDecisionIdentity] = useState<
    string | null
  >(null);
  const handledRecoveryError = useRef<number | null>(null);
  const previousDecisionKey = useRef<readonly unknown[] | null>(null);

  const isAuthenticated = state.status === "authenticated";
  const principalId = isAuthenticated ? state.user.id : null;
  const contextEnabled =
    isAuthenticated && !state.restrictedUntilVerified && principalId !== null;
  const contextQuery = useQuery({
    enabled: contextEnabled,
    queryFn: ({ signal }) => requestPlatformContext(apiClient, signal),
    queryKey:
      principalId === null
        ? platformAccessKeys.all
        : platformAccessKeys.context({
            principalId,
            sessionGeneration: generation,
          }),
    retry: false,
  });
  const platformContext = contextQuery.data;
  const activeMembership =
    platformContext?.membership.status === "ACTIVE"
      ? platformContext.membership
      : null;
  const decisionKey = useMemo(
    () =>
      principalId !== null && activeMembership !== null
        ? platformAccessKeys.decisions({
            accessVersion: activeMembership.accessVersion,
            membershipId: activeMembership.id,
            principalId,
            requests: platformDecisionRequests,
            sessionGeneration: generation,
          })
        : null,
    [activeMembership, generation, principalId],
  );
  const decisionsQuery = useQuery({
    enabled:
      contextEnabled &&
      activeMembership !== null &&
      decisionKey !== null &&
      !isRecovering,
    queryFn: ({ signal }) =>
      requestPlatformEffectiveAccessDecisions(
        apiClient,
        {
          accessVersion: activeMembership!.accessVersion,
          membershipId: activeMembership!.id,
        },
        platformDecisionRequests,
        signal,
      ),
    queryKey: decisionKey ?? [...platformAccessKeys.all, "decisions-disabled"],
    retry: false,
  });
  const refetchContext = contextQuery.refetch;
  const refetchDecisions = decisionsQuery.refetch;

  useEffect(() => {
    const previous = previousDecisionKey.current;
    if (
      previous !== null &&
      (decisionKey === null ||
        JSON.stringify(previous) !== JSON.stringify(decisionKey))
    ) {
      queryClient.removeQueries({ exact: true, queryKey: previous });
    }
    previousDecisionKey.current = decisionKey;
  }, [decisionKey, queryClient]);

  useEffect(() => {
    const errors = [contextQuery.error, decisionsQuery.error];
    if (
      errors.some(
        (error) => isApiError(error) && error.category === "unauthenticated",
      )
    ) {
      markSessionExpired(
        errors.find(
          (error) => isApiError(error) && error.category === "unauthenticated",
        ) as Parameters<typeof markSessionExpired>[0],
      );
    }
  }, [contextQuery.error, decisionsQuery.error, markSessionExpired]);

  useEffect(() => {
    const error = decisionsQuery.error;
    const shouldRediscover =
      isPlatformAccessVersionConflict(error) ||
      (isApiError(error) &&
        error.kind === "backend" &&
        error.code === "PLATFORM_MEMBERSHIP_INACTIVE");
    if (
      !shouldRediscover ||
      decisionsQuery.errorUpdatedAt === handledRecoveryError.current
    ) {
      return;
    }

    handledRecoveryError.current = decisionsQuery.errorUpdatedAt;
    setRecovering(true);
    void refetchContext().finally(() => setRecovering(false));
  }, [decisionsQuery.error, decisionsQuery.errorUpdatedAt, refetchContext]);

  const decisionIdentity = decisionFingerprint(decisionsQuery.data);
  const decisionValidUntil = decisionsQuery.data?.validUntil ?? null;
  useEffect(() => {
    if (decisionValidUntil === null || decisionIdentity === null) return;

    const expiresAt = Date.parse(decisionValidUntil);
    const expireAndRefresh = () => {
      setExpiredDecisionIdentity(decisionIdentity);
      void refetchDecisions();
    };
    const delay = expiresAt - Date.now();
    const timer = window.setTimeout(
      expireAndRefresh,
      Math.min(Math.max(delay, 0), 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [decisionIdentity, decisionValidUntil, refetchDecisions]);

  const accessState = resolvePlatformAccessState({
    contextError: contextQuery.error,
    contextLoading: contextQuery.isLoading,
    decisionError: decisionsQuery.error,
    decisionExpired:
      isDecisionExpired(decisionsQuery.data) ||
      (decisionIdentity !== null &&
        decisionIdentity === expiredDecisionIdentity),
    decisionLoading:
      decisionsQuery.isLoading ||
      (decisionsQuery.isFetching && decisionsQuery.data === undefined),
    decisions: decisionsQuery.data,
    isAuthenticated,
    isRecovering,
    membershipStatus: platformContext?.membership.status,
    restricted: isAuthenticated && state.restrictedUntilVerified,
  });

  if (accessState !== "READY" && accessState !== "DENIED") {
    return (
      <PlatformAccessStatePanel
        labels={labels}
        onRetry={() => {
          if (contextQuery.isError || platformContext === undefined) {
            void contextQuery.refetch();
          } else {
            void decisionsQuery.refetch();
          }
        }}
        state={accessState}
      />
    );
  }

  const allowedPermissions = new Set(
    decisionsQuery.data?.decisions
      .filter((decision) => decision.allowed && decision.effect === "ALLOW")
      .map((decision) => decision.permission) ?? [],
  );
  const displayName =
    state.status === "authenticated"
      ? `${state.user.firstName} ${state.user.lastName}`.trim()
      : "";
  const direction = getLocaleDirection(locale);

  return (
    <div className={styles.shell} dir={direction}>
      <button
        aria-controls="platform-shell-navigation"
        aria-expanded={isMenuOpen}
        className={styles.menuButton}
        onClick={() => setMenuOpen((value) => !value)}
        type="button"
      >
        {isMenuOpen ? labels.mobile.close : labels.mobile.open}
      </button>
      <aside
        className={`${styles.sidebar} ${isMenuOpen ? styles.sidebarOpen : ""}`}
        id="platform-shell-navigation"
      >
        <div className={styles.brand}>
          <span>{labels.portalLabel}</span>
          <strong>Hassan</strong>
        </div>
        <nav aria-label={labels.portalLabel} className={styles.nav}>
          <Link
            aria-current={pathname === "/platform" ? "page" : undefined}
            className={styles.navLink}
            href="/platform"
            onClick={() => setMenuOpen(false)}
          >
            <span>{labels.nav.home.title}</span>
            <small>{labels.nav.home.description}</small>
          </Link>
          {(["workspaces", "users", "operations"] as const).map((item) =>
            allowedPermissions.has(navigationPermissions[item]) ? (
              <span className={styles.navPlaceholder} key={item}>
                <span>{labels.nav[item].title}</span>
                <small>{labels.nav[item].description}</small>
              </span>
            ) : null,
          )}
        </nav>
      </aside>
      <div className={styles.mainColumn}>
        <header className={styles.header}>
          <div className={styles.controls}>
            <LocaleSwitcher label={labels.localeLabel} locale={locale} />
            <ThemeControls labels={labels.themeControls} />
          </div>
          <div className={styles.account}>
            <span>{displayName}</span>
            <button onClick={() => void logout()} type="button">
              {labels.account.logout}
            </button>
          </div>
        </header>
        <main className={styles.content}>
          {children}
          {accessState === "DENIED" ? (
            <p className={styles.noSections} role="status">
              {labels.home.noSections}
            </p>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function resolvePlatformAccessState(input: {
  contextError: unknown;
  contextLoading: boolean;
  decisionError: unknown;
  decisionExpired: boolean;
  decisionLoading: boolean;
  decisions: PlatformEffectiveAccessDecisionsDto | undefined;
  isAuthenticated: boolean;
  isRecovering: boolean;
  membershipStatus: "ACTIVE" | "SUSPENDED" | "ENDED" | undefined;
  restricted: boolean;
}): PlatformAccessState {
  if (!input.isAuthenticated) return "UNRESOLVED_AUTH";
  if (input.restricted) return "SESSION_RESTRICTED";
  if (input.contextError !== null) {
    if (hasCode(input.contextError, "TWO_FACTOR_REQUIRED"))
      return "MFA_REQUIRED";
    if (hasCode(input.contextError, "PLATFORM_MEMBERSHIP_REQUIRED"))
      return "NO_PLATFORM_MEMBERSHIP";
    if (hasCode(input.contextError, "SUPPORT_ACCESS_FORBIDDEN"))
      return "SUPPORT_FORBIDDEN";
    if (hasCode(input.contextError, "AUTH_SESSION_RESTRICTED"))
      return "SESSION_RESTRICTED";
    return "FAILED";
  }
  if (input.contextLoading || input.membershipStatus === undefined)
    return "LOADING_PLATFORM_CONTEXT";
  if (input.membershipStatus === "SUSPENDED") return "MEMBERSHIP_SUSPENDED";
  if (input.membershipStatus === "ENDED") return "MEMBERSHIP_ENDED";
  if (
    input.isRecovering ||
    isPlatformAccessVersionConflict(input.decisionError)
  ) {
    return "STALE_RETRY";
  }
  if (input.decisionError !== null) return "FAILED";
  if (input.decisionExpired) return "STALE_RETRY";
  if (input.decisionLoading || input.decisions === undefined)
    return "LOADING_DECISIONS";
  return input.decisions.decisions.some((decision) => decision.allowed)
    ? "READY"
    : "DENIED";
}

function PlatformAccessStatePanel({
  labels,
  onRetry,
  state,
}: {
  labels: PlatformShellLabels;
  onRetry: () => void;
  state: PlatformAccessState;
}) {
  const loading =
    state === "UNRESOLVED_AUTH" ||
    state === "LOADING_PLATFORM_CONTEXT" ||
    state === "LOADING_DECISIONS" ||
    state === "STALE_RETRY";
  const message =
    state === "UNRESOLVED_AUTH" || state === "LOADING_DECISIONS"
      ? labels.loading.access
      : state === "LOADING_PLATFORM_CONTEXT" || state === "STALE_RETRY"
        ? labels.loading.context
        : state === "MFA_REQUIRED"
          ? labels.errors.mfaRequired
          : state === "NO_PLATFORM_MEMBERSHIP"
            ? labels.errors.membershipRequired
            : state === "MEMBERSHIP_SUSPENDED"
              ? labels.errors.membershipSuspended
              : state === "MEMBERSHIP_ENDED"
                ? labels.errors.membershipEnded
                : state === "SESSION_RESTRICTED"
                  ? labels.errors.restricted
                  : state === "SUPPORT_FORBIDDEN"
                    ? labels.errors.supportForbidden
                    : labels.errors.failed;

  return (
    <main
      aria-busy={loading || undefined}
      aria-live={loading ? "polite" : undefined}
      className={styles.accessState}
      role={loading ? undefined : "alert"}
    >
      <h1>{message}</h1>
      {state === "FAILED" ? (
        <button onClick={onRetry} type="button">
          {labels.retry}
        </button>
      ) : null}
    </main>
  );
}

function hasCode(error: unknown, code: string): boolean {
  return isApiError(error) && error.kind === "backend" && error.code === code;
}

function decisionFingerprint(
  decisions: PlatformEffectiveAccessDecisionsDto | undefined,
): string | null {
  if (decisions === undefined || decisions.validUntil === null) return null;
  return `${decisions.membershipId}:${decisions.accessVersion}:${decisions.validUntil}`;
}

function isDecisionExpired(
  decisions: PlatformEffectiveAccessDecisionsDto | undefined,
): boolean {
  return (
    decisions?.validUntil !== null &&
    decisions?.validUntil !== undefined &&
    Date.parse(decisions.validUntil) <= Date.now()
  );
}
