"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  CreatePlatformWorkspaceInput,
  PlatformWorkspaceOwnerDto,
  WorkspaceType,
} from "@/contracts";
import { getLocaleDirection, type Locale } from "@/i18n/locales";
import { createIdempotencyKey, isApiError } from "@/lib/api";
import { useAuthSession } from "@/lib/auth";
import { usePlatformAuthority } from "@/lib/platform-access";
import {
  createPlatformWorkspace,
  platformWorkspaceDirectoryKeys,
} from "@/lib/platform-workspaces";
import { OwnerPicker, type OwnerPickerLabels } from "./OwnerPicker";
import styles from "./platform-workspace-management.module.css";

export interface PlatformWorkspaceManagementLabels {
  createTitle: string;
  managementTitle: string;
  actions: Record<
    | "create"
    | "cancel"
    | "confirm"
    | "changeOwner"
    | "activate"
    | "restrict"
    | "suspend"
    | "archive"
    | "restore"
    | "retry",
    string
  >;
  fields: Record<
    | "type"
    | "name"
    | "owner"
    | "currentOwner"
    | "timezone"
    | "defaultLanguage"
    | "country"
    | "governorate"
    | "city",
    string
  >;
  types: Record<WorkspaceType, string>;
  languages: Record<"ar" | "en", string>;
  ownerPicker: OwnerPickerLabels;
  validation: { required: string; owner: string };
  errors: Record<
    | "validation"
    | "forbidden"
    | "conflict"
    | "idempotency"
    | "unavailable"
    | "notFound"
    | "malformed"
    | "invalidTransition",
    string
  >;
  success: { created: string; ownerChanged: string; lifecycle: string };
  confirmations: Record<
    "owner" | "activate" | "restrict" | "suspend" | "archive" | "restore",
    string
  >;
  loadingManagement: string;
}

type Intent = { key: string; payload: CreatePlatformWorkspaceInput };

