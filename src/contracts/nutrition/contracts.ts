import type {
  DailyTrackingEntryId,
  FoodId,
  MembershipId,
  NutritionPlanId,
  NutritionPlanRevisionId,
  RelationshipId,
  WorkspaceId,
} from "@/contracts/common/ids";
import { isOffsetTimestamp } from "@/lib/date-time";

export const foodScopes = ["SYSTEM", "GYM", "PRIVATE"] as const;
export const foodUnits = ["GRAM", "MILLILITER", "UNIT", "SERVING"] as const;
export const foodStatuses = ["ACTIVE", "ARCHIVED"] as const;
export const nutritionPlanStatuses = [
  "DRAFT",
  "ACTIVE",
  "REPLACED",
  "COMPLETED",
  "ARCHIVED",
] as const;
export const nutritionMealTypes = ["REGULAR", "FLEXIBLE", "CHEAT"] as const;
export const nutritionAnalyticsGranularities = ["day", "week"] as const;

export type FoodScope = (typeof foodScopes)[number];
export type FoodUnit = (typeof foodUnits)[number];
export type FoodStatus = (typeof foodStatuses)[number];
export type NutritionPlanStatus = (typeof nutritionPlanStatuses)[number];
export type NutritionMealType = (typeof nutritionMealTypes)[number];
export type NutritionAnalyticsGranularity =
  (typeof nutritionAnalyticsGranularities)[number];

export interface FoodNamesDto {
  ar?: string;
  en?: string;
}

export interface NutritionFoodDto {
  baseAmount: number;
  baseUnit: FoodUnit;
  calories: number;
  carbsG: number;
  fatG: number;
  id: FoodId;
  names: FoodNamesDto;
  proteinG: number;
  scope: FoodScope;
  status: FoodStatus;
  version: number;
  workspaceId?: WorkspaceId;
}

export interface NutritionFoodCommandResponseDto {
  food: NutritionFoodDto;
}

export interface NutritionFoodBodyDto {
  baseAmount: number;
  baseUnit: FoodUnit;
  calories: number;
  carbsG: number;
  fatG: number;
  names: FoodNamesDto;
  proteinG: number;
  scope?: "GYM" | "PRIVATE";
}

export interface NutritionFoodPatchDto extends Partial<
  Omit<NutritionFoodBodyDto, "scope">
> {
  expectedVersion: number;
}

export interface ExpectedVersionDto {
  expectedVersion: number;
}

export interface NutritionFoodItemDto {
  calculatedCalories?: number;
  calculatedCarbsG?: number;
  calculatedFatG?: number;
  calculatedProteinG?: number;
  foodId: FoodId;
  foodNameSnapshot?: FoodNamesDto;
  foodScopeSnapshot?: FoodScope;
  foodVersionSnapshot?: number;
  foodWorkspaceIdSnapshot?: WorkspaceId;
  itemKey?: string;
  selectedAmount: number;
  selectedUnit: FoodUnit;
}

export interface NutritionAlternativeOptionDto {
  items: readonly NutritionFoodItemDto[];
  optionKey?: string;
  order: number;
}

export interface NutritionAlternativeGroupDto {
  groupKey?: string;
  options: readonly NutritionAlternativeOptionDto[];
  order: number;
  selectionRule?: "CHOOSE_ONE";
}

export interface NutritionMealDto {
  alternativeGroups: readonly NutritionAlternativeGroupDto[];
  items: readonly NutritionFoodItemDto[];
  mealKey?: string;
  name: string;
  notes?: string;
  order: number;
  type?: NutritionMealType;
}

export interface NutritionSupplementDto {
  amount?: number;
  name: string;
  notes?: string;
  order: number;
  supplementKey?: string;
  timing?: string;
  unit?: string;
}

export interface NutritionPlanDto {
  currentRevisionId: NutritionPlanRevisionId;
  endedAt?: string;
  id: NutritionPlanId;
  name: string;
  relationshipId: RelationshipId;
  responsibleMembershipId: MembershipId;
  startedAt?: string;
  status: NutritionPlanStatus;
  version: number;
  workspaceId: WorkspaceId;
}

