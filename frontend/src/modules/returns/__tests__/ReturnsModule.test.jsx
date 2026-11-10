/** Goods back at RET, inspected once: restocked or written off. */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import * as api from '../../../api';
import { renderWithQuery } from '../../../test/renderWithQuery';
import ReturnsModule from '../ReturnsModule';

const ROW = { credit_note_id: 'CN-0001', line_id: 7, job_id: '1218774', customer: 'Ricoh', credit_date: '2026-11-09', stock_code: 'TEE-M', description: 'Tee', qty: 2, inspection: 'waiting', branch: 'MELB' };

beforeEach(() => {
  vi.spyOn(api.users, 'myAccess').mockResolvedValue({ role: 'staff', areas: [], allowed: ['GET /returns', 'POST /credit-notes/{note_id}/lines/{line_id}/inspect'] });
  vi.spyOn(api.creditNotes, 'returns').mockResolvedValue([ROW]);
});
afterEach(() => vi.restoreAllMocks());

test("what is waiting at RET, restocked to the job's branch", async () => {
  const inspect = vi.spyOn(api.creditNotes, 'inspect').mockResolvedValue({});
  renderWithQuery(<ReturnsModule />);
  const restock = await screen.findByRole('button', { name: 'Restock 2 TEE-M from CN-0001' });
  expect(restock).toHaveTextContent('Restock to MELB');
  fireEvent.click(restock);
  await waitFor(() => expect(inspect).toHaveBeenCalledWith('CN-0001', 7, 'restock'));
});

test('or written off — asked once more, naming what goes', async () => {
  const inspect = vi.spyOn(api.creditNotes, 'inspect').mockResolvedValue({});
  renderWithQuery(<ReturnsModule />);
  fireEvent.click(await screen.findByRole('button', { name: 'Write off 2 TEE-M from CN-0001' }));
  expect(inspect).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
  fireEvent.click(screen.getByRole('button', { name: 'Write off 2 TEE-M from CN-0001' }));
  fireEvent.click(screen.getByRole('button', { name: 'Write off 2 × TEE-M' }));
  await waitFor(() => expect(inspect).toHaveBeenCalledWith('CN-0001', 7, 'scrap'));
});

test('a role that may not inspect sees the list only', async () => {
  api.users.myAccess.mockResolvedValue({ role: 'overseas_staff', areas: [], allowed: ['GET /returns'] });
  renderWithQuery(<ReturnsModule />);
  expect(await screen.findByText('TEE-M')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Restock/ })).not.toBeInTheDocument();
});

test('nothing waiting says so', async () => {
  api.creditNotes.returns.mockResolvedValue([]);
  renderWithQuery(<ReturnsModule />);
  expect(await screen.findByText('Nothing waiting at RET.')).toBeInTheDocument();
});
