/**
 * The modal closes itself when a payment records. That makes "closed" the only
 * signal an operator gets that the money was captured, so closing on a failure
 * is indistinguishable from success — and on the Tyro path the card has already
 * been charged by the time the record call runs.
 *
 * `recordPayment` used to swallow its error and resolve, so both paths closed
 * on failure and the modal's own "approved but could not record" branch could
 * never run. These pin the contract from this side: a rejection must leave the
 * modal open.
 */
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import PaymentModal from '../PaymentModal';

vi.mock('../../../lib/notify', () => ({ notify: vi.fn() }));
import { notify } from '../../../lib/notify';

const open = (over = {}) => ({
  show: true,
  jobId: 'J-1',
  maxAmount: 250,
  amount: '100',
  method: 'Cash',
  tyroStatus: null,
  tyroProcessing: false,
  ...over,
});

beforeEach(() => vi.clearAllMocks());

test('renders nothing while closed', () => {
  const { container } = renderWithQuery(
    <PaymentModal paymentModal={open({ show: false })} recordPayment={vi.fn()} setPaymentModal={vi.fn()} />
  );
  expect(container).toBeEmptyDOMElement();
});

test('shows the balance due and the method when open', () => {
  renderWithQuery(
    <PaymentModal paymentModal={open()} recordPayment={vi.fn()} setPaymentModal={vi.fn()} />
  );
  expect(screen.getByText('Record Payment')).toBeInTheDocument();
  expect(screen.getByText('Balance due: $250.00')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /confirm payment/i })).toBeInTheDocument();
});

test('a recorded payment closes the modal', async () => {
  const recordPayment = vi.fn().mockResolvedValue(undefined);
  const setPaymentModal = vi.fn();
  renderWithQuery(
    <PaymentModal paymentModal={open()} recordPayment={recordPayment} setPaymentModal={setPaymentModal} />
  );

  fireEvent.click(screen.getByRole('button', { name: /confirm payment/i }));

  await waitFor(() => expect(recordPayment).toHaveBeenCalledWith('J-1', 100, 'Cash'));
  await waitFor(() =>
    expect(setPaymentModal).toHaveBeenCalledWith(expect.objectContaining({ show: false }))
  );
});

test('a payment that fails to record leaves the modal open', async () => {
  const recordPayment = vi.fn().mockRejectedValue(new Error('database is down'));
  const setPaymentModal = vi.fn();
  renderWithQuery(
    <PaymentModal paymentModal={open()} recordPayment={recordPayment} setPaymentModal={setPaymentModal} />
  );

  fireEvent.click(screen.getByRole('button', { name: /confirm payment/i }));

  await waitFor(() => expect(notify).toHaveBeenCalled());
  expect(notify.mock.calls[0][0]).toMatch(/could not record the payment/i);
  // The failure mode this guards: closing here reads as a captured payment.
  expect(setPaymentModal).not.toHaveBeenCalledWith(expect.objectContaining({ show: false }));
});

test('an amount of zero does nothing at all', () => {
  const recordPayment = vi.fn();
  renderWithQuery(
    <PaymentModal paymentModal={open({ amount: '0' })} recordPayment={recordPayment} setPaymentModal={vi.fn()} />
  );
  fireEvent.click(screen.getByRole('button', { name: /confirm payment/i }));
  expect(recordPayment).not.toHaveBeenCalled();
});
