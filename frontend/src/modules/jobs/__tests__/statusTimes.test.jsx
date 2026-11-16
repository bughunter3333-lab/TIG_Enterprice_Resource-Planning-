/**
 * Time at each status (docs/superpowers/specs/2026-11-09-status-times.md):
 * working days since a job came to its status, against its allowance.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import * as api from '../../../api';
import { renderWithQuery } from '../../../test/renderWithQuery';
import { inView, isOverTime, setStatusAllowances, timeAtStatus, workingDaysSince } from '../jobMetrics';
import { filterJobs, EMPTY_JOBS_FILTERS } from '../jobsFilters';
import OverTime from '../OverTime';
import StatusTimesSettings from '../StatusTimesSettings';

afterEach(() => { setStatusAllowances({}); vi.restoreAllMocks(); });

// Monday 2 November 2026 … Monday 9 November 2026.
const at = (d, h = 10) => new Date(2026, 10, d, h).toISOString();
const day = (d, h = 15) => new Date(2026, 10, d, h);

test('working days skip the weekend', () => {
  expect(workingDaysSince(at(2), day(4))).toBe(2); // Mon → Wed
  expect(workingDaysSince(at(6), day(9))).toBe(1); // Fri → Mon
  expect(workingDaysSince(at(9, 8), day(9))).toBe(0); // the same day
  expect(workingDaysSince(null, day(9))).toBeNull();
});

test('over its allowance is flagged; within it, or with no limit, is not', () => {
  const allowances = { PROOF: 3, ProdExt: 0 };
  const proof = { status: 'PROOF', statusChangedAt: at(2) };
  expect(timeAtStatus(proof, { allowances, now: day(5) })).toEqual({ days: 3, allowed: 3, over: false });
  expect(timeAtStatus(proof, { allowances, now: day(6) })).toEqual({ days: 4, allowed: 3, over: true });
  expect(timeAtStatus({ status: 'ProdExt', statusChangedAt: at(2) }, { allowances, now: day(20) })).toBeNull();
  expect(timeAtStatus({ status: 'QUOTE', statusChangedAt: at(2) }, { allowances, now: day(20) })).toBeNull();
});

test("the app's table is what every view reads, the quick filter too", () => {
  const stuck = { id: '1', status: 'PROOF', statusChangedAt: at(2), items: [] };
  const fresh = { id: '2', status: 'PROOF', statusChangedAt: new Date().toISOString(), items: [] };
  expect(isOverTime(stuck)).toBe(false); // no table yet: nothing flagged
  setStatusAllowances({ PROOF: 1 });
  expect(inView(stuck, 'overTime')).toBe(true);
  expect(inView(fresh, 'overTime')).toBe(false);
  expect(filterJobs([stuck, fresh], { ...EMPTY_JOBS_FILTERS, quick: 'overTime' }, null).map((j) => j.id)).toEqual(['1']);
});

test('the mark beside the status says how long, and the allowance', () => {
  setStatusAllowances({ PROOF: 1 });
  const job = { status: 'PROOF', statusChangedAt: at(2) };
  const { rerender } = render(<OverTime job={job} />);
  expect(screen.getByLabelText(/^At Proof \d+ working days — its allowance is 1$/)).toBeInTheDocument();
  rerender(<OverTime job={{ status: 'PROOF', statusChangedAt: new Date().toISOString() }} />);
  expect(screen.queryByText(/working day/)).not.toBeInTheDocument();
});

test('an admin sets the days; only whole days 0 to 60 are saved', async () => {
  vi.spyOn(api.statusTimes, 'get').mockResolvedValue({ New: 1, PROOF: 3, Ready: 2 });
  const save = vi.spyOn(api.statusTimes, 'save').mockResolvedValue({ New: 1, PROOF: 5, Ready: 2 });
  renderWithQuery(<StatusTimesSettings />);
  const proof = await screen.findByLabelText('Working days at PROOF');
  fireEvent.change(proof, { target: { value: '61' } });
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  fireEvent.change(proof, { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(save).toHaveBeenCalledWith({ PROOF: 5 }));
});
