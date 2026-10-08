"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateUploadIntentRequestDto,
  DocumentDto,
  MembershipId,
  PermissionKey,
  RelationshipId,
  UploadIntentDto,
  WorkspaceId,
} from "@/contracts";
import { isMandatorySensitiveDocumentCategory } from "@/contracts";
import { evaluateAccess, type AccessDecision } from "@/lib/access";
import { ApiError, createIdempotencyKey, isApiError } from "@/lib/api";
import { useAuthSession } from "@/lib/auth";
import {
  confirmUpload,
  createDocument,
  createDownloadUrl,
  createUploadIntent,
  deleteDocument,
  fileKeys,
  getDocument,
  listDocuments,
  uploadProviderObject,
} from "@/lib/files";
import { listRelationships, relationshipKeys } from "@/lib/relationships";
import type { AuthorizationCacheContext } from "@/lib/server-state";
import { useStaffWorkspaceContext } from "@/lib/staff-shell";
import { DeleteDocumentDialog } from "./DeleteDocumentDialog";
import {
  DocumentUploadFlow,
  isAllowedUploadMimeType,
  isMedicalCategory,
  type UploadFormValues,
} from "./DocumentUploadFlow";
import { DocumentsList } from "./DocumentsList";
import type { UploadStateValue } from "./UploadState";
import styles from "./documents.module.css";

export type DocumentsLabels = {
  actions: Record<
    | "delete"
    | "download"
    | "loadMore"
    | "restartUpload"
    | "retryConfirmation"
    | "retryCreate"
    | "retryUpload"
    | "select"
    | "upload",
    string
  >;
  capped: string;
  confirm: { deleteDocument: string; title: string };
  empty: {
    documents: string;
    relationships: string;
  };
  errors: Record<
    | "accessUnavailable"
    | "checksum"
    | "conflict"
    | "denied"
    | "expired"
    | "fileInvalid"
    | "idempotency"
    | "malformed"
    | "provider"
    | "quota"
    | "sensitiveDenied"
    | "unavailable"
    | "unknownConfirm"
    | "unknownDocument"
    | "validation",
    string
  >;
  fields: Record<
    | "category"
    | "checksum"
    | "description"
    | "documentDate"
    | "file"
    | "relationship"
    | "title",
    string
  >;
  loading: string;
  noWorkspace: {
    copy: string;
    title: string;
  };
  panels: {
    detail: string;
    documents: string;
    relationships: string;
    upload: string;
  };
  sensitive: string;
  states: Record<UploadStateValue, string>;
  status: {
    complete: string;
    deleted: string;
    downloaded: string;
    unknownOutcome: string;
  };
  title: string;
  values: Record<string, string>;
};

type CommandKind =
  "confirm" | "create-document" | "delete-document" | "upload-intent";
type CommandEntry = { ambiguous: boolean; key: string; logicalId: string };
type PendingConfirmation = {
  body: CreateUploadIntentRequestDto;
  intent: UploadIntentDto;
};

const commandKeysByLogicalId = new Map<string, CommandEntry>();
const maxCommandKeys = 64;
const maxUploadBytes = 200 * 1024 * 1024;
const initialForm: UploadFormValues = {
  category: "OTHER",
  checksumSha256: "",
  description: "",
  documentDate: "",
  file: null,
  title: "",
};

export function DocumentsExperience({ labels }: { labels: DocumentsLabels }) {
  const { generation } = useAuthSession();
  const { shellContext, workspace } = useStaffWorkspaceContext();
  return (
    <DocumentsContent
      key={JSON.stringify([
        generation,
        workspace?.workspaceId,
        workspace?.membershipId,
        shellContext?.accessContext,
      ])}
      labels={labels}
    />
  );
}

