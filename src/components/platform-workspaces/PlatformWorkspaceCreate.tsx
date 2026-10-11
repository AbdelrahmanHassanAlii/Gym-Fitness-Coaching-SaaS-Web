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
import { useProtectedAsyncEpoch } from "@/lib/platform-workspaces/use-protected-async-epoch";
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
    | "createConflict"
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
  const [fieldErrors, setFieldErrors] = useState<
    Partial<
      Record<"type" | "name" | "owner" | "timezone" | "defaultLanguage", string>
    >
  >({});
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
  const asyncEpoch = useProtectedAsyncEpoch(identityToken);
  useEffect(() => {
    latestIdentity.current = identityToken;
    // Authority identity changes retire create state from the previous identity.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDenied(false);
    setOwner(undefined);
    setRetryIntent(undefined);
    setError(undefined);
    setFieldErrors({});
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
    asyncEpoch.invalidate();
    setDenied(true);
    setOwner(undefined);
    setRetryIntent(undefined);
    setError(undefined);
    setFieldErrors({});
    setPending(false);
    void authority.refresh();
  }, [asyncEpoch, authority]);

  async function run(intent: Intent) {
    if (pending || !authorized) return;
    const startedEpoch = asyncEpoch.capture();
    if (startedEpoch === undefined) return;
    setPending(true);
    setError(undefined);
    const startedIdentity = latestIdentity.current;
    try {
      const response = await createPlatformWorkspace(
        apiClient,
        intent.payload,
        intent.key,
      );
      if (
        startedIdentity !== latestIdentity.current ||
        !asyncEpoch.isCurrent(startedEpoch)
      )
        return;
      setRetryIntent(undefined);
      await queryClient.invalidateQueries({
        queryKey: platformWorkspaceDirectoryKeys.all,
        predicate: (query) => query.queryKey[2] === "directory",
      });
      if (!asyncEpoch.isCurrent(startedEpoch)) return;
      const preservedQuery = backHref.includes("?")
        ? backHref.slice(backHref.indexOf("?"))
        : "";
      router.push(
        `/platform/workspaces/${response.data.workspace.id}${preservedQuery}`,
      );
    } catch (caught) {
      if (
        startedIdentity !== latestIdentity.current ||
        !asyncEpoch.isCurrent(startedEpoch)
      )
        return;
      if (isApiError(caught) && caught.status === 403) {
        retire();
        return;
      }
      setRetryIntent(isRetryableCreateError(caught) ? intent : undefined);
      setError(createError(caught, labels));
    } finally {
      if (asyncEpoch.isCurrent(startedEpoch)) setPending(false);
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
    const nextFieldErrors = {
      ...(!type ? { type: labels.validation.required } : {}),
      ...(!name ? { name: labels.validation.required } : {}),
      ...(!timezone ? { timezone: labels.validation.required } : {}),
      ...(!defaultLanguage
        ? { defaultLanguage: labels.validation.required }
        : {}),
      ...(!owner ? { owner: labels.validation.owner } : {}),
    };
    setFieldErrors(nextFieldErrors);
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
    setError(undefined);
    void run({ key: createIdempotencyKey(), payload });
  }

  if (!authorized) return <p role="alert">{labels.errors.forbidden}</p>;
  return (
    <section className={styles.page} dir={getLocaleDirection(locale)}>
      <h1>{labels.createTitle}</h1>
      <form className={styles.form} noValidate onSubmit={submit}>
        <div className={styles.grid}>
          <Field
            controlId="workspace-type"
            error={fieldErrors.type}
            errorId="workspace-type-error"
            label={labels.fields.type}
          >
            <select
              aria-describedby={
                fieldErrors.type ? "workspace-type-error" : undefined
              }
              aria-invalid={Boolean(fieldErrors.type)}
              id="workspace-type"
              name="type"
              required
              defaultValue=""
            >
              <option disabled value="">
                —
              </option>
              <option value="GYM">{labels.types.GYM}</option>
              <option value="INDEPENDENT_TRAINER">
                {labels.types.INDEPENDENT_TRAINER}
              </option>
            </select>
          </Field>
          <Field
            controlId="workspace-name"
            error={fieldErrors.name}
            errorId="workspace-name-error"
            label={labels.fields.name}
          >
            <input
              aria-describedby={
                fieldErrors.name ? "workspace-name-error" : undefined
              }
              aria-invalid={Boolean(fieldErrors.name)}
              id="workspace-name"
              name="name"
              required
            />
          </Field>
          <Field
            controlId="workspace-timezone"
            error={fieldErrors.timezone}
            errorId="workspace-timezone-error"
            label={labels.fields.timezone}
          >
            <select
              aria-describedby={
                fieldErrors.timezone ? "workspace-timezone-error" : undefined
              }
              aria-invalid={Boolean(fieldErrors.timezone)}
              id="workspace-timezone"
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
          <Field
            controlId="workspace-language"
            error={fieldErrors.defaultLanguage}
            errorId="workspace-language-error"
            label={labels.fields.defaultLanguage}
          >
            <select
              aria-describedby={
                fieldErrors.defaultLanguage
                  ? "workspace-language-error"
                  : undefined
              }
              aria-invalid={Boolean(fieldErrors.defaultLanguage)}
              id="workspace-language"
              name="defaultLanguage"
              required
              defaultValue={locale}
            >
              <option value="ar">{labels.languages.ar}</option>
              <option value="en">{labels.languages.en}</option>
            </select>
          </Field>
          <Field controlId="workspace-country" label={labels.fields.country}>
            <input id="workspace-country" name="country" />
          </Field>
          <Field
            controlId="workspace-governorate"
            label={labels.fields.governorate}
          >
            <input id="workspace-governorate" name="governorate" />
          </Field>
          <Field controlId="workspace-city" label={labels.fields.city}>
            <input id="workspace-city" name="city" />
          </Field>
        </div>
        <fieldset
          aria-describedby={
            fieldErrors.owner ? "workspace-owner-error" : undefined
          }
          aria-invalid={Boolean(fieldErrors.owner)}
        >
          <legend>{labels.fields.owner}</legend>
          <OwnerPicker
            labels={labels.ownerPicker}
            onForbidden={retire}
            onSelect={(value) => {
              setOwner(value);
              setFieldErrors((current) => ({ ...current, owner: undefined }));
              setRetryIntent(undefined);
            }}
            selected={owner}
          />
          {fieldErrors.owner ? (
            <p className={styles.error} id="workspace-owner-error">
              {fieldErrors.owner}
            </p>
          ) : null}
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
  controlId,
  error,
  errorId,
  label,
}: {
  children: React.ReactNode;
  controlId: string;
  error?: string;
  errorId?: string;
  label: string;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={controlId}>{label}</label>
      {children}
      {error ? (
        <span className={styles.error} id={errorId}>
          {error}
        </span>
      ) : null}
    </div>
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
  if (error.kind === "malformed-response" || error.kind === "non-json-response")
    return labels.errors.malformed;
  if (error.status === 409) return labels.errors.createConflict;
  return labels.errors.unavailable;
}

function isRetryableCreateError(error: unknown): boolean {
  if (!isApiError(error)) return true;
  if (error.kind === "network") return true;
  if (error.kind !== "backend") return false;
  return error.status === undefined || error.status >= 500;
}
