"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { NotificationCategory, NotificationDto } from "@/contracts";
import { isCurrentAccessIdentity } from "@/lib/access";
import { isApiError } from "@/lib/api";
import { useAuthSession } from "@/lib/auth";
import {
  formatInstantInTimeZone,
  parseIanaTimeZone,
  parseOffsetTimestamp,
} from "@/lib/date-time";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationCommandRegistry,
  notificationKeys,
  notificationsPageLimit,
} from "@/lib/notifications";
import {
  createStaffNavigation,
  type StaffShellNavItemId,
  useStaffWorkspaceContext,
} from "@/lib/staff-shell";
import { MarkAllReadDialog } from "./MarkAllReadDialog";
import { NotificationList } from "./NotificationList";
import styles from "./notifications.module.css";

export interface NotificationsLabels {
  actions: {
    cancel: string;
    confirmMarkAll: string;
    loadMore: string;
    markAll: string;
    markRead: string;
    openDestination: string;
    refresh: string;
  };
  categories: Record<NotificationCategory, string>;
  confirm: { message: string; title: string };
  deliveryExplanation: string;
  empty: { all: string; unread: string };
  errors: {
    access: string;
    capacity: string;
    cursor: string;
    denied: string;
    malformed: string;
    markAllAmbiguous: string;
    markOneAmbiguous: string;
    notFound: string;
    support: string;
    unavailable: string;
  };
  globalInbox: string;
  loading: string;
  loadingMore: string;
  moreMayExist: string;
  navigation: { unavailable: string; wrongWorkspace: string };
  dateLabel: string;
  status: { pending: string; read: string; unread: string };
  success: { markedAll: string; markedOne: string };
  tabs: { all: string; unread: string };
  title: string;
  unreadLoaded: string;
}

type Filter = "all" | "unread";
interface LoadedNotificationChain {
  items: NotificationDto[];
  nextCursor: string | null;
  pagesLoaded: number;
}

const pollIntervalMs = 60_000;
const navLabels = Object.fromEntries(
  [
    "overview",
    "workspace",
    "staff",
    "leads",
    "relationships",
    "training",
    "nutrition",
    "progress",
    "documents",
    "notifications",
    "analytics",
  ].map((id) => [id, { description: id, title: id }]),
) as Record<StaffShellNavItemId, { description: string; title: string }>;

export function NotificationsExperience({
  labels,
  locale,
}: {
  labels: NotificationsLabels;
  locale: "ar" | "en";
}) {
  const { generation, state } = useAuthSession();
  const { shellContext, workspace } = useStaffWorkspaceContext();
  const principalId = state.status === "authenticated" ? state.user.id : null;
  return (
    <NotificationsContent
      key={JSON.stringify([
        principalId,
        generation,
        workspace?.workspaceId,
        workspace?.membershipId,
        shellContext?.accessContext,
        workspace?.accessVersion,
      ])}
      labels={labels}
      locale={locale}
    />
  );
}

