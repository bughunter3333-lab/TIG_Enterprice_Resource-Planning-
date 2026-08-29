/**
 * The card-file create/edit dialog — the ship-to addresses a job despatches to.
 *
 * Two things are worth holding. The heading has to say which record is being
 * edited, because the same dialog is opened from the list and from the detail
 * panel and there is otherwise nothing on screen naming the row. And every
 * field has to write back through the setter with the rest of the address
 * intact: these are delivery addresses, so a spread dropped from one handler
 * silently blanks the suburb or postcode of a real customer.
 *
 * Labels are asserted by value rather than presence. The ids here were added
 * mechanically like the rest, and a label pointing at the wrong field is still
 * "associated" — it just sends the wrong data to a screen reader.
 */
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import CardFileFormModal from '../CardFileFormModal';

const form = {
  shipCode: 'RESP.SYD',
  customerCode: 'RESP.HO',
  companyName: 'Respondek Logistics',
  contactName: 'Mira Osei',
  address1: '3 Kembla St',
  address2: 'Unit 7',
  suburb: 'Botany',
  state: 'NSW',
  postcode: '2019',
  phone: '02 8000 4321',
  email: 'dock@respondek.example',
  notes: 'Deliver to rear dock before 3pm',
};

const setup = (over = {}) => {
  const props = {
    cardFileForm: form,
    cardFileModal: { open: true, editing: null },
    setCardFileForm: vi.fn(),
    setCardFileModal: vi.fn(),
    saveCard: vi.fn(),
    ...over,
  };
  render(<CardFileFormModal {...props} />);
  return props;
};

const FIELDS = {
  'Ship Code': 'RESP.SYD',
  'Customer Code': 'RESP.HO',
  'Company Name': 'Respondek Logistics',
  'Contact Name': 'Mira Osei',
  'Address Line 1': '3 Kembla St',
  'Address Line 2': 'Unit 7',
  'Suburb / City': 'Botany',
  'State': 'NSW',
  'Postcode': '2019',
  'Phone': '02 8000 4321',
  'Email': 'dock@respondek.example',
  'Notes': 'Deliver to rear dock before 3pm',
};

for (const [label, value] of Object.entries(FIELDS)) {
  test(`"${label}" is wired to the field holding ${JSON.stringify(value)}`, () => {
    setup();
    expect(screen.getByLabelText(label, { exact: false })).toHaveValue(value);
    cleanup();
  });
}

test('names the record being edited', () => {
  setup({ cardFileModal: { open: true, editing: 'RESP.SYD' } });
  // By heading: the ship code also appears as a field value.
  expect(screen.getByRole('heading', { name: /Edit Card File .* RESP\.SYD/ })).toBeInTheDocument();
});

test('says it is creating one when there is nothing to edit', () => {
  setup({ cardFileModal: { open: true, editing: null } });
  expect(screen.getByRole('heading', { name: 'New Card File' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /create card file/i })).toBeInTheDocument();
});

test('an edit keeps the rest of the address', () => {
  const { setCardFileForm } = setup();
  fireEvent.change(screen.getByLabelText('Postcode', { exact: false }), {
    target: { value: '2020' },
  });

  // The handlers pass an updater to the setter, so what is checked here is the
  // spread inside it — drop that and editing a postcode blanks the suburb and
  // the phone number of a real delivery address.
  //
  // The updater is applied to a sentinel rather than to `form`, and it is not
  // asserted to carry '2020'. It closes over `e.target`, which is the live DOM
  // node: React has already reset this controlled input to its prop value by
  // the time a test invokes the updater, so reading the new value back out
  // here would test the harness rather than the component.
  const updater = setCardFileForm.mock.calls[0][0];
  const result = updater({ ...form, suburb: 'SENTINEL', phone: 'KEEP-ME' });
  expect(result.suburb).toBe('SENTINEL');
  expect(result.phone).toBe('KEEP-ME');
  expect(Object.keys(result).sort()).toEqual(Object.keys(form).sort());
});

test('save and cancel reach their handlers', () => {
  const { saveCard, setCardFileModal } = setup();
  fireEvent.click(screen.getByRole('button', { name: /create card file/i }));
  expect(saveCard).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(setCardFileModal).toHaveBeenCalledWith({ open: false, editing: null });
});
