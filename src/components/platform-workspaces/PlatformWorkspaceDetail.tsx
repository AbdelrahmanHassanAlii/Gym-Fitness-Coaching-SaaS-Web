"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  PlatformWorkspaceStatus,
  WorkspaceId,
  WorkspaceType,
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
  getPlatformWorkspace,
  platformWorkspaceDirectoryKeys,
} from "@/lib/platform-workspaces";
import styles from "./platform-workspace-detail.module.css";

const objectIdPattern = /^[0-9a-f]{24}$/;
const utc = parseIanaTimeZone("UTC");

export interface PlatformWorkspaceDetailLabels {
  actions: { back: string; retry: string };
  errors: {
    denied: string;
    forbidden: string;
    malformed: string;
    notFound: string;
    unavailable: string;
  };
  fields: {
    city: string;
    country: string;
    createdAt: string;
    defaultLanguage: string;
    governorate: string;
    name: string;
    status: string;
    timezone: string;
    type: string;
  };
  languages: Record<"ar" | "en", string>;
  loading: string;
  sections: {
    configuration: string;
    location: string;
    metadata: string;
    workspace: string;
  };
  statuses: Record<PlatformWorkspaceStatus, string>;
  title: string;
  types: Record<WorkspaceType, string>;
}

export function PlatformWorkspaceDetail({
  labels,
  locale,
  workspaceId,
}: {
  labels: PlatformWorkspaceDetailLabels;
  locale: Locale;
  workspaceId: string;
}) {
  const authority = usePlatformAuthority();
  const { apiClient, markSessionExpired } = useAuthSession();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [domainDenied, setDomainDenied] = useState(false);
  const handledError = useRef<unknown>(null);
  const authorized = authority.allows("platform_workspaces.manage");
  const validWorkspaceId = objectIdPattern.test(workspaceId);
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
    () => platformWorkspaceDirectoryKeys.detail(identity),
    [identity],
  );
  const identityToken = JSON.stringify(queryKey);

  useEffect(() => {
    // Identity changes retire a denial associated with the previous authority.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDomainDenied(false);
    handledError.current = null;
  }, [identityToken]);

  useEffect(
    () => () => {
      queryClient.removeQueries({ exact: true, queryKey });
    },
    [queryClient, queryKey],
  );

  const detail = useQuery({
    enabled: authorized && validWorkspaceId && !domainDenied,
    queryFn: ({ signal }) =>
      getPlatformWorkspace(apiClient, workspaceId as WorkspaceId, signal),
    queryKey,
    retry: false,
  });

  useEffect(() => {
    const error = detail.error;
    if (error === null || error === handledError.current) return;
    handledError.current = error;
    if (isApiError(error) && error.category === "unauthenticated") {
      markSessionExpired(error);
      return;
    }
    if (isApiError(error) && error.kind === "backend" && error.status === 403) {
      // The Backend response establishes the local denial state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDomainDenied(true);
      void queryClient.cancelQueries({ exact: true, queryKey });
      queryClient.removeQueries({ exact: true, queryKey });
      void authority.refresh();
    }
  }, [authority, detail.error, markSessionExpired, queryClient, queryKey]);

  const backHref = directoryHref(searchParams);
  if (!authorized)
    return <State labels={labels} message={labels.errors.denied} />;
  if (domainDenied)
    return <State labels={labels} message={labels.errors.forbidden} />;
  if (!validWorkspaceId || isNotFound(detail.error)) {
    return (
      <State
        backHref={backHref}
        labels={labels}
        message={labels.errors.notFound}
      />
    );
  }
  if (detail.isPending) {
    return <State busy labels={labels} message={labels.loading} />;
  }
  if (detail.isError || detail.data === undefined) {
    return (
      <State
        backHref={backHref}
        labels={labels}
        message={
          isApiError(detail.error) && detail.error.kind === "malformed-response"
            ? labels.errors.malformed
            : labels.errors.unavailable
        }
        retry={() => void detail.refetch()}
      />
    );
  }

  const workspace = detail.data;
  return (
    <article
      aria-labelledby="platform-workspace-detail-title"
      className={styles.detail}
      dir={getLocaleDirection(locale)}
    >
      <Link className={styles.back} href={backHref}>
        {labels.actions.back}
      </Link>
      <header>
        <p className={styles.eyebrow}>{labels.title}</p>
        <h1 id="platform-workspace-detail-title">{workspace.name}</h1>
      </header>
      <DetailSection title={labels.sections.workspace}>
        <Fact label={labels.fields.name} value={workspace.name} />
        <Fact label={labels.fields.type} value={labels.types[workspace.type]} />
        <Fact
          label={labels.fields.status}
          value={labels.statuses[workspace.status]}
        />
      </DetailSection>
      <DetailSection title={labels.sections.configuration}>
        <Fact label={labels.fields.timezone} value={workspace.timezone} />
        <Fact
          label={labels.fields.defaultLanguage}
          value={labels.languages[workspace.defaultLanguage]}
        />
      </DetailSection>
      {workspace.country === undefined &&
      workspace.governorate === undefined &&
      workspace.city === undefined ? null : (
        <DetailSection title={labels.sections.location}>
          {workspace.country === undefined ? null : (
            <Fact label={labels.fields.country} value={workspace.country} />
          )}
          {workspace.governorate === undefined ? null : (
            <Fact
              label={labels.fields.governorate}
              value={workspace.governorate}
            />
          )}
          {workspace.city === undefined ? null : (
            <Fact label={labels.fields.city} value={workspace.city} />
          )}
        </DetailSection>
      )}
      <DetailSection title={labels.sections.metadata}>
        <div className={styles.fact}>
          <dt>{labels.fields.createdAt}</dt>
          <dd>
            <time dateTime={workspace.createdAt}>
              {formatInstantInTimeZone(
                parseOffsetTimestamp(workspace.createdAt),
                locale,
                utc,
              )}
            </time>
          </dd>
        </div>
      </DetailSection>
    </article>
  );
}

function DetailSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className={styles.section}>
      <h2>{title}</h2>
      <dl className={styles.facts}>{children}</dl>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function State({
  backHref,
  busy = false,
  labels,
  message,
  retry,
}: {
  backHref?: string;
  busy?: boolean;
  labels: PlatformWorkspaceDetailLabels;
  message: string;
  retry?: () => void;
}) {
  return (
    <section
      aria-busy={busy || undefined}
      className={styles.state}
      role={busy ? "status" : "alert"}
    >
      <p>{message}</p>
      <div className={styles.actions}>
        {retry === undefined ? null : (
          <button onClick={retry} type="button">
            {labels.actions.retry}
          </button>
        )}
        {backHref === undefined ? null : (
          <Link href={backHref}>{labels.actions.back}</Link>
        )}
      </div>
    </section>
  );
}

function isNotFound(error: unknown): boolean {
  return (
    isApiError(error) &&
    error.kind === "backend" &&
    error.status === 404 &&
    error.code === "WORKSPACE_NOT_FOUND"
  );
}

function directoryHref(
  searchParams: URLSearchParams | ReadonlyURLSearchParams,
) {
  const query = new URLSearchParams();
  const q = searchParams.get("q")?.trim();
  const status = searchParams.get("status");
  if (q) query.set("q", q);
  if (
    status !== null &&
    (platformWorkspaceStatuses as readonly string[]).includes(status)
  ) {
    query.set("status", status);
  }
  const value = query.toString();
  return value.length === 0
    ? "/platform/workspaces"
    : `/platform/workspaces?${value}`;
}

interface ReadonlyURLSearchParams {
  get(name: string): string | null;
}
