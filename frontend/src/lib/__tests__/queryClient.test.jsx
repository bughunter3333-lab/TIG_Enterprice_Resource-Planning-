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

function Poller({ onError }) {
  useQuery({ queryKey: ['will-fail'], queryFn: async () => { throw new Error('down'); }, retry: false, refetchInterval: 60_000, onError });
  return null;
}

test('a poll that fails while its data is shown says nothing', async () => {
  const onError = vi.fn();
  const client = createAppQueryClient();
  client.setQueryData(['will-fail'], ['the last jobs']);
  render(<QueryClientProvider client={client}><Poller onError={onError} /></QueryClientProvider>);
  await client.refetchQueries({ queryKey: ['will-fail'] });
  await new Promise((r) => setTimeout(r, 20));
  expect(onError).not.toHaveBeenCalled();
});

test('a refresh someone asked for says it failed, data shown or not', async () => {
  const onError = vi.fn();
  const client = createAppQueryClient();
  client.setQueryData(['will-fail'], ['the last report']);
  render(<QueryClientProvider client={client}><Loader onError={onError} /></QueryClientProvider>);
  await client.refetchQueries({ queryKey: ['will-fail'] });
  await waitFor(() => expect(onError).toHaveBeenCalled());
});
