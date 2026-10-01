import { API_BASE_PATH } from "@/contracts";
import type { QueryParams, QueryPrimitive } from "./types";

const absoluteUrlPattern = /^[a-z][a-z\d+.-]*:/i;

export function normalizeApiPath(path: string): string {
  if (path.trim() !== path || path.length === 0) {
    throw new Error("API request path must be a non-empty API-relative path");
  }

  if (absoluteUrlPattern.test(path) || path.startsWith("//")) {
    throw new Error("API request path must not be an absolute URL");
  }

  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;

  if (withLeadingSlash.includes("//")) {
    throw new Error("API request path must not contain empty path segments");
  }

  if (withLeadingSlash === API_BASE_PATH) {
    return "/";
  }

  if (withLeadingSlash.startsWith(`${API_BASE_PATH}/`)) {
    return withLeadingSlash.slice(API_BASE_PATH.length);
  }

  return withLeadingSlash;
}

export function composeApiUrl(
  baseUrl: string,
  path: string,
  query?: QueryParams,
): URL {
  const base = new URL(baseUrl);
  const basePath = base.pathname.replace(/\/+$/, "");
  const normalizedBasePath = basePath.endsWith(API_BASE_PATH)
    ? basePath.slice(0, -API_BASE_PATH.length)
    : basePath;
  const apiPath = normalizeApiPath(path);
  const fullPath = `${normalizedBasePath}${API_BASE_PATH}${apiPath}`.replace(
    /\/{2,}/g,
    "/",
  );

  base.pathname = fullPath;
  base.search = "";

  const queryString = serializeQueryParams(query);
  if (queryString !== "") {
    base.search = queryString;
  }

  return base;
}

export function serializeQueryParams(query?: QueryParams): string {
  if (query === undefined) {
    return "";
  }

  const params = new URLSearchParams();

  for (const key of Object.keys(query).sort()) {
    const value = query[key];

    if (isQueryValueArray(value)) {
      for (const item of value) {
        appendQueryValue(params, key, item);
      }
      continue;
    }

    appendQueryValue(params, key, value);
  }

  return params.toString();
}

function isQueryValueArray(
  value: QueryPrimitive | readonly QueryPrimitive[],
): value is readonly QueryPrimitive[] {
  return Array.isArray(value);
}

function appendQueryValue(
  params: URLSearchParams,
  key: string,
  value: QueryPrimitive,
): void {
  if (value === undefined) {
    return;
  }

  params.append(key, value === null ? "" : String(value));
}
