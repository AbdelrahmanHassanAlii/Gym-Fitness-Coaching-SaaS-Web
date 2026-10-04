/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  MembershipId,
  PermissionDecisionDto,
  ProgramId,
  RelationshipId,
  SafeAuthUserDto,
  TrainingProgramDto,
  UserId,
  WorkoutId,
  WorkoutSessionDto,
  WorkspaceId,
} from "@/contracts";
import { accessFactsFromDecision } from "@/lib/access";
import { ApiError } from "@/lib/api";
import type { AuthSessionContextValue, AuthState } from "@/lib/auth";
import type { StaffWorkspaceContextValue } from "@/lib/staff-shell";
import { messages } from "@/i18n/messages";
import { TrainingExperience } from "./TrainingExperience";

const mocks = vi.hoisted(() => ({
  authSession: {
    apiClient: {
      request: vi.fn(),
    },
    bootstrap: vi.fn(),
    generation: 1,
    getAccessToken: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    markSessionExpired: vi.fn(),
    state: {
      accessToken: "token",
      restrictedUntilVerified: false,
      status: "authenticated",
      user: {
        emailVerified: true,
        firstName: "Amina",
        id: "user_a",
        lastName: "Owner",
        phoneVerified: false,
      },
    } as AuthState,
    subscribe: vi.fn(),
    verifyMfaLogin: vi.fn(),
  },
  createIdempotencyKey: vi.fn(),
  staffContext: {
    accessFacts: null,
    shellContext: {
      accessContext: "user",
      branch: { branchId: null, label: "All permitted branches" },
      portal: "gym-staff",
      sessionGeneration: 1,
      workspace: {
        membershipId: "membership_a" as MembershipId,
        roles: ["TRAINER"],
        workspaceId: "workspace_a" as WorkspaceId,
        workspaceName: "Summit Gym",
        workspaceTimezone: "Africa/Cairo",
      },
    },
    workspace: {
      membershipId: "membership_a" as MembershipId,
      roles: ["TRAINER"],
      workspaceId: "workspace_a" as WorkspaceId,
      workspaceName: "Summit Gym",
      workspaceTimezone: "Africa/Cairo",
    },
  } as StaffWorkspaceContextValue,
}));

vi.mock("@/lib/auth", () => ({
  useAuthSession: () => mocks.authSession as unknown as AuthSessionContextValue,
}));

vi.mock("@/lib/staff-shell", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/staff-shell")>(
      "@/lib/staff-shell",
    );

  return {
    ...actual,
    useStaffWorkspaceContext: () => mocks.staffContext,
  };
});

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");

  return {
    ...actual,
    createIdempotencyKey: mocks.createIdempotencyKey,
  };
});

