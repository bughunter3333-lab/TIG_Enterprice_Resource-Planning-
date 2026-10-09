/**
 * The warehouse screen around the 3D view. The canvas itself needs WebGL,
 * which jsdom has not got, so it is stubbed; what is tested is what a person
 * relies on: the counts, finding a bin, its details, the bins that do not fit
 * the racking, and who may change the layout.
 */
import { screen, fireEvent, within } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import { adminSettings, stock } from '../../../api';
import WarehouseModule from '../WarehouseModule';

vi.mock('../../../api', () => ({
  adminSettings: { get: vi.fn(), set: vi.fn() },
  stock: { binMap: vi.fn() },
}));
vi.mock('../Warehouse3D', () => ({
  default: ({ selected }) => <div data-testid="scene">scene {selected ?? 'none'}</div>,
}));

const BINS = [
  { bin: 'A.1.A.1', slot: 'primary', sku: 'AS-5001-NAV-L', name: 'Staple Tee Navy L', max_qty: 30, qty_on_hand: 40, committed_qty: 15, available_qty: 25 },
  { bin: 'B.3.C.4', slot: 'primary', sku: 'CAP-5PNL-BLK', name: '5-Panel Cap Black', max_qty: null, qty_on_hand: 0, committed_qty: 0, available_qty: 0 },
  { bin: 'A-01-04', slot: 'primary', sku: 'LEGACY-1', name: 'Old code', max_qty: null, qty_on_hand: 3, committed_qty: 0, available_qty: 3 },
];

beforeEach(() => {
  vi.clearAllMocks();
  adminSettings.get.mockResolvedValue({ key: 'warehouse_layout:HQ', value: null });
  stock.binMap.mockResolvedValue({ branch: 'HQ', bins: BINS });
  // jsdom cannot draw; pretend WebGL exists so the (stubbed) scene renders.
  window.WebGLRenderingContext = function WebGLRenderingContext() {};
  HTMLCanvasElement.prototype.getContext = () => ({});
});

const facet = (label) => within(screen.getByRole('group', { name: 'Highlight bins' })).getByText(label).closest('button');

test('counts bins by state, and lists codes that do not fit the racking', async () => {
  renderWithQuery(<WarehouseModule currentUser={{ role: 'staff' }} onOpenSku={() => {}} />);
  await screen.findByTestId('scene');
  expect(within(facet('Over capacity')).getByText('1')).toBeInTheDocument();
  expect(within(facet('Slotted, none on hand')).getByText('1')).toBeInTheDocument();
  expect(within(facet('Not on the map')).getByText('1')).toBeInTheDocument();
  expect(screen.getByText(/Not an aisle.bay.level.box code/)).toBeInTheDocument();
});

test('finding a SKU lists its bin; picking it opens the bin with the branch figures', async () => {
  const onOpenSku = vi.fn();
  renderWithQuery(<WarehouseModule currentUser={{ role: 'staff' }} onOpenSku={onOpenSku} />);
  await screen.findByTestId('scene');
  fireEvent.change(screen.getByLabelText('Find SKU, product or bin'), { target: { value: 'navy' } });
  fireEvent.click(screen.getByRole('button', { name: /A\.1\.A\.1/ }));

  const panel = screen.getByRole('complementary', { name: 'Bin A.1.A.1' });
  expect(within(panel).getByText(/Aisle A · Bay 1, right-hand side · Level A · Box 1/)).toBeInTheDocument();
  expect(within(panel).getByText('25')).toBeInTheDocument();
  expect(within(panel).getByText(/More on hand than its bins hold/)).toBeInTheDocument();
  expect(screen.getByTestId('scene')).toHaveTextContent('A.1.A.1');

  fireEvent.click(within(panel).getByRole('button', { name: /Open item/ }));
  expect(onOpenSku).toHaveBeenCalledWith('AS-5001-NAV-L');
});

test('only an admin can edit the racking layout, and it saves per branch', async () => {
  const { unmount } = renderWithQuery(<WarehouseModule currentUser={{ role: 'manager' }} onOpenSku={() => {}} />);
  await screen.findByTestId('scene');
  expect(screen.queryByRole('button', { name: /Edit layout/ })).not.toBeInTheDocument();
  unmount();

  adminSettings.set.mockResolvedValue({});
  renderWithQuery(<WarehouseModule currentUser={{ role: 'admin' }} onOpenSku={() => {}} />);
  await screen.findByTestId('scene');
  fireEvent.click(screen.getByRole('button', { name: /Edit layout/ }));
  fireEvent.change(screen.getByLabelText(/Bays per aisle/), { target: { value: '12' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save layout' }));
  await vi.waitFor(() => expect(adminSettings.set).toHaveBeenCalled());
  const [key, value] = adminSettings.set.mock.calls[0];
  expect(key).toBe('warehouse_layout:HQ');
  expect(JSON.parse(value).baysPerAisle).toBe(12);
});

test('a layout that cannot be read falls back to the default and says so', async () => {
  adminSettings.get.mockResolvedValue({ key: 'warehouse_layout:HQ', value: '{"aisles":[]}' });
  renderWithQuery(<WarehouseModule currentUser={{ role: 'staff' }} onOpenSku={() => {}} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(/default racking is shown/);
});
