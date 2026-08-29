/**
 * The customer form body, as rendered inside the shared modal shell.
 *
 * What is worth pinning after lifting it out of the monolith is the prop
 * contract, because that is the part the extraction invented: the form holds no
 * state of its own, so every keystroke has to reach setCustomerForm with the
 * rest of the object intact. Dropping the spread would silently clear every
 * other field on the customer while still looking like it worked.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import CustomerForm from '../CustomerForm';

const form = {
  name: 'Zephyr Apparel',
  accountType: 'Account',
  contact: 'Dana Reyes',
  email: 'dana@zephyr.example',
  phone: '02 9000 1234',
};

const setup = (over = {}) => {
  const props = {
    customerForm: form,
    setCustomerForm: vi.fn(),
    saveCustomer: vi.fn(),
    closeModal: vi.fn(),
    ...over,
  };
  render(<CustomerForm {...props} />);
  return props;
};

test('renders the customer it was given', () => {
  setup();
  expect(screen.getByDisplayValue('Zephyr Apparel')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Dana Reyes')).toBeInTheDocument();
  expect(screen.getByText('Customer Name')).toBeInTheDocument();
});

test('an edit keeps the rest of the customer', () => {
  const { setCustomerForm } = setup();
  fireEvent.change(screen.getByDisplayValue('Zephyr Apparel'), {
    target: { value: 'Zephyr Apparel Pty Ltd' },
  });
  expect(setCustomerForm).toHaveBeenCalledWith({
    ...form,
    name: 'Zephyr Apparel Pty Ltd',
  });
});

test('save and cancel reach their handlers', () => {
  const { saveCustomer, closeModal } = setup();
  fireEvent.click(screen.getByRole('button', { name: /save customer/i }));
  expect(saveCustomer).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(closeModal).toHaveBeenCalledTimes(1);
});

test('a missing optional field does not crash the form', () => {
  // The monolith seeds this object in several places and they do not all agree
  // on which keys exist.
  expect(() => setup({ customerForm: { name: 'Bare Minimum' } })).not.toThrow();
  expect(screen.getByDisplayValue('Bare Minimum')).toBeInTheDocument();
});
