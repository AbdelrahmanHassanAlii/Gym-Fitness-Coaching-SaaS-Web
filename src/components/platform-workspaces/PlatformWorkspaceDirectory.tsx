"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type {
  PlatformWorkspaceDirectoryPageDto,
  PlatformWorkspaceDirectoryRowDto,
  PlatformWorkspaceStatus,
} from "@/contracts";
import { getLocaleDirection, type Locale } from "@/i18n/locales";
import { isApiError } from "@/lib/api";
import { useAuthSession } from "@/lib/auth";
import { parseOffsetTimestamp } from "@/lib/date-time";
import { usePlatformAuthority } from "@/lib/platform-access";
import {
  listPlatformWorkspaces,
  platformWorkspaceDirectoryKeys,
  platformWorkspacePageLimit,
} from "@/lib/platform-workspaces";
import styles from "./platform-workspace-directory.module.css";

export interface PlatformWorkspaceDirectoryLabels {
  actions: {
    loadMore: string;
    loadingMore: string;
    refresh: string;
    restart: string;
    retry: string;
    retryMore: string;
  };
  columns: { createdAt: string; name: string; status: string };
  empty: string;
  errors: {
    cursor: string;
    denied: string;
    forbidden: string;
    loadMore: string;
    malformed: string;
    unavailable: string;
  };
  loading: string;
  statuses: Record<PlatformWorkspaceStatus, string>;
  title: string;
}