describe("training experience UI", () => {
  beforeEach(() => {
    mocks.authSession.apiClient.request.mockReset();
    mocks.authSession.generation = 1;
    mocks.authSession.logout.mockClear();
    mocks.authSession.state = {
      accessToken: "token",
      restrictedUntilVerified: false,
      status: "authenticated",
      user: user("Amina", "Owner"),
    } as AuthState;
    mocks.createIdempotencyKey.mockReset();
    mocks.createIdempotencyKey.mockReturnValue("training-key-1");
    mocks.staffContext = context("workspace_a", "Summit Gym", 1);
    vi.spyOn(globalThis, "confirm").mockReturnValue(true);
  });

  test("does not render protected training UI without selected workspace", () => {
    mocks.staffContext = {
      accessFacts: null,
      shellContext: null,
      workspace: null,
    };

    renderTraining();

    expect(screen.getByText("No workspace selected")).toBeInTheDocument();
    expect(screen.queryByText("Training and workouts")).not.toBeInTheDocument();
  });

  test.each(["initializing", "unauthenticated"] as const)(
    "%s auth cannot render protected data or request training",
    (status) => {
      mocks.authSession.state = {
        status,
        accessToken: null,
        user: null,
        restrictedUntilVerified: false,
      };
      renderTraining();
      expect(
        screen.queryByRole("heading", { name: "Training and workouts" }),
      ).not.toBeInTheDocument();
      expect(mocks.authSession.apiClient.request).not.toHaveBeenCalled();
    },
  );

  test.each([
    [403, "You do not have access to this action."],
    [409, messages.en.training.errors.conflict],
    [422, messages.en.training.errors.validation],
    [429, messages.en.training.errors.rateLimited],
    [500, messages.en.training.errors.unavailable],
  ])(
    "command HTTP %s reports safe feedback without retry or logout",
    async (status, message) => {
      mockTrainingData({
        mutate: () => {
          throw new ApiError({
            kind: "backend",
            status: Number(status),
            message: "private unsafe backend detail",
          });
        },
      });
      renderTraining();
      const button = await screen.findByRole("button", {
        name: "Activate program",
      });
      await waitFor(() => expect(button).toBeEnabled());
      fireEvent.click(button);
      expect(await screen.findByRole("alert")).toHaveTextContent(
        String(message),
      );
      expect(trainingCommandCalls()).toHaveLength(1);
      expect(mocks.authSession.logout).not.toHaveBeenCalled();
      expect(
        screen.queryByText("private unsafe backend detail"),
      ).not.toBeInTheDocument();
    },
  );

  test("network read failure is unavailable rather than empty or denied", async () => {
    mocks.authSession.apiClient.request.mockRejectedValue(
      new Error("private network message"),
    );
    renderTraining();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      messages.en.training.errors.unavailable,
    );
    expect(
      screen.queryByText(messages.en.training.empty.relationships),
    ).not.toBeInTheDocument();
  });

  test("renders relationship-scoped programs, workouts, and records", async () => {
    mockTrainingData();

    renderTraining();

    expect(
      await screen.findByRole("heading", { name: "Training and workouts" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Strength Block")).toBeInTheDocument();
    expect(
      screen.getByText("Maximum weight · exercise_a · 120"),
    ).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
  });

  test("creates a scratch program from structured days without invented CAS or idempotency", async () => {
    mockTrainingData({
      mutate: (request) =>
        request.path.endsWith("/programs")
          ? { data: { program: program(), revision: revision() } }
          : undefined,
    });
    renderTraining();
    await screen.findByText("Strength Block");
    fireEvent.change(screen.getByLabelText("Program name"), {
      target: { value: "New strength plan" },
    });
    fireEvent.change(screen.getByLabelText("Day name"), {
      target: { value: "Recovery day" },
    });
    fireEvent.change(screen.getByLabelText("Day type"), {
      target: { value: "RECOVERY" },
    });
    const createButton = screen.getByRole("button", { name: "Create program" });
    await waitFor(() => expect(createButton).toBeEnabled());
    fireEvent.click(createButton);
    await waitFor(() => expect(trainingCommandCalls()).toHaveLength(1));
    expect(trainingCommandCalls()[0]).toEqual({
      method: "POST",
      path: "/workspaces/workspace_a/relationships/relationship_workspace_a/programs",
      body: {
        name: "New strength plan",
        source: { type: "SCRATCH" },
        days: [
          {
            name: "Recovery day",
            sequence: 1,
            type: "RECOVERY",
            exercises: [],
          },
        ],
      },
    });
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });

  test("a new revision retains server version and is distinct from program creation", async () => {
    mockTrainingData({
      mutate: (request) =>
        request.path.endsWith("/revisions")
          ? { data: { program: program(), revision: revision() } }
          : undefined,
    });
    renderTraining();
    const edit = await screen.findByRole("button", { name: "Edit program" });
    await waitFor(() => expect(edit).toBeEnabled());
    fireEvent.click(edit);
    fireEvent.change(screen.getByLabelText("Day name"), {
      target: { value: "Updated lower day" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save new revision" }));
    await waitFor(() => expect(trainingCommandCalls()).toHaveLength(1));
    expect(trainingCommandCalls()[0]).toEqual({
      method: "POST",
      path: "/workspaces/workspace_a/relationships/relationship_workspace_a/programs/program_workspace_a/revisions",
      body: {
        expectedVersion: 7,
        days: [
          {
            name: "Updated lower day",
            sequence: 1,
            type: "RESISTANCE",
            exercises: [],
          },
        ],
      },
    });
  });

  test("role alone cannot expose protected training commands", async () => {
    mockTrainingData();
    mocks.staffContext = {
      ...context("workspace_a", "Summit Gym", 1),
      accessFacts: null,
      workspace: {
        ...context("workspace_a", "Summit Gym", 1).workspace!,
        roles: ["GYM_OWNER"],
      },
    };

    renderTraining();

    expect(
      screen.queryByRole("button", { name: "Activate program" }),
    ).not.toBeInTheDocument();
    expect(mocks.authSession.apiClient.request).not.toHaveBeenCalled();
    expect(trainingCommandCalls()).toHaveLength(0);
  });

  test("stale access facts remove cached protected data and commands immediately", async () => {
    mockTrainingData();
    const queryClient = createTestQueryClient();
    const { rerender } = render(trainingTree(queryClient));
    await screen.findByText("Strength Block");
    mocks.staffContext = { ...mocks.staffContext, accessFacts: null };
    rerender(trainingTree(queryClient));
    expect(screen.queryByText("Strength Block")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Activate program" }),
    ).not.toBeInTheDocument();
  });

  test("completed workout corrections preserve actual set keys, reason, version, and stable retry key", async () => {
    let attempts = 0;
    const completedWorkout = {
      ...workout("workspace_a"),
      status: "COMPLETED" as const,
      exercises: [
        {
          exerciseId: "exercise_a",
          workoutExerciseKey: "wx-1",
          exerciseNameSnapshot: "Squat",
          sets: [{ setKey: "set-1", weight: 80, reps: 5, completed: true }],
        },
      ],
    };
    mockTrainingData({
      read: (request) => {
        if (request.path.endsWith("/workouts/current"))
          return { data: { workout: null } };
        if (request.path.includes("/workouts?"))
          return { data: [completedWorkout] };
      },
      mutate: (request) => {
        if (request.path.endsWith("/corrections")) {
          if (++attempts === 1) throw new Error("Ambiguous transport failure");
          return { data: { workout: completedWorkout } };
        }
      },
    });
    renderTraining();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Completed · workout_workspace_a",
      }),
    );
    fireEvent.change(screen.getByLabelText("Weight"), {
      target: { value: "82.5" },
    });
    fireEvent.change(screen.getByLabelText("Correction reason"), {
      target: { value: "Verified plate load" },
    });
    const button = screen.getByRole("button", {
      name: "Correct completed workout",
    });
    fireEvent.click(button);
    await screen.findByRole("alert");
    fireEvent.click(button);
    await waitFor(() => expect(trainingCommandCalls()).toHaveLength(2));
    expect(trainingCommandCalls()[0]).toEqual(trainingCommandCalls()[1]);
    expect(trainingCommandCalls()[0]).toMatchObject({
      method: "POST",
      path: "/workspaces/workspace_a/relationships/relationship_workspace_a/workouts/workout_workspace_a/corrections",
      idempotencyKey: "training-key-1",
      body: {
        expectedVersion: 7,
        notes: "",
        reason: "Verified plate load",
        exercises: [
          {
            workoutExerciseKey: "wx-1",
            sets: [
              {
                setKey: "set-1",
                weight: 82.5,
                reps: 5,
                completed: true,
                notes: "",
              },
            ],
          },
        ],
      },
    });
    await screen.findByText("Saved.");
  });

  test("session and workspace replacement discard pending A program detail", async () => {
    const pending = deferred<unknown>();
    mockTrainingData({
      read: (request) =>
        request.path.endsWith("/programs/program_workspace_a")
          ? pending.promise
          : undefined,
    });
    const queryClient = createTestQueryClient();
    const { rerender } = render(trainingTree(queryClient));
    await waitFor(() =>
      expect(mocks.authSession.apiClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/workspaces/workspace_a/relationships/relationship_workspace_a/programs/program_workspace_a",
        }),
      ),
    );
    mocks.authSession.generation = 2;
    mocks.authSession.state = {
      ...mocks.authSession.state,
      user: user("B", "Account"),
    } as AuthState;
    mocks.staffContext = context("workspace_b", "Pulse Gym", 2);
    mocks.authSession.apiClient.request.mockImplementation(async (request) =>
      trainingResponse(request, "workspace_b"),
    );
    rerender(trainingTree(queryClient));
    await screen.findByText("In progress · workout_workspace_b");
    await act(async () => {
      pending.resolve({
        data: {
          program: program({ name: "Old A detail" }),
          revision: revision(),
        },
      });
      await pending.promise;
    });
    expect(screen.queryByText("Old A detail")).not.toBeInTheDocument();
    expect(screen.queryByText("Summit Gym")).not.toBeInTheDocument();
    expect(screen.getByText("Pulse Gym")).toBeInTheDocument();
  });

  test("late relationship A detail cannot render after selecting relationship B", async () => {
    const pendingA = deferred<unknown>();
    const relationshipA = relationshipId("a");
    const relationshipB = relationshipId("b");
    const programA = "program_a" as ProgramId;
    const programB = "program_b" as ProgramId;
    mockTrainingData({
      read: (request) => {
        if (isRelationshipListPath(request.path, "workspace_a")) {
          return {
            data: [
              relationship("workspace_a", relationshipA),
              relationship("workspace_a", relationshipB),
            ],
          };
        }
        if (request.path.includes(`/relationships/${relationshipA}/programs?`))
          return {
            data: [
              program({
                id: programA,
                name: "Relationship A plan",
                relationshipId: relationshipA,
              }),
            ],
          };
        if (
          request.path.endsWith(
            `/relationships/${relationshipA}/programs/${programA}`,
          )
        )
          return pendingA.promise;
        if (request.path.includes(`/relationships/${relationshipB}/programs?`))
          return {
            data: [
              program({
                id: programB,
                name: "Relationship B plan",
                relationshipId: relationshipB,
              }),
            ],
          };
        if (
          request.path.endsWith(
            `/relationships/${relationshipB}/programs/${programB}`,
          )
        )
          return {
            data: {
              program: program({
                id: programB,
                name: "Relationship B plan",
                relationshipId: relationshipB,
              }),
              revision: revision({ dayName: "Relationship B day" }),
            },
          };
        if (
          request.path.endsWith(
            `/relationships/${relationshipA}/workouts/current`,
          ) ||
          request.path.endsWith(
            `/relationships/${relationshipB}/workouts/current`,
          )
        )
          return { data: { workout: null } };
        if (
          request.path.includes(`/relationships/${relationshipA}/workouts?`) ||
          request.path.includes(`/relationships/${relationshipB}/workouts?`) ||
          request.path.includes(
            `/relationships/${relationshipA}/personal-records?`,
          ) ||
          request.path.includes(
            `/relationships/${relationshipB}/personal-records?`,
          ) ||
          request.path.includes(
            `/relationships/${relationshipA}/personal-record-events?`,
          ) ||
          request.path.includes(
            `/relationships/${relationshipB}/personal-record-events?`,
          )
        )
          return { data: [] };
        return undefined;
      },
    });
    renderTraining();
    await screen.findByText(relationshipA);
    fireEvent.click(screen.getByText(relationshipB));
    await screen.findByText("Relationship B plan");
    await act(async () => {
      pendingA.resolve({
        data: {
          program: program({
            id: programA,
            name: "Old relationship A detail",
            relationshipId: relationshipA,
          }),
          revision: revision({ dayName: "Old relationship A day" }),
        },
      });
      await pendingA.promise;
    });
    expect(
      screen.queryByText("Old relationship A detail"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Old relationship A day"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Relationship B plan")).toBeInTheDocument();
  });

  test("late program A detail cannot replace selected program B", async () => {
    const pendingA = deferred<unknown>();
    const programA = "program_a" as ProgramId;
    const programB = "program_b" as ProgramId;
    mockTrainingData({
      read: (request) => {
        if (request.path.includes("/programs?"))
          return {
            data: [
              program({ id: programA, name: "Program A" }),
              program({ id: programB, name: "Program B" }),
            ],
          };
        if (request.path.endsWith(`/programs/${programA}`))
          return pendingA.promise;
        if (request.path.endsWith(`/programs/${programB}`))
          return {
            data: {
              program: program({ id: programB, name: "Program B" }),
              revision: revision({ dayName: "Program B day" }),
            },
          };
        return undefined;
      },
    });
    renderTraining();
    await screen.findByText("Program B");
    fireEvent.click(screen.getByText("Program B"));
    const edit = await screen.findByRole("button", { name: "Edit program" });
    await waitFor(() => expect(edit).toBeEnabled());
    fireEvent.click(edit);
    expect(
      await screen.findByDisplayValue("Program B day"),
    ).toBeInTheDocument();
    await act(async () => {
      pendingA.resolve({
        data: {
          program: program({ id: programA, name: "Old Program A detail" }),
          revision: revision({ dayName: "Old Program A day" }),
        },
      });
      await pendingA.promise;
    });
    expect(
      screen.queryByDisplayValue("Old Program A day"),
    ).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Program B day")).toBeInTheDocument();
  });

  test("late workout A correction cannot publish feedback after selecting workout B", async () => {
    const pendingA = deferred<unknown>();
    const workoutA = completedWorkout("workout_a" as WorkoutId);
    const workoutB = completedWorkout("workout_b" as WorkoutId);
    mockTrainingData({
      read: (request) => {
        if (request.path.endsWith("/workouts/current"))
          return { data: { workout: null } };
        if (request.path.includes("/workouts?"))
          return { data: [workoutA, workoutB] };
        return undefined;
      },
      mutate: (request) =>
        request.path.endsWith("/workout_a/corrections")
          ? pendingA.promise
          : undefined,
    });
    renderTraining();
    fireEvent.click(await screen.findByRole("button", { name: /workout_a/ }));
    fireEvent.change(screen.getByLabelText("Correction reason"), {
      target: { value: "Verified stale selection" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Correct completed workout" }),
    );
    await waitFor(() => expect(trainingCommandCalls()).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: /workout_b/ }));
    await act(async () => {
      pendingA.resolve({ data: { workout: workoutA } });
      await pendingA.promise;
    });
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /workout_b/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  test("activate program sends exact expectedVersion body and stable idempotency key", async () => {
    mockTrainingData({
      mutate: (request) => {
        if (request.path.endsWith("/activate")) {
          return {
            data: { program: program({ status: "ACTIVE", version: 8 }) },
          };
        }
        return undefined;
      },
    });

    renderTraining();

    await screen.findByText("Strength Block");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Activate program" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Activate program" }));

    await waitFor(() =>
      expect(trainingCommandCalls()).toEqual([
        expect.objectContaining({
          body: { expectedVersion: 7 },
          idempotencyKey: "training-key-1",
          method: "POST",
          path: "/workspaces/workspace_a/relationships/relationship_workspace_a/programs/program_workspace_a/activate",
        }),
      ]),
    );
    expect(
      await screen.findByText("Training change saved."),
    ).toBeInTheDocument();
  });

  test("late workspace A mutation success cannot publish under workspace B", async () => {
    const pending = deferred<unknown>();
    mockTrainingData({
      mutate: (request) => {
        if (request.path.endsWith("/activate")) {
          return pending.promise;
        }
        return undefined;
      },
    });
    const queryClient = createTestQueryClient();
    const { rerender } = render(trainingTree(queryClient));

    await screen.findByText("Strength Block");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Activate program" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Activate program" }));

    mocks.authSession.generation = 2;
    mocks.staffContext = context("workspace_b", "Pulse Gym", 2);
    mocks.authSession.apiClient.request.mockImplementation(async (request) =>
      trainingResponse(request, "workspace_b"),
    );
    rerender(trainingTree(queryClient));

    expect(await screen.findByText("Pulse Gym")).toBeInTheDocument();
    await act(async () => {
      pending.resolve({ data: { program: program({ status: "ACTIVE" }) } });
      await pending.promise;
    });

    await waitFor(() =>
      expect(
        screen.queryByText("Training change saved."),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("relationship_workspace_b")).toBeInTheDocument();
    expect(
      await screen.findByText("In progress · workout_workspace_b"),
    ).toBeInTheDocument();
  });

  test("Arabic RTL training page renders actual controls", async () => {
    mockTrainingData();

    render(
      <div dir="rtl">
        <QueryClientProvider client={createTestQueryClient()}>
          <TrainingExperience labels={messages.ar.training} />
        </QueryClientProvider>
      </div>,
    );

    expect(
      await screen.findByRole("heading", { name: "التدريب والتمارين" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "تفعيل البرنامج" }),
    ).toBeInTheDocument();
  });

  test("an ambiguous command keeps its key after another command succeeds", async () => {
    mocks.createIdempotencyKey
      .mockReturnValueOnce("complete-key")
      .mockReturnValueOnce("activate-key");
    mockTrainingData({
      mutate: (request) => {
        if (request.path.endsWith("/complete"))
          throw new Error("Network outcome unknown");
        if (request.path.endsWith("/activate"))
          return { data: { program: program({ status: "ACTIVE" }) } };
      },
    });
    renderTraining();
    await screen.findByText("Strength Block");
    fireEvent.click(screen.getByRole("button", { name: "Complete workout" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Activate program" }));
    await screen.findByText("Training change saved.");
    fireEvent.click(screen.getByRole("button", { name: "Complete workout" }));
    await waitFor(() => expect(trainingCommandCalls()).toHaveLength(3));
    expect(
      trainingCommandCalls().map((request) => request.idempotencyKey),
    ).toEqual(["complete-key", "activate-key", "complete-key"]);
  });

  test("synchronous duplicate clicks send one command and success retires its key", async () => {
    const pending = deferred<unknown>();
    mocks.createIdempotencyKey
      .mockReturnValueOnce("first-key")
      .mockReturnValueOnce("new-key");
    let calls = 0;
    mockTrainingData({
      mutate: (request) => {
        if (request.path.endsWith("/activate"))
          return ++calls === 1
            ? pending.promise
            : { data: { program: program() } };
      },
    });
    renderTraining();
    await screen.findByText("Strength Block");
    const button = screen.getByRole("button", { name: "Activate program" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(trainingCommandCalls()).toHaveLength(1));
    await act(async () => {
      pending.resolve({ data: { program: program() } });
      await pending.promise;
    });
    await screen.findByText("Training change saved.");
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(trainingCommandCalls()).toHaveLength(2));
    expect(
      trainingCommandCalls().map((request) => request.idempotencyKey),
    ).toEqual(["first-key", "new-key"]);
  });
});

function renderTraining() {
  return render(trainingTree(createTestQueryClient()));
}

function trainingTree(queryClient: QueryClient) {
  return (
    <QueryClientProvider client={queryClient}>
      <TrainingExperience labels={messages.en.training} />
    </QueryClientProvider>
  );
}

function mockTrainingData(input?: {
  read?: (request: { method?: string; path: string }) => unknown;
  mutate?: (request: {
    body?: unknown;
    method?: string;
    path: string;
  }) => unknown;
}) {
  mocks.authSession.apiClient.request.mockImplementation(async (request) => {
    if (request.method === "GET" && input?.read) {
      const result = input.read(request);
      if (result !== undefined) return result;
    }
    if (request.method !== "GET" && input?.mutate) {
      const result = input.mutate(request);
      if (result !== undefined) return result;
    }

    return trainingResponse(request, "workspace_a");
  });
}

function trainingResponse(
  request: { method?: string; path: string },
  workspaceIdValue: string,
) {
  if (request.path.includes("/exercises?"))
    return {
      data: [
        {
          id: "exercise_a",
          scope: "SYSTEM",
          names: { en: "Squat", ar: "قرفصاء" },
          exerciseType: "RESISTANCE",
          status: "ACTIVE",
          version: 0,
          primaryMuscles: [],
          secondaryMuscles: [],
          equipment: [],
        },
      ],
    };
  if (isRelationshipListPath(request.path, workspaceIdValue)) {
    return { data: [relationship(workspaceIdValue)] };
  }
  if (request.path.includes("/programs?")) {
    return {
      data: [program({ workspaceId: workspaceIdValue as WorkspaceId })],
    };
  }
  if (request.path.endsWith(`/programs/${programId(workspaceIdValue)}`)) {
    return {
      data: {
        program: program({ workspaceId: workspaceIdValue as WorkspaceId }),
        revision: revision(),
      },
    };
  }
  if (
    request.path.endsWith(`/programs/${programId(workspaceIdValue)}/progress`)
  ) {
    return {
      data: { progress: progress({ programId: programId(workspaceIdValue) }) },
    };
  }
  if (request.path.endsWith("/workouts/current")) {
    return { data: { workout: workout(workspaceIdValue) } };
  }
  if (request.path.includes("/workouts?")) {
    return { data: [workout(workspaceIdValue)] };
  }
  if (request.path.includes("/personal-records?")) {
    return { data: [record()] };
  }
  if (request.path.includes("/personal-record-events?")) {
    return { data: [recordEvent()] };
  }

  return {
    data: {
      program: program({ workspaceId: workspaceIdValue as WorkspaceId }),
    },
  };
}

function trainingCommandCalls() {
  return mocks.authSession.apiClient.request.mock.calls
    .map(([request]) => request)
    .filter((request) => request.method !== "GET");
}

function relationship(
  workspaceIdValue: string,
  id: RelationshipId = relationshipId(workspaceIdValue),
) {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    engagementPeriods: [{ startedAt: "2026-01-01T00:00:00.000Z" }],
    id,
    status: "ACTIVE",
    traineeUserId: `trainee_${workspaceIdValue}`,
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
    workspaceId: workspaceIdValue,
  };
}