export interface NutritionPlanRevisionDto {
  calculatedCalories?: number;
  calculatedCarbsG?: number;
  calculatedFatG?: number;
  calculatedProteinG?: number;
  id: NutritionPlanRevisionId;
  meals: readonly NutritionMealDto[];
  notes?: string;
  nutritionPlanId: NutritionPlanId;
  revision: number;
  supplements: readonly NutritionSupplementDto[];
  targetCalories?: number | null;
  targetCarbsG?: number | null;
  targetFatG?: number | null;
  targetProteinG?: number | null;
  waterTargetMl?: number | null;
}

export interface NutritionPlanDetailDto {
  plan: NutritionPlanDto;
  revision: NutritionPlanRevisionDto | null;
}

export interface NutritionPlanCommandResponseDto {
  plan: NutritionPlanDto;
}

export interface NutritionPlanRevisionCommandResponseDto {
  plan: NutritionPlanDto;
  revision: NutritionPlanRevisionDto;
}

export interface NutritionRevisionContentDto {
  meals: NutritionMealRequestDto[];
  notes?: string;
  supplements?: NutritionSupplementRequestDto[];
  targetCalories?: number;
  targetCarbsG?: number;
  targetFatG?: number;
  targetProteinG?: number;
  waterTargetMl?: number;
}

export interface CreateNutritionPlanDto extends NutritionRevisionContentDto {
  name: string;
  responsibleMembershipId?: MembershipId;
}

export interface CreateNutritionPlanRevisionDto extends NutritionRevisionContentDto {
  expectedVersion: number;
}

export interface NutritionFoodItemRequestDto {
  foodId: FoodId;
  selectedAmount: number;
  selectedUnit: FoodUnit;
}

export interface NutritionAlternativeOptionRequestDto {
  items: NutritionFoodItemRequestDto[];
  optionKey?: string;
  order: number;
}

export interface NutritionAlternativeGroupRequestDto {
  groupKey?: string;
  options: NutritionAlternativeOptionRequestDto[];
  order: number;
  selectionRule?: "CHOOSE_ONE";
}

export interface NutritionMealRequestDto {
  alternativeGroups?: NutritionAlternativeGroupRequestDto[];
  items?: NutritionFoodItemRequestDto[];
  mealKey?: string;
  name: string;
  notes?: string;
  order: number;
  type?: NutritionMealType;
}

export interface NutritionSupplementRequestDto {
  amount?: number;
  name: string;
  notes?: string;
  order: number;
  supplementKey?: string;
  timing?: string;
  unit?: string;
}

export interface DailyTrackingEntryDto {
  id: DailyTrackingEntryId;
  localDate: string;
  timezoneAtEntry: string;
  values: Record<string, unknown>;
  version: number;
}

export interface DailyTrackingEnvelopeDto {
  dailyTrackingEntry: DailyTrackingEntryDto | null;
}

export interface NutritionAnalyticsDto {
  activePlan: { id: NutritionPlanId; name: string } | null;
  nutritionTracking: {
    averageAdherenceRate: number | null;
    daysTracked: number;
  };
  range: { from: string; timezone: string; to: string };
  relationshipId: RelationshipId;
  series: readonly NutritionAnalyticsSeriesDto[];
  targets: {
    targetCalories: number | null;
    targetCarbsG: number | null;
    targetFatG: number | null;
    targetProteinG: number | null;
    waterTargetMl: number | null;
  } | null;
  waterTracking: {
    averageMl: number | null;
    daysTracked: number;
    targetMl: number | null;
  };
  workspaceId: WorkspaceId;
}

export interface NutritionAnalyticsSeriesDto {
  averageWaterMl: number | null;
  from: string;
  key: string;
  nutritionAdherenceRate: number | null;
  to: string;
  waterAdherenceRate: number | null;
}

export const isNutritionFoodDto = (value: unknown): value is NutritionFoodDto =>
  isRecord(value) &&
  idField(value.id) &&
  literalSet(value.scope, foodScopes) &&
  (value.scope === "SYSTEM"
    ? value.workspaceId === undefined
    : idField(value.workspaceId)) &&
  isFoodNames(value.names) &&
  positiveNumber(value.baseAmount) &&
  literalSet(value.baseUnit, foodUnits) &&
  nonNegativeNumber(value.calories) &&
  nonNegativeNumber(value.proteinG) &&
  nonNegativeNumber(value.carbsG) &&
  nonNegativeNumber(value.fatG) &&
  literalSet(value.status, foodStatuses) &&
  versionField(value.version);