function DocumentsContent({ labels }: { labels: DocumentsLabels }) {
  const queryClient = useQueryClient();
  const { apiClient, generation, state } = useAuthSession();
  const { accessFacts, shellContext, workspace } = useStaffWorkspaceContext();
  const [selectedRelationshipId, setSelectedRelationshipId] =
    useState<RelationshipId | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
    null,
  );
  const [form, setForm] = useState<UploadFormValues>(initialForm);
  const [uploadState, setUploadState] = useState<UploadStateValue>("IDLE");
  const [uploadProgress, setUploadProgress] = useState<{
    indeterminate: boolean;
    value: number | null;
  }>({ indeterminate: false, value: null });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDownloadId, setPendingDownloadId] = useState<string | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<DocumentDto | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [confirmedFile, setConfirmedFile] = useState<{
    fileId: string;
    body: CreateUploadIntentRequestDto;
  } | null>(null);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);
  const flowGenerationRef = useRef(0);
  const activeUploadAbortRef = useRef<AbortController | null>(null);

  const workspaceId = workspace?.workspaceId ?? null;
  const membershipId = workspace?.membershipId;
  const accessContext = shellContext?.accessContext ?? "user";
  const principalId = state.status === "authenticated" ? state.user.id : null;
  const canQuery = state.status === "authenticated" && workspaceId !== null;
  const accessInput = {
    accessContext,
    accessFacts,
    generation,
    membershipId,
    workspaceId,
  };
  const decisions = {
    delete: actionDecision({ ...accessInput, permission: "documents.delete" }),
    documents: actionDecision({ ...accessInput, permission: "documents.read" }),
    download: actionDecision({ ...accessInput, permission: "files.download" }),
    medicalDownload: actionDecision({
      ...accessInput,
      permission: "medical_documents.download",
    }),
    medicalRead: actionDecision({
      ...accessInput,
      permission: "medical_documents.read",
    }),
    medicalUpload: actionDecision({
      ...accessInput,
      permission: "medical_documents.upload",
    }),
    relationships: actionDecision({
      ...accessInput,
      permission: "trainees.read",
    }),
    upload: actionDecision({ ...accessInput, permission: "documents.upload" }),
  };

  const relationshipsQuery = useQuery({
    enabled: canQuery && decisions.relationships.allowed,
    queryFn: ({ signal }) =>
      listRelationships(apiClient, workspaceId!, { status: "ACTIVE" }, signal),
    queryKey:
      workspaceId === null
        ? ["documents", "relationships", "none"]
        : relationshipKeys.list(
            workspaceId,
            generation,
            "ACTIVE",
            accessContext,
          ),
    retry: false,
  });
  const relationships = useMemo(
    () => relationshipsQuery.data ?? [],
    [relationshipsQuery.data],
  );
  const activeRelationship =
    relationships.find((item) => item.id === selectedRelationshipId) ??
    relationships[0] ??
    null;
  const activeRelationshipId = activeRelationship?.id ?? null;

  const documentsQuery = useQuery({
    enabled:
      canQuery &&
      membershipId !== undefined &&
      activeRelationshipId !== null &&
      decisions.documents.allowed,
    queryFn: ({ signal }) =>
      listDocuments(
        apiClient,
        workspaceId!,
        activeRelationshipId!,
        undefined,
        signal,
      ),
    queryKey:
      workspaceId === null ||
      membershipId === undefined ||
      activeRelationshipId === null
        ? ["documents", "list", "none"]
        : fileKeys.documents(
            workspaceId,
            membershipId,
            activeRelationshipId,
            generation,
            undefined,
            accessContext,
          ),
    retry: false,
  });
  const documents = documentsQuery.data?.data ?? [];
  const selectedDocument =
    documents.find((item) => item.id === selectedDocumentId) ??
    documents[0] ??
    null;
  const documentDetailQuery = useQuery({
    enabled:
      canQuery &&
      membershipId !== undefined &&
      activeRelationshipId !== null &&
      selectedDocument !== null &&
      decisions.documents.allowed,
    queryFn: ({ signal }) =>
      getDocument(
        apiClient,
        workspaceId!,
        activeRelationshipId!,
        selectedDocument!.id,
        signal,
      ),
    queryKey:
      workspaceId === null ||
      membershipId === undefined ||
      activeRelationshipId === null ||
      selectedDocument === null
        ? ["documents", "detail", "none"]
        : fileKeys.document(
            workspaceId,
            membershipId,
            activeRelationshipId,
            selectedDocument.id,
            generation,
            accessContext,
          ),
    retry: false,
  });

  const uploadMutation = useMutation({
    mutationFn: uploadDocumentFlow,
    onError: (unknown) => {
      if (isStaleFlowError(unknown)) {
        return;
      }
      setError(errorMessage(unknown, labels));
    },
    onSuccess: async () => {
      setMessage(labels.status.complete);
      setError(null);
      setUploadState("COMPLETE");
      setConfirmedFile(null);
      setPendingConfirmation(null);
      setForm(initialForm);
      await invalidateDocuments();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: async (document: DocumentDto) => {
      guardCommandContext({
        accessContext,
        membershipId,
        principalId,
        workspaceId,
      });
      const logicalId = commandLogicalId({
        accessContext,
        body: { expectedVersion: document.version },
        kind: "delete-document",
        membershipId,
        params: {
          documentId: document.id,
          relationshipId: activeRelationshipId,
          workspaceId,
        },
        principalId,
        workspaceId,
      });
      setPendingDeleteId(document.id);
      try {
        await deleteDocument(
          apiClient,
          workspaceId!,
          activeRelationshipId!,
          document.id,
          { expectedVersion: document.version },
          commandKey(logicalId),
        );
        retireCommandKey(logicalId);
        setMessage(labels.status.deleted);
        setDeleteTarget(null);
        await invalidateDocuments();
      } catch (unknown) {
        markCommandAmbiguous(logicalId);
        throw unknown;
      } finally {
        setPendingDeleteId(null);
      }
    },
    onError: (unknown) => setError(errorMessage(unknown, labels)),
  });

  useEffect(
    () => () => {
      invalidateUploadFlow();
    },
    [],
  );

  function beginUploadFlow(): number {
    flowGenerationRef.current += 1;
    activeUploadAbortRef.current?.abort();
    activeUploadAbortRef.current = null;
    setUploadProgress({ indeterminate: false, value: null });
    return flowGenerationRef.current;
  }

  function invalidateUploadFlow() {
    flowGenerationRef.current += 1;
    activeUploadAbortRef.current?.abort();
    activeUploadAbortRef.current = null;
  }

  function ensureCurrentFlow(flowId: number) {
    if (flowGenerationRef.current !== flowId) {
      throw staleFlowError();
    }
  }

  function guardedSet(flowId: number, update: () => void) {
    if (flowGenerationRef.current === flowId) {
      update();
    }
  }

  function ensureIntentUsableForFlow(flowId: number, intent: UploadIntentDto) {
    if (uploadIntentExpired(intent)) {
      guardedSet(flowId, () => setUploadState("EXPIRED"));
      throw expiredUploadIntentError(labels);
    }
  }

  async function uploadDocumentFlow() {
    const flowId = beginUploadFlow();
    guardCommandContext({
      accessContext,
      membershipId,
      principalId,
      workspaceId,
    });
    if (activeRelationshipId === null) {
      throw new ApiError({
        kind: "malformed-response",
        message: labels.empty.relationships,
      });
    }
    const file = form.file;
    validateFile(file, form.checksumSha256, labels);
    const sensitive =
      isMedicalCategory(form.category) || form.category === "INBODY";
    const uploadBody: CreateUploadIntentRequestDto = {
      purpose: "DOCUMENT",
      subjectType: "COACHING_RELATIONSHIP",
      subjectId: activeRelationshipId,
      fileName: file.name,
      mimeType: file.type as never,
      sizeBytes: file.size,
      classification: sensitive ? "SENSITIVE" : "STANDARD",
      ...(sensitive ? { sensitive: true } : {}),
      ...(form.checksumSha256.trim()
        ? { checksumSha256: form.checksumSha256.trim().toLowerCase() }
        : {}),
    };
    const uploadLogicalId = commandLogicalId({
      accessContext,
      body: uploadBody,
      kind: "upload-intent",
      membershipId,
      params: { workspaceId },
      principalId,
      workspaceId,
    });
    let fileId = confirmedFile?.fileId ?? null;
    let bodyForDocument = confirmedFile?.body ?? uploadBody;
    const reusableConfirmation =
      pendingConfirmation !== null &&
      stableStringify(pendingConfirmation.body) === stableStringify(uploadBody)
        ? pendingConfirmation
        : null;

    if (
      fileId === null ||
      stableStringify(bodyForDocument) !== stableStringify(uploadBody)
    ) {
      let intent = reusableConfirmation?.intent ?? null;
      if (intent === null) {
        guardedSet(flowId, () => setUploadState("INTENT_CREATING"));
        intent = await createUploadIntent(
          apiClient,
          workspaceId!,
          uploadBody,
          commandKey(uploadLogicalId),
        );
        ensureCurrentFlow(flowId);
        retireCommandKey(uploadLogicalId);
        setPendingConfirmation(null);
        guardedSet(flowId, () => setUploadState("INTENT_READY"));
        ensureIntentUsableForFlow(flowId, intent);

        const controller = new AbortController();
        activeUploadAbortRef.current = controller;
        try {
          guardedSet(flowId, () => setUploadState("UPLOADING"));
          await uploadProviderObject({
            body: file,
            headers: intent.uploadRequest.headers,
            method: intent.uploadRequest.method,
            onProgress: (progress) => {
              guardedSet(flowId, () =>
                setUploadProgress({
                  indeterminate: progress.indeterminate,
                  value:
                    progress.total && progress.total > 0
                      ? (progress.loaded / progress.total) * 100
                      : null,
                }),
              );
            },
            signal: controller.signal,
            url: intent.uploadRequest.url,
          });
          ensureCurrentFlow(flowId);
        } catch (unknown) {
          ensureCurrentFlow(flowId);
          if (isApiError(unknown) && unknown.status === 412) {
            guardedSet(flowId, () => setUploadState("UPLOAD_AMBIGUOUS"));
          } else if (isApiError(unknown) && unknown.kind === "network") {
            guardedSet(flowId, () => setUploadState("UPLOAD_AMBIGUOUS"));
          } else {
            guardedSet(flowId, () => setUploadState("PROVIDER_ERROR"));
            throw unknown;
          }
        } finally {
          if (activeUploadAbortRef.current === controller) {
            activeUploadAbortRef.current = null;
          }
        }
      } else {
        ensureIntentUsableForFlow(flowId, intent);
      }

      const confirmLogicalId = commandLogicalId({
        accessContext,
        body: { expectedVersion: intent.expectedVersion },
        kind: "confirm",
        membershipId,
        params: { uploadIntentId: intent.uploadIntentId, workspaceId },
        principalId,
        workspaceId,
      });
      guardedSet(flowId, () => setUploadState("CONFIRMING"));
      try {
        const confirmed = await confirmUpload(
          apiClient,
          workspaceId!,
          intent.uploadIntentId,
          { expectedVersion: intent.expectedVersion },
          commandKey(confirmLogicalId),
        );
        ensureCurrentFlow(flowId);
        retireCommandKey(confirmLogicalId);
        guardedSet(flowId, () => setUploadState("CONFIRMED"));
        fileId = confirmed.file.id;
        bodyForDocument = uploadBody;
        setConfirmedFile({ body: uploadBody, fileId });
        setPendingConfirmation(null);
      } catch (unknown) {
        ensureCurrentFlow(flowId);
        markCommandAmbiguous(confirmLogicalId);
        setPendingConfirmation({ body: uploadBody, intent });
        guardedSet(flowId, () => setUploadState("CONFIRM_UNKNOWN"));
        throw unknown;
      }
    }

    const createBody = {
      fileId: fileId as never,
      category: form.category,
      ...(form.title.trim() ? { title: form.title.trim() } : {}),
      ...(form.description.trim()
        ? { description: form.description.trim() }
        : {}),
      classification:
        isMedicalCategory(form.category) ||
        bodyForDocument.classification === "SENSITIVE"
          ? "SENSITIVE"
          : "STANDARD",
      ...(form.documentDate ? { documentDate: form.documentDate } : {}),
    } as const;
    const createLogicalId = commandLogicalId({
      accessContext,
      body: createBody,
      kind: "create-document",
      membershipId,
      params: { relationshipId: activeRelationshipId, workspaceId },
      principalId,
      workspaceId,
    });
    guardedSet(flowId, () => setUploadState("DOCUMENT_CREATING"));
    try {
      await createDocument(
        apiClient,
        workspaceId!,
        activeRelationshipId,
        createBody,
        commandKey(createLogicalId),
      );
      ensureCurrentFlow(flowId);
      retireCommandKey(createLogicalId);
    } catch (unknown) {
      ensureCurrentFlow(flowId);
      markCommandAmbiguous(createLogicalId);
      guardedSet(flowId, () => setUploadState("DOCUMENT_UNKNOWN"));
      throw unknown;
    }
  }

  async function downloadDocument(document: DocumentDto) {
    if (pendingDownloadId !== null || workspaceId === null) {
      return;
    }
    setPendingDownloadId(document.id);
    try {
      const download = await createDownloadUrl(
        apiClient,
        workspaceId,
        document.fileId,
      );
      setMessage(labels.status.downloaded);
      globalThis.open?.(download.url, "_blank", "noopener,noreferrer");
    } catch (unknown) {
      setError(errorMessage(unknown, labels));
    } finally {
      setPendingDownloadId(null);
    }
  }

  async function invalidateDocuments() {
    if (workspaceId && membershipId && activeRelationshipId) {
      await queryClient.invalidateQueries({
        queryKey: fileKeys.documents(
          workspaceId,
          membershipId,
          activeRelationshipId,
          generation,
          undefined,
          accessContext,
        ),
      });
    }
  }

  function resetUpload() {
    invalidateUploadFlow();
    setUploadState("IDLE");
    setUploadProgress({ indeterminate: false, value: null });
    setConfirmedFile(null);
    setPendingConfirmation(null);
    setError(null);
  }

  if (workspaceId === null) {
    return (
      <section className={styles.statePanel}>
        <h1>{labels.noWorkspace.title}</h1>
        <p>{labels.noWorkspace.copy}</p>
      </section>
    );
  }

  const listDenied =
    isApiError(documentsQuery.error) && documentsQuery.error.status === 403;
  const detail = documentDetailQuery.data ?? selectedDocument;

  return (
    <section className={styles.documents}>
      <div className={styles.header}>
        <h1>{labels.title}</h1>
        <p>{labels.capped}</p>
      </div>
      <div className={styles.toolbar}>
        <label className={styles.field}>
          <span>{labels.fields.relationship}</span>
          <select
            disabled={
              !decisions.relationships.allowed || relationships.length === 0
            }
            onChange={(event) => {
              invalidateUploadFlow();
              setConfirmedFile(null);
              setPendingConfirmation(null);
              setUploadProgress({ indeterminate: false, value: null });
              setUploadState("IDLE");
              setSelectedRelationshipId(
                event.currentTarget.value as RelationshipId,
              );
            }}
            value={activeRelationshipId ?? ""}
          >
            {relationships.length === 0 ? (
              <option value="">{labels.empty.relationships}</option>
            ) : null}
            {relationships.map((relationship) => (
              <option key={relationship.id} value={relationship.id}>
                {relationship.traineeUserId}
              </option>
            ))}
          </select>
        </label>
      </div>
      {message ? <p>{message}</p> : null}
      {error ? (
        <p className={styles.danger} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.grid}>
        <section className={styles.panel}>
          <h2>{labels.panels.documents}</h2>
          {!decisions.documents.allowed ? (
            <p>{labels.errors.denied}</p>
          ) : listDenied ? (
            <p>{labels.errors.sensitiveDenied}</p>
          ) : (
            <DocumentsList
              canDelete={decisions.delete}
              canDownload={decisions.download}
              canMedicalDownload={decisions.medicalDownload}
              canMedicalUpload={decisions.medicalUpload}
              documents={documents}
              emptyLabel={labels.empty.documents}
              labels={{
                actions: labels.actions,
                denied: labels.errors.denied,
                loading: labels.loading,
                sensitive: labels.sensitive,
              }}
              loading={documentsQuery.isLoading || documentsQuery.isFetching}
              onDelete={setDeleteTarget}
              onDownload={(document) => void downloadDocument(document)}
              onSelect={(document) => setSelectedDocumentId(document.id)}
              pendingDeleteId={pendingDeleteId}
              pendingDownloadId={pendingDownloadId}
              selectedDocumentId={detail?.id ?? null}
              values={labels.values}
            />
          )}
        </section>
        <section className={styles.panel}>
          <h2>{labels.panels.detail}</h2>
          {detail ? (
            <>
              <h3>{detail.title ?? labels.values[detail.category]}</h3>
              <div className={styles.meta}>
                <span>{labels.values[detail.category] ?? detail.category}</span>
                <span>{labels.values[detail.status] ?? detail.status}</span>
                <span>{detail.documentDate ?? detail.createdAt}</span>
                {detail.classification === "SENSITIVE" ||
                isMandatorySensitiveDocumentCategory(detail.category) ? (
                  <span className={styles.badge}>{labels.sensitive}</span>
                ) : null}
              </div>
              {detail.description ? <p>{detail.description}</p> : null}
            </>
          ) : (
            <p>{labels.empty.documents}</p>
          )}
        </section>
      </div>
      <DocumentUploadFlow
        canMedicalUpload={decisions.medicalUpload}
        canUpload={decisions.upload}
        disabledReason={labels.errors.denied}
        labels={{
          actions: labels.actions,
          fields: labels.fields,
          medicalDenied: labels.errors.denied,
          states: labels.states,
          values: labels.values,
        }}
        onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
        onFileChange={(file) => {
          invalidateUploadFlow();
          setConfirmedFile(null);
          setPendingConfirmation(null);
          setUploadProgress({ indeterminate: false, value: null });
          setUploadState("IDLE");
          setForm((current) => ({ ...current, file }));
        }}
        onRestart={resetUpload}
        onSubmit={() => {
          if (!uploadMutation.isPending) {
            uploadMutation.mutate();
          }
        }}
        pending={uploadMutation.isPending}
        progress={uploadProgress}
        state={uploadState}
        values={form}
      />
      <DeleteDocumentDialog
        cancelLabel={labels.actions.select}
        confirmLabel={labels.actions.delete}
        document={deleteTarget}
        message={labels.confirm.deleteDocument}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget !== null && !deleteMutation.isPending) {
            deleteMutation.mutate(deleteTarget);
          }
        }}
        pending={deleteMutation.isPending}
        title={labels.confirm.title}
      />
    </section>
  );
}