function program(input: Partial<TrainingProgramDto> = {}): TrainingProgramDto {
  const workspaceIdValue = input.workspaceId ?? ("workspace_a" as WorkspaceId);
  return {
    currentRevisionId: "revision_a" as TrainingProgramDto["currentRevisionId"],
    id: programId(String(workspaceIdValue)),
    name: "Strength Block",
    relationshipId: relationshipId(String(workspaceIdValue)),
    status: "DRAFT",
    version: 7,
    workspaceId: workspaceIdValue,
    ...input,
  };
}

function revision(input: Partial<{ dayName: string }> = {}) {
  return {
    days: [
      {
        exercises: [],
        name: input.dayName ?? "Lower",
        sequence: 1,
        type: "RESISTANCE",
      },
    ],
    id: "revision_a",
    revision: 1,
  };
}

function progress(input: Partial<{ programId: ProgramId }> = {}) {
  return {
    completedDayCount: 0,
    currentDaySequence: 1,
    programId: input.programId ?? programId("workspace_a"),
    programRevisionId: "revision_a",
    skippedDayCount: 0,
    version: 3,
  };
}

function workout(workspaceIdValue: string): WorkoutSessionDto {
  return {
    daySequence: 1,
    exercises: [],
    id: `workout_${workspaceIdValue}` as WorkoutId,
    performedByUserId: "user_a" as WorkoutSessionDto["performedByUserId"],
    programId: programId(workspaceIdValue),
    programRevisionId: "revision_a" as WorkoutSessionDto["programRevisionId"],
    relationshipId: relationshipId(workspaceIdValue),
    startedAt: "2026-01-01T00:00:00.000Z",
    status: "IN_PROGRESS",
    traineeUserId: "trainee_a" as WorkoutSessionDto["traineeUserId"],
    version: 7,
    workspaceId: workspaceIdValue as WorkspaceId,
  };
}