function NotificationsContent({
  labels,
  locale,
}: {
  labels: NotificationsLabels;
  locale: "ar" | "en";
}) {
  const { apiClient, generation, state } = useAuthSession();
  const { accessFacts, shellContext, workspace } = useStaffWorkspaceContext();
  const [filter, setFilter] = useState<Filter>("all");
  const [loadedChain, setLoadedChain] = useState<LoadedNotificationChain>({
    items: [],
    nextCursor: null,
    pagesLoaded: 0,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [markAllPending, setMarkAllPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const paginationGenerationRef = useRef(0);
  const reconciliationGenerationRef = useRef(0);
  const lastFirstPageAtRef = useRef(0);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const principalId = state.status === "authenticated" ? state.user.id : null;
  const currentIdentity = Boolean(
    principalId &&
    workspace &&
    shellContext &&
    accessFacts?.status === "ready" &&
    shellContext.accessContext === "user" &&
    isCurrentAccessIdentity(accessFacts, {
      accessContext: shellContext.accessContext,
      membershipId: workspace.membershipId,
      sessionGeneration: generation,
      workspaceId: workspace.workspaceId,
    }),
  );
  const identityToken = currentIdentity
    ? JSON.stringify([
        principalId,
        generation,
        workspace!.workspaceId,
        workspace!.membershipId,
        shellContext!.accessContext,
        workspace!.accessVersion ?? null,
      ])
    : "unresolved";
  const identityRef = useRef(identityToken);
  useEffect(() => {
    identityRef.current = identityToken;
  }, [identityToken]);
  const unread = filter === "unread";
  const queryIdentity = currentIdentity
    ? {
        accessContext: shellContext!.accessContext,
        accessVersion: workspace!.accessVersion ?? null,
        cursor: null,
        limit: notificationsPageLimit,
        membershipId: workspace!.membershipId,
        principalId: principalId!,
        sessionGeneration: generation,
        unread,
        workspaceId: workspace!.workspaceId,
      }
    : null;

  const firstPage = useQuery({
    enabled: currentIdentity,
    queryFn: async ({ signal }) => {
      const reconciliationGeneration = reconciliationGenerationRef.current;
      const page = await listNotifications(
        apiClient,
        { limit: notificationsPageLimit, ...(unread ? { unread: true } : {}) },
        signal,
      );
      lastFirstPageAtRef.current = Date.now();
      return { page, reconciliationGeneration };
    },
    queryKey: queryIdentity
      ? notificationKeys.list(queryIdentity)
      : ["notifications", "disabled", identityToken, filter],
    retry: false,
  });

  const resetFilter = (next: Filter) => {
    if (next === filter) return;
    paginationGenerationRef.current += 1;
    reconciliationGenerationRef.current += 1;
    setLoadedChain({ items: [], nextCursor: null, pagesLoaded: 0 });
    setError(null);
    setMessage(null);
    setFilter(next);
  };

  const refetchFirstPage = useCallback(async () => {
    if (!currentIdentity) return;
    const captured = identityToken;
    const result = await firstPage.refetch();
    if (!mountedRef.current || identityRef.current !== captured) return;
    if (result.error) setError(errorMessage(result.error, labels));
  }, [currentIdentity, firstPage, identityToken, labels]);

  useEffect(() => {
    if (!currentIdentity) return;
    const maybeRefresh = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastFirstPageAtRef.current >= pollIntervalMs
      )
        void refetchFirstPage();
    };
    const interval = window.setInterval(maybeRefresh, pollIntervalMs);
    document.addEventListener("visibilitychange", maybeRefresh);
    window.addEventListener("focus", maybeRefresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", maybeRefresh);
      window.removeEventListener("focus", maybeRefresh);
    };
  }, [currentIdentity, refetchFirstPage]);

  useEffect(() => {
    const result = firstPage.data;
    if (
      !result ||
      result.reconciliationGeneration !== reconciliationGenerationRef.current
    )
      return;
    setLoadedChain((current) => ({
      items: reconcileAuthoritativeItems(current.items, result.page.data),
      nextCursor:
        current.pagesLoaded > 1
          ? current.nextCursor
          : result.page.page.nextCursor,
      pagesLoaded: Math.max(1, current.pagesLoaded),
    }));
  }, [firstPage.data]);

  const notifications = loadedChain.items;
  const nextCursor = loadedChain.nextCursor;
  const loadedUnread = notifications.filter(
    (item) => item.readAt === null,
  ).length;

  async function loadMore() {
    if (!currentIdentity || loadingMore || nextCursor === null) return;
    const capturedIdentity = identityToken;
    const capturedPagination = paginationGenerationRef.current;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await listNotifications(apiClient, {
        cursor: nextCursor,
        limit: notificationsPageLimit,
        ...(unread ? { unread: true } : {}),
      });
      if (
        !mountedRef.current ||
        identityRef.current !== capturedIdentity ||
        paginationGenerationRef.current !== capturedPagination
      )
        return;
      setLoadedChain((current) => ({
        items: appendOlderItems(current.items, page.data),
        nextCursor: page.page.nextCursor,
        pagesLoaded: current.pagesLoaded + 1,
      }));
    } catch (loadError) {
      if (!mountedRef.current || identityRef.current !== capturedIdentity)
        return;
      if (isCursorError(loadError)) {
        paginationGenerationRef.current += 1;
        reconciliationGenerationRef.current += 1;
        setLoadedChain({ items: [], nextCursor: null, pagesLoaded: 0 });
        setError(labels.errors.cursor);
        await refetchFirstPage();
      } else setError(errorMessage(loadError, labels));
    } finally {
      if (mountedRef.current && identityRef.current === capturedIdentity)
        setLoadingMore(false);
    }
  }

  const boundary = currentIdentity
    ? {
        accessContext: shellContext!.accessContext,
        membershipId: workspace!.membershipId,
        principalId: principalId!,
        workspaceId: workspace!.workspaceId,
      }
    : null;

  const persistedAmbiguity = boundary
    ? notificationCommandRegistry.hasAmbiguous(boundary, "mark-all")
      ? labels.errors.markAllAmbiguous
      : notificationCommandRegistry.hasAmbiguous(boundary, "mark-one")
        ? labels.errors.markOneAmbiguous
        : null
    : null;
  const effectivePendingIds = new Set(pendingIds);
  if (boundary) {
    for (const notification of notifications) {
      const logicalId = notificationCommandRegistry.logicalId(
        boundary,
        "mark-one",
        notification.id,
      );
      if (notificationCommandRegistry.status(logicalId) === "pending") {
        effectivePendingIds.add(notification.id);
      }
    }
  }
  const registryMarkAllPending = boundary
    ? notificationCommandRegistry.status(
        notificationCommandRegistry.logicalId(boundary, "mark-all"),
      ) === "pending"
    : false;

  async function markOne(notification: NotificationDto) {
    if (
      !boundary ||
      pendingIds.has(notification.id) ||
      notification.readAt !== null
    )
      return;
    const logicalId = notificationCommandRegistry.logicalId(
      boundary,
      "mark-one",
      notification.id,
    );
    const begin = notificationCommandRegistry.begin(logicalId);
    if (begin === "duplicate") return;
    if (begin === "capacity") {
      setError(labels.errors.capacity);
      return;
    }
    const captured = identityToken;
    setPendingIds((current) => new Set(current).add(notification.id));
    setError(null);
    try {
      const authoritative = await markNotificationRead(
        apiClient,
        notification.id,
      );
      notificationCommandRegistry.retire(logicalId);
      if (!mountedRef.current || identityRef.current !== captured) return;
      reconciliationGenerationRef.current += 1;
      setLoadedChain((current) => ({
        ...current,
        items:
          unread && authoritative.readAt !== null
            ? current.items.filter((item) => item.id !== authoritative.id)
            : replaceLoadedItem(current.items, authoritative),
      }));
      setMessage(labels.success.markedOne);
      await refetchFirstPage();
    } catch (mutationError) {
      if (isAmbiguous(mutationError))
        notificationCommandRegistry.ambiguous(logicalId);
      else notificationCommandRegistry.retire(logicalId);
      if (!mountedRef.current || identityRef.current !== captured) return;
      if (isAmbiguous(mutationError)) {
        setError(labels.errors.markOneAmbiguous);
        await refetchFirstPage();
      } else {
        setError(errorMessage(mutationError, labels));
        if (isNotificationNotFound(mutationError)) {
          reconciliationGenerationRef.current += 1;
          setLoadedChain((current) => ({
            ...current,
            items: current.items.filter((item) => item.id !== notification.id),
          }));
          await refetchFirstPage();
        }
      }
    } finally {
      if (mountedRef.current && identityRef.current === captured)
        setPendingIds((current) => {
          const next = new Set(current);
          next.delete(notification.id);
          return next;
        });
    }
  }

  async function markAll() {
    if (!boundary || markAllPending) return;
    const logicalId = notificationCommandRegistry.logicalId(
      boundary,
      "mark-all",
    );
    const begin = notificationCommandRegistry.begin(logicalId);
    if (begin === "duplicate") return;
    if (begin === "capacity") {
      setError(labels.errors.capacity);
      return;
    }
    const captured = identityToken;
    setMarkAllPending(true);
    setError(null);
    try {
      const result = await markAllNotificationsRead(apiClient);
      notificationCommandRegistry.retire(logicalId);
      if (!mountedRef.current || identityRef.current !== captured) return;
      reconciliationGenerationRef.current += 1;
      setLoadedChain((current) => ({
        ...current,
        items: reconcileMarkAll(current.items, result.cutoffAt, unread),
      }));
      setConfirming(false);
      setMessage(`${labels.success.markedAll} ${result.affectedCount}`);
      await refetchFirstPage();
    } catch (mutationError) {
      if (isAmbiguous(mutationError))
        notificationCommandRegistry.ambiguous(logicalId);
      else notificationCommandRegistry.retire(logicalId);
      if (!mountedRef.current || identityRef.current !== captured) return;
      setConfirming(false);
      setError(
        isAmbiguous(mutationError)
          ? labels.errors.markAllAmbiguous
          : errorMessage(mutationError, labels),
      );
      if (isAmbiguous(mutationError)) await refetchFirstPage();
    } finally {
      if (mountedRef.current && identityRef.current === captured)
        setMarkAllPending(false);
    }
  }

  if (shellContext?.accessContext === "support")
    return <StatePanel message={labels.errors.support} />;
  if (!currentIdentity)
    return (
      <StatePanel
        message={
          accessFacts?.status === "error"
            ? labels.errors.access
            : labels.loading
        }
      />
    );

  const navigation = createStaffNavigation({
    accessFacts,
    context: shellContext!,
    labels: navLabels,
  });
  const destinationFor = (notification: NotificationDto) =>
    destination(notification, workspace!.workspaceId, navigation, labels);
  const timeZone = parseIanaTimeZone(workspace!.workspaceTimezone);
  const formatDate = (notification: NotificationDto) =>
    notification.workspaceId === workspace!.workspaceId
      ? formatInstantInTimeZone(
          parseOffsetTimestamp(notification.createdAt),
          locale,
          timeZone,
        )
      : new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(parseOffsetTimestamp(notification.createdAt)));
  const visibleError =
    error ??
    persistedAmbiguity ??
    (firstPage.error ? errorMessage(firstPage.error, labels) : null);

  return (
    <section className={styles.experience}>
      <header className={styles.header}>
        <div>
          <h1>{labels.title}</h1>
          <p>{labels.globalInbox}</p>
        </div>
        <div className={styles.actions}>
          <button
            disabled={firstPage.isFetching}
            onClick={() => void refetchFirstPage()}
            type="button"
          >
            {labels.actions.refresh}
          </button>
          <button
            disabled={
              markAllPending || registryMarkAllPending || loadedUnread === 0
            }
            onClick={() => setConfirming(true)}
            type="button"
          >
            {labels.actions.markAll}
          </button>
        </div>
      </header>
      <p className={styles.explanation}>{labels.deliveryExplanation}</p>
      <div className={styles.tabs} role="tablist">
        <button
          aria-selected={filter === "all"}
          onClick={() => resetFilter("all")}
          role="tab"
          type="button"
        >
          {labels.tabs.all}
        </button>
        <button
          aria-selected={filter === "unread"}
          onClick={() => resetFilter("unread")}
          role="tab"
          type="button"
        >
          {labels.tabs.unread}
        </button>
      </div>
      <p>
        {labels.unreadLoaded.replace(
          "{count}",
          new Intl.NumberFormat(locale).format(loadedUnread),
        )}
      </p>
      {nextCursor !== null ? <p>{labels.moreMayExist}</p> : null}
      {message ? (
        <p aria-live="polite" className={styles.success}>
          {message}
        </p>
      ) : null}
      {visibleError ? (
        <p role="alert" className={styles.error}>
          {visibleError}
        </p>
      ) : null}
      {firstPage.isLoading ? <p aria-busy="true">{labels.loading}</p> : null}
      {!firstPage.isLoading && notifications.length === 0 ? (
        <p>{filter === "unread" ? labels.empty.unread : labels.empty.all}</p>
      ) : null}
      <NotificationList
        categoryLabel={(item) => labels.categories[item.category]}
        destinationFor={destinationFor}
        formatDate={formatDate}
        labels={{
          dateLabel: labels.dateLabel,
          markRead: labels.actions.markRead,
          openDestination: labels.actions.openDestination,
          pending: labels.status.pending,
          read: labels.status.read,
          unread: labels.status.unread,
        }}
        notifications={notifications}
        onMarkRead={(item) => void markOne(item)}
        pendingIds={effectivePendingIds}
      />
      {nextCursor !== null ? (
        <button
          disabled={loadingMore}
          onClick={() => void loadMore()}
          type="button"
        >
          {loadingMore ? labels.loadingMore : labels.actions.loadMore}
        </button>
      ) : null}
      {confirming ? (
        <MarkAllReadDialog
          cancel={labels.actions.cancel}
          confirm={labels.actions.confirmMarkAll}
          message={labels.confirm.message}
          onCancel={() => {
            if (!markAllPending) setConfirming(false);
          }}
          onConfirm={() => void markAll()}
          pending={markAllPending}
          title={labels.confirm.title}
        />
      ) : null}
    </section>
  );
}

