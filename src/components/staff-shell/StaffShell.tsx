"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiDataEnvelope, PermissionKey, WorkspaceId } from "@/contracts";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { getLocaleDirection, type Locale } from "@/i18n/locales";
import { useAuthSession } from "@/lib/auth";
import type { AccessFacts } from "@/lib/access";
import {
  currentUserEffectiveAccessFacts,
  currentUserEffectiveAccessQueryKey,
  erroredCurrentUserAccessFacts,
  isAccessVersionConflict,
  requestCurrentUserEffectiveAccessDecisions,
  type CurrentUserDecisionRequest,
  unresolvedCurrentUserAccessFacts,
} from "@/lib/access";
import {
  createStaffNavigation,
  createStaffShellContext,
  selectStaffWorkspaces,
  StaffWorkspaceProvider,
  type StaffShellContext,
  type StaffShellNavItemId,
} from "@/lib/staff-shell";
import { appQueryKeys } from "@/lib/server-state";
import { ThemeControls } from "@/theme/ThemeControls";
import styles from "./staff-shell.module.css";

type StaffShellLabels = {
  account: {
    logout: string;
    restricted: string;
  };
  branch: {
    allAssigned: string;
    label: string;
  };
  empty: {
    copy: string;
    title: string;
  };
  errors: {
    denied: string;
    unavailable: string;
  };
  loading: {
    access: string;
    shell: string;
    workspace: string;
  };
  localeLabel: string;
  mobile: {
    close: string;
    open: string;
  };
  nav: Record<StaffShellNavItemId, { description: string; title: string }>;
  portalLabel: string;
  themeControls: {
    appearanceLabel: string;
    resolvedPrefix: string;
    themeLabel: string;
  };
  workspace: {
    label: string;
    noWorkspace: string;
  };
};

