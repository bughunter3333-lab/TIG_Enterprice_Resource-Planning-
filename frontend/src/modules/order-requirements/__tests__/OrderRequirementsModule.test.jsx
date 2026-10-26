/**
 * Order Requirements, as Home's "Garment lines to order" tile opens it: the
 * garment tab first, one row per stock code — the number the tile counts.
 */
import { screen, fireEvent } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import OrderRequirementsModule from '../OrderRequirementsModule';

vi.mock('../../../api', () => ({ purchaseOrders: { createFromRequirements: vi.fn() } }));

const garmentReqs = [
  { sku: 'TEE.WHT', description: 'White Tee', supplier: 'AS Colour', unit_cost: 5, total_b_ord: 12, jobs: [{ job_id: 'J1', customer_name: 'Acme', item_id: 1, b_ord: 12 }] },
  { sku: 'POLO.NAV', description: 'Navy Polo', supplier: '', unit_cost: 0, total_b_ord: 4, jobs: [{ job_id: 'J2', customer_name: 'BHP', item_id: 2, b_ord: 4 }] },
];

const open = () => renderWithQuery(
  <OrderRequirementsModule garmentReqs={garmentReqs} decorationReqs={[]} jobs={[]} pinJob={vi.fn()}
    refetchGarmentReqs={vi.fn()} refetchDecorationReqs={vi.fn()} setActiveModule={vi.fn()} suppliers={[]} />,
);

test('opens on the garment requirements, one row per stock code', () => {
  open();
  expect(screen.getByText('TEE.WHT')).toBeInTheDocument();
  expect(screen.getByText('POLO.NAV')).toBeInTheDocument();
  expect(screen.getByText('2 groups total')).toBeInTheDocument();
});

test('selecting a row offers a PO for it', () => {
  open();
  fireEvent.click(screen.getByText('White Tee'));
  expect(screen.getByRole('button', { name: /Create PO \(12 units · \$60\)/ })).toBeInTheDocument();
});
