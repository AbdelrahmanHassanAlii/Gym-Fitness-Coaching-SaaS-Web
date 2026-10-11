"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PlatformWorkspaceOwnerDto, WorkspaceId } from "@/contracts";
import { createIdempotencyKey, isApiError } from "@/lib/api";
import { useAuthSession } from "@/lib/auth";
import { usePlatformAuthority } from "@/lib/platform-access";
import {
  getPlatformWorkspaceManagementState,
  platformWorkspaceDirectoryKeys,
  platformWorkspaceLifecycleActions,
  reassignPlatformWorkspaceOwner,
  transitionPlatformWorkspaceLifecycle,
  type PlatformWorkspaceLifecycleCommand,
} from "@/lib/platform-workspaces";
import { useProtectedAsyncEpoch } from "@/lib/platform-workspaces/use-protected-async-epoch";
import { OwnerIdentity, OwnerPicker } from "./OwnerPicker";
import type { PlatformWorkspaceManagementLabels } from "./PlatformWorkspaceCreate";
import styles from "./platform-workspace-management.module.css";

type Intent =
  | {
      key: string;
      kind: "owner";
      owner: PlatformWorkspaceOwnerDto;
      version: number;
    }
  | { key: string; kind: PlatformWorkspaceLifecycleCommand; version: number };

