import { render, waitFor } from '@testing-library/react';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { createAppQueryClient } from '../queryClient';

function Loader({ onError }) {
  useQuery({ queryKey: ['will-fail'], queryFn: async () => { throw new Error('jobs did not load'); }, retry: false, onError });
  return null;
}

test("a failed load reaches the query's own onError, as the app's queries expect", async () => {
  const onError = vi.fn();
  render(<QueryClientProvider client={createAppQueryClient()}><Loader onError={onError} /></QueryClientProvider>);
  await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
  expect(onError.mock.calls[0][0].message).toBe('jobs did not load');
});

test('a query with no onError of its own fails quietly, as before', async () => {
  render(<QueryClientProvider client={createAppQueryClient()}><Loader /></QueryClientProvider>);
  await new Promise((r) => setTimeout(r, 20));
});
