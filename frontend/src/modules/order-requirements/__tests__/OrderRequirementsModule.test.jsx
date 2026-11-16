/**
 * Order Requirements, as Home's "Garment lines to order" tile opens it: the
 * garment tab first, one row per stock code — the number the tile counts.
 */
import { screen, fireEvent, within } from '@testing-library/react';
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

test('the decoration worklist says who makes each one, and "Not set" where the server does not know (F16)', () => {
  const decorationReqs = [
    { decoration_type: 'EMB', sku: 'EMB.CFG.LHC', description: 'Left chest', made_by: 'subcontract', supplier_id: 'STITCH', total_qty: 10, jobs: [] },
    { decoration_type: 'SP', sku: 'SP.CFG.BACK', description: 'Back print', made_by: 'in_house', supplier_id: null, total_qty: 4, jobs: [] },
    { decoration_type: 'EMB', sku: 'EMB-OLD', description: 'Keyed on the line', made_by: null, supplier_id: null, total_qty: 2, jobs: [] },
  ];
  renderWithQuery(
    <OrderRequirementsModule garmentReqs={[]} decorationReqs={decorationReqs} jobs={[]} pinJob={vi.fn()}
      refetchGarmentReqs={vi.fn()} refetchDecorationReqs={vi.fn()} setActiveModule={vi.fn()}
      suppliers={[{ code: 'STITCH', name: 'Stitchline' }]} />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Decoration Work/ }));
  expect(screen.getByRole('columnheader', { name: 'Made by' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Decorator' })).toBeInTheDocument();
  const row = (code) => within(screen.getByText(code).closest('tr'));
  expect(row('EMB.CFG.LHC').getByText('By a decorator')).toBeInTheDocument();
  expect(row('EMB.CFG.LHC').getByText('Stitchline')).toBeInTheDocument();
  expect(row('SP.CFG.BACK').getByText('In-house')).toBeInTheDocument();
  expect(row('EMB-OLD').getAllByText('Not set')).toHaveLength(2);
});

test('selecting a row offers a PO for it', () => {
  open();
  fireEvent.click(screen.getByText('White Tee'));
  expect(screen.getByRole('button', { name: /Create PO \(12 units · \$60\)/ })).toBeInTheDocument();
});