function StatePanel({ message }: { message: string }) {
  return (
    <section className={styles.state}>
      <p>{message}</p>
    </section>
  );
}

function sortNotifications(
  items: Iterable<NotificationDto>,
): NotificationDto[] {
  return [...items].sort(
    (left, right) =>
      new Date(parseOffsetTimestamp(right.createdAt)).getTime() -
        new Date(parseOffsetTimestamp(left.createdAt)).getTime() ||
      right.id.localeCompare(left.id),
  );
}

function reconcileAuthoritativeItems(
  current: readonly NotificationDto[],
  authoritative: readonly NotificationDto[],
): NotificationDto[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of authoritative) byId.set(item.id, item);
  return sortNotifications(byId.values());
}

function appendOlderItems(
  current: readonly NotificationDto[],
  older: readonly NotificationDto[],
): NotificationDto[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of older) if (!byId.has(item.id)) byId.set(item.id, item);
  return sortNotifications(byId.values());
}

function replaceLoadedItem(
  current: readonly NotificationDto[],
  authoritative: NotificationDto,
): NotificationDto[] {
  return sortNotifications(
    current.map((item) =>
      item.id === authoritative.id ? authoritative : item,
    ),
  );
}

function reconcileMarkAll(
  current: readonly NotificationDto[],
  cutoffAt: string,
  unreadOnly: boolean,
): NotificationDto[] {
  const cutoff = new Date(parseOffsetTimestamp(cutoffAt)).getTime();
  const reconciled = current.map((item) =>
    item.readAt === null &&
    new Date(parseOffsetTimestamp(item.createdAt)).getTime() <= cutoff
      ? { ...item, readAt: cutoffAt }
      : item,
  );
  return sortNotifications(
    unreadOnly ? reconciled.filter((item) => item.readAt === null) : reconciled,
  );
}

