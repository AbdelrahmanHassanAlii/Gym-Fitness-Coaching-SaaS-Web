export type QueryKeyPart =
  | boolean
  | number
  | string
  | null
  | readonly QueryKeyPart[]
  | { readonly [key: string]: QueryKeyPart | undefined };

export type AppQueryKey = readonly ["hassan-web", ...QueryKeyPart[]];

const secretKeyNamePattern =
  /(access|refresh|auth)?token|authorization|password|secret|cookie|supportsessionid|support-session|signedurl/i;

export const appQueryKeys = {
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
};

export function createQueryKey(...parts: QueryKeyPart[]): AppQueryKey {
  for (const part of parts) {
    assertNoSecretQueryKeyPart(part);
  }

  return ["hassan-web", ...parts] as const;
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
