"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getLocaleDirection, type Locale } from "@/i18n/locales";
import { getMessages } from "@/i18n/messages";
import { isApiError } from "@/lib/api";
import { useAuthSession } from "@/lib/auth";
import {
  formatInstantInTimeZone,
  parseIanaTimeZone,
  parseOffsetTimestamp,
} from "@/lib/date-time";
import { usePlatformAuthority } from "@/lib/platform-access";
import {
  getPlatformUser,
  membershipStatuses,
  platformUserKeys,
} from "@/lib/platform-users";
import styles from "./platform-user-detail.module.css";

export type PlatformUserLabels = ReturnType<
  typeof getMessages
>["platformUsers"];
const utc = parseIanaTimeZone("UTC");
export function PlatformUserDetail({
  labels,
  locale,
  userId,
}: {
  labels: PlatformUserLabels;
  locale: Locale;
  userId: string;
}) {
  const authority = usePlatformAuthority();
  const { apiClient, markSessionExpired } = useAuthSession();
  const client = useQueryClient();
  const params = useSearchParams();
  const allowed = authority.allows("platform_users.read");
  const {
    accessVersion,
    membershipId,
    principalId,
    sessionGeneration,
    validUntil,
  } = authority;
  const key = useMemo(
    () =>
      platformUserKeys.detail({
        accessVersion,
        membershipId,
        principalId,
        sessionGeneration,
        authorityValidUntil: validUntil,
        permission: "platform_users.read",
        allowed,
        userId,
      }),
    [
      accessVersion,
      membershipId,
      principalId,
      sessionGeneration,
      validUntil,
      allowed,
      userId,
    ],
  );
  const identity = JSON.stringify(key);
  const [deniedIdentity, setDeniedIdentity] = useState<string | null>(null);
  const handled = useRef<unknown>(null);
  useEffect(() => {
    handled.current = null;
    return () => {
      void client.cancelQueries({ queryKey: key, exact: true });
      client.removeQueries({ queryKey: key, exact: true });
    };
  }, [client, key]);
  const detail = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getPlatformUser(apiClient, userId, signal),
    enabled: allowed && deniedIdentity !== identity,
    retry: false,
  });
  const forbidden = isApiError(detail.error) && detail.error.status === 403;
  useEffect(() => {
    const error = detail.error;
    if (!error || error === handled.current) return;
    handled.current = error;
    if (isApiError(error) && error.status === 403) {
      // The domain response retires this authority's protected target.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDeniedIdentity(identity);
      void client.cancelQueries({ queryKey: key, exact: true });
      client.removeQueries({ queryKey: key, exact: true });
      void authority.refresh();
    } else if (isApiError(error) && error.category === "unauthenticated")
      markSessionExpired(error);
  }, [authority, client, detail.error, identity, key, markSessionExpired]);
  const query = new URLSearchParams();
  const q = params.get("q")?.trim();
  const status = params.get("platformMembershipStatus");
  if (q) query.set("q", q);
  if (membershipStatuses.includes(status as never))
    query.set("platformMembershipStatus", status!);
  const back = `/platform/users${query.size ? `?${query}` : ""}`;
  const notFound =
    isApiError(detail.error) &&
    (detail.error.status === 404 || detail.error.status === 400);
  let message: string | undefined;
  if (!allowed) message = labels.errors.denied;
  else if (forbidden || deniedIdentity === identity)
    message = labels.errors.forbidden;
  else if (notFound) message = labels.errors.notFound;
  else if (detail.isPending) message = labels.loading;
  else if (detail.isError || !detail.data) message = labels.errors.unavailable;
  if (message)
    return (
      <section
        className={styles.state}
        dir={getLocaleDirection(locale)}
        aria-busy={(detail.isPending && allowed) || undefined}
      >
        <h1>{labels.detailTitle}</h1>
        <p role={detail.isPending && allowed ? "status" : "alert"}>{message}</p>
        <Link href={back}>{labels.actions.back}</Link>
        {allowed &&
        !forbidden &&
        deniedIdentity !== identity &&
        !notFound &&
        detail.isError ? (
          <button type="button" onClick={() => void detail.refetch()}>
            {labels.actions.retry}
          </button>
        ) : null}
      </section>
    );
  const user = detail.data!;
  const member = user.platformMembership;
  function timestamp(label: string, value: string | undefined) {
    return value === undefined ? null : (
      <div className={styles.fact}>
        <dt>{label}</dt>
        <dd>
          <time dateTime={value}>
            {formatInstantInTimeZone(parseOffsetTimestamp(value), locale, utc)}
          </time>
        </dd>
      </div>
    );
  }
  return (
    <article className={styles.detail} dir={getLocaleDirection(locale)}>
      <Link href={back}>{labels.actions.back}</Link>
      <h1>{labels.detailTitle}</h1>
      <p>{labels.scope}</p>
      <section className={styles.section}>
        <h2>{labels.account}</h2>
        <dl className={styles.facts}>
          <Fact
            label={labels.fields.name}
            value={user.displayName ?? labels.nameUnavailable}
          />
          <Fact
            label={labels.fields.email}
            value={user.email ?? labels.emailUnavailable}
          />
          <Fact
            label={labels.fields.status}
            value={labels.accountStatuses[user.status]}
          />
          {timestamp(labels.fields.createdAt, user.createdAt)}
          {timestamp(labels.fields.updatedAt, user.updatedAt)}
        </dl>
      </section>
      <section className={styles.section}>
        <h2>{labels.membership}</h2>
        <dl className={styles.facts}>
          <Fact
            label={labels.fields.membershipStatus}
            value={labels.statuses[member.status]}
          />
          {timestamp(labels.fields.createdAt, member.createdAt)}
          {timestamp(labels.fields.updatedAt, member.updatedAt)}
          {timestamp(labels.fields.suspendedAt, member.suspendedAt)}
          {timestamp(labels.fields.endedAt, member.endedAt)}
        </dl>
      </section>
      <p>{labels.dateTimeZone}</p>
    </article>
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