function actionDecision(input: {
  accessContext: AuthorizationCacheContext;
  accessFacts: ReturnType<typeof useStaffWorkspaceContext>["accessFacts"];
  generation: number;
  membershipId?: MembershipId;
  permission: PermissionKey;
  workspaceId: WorkspaceId | null;
}): AccessDecision {
  return evaluateAccess(input.accessFacts, {
    accessContext: input.accessContext,
    context: "WORKSPACE",
    membershipId: input.membershipId,
    permission: input.permission,
    scope: "workspace",
    sessionGeneration: input.generation,
    workspaceId: input.workspaceId ?? undefined,
  });
}

function validateFile(
  file: File | null,
  checksumSha256: string,
  labels: DocumentsLabels,
): asserts file is File {
  if (file === null || file.size <= 0 || file.size > maxUploadBytes) {
    throw new ApiError({
      category: "validation",
      kind: "backend",
      message: labels.errors.fileInvalid,
    });
  }
  if (!isAllowedUploadMimeType(file.type)) {
    throw new ApiError({
      category: "validation",
      kind: "backend",
      message: labels.errors.fileInvalid,
    });
  }
  const checksum = checksumSha256.trim();
  if (checksum && !/^[a-fA-F0-9]{64}$/.test(checksum)) {
    throw new ApiError({
      category: "validation",
      code: "CHECKSUM_INVALID",
      kind: "backend",
      message: labels.errors.checksum,
    });
  }
}

