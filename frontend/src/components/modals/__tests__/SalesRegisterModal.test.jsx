/**
 * SalesRegisterModal — the date-ranged sales register and its CSV export.
 *
 * This one is a report, so the things worth pinning are the numbers. Three
 * separately: the range that is actually sent to the server (an empty date must
 * be dropped, not sent as an empty string), the totals row that an operator
 * reconciles against, and the CSV, which is the artefact that leaves the
 * building and goes to a bookkeeper. The CSV is built by hand from a different
 * column set than the on-screen table — nine columns in a different order with
 * different headers — so it is asserted on its own content rather than trusted
 * to follow the table.
 *
 * `api` is reached through vi.spyOn on the real module, never a partial object
 * literal.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SalesRegisterModal from '../SalesRegisterModal';
import { jobs } from '../../../api';

const data = {
  summary: { count: 2, total_ex: 1000, total_tax: 100, total_inc: 1100 },
  jobs: [
    {
      id: 'J-9001',
      customer: 'Zephyr Apparel',
      status: 'PAID',
      dateIn: '2026-07-02',
      invoice: 'INV-4410',
      subtotal: 400,
      tax: 40,
      total: 440,
      balanceDue: 0,
    },
    {
      id: 'J-9002',
      customer: 'Respondek Logistics',
      status: 'INVOICE',
      dateIn: '2026-07-09',
      invoice: null,
      subtotal: 600,
      tax: 60,
      total: 660,
      balanceDue: 220,
    },
  ],
};

const modal = (over = {}) => ({
  open: true,
  dateFrom: '2026-07-01',
  dateTo: '2026-07-31',
  loading: false,
  error: '',
  data: null,
  ...over,
});

const setup = (over = {}) => {
  const props = { salesRegModal: modal(over), setSalesRegModal: vi.fn() };
  return { ...props, ...render(<SalesRegisterModal {...props} />) };
};

// The setter takes updaters. Apply the last one to a sentinel rather than
// reading a value back out: the closure holds the live DOM node, which React
// has already reset to its prop value by the time a test invokes it.
const applyLast = (setter, seed) => setter.mock.calls.at(-1)[0](seed);

// jsdom's Blob has no .text(), so the CSV comes back through FileReader.
const readBlob = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

let salesRegister;
beforeEach(() => {
  salesRegister = vi.spyOn(jobs, 'salesRegister').mockResolvedValue(data);
});
afterEach(() => vi.restoreAllMocks());

test('renders nothing while closed', () => {
  const { container } = setup({ open: false });
  expect(container).toBeEmptyDOMElement();
});

test('opens on an empty register that explains what to do', () => {
  setup();
  expect(screen.getByRole('heading', { name: 'Sales Register' })).toBeInTheDocument();
  expect(
    screen.getByText('Select a date range and click Load to view the Sales Register.')
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Load' })).toBeInTheDocument();
  // Nothing to export until something is loaded.
  expect(screen.queryByRole('button', { name: /Export CSV/ })).not.toBeInTheDocument();
});

test('shows the range it was given', () => {
  setup();
  // The <label>s carry no htmlFor, and input[type=date] has no ARIA role, so
  // these are found by the value they are holding.
  expect(screen.getByDisplayValue('2026-07-01')).toBeInTheDocument();
  expect(screen.getByDisplayValue('2026-07-31')).toBeInTheDocument();
});

test('says it is working while the register loads', () => {
  setup({ loading: true });
  expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled();
});

test('renders the error it was given', () => {
  setup({ error: 'Sales register is unavailable.' });
  expect(screen.getByText('Sales register is unavailable.')).toBeInTheDocument();
});

test('Load sends the range as date_from / date_to', async () => {
  setup();
  fireEvent.click(screen.getByRole('button', { name: 'Load' }));
  await waitFor(() =>
    expect(salesRegister).toHaveBeenCalledWith({
      date_from: '2026-07-01',
      date_to: '2026-07-31',
    })
  );
});

test('an unset date is dropped rather than sent empty', async () => {
  setup({ dateFrom: '', dateTo: '' });
  fireEvent.click(screen.getByRole('button', { name: 'Load' }));
  await waitFor(() => expect(salesRegister).toHaveBeenCalledWith({}));
});

test('a loaded register lands in state with loading cleared', async () => {
  const { setSalesRegModal } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Load' }));

  await waitFor(() => expect(setSalesRegModal.mock.calls.length).toBe(2));
  const result = applyLast(setSalesRegModal, { open: true, dateFrom: '2026-07-01' });
  expect(result.data).toBe(data);
  expect(result.loading).toBe(false);
  expect(result.open).toBe(true);
  expect(result.dateFrom).toBe('2026-07-01');
});

test('a failed load keeps the register open and reports why', async () => {
  salesRegister.mockRejectedValue(new Error('Report timed out'));
  const { setSalesRegModal } = setup();

  fireEvent.click(screen.getByRole('button', { name: 'Load' }));

  await waitFor(() => expect(setSalesRegModal.mock.calls.length).toBe(2));
  const result = applyLast(setSalesRegModal, { open: true, data: null });
  expect(result.error).toBe('Report timed out');
  expect(result.loading).toBe(false);
  expect(result.open).toBe(true);
});

test('changing a date discards the loaded register', () => {
  const { setSalesRegModal } = setup({ data });

  fireEvent.change(screen.getByDisplayValue('2026-07-01'), {
    target: { value: '2026-06-01' },
  });

  // `data: null` is the point — leaving the old rows on screen under a new
  // range shows totals for a period nobody asked for. The new date itself is
  // not asserted: the updater closes over the live DOM node.
  const result = applyLast(setSalesRegModal, { ...modal({ data }), dateTo: 'KEEP-ME' });
  expect(result.data).toBeNull();
  expect(result.dateTo).toBe('KEEP-ME');
  expect(result.open).toBe(true);
});

test('a loaded register shows the totals an operator reconciles against', () => {
  setup({ data });
  expect(screen.getByText('2 jobs')).toBeInTheDocument();
  expect(screen.getByText('$1000.00')).toBeInTheDocument();
  expect(screen.getByText('$100.00')).toBeInTheDocument();
  expect(screen.getByText('$1100.00')).toBeInTheDocument();
});

test('a loaded register lists every job with its money', () => {
  setup({ data });
  for (const header of ['Job', 'Customer', 'Status', 'Date In', 'Invoice',
                        'Ex GST', 'GST', 'Inc GST', 'Balance']) {
    expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument();
  }
  expect(screen.getAllByRole('row')).toHaveLength(3); // header + two jobs

  expect(screen.getByText('J-9001')).toBeInTheDocument();
  expect(screen.getByText('Zephyr Apparel')).toBeInTheDocument();
  expect(screen.getByText('INV-4410')).toBeInTheDocument();
  expect(screen.getByText('$440.00')).toBeInTheDocument();
  expect(screen.getByText('$0.00')).toBeInTheDocument();

  expect(screen.getByText('J-9002')).toBeInTheDocument();
  expect(screen.getByText('$660.00')).toBeInTheDocument();
  expect(screen.getByText('$220.00')).toBeInTheDocument();
  // An uninvoiced job shows a dash, not an empty cell.
  expect(screen.getByText('—')).toBeInTheDocument();
});

describe('CSV export', () => {
  let createObjectURL;
  let anchorClick;

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:sales-register');
    // jsdom implements neither of these; the second also stops the click from
    // trying to navigate.
    URL.createObjectURL = createObjectURL;
    anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    delete URL.createObjectURL;
  });

  test('is offered only once a register is loaded', () => {
    setup({ data });
    expect(screen.getByRole('button', { name: /Export CSV/ })).toBeInTheDocument();
  });

  test('writes every job under the export column set', async () => {
    setup({ data });
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/ }));

    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe('text/csv');

    const lines = (await readBlob(blob)).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(
      '"Job ID","Customer","Status","Date In","Invoice","Total Ex","Tax","Total Inc","Balance Due"'
    );
    expect(lines[1]).toBe(
      '"J-9001","Zephyr Apparel","PAID","2026-07-02","INV-4410","400.00","40.00","440.00","0.00"'
    );
    // A job with no invoice number exports an empty cell, not "null".
    expect(lines[2]).toBe(
      '"J-9002","Respondek Logistics","INVOICE","2026-07-09","","600.00","60.00","660.00","220.00"'
    );
  });

  test('names the file for the day it was taken', () => {
    setup({ data });
    const created = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = realCreate(tag);
      if (tag === 'a') created.push(el);
      return el;
    });

    fireEvent.click(screen.getByRole('button', { name: /Export CSV/ }));

    expect(created).toHaveLength(1);
    expect(created[0].download).toMatch(/^sales-register-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});

test('clicking away from the card closes the register', () => {
  const { container, setSalesRegModal } = setup({ data });
  // The only close control in the header is an unlabelled icon button, so the
  // path asserted here is the overlay, which DraggableModal wires to onClose.
  fireEvent.click(container.firstChild);
  const result = applyLast(setSalesRegModal, { ...modal({ data }), dateFrom: 'KEEP-ME' });
  expect(result.open).toBe(false);
  expect(result.dateFrom).toBe('KEEP-ME');
  expect(result.data).toBe(data);
});
