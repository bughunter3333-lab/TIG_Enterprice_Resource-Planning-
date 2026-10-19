/**
 * Every label in these forms points at its own control.
 *
 * All four form bodies came out of the monolith with 35 bare <label> elements
 * and not one htmlFor, so clicking a label focused nothing and a screen reader
 * announced the inputs unlabelled. The ids were added mechanically, which is
 * safe for presence and not for correctness — a label wired to the wrong field
 * is still "associated".
 *
 * So this asserts the association by value: look each field up by its visible
 * label and check the control that comes back is holding that field's data. A
 * crossed pair fails here rather than shipping.
 */
import { render, screen, cleanup } from '@testing-library/react';
import CustomerForm from '../CustomerForm';
import SupplierForm from '../SupplierForm';
import InventoryForm from '../InventoryForm';
import PurchaseOrderForm from '../PurchaseOrderForm';

const closed = { open: false, query: '', highlighted: 0, idx: null };
const noop = () => {};

const CASES = [
  {
    name: 'CustomerForm',
    render: () =>
      render(
        <CustomerForm
          customerForm={{
            name: 'Zephyr Apparel', accountType: 'Cash', contact: 'Dana Reyes',
            email: 'dana@zephyr.example', phone: '02 9000 1234', mobile: '0400 111 222',
            address: '14 Loom St', abn: '12 345 678 901', paymentTerms: 'Net 30',
            creditLimit: '5000', accountManager: 'Sam Okafor',
          }}
          setCustomerForm={noop} saveCustomer={noop} closeModal={noop}
        />
      ),
    expect: {
      'Customer Name': 'Zephyr Apparel', 'Account Type': 'Cash',
      'Contact Person': 'Dana Reyes', 'Email': 'dana@zephyr.example',
      'Phone': '02 9000 1234', 'Mobile': '0400 111 222', 'Address': '14 Loom St',
      'ABN': '12 345 678 901', 'Payment Terms': 'Net 30',
      'Credit Limit ($)': '5000', 'Account Manager': 'Sam Okafor',
    },
  },
  {
    name: 'SupplierForm',
    render: () =>
      render(
        <SupplierForm
          supplierForm={{
            code: 'SUP-014', name: 'Northbound Blanks', contact: 'Alex Tan',
            email: 'alex@northbound.example', phone: '03 8000 5678',
            paymentTerms: 'Net 30', currency: 'AUD', status: 'active',
            address: '9 Mill Rd',
          }}
          setSupplierForm={noop} saveSupplier={noop} closeModal={noop} editingItem={null}
        />
      ),
    expect: {
      'Supplier Code': 'SUP-014', 'Supplier Name': 'Northbound Blanks',
      'Contact Person': 'Alex Tan', 'Email': 'alex@northbound.example',
      'Phone': '03 8000 5678', 'Payment Terms': 'Net 30', 'Currency': 'AUD',
      'Address': '9 Mill Rd',
    },
  },
  {
    name: 'InventoryForm',
    render: () =>
      render(
        <InventoryForm
          inventoryForm={{
            sku: 'TEE-BLK-M', name: 'Heavy Tee — Black', category: 'Tees',
            stock: '120', reorderLevel: '40', location: 'A-12-3',
            supplierCode: 'SUP-014', unitCost: '6.40', unitPrice: '18.00',
            minOrder: '25', leadTime: '14',
          }}
          categoryDropdown={closed} locationDropdown={closed}
          setCategoryDropdown={noop} setLocationDropdown={noop}
          setInventoryForm={noop} saveInventoryItem={noop} closeModal={noop}
          editingItem={null}
          suppliers={[{ code: 'SUP-014', name: 'Northbound Blanks' }]}
          inventory={[]}
        />
      ),
    expect: {
      'SKU': 'TEE-BLK-M', 'Category': 'Tees', 'Item Name': 'Heavy Tee — Black',
      'Stock Quantity': '120', 'Reorder Level': '40', 'Location': 'A-12-3',
      'Unit Cost ($)': '6.40', 'Unit Price ($)': '18.00',
      'Minimum Order Qty': '25', 'Lead Time (days)': '14',
    },
  },
  {
    name: 'PurchaseOrderForm',
    render: () =>
      render(
        <PurchaseOrderForm
          poForm={{
            supplier: 'Northbound Blanks', supplierCode: 'SUP-014',
            date: '2026-08-01', expectedDate: '2026-08-15',
            notes: 'Split delivery', items: [],
          }}
          supplierDropdown={closed} poSkuDropdown={closed}
          setSupplierDropdown={noop} setPoSkuDropdown={noop}
          setPoForm={noop} savePO={noop} closeModal={noop}
          suppliers={[{ code: 'SUP-014', name: 'Northbound Blanks' }]}
          inventory={[]}
        />
      ),
    expect: {
      'Supplier': 'Northbound Blanks', 'Order Date': '2026-08-01',
      'Expected Delivery': '2026-08-15', 'Notes': 'Split delivery',
    },
  },
];

for (const c of CASES) {
  describe(c.name, () => {
    for (const [label, value] of Object.entries(c.expect)) {
      test(`"${label}" is wired to the field holding ${JSON.stringify(value)}`, () => {
        c.render();
        const el = screen.getByLabelText(label);
        // A number input reports a number, so the table above stays readable as
        // strings and the type of the control decides how it is compared.
        expect(el).toHaveValue(el.type === 'number' ? Number(value) : value);
        cleanup();
      });
    }
  });
}
