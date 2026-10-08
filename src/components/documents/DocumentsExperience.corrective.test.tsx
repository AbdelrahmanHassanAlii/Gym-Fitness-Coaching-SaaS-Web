/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  CoachingRelationshipDto,
  DocumentDto,
  FileDto,
  MembershipId,
  PermissionDecisionDto,
  SafeAuthUserDto,
  UploadIntentDto,
  UserId,
  WorkspaceId,
} from "@/contracts";
import { accessFactsFromDecision } from "@/lib/access";
import { ApiError } from "@/lib/api";
import type { AuthSessionContextValue, AuthState } from "@/lib/auth";
import type { StaffWorkspaceContextValue } from "@/lib/staff-shell";
import { messages } from "@/i18n/messages";
import { DocumentsExperience } from "./DocumentsExperience";

type RequestCall = {
  body?: unknown;
  idempotencyKey?: string;
  method?: string;
  path: string;
};

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
  staffContext: null as StaffWorkspaceContextValue | null,
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

describe("documents corrective workflow hardening", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    mocks.authSession.generation = 1;
    mocks.authSession.apiClient.request.mockReset();
    mocks.authSession.state = {
      accessToken: "token",
      restrictedUntilVerified: false,
      status: "authenticated",
      user: user(),
    } as AuthState;
    mocks.createIdempotencyKey.mockReset();
    mocks.createIdempotencyKey.mockReturnValue("documents-key");
    mocks.staffContext = context(allDocumentPermissions);
    vi.stubGlobal("open", vi.fn());
  });

  test.each([
    {
      missing: "files.download",
      permissions: allDocumentPermissions.filter(
        (permission) => permission !== "files.download",
      ),
    },
    {
      missing: "medical_documents.download",
      permissions: allDocumentPermissions.filter(
        (permission) => permission !== "medical_documents.download",
      ),
    },
  ])(
    "sensitive download requires ordinary and medical permissions when $missing is absent",
    async ({ permissions }) => {
      mocks.staffContext = context(permissions);
      mockDocumentsApi({ documents: [sensitiveDocument()] });
      renderDocuments();

      const button = await screen.findByRole("button", { name: "Download" });
      expect(button).toBeDisabled();
      fireEvent.click(button);

      expect(downloadCalls()).toHaveLength(0);
    },
  );

  test("sensitive download is allowed only when both required permissions are present", async () => {
    mockDocumentsApi({ documents: [sensitiveDocument()] });
    renderDocuments();

    fireEvent.click(await screen.findByRole("button", { name: "Download" }));

    await waitFor(() => expect(downloadCalls()).toHaveLength(1));
  });

  test.each([
    {
      missing: "documents.delete",
      permissions: allDocumentPermissions.filter(
        (permission) => permission !== "documents.delete",
      ),
    },
    {
      missing: "medical_documents.upload",
      permissions: allDocumentPermissions.filter(
        (permission) => permission !== "medical_documents.upload",
      ),
    },
  ])(
    "sensitive delete requires ordinary and medical permissions when $missing is absent",
    async ({ permissions }) => {
      mocks.staffContext = context(permissions);
      mockDocumentsApi({ documents: [sensitiveDocument()] });
      renderDocuments();

      const button = await screen.findByRole("button", { name: "Delete" });
      expect(button).toBeDisabled();
      fireEvent.click(button);

      expect(deleteCalls()).toHaveLength(0);
    },
  );

  test("sensitive delete uses document expectedVersion only when both required permissions are present", async () => {
    mockDocumentsApi({ documents: [sensitiveDocument()] });
    renderDocuments();

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" }).at(-1)!);

    await waitFor(() => expect(deleteCalls()).toHaveLength(1));
    expect(deleteCalls()[0]).toEqual(
      expect.objectContaining({
        body: { expectedVersion: 7 },
        idempotencyKey: "documents-key",
        method: "DELETE",
      }),
    );
  });

  test("ordinary actions keep their ordinary permission gates", async () => {
    mocks.staffContext = context([
      "documents.read",
      "documents.delete",
      "files.download",
      "trainees.read",
    ]);
    mockDocumentsApi({ documents: [ordinaryDocument()] });
    renderDocuments();

    fireEvent.click(await screen.findByRole("button", { name: "Download" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" }).at(-1)!);

    await waitFor(() => {
      expect(downloadCalls()).toHaveLength(1);
      expect(deleteCalls()).toHaveLength(1);
    });
  });

  test("expired upload intent prevents XHR and requires explicit restart", async () => {
    const xhr = installUploadXhr();
    mockDocumentsApi({
      intent: uploadIntent({
        expiresAt: "2026-01-01T00:00:00.000Z",
        uploadUrlExpiresAt: "2026-01-01T00:00:00.000Z",
      }),
    });
    vi.spyOn(Date, "now").mockReturnValue(
      Date.parse("2026-01-01T00:00:01.000Z"),
    );
    renderDocuments();

    await submitUpload("expired.pdf");

    await screen.findByText("Upload URL expired");
    expect(xhr.instances).toHaveLength(0);
    expect(confirmCalls()).toHaveLength(0);
  });

  test("network ambiguity and 412 still confirm the same upload intent", async () => {
    const xhr = installUploadXhr();
    xhr.nextSend = (instance) => instance.onerror?.();
    mockDocumentsApi();
    const view = renderDocuments();

    await submitUpload("network.pdf");
    await waitFor(() => expect(confirmCalls()).toHaveLength(1));
    view.unmount();

    xhr.instances.length = 0;
    mocks.authSession.apiClient.request.mockClear();
    xhr.nextSend = (instance) => {
      instance.status = 412;
      instance.onload?.();
    };
    renderDocuments();

    await submitUpload("precondition.pdf");
    await waitFor(() => expect(confirmCalls()).toHaveLength(1));
  });

  test("expiry is rechecked before retrying an ambiguous confirmation", async () => {
    const xhr = installUploadXhr();
    xhr.nextSend = (instance) => instance.onerror?.();
    mocks.authSession.apiClient.request.mockImplementation(async (request) => {
      const call = request as RequestCall;
      if (isRelationshipList(call.path)) {
        return { data: [relationship("relationship_a")] };
      }
      if (isDocumentList(call.path)) {
        return documentsPage([]);
      }
      if (isUploadIntentCall(call)) {
        return {
          data: uploadIntent({
            expiresAt: "2026-01-01T00:00:05.000Z",
            uploadUrlExpiresAt: "2026-01-01T00:00:05.000Z",
          }),
        };
      }
      if (isConfirmCall(call)) {
        throw new ApiError({
          category: "provider-or-storage",
          kind: "network",
          message: "lost confirm response",
        });
      }
      return { data: documentCommand(ordinaryDocument()) };
    });
    vi.spyOn(Date, "now").mockReturnValue(
      Date.parse("2026-01-01T00:00:01.000Z"),
    );
    renderDocuments();

    await submitUpload("retry.pdf");
    await screen.findByText("Upload confirmation is unknown");
    expect(confirmCalls()).toHaveLength(1);

    vi.spyOn(Date, "now").mockReturnValue(
      Date.parse("2026-01-01T00:00:06.000Z"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await screen.findByText("Upload URL expired");
    expect(xhr.instances).toHaveLength(1);
    expect(confirmCalls()).toHaveLength(1);
  });

  test("document creation retry reuses the confirmed file without reuploading", async () => {
    const xhr = installUploadXhr();
    let createAttempts = 0;
    mockDocumentsApi({
      createDocument: () => {
        createAttempts += 1;
        if (createAttempts === 1) {
          throw new ApiError({
            category: "provider-or-storage",
            kind: "network",
            message: "lost create response",
          });
        }
        return { data: documentCommand(ordinaryDocument()) };
      },
    });
    renderDocuments();

    await submitUpload("create-retry.pdf");
    await screen.findByText("Document creation outcome is unknown");
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await screen.findByText("Document uploaded and saved.");
    expect(uploadIntentCalls()).toHaveLength(1);
    expect(xhr.instances).toHaveLength(1);
    expect(confirmCalls()).toHaveLength(1);
    expect(createDocumentCalls()).toHaveLength(2);
    expect(createDocumentCalls().map((call) => call.idempotencyKey)).toEqual([
      "documents-key",
      "documents-key",
    ]);
  });

  test("relationship change, restart, and unmount block stale upload callbacks", async () => {
    const xhr = installUploadXhr();
    xhr.nextSend = () => undefined;
    mockDocumentsApi({
      relationships: [
        relationship("relationship_a"),
        relationship("relationship_b"),
      ],
    });
    const view = renderDocuments();

    await submitUpload("stale-relationship.pdf");
    await waitFor(() => expect(xhr.instances).toHaveLength(1));
    fireEvent.change(screen.getByLabelText("Relationship"), {
      target: { value: "relationship_b" },
    });
    xhr.instances[0].upload.onprogress?.({
      lengthComputable: true,
      loaded: 10,
      total: 10,
    });
    xhr.instances[0].status = 200;
    xhr.instances[0].onload?.();

    await waitFor(() => expect(confirmCalls()).toHaveLength(0));

    await submitUpload("stale-unmount.pdf");
    await waitFor(() => expect(xhr.instances).toHaveLength(2));
    view.unmount();
    xhr.instances[1].status = 200;
    xhr.instances[1].onload?.();

    await waitFor(() => expect(confirmCalls()).toHaveLength(0));
  });
});

function renderDocuments() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <DocumentsExperience labels={messages.en.documents} />
    </QueryClientProvider>,
  );
}

async function submitUpload(name: string) {
  const input = (await screen.findAllByLabelText("File")).at(-1)!;
  fireEvent.change(input, {
    target: {
      files: [new File(["content"], name, { type: "application/pdf" })],
    },
  });
  fireEvent.click(screen.getAllByRole("button", { name: "Upload" }).at(-1)!);
}

function mockDocumentsApi(input?: {
  createDocument?: (request: RequestCall) => unknown;
  documents?: DocumentDto[];
  intent?: UploadIntentDto;
  relationships?: CoachingRelationshipDto[];
}) {
  mocks.authSession.apiClient.request.mockImplementation(async (request) => {
    const call = request as RequestCall;
    if (isRelationshipList(call.path)) {
      return { data: input?.relationships ?? [relationship("relationship_a")] };
    }
    if (isUploadIntentCall(call)) {
      return { data: input?.intent ?? uploadIntent() };
    }
    if (isConfirmCall(call)) {
      return { data: { file: fileDto() } };
    }
    if (isCreateDocumentCall(call)) {
      return (
        input?.createDocument?.(call) ?? {
          data: documentCommand(ordinaryDocument()),
        }
      );
    }
    if (isDownloadCall(call)) {
      return {
        data: {
          expiresAt: "2026-01-01T00:10:00.000Z",
          url: "https://download.example/file?signature=secret",
        },
      };
    }
    if (isDeleteCall(call)) {
      return {
        data: documentCommand({ ...ordinaryDocument(), status: "DELETED" }),
      };
    }
    if (isDocumentList(call.path)) {
      return documentsPage(input?.documents ?? []);
    }
    if (isDocumentDetail(call.path)) {
      return { data: input?.documents?.[0] ?? ordinaryDocument() };
    }
    throw new Error(`Unexpected request ${call.method ?? "GET"} ${call.path}`);
  });
}

function installUploadXhr() {
  class MockUploadXhr {
    status = 200;
    upload = {
      onprogress: null as
        | ((event: {
            lengthComputable: boolean;
            loaded: number;
            total: number;
          }) => void)
        | null,
    };
    onabort: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onload: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    abort = vi.fn(() => this.onabort?.());
    open = vi.fn();
    setRequestHeader = vi.fn();
    send = vi.fn(() => control.nextSend(this));
  }

  const control = {
    instances: [] as MockUploadXhr[],
    nextSend: (instance: MockUploadXhr) => instance.onload?.(),
  };

  vi.stubGlobal(
    "XMLHttpRequest",
    class {
      constructor() {
        const instance = new MockUploadXhr();
        control.instances.push(instance);
        return instance;
      }
    },
  );

  return control;
}

function context(
  permissions: readonly PermissionDecisionDto["permission"][],
): StaffWorkspaceContextValue {
  return {
    accessFacts: accessFactsFromDecision({
      decisions: permissions.map(allowWorkspace),
      membershipId: "membership_a" as MembershipId,
      sessionGeneration: 1,
      workspaceId: "workspace_a" as WorkspaceId,
    }),
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
  };
}

const allDocumentPermissions = [
  "documents.read",
  "documents.upload",
  "documents.delete",
  "files.download",
  "medical_documents.read",
  "medical_documents.upload",
  "medical_documents.download",
  "trainees.read",
] as const satisfies readonly PermissionDecisionDto["permission"][];

function allowWorkspace(
  permission: PermissionDecisionDto["permission"],
): PermissionDecisionDto {
  return {
    allowed: true,
    effect: "ALLOW",
    permission,
    scope: { type: "WORKSPACE" },
    source: "PROFILE",
  };
}

function user(): SafeAuthUserDto {
  return {
    emailVerified: true,
    firstName: "Amina",
    id: "user_a" as UserId,
    lastName: "Owner",
    phoneVerified: false,
  };
}

function relationship(id: string): CoachingRelationshipDto {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    currentPrimaryTrainerAssignmentId: "assignment_primary",
    engagementPeriods: [{ startedAt: "2026-01-01T00:00:00.000Z" }],
    homeBranchId: "branch_a" as never,
    id: id as CoachingRelationshipDto["id"],
    status: "ACTIVE",
    traineeMembershipId: `${id}_trainee_membership` as never,
    traineeUserId: `${id}_trainee` as never,
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 7,
    workspaceId: "workspace_a" as WorkspaceId,
  };
}

