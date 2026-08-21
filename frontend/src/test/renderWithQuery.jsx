/**
 * Render a component with a QueryClient that does not swallow failures.
 *
 * TanStack Query catches whatever a queryFn throws and turns it into error
 * state. That is right for the app and wrong for a test: when a component calls
 * an API method the mock does not define, the call throws, the query lands in
 * error state, and the component renders its empty branch — so assertions that
 * only cover the happy path still pass. A test can click through to a panel and
 * never exercise the thing it looks like it covers.
 *
 * Query errors are collected here and re-raised after the test, so a mock that
 * has fallen behind the component fails loudly instead of rendering nothing.
 * Pass `allowQueryErrors` when the failure is the point — an error state under
 * test is not a stale mock.
 */
import { render } from '@testing-library/react';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach } from 'vitest';

const queryFailures = [];

export function renderWithQuery(ui, { allowQueryErrors = false } = {}) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (allowQueryErrors) return;
        const key = JSON.stringify(query?.queryKey ?? []);
        queryFailures.push(`${key} — ${error?.message ?? String(error)}`);
      },
    }),
  });

  return {
    client,
    ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>),
  };
}

afterEach(() => {
  const failures = queryFailures.splice(0);
  if (failures.length > 0) {
    throw new Error(
      'A query failed during this test. The usual cause is an API method the ' +
        'component calls but the mock does not define — which renders as an ' +
        'empty component, not as a visible error:\n  ' +
        failures.join('\n  ')
    );
  }
});
