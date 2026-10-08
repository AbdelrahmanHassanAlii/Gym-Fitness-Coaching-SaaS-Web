import { describe, expect, test, vi } from "vitest";
import type { ApiClient } from "@/lib/api";
import { createUploadIntent, fileKeys, uploadProviderObject } from "./api";

describe("files API", () => {
  test("accepts the Stage 20 upload request contract without leaking signed URL into keys", async () => {
    const request = vi.fn().mockResolvedValue({
      data: {
        expectedVersion: 0,
        expiresAt: "2026-01-01T00:15:00.000Z",
        reservedBytes: 12,
        uploadIntentId: "intent_a",
        uploadRequest: {
          headers: { "content-type": "application/pdf", "if-none-match": "*" },
          method: "PUT",
          url: "https://provider.example/upload?signature=secret",
        },
        uploadUrl: "https://provider.example/upload?signature=secret",
        uploadUrlExpiresAt: "2026-01-01T00:10:00.000Z",
      },
    });
    const apiClient = { request } as unknown as ApiClient;

    const intent = await createUploadIntent(
      apiClient,
      "workspace_a" as never,
      {
        fileName: "plan.pdf",
        mimeType: "application/pdf",
        purpose: "DOCUMENT",
        sizeBytes: 12,
        subjectId: "relationship_a",
        subjectType: "COACHING_RELATIONSHIP",
      },
      "idempotency-key",
    );

    expect(intent.uploadRequest).toEqual({
      headers: { "content-type": "application/pdf", "if-none-match": "*" },
      method: "PUT",
      url: intent.uploadUrl,
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "idempotency-key",
        method: "POST",
        path: "/workspaces/workspace_a/files/upload-intents",
      }),
    );
    expect(() =>
      fileKeys.documents(
        "workspace_a" as never,
        "membership_a",
        "relationship_a" as never,
        1,
        undefined,
      ),
    ).not.toThrow();
  });

  test("XHR provider upload uses returned method, URL, and headers without content-length", async () => {
    const calls: Array<readonly [string, string] | readonly ["send", Blob]> =
      [];
    const progressEvents: Array<{
      indeterminate: boolean;
      loaded: number;
      total?: number;
    }> = [];
    class MockXHR {
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
      abort = vi.fn();
      open(method: string, url: string) {
        calls.push([method, url]);
      }
      setRequestHeader(header: string, value: string) {
        calls.push([header, value]);
      }
      send(body: Blob) {
        calls.push(["send", body]);
        this.upload.onprogress?.({
          lengthComputable: true,
          loaded: 5,
          total: 10,
        });
        this.onload?.();
      }
    }
    vi.stubGlobal("XMLHttpRequest", MockXHR);
    const body = new Blob(["abc"], { type: "application/pdf" });

    await uploadProviderObject({
      body,
      headers: {
        "content-length": "3",
        "content-type": "application/pdf",
        "if-none-match": "*",
      },
      method: "PUT",
      onProgress: (progress) => progressEvents.push(progress),
      url: "https://provider.example/upload?signature=secret",
    });

    expect(calls).toEqual([
      ["PUT", "https://provider.example/upload?signature=secret"],
      ["content-type", "application/pdf"],
      ["if-none-match", "*"],
      ["send", body],
    ]);
    expect(progressEvents).toEqual([
      { indeterminate: false, loaded: 5, total: 10 },
    ]);
  });

  test("XHR provider upload reports indeterminate progress and supports local abort", async () => {
    const progressEvents: Array<{
      indeterminate: boolean;
      loaded: number;
      total?: number;
    }> = [];
    class MockXHR {
      status = 0;
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
      abort() {
        this.onabort?.();
      }
      open() {
        return undefined;
      }
      setRequestHeader() {
        return undefined;
      }
      send() {
        this.upload.onprogress?.({
          lengthComputable: false,
          loaded: 3,
          total: 0,
        });
      }
    }
    vi.stubGlobal("XMLHttpRequest", MockXHR);
    const controller = new AbortController();

    const upload = uploadProviderObject({
      body: new Blob(["abc"], { type: "application/pdf" }),
      headers: { "content-type": "application/pdf", "if-none-match": "*" },
      method: "PUT",
      onProgress: (progress) => progressEvents.push(progress),
      signal: controller.signal,
      url: "https://provider.example/upload?signature=secret",
    });
    controller.abort();

    await expect(upload).rejects.toThrow("Provider upload was aborted locally");
    expect(progressEvents).toEqual([{ indeterminate: true, loaded: 3 }]);
  });
});
