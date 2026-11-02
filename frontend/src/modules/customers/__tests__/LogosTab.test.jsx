/**
 * A customer's logos: listed with who does them and their proof, added with
 * the decorator a subcontracted logo needs, and proofed once for every job.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import { logos, suppliers, users } from '../../../api';
import LogosTab, { logoProblems } from '../LogosTab';

vi.mock('../../../api', () => ({
  logos: { list: vi.fn(), create: vi.fn(), proof: vi.fn(), update: vi.fn() },
  suppliers: { list: vi.fn() },
  users: { myAccess: vi.fn() },
}));

const STAFF = { role: 'staff', areas: [], allowed: ['GET /logos', 'POST /logos', 'POST /logos/{logo_id}/proof'] };
const OVERSEAS = { role: 'overseas_staff', areas: [], allowed: ['GET /logos'] };
const LOGO = {
  id: 4, code: 'EMB.CFG.LHC', name: 'Left chest', decorationType: 'EMB', position: 'L.Chest',
  stitchCount: 8500, priceEx: 6.5, costEx: 3.2, madeBy: 'subcontract', supplierId: 'STITCH',
  proofStatus: 'sent', approvedBy: null, jobs: ['110000', '110001'],
};

beforeEach(() => {
  vi.clearAllMocks();
  logos.list.mockResolvedValue([LOGO]);
  suppliers.list.mockResolvedValue([{ code: 'STITCH', name: 'Stitchline' }]);
});

test('each logo shows who does it and where its proof is', async () => {
  users.myAccess.mockResolvedValue(STAFF);
  renderWithQuery(<LogosTab customerId="CFG" />);
  const row = within((await screen.findByText('EMB.CFG.LHC')).closest('tr'));
  expect(row.getByText('L.Chest')).toBeInTheDocument();
  expect(await row.findByText('Stitchline')).toBeInTheDocument();
  expect(row.getByText('With the customer')).toBeInTheDocument();
});

test('approving a proof approves the logo', async () => {
  users.myAccess.mockResolvedValue(STAFF);
  logos.proof.mockResolvedValue({ ...LOGO, proofStatus: 'approved', approvedBy: 'Sam' });
  renderWithQuery(<LogosTab customerId="CFG" />);
  fireEvent.click(await screen.findByRole('button', { name: /mark emb\.cfg\.lhc approved/i }));
  await waitFor(() => expect(logos.proof).toHaveBeenCalledWith(4, 'approved'));
});

test('a role that only reads logos is offered no proofing and no new logo', async () => {
  users.myAccess.mockResolvedValue(OVERSEAS);
  renderWithQuery(<LogosTab customerId="CFG" />);
  expect(await screen.findByText('EMB.CFG.LHC')).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument());
  expect(screen.queryByRole('button', { name: 'New logo' })).not.toBeInTheDocument();
});

test('a new logo is sent with its customer', async () => {
  users.myAccess.mockResolvedValue(STAFF);
  logos.create.mockResolvedValue({ ...LOGO, id: 5, code: 'EMB.CFG.BACK' });
  renderWithQuery(<LogosTab customerId="CFG" />);
  fireEvent.click(await screen.findByRole('button', { name: 'New logo' }));
  const form = within(screen.getByRole('form', { name: 'New logo' }));
  fireEvent.change(form.getByPlaceholderText('EMB.CFG.LHC'), { target: { value: 'EMB.CFG.BACK' } });
  fireEvent.click(form.getByRole('button', { name: 'Add logo' }));
  await waitFor(() => expect(logos.create).toHaveBeenCalledWith(expect.objectContaining({ code: 'EMB.CFG.BACK', customerId: 'CFG' })));
});

const EDITOR = { ...STAFF, allowed: [...STAFF.allowed, 'PATCH /logos/{logo_id}'] };

test('editing a logo sends only what changed, through PATCH /logos/{id} (F09)', async () => {
  users.myAccess.mockResolvedValue(EDITOR);
  logos.update.mockResolvedValue({ ...LOGO, priceEx: 7, madeBy: 'in_house', supplierId: null });
  renderWithQuery(<LogosTab customerId="CFG" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit EMB.CFG.LHC' }));
  const form = within(screen.getByRole('form', { name: 'Edit EMB.CFG.LHC' }));
  expect(form.getByLabelText('Price ex GST').value).toBe('6.5');
  fireEvent.change(form.getByLabelText('Price ex GST'), { target: { value: '7' } });
  fireEvent.change(form.getByLabelText('Done'), { target: { value: 'in_house' } });
  fireEvent.click(form.getByRole('button', { name: 'Save' }));
  // A stitch count sent unchanged could read as new artwork and reopen the proof.
  await waitFor(() => expect(logos.update).toHaveBeenCalledWith(4, { priceEx: '7', madeBy: 'in_house', supplierId: '' }));
});

test('a logo can be made inactive, and an inactive one is still listed to bring back', async () => {
  users.myAccess.mockResolvedValue(EDITOR);
  logos.list.mockResolvedValue([LOGO, { ...LOGO, id: 6, code: 'EMB.CFG.OLD', isActive: false }]);
  logos.update.mockResolvedValue({ ...LOGO, isActive: false });
  renderWithQuery(<LogosTab customerId="CFG" />);
  const old = within((await screen.findByText('EMB.CFG.OLD')).closest('tr'));
  expect(old.getByText('Inactive')).toBeInTheDocument();
  expect(logos.list).toHaveBeenCalledWith('CFG', { includeInactive: true });
  fireEvent.click(screen.getByRole('button', { name: 'Edit EMB.CFG.LHC' }));
  const form = within(screen.getByRole('form', { name: 'Edit EMB.CFG.LHC' }));
  fireEvent.click(form.getByLabelText('Active'));
  fireEvent.click(form.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(logos.update).toHaveBeenCalledWith(4, { isActive: false }));
});

test('a role that may not change logos is not offered Edit', async () => {
  users.myAccess.mockResolvedValue(STAFF);
  renderWithQuery(<LogosTab customerId="CFG" />);
  expect(await screen.findByText('EMB.CFG.LHC')).toBeInTheDocument();
  await screen.findByRole('button', { name: 'New logo' });
  expect(screen.queryByRole('button', { name: 'Edit EMB.CFG.LHC' })).not.toBeInTheDocument();
});

test('what makes a new logo unsaveable', () => {
  const ok = { code: 'EMB.X', decorationType: 'EMB', madeBy: 'in_house', supplierId: '', stitchCount: '', priceEx: '', costEx: '' };
  expect(logoProblems(ok)).toEqual({});
  expect(Object.keys(logoProblems({ ...ok, code: ' ' }))).toEqual(['code']);
  expect(Object.keys(logoProblems({ ...ok, madeBy: 'subcontract' }))).toEqual(['supplierId']);
  expect(Object.keys(logoProblems({ ...ok, priceEx: '-1' }))).toEqual(['priceEx']);
});
