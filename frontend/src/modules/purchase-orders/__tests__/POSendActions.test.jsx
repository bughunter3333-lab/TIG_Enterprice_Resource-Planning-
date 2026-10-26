/**
 * A purchase order can be printed by anyone who reads it, and emailed to its
 * supplier by those who may send it; sending a Draft makes it Sent.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import { purchaseOrders, users } from '../../../api';
import POSendActions from '../POSendActions';

vi.mock('../../../api', () => ({
  purchaseOrders: { email: vi.fn(), pdfUrl: (id) => `/api/purchase-orders/${id}/pdf` },
  users: { myAccess: vi.fn() },
}));

beforeEach(() => vi.clearAllMocks());

test('it prints the order as the supplier is sent it', async () => {
  users.myAccess.mockResolvedValue({ role: 'overseas_staff', areas: [], allowed: ['GET /purchase-orders/{po_id}/pdf'] });
  renderWithQuery(<POSendActions po={{ id: 'PO-0001' }} />);
  expect(screen.getByRole('link', { name: /print/i })).toHaveAttribute('href', '/api/purchase-orders/PO-0001/pdf');
  await waitFor(() => expect(screen.queryByRole('button', { name: /email supplier/i })).not.toBeInTheDocument());
});

test('emailing it says who it went to and moves it on to Sent', async () => {
  users.myAccess.mockResolvedValue({ role: 'staff', areas: [], allowed: ['POST /purchase-orders/{po_id}/email'] });
  purchaseOrders.email.mockResolvedValue({ ok: true, message: 'Purchase order PO-0001 sent to orders@wws.example', status: 'Sent' });
  const onSent = vi.fn();
  renderWithQuery(<POSendActions po={{ id: 'PO-0001' }} onSent={onSent} />);
  fireEvent.click(await screen.findByRole('button', { name: /email supplier/i }));
  await waitFor(() => expect(onSent).toHaveBeenCalledWith('Sent'));
  expect(purchaseOrders.email).toHaveBeenCalledWith('PO-0001');
});