export function PlatformWorkspaceDirectory({
  labels,
  locale,
}: {
  labels: PlatformWorkspaceDirectoryLabels;
  locale: Locale;
}) {
  const authority = usePlatformAuthority();
  const { apiClient, markSessionExpired } = useAuthSession();
  const queryClient = useQueryClient();
  const [domainDenied, setDomainDenied] = useState(false);
  const handledError = useRef<unknown>(null);
  const loadMoreFlight = useRef(false);
  const authorized = authority.allows("platform_workspaces.manage");
  const identity = useMemo(
    () => ({
      accessVersion: authority.accessVersion,
      authorityValidUntil: authority.validUntil,
      limit: platformWorkspacePageLimit,
      membershipId: authority.membershipId,
      principalId: authority.principalId,
      sessionGeneration: authority.sessionGeneration,
    }),
    [
      authority.accessVersion,
      authority.membershipId,
      authority.principalId,
      authority.sessionGeneration,
      authority.validUntil,
    ],
  );
  const queryKey = useMemo(
    () => platformWorkspaceDirectoryKeys.list(identity),
    [identity],
  );
  const identityToken = JSON.stringify(queryKey);

  useEffect(() => {
    setDomainDenied(false);
    handledError.current = null;
  }, [identityToken]);

  useEffect(
    () => () => {
      queryClient.removeQueries({ exact: true, queryKey });
    },
    [queryClient, queryKey],
  );

  const directory = useInfiniteQuery({
    enabled: authorized && !domainDenied,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore ? lastPage.meta.nextCursor! : undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      listPlatformWorkspaces(apiClient, pageParam, signal),
    queryKey,
    retry: false,
  });

  useEffect(() => {
    const error = directory.error;
    if (error === null || error === handledError.current) return;
    handledError.current = error;
    if (isApiError(error) && error.category === "unauthenticated") {
      markSessionExpired(error);
      return;
    }
    if (isApiError(error) && error.kind === "backend" && error.status === 403) {
      setDomainDenied(true);
      void queryClient.cancelQueries({ exact: true, queryKey });
      queryClient.removeQueries({ exact: true, queryKey });
      void authority.refresh();
    }
  }, [authority, directory.error, markSessionExpired, queryClient, queryKey]);

  if (!authorized) {
    return <StatePanel message={labels.errors.denied} role="alert" />;
  }
  if (domainDenied) {
    return <StatePanel message={labels.errors.forbidden} role="alert" />;
  }
  if (directory.isPending) {
    return <StatePanel busy message={labels.loading} />;
  }

  const chain = validatePageChain(directory.data?.pages ?? []);
  if (!chain.valid) {
    return (
      <section className={styles.directory} dir={getLocaleDirection(locale)}>
        <h1>{labels.title}</h1>
        <p className={styles.error} role="alert">
          {labels.errors.malformed}
        </p>
        <button onClick={() => void restart()} type="button">
          {labels.actions.refresh}
        </button>
      </section>
    );
  }

  const initialError = directory.isError && directory.data === undefined;
  const continuationError = directory.isFetchNextPageError;
  const cursorInvalid = continuationError && isCursorInvalid(directory.error);

  async function restart() {
    loadMoreFlight.current = false;
    handledError.current = null;
    await queryClient.resetQueries({ exact: true, queryKey });
  }

  async function loadMore() {
    if (
      loadMoreFlight.current ||
      directory.isFetchingNextPage ||
      !directory.hasNextPage
    ) {
      return;
    }
    loadMoreFlight.current = true;
    try {
      await directory.fetchNextPage();
    } finally {
      loadMoreFlight.current = false;
    }
  }

  if (initialError) {
    return (
      <section className={styles.directory} dir={getLocaleDirection(locale)}>
        <h1>{labels.title}</h1>
        <p className={styles.error} role="alert">
          {errorMessage(directory.error, labels, false)}
        </p>
        <button onClick={() => void restart()} type="button">
          {labels.actions.retry}
        </button>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="platform-workspace-directory-title"
      className={styles.directory}
      dir={getLocaleDirection(locale)}
    >
      <header className={styles.header}>
        <h1 id="platform-workspace-directory-title">{labels.title}</h1>
        <button
          disabled={directory.isFetching}
          onClick={() => void restart()}
          type="button"
        >
          {labels.actions.refresh}
        </button>
      </header>
      {chain.rows.length === 0 ? (
        <p className={styles.empty} role="status">
          {labels.empty}
        </p>
      ) : (
        <div className={styles.tableFrame}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{labels.columns.name}</th>
                <th scope="col">{labels.columns.status}</th>
                <th scope="col">{labels.columns.createdAt}</th>
              </tr>
            </thead>
            <tbody>
              {chain.rows.map((workspace) => (
                <tr key={workspace.id}>
                  <td data-label={labels.columns.name}>
                    <strong>{workspace.name}</strong>
                  </td>
                  <td data-label={labels.columns.status}>
                    <span
                      className={`${styles.status} ${styles[`status${workspace.status}`]}`}
                    >
                      {labels.statuses[workspace.status]}
                    </span>
                  </td>
                  <td data-label={labels.columns.createdAt}>
                    <time dateTime={workspace.createdAt}>
                      {formatCreatedAt(workspace.createdAt, locale)}
                    </time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {continuationError ? (
        <div className={styles.paginationError}>
          <p className={styles.error} role="alert">
            {cursorInvalid
              ? labels.errors.cursor
              : errorMessage(directory.error, labels, true)}
          </p>
          <button
            onClick={() => void (cursorInvalid ? restart() : loadMore())}
            type="button"
          >
            {cursorInvalid ? labels.actions.restart : labels.actions.retryMore}
          </button>
        </div>
      ) : directory.hasNextPage ? (
        <button
          className={styles.loadMore}
          disabled={directory.isFetchingNextPage}
          onClick={() => void loadMore()}
          type="button"
        >
          {directory.isFetchingNextPage
            ? labels.actions.loadingMore
            : labels.actions.loadMore}
        </button>
      ) : null}
    </section>
  );
}

function validatePageChain(
  pages: readonly PlatformWorkspaceDirectoryPageDto[],
):
  | { valid: true; rows: PlatformWorkspaceDirectoryRowDto[] }
  | { valid: false; rows: [] } {
  const seen = new Set<string>();
  const rows: PlatformWorkspaceDirectoryRowDto[] = [];
  for (const page of pages) {
    for (const row of page.data) {
      if (seen.has(row.id)) return { rows: [], valid: false };
      seen.add(row.id);
      rows.push(row);
    }
  }
  return { rows, valid: true };
}

function formatCreatedAt(timestamp: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(parseOffsetTimestamp(timestamp)));
}

function isCursorInvalid(error: unknown): boolean {
  return (
    isApiError(error) &&
    error.kind === "backend" &&
    error.status === 422 &&
    error.code === "CURSOR_INVALID"
  );
}

function errorMessage(
  error: unknown,
  labels: PlatformWorkspaceDirectoryLabels,
  continuation: boolean,
): string {
  if (isApiError(error) && error.kind === "malformed-response") {
    return labels.errors.malformed;
  }
  return continuation ? labels.errors.loadMore : labels.errors.unavailable;
}

function StatePanel({
  busy = false,
  message,
  role,
}: {
  busy?: boolean;
  message: string;
  role?: "alert";
}) {
  return (
    <section aria-busy={busy || undefined} className={styles.state} role={role}>
      <p>{message}</p>
    </section>
  );
}