function guardCommandContext(input: {
  accessContext: AuthorizationCacheContext;
  membershipId?: string;
  principalId: string | null;
  workspaceId: string | null;
}) {
  if (
    input.principalId === null ||
    input.workspaceId === null ||
    input.membershipId === undefined
  ) {
    throw new Error("command identity unavailable");
  }
}

function commandLogicalId(input: {
  accessContext: AuthorizationCacheContext;
  body: unknown;
  kind: CommandKind;
  membershipId?: string;
  params: unknown;
  principalId: string | null;
  workspaceId: string | null;
}): string {
  guardCommandContext(input);
  return stableStringify({
    accessContext: input.accessContext,
    body: input.body,
    kind: input.kind,
    membershipId: input.membershipId,
    params: input.params,
    principalId: input.principalId,
    workspaceId: input.workspaceId,
  });
}

function commandKey(logicalId: string): string {
  const existing = commandKeysByLogicalId.get(logicalId);
  if (existing) {
    return existing.key;
  }
  if (commandKeysByLogicalId.size >= maxCommandKeys) {
    const evictable = [...commandKeysByLogicalId.values()].find(
      (item) => !item.ambiguous,
    );
    if (evictable === undefined) {
      throw new Error("documents command key capacity exhausted");
    }
    commandKeysByLogicalId.delete(evictable.logicalId);
  }
  const entry = {
    ambiguous: false,
    key: createIdempotencyKey(),
    logicalId,
  };
  commandKeysByLogicalId.set(logicalId, entry);
  return entry.key;
}

