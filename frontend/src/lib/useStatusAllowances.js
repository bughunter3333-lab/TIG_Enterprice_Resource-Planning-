import { useQuery } from '@tanstack/react-query';
import { statusTimes } from '../api';
import { setStatusAllowances } from '../modules/jobs/jobMetrics';

/**
 * The allowance per status (GET /status-allowances), read once and handed to
 * the shared job views, so every list, count and flag judges "over time" the
 * same way (docs/superpowers/specs/2026-11-09-status-times.md).
 *
 * Handed over as it renders, not in an effect: the views it feeds are worked
 * out in this same render, and an effect would leave them a render behind.
 */
export function useStatusAllowances() {
  const { data } = useQuery({ queryKey: ['status-allowances'], queryFn: statusTimes.get, staleTime: 300_000 });
  if (data) setStatusAllowances(data);
  return data ?? {};
}
