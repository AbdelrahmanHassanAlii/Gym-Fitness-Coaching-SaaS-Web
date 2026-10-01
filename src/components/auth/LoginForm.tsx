"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter, useSearchParams } from "next/navigation";
import { isApiError } from "@/lib/api";
import { useAuthSession } from "@/lib/auth";
import { getSafeReturnPath } from "@/lib/auth/redirects";
import type { MfaFactorType, MfaRequiredResponseDto } from "@/contracts";
import styles from "./auth.module.css";

interface LoginLabels {
  credentialLabel: string;
  errorFallback: string;
  loading: string;
  mfaCredentialLabel: string;
  mfaHelp: string;
  mfaMethodLabel: string;
  mfaSubmit: string;
  passwordLabel: string;
  submit: string;
  title: string;
}

interface LoginFormFields {
  credential: string;
  password: string;
}

interface MfaFormFields {
  credential: string;
  factorType: MfaFactorType;
}

export function LoginForm({ labels }: { labels: LoginLabels }) {
  const { bootstrap, login, state, verifyMfaLogin } = useAuthSession();
  const [challenge, setChallenge] = useState<MfaRequiredResponseDto | null>(
    null,
  );
  const [formError, setFormError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnPath = getSafeReturnPath(searchParams.get("next"));

  const loginForm = useForm<LoginFormFields>({
    defaultValues: { credential: "", password: "" },
  });
  const mfaForm = useForm<MfaFormFields>({
    defaultValues: { credential: "", factorType: "TOTP" },
  });

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (state.status === "authenticated") {
      router.replace(returnPath);
    }
  }, [returnPath, router, state.status]);

  const onLogin = loginForm.handleSubmit(async (values) => {
    setFormError(null);

    try {
      const result = await login({
        identifier: values.credential,
        password: values.password,
      });

      if (result.status === "mfa-required") {
        setChallenge(result.challenge);
        mfaForm.setValue(
          "factorType",
          result.challenge.availableMethods[0] ?? "TOTP",
        );
        return;
      }

      router.replace(returnPath);
    } catch (error) {
      setFormError(safeAuthMessage(error, labels.errorFallback));
    }
  });

  const onMfa = mfaForm.handleSubmit(async (values) => {
    if (challenge === null) {
      return;
    }

    setFormError(null);

    try {
      await verifyMfaLogin({
        credential: values.credential,
        factorType: values.factorType,
        mfaChallengeToken: challenge.mfaChallengeToken,
      });
      router.replace(returnPath);
    } catch (error) {
      setFormError(safeAuthMessage(error, labels.errorFallback));
    }
  });

  const isSubmitting =
    loginForm.formState.isSubmitting || mfaForm.formState.isSubmitting;

  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="auth-title">
        <h1 id="auth-title">{labels.title}</h1>
        {formError ? (
          <p className={styles.error} role="alert">
            {formError}
          </p>
        ) : null}
        {challenge === null ? (
          <form className={styles.form} onSubmit={onLogin}>
            <label>
              <span>{labels.credentialLabel}</span>
              <input
                autoComplete="username"
                {...loginForm.register("credential", { required: true })}
              />
            </label>
            <label>
              <span>{labels.passwordLabel}</span>
              <input
                autoComplete="current-password"
                type="password"
                {...loginForm.register("password", { required: true })}
              />
            </label>
            <button disabled={isSubmitting} type="submit">
              {isSubmitting ? labels.loading : labels.submit}
            </button>
          </form>
        ) : (
          <form className={styles.form} onSubmit={onMfa}>
            <p className={styles.help}>{labels.mfaHelp}</p>
            <label>
              <span>{labels.mfaCredentialLabel}</span>
              <input
                autoComplete="one-time-code"
                {...mfaForm.register("credential", { required: true })}
              />
            </label>
            <label>
              <span>{labels.mfaMethodLabel}</span>
              <select {...mfaForm.register("factorType")}>
                {challenge.availableMethods.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={isSubmitting} type="submit">
              {isSubmitting ? labels.loading : labels.mfaSubmit}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

function safeAuthMessage(error: unknown, fallback: string): string {
  if (isApiError(error) && error.kind === "backend") {
    return error.message;
  }

  return fallback;
}