function markCommandAmbiguous(logicalId: string) {
  const existing = commandKeysByLogicalId.get(logicalId);
  if (existing) {
    existing.ambiguous = true;
  }
}

function retireCommandKey(logicalId: string) {
  commandKeysByLogicalId.delete(logicalId);
}

function uploadIntentExpired(intent: UploadIntentDto): boolean {
  const expiresAt = parseTimestamp(intent.expiresAt);
  const uploadUrlExpiresAt = parseTimestamp(intent.uploadUrlExpiresAt);
  if (expiresAt === null || uploadUrlExpiresAt === null) {
    return true;
  }
  return Math.min(expiresAt, uploadUrlExpiresAt) <= Date.now();
}

function parseTimestamp(value: string): number | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function expiredUploadIntentError(labels: DocumentsLabels): ApiError {
  return new ApiError({
    category: "validation",
    code: "UPLOAD_INTENT_EXPIRED",
    kind: "backend",
    message: labels.errors.expired,
  });
}

function staleFlowError(): Error {
  return new Error("documents upload flow is stale");
}

function isStaleFlowError(error: unknown): boolean {
  return (
    error instanceof Error && error.message === "documents upload flow is stale"
  );
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortValue(item)]),
    );
  }
  return value;
}

function errorMessage(error: unknown, labels: DocumentsLabels): string {
  if (!isApiError(error)) {
    return labels.errors.unavailable;
  }
  if (error.code === "UPLOAD_INTENT_EXPIRED") {
    return labels.errors.expired;
  }
  if (error.code === "UPLOAD_CHECKSUM_NOT_VERIFIABLE") {
    return labels.errors.checksum;
  }
  if (error.code === "UPLOAD_OBJECT_MISMATCH") {
    return labels.errors.provider;
  }
  if (error.code === "UPLOAD_OBJECT_NOT_FOUND") {
    return labels.errors.provider;
  }
  if (error.category === "expected-version-conflict") {
    return labels.errors.conflict;
  }
  if (error.category === "idempotency-conflict") {
    return labels.errors.idempotency;
  }
  if (error.category === "entitlement-or-quota") {
    return labels.errors.quota;
  }
  if (error.category === "forbidden") {
    return labels.errors.denied;
  }
  if (error.category === "validation") {
    return labels.errors.validation;
  }
  if (error.category === "provider-or-storage" || error.kind === "network") {
    return labels.errors.provider;
  }
  if (error.kind === "malformed-response") {
    return labels.errors.malformed;
  }
  return labels.errors.unavailable;
}