export function PlatformWorkspaceManagement({
  labels,
  workspaceId,
}: {
  labels: PlatformWorkspaceManagementLabels;
  workspaceId: string;
}) {
  const authority = usePlatformAuthority();
  const { apiClient, markSessionExpired } = useAuthSession();
  const queryClient = useQueryClient();
  const [denied, setDenied] = useState(false);
  const [dialog, setDialog] = useState<
    "owner" | PlatformWorkspaceLifecycleCommand
  >();
  const [selectedOwner, setSelectedOwner] =
    useState<PlatformWorkspaceOwnerDto>();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ error?: string; success?: string }>(
    {},
  );
  const [retryIntent, setRetryIntent] = useState<Intent>();
  const dialogHeading = useRef<HTMLHeadingElement>(null);
  const dialogPanel = useRef<HTMLDivElement>(null);
  const dialogTrigger = useRef<HTMLButtonElement | null>(null);
  const validId = /^[0-9a-f]{24}$/.test(workspaceId);
  const authorized = authority.allows("platform_workspaces.manage") && !denied;
  const identity = useMemo(
    () => ({
      accessVersion: authority.accessVersion,
      authorityValidUntil: authority.validUntil,
      membershipId: authority.membershipId,
      principalId: authority.principalId,
      sessionGeneration: authority.sessionGeneration,
      workspaceId: workspaceId as WorkspaceId,
    }),
    [
      authority.accessVersion,
      authority.membershipId,
      authority.principalId,
      authority.sessionGeneration,
      authority.validUntil,
      workspaceId,
    ],
  );
  const queryKey = useMemo(
    () => platformWorkspaceDirectoryKeys.management(identity),
    [identity],
  );
  const identityToken = JSON.stringify(queryKey);
  const latestIdentity = useRef(identityToken);
  const asyncEpoch = useProtectedAsyncEpoch(identityToken);
  useEffect(() => {
    latestIdentity.current = identityToken;
  }, [identityToken]);
  const state = useQuery({
    enabled: authorized && validId,
    queryFn: ({ signal }) =>
      getPlatformWorkspaceManagementState(
        apiClient,
        workspaceId as WorkspaceId,
        signal,
      ),
    queryKey,
    retry: false,
  });
  const retire = useCallback(() => {
    asyncEpoch.invalidate();
    dialogTrigger.current = null;
    setDenied(true);
    setDialog(undefined);
    setSelectedOwner(undefined);
    setRetryIntent(undefined);
    setMessage({});
    setPending(false);
    void queryClient.cancelQueries({ exact: true, queryKey });
    queryClient.removeQueries({ exact: true, queryKey });
    void authority.refresh();
  }, [asyncEpoch, authority, queryClient, queryKey]);
  const closeDialog = useCallback(() => {
    const trigger = dialogTrigger.current;
    setDialog(undefined);
    setSelectedOwner(undefined);
    queueMicrotask(() => {
      if (trigger?.isConnected) trigger.focus();
    });
  }, []);

  useEffect(
    () => () => {
      queryClient.removeQueries({ exact: true, queryKey });
    },
    [queryClient, queryKey],
  );
  useEffect(() => {
    // Authority identity changes retire state associated with the previous identity.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDenied(false);
    dialogTrigger.current = null;
    setDialog(undefined);
    setSelectedOwner(undefined);
    setRetryIntent(undefined);
    setMessage({});
    setPending(false);
  }, [identityToken]);
  useEffect(() => {
    if (!dialog) return;
    queueMicrotask(() => dialogHeading.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) {
        event.preventDefault();
        closeDialog();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = dialogPanel.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) {
        event.preventDefault();
        dialogHeading.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !panel.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !panel.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeDialog, dialog, pending]);
  useEffect(() => {
    const error = state.error;
    if (isApiError(error) && error.category === "unauthenticated")
      markSessionExpired(error);
    if (isApiError(error) && error.status === 403) {
      // A Backend 403 establishes the local domain-denial state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      retire();
    }
  }, [markSessionExpired, retire, state.error]);

  async function refreshServerState(epoch: number) {
    if (!asyncEpoch.isCurrent(epoch)) return false;
    await Promise.all([
      state.refetch(),
      queryClient.invalidateQueries({
        queryKey: platformWorkspaceDirectoryKeys.all,
        predicate: (query) =>
          query.queryKey[2] === "directory" ||
          (query.queryKey[2] === "detail" &&
            (query.queryKey[3] as { workspaceId?: string })?.workspaceId ===
              workspaceId),
      }),
    ]);
    return asyncEpoch.isCurrent(epoch);
  }
  async function run(intent: Intent) {
    if (pending || !state.data) return;
    const startedEpoch = asyncEpoch.capture();
    if (startedEpoch === undefined) return;
    const startedIdentity = latestIdentity.current;
    setPending(true);
    setMessage({});
    try {
      if (intent.kind === "owner")
        await reassignPlatformWorkspaceOwner(
          apiClient,
          workspaceId as WorkspaceId,
          { ownerUserId: intent.owner.id, expectedVersion: intent.version },
          intent.key,
        );
      else
        await transitionPlatformWorkspaceLifecycle(
          apiClient,
          workspaceId as WorkspaceId,
          intent.kind,
          intent.version,
          intent.key,
        );
      if (
        startedIdentity !== latestIdentity.current ||
        !asyncEpoch.isCurrent(startedEpoch)
      )
        return;
      setRetryIntent(undefined);
      closeDialog();
      if (!(await refreshServerState(startedEpoch))) return;
      setMessage({
        success:
          intent.kind === "owner"
            ? labels.success.ownerChanged
            : labels.success.lifecycle,
      });
    } catch (error) {
      if (
        startedIdentity !== latestIdentity.current ||
        !asyncEpoch.isCurrent(startedEpoch)
      )
        return;
      if (isApiError(error) && error.status === 403) {
        retire();
        return;
      }
      if (
        isApiError(error) &&
        (error.code === "WORKSPACE_VERSION_CONFLICT" ||
          error.code === "INVALID_WORKSPACE_STATUS_TRANSITION")
      ) {
        setRetryIntent(undefined);
        closeDialog();
        if (!(await refreshServerState(startedEpoch))) return;
        setMessage({
          error:
            error.code === "WORKSPACE_VERSION_CONFLICT"
              ? labels.errors.conflict
              : labels.errors.invalidTransition,
        });
        return;
      }
      if (isApiError(error) && error.category === "idempotency-conflict") {
        setRetryIntent(undefined);
        closeDialog();
        setMessage({ error: labels.errors.idempotency });
        return;
      }
      setRetryIntent(intent);
      setMessage({
        error:
          isApiError(error) && error.status === 400
            ? labels.errors.validation
            : labels.errors.unavailable,
      });
    } finally {
      if (asyncEpoch.isCurrent(startedEpoch)) setPending(false);
    }
  }
  function confirm() {
    const current = state.data?.data;
    if (!current || !dialog) return;
    if (dialog === "owner") {
      if (!selectedOwner || selectedOwner.id === current.owner.id) return;
      void run({
        key: createIdempotencyKey(),
        kind: "owner",
        owner: selectedOwner,
        version: current.workspace.version,
      });
    } else
      void run({
        key: createIdempotencyKey(),
        kind: dialog,
        version: current.workspace.version,
      });
  }

  if (!authorized)
    return (
      <section className={styles.management}>
        <h2>{labels.managementTitle}</h2>
        <p role="alert">{labels.errors.forbidden}</p>
      </section>
    );
  if (!validId || (isApiError(state.error) && state.error.status === 404))
    return (
      <section className={styles.management}>
        <h2>{labels.managementTitle}</h2>
        <p role="alert">{labels.errors.notFound}</p>
      </section>
    );
  if (state.isPending)
    return (
      <section aria-busy="true" className={styles.management}>
        <h2>{labels.managementTitle}</h2>
        <p role="status">{labels.loadingManagement}</p>
      </section>
    );
  if (!state.data)
    return (
      <section className={styles.management}>
        <h2>{labels.managementTitle}</h2>
        <p role="alert">
          {isApiError(state.error) && state.error.kind === "malformed-response"
            ? labels.errors.malformed
            : labels.errors.unavailable}
        </p>
        <button onClick={() => void state.refetch()} type="button">
          {labels.actions.retry}
        </button>
      </section>
    );
  const current = state.data.data;
  const openDialog = (
    value: "owner" | PlatformWorkspaceLifecycleCommand,
    trigger: HTMLButtonElement,
  ) => {
    dialogTrigger.current = trigger;
    setDialog(value);
  };
  return (
    <section
      className={styles.management}
      aria-labelledby="workspace-management-title"
    >
      <div inert={dialog ? true : undefined}>
        <h2 id="workspace-management-title">{labels.managementTitle}</h2>
        <dl className={styles.currentOwner}>
          <dt>{labels.fields.currentOwner}</dt>
          <dd>
            <OwnerIdentity owner={current.owner} />
          </dd>
        </dl>
        <div className={styles.actions}>
          <button
            disabled={pending}
            onClick={(event) => openDialog("owner", event.currentTarget)}
            type="button"
          >
            {labels.actions.changeOwner}
          </button>
          {platformWorkspaceLifecycleActions(current.workspace.status).map(
            (command) => (
              <button
                className={command === "archive" ? styles.danger : undefined}
                disabled={pending}
                key={command}
                onClick={(event) => openDialog(command, event.currentTarget)}
                type="button"
              >
                {labels.actions[command]}
              </button>
            ),
          )}
        </div>
        {message.error ? (
          <p className={styles.error} role="alert">
            {message.error}
          </p>
        ) : null}
        {message.success ? (
          <p className={styles.success} role="status">
            {message.success}
          </p>
        ) : null}
        {message.error && retryIntent ? (
          <button
            disabled={pending}
            onClick={() => void run(retryIntent)}
            type="button"
          >
            {labels.actions.retry}
          </button>
        ) : null}
      </div>
      {dialog ? (
        <div
          className={styles.dialog}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pending) closeDialog();
          }}
        >
          <div
            aria-labelledby="workspace-management-dialog-title"
            aria-modal="true"
            className={styles.dialogPanel}
            ref={dialogPanel}
            role="dialog"
          >
            <h3
              id="workspace-management-dialog-title"
              ref={dialogHeading}
              tabIndex={-1}
            >
              {dialog === "owner"
                ? labels.actions.changeOwner
                : labels.actions[dialog]}
            </h3>
            <p>{labels.confirmations[dialog]}</p>
            {dialog === "owner" ? (
              <OwnerPicker
                labels={labels.ownerPicker}
                onForbidden={retire}
                onSelect={setSelectedOwner}
                selected={selectedOwner}
              />
            ) : null}
            <div className={styles.dialogActions}>
              <button
                disabled={
                  pending ||
                  (dialog === "owner" &&
                    (!selectedOwner || selectedOwner.id === current.owner.id))
                }
                onClick={confirm}
                type="button"
              >
                {labels.actions.confirm}
              </button>
              <button disabled={pending} onClick={closeDialog} type="button">
                {labels.actions.cancel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
