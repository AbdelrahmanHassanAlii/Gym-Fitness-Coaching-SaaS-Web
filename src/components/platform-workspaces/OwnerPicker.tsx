"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import type {
  PlatformWorkspaceOwnerCandidatePageDto,
  PlatformWorkspaceOwnerDto,
} from "@/contracts";
import { isApiError } from "@/lib/api";
import { useAuthSession } from "@/lib/auth";
import { usePlatformAuthority } from "@/lib/platform-access";
import {
  listPlatformWorkspaceOwnerCandidates,
  platformOwnerCandidatePageLimit,
  platformWorkspaceDirectoryKeys,
} from "@/lib/platform-workspaces";
import type { AppQueryKey } from "@/lib/server-state";
import styles from "./platform-workspace-management.module.css";

export interface OwnerPickerLabels {
  search: string;
  searchPlaceholder: string;
  apply: string;
  clear: string;
  loading: string;
  empty: string;
  loadMore: string;
  loadingMore: string;
  retry: string;
  unavailable: string;
  forbidden: string;
  validation: string;
  select: string;
  selected: string;
}

export function OwnerPicker({
  labels,
  onForbidden,
  onSelect,
  selected,
}: {
  labels: OwnerPickerLabels;
  onForbidden: () => void;
  onSelect: (owner: PlatformWorkspaceOwnerDto) => void;
  selected?: PlatformWorkspaceOwnerDto;
}) {
  const authority = usePlatformAuthority();
  const { apiClient, markSessionExpired } = useAuthSession();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [q, setQ] = useState<string | undefined>();
  const handled = useRef<unknown>(null);
  const identity = useMemo(
    () => ({
      accessVersion: authority.accessVersion,
      authorityValidUntil: authority.validUntil,
      limit: platformOwnerCandidatePageLimit,
      membershipId: authority.membershipId,
      principalId: authority.principalId,
      ...(q ? { q } : {}),
      sessionGeneration: authority.sessionGeneration,
    }),
    [
      authority.accessVersion,
      authority.membershipId,
      authority.principalId,
      authority.sessionGeneration,
      authority.validUntil,
      q,
    ],
  );
  const queryKey = useMemo(
    () => platformWorkspaceDirectoryKeys.ownerCandidates(identity),
    [identity],
  );
  const owners = useInfiniteQuery<
    PlatformWorkspaceOwnerCandidatePageDto,
    unknown,
    InfiniteData<PlatformWorkspaceOwnerCandidatePageDto, string | undefined>,
    AppQueryKey,
    string | undefined
  >({
    getNextPageParam: (page) =>
      page.meta.hasMore ? page.meta.nextCursor! : undefined,
    initialPageParam: undefined,
    queryFn: ({ pageParam, signal }) =>
      listPlatformWorkspaceOwnerCandidates(
        apiClient,
        { ...(pageParam ? { cursor: pageParam } : {}), ...(q ? { q } : {}) },
        signal,
      ),
    queryKey,
    retry: false,
  });

  useEffect(
    () => () => {
      queryClient.removeQueries({ exact: true, queryKey });
    },
    [queryClient, queryKey],
  );
  useEffect(() => {
    const error = owners.error;
    if (!error || handled.current === error) return;
    handled.current = error;
    if (isApiError(error) && error.category === "unauthenticated")
      markSessionExpired(error);
    if (isApiError(error) && error.kind === "backend" && error.status === 403) {
      void queryClient.cancelQueries({ exact: true, queryKey });
      queryClient.removeQueries({ exact: true, queryKey });
      onForbidden();
      void authority.refresh();
    }
  }, [
    authority,
    markSessionExpired,
    onForbidden,
    owners.error,
    queryClient,
    queryKey,
  ]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = input.trim();
    setQ(next || undefined);
  }
  const rows = owners.data?.pages.flatMap((page) => page.data) ?? [];
  const initialError = owners.isError && owners.data === undefined;
  const continuationError = owners.isFetchNextPageError;
  const forbidden = isApiError(owners.error) && owners.error.status === 403;
  const message = owners.isPending
    ? labels.loading
    : initialError
      ? isApiError(owners.error) && owners.error.status === 400
        ? labels.validation
        : isApiError(owners.error) && owners.error.status === 403
          ? labels.forbidden
          : labels.unavailable
      : rows.length === 0
        ? labels.empty
        : null;

  return (
    <div className={styles.picker}>
      <form className={styles.pickerSearch} onSubmit={submit}>
        <label>
          <span>{labels.search}</span>
          <input
            onChange={(event) => setInput(event.target.value)}
            placeholder={labels.searchPlaceholder}
            type="email"
            value={input}
          />
        </label>
        <button type="submit">{labels.apply}</button>
        <button
          onClick={() => {
            setInput("");
            setQ(undefined);
          }}
          type="button"
        >
          {labels.clear}
        </button>
      </form>
      {selected ? (
        <p className={styles.selected} role="status">
          {labels.selected}: <OwnerIdentity owner={selected} />
        </p>
      ) : null}
      {message ? (
        <p aria-live="polite" role={initialError ? "alert" : "status"}>
          {message}
        </p>
      ) : null}
      {initialError && !forbidden ? (
        <button onClick={() => void owners.refetch()} type="button">
          {labels.retry}
        </button>
      ) : null}
      <ul className={styles.ownerList}>
        {rows.map((owner) => (
          <li key={owner.id}>
            <button
              aria-pressed={selected?.id === owner.id}
              onClick={() => onSelect(owner)}
              type="button"
            >
              <OwnerIdentity owner={owner} />
              <span>{labels.select}</span>
            </button>
          </li>
        ))}
      </ul>
      {owners.hasNextPage ? (
        <button
          disabled={owners.isFetchingNextPage}
          onClick={() => void owners.fetchNextPage()}
          type="button"
        >
          {owners.isFetchingNextPage ? labels.loadingMore : labels.loadMore}
        </button>
      ) : null}
      {continuationError ? (
        <>
          <p role="alert">{labels.unavailable}</p>
          <button onClick={() => void owners.fetchNextPage()} type="button">
            {labels.retry}
          </button>
        </>
      ) : null}
    </div>
  );
}

export function OwnerIdentity({ owner }: { owner: PlatformWorkspaceOwnerDto }) {
  return (
    <span>
      {[owner.displayName, owner.email].filter(Boolean).join(" — ") || owner.id}
    </span>
  );
}