function ordinaryDocument(): DocumentDto {
  return {
    category: "OTHER",
    classification: "STANDARD",
    createdAt: "2026-01-01T00:00:00.000Z",
    fileId: "file_ordinary" as never,
    id: "document_ordinary" as never,
    relationshipId: "relationship_a" as never,
    status: "ACTIVE",
    title: "Ordinary document",
    version: 7,
  };
}

function sensitiveDocument(): DocumentDto {
  return {
    ...ordinaryDocument(),
    category: "MEDICAL_REPORT",
    classification: "SENSITIVE",
    fileId: "file_sensitive" as never,
    id: "document_sensitive" as never,
    title: "Sensitive document",
  };
}

function uploadIntent(input?: Partial<UploadIntentDto>): UploadIntentDto {
  return {
    expectedVersion: 0,
    expiresAt: "2027-01-01T00:15:00.000Z",
    reservedBytes: 7,
    uploadIntentId: "intent_a",
    uploadRequest: {
      headers: { "content-type": "application/pdf", "if-none-match": "*" },
      method: "PUT",
      url: "https://provider.example/upload?signature=secret",
    },
    uploadUrl: "https://provider.example/upload?signature=secret",
    uploadUrlExpiresAt: "2027-01-01T00:10:00.000Z",
    ...input,
  };
}

