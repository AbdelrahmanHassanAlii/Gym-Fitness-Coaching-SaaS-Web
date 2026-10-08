import { beforeEach, describe, expect, test } from "vitest";
import { notificationCommandRegistry } from "./command-state";

const boundary = {
  accessContext: "user" as const,
  membershipId: "membership_a",
  principalId: "user_a",
  workspaceId: "workspace_a",
};

describe("notification command-state registry", () => {
  beforeEach(() => notificationCommandRegistry.resetForTests());

  test("blocks duplicate pending work and preserves ambiguity across auth generations", () => {
    const id = notificationCommandRegistry.logicalId(
      boundary,
      "mark-one",
      "notification_a",
    );
    expect(notificationCommandRegistry.begin(id)).toBe("started");
    expect(notificationCommandRegistry.begin(id)).toBe("duplicate");
    notificationCommandRegistry.ambiguous(id);
    expect(notificationCommandRegistry.status(id)).toBe("ambiguous");
    expect(notificationCommandRegistry.begin(id)).toBe("started");
  });

  test("isolates principals and fails closed when every bounded record is ambiguity-critical", () => {
    const first = notificationCommandRegistry.logicalId(boundary, "mark-all");
    const other = notificationCommandRegistry.logicalId(
      { ...boundary, principalId: "user_b" },
      "mark-all",
    );
    expect(first).not.toBe(other);

    for (
      let index = 0;
      index < notificationCommandRegistry.capacity;
      index += 1
    ) {
      const id = `${first}:${index}`;
      expect(notificationCommandRegistry.begin(id)).toBe("started");
      notificationCommandRegistry.ambiguous(id);
    }
    expect(notificationCommandRegistry.begin("overflow")).toBe("capacity");
  });
});