export const isNutritionFoodCommandResponseDto = (
  value: unknown,
): value is NutritionFoodCommandResponseDto =>
  isRecord(value) && isNutritionFoodDto(value.food);

export const isNutritionPlanDto = (value: unknown): value is NutritionPlanDto =>
  isRecord(value) &&
  idField(value.id) &&
  idField(value.workspaceId) &&
  idField(value.relationshipId) &&
  typeof value.name === "string" &&
  literalSet(value.status, nutritionPlanStatuses) &&
  idField(value.responsibleMembershipId) &&
  idField(value.currentRevisionId) &&
  optionalTimestamp(value.startedAt) &&
  optionalTimestamp(value.endedAt) &&
  versionField(value.version);

export const isNutritionPlanRevisionDto = (
  value: unknown,
): value is NutritionPlanRevisionDto =>
  isRecord(value) &&
  idField(value.id) &&
  idField(value.nutritionPlanId) &&
  versionField(value.revision) &&
  optionalNullableNumber(value.targetCalories) &&
  optionalNullableNumber(value.targetProteinG) &&
  optionalNullableNumber(value.targetCarbsG) &&
  optionalNullableNumber(value.targetFatG) &&
  optionalNullableNumber(value.waterTargetMl) &&
  optionalNumber(value.calculatedCalories) &&
  optionalNumber(value.calculatedProteinG) &&
  optionalNumber(value.calculatedCarbsG) &&
  optionalNumber(value.calculatedFatG) &&
  Array.isArray(value.meals) &&
  value.meals.every(isNutritionMealDto) &&
  Array.isArray(value.supplements) &&
  value.supplements.every(isNutritionSupplementDto) &&
  optionalString(value.notes);

export const isNutritionPlanDetailDto = (
  value: unknown,
): value is NutritionPlanDetailDto =>
  isRecord(value) &&
  isNutritionPlanDto(value.plan) &&
  (value.revision === null || isNutritionPlanRevisionDto(value.revision));

export const isNutritionPlanCommandResponseDto = (
  value: unknown,
): value is NutritionPlanCommandResponseDto =>
  isRecord(value) && isNutritionPlanDto(value.plan);

export const isNutritionPlanRevisionCommandResponseDto = (
  value: unknown,
): value is NutritionPlanRevisionCommandResponseDto =>
  isRecord(value) &&
  isNutritionPlanDto(value.plan) &&
  isNutritionPlanRevisionDto(value.revision);

export const isDailyTrackingEnvelopeDto = (
  value: unknown,
): value is DailyTrackingEnvelopeDto =>
  isRecord(value) &&
  (value.dailyTrackingEntry === null ||
    isDailyTrackingEntryDto(value.dailyTrackingEntry));

export const isNutritionAnalyticsDto = (
  value: unknown,
): value is NutritionAnalyticsDto =>
  isRecord(value) &&
  idField(value.workspaceId) &&
  idField(value.relationshipId) &&
  isRecord(value.range) &&
  timestamp(value.range.from) &&
  timestamp(value.range.to) &&
  validTimezone(value.range.timezone) &&
  (value.activePlan === null ||
    (isRecord(value.activePlan) &&
      idField(value.activePlan.id) &&
      typeof value.activePlan.name === "string")) &&
  (value.targets === null ||
    (isRecord(value.targets) &&
      nullableNumber(value.targets.targetCalories) &&
      nullableNumber(value.targets.targetProteinG) &&
      nullableNumber(value.targets.targetCarbsG) &&
      nullableNumber(value.targets.targetFatG) &&
      nullableNumber(value.targets.waterTargetMl))) &&
  isRecord(value.nutritionTracking) &&
  versionField(value.nutritionTracking.daysTracked) &&
  nullableNumber(value.nutritionTracking.averageAdherenceRate) &&
  isRecord(value.waterTracking) &&
  versionField(value.waterTracking.daysTracked) &&
  nullableNumber(value.waterTracking.averageMl) &&
  nullableNumber(value.waterTracking.targetMl) &&
  Array.isArray(value.series) &&
  value.series.every(isNutritionAnalyticsSeriesDto);

function isNutritionMealDto(value: unknown): value is NutritionMealDto {
  return (
    isRecord(value) &&
    optionalString(value.mealKey) &&
    versionField(value.order) &&
    typeof value.name === "string" &&
    optionalLiteralSet(value.type, nutritionMealTypes) &&
    Array.isArray(value.items) &&
    value.items.every(isNutritionFoodItemDto) &&
    Array.isArray(value.alternativeGroups) &&
    value.alternativeGroups.every(isNutritionAlternativeGroupDto) &&
    optionalString(value.notes)
  );
}