function fileDto(): FileDto {
  return {
    classification: "STANDARD",
    confirmedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    id: "file_confirmed" as never,
    mimeType: "application/pdf",
    originalName: "upload.pdf",
    sizeBytes: 7,
    status: "ACTIVE",
    version: 1,
  };
}

function documentCommand(document: DocumentDto) {
  return { document };
}

function documentsPage(documents: DocumentDto[]) {
  return { data: documents, pageInfo: { hasMore: false } };
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
}

function requestCalls() {
  return mocks.authSession.apiClient.request.mock.calls.map(
    ([request]) => request as RequestCall,
  );
}

function uploadIntentCalls() {
  return requestCalls().filter(isUploadIntentCall);
}

function confirmCalls() {
  return requestCalls().filter(isConfirmCall);
}

function createDocumentCalls() {
  return requestCalls().filter(isCreateDocumentCall);
}

function downloadCalls() {
  return requestCalls().filter(isDownloadCall);
}

function deleteCalls() {
  return requestCalls().filter(isDeleteCall);
}

function isRelationshipList(path: string) {
  return path.startsWith("/workspaces/workspace_a/relationships?status=ACTIVE");
}

function isDocumentList(path: string) {
  return (
    path.startsWith("/workspaces/workspace_a/relationships/relationship_") &&
    path.includes("/documents?")
  );
}

function isDocumentDetail(path: string) {
  return (
    path.startsWith("/workspaces/workspace_a/relationships/relationship_") &&
    /\/documents\/document_/.test(path)
  );
}

function isUploadIntentCall(request: RequestCall) {
  return (
    request.method === "POST" &&
    request.path === "/workspaces/workspace_a/files/upload-intents"
  );
}

function isConfirmCall(request: RequestCall) {
  return (
    request.method === "POST" &&
    request.path ===
      "/workspaces/workspace_a/files/upload-intents/intent_a/confirm"
  );
}

function isCreateDocumentCall(request: RequestCall) {
  return (
    request.method === "POST" &&
    request.path.startsWith(
      "/workspaces/workspace_a/relationships/relationship_",
    ) &&
    request.path.endsWith("/documents")
  );
}

function isDownloadCall(request: RequestCall) {
  return (
    request.method === "POST" &&
    request.path.startsWith("/workspaces/workspace_a/files/") &&
    request.path.endsWith("/download-url")
  );
}

function isDeleteCall(request: RequestCall) {
  return (
    request.method === "DELETE" &&
    request.path.startsWith(
      "/workspaces/workspace_a/relationships/relationship_",
    ) &&
    request.path.includes("/documents/document_")
  );
}
