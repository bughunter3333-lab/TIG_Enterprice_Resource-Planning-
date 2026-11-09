import { QueryCache, QueryClient } from '@tanstack/react-query';

/**
 * The app's one query client.
 *
 * Its queries were written for TanStack Query 4, where `useQuery({ onError })`
 * ran on a failed load. Version 5 dropped that option and ignores it without a
 * word, so a failed jobs, customers or analytics load showed no notice at all —
 * the list was simply empty. The cache calls each query's own `onError` again,
 * once per failure, so every one of those notices works as written.
 */
export function createAppQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => query.options?.onError?.(error),
    }),
    defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchIntervalInBackground: false } },
  });
}
