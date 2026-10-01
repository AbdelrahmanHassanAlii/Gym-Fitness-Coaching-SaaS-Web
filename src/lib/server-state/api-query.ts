import type { QueryFunctionContext, QueryKey } from "@tanstack/react-query";
import type { ApiClient, ApiRequestOptions, QueryParams } from "@/lib/api";

export type ApiQueryRequestFactory<
  TBody = unknown,
  TQuery extends QueryParams = QueryParams,
> = (
  context: QueryFunctionContext<QueryKey>,
) => ApiRequestOptions<TBody, TQuery>;

export function createApiQueryFn<TResponse, TBody = unknown>(
  apiClient: ApiClient,
  createRequest: ApiQueryRequestFactory<TBody>,
) {
  return (context: QueryFunctionContext<QueryKey>): Promise<TResponse> => {
    const request = createRequest(context);

    return apiClient.request<TResponse, TBody>({
      ...request,
      signal: context.signal,
    });
  };
}
