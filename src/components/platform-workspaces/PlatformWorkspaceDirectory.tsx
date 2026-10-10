"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import type {
  PlatformWorkspaceDirectoryPageDto,
  PlatformWorkspaceDirectoryRowDto,
  PlatformWorkspaceStatus,
} from "@/contracts";
import { platformWorkspaceStatuses } from "@/contracts";
import { getLocaleDirection, type Locale } from "@/i18n/locales";
import { isApiError } from "@/lib/api";
import { useAuthSession } from "@/lib/auth";
import {
  formatInstantInTimeZone,
  parseIanaTimeZone,
  parseOffsetTimestamp,
} from "@/lib/date-time";
import { usePlatformAuthority } from "@/lib/platform-access";
import {
  listPlatformWorkspaces,
  platformWorkspaceDirectoryKeys,
  platformWorkspacePageLimit,
} from "@/lib/platform-workspaces";
import type { AppQueryKey } from "@/lib/server-state";
import styles from "./platform-workspace-directory.module.css";

const platformWorkspaceDirectoryTimeZone = parseIanaTimeZone("UTC");

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
  filteredEmpty: string;
  errors: {
    cursor: string;
    denied: string;
    forbidden: string;
    loadMore: string;
    malformed: string;
    unavailable: string;
    validation: string;
  };
  loading: string;
  search: {
    allStatuses: string;
    apply: string;
    clear: string;
    label: string;
    placeholder: string;
    statusLabel: string;
    tooLong: string;
    viewDetails: string;
  };
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
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const committedQ = cleanCommittedQuery(searchParams.get("q"));
  const rawStatus = searchParams.get("status");
  const committedStatus = isPlatformWorkspaceStatus(rawStatus)
    ? rawStatus
    : undefined;
  const [searchInput, setSearchInput] = useState(committedQ ?? "");
  const [searchValidation, setSearchValidation] = useState<string | null>(null);
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
      ...(committedQ === undefined ? {} : { q: committedQ }),
      sessionGeneration: authority.sessionGeneration,
      ...(committedStatus === undefined ? {} : { status: committedStatus }),
    }),
    [
      authority.accessVersion,
      authority.membershipId,
      authority.principalId,
      authority.sessionGeneration,
      authority.validUntil,
      committedQ,
      committedStatus,
    ],
  );
  const queryKey = useMemo(
    () => platformWorkspaceDirectoryKeys.list(identity),
    [identity],
  );
  const identityToken = JSON.stringify(queryKey);

  useEffect(() => {
    // Identity changes must retire a denial that belonged to the old authority.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDomainDenied(false);
    handledError.current = null;
  }, [identityToken]);

  useEffect(() => {
    // Applied URL state is authoritative when navigation changes externally.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchInput(committedQ ?? "");
    setSearchValidation(null);
  }, [committedQ]);

  useEffect(() => {
    if (rawStatus === null || committedStatus !== undefined) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("status");
    next.delete("cursor");
    router.replace(routeWithQuery(pathname, next));
  }, [committedStatus, pathname, rawStatus, router, searchParams]);

  useEffect(
    () => () => {
      queryClient.removeQueries({ exact: true, queryKey });
    },
    [queryClient, queryKey],
  );

  const directory = useInfiniteQuery<
    PlatformWorkspaceDirectoryPageDto,
    unknown,
    InfiniteData<PlatformWorkspaceDirectoryPageDto, string | undefined>,
    AppQueryKey,
    string | undefined
  >({
    enabled: authorized && !domainDenied,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore ? lastPage.meta.nextCursor! : undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      listPlatformWorkspaces(
        apiClient,
        {
          ...(pageParam === undefined ? {} : { cursor: pageParam }),
          ...(committedQ === undefined ? {} : { q: committedQ }),
          ...(committedStatus === undefined ? {} : { status: committedStatus }),
        },
        signal,
      ),
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
      // The asynchronous domain response is the source of this local denial.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  function commitFilters(
    q: string | undefined,
    status: PlatformWorkspaceStatus | undefined,
  ) {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("cursor");
    if (q === undefined) next.delete("q");
    else next.set("q", q);
    if (status === undefined) next.delete("status");
    else next.set("status", status);
    router.replace(routeWithQuery(pathname, next));
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQ = cleanCommittedQuery(searchInput);
    if (nextQ !== undefined && normalizedCodePointLength(nextQ) > 64) {
      setSearchValidation(labels.search.tooLong);
      return;
    }
    setSearchValidation(null);
    commitFilters(nextQ, committedStatus);
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
      <form className={styles.filters} onSubmit={submitSearch}>
        <label className={styles.control}>
          <span>{labels.search.label}</span>
          <input
            aria-invalid={searchValidation !== null || undefined}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={labels.search.placeholder}
            type="search"
            value={searchInput}
          />
        </label>
        <label className={styles.control}>
          <span>{labels.search.statusLabel}</span>
          <select
            onChange={(event) =>
              commitFilters(
                committedQ,
                isPlatformWorkspaceStatus(event.target.value)
                  ? event.target.value
                  : undefined,
              )
            }
            value={committedStatus ?? ""}
          >
            <option value="">{labels.search.allStatuses}</option>
            {platformWorkspaceStatuses.map((status) => (
              <option key={status} value={status}>
                {labels.statuses[status]}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.filterActions}>
          <button type="submit">{labels.search.apply}</button>
          <button
            disabled={committedQ === undefined && searchInput.length === 0}
            onClick={() => {
              setSearchInput("");
              setSearchValidation(null);
              commitFilters(undefined, committedStatus);
            }}
            type="button"
          >
            {labels.search.clear}
          </button>
        </div>
        {searchValidation === null ? null : (
          <p className={styles.error} role="alert">
            {searchValidation}
          </p>
        )}
      </form>
      {chain.rows.length === 0 ? (
        <p className={styles.empty} role="status">
          {committedQ !== undefined || committedStatus !== undefined
            ? labels.filteredEmpty
            : labels.empty}
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
                    <Link
                      className={styles.workspaceLink}
                      href={detailHref(
                        workspace.id,
                        committedQ,
                        committedStatus,
                      )}
                    >
                      {workspace.name}
                      <span className={styles.visuallyHidden}>
                        {` — ${labels.search.viewDetails}`}
                      </span>
                    </Link>
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
  return formatInstantInTimeZone(
    parseOffsetTimestamp(timestamp),
    locale,
    platformWorkspaceDirectoryTimeZone,
  );
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
  if (isApiError(error) && error.category === "validation") {
    return labels.errors.validation;
  }
  return continuation ? labels.errors.loadMore : labels.errors.unavailable;
}

function cleanCommittedQuery(value: string | null): string | undefined {
  const trimmed = value?.trim() ?? "";
  return trimmed.length === 0 ? undefined : trimmed;
}

function normalizedCodePointLength(value: string): number {
  return Array.from(value.trim().replace(/\s+/gu, " ")).length;
}

function isPlatformWorkspaceStatus(
  value: string | null,
): value is PlatformWorkspaceStatus {
  return (
    value !== null &&
    (platformWorkspaceStatuses as readonly string[]).includes(value)
  );
}

function routeWithQuery(pathname: string, query: URLSearchParams): string {
  const value = query.toString();
  return value.length === 0 ? pathname : `${pathname}?${value}`;
}

function detailHref(
  workspaceId: string,
  q: string | undefined,
  status: PlatformWorkspaceStatus | undefined,
): string {
  const query = new URLSearchParams();
  if (q !== undefined) query.set("q", q);
  if (status !== undefined) query.set("status", status);
  return routeWithQuery(`/platform/workspaces/${workspaceId}`, query);
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
