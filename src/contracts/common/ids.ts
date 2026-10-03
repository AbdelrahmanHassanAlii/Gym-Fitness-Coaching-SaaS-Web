declare const apiIdKind: unique symbol;

export type ApiId<Kind extends string> = string & {
  readonly [apiIdKind]: Kind;
};

export type WorkspaceId = ApiId<"workspace">;
export type BranchId = ApiId<"branch">;
export type MembershipId = ApiId<"membership">;
export type UserId = ApiId<"user">;
export type RelationshipId = ApiId<"coaching-relationship">;
export type ProgramId = ApiId<"training-program">;
export type ProgramRevisionId = ApiId<"training-program-revision">;
export type WorkoutId = ApiId<"workout-session">;
export type ExerciseId = ApiId<"exercise">;
export type PersonalRecordId = ApiId<"personal-record">;
export type PersonalRecordEventId = ApiId<"personal-record-event">;
export type FileId = ApiId<"file">;
export type DocumentId = ApiId<"document">;
export type NotificationId = ApiId<"notification">;
export type SupportSessionId = ApiId<"support-session">;

export function unsafeApiId<Kind extends string>(value: string): ApiId<Kind> {
  return value as ApiId<Kind>;
}
