"use client";

import { useEffect, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import type {
  CreateManualPaymentRequestDto,
  ManualPaymentDto,
  PermissionDecisionDto,
  WorkspaceId,
} from "@/contracts";
import { isApiError } from "@/lib/api";
import { createIdempotencyKey } from "@/lib/api";
import {
  AccessControlledButton,
  evaluateAccess,
  type AccessDecision,
} from "@/lib/access";
import { useAuthSession } from "@/lib/auth";
import {
  commercialKeys,
  createManualPayment,
  getWorkspaceSubscription,
  getWorkspaceUsage,
  listWorkspacePayments,
} from "@/lib/commercial";
import { useStaffWorkspaceContext } from "@/lib/staff-shell";
import styles from "./commercial.module.css";

type CommercialLabels = {
  actions: {
    createPayment: string;
  };
  deferred: {
    copy: string;
    title: string;
  };
  errors: {
    accessUnavailable: string;
    conflict: string;
    denied: string;
    malformed: string;
    unavailable: string;
    validation: string;
  };
  fields: {
    amount: string;
    currency: string;
    notes: string;
    paidAt: string;
    paymentMethod: string;
    paymentReference: string;
  };
  loading: string;
  noWorkspace: {
    copy: string;
    title: string;
  };
  payments: {
    empty: string;
    title: string;
  };
  status: {
    created: string;
  };
  subscription: {
    accessMode: string;
    currentTerms: string;
    lifecycle: string;
    noTerms: string;
    title: string;
  };
  title: string;
  usage: {
    activeStaff: string;
    activeTrainees: string;
    compliance: string;
    storage: string;
    title: string;
  };
};

type PaymentFormValues = {
  amount: string;
  currency: string;
  notes: string;
  paidAt: string;
  paymentMethod: string;
  paymentReference: string;
};

const emptyPaymentForm: PaymentFormValues = {
  amount: "",
  currency: "EGP",
  notes: "",
  paidAt: "",
  paymentMethod: "",
  paymentReference: "",
};

const commandLocksByOwner = new Map<string, Set<string>>();

export function CommercialExperience({ labels }: { labels: CommercialLabels }) {
  const queryClient = useQueryClient();
  const { apiClient, generation, state } = useAuthSession();
  const { accessFacts, shellContext, workspace } = useStaffWorkspaceContext();
  const commandLockOwner = useId();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const paymentForm = useForm<PaymentFormValues>({
    defaultValues: emptyPaymentForm,
  });

  const workspaceId = workspace?.workspaceId ?? null;
  const accessContext = shellContext?.accessContext ?? "user";
  const canQuery = state.status === "authenticated" && workspaceId !== null;

  useEffect(() => {
    return () => {
      commandLocksByOwner.delete(commandLockOwner);
    };
  }, [commandLockOwner]);

  const subscriptionQuery = useQuery({
    enabled: canQuery,
    queryFn: ({ signal }) =>
      getWorkspaceSubscription(apiClient, workspaceId!, signal),
    queryKey:
      workspaceId === null
        ? ["commercial", "subscription", "none"]
        : commercialKeys.subscription(workspaceId, generation, accessContext),
  });
  const usageQuery = useQuery({
    enabled: canQuery,
    queryFn: ({ signal }) => getWorkspaceUsage(apiClient, workspaceId!, signal),
    queryKey:
      workspaceId === null
        ? ["commercial", "usage", "none"]
        : commercialKeys.usage(workspaceId, generation, accessContext),
  });
  const paymentsQuery = useQuery({
    enabled: canQuery,
    queryFn: ({ signal }) =>
      listWorkspacePayments(apiClient, workspaceId!, signal),
    queryKey:
      workspaceId === null
        ? ["commercial", "payments", "none"]
        : commercialKeys.payments(workspaceId, generation, accessContext),
  });

  const paymentCreateDecision = actionDecision({
    accessContext,
    accessFacts,
    generation,
    permission: "billing.payments.create",
    workspaceId,
  });

  const paymentMutation = useMutation({
    mutationFn: (body: CreateManualPaymentRequestDto) =>
      createManualPayment(
        apiClient,
        workspaceId!,
        body,
        createIdempotencyKey(),
      ),
    onError: (caught) => {
      setStatusMessage(null);
      setError(errorMessage(caught, labels));
    },
    onSuccess: async () => {
      paymentForm.reset(emptyPaymentForm);
      setError(null);
      setStatusMessage(labels.status.created);
      if (workspaceId !== null) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: commercialKeys.payments(
              workspaceId,
              generation,
              accessContext,
            ),
          }),
          queryClient.invalidateQueries({
            queryKey: commercialKeys.subscription(
              workspaceId,
              generation,
              accessContext,
            ),
          }),
          queryClient.invalidateQueries({
            queryKey: commercialKeys.usage(
              workspaceId,
              generation,
              accessContext,
            ),
          }),
        ]);
      }
    },
    retry: false,
  });

  const runOnce = async (
    key: string,
    action: () => Promise<unknown>,
  ): Promise<void> => {
    const locks = getCommandLocks(commandLockOwner);
    if (locks.has(key)) {
      return;
    }

    locks.add(key);
    try {
      await action();
    } catch {
      // React Query mutation callbacks publish user-facing errors.
    } finally {
      locks.delete(key);
    }
  };

  if (workspaceId === null || shellContext === null) {
    return (
      <section className={styles.statePanel}>
        <h1>{labels.noWorkspace.title}</h1>
        <p>{labels.noWorkspace.copy}</p>
      </section>
    );
  }

  if (
    subscriptionQuery.isLoading ||
    usageQuery.isLoading ||
    paymentsQuery.isLoading
  ) {
    return (
      <section
        aria-busy="true"
        aria-live="polite"
        className={styles.statePanel}
      >
        <h1>{labels.loading}</h1>
      </section>
    );
  }

  const queryError =
    subscriptionQuery.error ?? usageQuery.error ?? paymentsQuery.error;

  if (queryError) {
    return (
      <section className={styles.statePanel} role="alert">
        <h1>{errorMessage(queryError, labels)}</h1>
      </section>
    );
  }

  const subscription = subscriptionQuery.data;
  const usage = usageQuery.data;
  const payments = paymentsQuery.data ?? [];
  const selectedWorkspace = workspace;
  if (selectedWorkspace === null) {
    return (
      <section className={styles.statePanel}>
        <h1>{labels.noWorkspace.title}</h1>
        <p>{labels.noWorkspace.copy}</p>
      </section>
    );
  }

  return (
    <section className={styles.module} aria-labelledby="commercial-title">
      <header className={styles.header}>
        <div>
          <h1 id="commercial-title">{labels.title}</h1>
          <p>{selectedWorkspace.workspaceName}</p>
        </div>
        <div aria-live="polite" className={styles.feedback}>
          {error ? <p role="alert">{error}</p> : null}
          {statusMessage ? <p>{statusMessage}</p> : null}
        </div>
      </header>

      <section className={styles.panel} aria-labelledby="subscription-title">
        <h2 id="subscription-title">{labels.subscription.title}</h2>
        {subscription ? (
          <div className={styles.metricGrid}>
            <Metric
              label={labels.subscription.lifecycle}
              value={subscription.lifecycleStatus}
            />
            <Metric
              label={labels.subscription.accessMode}
              value={subscription.accessMode}
            />
            <Metric
              label={labels.subscription.currentTerms}
              value={
                subscription.currentTerms
                  ? `${subscription.currentTerms.billingPeriod} · ${subscription.currentTerms.source}`
                  : labels.subscription.noTerms
              }
            />
          </div>
        ) : null}
      </section>

      <section className={styles.panel} aria-labelledby="usage-title">
        <h2 id="usage-title">{labels.usage.title}</h2>
        {usage ? (
          <div className={styles.metricGrid}>
            <Metric
              label={labels.usage.compliance}
              value={usage.usageCompliance}
            />
            <Metric
              label={labels.usage.activeTrainees}
              value={usage.usage.activeTrainees.toString()}
            />
            <Metric
              label={labels.usage.activeStaff}
              value={usage.usage.activeStaff.toString()}
            />
            <Metric
              label={labels.usage.storage}
              value={`${usage.usage.storageBytes + usage.usage.reservedStorageBytes} / ${usage.limits?.storageBytes ?? "—"}`}
            />
          </div>
        ) : null}
      </section>

      <section className={styles.panel} aria-labelledby="payments-title">
        <h2 id="payments-title">{labels.payments.title}</h2>
        {payments.length === 0 ? <p>{labels.payments.empty}</p> : null}
        <div className={styles.list}>
          {payments.map((payment) => (
            <PaymentRow key={payment.id} payment={payment} />
          ))}
        </div>

        <form
          className={styles.formGrid}
          onSubmit={paymentForm.handleSubmit((values) => {
            if (!paymentCreateDecision.allowed) {
              return;
            }

            void runOnce("payment:create", () =>
              paymentMutation.mutateAsync(paymentBody(values)),
            );
          })}
        >
          <TextField
            label={labels.fields.amount}
            registration={paymentForm.register("amount", { required: true })}
            type="number"
          />
          <TextField
            label={labels.fields.currency}
            registration={paymentForm.register("currency", {
              maxLength: 3,
              minLength: 3,
              required: true,
            })}
          />
          <TextField
            label={labels.fields.paymentMethod}
            registration={paymentForm.register("paymentMethod", {
              required: true,
            })}
          />
          <TextField
            label={labels.fields.paymentReference}
            registration={paymentForm.register("paymentReference")}
          />
          <TextField
            label={labels.fields.paidAt}
            registration={paymentForm.register("paidAt")}
            type="datetime-local"
          />
          <TextField
            label={labels.fields.notes}
            registration={paymentForm.register("notes")}
          />
          <AccessControlledButton
            decision={paymentCreateDecision}
            disabled={paymentMutation.isPending}
            disabledReason={accessDisabledReason(paymentCreateDecision, labels)}
            loadingLabel={labels.errors.accessUnavailable}
            type="submit"
          >
            {labels.actions.createPayment}
          </AccessControlledButton>
        </form>
      </section>

      <section className={styles.panel} aria-labelledby="lead-scope-title">
        <h2 id="lead-scope-title">{labels.deferred.title}</h2>
        <p>{labels.deferred.copy}</p>
      </section>
    </section>
  );
}

