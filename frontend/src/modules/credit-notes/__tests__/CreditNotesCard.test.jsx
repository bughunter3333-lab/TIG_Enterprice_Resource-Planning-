/**
 * An invoice's credit notes, and raising one
 * (docs/superpowers/specs/2026-11-09-returns-credit-notes.md).
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import * as api from '../../../api';
import { renderWithQuery } from '../../../test/renderWithQuery';
import CreditNotesCard from '../CreditNotesCard';

const MANAGER = ['GET /jobs/{job_id}/credit-notes', 'POST /jobs/{job_id}/credit-notes'];
const tee = { id: 11, displayType: 'product', stockCode: 'TEE-M', description: 'Tee', order: 4, supply: 4, priceEx: 10, priceInc: 11, decorationType: 'None' };
const emb = { id: 12, displayType: 'product', stockCode: 'EMB.RIC', description: 'Logo', order: 4, supply: 4, priceEx: 3, isService: true };
const JOB = { id: '1218774', status: 'INVOICE', balanceDue: 57.2, subtotal: 52, tax: 5.2, total: 57.2, invoiceDate: '2026-11-01', items: [tee, emb] };
const NOTE = {
  id: 'CN-0001', job_id: '1218774', credit_date: '2026-11-09', reason: 'Wrong size', total_inc: 22, unapplied: 0,
  lines: [{ id: 1, job_item_id: 11, stock_code: 'TEE-M', qty: 2, goods_back: true, restockable: true, inspection: 'waiting' }],
};

const access = (allowed) => vi.spyOn(api.users, 'myAccess').mockResolvedValue({ role: 'manager', areas: [], allowed });

beforeEach(() => vi.spyOn(api.creditNotes, 'forJob').mockResolvedValue([]));
afterEach(() => vi.restoreAllMocks());

test('a job not yet invoiced shows no card', async () => {
  access(MANAGER);
  renderWithQuery(<CreditNotesCard job={{ ...JOB, status: 'FINISH' }} />);
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByRole('heading', { name: /Credit notes/ })).not.toBeInTheDocument();
  expect(api.creditNotes.forJob).not.toHaveBeenCalled();
});

test("the invoice's credit notes are listed, with what came back", async () => {
  access(['GET /jobs/{job_id}/credit-notes']);
  api.creditNotes.forJob.mockResolvedValue([NOTE]);
  renderWithQuery(<CreditNotesCard job={JOB} />);
  expect(await screen.findByRole('link', { name: 'Adjustment note CN-0001 (PDF)' })).toHaveAttribute('href', '/api/credit-notes/CN-0001/pdf');
  expect(screen.getByText('2 × TEE-M · at RET, to be inspected')).toBeInTheDocument();
  // Staff read them; only managers and admins raise one.
  expect(screen.queryByRole('button', { name: /Credit \/ return/ })).not.toBeInTheDocument();
});

test('raising one: lines, goods coming back, a reason, the credit worked out', async () => {
  access(MANAGER);
  const raise = vi.spyOn(api.creditNotes, 'raise').mockResolvedValue({ ...NOTE });
  renderWithQuery(<CreditNotesCard job={JOB} />);
  fireEvent.click(await screen.findByRole('button', { name: /Credit \/ return/ }));
  const dialog = await screen.findByRole('dialog');
  // A decoration is money only: nothing comes back.
  expect(within(dialog).getByText('Money only')).toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText('Credit how many TEE-M'), { target: { value: '2' } });
  fireEvent.click(within(dialog).getByLabelText('TEE-M is coming back'));
  expect(within(dialog).getByText('$22.00')).toBeInTheDocument();
  const go = within(dialog).getByRole('button', { name: /Raise credit note/ });
  expect(go).toBeDisabled(); // a reason is needed
  fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: 'Wrong size' } });
  fireEvent.click(go);
  await waitFor(() => expect(raise).toHaveBeenCalled());
  expect(raise.mock.calls[0][0]).toBe('1218774');
  expect(raise.mock.calls[0][1]).toMatchObject({ lines: [{ itemId: 11, qty: 2, goodsBack: true }], reason: 'Wrong size' });
});

test('never more than is left to credit', async () => {
  access(MANAGER);
  api.creditNotes.forJob.mockResolvedValue([NOTE]);
  renderWithQuery(<CreditNotesCard job={JOB} />);
  fireEvent.click(await screen.findByRole('button', { name: /Credit \/ return/ }));
  const qty = within(await screen.findByRole('dialog')).getByLabelText('Credit how many TEE-M');
  fireEvent.change(qty, { target: { value: '9' } });
  expect(qty).toHaveValue(2);
});

test('an invoice with no lines is credited by an amount', async () => {
  access(MANAGER);
  const raise = vi.spyOn(api.creditNotes, 'raise').mockResolvedValue({ ...NOTE, lines: [] });
  const header = { id: 'J2-78', status: 'INVOICE', balanceDue: 110, subtotal: 100, tax: 10, total: 110, items: [] };
  renderWithQuery(<CreditNotesCard job={header} />);
  fireEvent.click(await screen.findByRole('button', { name: /Credit \/ return/ }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText(/This invoice has no lines/)).toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText('Credit (inc GST)'), { target: { value: '33' } });
  expect(within(dialog).getByText('$33.00')).toBeInTheDocument();
  expect(within(dialog).getByText(/\$30\.00 ex GST, \$3\.00 GST/)).toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: 'Late' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Raise credit note/ }));
  await waitFor(() => expect(raise).toHaveBeenCalled());
  expect(raise.mock.calls[0][1]).toMatchObject({ amount: 33, reason: 'Late' });
  expect(raise.mock.calls[0][1].lines).toBeUndefined();
});

test('a garment with a logo naming no garment says it will not be restocked', async () => {
  access(MANAGER);
  const logo = { id: 13, displayType: 'product', stockCode: 'EMB.ALL', order: 4, priceEx: 3, isService: true, logoId: 9, appliesToItemId: null };
  renderWithQuery(<CreditNotesCard job={{ ...JOB, items: [tee, logo] }} />);
  fireEvent.click(await screen.findByRole('button', { name: /Credit \/ return/ }));
  expect(within(await screen.findByRole('dialog')).getByText('Decorated — not restocked')).toBeInTheDocument();
});

test('raised, the open job is reloaded', async () => {
  access(MANAGER);
  vi.spyOn(api.creditNotes, 'raise').mockResolvedValue({ ...NOTE });
  const onChanged = vi.fn();
  renderWithQuery(<CreditNotesCard job={JOB} onChanged={onChanged} />);
  fireEvent.click(await screen.findByRole('button', { name: /Credit \/ return/ }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Credit how many TEE-M'), { target: { value: '1' } });
  fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: 'x' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Raise credit note/ }));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
});