function completedWorkout(id: WorkoutId): WorkoutSessionDto {
  return {
    ...workout("workspace_a"),
    id,
    status: "COMPLETED",
    exercises: [
      {
        exerciseId:
          "exercise_a" as WorkoutSessionDto["exercises"][number]["exerciseId"],
        exerciseNameSnapshot: "Squat",
        workoutExerciseKey: `${id}-exercise`,
        sets: [
          {
            completed: true,
            reps: 5,
            setKey: `${id}-set`,
            weight: 80,
          },
        ],
      },
    ],
  };
}

function record() {
  return {
    exerciseId: "exercise_a",
    id: "record_a",
    qualifierKey: "",
    recordType: "MAX_WEIGHT",
    sourceWorkoutId: "workout_workspace_a",
    sourceWorkoutVersion: 7,
    value: 120,
  };
}

function recordEvent() {
  return {
    eventType: "ACHIEVED",
    exerciseId: "exercise_a",
    id: "event_a",
    newValue: 120,
    occurredAt: "2026-01-01T00:00:00.000Z",
    qualifierKey: "",
    recordType: "MAX_WEIGHT",
    sourceWorkoutId: "workout_workspace_a",
    sourceWorkoutVersion: 7,
  };
}

function relationshipId(workspaceIdValue: string): RelationshipId {
  return `relationship_${workspaceIdValue}` as RelationshipId;
}