function destination(
  notification: NotificationDto,
  workspaceId: string,
  navigation: ReturnType<typeof createStaffNavigation>,
  labels: NotificationsLabels,
): { href: string | null; reason: string | null } {
  if (notification.workspaceId && notification.workspaceId !== workspaceId) {
    return { href: null, reason: labels.navigation.wrongWorkspace };
  }
  const navByType: Record<string, StaffShellNavItemId> = {
    PROGRAM_ACTIVATED: "training",
    PROGRAM_UPDATED: "training",
    WORKOUT_COMPLETED: "training",
    WORKOUT_CORRECTED: "training",
    NUTRITION_PLAN_ACTIVATED: "nutrition",
    NUTRITION_PLAN_UPDATED: "nutrition",
    CHECK_IN_DUE: "progress",
    CHECK_IN_OVERDUE: "progress",
    CHECK_IN_SUBMITTED: "progress",
    CHECK_IN_REVIEWED: "progress",
    DOCUMENT_UPLOADED: "documents",
    TRAINEE_NEEDS_REASSIGNMENT: "relationships",
    SUBSCRIPTION_CHANGED: "leads",
    PERMISSION_CHANGED: "workspace",
  };
  const id = navByType[notification.notificationType];
  const item = id
    ? navigation.find((candidate) => candidate.id === id)
    : undefined;
  if (!id) return { href: null, reason: null };
  return item?.status === "allowed" && item.href
    ? { href: item.href, reason: null }
    : { href: null, reason: labels.navigation.unavailable };
}

function isAmbiguous(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (isApiError(error) &&
      (error.kind === "network" ||
        (error.kind === "backend" && (error.status ?? 0) >= 500)))
  );
}
function isCursorError(error: unknown): boolean {
  return (
    isApiError(error) &&
    error.kind === "backend" &&
    error.code === "CURSOR_INVALID" &&
    (error.status === 404 || error.status === 422)
  );
}
function isNotificationNotFound(error: unknown): boolean {
  return (
    isApiError(error) &&
    error.kind === "backend" &&
    error.code === "NOTIFICATION_NOT_FOUND"
  );
}
function errorMessage(error: unknown, labels: NotificationsLabels): string {
  if (!isApiError(error)) return labels.errors.unavailable;
  if (error.kind === "malformed-response") return labels.errors.malformed;
  if (error.kind === "backend" && error.status === 403)
    return labels.errors.denied;
  if (isNotificationNotFound(error)) return labels.errors.notFound;
  return labels.errors.unavailable;
}
