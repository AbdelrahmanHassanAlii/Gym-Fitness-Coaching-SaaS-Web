"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import type {
  FoodUnit,
  NutritionFoodBodyDto,
  NutritionFoodDto,
  NutritionFoodPatchDto,
} from "@/contracts";
import { AccessControlledButton, type AccessDecision } from "@/lib/access";
import type { NutritionLabels } from "./NutritionExperience";
import styles from "./nutrition.module.css";

type FoodFormValues = {
  baseAmount: string;
  baseUnit: FoodUnit;
  calories: string;
  carbsG: string;
  fatG: string;
  nameAr: string;
  nameEn: string;
  proteinG: string;
  scope: "GYM" | "PRIVATE";
};

const foodUnits: readonly FoodUnit[] = [
  "GRAM",
  "MILLILITER",
  "UNIT",
  "SERVING",
];

export function NutritionFoodLibrary({
  actions,
  decisions,
  foods,
  includeArchived,
  isLoading,
  labels,
  nextCursor,
  onIncludeArchivedChange,
  onLoadMore,
  pending,
}: {
  actions: {
    archive: (food: NutritionFoodDto) => void;
    create: (body: NutritionFoodBodyDto) => void;
    update: (food: NutritionFoodDto, body: NutritionFoodPatchDto) => void;
  };
  decisions: {
    archive: AccessDecision;
    create: AccessDecision;
    read: AccessDecision;
    update: AccessDecision;
  };
  foods: readonly NutritionFoodDto[];
  includeArchived: boolean;
  isLoading: boolean;
  labels: NutritionLabels;
  nextCursor?: string;
  onIncludeArchivedChange: (value: boolean) => void;
  onLoadMore: () => void;
  pending: boolean;
}) {
  const [editingFoodId, setEditingFoodId] = useState<string | null>(null);
  const form = useForm<FoodFormValues>({
    defaultValues: emptyFoodForm(),
  });

  if (!decisions.read.allowed) {
    return <Denied decision={decisions.read} labels={labels} />;
  }

  const editingFood = foods.find((food) => food.id === editingFoodId);

  return (
    <section className={styles.panel} aria-busy={isLoading}>
      <header className={styles.header}>
        <h2>{labels.foods.title}</h2>
        <p className={styles.muted}>{labels.capped}</p>
      </header>
      <form
        className={styles.formGrid}
        onSubmit={form.handleSubmit((values) => {
          const body = foodBody(values);
          if (!body) return;
          if (editingFood) {
            actions.update(editingFood, {
              baseAmount: body.baseAmount,
              baseUnit: body.baseUnit,
              calories: body.calories,
              carbsG: body.carbsG,
              expectedVersion: editingFood.version,
              fatG: body.fatG,
              names: body.names,
              proteinG: body.proteinG,
            });
          } else {
            actions.create(body);
          }
          form.reset(emptyFoodForm());
          setEditingFoodId(null);
        })}
      >
        <label>
          <span>{labels.fields.nameEn}</span>
          <input {...form.register("nameEn")} />
        </label>
        <label>
          <span>{labels.fields.nameAr}</span>
          <input {...form.register("nameAr")} />
        </label>
        <label>
          <span>{labels.fields.foodScope}</span>
          <select {...form.register("scope")}>
            <option value="PRIVATE">PRIVATE</option>
            <option value="GYM">GYM</option>
          </select>
        </label>
        <label>
          <span>{labels.fields.amount}</span>
          <input inputMode="decimal" {...form.register("baseAmount")} />
        </label>
        <label>
          <span>{labels.fields.unit}</span>
          <select {...form.register("baseUnit")}>
            {foodUnits.map((unit) => (
              <option key={unit} value={unit}>
                {labels.values[unit] ?? unit}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{labels.fields.calories}</span>
          <input inputMode="decimal" {...form.register("calories")} />
        </label>
        <label>
          <span>{labels.fields.protein}</span>
          <input inputMode="decimal" {...form.register("proteinG")} />
        </label>
        <label>
          <span>{labels.fields.carbs}</span>
          <input inputMode="decimal" {...form.register("carbsG")} />
        </label>
        <label>
          <span>{labels.fields.fat}</span>
          <input inputMode="decimal" {...form.register("fatG")} />
        </label>
        <AccessControlledButton
          decision={decisions.create}
          disabled={pending}
          disabledReason={labels.errors.denied}
          loadingLabel={labels.loading}
          type="submit"
        >
          {editingFood ? labels.actions.save : labels.actions.create}
        </AccessControlledButton>
      </form>
      <p className={styles.muted}>{labels.foods.createScopeHelp}</p>
      <label>
        <input
          checked={includeArchived}
          onChange={(event) => onIncludeArchivedChange(event.target.checked)}
          type="checkbox"
        />{" "}
        {labels.values.includeArchived}
      </label>
      {isLoading ? <p>{labels.loading}</p> : null}
      {foods.length === 0 && !isLoading ? <p>{labels.empty.foods}</p> : null}
      <div className={styles.list}>
        {foods.map((food) => {
          const system = food.scope === "SYSTEM";
          const gym = food.scope === "GYM";
          const mutablePrivate = food.scope === "PRIVATE";
          return (
            <article className={styles.item} key={food.id}>
              <strong>{foodName(food)}</strong>
              <div className={styles.meta}>
                <span>{labels.values[food.scope] ?? food.scope}</span>
                <span>{labels.values[food.status] ?? food.status}</span>
                <span>v{food.version}</span>
                <span>
                  {food.calories} {labels.values.kcal}
                </span>
                <span>
                  P {food.proteinG} / C {food.carbsG} / F {food.fatG}
                </span>
              </div>
              {system ? (
                <p className={styles.muted}>{labels.foods.systemReadOnly}</p>
              ) : null}
              {gym ? (
                <p className={styles.muted}>{labels.foods.conservativeGym}</p>
              ) : null}
              <div className={styles.actions}>
                <AccessControlledButton
                  decision={decisions.update}
                  disabled={pending || system || gym || !mutablePrivate}
                  disabledReason={labels.errors.denied}
                  loadingLabel={labels.loading}
                  onClick={() => {
                    setEditingFoodId(food.id);
                    form.reset(formValuesFromFood(food));
                  }}
                  type="button"
                >
                  {labels.actions.edit}
                </AccessControlledButton>
                <AccessControlledButton
                  decision={decisions.archive}
                  disabled={
                    pending || system || gym || food.status === "ARCHIVED"
                  }
                  disabledReason={labels.errors.denied}
                  loadingLabel={labels.loading}
                  onClick={() => {
                    if (confirm(labels.confirm.archiveFood))
                      actions.archive(food);
                  }}
                  type="button"
                >
                  {labels.actions.archive}
                </AccessControlledButton>
              </div>
            </article>
          );
        })}
      </div>
      {nextCursor ? (
        <button disabled={isLoading} onClick={onLoadMore} type="button">
          {labels.actions.loadMore}
        </button>
      ) : null}
    </section>
  );
}

function Denied({
  decision,
  labels,
}: {
  decision: AccessDecision;
  labels: NutritionLabels;
}) {
  return (
    <section className={styles.statePanel}>
      <h2>{labels.foods.title}</h2>
      <p>
        {decision.status === "unresolved"
          ? labels.loading
          : labels.errors.denied}
      </p>
    </section>
  );
}

function emptyFoodForm(): FoodFormValues {
  return {
    baseAmount: "100",
    baseUnit: "GRAM",
    calories: "0",
    carbsG: "0",
    fatG: "0",
    nameAr: "",
    nameEn: "",
    proteinG: "0",
    scope: "PRIVATE",
  };
}

function formValuesFromFood(food: NutritionFoodDto): FoodFormValues {
  return {
    baseAmount: String(food.baseAmount),
    baseUnit: food.baseUnit,
    calories: String(food.calories),
    carbsG: String(food.carbsG),
    fatG: String(food.fatG),
    nameAr: food.names.ar ?? "",
    nameEn: food.names.en ?? "",
    proteinG: String(food.proteinG),
    scope: food.scope === "GYM" ? "GYM" : "PRIVATE",
  };
}

function foodBody(values: FoodFormValues): NutritionFoodBodyDto | null {
  const baseAmount = positive(values.baseAmount);
  const calories = nonNegative(values.calories);
  const proteinG = nonNegative(values.proteinG);
  const carbsG = nonNegative(values.carbsG);
  const fatG = nonNegative(values.fatG);
  if (
    baseAmount === null ||
    calories === null ||
    proteinG === null ||
    carbsG === null ||
    fatG === null ||
    (!values.nameAr.trim() && !values.nameEn.trim())
  ) {
    return null;
  }
  return {
    baseAmount,
    baseUnit: values.baseUnit,
    calories,
    carbsG,
    fatG,
    names: {
      ...(values.nameAr.trim() ? { ar: values.nameAr.trim() } : {}),
      ...(values.nameEn.trim() ? { en: values.nameEn.trim() } : {}),
    },
    proteinG,
    scope: values.scope,
  };
}

function positive(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function nonNegative(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function foodName(food: NutritionFoodDto): string {
  return food.names.en ?? food.names.ar ?? food.id;
}
