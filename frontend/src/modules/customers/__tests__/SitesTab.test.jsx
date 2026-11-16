/**
 * A customer's sites can be added, changed and removed on screen (Phase 0).
 * The server has served them since the ship-to work; the screen only read
 * them. A site jobs deliver to is kept, and the server's reason is shown.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import * as api from '../../../api';
import { renderWithQuery } from '../../../test/renderWithQuery';
import SitesTab, { siteProblems } from '../SitesTab';

const KNOX = { id: 7, code: 'AR.KNO', name: 'Arcare Knox', address: '', city: 'Wantirna South', state: 'VIC', postcode: '3152', is_default: true };
const editor = (allowed = ['POST /customers/{customer_id}/ship-tos']) => ({ role: 'staff', areas: [], allowed });

beforeEach(() => {
  vi.spyOn(api.users, 'myAccess').mockResolvedValue(editor());
  vi.spyOn(api.customers, 'shipTos').mockResolvedValue([KNOX]);
  vi.spyOn(api.customers, 'createShipTo').mockResolvedValue({ ...KNOX, id: 8, code: 'AR.PAR' });
  vi.spyOn(api.customers, 'updateShipTo').mockResolvedValue(KNOX);
  vi.spyOn(api.customers, 'deleteShipTo').mockResolvedValue({ ok: true });
});

afterEach(() => vi.restoreAllMocks());

test("lists the customer's sites with their address", async () => {
  renderWithQuery(<SitesTab customerId="ARCARE" />);
  expect(await screen.findByText('AR.KNO')).toBeInTheDocument();
  expect(screen.getByText('Wantirna South VIC 3152')).toBeInTheDocument();
});

test('a new site is added with its code', async () => {
  renderWithQuery(<SitesTab customerId="ARCARE" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Add a site' }));
  const form = screen.getByRole('form', { name: 'New site' });
  fireEvent.change(within(form).getByLabelText('Site code'), { target: { value: 'AR.PAR' } });
  fireEvent.change(within(form).getByLabelText('Site name'), { target: { value: 'Arcare Parkville' } });
  fireEvent.change(within(form).getByLabelText('Postcode'), { target: { value: '3052' } });
  fireEvent.click(within(form).getByRole('button', { name: 'Add site' }));
  await waitFor(() => expect(api.customers.createShipTo).toHaveBeenCalledWith(
    'ARCARE', expect.objectContaining({ code: 'AR.PAR', name: 'Arcare Parkville', postcode: '3052' }),
  ));
});

test('an edit changes everything but the code', async () => {
  renderWithQuery(<SitesTab customerId="ARCARE" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit site AR.KNO' }));
  const form = screen.getByRole('form', { name: 'Edit site AR.KNO' });
  expect(within(form).getByLabelText('Site code')).toBeDisabled();
  fireEvent.change(within(form).getByLabelText('Street address'), { target: { value: '1 Example Rd' } });
  fireEvent.click(within(form).getByRole('button', { name: 'Save site' }));
  await waitFor(() => expect(api.customers.updateShipTo).toHaveBeenCalled());
  const [, id, site] = api.customers.updateShipTo.mock.calls[0];
  expect(id).toBe(7);
  expect(site.address).toBe('1 Example Rd');
  expect(site).not.toHaveProperty('code');
});

test('a delete is asked twice, then sent', async () => {
  renderWithQuery(<SitesTab customerId="ARCARE" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete site AR.KNO' }));
  expect(api.customers.deleteShipTo).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm delete site AR.KNO' }));
  await waitFor(() => expect(api.customers.deleteShipTo).toHaveBeenCalledWith('ARCARE', 7));
});

test('a role that may not edit sites only reads them', async () => {
  api.users.myAccess.mockResolvedValue(editor([]));
  renderWithQuery(<SitesTab customerId="ARCARE" />);
  expect(await screen.findByText('AR.KNO')).toBeInTheDocument();
  await waitFor(() => expect(api.users.myAccess).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: 'Add a site' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Edit site AR.KNO' })).toBeNull();
});

describe('what a site must have', () => {
  const blank = { code: '', name: '', address: '', city: '', state: '', postcode: '', is_default: false };
  test('a code', () => expect(siteProblems(blank).code).toBeTruthy());
  test('a four-digit postcode when one is given', () => {
    expect(siteProblems({ ...blank, code: 'X', postcode: '30' }).postcode).toBeTruthy();
    expect(siteProblems({ ...blank, code: 'X', postcode: '3052' })).toEqual({});
  });
});
