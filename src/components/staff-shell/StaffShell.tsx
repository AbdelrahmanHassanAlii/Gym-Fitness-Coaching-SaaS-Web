"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ApiDataEnvelope, WorkspaceId } from "@/contracts";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { getLocaleDirection, type Locale } from "@/i18n/locales";
import { useAuthSession } from "@/lib/auth";
import type { AccessFacts } from "@/lib/access";
import { accessFactsFromDecision } from "@/lib/access";
import {
  createStaffNavigation,
  createStaffShellContext,
  selectStaffWorkspaces,
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
  let context: StaffShellContext | null = null;
  if (selectedWorkspace !== null) {
    context = createStaffShellContext({
      branchLabel: labels.branch.allAssigned,
      sessionGeneration: generation,
      workspace: selectedWorkspace,
    });
  }
  const accessFacts =
    selectedWorkspace === null
      ? null
      : shellAccessFacts({
          generation,
          workspace: selectedWorkspace,
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
          {workspaceStatus === "ready" ? children : null}
        </main>
      </div>
    </div>
  );
}

function shellAccessFacts({
  generation,
  workspace,
}: {
  generation: number;
  workspace: NonNullable<ReturnType<typeof selectStaffWorkspaces>[number]>;
}): AccessFacts {
  return accessFactsFromDecision({
    decisions: [],
    membershipId: workspace.membershipId,
    sessionGeneration: generation,
    workspaceId: workspace.workspaceId,
  });
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