function programId(workspaceIdValue: string): ProgramId {
  return `program_${workspaceIdValue}` as ProgramId;
}

function isRelationshipListPath(path: string, workspaceIdValue: string) {
  const basePath = `/workspaces/${workspaceIdValue}/relationships`;
  return path === basePath || path.startsWith(`${basePath}?`);
}

function context(
  workspaceIdValue: string,
  workspaceName: string,
  generation: number,
): StaffWorkspaceContextValue {
  return {
    accessFacts: accessFacts(workspaceIdValue, generation),
    shellContext: {
      accessContext: "user",
      branch: { branchId: null, label: "All permitted branches" },
      portal: "gym-staff",
      sessionGeneration: generation,
      workspace: {
        membershipId: `membership_${workspaceIdValue}` as MembershipId,
        roles: ["TRAINER"],
        workspaceId: workspaceIdValue as WorkspaceId,
        workspaceName,
        workspaceTimezone: "Africa/Cairo",
      },
    },
    workspace: {
      membershipId: `membership_${workspaceIdValue}` as MembershipId,
      roles: ["TRAINER"],
      workspaceId: workspaceIdValue as WorkspaceId,
      workspaceName,
      workspaceTimezone: "Africa/Cairo",
    },
  };
}

function accessFacts(workspaceIdValue: string, generation: number) {
  const permissions: PermissionDecisionDto["permission"][] = [
    "trainees.read",
    "programs.read",
    "workouts.read",
    "personal_records.read",
    "exercises.read",
    "programs.create",
    "programs.update",
    "workouts.update",
    "workouts.correct",
    "programs.activate",
    "workouts.create",
    "workouts.complete",
    "workouts.abandon",
    "workouts.day.skip",
    "workouts.day.defer",
  ];

  return accessFactsFromDecision({
    decisions: permissions.map((permission) => ({
      allowed: true,
      effect: "ALLOW",
      permission,
      scope: { type: "WORKSPACE" },
      source: "PROFILE",
    })),
    membershipId: `membership_${workspaceIdValue}` as MembershipId,
    sessionGeneration: generation,
    workspaceId: workspaceIdValue as WorkspaceId,
  });
}

function user(firstName: string, lastName: string): SafeAuthUserDto {
  return {
    emailVerified: true,
    firstName,
    id: `user_${firstName.toLowerCase()}` as UserId,
    lastName,
    phoneVerified: false,
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
}
