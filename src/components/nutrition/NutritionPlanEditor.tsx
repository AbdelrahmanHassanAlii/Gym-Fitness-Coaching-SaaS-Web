"use client";

import { useForm } from "react-hook-form";
import type {
  CreateNutritionPlanDto,
  CreateNutritionPlanRevisionDto,
  FoodId,
  FoodUnit,
  NutritionFoodDto,
  NutritionPlanDetailDto,
} from "@/contracts";
import { AccessControlledButton, type AccessDecision } from "@/lib/access";
import type { NutritionLabels } from "./NutritionExperience";
import styles from "./nutrition.module.css";

type PlanFormValues = {
  alternativeAmount: string;
  alternativeFoodId: string;
  alternativeUnit: FoodUnit;
  amount: string;
  expectedVersion: string;
  foodId: string;
  mealName: string;
  name: string;
  notes: string;
  responsibleMembershipId: string;
  targetCalories: string;
  targetCarbsG: string;
  targetFatG: string;
  targetProteinG: string;
  unit: FoodUnit;
  waterTargetMl: string;
};

const units: readonly FoodUnit[] = ["GRAM", "MILLILITER", "UNIT", "SERVING"];

export function NutritionPlanEditor({
  decisions,
  foods,
  labels,
  onCreate,
  onRevision,
  pending,
  planDetail,
}: {
  decisions: {
    create: AccessDecision;
    update: AccessDecision;
  };
  foods: readonly NutritionFoodDto[];
  labels: NutritionLabels;
  onCreate: (body: CreateNutritionPlanDto) => void;
  onRevision: (body: CreateNutritionPlanRevisionDto) => void;
  pending: boolean;
  planDetail?: NutritionPlanDetailDto;
}) {
  const form = useForm<PlanFormValues>({
    defaultValues: defaults(planDetail),
    values: defaults(planDetail),
  });
  const selectedFoodOptions = foods.filter((food) => food.status === "ACTIVE");
  const canRevise = planDetail !== undefined;

  return (
    <section className={styles.panel}>
      <h3>{canRevise ? labels.plans.revision : labels.plans.editor}</h3>
      <form
        className={styles.formGrid}
        onSubmit={form.handleSubmit((values) => {
          const content = revisionContent(values);
          if (content === null) return;
          if (canRevise) {
            const expectedVersion = Number(values.expectedVersion);
            if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0)
              return;
            onRevision({ ...content, expectedVersion });
          } else {
            if (!values.name.trim()) return;
            onCreate({
              ...content,
              name: values.name.trim(),
              ...(values.responsibleMembershipId.trim()
                ? {
                    responsibleMembershipId:
                      values.responsibleMembershipId.trim() as never,
                  }
                : {}),
            });
          }
        })}
      >
        {!canRevise ? (
          <>
            <label>
              <span>{labels.fields.nameEn}</span>
              <input {...form.register("name")} />
            </label>
            <label>
              <span>{labels.fields.responsibleMembership}</span>
              <input {...form.register("responsibleMembershipId")} />
            </label>
          </>
        ) : (
          <label>
            <span>{labels.fields.expectedVersion}</span>
            <input inputMode="numeric" {...form.register("expectedVersion")} />
          </label>
        )}
        <label>
          <span>{labels.fields.targetCalories}</span>
          <input inputMode="decimal" {...form.register("targetCalories")} />
        </label>
        <label>
          <span>{labels.fields.protein}</span>
          <input inputMode="decimal" {...form.register("targetProteinG")} />
        </label>
        <label>
          <span>{labels.fields.carbs}</span>
          <input inputMode="decimal" {...form.register("targetCarbsG")} />
        </label>
        <label>
          <span>{labels.fields.fat}</span>
          <input inputMode="decimal" {...form.register("targetFatG")} />
        </label>
        <label>
          <span>{labels.fields.waterMl}</span>
          <input inputMode="decimal" {...form.register("waterTargetMl")} />
        </label>
        <label>
          <span>{labels.fields.meal}</span>
          <input {...form.register("mealName")} />
        </label>
        <label>
          <span>{labels.fields.food}</span>
          <select {...form.register("foodId")}>
            <option value="">{labels.empty.foods}</option>
            {selectedFoodOptions.map((food) => (
              <option key={food.id} value={food.id}>
                {food.names.en ?? food.names.ar ?? food.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{labels.fields.amount}</span>
          <input inputMode="decimal" {...form.register("amount")} />
        </label>
        <label>
          <span>{labels.fields.unit}</span>
          <select {...form.register("unit")}>
            {units.map((unit) => (
              <option key={unit} value={unit}>
                {labels.values[unit] ?? unit}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{labels.values.alternativeFood}</span>
          <select {...form.register("alternativeFoodId")}>
            <option value="">{labels.values.none}</option>
            {selectedFoodOptions.map((food) => (
              <option key={food.id} value={food.id}>
                {food.names.en ?? food.names.ar ?? food.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{labels.fields.amount}</span>
          <input inputMode="decimal" {...form.register("alternativeAmount")} />
        </label>
        <label>
          <span>{labels.fields.notes}</span>
          <textarea {...form.register("notes")} />
        </label>
        <AccessControlledButton
          decision={canRevise ? decisions.update : decisions.create}
          disabled={pending}
          disabledReason={labels.errors.denied}
          loadingLabel={labels.loading}
          type="submit"
        >
          {canRevise ? labels.actions.submitRevision : labels.actions.create}
        </AccessControlledButton>
      </form>
    </section>
  );
}

function defaults(planDetail?: NutritionPlanDetailDto): PlanFormValues {
  const revision = planDetail?.revision;
  const firstMeal = revision?.meals[0];
  const firstItem = firstMeal?.items[0];
  return {
    alternativeAmount: "",
    alternativeFoodId: "",
    alternativeUnit: "GRAM",
    amount: firstItem ? String(firstItem.selectedAmount) : "100",
    expectedVersion: planDetail ? String(planDetail.plan.version) : "",
    foodId: firstItem?.foodId ?? "",
    mealName: firstMeal?.name ?? "",
    name: planDetail?.plan.name ?? "",
    notes: revision?.notes ?? "",
    responsibleMembershipId: "",
    targetCalories: optionalNumberString(revision?.targetCalories),
    targetCarbsG: optionalNumberString(revision?.targetCarbsG),
    targetFatG: optionalNumberString(revision?.targetFatG),
    targetProteinG: optionalNumberString(revision?.targetProteinG),
    unit: firstItem?.selectedUnit ?? "GRAM",
    waterTargetMl: optionalNumberString(revision?.waterTargetMl),
  };
}

function revisionContent(
  values: PlanFormValues,
): Omit<CreateNutritionPlanDto, "name" | "responsibleMembershipId"> | null {
  const foodId = values.foodId.trim() as FoodId;
  const amount = positive(values.amount);
  const mealName = values.mealName.trim();
  if (!foodId || amount === null || !mealName) return null;

  const alternativeFoodId = values.alternativeFoodId.trim() as FoodId;
  const alternativeAmount = positive(values.alternativeAmount);
  return {
    meals: [
      {
        alternativeGroups:
          alternativeFoodId && alternativeAmount !== null
            ? [
                {
                  options: [
                    {
                      items: [
                        {
                          foodId: alternativeFoodId,
                          selectedAmount: alternativeAmount,
                          selectedUnit: values.alternativeUnit,
                        },
                      ],
                      order: 1,
                    },
                  ],
                  order: 1,
                  selectionRule: "CHOOSE_ONE",
                },
              ]
            : undefined,
        items: [{ foodId, selectedAmount: amount, selectedUnit: values.unit }],
        name: mealName,
        notes: values.notes.trim() || undefined,
        order: 1,
        type: "REGULAR",
      },
    ],
    notes: values.notes.trim() || undefined,
    targetCalories: optionalPositive(values.targetCalories),
    targetCarbsG: optionalPositive(values.targetCarbsG),
    targetFatG: optionalPositive(values.targetFatG),
    targetProteinG: optionalPositive(values.targetProteinG),
    waterTargetMl: optionalPositive(values.waterTargetMl),
  };
}

function positive(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function optionalPositive(value: string): number | undefined {
  return value.trim() ? (positive(value) ?? undefined) : undefined;
}

function optionalNumberString(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}