export function PlatformWorkspaceCreate({
  labels,
  locale,
}: {
  labels: PlatformWorkspaceManagementLabels;
  locale: Locale;
}) {
  const authority = usePlatformAuthority();
  const { apiClient } = useAuthSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [owner, setOwner] = useState<PlatformWorkspaceOwnerDto>();
  const [pending, setPending] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string>();
  const [retryIntent, setRetryIntent] = useState<Intent>();
  const authorized = authority.allows("platform_workspaces.manage") && !denied;
  const timezones = useMemo(() => supportedTimeZones(), []);
  const identityToken = JSON.stringify([
    authority.principalId,
    authority.sessionGeneration,
    authority.membershipId,
    authority.accessVersion,
    authority.validUntil,
  ]);
  const latestIdentity = useRef(identityToken);
  useEffect(() => {
    latestIdentity.current = identityToken;
    // Authority identity changes retire create state from the previous identity.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDenied(false);
    setOwner(undefined);
    setRetryIntent(undefined);
    setPending(false);
  }, [identityToken]);
  const backHref = useMemo(() => {
    const next = new URLSearchParams();
    for (const key of ["q", "status"]) {
      const value = searchParams.get(key);
      if (value) next.set(key, value);
    }
    return `/platform/workspaces${next.size ? `?${next}` : ""}`;
  }, [searchParams]);
  const retire = useCallback(() => {
    setDenied(true);
    setOwner(undefined);
    setRetryIntent(undefined);
    void authority.refresh();
  }, [authority]);

  async function run(intent: Intent) {
    if (pending || !authorized) return;
    setPending(true);
    setError(undefined);
    const startedIdentity = latestIdentity.current;
    try {
      const response = await createPlatformWorkspace(
        apiClient,
        intent.payload,
        intent.key,
      );
      if (startedIdentity !== latestIdentity.current) return;
      setRetryIntent(undefined);
      await queryClient.invalidateQueries({
        queryKey: platformWorkspaceDirectoryKeys.all,
        predicate: (query) => query.queryKey[2] === "directory",
      });
      const preservedQuery = backHref.includes("?")
        ? backHref.slice(backHref.indexOf("?"))
        : "";
      router.push(
        `/platform/workspaces/${response.data.workspace.id}${preservedQuery}`,
      );
    } catch (caught) {
      if (startedIdentity !== latestIdentity.current) return;
      if (isApiError(caught) && caught.status === 403) {
        retire();
        return;
      }
      setRetryIntent(intent);
      setError(createError(caught, labels));
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const type = String(data.get("type") ?? "") as WorkspaceType;
    const timezone = String(data.get("timezone") ?? "");
    const defaultLanguage = String(data.get("defaultLanguage") ?? "") as
      "ar" | "en";
    if (!name || !type || !timezone || !defaultLanguage) {
      setError(labels.validation.required);
      return;
    }
    if (!owner) {
      setError(labels.validation.owner);
      return;
    }
    const optional = (key: "country" | "city" | "governorate") =>
      String(data.get(key) ?? "").trim() || undefined;
    const payload: CreatePlatformWorkspaceInput = {
      type,
      name,
      ownerUserId: owner.id,
      timezone,
      defaultLanguage,
      ...(optional("country") ? { country: optional("country") } : {}),
      ...(optional("city") ? { city: optional("city") } : {}),
      ...(optional("governorate")
        ? { governorate: optional("governorate") }
        : {}),
    };
    setRetryIntent(undefined);
    void run({ key: createIdempotencyKey(), payload });
  }

  if (!authorized) return <p role="alert">{labels.errors.forbidden}</p>;
  return (
    <section className={styles.page} dir={getLocaleDirection(locale)}>
      <h1>{labels.createTitle}</h1>
      <form className={styles.form} noValidate onSubmit={submit}>
        <div className={styles.grid}>
          <Field label={labels.fields.type}>
            <select name="type" required defaultValue="">
              <option disabled value="">
                —
              </option>
              <option value="GYM">{labels.types.GYM}</option>
              <option value="INDEPENDENT_TRAINER">
                {labels.types.INDEPENDENT_TRAINER}
              </option>
            </select>
          </Field>
          <Field label={labels.fields.name}>
            <input name="name" required />
          </Field>
          <Field label={labels.fields.timezone}>
            <select
              name="timezone"
              required
              defaultValue={
                Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
              }
            >
              {timezones.map((zone) => (
                <option key={zone}>{zone}</option>
              ))}
            </select>
          </Field>
          <Field label={labels.fields.defaultLanguage}>
            <select name="defaultLanguage" required defaultValue={locale}>
              <option value="ar">{labels.languages.ar}</option>
              <option value="en">{labels.languages.en}</option>
            </select>
          </Field>
          <Field label={labels.fields.country}>
            <input name="country" />
          </Field>
          <Field label={labels.fields.governorate}>
            <input name="governorate" />
          </Field>
          <Field label={labels.fields.city}>
            <input name="city" />
          </Field>
        </div>
        <fieldset>
          <legend>{labels.fields.owner}</legend>
          <OwnerPicker
            labels={labels.ownerPicker}
            onForbidden={retire}
            onSelect={(value) => {
              setOwner(value);
              setRetryIntent(undefined);
            }}
            selected={owner}
          />
        </fieldset>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.actions}>
          <button disabled={pending} type="submit">
            {labels.actions.create}
          </button>
          {error && retryIntent ? (
            <button
              disabled={pending}
              onClick={() => void run(retryIntent)}
              type="button"
            >
              {labels.actions.retry}
            </button>
          ) : null}
          <Link href={backHref}>{labels.actions.cancel}</Link>
        </div>
      </form>
    </section>
  );
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function supportedTimeZones(): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[];
  };
  const values = intl.supportedValuesOf?.("timeZone") ?? [];
  const current = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return Array.from(new Set([current, "UTC", ...values]));
}

function createError(
  error: unknown,
  labels: PlatformWorkspaceManagementLabels,
): string {
  if (!isApiError(error)) return labels.errors.unavailable;
  if (error.status === 400) return labels.errors.validation;
  if (error.category === "idempotency-conflict")
    return labels.errors.idempotency;
  if (error.kind === "malformed-response") return labels.errors.malformed;
  return labels.errors.conflict;
}
