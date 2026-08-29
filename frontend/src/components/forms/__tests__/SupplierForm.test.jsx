/**
 * The supplier form body.
 *
 * The rule worth pinning is the code field: a supplier's code is its identity
 * across purchase orders and stock vendors, so it is editable when creating one
 * and locked once the record exists. That lock rides entirely on `editingItem`
 * being passed down, which the extraction turned from a closure into a prop —
 * exactly the kind of thing that goes missing without leaving an error.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import SupplierForm from '../SupplierForm';

const form = {
  code: 'SUP-014',
  name: 'Northbound Blanks',
  contact: 'Alex Tan',
  email: 'alex@northbound.example',
  phone: '03 8000 5678',
  paymentTerms: 'Net 30',
  currency: 'AUD',
};

const setup = (over = {}) => {
  const props = {
    supplierForm: form,
    setSupplierForm: vi.fn(),
    saveSupplier: vi.fn(),
    closeModal: vi.fn(),
    editingItem: null,
    ...over,
  };
  render(<SupplierForm {...props} />);
  return props;
};

test('renders the supplier it was given', () => {
  setup();
  expect(screen.getByDisplayValue('Northbound Blanks')).toBeInTheDocument();
  expect(screen.getByDisplayValue('SUP-014')).toBeInTheDocument();
});

test('the code is editable when creating a supplier', () => {
  setup({ editingItem: null });
  expect(screen.getByDisplayValue('SUP-014')).not.toBeDisabled();
});

test('the code is locked once the supplier exists', () => {
  setup({ editingItem: { id: 14 } });
  expect(screen.getByDisplayValue('SUP-014')).toBeDisabled();
});

test('an edit keeps the rest of the supplier', () => {
  const { setSupplierForm } = setup();
  fireEvent.change(screen.getByDisplayValue('Alex Tan'), {
    target: { value: 'Alexandra Tan' },
  });
  expect(setSupplierForm).toHaveBeenCalledWith({ ...form, contact: 'Alexandra Tan' });
});

test('save and cancel reach their handlers', () => {
  const { saveSupplier, closeModal } = setup();
  fireEvent.click(screen.getByRole('button', { name: /save supplier/i }));
  expect(saveSupplier).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(closeModal).toHaveBeenCalledTimes(1);
});
