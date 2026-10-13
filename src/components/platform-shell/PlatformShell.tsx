"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  PlatformEffectiveAccessDecisionsDto,
  PlatformFoundationPermission,
} from "@/contracts";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { getLocaleDirection, type Locale } from "@/i18n/locales";
import { useAuthSession } from "@/lib/auth";
import { getSupportLabels } from "@/i18n/support";
import { useOptionalSupportRuntime } from "@/lib/platform-support/support-context";
import { isApiError } from "@/lib/api";
import {
  isPlatformAccessVersionConflict,
  PlatformAuthorityProvider,
  platformAccessKeys,
  platformDecisionRequests,
  platformWorkspaceDecisionRequests,
  platformUserManagementDecisionRequests,
  platformSupportDecisionRequests,
  platformSupportStartDecisionRequests,
  platformSupportManagementDecisionRequests,
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
const maxSafeTimerDelay = 2_147_483_647;
const subscribeNothing = () => () => {};
const noSupportSnapshot = () => null;

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
  const supportRoute =
    pathname.startsWith("/platform/support") ||
    /^\/platform\/workspaces\/[^/]+\/support$/.test(pathname);
  const runtime = useOptionalSupportRuntime();
  const supportSnapshot = useSyncExternalStore(
    runtime?.subscribe ?? subscribeNothing,
    runtime?.getSnapshot ?? noSupportSnapshot,
    runtime?.getSnapshot ?? noSupportSnapshot,
  );
  const decisionRequests = supportRoute
    ? platformSupportDecisionRequests
    : /^\/platform\/workspaces\/[0-9a-f]{24}$/.test(pathname)
      ? platformWorkspaceDecisionRequests
      : /^\/platform\/users\/[0-9a-f]{24}$/.test(pathname)
        ? platformUserManagementDecisionRequests
        : platformDecisionRequests;
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
            membershipStatus: "ACTIVE",
            principalId,
            requests: decisionRequests,
            sessionGeneration: generation,
          })
        : null,
    [activeMembership, generation, principalId, decisionRequests],
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
        decisionRequests,
        signal,
      ),
    queryKey: decisionKey ?? [...platformAccessKeys.all, "decisions-disabled"],
    retry: false,
  });
  const refetchContext = contextQuery.refetch;
  const refetchDecisions = decisionsQuery.refetch;
  const startDecisionsQuery = useQuery({
    enabled:
      supportRoute &&
      contextEnabled &&
      activeMembership !== null &&
      !isRecovering,
    queryKey:
      principalId && activeMembership
        ? platformAccessKeys.decisions({
            accessVersion: activeMembership.accessVersion,
            membershipId: activeMembership.id,
            membershipStatus: "ACTIVE",
            principalId,
            requests: platformSupportStartDecisionRequests,
            sessionGeneration: generation,
          })
        : [...platformAccessKeys.all, "support-start-disabled"],
    queryFn: ({ signal }) =>
      requestPlatformEffectiveAccessDecisions(
        apiClient,
        {
          accessVersion: activeMembership!.accessVersion,
          membershipId: activeMembership!.id,
        },
        platformSupportStartDecisionRequests,
        signal,
      ),
    retry: false,
  });
  const managementKey =
    principalId && activeMembership
      ? platformAccessKeys.decisions({
          accessVersion: activeMembership.accessVersion,
          membershipId: activeMembership.id,
          membershipStatus: "ACTIVE",
          principalId,
          requests: platformSupportManagementDecisionRequests,
          sessionGeneration: generation,
        })
      : [...platformAccessKeys.all, "support-management-disabled"];
  const managementDecisionsQuery = useQuery({
    enabled:
      supportRoute &&
      contextEnabled &&
      activeMembership !== null &&
      !isRecovering,
    queryKey: managementKey,
    queryFn: ({ signal }) =>
      requestPlatformEffectiveAccessDecisions(
        apiClient,
        {
          accessVersion: activeMembership!.accessVersion,
          membershipId: activeMembership!.id,
        },
        platformSupportManagementDecisionRequests,
        signal,
      ),
    retry: false,
  });
  const [expiredManagementIdentity, setExpiredManagementIdentity] = useState<
    string | null
  >(null);
  const managementIdentity = decisionFingerprint(
    managementDecisionsQuery.data,
    managementKey,
  );
  const managementDeadline = managementDecisionsQuery.data?.validUntil;
  const refetchManagement = managementDecisionsQuery.refetch;
  useEffect(() => {
    if (!supportRoute || !managementDeadline || !managementIdentity) return;
    let timer: number | undefined,
      disposed = false;
    const wake = () => {
      if (disposed) return;
      const remaining = Date.parse(managementDeadline) - Date.now();
      if (remaining <= 0) {
        setExpiredManagementIdentity(managementIdentity);
        void refetchManagement();
      } else
        timer = window.setTimeout(wake, Math.min(remaining, maxSafeTimerDelay));
    };
    wake();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [supportRoute, managementDeadline, managementIdentity, refetchManagement]);
  const managementUsable =
    !managementDecisionsQuery.isError &&
    !isDecisionExpired(managementDecisionsQuery.data) &&
    (managementIdentity === null ||
      managementIdentity !== expiredManagementIdentity);

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

  const decisionIdentity = decisionFingerprint(
    decisionsQuery.data,
    decisionKey,
  );
  const decisionValidUntil = decisionsQuery.data?.validUntil ?? null;
  useEffect(() => {
    if (decisionValidUntil === null || decisionIdentity === null) return;

    const expiresAt = Date.parse(decisionValidUntil);
    let disposed = false;
    let timer: number | undefined;
    const scheduleNextWakeup = () => {
      if (disposed) return;

      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        setExpiredDecisionIdentity(decisionIdentity);
        void refetchDecisions();
        return;
      }

      timer = window.setTimeout(
        scheduleNextWakeup,
        Math.min(remaining, maxSafeTimerDelay),
      );
    };
    scheduleNextWakeup();

    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
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

  useEffect(() => {
    if (!supportRoute || !runtime) return;
    const selectedAuthority = runtime.getSnapshot().authority;
    if (
      contextEnabled &&
      !contextQuery.isError &&
      activeMembership &&
      principalId &&
      selectedAuthority &&
      selectedAuthority.principalId === principalId &&
      selectedAuthority.sessionGeneration === generation &&
      selectedAuthority.membershipId === activeMembership.id
    ) {
      if (activeMembership.accessVersion !== selectedAuthority.accessVersion) {
        if (activeMembership.accessVersion > selectedAuthority.accessVersion)
          runtime.beginAuthorityRevalidation(activeMembership.accessVersion);
        return;
      }
      if (runtime.getSnapshot().revalidating) return;
    }
    if (
      !contextEnabled ||
      contextQuery.isError ||
      !activeMembership ||
      !principalId ||
      !startDecisionsQuery.data ||
      startDecisionsQuery.isError
    ) {
      runtime.observeAuthority(null);
      return;
    }
    runtime.observeAuthority({
      principalId,
      sessionGeneration: generation,
      membershipId: activeMembership.id,
      accessVersion: activeMembership.accessVersion,
      validUntil: managementDecisionsQuery.data?.validUntil ?? null,
      startValidUntil: startDecisionsQuery.data.validUntil,
      permissions: [
        ...(startDecisionsQuery.data.decisions[0].allowed
          ? ["support.sessions.start"]
          : []),
        ...(!managementUsable
          ? []
          : (managementDecisionsQuery.data?.decisions ?? [])
        )
          .filter((d) => d.allowed && d.permission.startsWith("support."))
          .map((d) => d.permission)
          .filter((p) => p !== "support.sessions.start"),
      ],
    });
  }, [
    runtime,
    supportRoute,
    accessState,
    activeMembership,
    principalId,
    generation,
    decisionsQuery.data,
    startDecisionsQuery.data,
    startDecisionsQuery.isError,
    contextEnabled,
    contextQuery.isError,
    managementDecisionsQuery.data,
    managementUsable,
  ]);

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
  const refreshAuthority = async () => {
    // Keep independently readable children mounted during background rediscovery.
    // Updated context/decisions still retire authority through the normal shell gates.
    const refreshedContext = await refetchContext();
    if (
      refreshedContext.data?.membership.status === "ACTIVE" &&
      refreshedContext.data.membership.id === activeMembership!.id &&
      refreshedContext.data.membership.accessVersion ===
        activeMembership!.accessVersion
    ) {
      await refetchDecisions();
      if (supportRoute) await startDecisionsQuery.refetch();
      if (supportRoute) await refetchManagement();
    }
  };
  const authority = {
    accessVersion: activeMembership!.accessVersion,
    allows: (permission: PlatformFoundationPermission) => {
      if (supportRoute && permission.startsWith("support.")) {
        if (
          supportSnapshot?.revalidating ||
          (supportSnapshot?.authority &&
            supportSnapshot.authority.accessVersion !==
              activeMembership!.accessVersion)
        )
          return false;
        if (permission === "support.sessions.start")
          return (
            !startDecisionsQuery.isError &&
            startDecisionsQuery.data?.decisions[0].allowed === true &&
            !isDecisionExpired(startDecisionsQuery.data)
          );
        return (
          managementUsable &&
          managementDecisionsQuery.data?.decisions.some(
            (d) => d.permission === permission && d.allowed,
          ) === true
        );
      }
      return allowedPermissions.has(permission);
    },
    membershipId: activeMembership!.id,
    principalId: principalId!,
    refresh: refreshAuthority,
    sessionGeneration: generation,
    validUntil: decisionsQuery.data!.validUntil,
    supportStartDecision: supportRoute
      ? {
          allowed:
            !startDecisionsQuery.isError &&
            startDecisionsQuery.data?.decisions[0].allowed === true,
          validUntil: startDecisionsQuery.data?.validUntil ?? null,
        }
      : undefined,
    supportManagementValidUntil: supportRoute
      ? (managementDecisionsQuery.data?.validUntil ?? null)
      : undefined,
  };

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
            className={styles.navLink}
            href="/platform/support"
            aria-current={supportRoute ? "page" : undefined}
            onClick={() => setMenuOpen(false)}
          >
            {getSupportLabels(locale).title}
          </Link>
          <Link
            aria-current={pathname === "/platform" ? "page" : undefined}
            className={styles.navLink}
            href="/platform"
            onClick={() => setMenuOpen(false)}
          >
            <span>{labels.nav.home.title}</span>
            <small>{labels.nav.home.description}</small>
          </Link>
          {allowedPermissions.has(navigationPermissions.workspaces) ? (
            <Link
              aria-current={
                pathname === "/platform/workspaces" ||
                pathname.startsWith("/platform/workspaces/")
                  ? "page"
                  : undefined
              }
              className={styles.navLink}
              href="/platform/workspaces"
              onClick={() => setMenuOpen(false)}
            >
              <span>{labels.nav.workspaces.title}</span>
              <small>{labels.nav.workspaces.description}</small>
            </Link>
          ) : null}
          {allowedPermissions.has("platform_users.read") ? (
            <Link
              aria-current={
                pathname.startsWith("/platform/users") ? "page" : undefined
              }
              href="/platform/users"
              onClick={() => setMenuOpen(false)}
            >
              <span>{labels.nav.users.title}</span>
              <small>{labels.nav.users.description}</small>
            </Link>
          ) : null}
          {(["operations"] as const).map((item) =>
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
          <PlatformAuthorityProvider authority={authority}>
            {children}
          </PlatformAuthorityProvider>
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
  decisionKey: readonly unknown[] | null,
): string | null {
  if (
    decisions === undefined ||
    decisions.validUntil === null ||
    decisionKey === null
  ) {
    return null;
  }
  return JSON.stringify([decisionKey, decisions.validUntil]);
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
