/**
 * Picking on a phone (docs/superpowers/specs/2026-11-09-phone-picking.md): scan
 * the job, walk the bins, scan each garment.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import * as api from '../../../api';
import { renderWithQuery } from '../../../test/renderWithQuery';
import PickingModule from '../PickingModule';
import { bySku, jobNumber, lineForScan, walkOrder } from '../pickScan';

const STOCK = [
  { sku: 'POLO-NAV-M', barcode: '9312345000017', location: 'B.2.A.1' },
  { sku: 'CAP-BLK', barcode: null, location: 'A.1.A.1' },
];
const line = (id, stockCode, supply, extra = {}) => ({ id, displayType: 'product', stockCode, description: stockCode, supply, qtyPick: 0, bOrd: 0, ...extra });
const JOB = {
  id: '1218774', customer: 'Ricoh Australia', status: 'ORDER', items: [
    line(11, 'POLO-NAV-M', 2),
    line(12, 'CAP-BLK', 1),
    { id: 13, displayType: 'product', stockCode: 'EMB.RIC', isService: true, supply: 2 },
  ],
};

beforeEach(() => {
  vi.spyOn(api.users, 'myAccess').mockResolvedValue({ role: 'staff', areas: [], allowed: ['POST /jobs/{job_id}/pick', 'POST /jobs/{job_id}/status'] });
  vi.spyOn(api.inventory, 'list').mockResolvedValue(STOCK);
  vi.spyOn(api.jobs, 'get').mockResolvedValue(JOB);
});
afterEach(() => vi.restoreAllMocks());

test('a scan is a stock code or its barcode; of two lines, the one still to pick', () => {
  const stock = bySku(STOCK);
  const lines = [line(1, 'POLO-NAV-M', 2), line(2, 'POLO-NAV-M', 1)];
  const picked = { 1: 2, 2: 0 };
  expect(lineForScan(lines, '9312345000017', stock, (l) => picked[l.id]).id).toBe(2);
  expect(lineForScan(lines, 'polo-nav-m', stock, () => 0).id).toBe(1);
  expect(lineForScan(lines, 'NOPE', stock, () => 0)).toBeNull();
});

test('the lines come in the order the shelves are walked', () => {
  expect(walkOrder(JOB.items.slice(0, 2), bySku(STOCK)).map((l) => l.stockCode)).toEqual(['CAP-BLK', 'POLO-NAV-M']);
  expect(jobNumber(' #1218774 ')).toBe('1218774');
});

const scan = (text) => {
  const field = screen.getByRole('textbox');
  fireEvent.change(field, { target: { value: text } });
  fireEvent.submit(field.closest('form'));
};

test('scan the job, scan the garments, save and mark it picked', async () => {
  const pick = vi.spyOn(api.jobs, 'pick').mockResolvedValue({ allPicked: true, job: { ...JOB, items: JOB.items } });
  const status = vi.spyOn(api.jobs, 'updateStatus').mockResolvedValue({ ...JOB, status: 'Picked' });
  renderWithQuery(<PickingModule />);
  scan('1218774');
  const job = await screen.findByRole('region', { name: 'Picking job 1218774' });
  // Decoration is not picked off a shelf; the cap's bin comes first.
  expect(within(job).queryByText('EMB.RIC')).not.toBeInTheDocument();
  scan('9312345000017');
  expect(await screen.findByText('POLO-NAV-M — 1 of 2')).toBeInTheDocument();
  scan('9312345000017');
  scan('CAP-BLK');
  expect(within(job).getByLabelText('2 of 2 picked')).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Save and mark picked' }));
  await waitFor(() => expect(status).toHaveBeenCalledWith('1218774', 'Picked'));
  expect(pick).toHaveBeenCalledWith('1218774', [{ item_id: 12, qty_pick: 1 }, { item_id: 11, qty_pick: 2 }]);
});

test('a code not on the job says so; one picked in full already says so', async () => {
  renderWithQuery(<PickingModule />);
  scan('1218774');
  await screen.findByRole('region', { name: 'Picking job 1218774' });
  scan('HOODIE-RED');
  expect(await screen.findByText('HOODIE-RED is not on job 1218774.')).toBeInTheDocument();
  scan('CAP-BLK');
  scan('CAP-BLK');
  expect(await screen.findByText('CAP-BLK is picked in full already.')).toBeInTheDocument();
});

test('part picked, it can be marked Inco/Pick', async () => {
  vi.spyOn(api.jobs, 'pick').mockResolvedValue({ allPicked: false, job: JOB });
  const status = vi.spyOn(api.jobs, 'updateStatus').mockResolvedValue({ ...JOB, status: 'Inco/Pick' });
  renderWithQuery(<PickingModule />);
  scan('1218774');
  await screen.findByRole('region', { name: 'Picking job 1218774' });
  scan('CAP-BLK');
  fireEvent.click(await screen.findByRole('button', { name: 'Save and mark Inco/Pick' }));
  await waitFor(() => expect(status).toHaveBeenCalledWith('1218774', 'Inco/Pick'));
});

test('a job number that is not one says so', async () => {
  api.jobs.get.mockRejectedValue(Object.assign(new Error('Job not found'), { status: 404 }));
  renderWithQuery(<PickingModule />);
  scan('999');
  expect(await screen.findByText('No job 999.')).toBeInTheDocument();
});
