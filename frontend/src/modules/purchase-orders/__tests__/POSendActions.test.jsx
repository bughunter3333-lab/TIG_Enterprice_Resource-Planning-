/**
 * A purchase order can be printed by anyone who reads it, and emailed to its
 * supplier by those who may send it; sending a Draft makes it Sent.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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

test.each(['Cancelled', 'Received'])('a %s PO is not offered to email: the server refuses it (F17)', async (status) => {
  users.myAccess.mockResolvedValue({ role: 'staff', areas: [], allowed: ['POST /purchase-orders/{po_id}/email'] });
  // An open PO beside it: its button showing means access has loaded, so the
  // closed one's missing button is the status's doing, not a slow request.
  renderWithQuery(
    <>
      <div data-testid="closed"><POSendActions po={{ id: 'PO-0001', status }} /></div>
      <div data-testid="open"><POSendActions po={{ id: 'PO-0002', status: 'Sent' }} /></div>
    </>,
  );
  await within(screen.getByTestId('open')).findByRole('button', { name: /email supplier/i });
  const closed = within(screen.getByTestId('closed'));
  expect(closed.queryByRole('button', { name: /email supplier/i })).not.toBeInTheDocument();
  expect(closed.getByRole('link', { name: /print/i })).toBeInTheDocument();
});

test.each(['Draft', 'Sent', 'Partial'])('a %s PO may be emailed', async (status) => {
  users.myAccess.mockResolvedValue({ role: 'staff', areas: [], allowed: ['POST /purchase-orders/{po_id}/email'] });
  renderWithQuery(<POSendActions po={{ id: 'PO-0001', status }} />);
  expect(await screen.findByRole('button', { name: /email supplier/i })).toBeInTheDocument();
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
