/**
 * The goods-receipt panel on a purchase order.
 *
 * It once imported `{ React }` from 'react' — a name React does not export —
 * so the first `React.useState` threw and opening any purchase order blanked
 * the whole app. These tests render it the way the PO detail does.
 */
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import { goodsReceipts } from '../../../api';
import POGoodsReceiptsPanel from '../POGoodsReceiptsPanel';

vi.mock('../../../api', () => ({
  goodsReceipts: {
    list: vi.fn(),
    create: vi.fn(),
    accept: vi.fn(),
    reject: vi.fn(),
  },
}));

const PO = {
  id: 'PO-2049110',
  supplier: 'AS Colour',
  supplierCode: 'ASC',
  status: 'Sent',
  items: [{ sku: 'AS-5001-NAV-L', description: 'Staple Tee Navy L', qtyOrdered: 24, qtyReceived: 4, unitCost: 6.5 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  goodsReceipts.list.mockResolvedValue([]);
  goodsReceipts.create.mockResolvedValue({ id: 1 });
});

test('renders on an open purchase order', async () => {
  renderWithQuery(<POGoodsReceiptsPanel po={PO} />);
  expect(screen.getByText('Goods Receipts')).toBeInTheDocument();
  await waitFor(() => expect(goodsReceipts.list).toHaveBeenCalledWith({ po_id: 'PO-2049110' }));
});

test('a new receipt defaults each line to what is still outstanding', async () => {
  renderWithQuery(<POGoodsReceiptsPanel po={PO} />);
  fireEvent.click(screen.getByRole('button', { name: /New Receipt/ }));
  // 24 ordered, 4 already received.
  expect(screen.getByDisplayValue('20')).toBeInTheDocument();
});

test('each row of a receipt names its PO line, so a PO bought for two jobs fills the right one (F18)', async () => {
  // One SKU on two lines, one per job: the rows differ only by their PO line.
  const consolidated = {
    ...PO,
    items: [
      { id: 501, sku: 'AS-5001-NAV-L', description: 'For job A', qtyOrdered: 5, qtyReceived: 0, unitCost: 6.5 },
      { id: 502, sku: 'AS-5001-NAV-L', description: 'For job B', qtyOrdered: 5, qtyReceived: 0, unitCost: 6.5 },
    ],
  };
  renderWithQuery(<POGoodsReceiptsPanel po={consolidated} />);
  fireEvent.click(screen.getByRole('button', { name: /New Receipt/ }));
  const [jobARow] = screen.getAllByDisplayValue('5');
  fireEvent.change(jobARow, { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: /Save Receipt/ }));
  await waitFor(() => expect(goodsReceipts.create).toHaveBeenCalled());
  const sent = goodsReceipts.create.mock.calls[0][0].lines.map((l) => [l.poItemId, l.qtyReceived]);
  expect(sent).toEqual([[501, 0], [502, 5]]);
});

test('a failed load says so instead of looking like no receipts', async () => {
  goodsReceipts.list.mockRejectedValue(new Error('Server unavailable'));
  renderWithQuery(<POGoodsReceiptsPanel po={PO} />, { allowQueryErrors: true });
  expect(await screen.findByText(/Server unavailable/)).toBeInTheDocument();
});