function actionDecision({
  accessContext,
  accessFacts,
  generation,
  permission,
  workspaceId,
}: {
  accessContext: "support" | "user";
  accessFacts: ReturnType<typeof useStaffWorkspaceContext>["accessFacts"];
  generation: number;
  permission: PermissionDecisionDto["permission"];
  workspaceId: WorkspaceId | null;
}): AccessDecision {
  return evaluateAccess(accessFacts, {
    accessContext,
    context: "WORKSPACE",
    permission,
    scope: "workspace",
    sessionGeneration: generation,
    workspaceId: workspaceId ?? undefined,
  });
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PaymentRow({ payment }: { payment: ManualPaymentDto }) {
  return (
    <article className={styles.item}>
      <div>
        <h3>
          {payment.amount} {payment.currency}
        </h3>
        <p>
          {payment.paymentMethod} · {payment.status}
        </p>
      </div>
      <span>{payment.createdAt}</span>
    </article>
  );
}

function TextField({
  label,
  registration,
  type = "text",
}: {
  label: string;
  registration: UseFormRegisterReturn;
  type?: string;
}) {
  return (
    <label>
      <span>{label}</span>
      <input type={type} {...registration} />
    </label>
  );
}

function paymentBody(values: PaymentFormValues): CreateManualPaymentRequestDto {
  return cleanObject({
    amount: Number(values.amount),
    currency: values.currency.toUpperCase(),
    notes: values.notes,
    paidAt: values.paidAt === "" ? "" : new Date(values.paidAt).toISOString(),
    paymentMethod: values.paymentMethod,
    paymentReference: values.paymentReference,
  });
}

function cleanObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== ""),
  ) as T;
}

function getCommandLocks(owner: string): Set<string> {
  const existing = commandLocksByOwner.get(owner);
  if (existing) {
    return existing;
  }

  const locks = new Set<string>();
  commandLocksByOwner.set(owner, locks);
  return locks;
}

function accessDisabledReason(
  decision: AccessDecision,
  labels: CommercialLabels,
): string {
  return decision.status === "unavailable"
    ? labels.errors.accessUnavailable
    : labels.errors.denied;
}

function errorMessage(error: unknown, labels: CommercialLabels): string {
  if (!isApiError(error)) {
    return labels.errors.unavailable;
  }

  if (error.category === "forbidden") {
    return labels.errors.denied;
  }

  if (error.category === "expected-version-conflict") {
    return labels.errors.conflict;
  }

  if (error.category === "validation") {
    return labels.errors.validation;
  }

  if (error.kind === "malformed-response") {
    return labels.errors.malformed;
  }

  return labels.errors.unavailable;
}
