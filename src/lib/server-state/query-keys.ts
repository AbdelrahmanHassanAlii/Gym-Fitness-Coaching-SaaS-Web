export type QueryKeyPart =
  | boolean
  | number
  | string
  | null
  | readonly QueryKeyPart[]
  | { readonly [key: string]: QueryKeyPart | undefined };

export type AppQueryKey = readonly ["hassan-web", ...QueryKeyPart[]];
export type AuthorizationCacheContext = "support" | "user";

const secretKeyNamePattern =
  /(access|refresh|auth)?token|authorization|password|secret|cookie|supportsessionid|support-session|signedurl/i;

export const appQueryKeys = {
  accessContext: (context: AuthorizationCacheContext) =>
    ["access-context", context] as const,
  all: ["hassan-web"] as const,
  detail: (scope: QueryKeyPart, resource: string, id: QueryKeyPart) =>
    createQueryKey(scope, resource, "detail", id),
  list: (
    scope: QueryKeyPart,
    resource: string,
    filters?: { readonly [key: string]: QueryKeyPart | undefined },
  ) => createQueryKey(scope, resource, "list", filters ?? null),
  relationship: (workspaceId: string, relationshipId: string) =>
    createQueryKey("workspace", workspaceId, "relationship", relationshipId),
  resource: (scope: QueryKeyPart, resource: string) =>
    createQueryKey(scope, resource),
  workspace: (workspaceId: string) => createQueryKey("workspace", workspaceId),
  workspaceDetail: (
    workspaceId: string,
    resource: string,
    id: QueryKeyPart,
    context: AuthorizationCacheContext = "user",
  ) =>
    createQueryKey(
      "workspace",
      workspaceId,
      ...appQueryKeys.accessContext(context),
      resource,
      "detail",
      id,
    ),
  workspaceList: (
    workspaceId: string,
    resource: string,
    filters?: { readonly [key: string]: QueryKeyPart | undefined },
    context: AuthorizationCacheContext = "user",
  ) =>
    createQueryKey(
      "workspace",
      workspaceId,
      ...appQueryKeys.accessContext(context),
      resource,
      "list",
      filters ?? null,
    ),
};

export function createQueryKey(...parts: QueryKeyPart[]): AppQueryKey {
  return ["hassan-web", ...parts.map(normalizeQueryKeyPart)] as const;
}

function normalizeQueryKeyPart(part: QueryKeyPart): QueryKeyPart {
  assertNoSecretQueryKeyPart(part);

  if (part === null || typeof part !== "object") {
    return part;
  }

  if (Array.isArray(part)) {
    return part.map(normalizeQueryKeyPart);
  }

  const prototype = Object.getPrototypeOf(part);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("Query keys only accept plain serializable objects");
  }

  const objectPart = part as {
    readonly [key: string]: QueryKeyPart | undefined;
  };
  const normalized: Record<string, QueryKeyPart> = {};
  for (const key of Object.keys(objectPart).sort()) {
    const value = objectPart[key];
    if (value !== undefined) {
      normalized[key] = normalizeQueryKeyPart(value);
    }
  }

  return normalized;
}

function assertNoSecretQueryKeyPart(part: QueryKeyPart | undefined): void {
  if (part === undefined || part === null) {
    return;
  }

  if (Array.isArray(part)) {
    for (const item of part) {
      assertNoSecretQueryKeyPart(item);
    }
    return;
  }

  if (typeof part !== "object") {
    return;
  }

  for (const [key, value] of Object.entries(part)) {
    if (secretKeyNamePattern.test(key)) {
      throw new Error(`Query keys must not include sensitive field: ${key}`);
    }

    assertNoSecretQueryKeyPart(value);
  }
}
