/**
 * Sending one job's order to many sites.
 *
 * The behaviour worth pinning is not the ticking — it is that each site becomes
 * its own job, that they are created one after another rather than at once, and
 * that a site which fails does not take the others down with it.
 */
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { renderWithQuery } from '../../../test/renderWithQuery';
import DuplicateToSites from '../DuplicateToSites';
import { customers, jobs as jobsApi } from '../../../api';

const job = { id: '1218774', customerId: 'RIC.AUSTRA', customer: 'Ricoh Australia' };

const sites = [
  { id: 1, code: 'RICO.2201', name: 'Ricoh North Ryde', city: 'North Ryde', state: 'NSW', postcode: '2113', address: '1 Care Way' },
  { id: 2, code: 'RICO.2202', name: 'Ricoh Melbourne', city: 'Melbourne', state: 'VIC', postcode: '3000', address: '2 Care Way' },
  { id: 3, code: 'RICO.2203', name: 'Ricoh Brisbane', city: 'Brisbane', state: 'QLD', postcode: '4000', address: '3 Care Way' },
];

let dup;
beforeEach(() => {
  vi.spyOn(customers, 'shipTos').mockResolvedValue(sites);
  dup = vi.spyOn(jobsApi, 'duplicate').mockImplementation((id, o) =>
    Promise.resolve({ id: `NEW-${o.ship_to}` }),
  );
});
afterEach(() => vi.restoreAllMocks());

const open = (props = {}) =>
  renderWithQuery(<DuplicateToSites job={job} onClose={vi.fn()} {...props} />);

test('lists the customer sites', async () => {
  open();
  await waitFor(() => expect(screen.getByText('RICO.2201')).toBeInTheDocument());
  expect(screen.getByText('RICO.2203')).toBeInTheDocument();
});

test('nothing is created until sites are chosen', async () => {
  open();
  await waitFor(() => expect(screen.getByText('RICO.2201')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: /create 0 jobs/i })).toBeDisabled();
});

test('each chosen site becomes its own job, carrying its address', async () => {
  const onCreated = vi.fn();
  open({ onCreated });
  await waitFor(() => expect(screen.getByText('RICO.2201')).toBeInTheDocument());

  fireEvent.click(screen.getAllByRole('checkbox')[0]);
  fireEvent.click(screen.getAllByRole('checkbox')[2]);
  fireEvent.click(screen.getByRole('button', { name: /create 2 jobs/i }));

  await waitFor(() => expect(dup).toHaveBeenCalledTimes(2));
  expect(dup).toHaveBeenCalledWith('1218774', expect.objectContaining({
    ship_to: 'RICO.2201',
    ship_to_id: 1,
    shipping_address: '1 Care Way, North Ryde, NSW, 2113',
  }));
  expect(dup).toHaveBeenCalledWith('1218774', expect.objectContaining({ ship_to: 'RICO.2203' }));
  await waitFor(() => expect(onCreated).toHaveBeenCalled());
});

test('one site failing does not stop the rest', async () => {
  dup.mockImplementation((id, o) =>
    o.ship_to === 'RICO.2202'
      ? Promise.reject(new Error('would take stock below zero'))
      : Promise.resolve({ id: `NEW-${o.ship_to}` }),
  );
  open();
  await waitFor(() => expect(screen.getByText('RICO.2201')).toBeInTheDocument());
  screen.getAllByRole('checkbox').forEach(c => fireEvent.click(c));
  fireEvent.click(screen.getByRole('button', { name: /create 3 jobs/i }));

  await waitFor(() => expect(screen.getByText('2 jobs created')).toBeInTheDocument());
  expect(screen.getByText(/would take stock below zero/)).toBeInTheDocument();
});

test('a customer with no sites says so instead of offering an empty list', async () => {
  customers.shipTos.mockResolvedValue([]);
  open();
  await waitFor(() =>
    expect(screen.getByText(/no ship-to sites on file/i)).toBeInTheDocument(),
  );
});
