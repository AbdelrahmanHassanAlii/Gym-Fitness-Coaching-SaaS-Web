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
  expiresAt: string;
  uploadUrlExpiresAt: string;
  reservedBytes: number;
  expectedVersion: number;
}

export type CreateUploadIntentResponseDto = ApiDataEnvelope<UploadIntentDto>;

export interface ConfirmUploadRequestDto {
  expectedVersion: number;
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

export function isMandatorySensitiveDocumentCategory(
  value: DocumentCategory,
): boolean {
  return (
    mandatorySensitiveDocumentCategories as readonly DocumentCategory[]
  ).includes(value);
}
