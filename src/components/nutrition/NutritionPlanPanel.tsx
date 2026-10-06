"use client";

import type {
  CreateNutritionPlanDto,
  CreateNutritionPlanRevisionDto,
  NutritionFoodDto,
  NutritionPlanDetailDto,
  NutritionPlanDto,
  NutritionPlanId,
} from "@/contracts";
import { AccessControlledButton, type AccessDecision } from "@/lib/access";
import type { NutritionLabels } from "./NutritionExperience";
import { NutritionPlanEditor } from "./NutritionPlanEditor";
import styles from "./nutrition.module.css";

export function NutritionPlanPanel({
  actions,
  decisions,
  foods,
  isLoading,
  labels,
  nextCursor,
  onLoadMore,
  onSelectPlan,
  pending,
  planDetail,
  plans,
  selectedPlanId,
}: {
  actions: {
    activate: (plan: NutritionPlanDto) => void;
    archive: (plan: NutritionPlanDto) => void;
    complete: (plan: NutritionPlanDto) => void;
    create: (body: CreateNutritionPlanDto) => void;
    revision: (
      plan: NutritionPlanDto,
      body: CreateNutritionPlanRevisionDto,
    ) => void;
  };
  decisions: {
    activate: AccessDecision;
    archive: AccessDecision;
    complete: AccessDecision;
    create: AccessDecision;
    read: AccessDecision;
    update: AccessDecision;
  };
  foods: readonly NutritionFoodDto[];
  isLoading: boolean;
  labels: NutritionLabels;
  nextCursor?: string;
  onLoadMore: () => void;
  onSelectPlan: (planId: NutritionPlanId) => void;
  pending: boolean;
  planDetail?: NutritionPlanDetailDto;
  plans: readonly NutritionPlanDto[];
  selectedPlanId: NutritionPlanId | null;
}) {
  if (!decisions.read.allowed) {
    return (
      <section className={styles.statePanel}>
        <h2>{labels.plans.title}</h2>
        <p>
          {decisions.read.status === "unresolved"
            ? labels.loading
            : labels.errors.denied}
        </p>
      </section>
    );
  }

  return (
    <section className={styles.split} aria-busy={isLoading}>
      <div className={styles.panel}>
        <h2>{labels.plans.title}</h2>
        {isLoading ? <p>{labels.loading}</p> : null}
        {plans.length === 0 && !isLoading ? <p>{labels.empty.plans}</p> : null}
        <div className={styles.list}>
          {plans.map((plan) => (
            <button
              className={`${styles.item} ${selectedPlanId === plan.id ? styles.itemSelected : ""}`}
              key={plan.id}
              onClick={() => onSelectPlan(plan.id)}
              type="button"
            >
              <strong>{plan.name}</strong>
              <span className={styles.meta}>
                {labels.values[plan.status] ?? plan.status} · v{plan.version}
              </span>
            </button>
          ))}
        </div>
        {nextCursor ? (
          <button disabled={isLoading} onClick={onLoadMore} type="button">
            {labels.actions.loadMore}
          </button>
        ) : null}
      </div>
      <div className={styles.panel}>
        <h2>{labels.plans.detail}</h2>
        {planDetail ? (
          <>
            <PlanDetail labels={labels} planDetail={planDetail} />
            <div className={styles.actions}>
              <AccessControlledButton
                decision={decisions.activate}
                disabled={pending || planDetail.plan.status !== "DRAFT"}
                disabledReason={labels.errors.denied}
                loadingLabel={labels.loading}
                onClick={() => actions.activate(planDetail.plan)}
                type="button"
              >
                {labels.actions.activate}
              </AccessControlledButton>
              <AccessControlledButton
                decision={decisions.complete}
                disabled={pending || planDetail.plan.status !== "ACTIVE"}
                disabledReason={labels.errors.denied}
                loadingLabel={labels.loading}
                onClick={() => actions.complete(planDetail.plan)}
                type="button"
              >
                {labels.actions.complete}
              </AccessControlledButton>
              <AccessControlledButton
                decision={decisions.archive}
                disabled={pending || !isArchiveEligible(planDetail.plan.status)}
                disabledReason={labels.errors.denied}
                loadingLabel={labels.loading}
                onClick={() => actions.archive(planDetail.plan)}
                type="button"
              >
                {labels.actions.archive}
              </AccessControlledButton>
            </div>
            {isRevisionEligible(planDetail.plan.status) ? (
              <NutritionPlanEditor
                decisions={{
                  create: decisions.create,
                  update: decisions.update,
                }}
                foods={foods}
                labels={labels}
                onCreate={actions.create}
                onRevision={(body) => actions.revision(planDetail.plan, body)}
                pending={pending}
                planDetail={planDetail}
              />
            ) : null}
          </>
        ) : (
          <NutritionPlanEditor
            decisions={{ create: decisions.create, update: decisions.update }}
            foods={foods}
            labels={labels}
            onCreate={actions.create}
            onRevision={() => undefined}
            pending={pending}
          />
        )}
      </div>
    </section>
  );
}

function PlanDetail({
  labels,
  planDetail,
}: {
  labels: NutritionLabels;
  planDetail: NutritionPlanDetailDto;
}) {
  const { plan, revision } = planDetail;
  return (
    <article className={styles.item}>
      <h3>{plan.name}</h3>
      <div className={styles.meta}>
        <span>{labels.values[plan.status] ?? plan.status}</span>
        <span>v{plan.version}</span>
        <span>{plan.responsibleMembershipId}</span>
      </div>
      {revision ? (
        <>
          <div className={styles.summaryGrid}>
            <span>
              {labels.fields.targetCalories}: {value(revision.targetCalories)}
            </span>
            <span>
              {labels.fields.protein}: {value(revision.targetProteinG)}
            </span>
            <span>
              {labels.fields.carbs}: {value(revision.targetCarbsG)}
            </span>
            <span>
              {labels.fields.fat}: {value(revision.targetFatG)}
            </span>
            <span>
              {labels.fields.waterMl}: {value(revision.waterTargetMl)}
            </span>
          </div>
          <p className={styles.muted}>
            {labels.values.backendTotals}: {value(revision.calculatedCalories)}{" "}
            {labels.values.kcal}
          </p>
          <ul>
            {revision.meals.map((meal) => (
              <li key={meal.mealKey ?? `${meal.order}-${meal.name}`}>
                {meal.order}. {meal.name} ({meal.items.length}{" "}
                {labels.values.items})
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>{labels.empty.plans}</p>
      )}
    </article>
  );
}

function value(input: number | null | undefined): string {
  return input === null || input === undefined ? "—" : String(input);
}

function isArchiveEligible(status: NutritionPlanDto["status"]): boolean {
  return status === "DRAFT" || status === "REPLACED" || status === "COMPLETED";
}

function isRevisionEligible(status: NutritionPlanDto["status"]): boolean {
  return status === "DRAFT" || status === "ACTIVE";
}
