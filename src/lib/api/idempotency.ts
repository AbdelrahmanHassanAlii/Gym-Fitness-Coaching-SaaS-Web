export function createIdempotencyKey(): string {
  const randomUuid = globalThis.crypto?.randomUUID;

  if (typeof randomUuid !== "function") {
    throw new Error("crypto.randomUUID is required to create idempotency keys");
  }

  return randomUuid.call(globalThis.crypto);
}