export function StaffShell({
  children,
  labels,
  locale,
}: {
  children: ReactNode;
  labels: StaffShellLabels;
  locale: Locale;
}) {
  const direction = getLocaleDirection(locale);
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { apiClient, generation, logout, state } = useAuthSession();
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] =
    useState<WorkspaceId | null>(null);

  const workspacesQuery = useQuery({
    enabled: state.status === "authenticated",
    queryFn: async ({ signal }) => {
      const envelope = await apiClient.request<ApiDataEnvelope<unknown>>({
        method: "GET",
        path: "/me/workspaces",
        signal,
      });

      return Array.isArray(envelope.data) ? envelope.data : [];
    },
    queryKey: appQueryKeys.resource(
      ["staff-shell", "workspaces", generation],
      "current-user",
    ),
  });

  const staffWorkspaces = useMemo(
    () => selectStaffWorkspaces(workspacesQuery.data ?? []),
    [workspacesQuery.data],
  );

  const selectedWorkspace =
    staffWorkspaces.find(
      (workspace) => workspace.workspaceId === selectedWorkspaceId,
    ) ??
    staffWorkspaces[0] ??
    null;
  const accessDecisionRequests = useMemo(
    () => currentUserDecisionRequestsForPath(pathname),
    [pathname],
  );
  const accessIdentity =
    selectedWorkspace === null
      ? null
      : {
          accessContext: "user" as const,
          membershipId: selectedWorkspace.membershipId,
          sessionGeneration: generation,
          workspaceId: selectedWorkspace.workspaceId,
        };
  const effectiveAccessQuery = useQuery({
    enabled:
      state.status === "authenticated" &&
      selectedWorkspace !== null &&
      accessDecisionRequests.length > 0,
    queryFn: ({ signal }) =>
      requestCurrentUserEffectiveAccessDecisions(
        apiClient,
        selectedWorkspace!.workspaceId,
        selectedWorkspace!.membershipId,
        {
          ...(selectedWorkspace!.accessVersion === undefined
            ? {}
            : { expectedAccessVersion: selectedWorkspace!.accessVersion }),
          requests: accessDecisionRequests,
        },
        signal,
      ),
    queryKey:
      selectedWorkspace === null
        ? ["staff-shell", "effective-access", "none"]
        : currentUserEffectiveAccessQueryKey({
            accessContext: "user",
            accessVersion: selectedWorkspace.accessVersion ?? null,
            membershipId: selectedWorkspace.membershipId,
            requests: accessDecisionRequests,
            sessionGeneration: generation,
            workspaceId: selectedWorkspace.workspaceId,
          }),
    retry: false,
  });

  useEffect(() => {
    if (isAccessVersionConflict(effectiveAccessQuery.error)) {
      void queryClient.invalidateQueries({
        queryKey: appQueryKeys.resource(
          ["staff-shell", "workspaces", generation],
          "current-user",
        ),
      });
    }
  }, [effectiveAccessQuery.error, generation, queryClient]);

  let context: StaffShellContext | null = null;
  if (selectedWorkspace !== null) {
    context = createStaffShellContext({
      branchLabel: labels.branch.allAssigned,
      sessionGeneration: generation,
      workspace: selectedWorkspace,
    });
  }
  const accessFacts =
    accessIdentity === null
      ? null
      : accessFactsForQuery({
          data: effectiveAccessQuery.data,
          error: effectiveAccessQuery.error,
          identity: accessIdentity,
          isError: effectiveAccessQuery.isError,
          isLoading:
            effectiveAccessQuery.isLoading || effectiveAccessQuery.isFetching,
        });
  const navigation = createStaffNavigation({
    accessFacts,
    context,
    labels: labels.nav,
  });

  if (state.status !== "authenticated") {
    return (
      <main className={styles.loading} aria-busy="true" aria-live="polite">
        {labels.loading.shell}
      </main>
    );
  }

  const workspaceStatus = workspaceContentState({
    hasStaffWorkspaces: staffWorkspaces.length > 0,
    isError: workspacesQuery.isError,
    isLoading: workspacesQuery.isLoading,
  });
  const displayName = `${state.user.firstName} ${state.user.lastName}`.trim();

  return (
    <div className={styles.shell} dir={direction}>
      <button
        aria-controls="staff-shell-navigation"
        aria-expanded={isMenuOpen}
        className={styles.menuButton}
        onClick={() => setMenuOpen((value) => !value)}
        type="button"
      >
        {isMenuOpen ? labels.mobile.close : labels.mobile.open}
      </button>
      <aside
        className={`${styles.sidebar} ${isMenuOpen ? styles.sidebarOpen : ""}`}
        id="staff-shell-navigation"
      >
        <div className={styles.brand}>
          <span>{labels.portalLabel}</span>
          <strong>Hassan</strong>
        </div>
        <nav aria-label={labels.portalLabel} className={styles.nav}>
          {navigation.map((item) =>
            item.href && item.status === "allowed" ? (
              <Link
                aria-current={pathname === item.href ? "page" : undefined}
                className={styles.navLink}
                href={item.href}
                key={item.id}
                onClick={() => setMenuOpen(false)}
              >
                <span>{item.title}</span>
                <small>{item.description}</small>
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className={styles.navDisabled}
                key={item.id}
                title={item.description}
              >
                <span>{item.title}</span>
                <small>{navStatusLabel(item.status, labels)}</small>
              </span>
            ),
          )}
        </nav>
      </aside>
      <div className={styles.mainColumn}>
        <header className={styles.header}>
          <div className={styles.contextBar}>
            <label>
              <span>{labels.workspace.label}</span>
              <select
                disabled={staffWorkspaces.length === 0}
                onChange={(event) =>
                  setSelectedWorkspaceId(event.target.value as WorkspaceId)
                }
                value={selectedWorkspace?.workspaceId ?? ""}
              >
                {staffWorkspaces.length === 0 ? (
                  <option value="">{labels.workspace.noWorkspace}</option>
                ) : null}
                {staffWorkspaces.map((workspace) => (
                  <option
                    key={workspace.workspaceId}
                    value={workspace.workspaceId}
                  >
                    {workspace.workspaceName}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.branchContext}>
              <span>{labels.branch.label}</span>
              <strong>
                {context?.branch.label ?? labels.branch.allAssigned}
              </strong>
            </div>
          </div>
          <div className={styles.controls}>
            <LocaleSwitcher label={labels.localeLabel} locale={locale} />
            <ThemeControls labels={labels.themeControls} />
          </div>
          <div className={styles.account}>
            <span>{displayName}</span>
            {state.restrictedUntilVerified ? (
              <strong>{labels.account.restricted}</strong>
            ) : null}
            <button onClick={() => void logout()} type="button">
              {labels.account.logout}
            </button>
          </div>
        </header>
        <main className={styles.content}>
          {workspaceStatus === "loading" ? (
            <section
              aria-busy="true"
              aria-live="polite"
              className={styles.statePanel}
            >
              <h1>{labels.loading.workspace}</h1>
              <p>{labels.loading.access}</p>
            </section>
          ) : null}
          {workspaceStatus === "error" ? (
            <section className={styles.statePanel} role="alert">
              <h1>{labels.errors.unavailable}</h1>
              <p>{labels.empty.copy}</p>
            </section>
          ) : null}
          {workspaceStatus === "empty" ? (
            <section className={styles.statePanel}>
              <h1>{labels.empty.title}</h1>
              <p>{labels.empty.copy}</p>
            </section>
          ) : null}
          {workspaceStatus === "ready" ? (
            <StaffWorkspaceProvider
              value={{
                accessFacts,
                shellContext: context,
                workspace: selectedWorkspace,
              }}
            >
              {children}
            </StaffWorkspaceProvider>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function workspaceContentState(input: {
  hasStaffWorkspaces: boolean;
  isError: boolean;
  isLoading: boolean;
}): "empty" | "error" | "loading" | "ready" {
  if (input.isLoading) {
    return "loading";
  }

  if (input.isError) {
    return "error";
  }

  if (!input.hasStaffWorkspaces) {
    return "empty";
  }

  return "ready";
}

function accessFactsForQuery(input: {
  data:
    Parameters<typeof currentUserEffectiveAccessFacts>[0]["data"] | undefined;
  error: unknown;
  identity: Pick<
    AccessFacts,
    "accessContext" | "membershipId" | "sessionGeneration" | "workspaceId"
  >;
  isError: boolean;
  isLoading: boolean;
}): AccessFacts {
  if (input.data !== undefined && !input.isLoading) {
    return currentUserEffectiveAccessFacts({
      data: input.data,
      sessionGeneration: input.identity.sessionGeneration,
    });
  }

  if (input.isError) {
    return erroredCurrentUserAccessFacts({
      ...input.identity,
      error: input.error,
    });
  }

  return unresolvedCurrentUserAccessFacts(input.identity);
}

export function currentUserDecisionRequestsForPath(
  pathname: string,
): CurrentUserDecisionRequest[] {
  const requests = new Map<string, CurrentUserDecisionRequest>();
  for (const permission of [
    "billing.subscription.read",
    "adherence.read",
    "analytics.nutrition.read",
    "foods.read",
    "nutrition.plans.read",
    "programs.read",
    "staff.read",
    "trainees.read",
    "workspace.read",
  ] satisfies PermissionKey[]) {
    requests.set(permission, workspaceRequest(permission));
  }

  if (pathname.startsWith("/app/workspace")) {
    for (const permission of [
      "branches.archive",
      "branches.create",
      "branches.read",
      "branches.update",
      "staff.branches.manage",
      "staff.invite",
      "staff.manage",
      "workspace.update",
    ] satisfies PermissionKey[]) {
      requests.set(permission, workspaceRequest(permission));
    }
  }

  if (pathname.startsWith("/app/leads")) {
    for (const permission of [
      "billing.payments.create",
      "billing.payments.read",
      "billing.subscription.read",
      "billing.usage.read",
    ] satisfies PermissionKey[]) {
      requests.set(permission, workspaceRequest(permission));
    }
  }

  if (pathname.startsWith("/app/relationships")) {
    for (const permission of [
      "trainees.assignments.assistant.manage",
      "trainees.assignments.nutritionist.manage",
      "trainees.assignments.primary.manage",
      "trainees.read",
      "trainees.update",
    ] satisfies PermissionKey[]) {
      requests.set(permission, workspaceRequest(permission));
    }
  }

  if (pathname.startsWith("/app/training")) {
    for (const permission of [
      "exercises.read",
      "personal_records.read",
      "programs.activate",
      "programs.create",
      "programs.read",
      "programs.update",
      "trainees.read",
      "workouts.abandon",
      "workouts.complete",
      "workouts.correct",
      "workouts.create",
      "workouts.day.defer",
      "workouts.day.skip",
      "workouts.read",
      "workouts.update",
    ] satisfies PermissionKey[]) {
      requests.set(permission, workspaceRequest(permission));
    }
  }

  if (pathname.startsWith("/app/nutrition")) {
    for (const permission of [
      "foods.archive",
      "foods.create",
      "foods.update",
      "nutrition.plans.activate",
      "nutrition.plans.archive",
      "nutrition.plans.complete",
      "nutrition.plans.create",
      "nutrition.plans.update",
    ] satisfies PermissionKey[]) {
      requests.set(permission, workspaceRequest(permission));
    }
  }

  if (pathname.startsWith("/app/progress")) {
    for (const permission of [
      "measurements.read",
      "progress_photos.read",
      "health.read",
      "health.food_allergies.read",
      "notes.read",
      "checkins.read",
      "analytics.progress.read",
      "analytics.adherence.read",
    ] satisfies PermissionKey[]) {
      requests.set(permission, workspaceRequest(permission));
    }
  }

  return Array.from(requests.values());
}

function workspaceRequest(
  permission: PermissionKey,
): CurrentUserDecisionRequest {
  return { permission, scope: "WORKSPACE" };
}

function navStatusLabel(
  status: "allowed" | "denied" | "disabled" | "unavailable" | "unresolved",
  labels: StaffShellLabels,
): string {
  if (status === "denied") {
    return labels.errors.denied;
  }

  if (status === "unavailable") {
    return labels.errors.unavailable;
  }

  if (status === "unresolved") {
    return labels.loading.access;
  }

  return labels.nav.overview.description;
}
