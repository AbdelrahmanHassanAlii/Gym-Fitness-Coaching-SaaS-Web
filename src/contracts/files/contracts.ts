import type { ApiDataEnvelope } from "@/contracts/common/http";
import type {
  DocumentId,
  FileId,
  RelationshipId,
} from "@/contracts/common/ids";

export const uploadPurposes = [
  "DOCUMENT",
  "PROGRESS_PHOTO",
  "GENERIC",
] as const;
export const uploadSubjectTypes = [
  "COACHING_RELATIONSHIP",
  "WORKSPACE",
] as const;
export const fileClassifications = ["STANDARD", "SENSITIVE"] as const;
export const documentCategories = [
  "INBODY",
  "BLOOD_TEST",
  "MEDICAL_REPORT",
  "DIET_DOCUMENT",
  "TRAINING_DOCUMENT",
  "INJURY_REPORT",
  "OTHER",
] as const;
export const mandatorySensitiveDocumentCategories = [
  "INBODY",
  "BLOOD_TEST",
  "MEDICAL_REPORT",
  "INJURY_REPORT",
] as const satisfies readonly DocumentCategory[];
export const uploadMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type UploadPurpose = (typeof uploadPurposes)[number];
export type UploadSubjectType = (typeof uploadSubjectTypes)[number];
export type FileClassification = (typeof fileClassifications)[number];
export type DocumentCategory = (typeof documentCategories)[number];
export type UploadMimeType = (typeof uploadMimeTypes)[number];

export interface CreateUploadIntentRequestDto {
  purpose: UploadPurpose;
  subjectType: UploadSubjectType;
  subjectId?: RelationshipId | string;
  fileName: string;
  mimeType: UploadMimeType;
  sizeBytes: number;
  checksumSha256?: string;
  classification?: FileClassification;
  sensitive?: boolean;
}

export interface UploadIntentDto {
  uploadIntentId: string;
  uploadUrl: string;
  uploadRequest: {
    method: "PUT";
    url: string;
    headers: Record<string, string>;
  };
  expiresAt: string;
  uploadUrlExpiresAt: string;
  reservedBytes: number;
  expectedVersion: number;
}

export type CreateUploadIntentResponseDto = ApiDataEnvelope<UploadIntentDto>;

export interface ConfirmUploadRequestDto {
  expectedVersion: number;
}

export interface ConfirmUploadResponseDto {
  file: FileDto;
}

export interface FileDto {
  id: FileId;
  status: "ACTIVE" | "SOFT_DELETED" | "PURGE_PENDING" | "PURGED";
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  classification: FileClassification;
  version: number;
  createdAt: string;
  confirmedAt?: string;
  deletedAt?: string;
  purgeEligibleAt?: string;
  physicallyDeletedAt?: string;
}

export interface DocumentDto {
  id: DocumentId;
  relationshipId: RelationshipId;
  fileId: FileId;
  category: DocumentCategory;
  title?: string;
  description?: string;
  classification: FileClassification;
  status: "ACTIVE" | "DELETED";
  version: number;
  documentDate?: string;
  createdAt: string;
  deletedAt?: string;
}

export interface DocumentPageDto {
  data: DocumentDto[];
  pageInfo: {
    hasMore: boolean;
    nextCursor?: string;
  };
}

export interface CreateDocumentRequestDto {
  fileId: FileId;
  category: DocumentCategory;
  title?: string;
  description?: string;
  classification?: FileClassification;
  documentDate?: string;
}

export interface DocumentCommandResponseDto {
  document: DocumentDto;
}

export interface DownloadUrlDto {
  url: string;
  expiresAt: string;
}

export function isMandatorySensitiveDocumentCategory(
  value: DocumentCategory,
): boolean {
  return (
    mandatorySensitiveDocumentCategories as readonly DocumentCategory[]
  ).includes(value);
}

export function isUploadMimeType(value: unknown): value is UploadMimeType {
  return (
    typeof value === "string" &&
    (uploadMimeTypes as readonly string[]).includes(value)
  );
}

export function isDocumentCategory(value: unknown): value is DocumentCategory {
  return (
    typeof value === "string" &&
    (documentCategories as readonly string[]).includes(value)
  );
}

export function isFileClassification(
  value: unknown,
): value is FileClassification {
  return (
    typeof value === "string" &&
    (fileClassifications as readonly string[]).includes(value)
  );
}

export function isUploadIntentDto(value: unknown): value is UploadIntentDto {
  if (!isRecord(value)) {
    return false;
  }

  const uploadRequest = value.uploadRequest;
  return (
    typeof value.uploadIntentId === "string" &&
    typeof value.uploadUrl === "string" &&
    isRecord(uploadRequest) &&
    uploadRequest.method === "PUT" &&
    typeof uploadRequest.url === "string" &&
    isStringRecord(uploadRequest.headers) &&
    typeof value.expiresAt === "string" &&
    typeof value.uploadUrlExpiresAt === "string" &&
    typeof value.reservedBytes === "number" &&
    typeof value.expectedVersion === "number"
  );
}

export function isFileDto(value: unknown): value is FileDto {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.status === "string" &&
    typeof value.originalName === "string" &&
    typeof value.mimeType === "string" &&
    typeof value.sizeBytes === "number" &&
    isFileClassification(value.classification) &&
    typeof value.version === "number" &&
    typeof value.createdAt === "string"
  );
}

export function isDocumentDto(value: unknown): value is DocumentDto {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.relationshipId === "string" &&
    typeof value.fileId === "string" &&
    isDocumentCategory(value.category) &&
    isFileClassification(value.classification) &&
    typeof value.status === "string" &&
    typeof value.version === "number" &&
    typeof value.createdAt === "string"
  );
}

export function isDocumentPageDto(value: unknown): value is DocumentPageDto {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    return false;
  }

  const pageInfo = value.pageInfo;
  return (
    value.data.every(isDocumentDto) &&
    isRecord(pageInfo) &&
    typeof pageInfo.hasMore === "boolean" &&
    (pageInfo.nextCursor === undefined ||
      typeof pageInfo.nextCursor === "string")
  );
}

export function isConfirmUploadResponseDto(
  value: unknown,
): value is ConfirmUploadResponseDto {
  return isRecord(value) && isFileDto(value.file);
}

export function isDocumentCommandResponseDto(
  value: unknown,
): value is DocumentCommandResponseDto {
  return isRecord(value) && isDocumentDto(value.document);
}

export function isDownloadUrlDto(value: unknown): value is DownloadUrlDto {
  return (
    isRecord(value) &&
    typeof value.url === "string" &&
    typeof value.expiresAt === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every((item) => typeof item === "string");
}