function isNutritionFoodItemDto(value: unknown): value is NutritionFoodItemDto {
  return (
    isRecord(value) &&
    idField(value.foodId) &&
    positiveNumber(value.selectedAmount) &&
    literalSet(value.selectedUnit, foodUnits) &&
    optionalNumber(value.calculatedCalories) &&
    optionalNumber(value.calculatedProteinG) &&
    optionalNumber(value.calculatedCarbsG) &&
    optionalNumber(value.calculatedFatG) &&
    optionalString(value.itemKey) &&
    optionalFoodNames(value.foodNameSnapshot) &&
    optionalLiteralSet(value.foodScopeSnapshot, foodScopes) &&
    optionalNumber(value.foodVersionSnapshot) &&
    optionalString(value.foodWorkspaceIdSnapshot)
  );
}

function isNutritionAlternativeGroupDto(
  value: unknown,
): value is NutritionAlternativeGroupDto {
  return (
    isRecord(value) &&
    optionalString(value.groupKey) &&
    versionField(value.order) &&
    (value.selectionRule === undefined ||
      value.selectionRule === "CHOOSE_ONE") &&
    Array.isArray(value.options) &&
    value.options.every(isNutritionAlternativeOptionDto)
  );
}

function isNutritionAlternativeOptionDto(
  value: unknown,
): value is NutritionAlternativeOptionDto {
  return (
    isRecord(value) &&
    optionalString(value.optionKey) &&
    versionField(value.order) &&
    Array.isArray(value.items) &&
    value.items.every(isNutritionFoodItemDto)
  );
}

function isNutritionSupplementDto(
  value: unknown,
): value is NutritionSupplementDto {
  return (
    isRecord(value) &&
    optionalString(value.supplementKey) &&
    versionField(value.order) &&
    typeof value.name === "string" &&
    optionalNumber(value.amount) &&
    optionalString(value.unit) &&
    optionalString(value.timing) &&
    optionalString(value.notes)
  );
}

function isDailyTrackingEntryDto(
  value: unknown,
): value is DailyTrackingEntryDto {
  return (
    isRecord(value) &&
    idField(value.id) &&
    localDate(value.localDate) &&
    typeof value.timezoneAtEntry === "string" &&
    isRecord(value.values) &&
    versionField(value.version)
  );
}

function isNutritionAnalyticsSeriesDto(
  value: unknown,
): value is NutritionAnalyticsSeriesDto {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    timestamp(value.from) &&
    timestamp(value.to) &&
    nullableNumber(value.nutritionAdherenceRate) &&
    nullableNumber(value.averageWaterMl) &&
    nullableNumber(value.waterAdherenceRate)
  );
}

function isFoodNames(value: unknown): value is FoodNamesDto {
  return (
    isRecord(value) &&
    optionalString(value.ar) &&
    optionalString(value.en) &&
    (typeof value.ar === "string" || typeof value.en === "string")
  );
}

function optionalFoodNames(value: unknown): value is FoodNamesDto | undefined {
  return value === undefined || isFoodNames(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function literalSet<T extends readonly string[]>(
  value: unknown,
  items: T,
): value is T[number] {
  return typeof value === "string" && items.includes(value);
}

function optionalLiteralSet<T extends readonly string[]>(
  value: unknown,
  items: T,
): value is T[number] | undefined {
  return value === undefined || literalSet(value, items);
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function numberField(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function optionalNumber(value: unknown): value is number | undefined {
  return value === undefined || numberField(value);
}

function nullableNumber(value: unknown): value is number | null {
  return value === null || numberField(value);
}

function optionalNullableNumber(
  value: unknown,
): value is number | null | undefined {
  return value === undefined || nullableNumber(value);
}

function nonNegativeNumber(value: unknown): value is number {
  return numberField(value) && value >= 0;
}

function positiveNumber(value: unknown): value is number {
  return numberField(value) && value > 0;
}

function versionField(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function idField(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]+$/.test(value);
}

function localDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && isOffsetTimestamp(value);
}

function validTimezone(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function optionalTimestamp(value: unknown): value is string | undefined {
  return value === undefined || timestamp(value);
}
