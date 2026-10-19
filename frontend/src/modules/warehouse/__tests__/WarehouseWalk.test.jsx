/**
 * Walking an aisle, as far as the screen around the 3D view is concerned:
 * what starts a walk, what the controls and keys send to the scene, and what
 * ends it. The camera itself is Walk3D's (the scene is stubbed here) and its
 * maths is tested in walk.test.js.
 */
import { act, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import { adminSettings, rackSections, stock } from '../../../api';
import { DEFAULT_LAYOUT } from '../layout';
import WarehouseModule from '../WarehouseModule';

vi.mock('../../../api', () => ({
  adminSettings: { get: vi.fn(), set: vi.fn() },
  stock: { binMap: vi.fn(), putAway: vi.fn(), locationSummary: vi.fn() },
  rackSections: { list: vi.fn(), create: vi.fn(), remove: vi.fn() },
}));
// What the scene was last handed.
const scene = vi.hoisted(() => ({ props: null }));
vi.mock('../Warehouse3D', () => ({
  default: (props) => {
    scene.props = props;
    return (
      <div data-testid="scene">
        {/* Stand in for a click on aisle D's line, a click on a box, and the walk reaching a pair of bays. */}
        <button type="button" onClick={() => props.onWalk(1, -4)}>click the line in aisle D</button>
        <button type="button" onClick={() => props.onSelect('B.5.E.3')}>pick B.5.E.3</button>
        <button type="button" onClick={() => props.onWalkAt({ aisleIndex: 3, bays: { odd: 3, even: 4 } })}>reach bays 3 and 4</button>
        <button type="button" onClick={() => props.onWalkAt({ aisleIndex: 1, bays: { odd: 5, even: 6 } })}>be taken to aisle D</button>
      </div>
    );
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  scene.props = null;
  adminSettings.get.mockResolvedValue({ key: 'warehouse_layout:HQ', value: null });
  stock.binMap.mockResolvedValue({ branch: 'HQ', bins: [] });
  rackSections.list.mockResolvedValue({ branch: 'HQ', sections: [] });
  window.WebGLRenderingContext = function WebGLRenderingContext() {};
  HTMLCanvasElement.prototype.getContext = () => ({});
});

const open = async (role = 'staff') => {
  const rendered = renderWithQuery(<WarehouseModule currentUser={{ role }} onOpenSku={() => {}} />);
  await screen.findByTestId('scene');
  return rendered;
};
const aisle = (letter) => within(screen.getByRole('group', { name: 'Walk an aisle' })).getByRole('button', { name: `Aisle ${letter}` });
const view = () => screen.getByTestId('scene').closest('main');
const B = DEFAULT_LAYOUT.aisles.indexOf('B');

test('nothing is being walked until an aisle is chosen', async () => {
  await open();
  expect(scene.props.walk).toBeNull();
  expect(screen.queryByRole('group', { name: 'Move along the aisle' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Leave aisle/ })).not.toBeInTheDocument();
  expect(screen.getByText(/Drag to move/)).toHaveTextContent(/blue line to walk it/);
});

test('an aisle’s button steps on to its line at the receiving end', async () => {
  await open();
  fireEvent.click(aisle('B'));
  expect(scene.props.walk).toEqual({ aisleIndex: B, z: undefined });
  expect(aisle('B')).toHaveAttribute('aria-pressed', 'true');
  expect(aisle('C')).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('group', { name: 'Move along the aisle' })).toBeInTheDocument();
  expect(screen.getByText(/Drag to look round/)).toHaveTextContent(/Esc to leave/);
});

test('a click on a line in the view walks from the spot that was clicked', async () => {
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'click the line in aisle D' }));
  expect(scene.props.walk).toEqual({ aisleIndex: 1, z: -4 });
  expect(aisle('D')).toHaveAttribute('aria-pressed', 'true');
});

test('choosing the aisle again is a new request, so it goes back to the start of the line', async () => {
  await open();
  fireEvent.click(aisle('B'));
  const first = scene.props.walk;
  fireEvent.click(aisle('B'));
  expect(scene.props.walk).not.toBe(first);
  expect(scene.props.walk).toEqual(first);
});

test('each control sends its move, and pressing one twice sends it twice', async () => {
  await open();
  fireEvent.click(aisle('B'));
  const pad = within(screen.getByRole('group', { name: 'Move along the aisle' }));
  const kinds = () => scene.props.nudges.map((pressed) => pressed.kind);
  const all = [['Forward', 'forward'], ['Back', 'back'], ['Turn left', 'left'], ['Turn right', 'right'], ['Higher', 'up'], ['Lower', 'down']];
  for (const [name, kind] of all) {
    fireEvent.click(pad.getByRole('button', { name }));
    expect(kinds().at(-1)).toBe(kind);
  }
  fireEvent.click(pad.getByRole('button', { name: 'Lower' }));
  expect(kinds()).toEqual([...all.map(([, kind]) => kind), 'down']);
  // Each press is its own: told apart by a number that only goes up.
  const ids = scene.props.nudges.map((pressed) => pressed.id);
  expect(ids).toEqual([...ids].sort((a, b) => a - b));
  expect(new Set(ids).size).toBe(ids.length);
});

test('two controls pressed before the scene has drawn again both reach it, in order', async () => {
  await open();
  fireEvent.click(aisle('B'));
  const pad = within(screen.getByRole('group', { name: 'Move along the aisle' }));
  const before = scene.props.nudges.length;
  act(() => {
    pad.getByRole('button', { name: 'Forward' }).click();
    pad.getByRole('button', { name: 'Forward' }).click();
    pad.getByRole('button', { name: 'Turn left' }).click();
  });
  expect(scene.props.nudges.slice(before).map((pressed) => pressed.kind)).toEqual(['forward', 'forward', 'left']);
});

test('the arrow and page keys walk, turn and change level — only during a walk, and not with Ctrl held', async () => {
  await open();
  fireEvent.keyDown(view(), { key: 'ArrowUp' });
  expect(scene.props.nudges).toEqual([]);

  fireEvent.click(aisle('B'));
  for (const [key, kind] of [['ArrowUp', 'forward'], ['ArrowDown', 'back'], ['ArrowLeft', 'left'], ['ArrowRight', 'right'], ['PageUp', 'up'], ['PageDown', 'down']]) {
    // The key is used up: an arrow that walks must not also scroll the page.
    expect(fireEvent.keyDown(view(), { key })).toBe(false);
    expect(scene.props.nudges.at(-1).kind).toBe(kind);
  }
  const sent = scene.props.nudges.length;
  expect(fireEvent.keyDown(view(), { key: 'ArrowUp', ctrlKey: true })).toBe(true);
  expect(fireEvent.keyDown(view(), { key: 'x' })).toBe(true);
  expect(scene.props.nudges).toHaveLength(sent);
});

test('Esc, Leave aisle and Reset view each end the walk', async () => {
  await open();
  fireEvent.click(aisle('B'));
  fireEvent.keyDown(view(), { key: 'Escape' });
  expect(scene.props.walk).toBeNull();

  fireEvent.click(aisle('B'));
  fireEvent.click(screen.getByRole('button', { name: /Leave aisle/ }));
  expect(scene.props.walk).toBeNull();

  fireEvent.click(aisle('B'));
  const before = scene.props.resetKey;
  fireEvent.click(screen.getByRole('button', { name: /Reset view/ }));
  expect(scene.props.walk).toBeNull();
  expect(scene.props.resetKey).not.toBe(before); // and asks for the overview in the same go
});

test('picking a box on the way opens it and keeps walking', async () => {
  await open();
  fireEvent.click(aisle('B'));
  const walk = scene.props.walk;
  fireEvent.click(screen.getByRole('button', { name: 'pick B.5.E.3' }));
  expect(screen.getByRole('complementary', { name: 'Bin B.5.E.3' })).toBeInTheDocument();
  expect(scene.props.walk).toBe(walk);
  expect(scene.props.selected).toBe('B.5.E.3');
});

test('says which bays the walk has come level with, in the racking’s own words', async () => {
  await open();
  fireEvent.click(aisle('B'));
  expect(screen.getByText('Aisle B')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'reach bays 3 and 4' }));
  expect(screen.getByText('Aisle B · bay 3 on the right, bay 4 on the left')).toBeInTheDocument();
});

test('changing branch ends the walk', async () => {
  await open();
  fireEvent.click(aisle('B'));
  stock.binMap.mockResolvedValue({ branch: 'MELB', bins: [] });
  adminSettings.get.mockResolvedValue({ key: 'warehouse_layout:MELB', value: null });
  fireEvent.change(screen.getByLabelText('Branch'), { target: { value: 'MELB' } });
  await screen.findByTestId('scene');
  expect(scene.props.walk).toBeNull();
});

test('a walk does not outlive the racking it started in', async () => {
  const { client } = await open();
  fireEvent.click(aisle('B'));
  expect(scene.props.walk).not.toBeNull();
  // Someone saves a different layout: aisle B is not where it was.
  const other = { ...DEFAULT_LAYOUT, aisles: ['B', 'A'], baysPerAisle: 4 };
  act(() => { client.setQueryData(['admin-setting', 'warehouse_layout:HQ'], { key: 'warehouse_layout:HQ', value: JSON.stringify(other) }); });
  await waitFor(() => expect(scene.props.layout.aisles).toEqual(['B', 'A']));
  expect(scene.props.walk).toBeNull();
});

test('leaving by its button hands the keyboard to the button of the aisle just left, not to the page', async () => {
  await open();
  fireEvent.click(aisle('B'));
  const leave = screen.getByRole('button', { name: /Leave aisle/ });
  leave.focus();
  fireEvent.click(leave);
  expect(aisle('B')).toHaveFocus();
});

test('leaving with Esc leaves the keyboard where it is', async () => {
  await open();
  fireEvent.click(aisle('B'));
  view().focus();
  fireEvent.keyDown(view(), { key: 'Escape' });
  expect(view()).toHaveFocus();
});

test('when a box picked in another aisle takes the walk there, the words, the pressed aisle and the lit line go with it', async () => {
  await open();
  fireEvent.click(aisle('B'));
  fireEvent.click(screen.getByRole('button', { name: 'reach bays 3 and 4' }));
  expect(scene.props.walkAisle).toBe(B);
  fireEvent.click(screen.getByRole('button', { name: 'be taken to aisle D' }));
  expect(screen.getByText('Aisle D · bay 5 on the right, bay 6 on the left')).toBeInTheDocument();
  expect(aisle('D')).toHaveAttribute('aria-pressed', 'true');
  expect(aisle('B')).toHaveAttribute('aria-pressed', 'false');
  expect(scene.props.walkAisle).toBe(1);
});

test('stepping on to another aisle says so at once, before the scene has said which bays', async () => {
  await open();
  fireEvent.click(aisle('B'));
  fireEvent.click(screen.getByRole('button', { name: 'reach bays 3 and 4' }));
  fireEvent.click(aisle('C'));
  expect(screen.getByText('Aisle C')).toBeInTheDocument();
  expect(aisle('C')).toHaveAttribute('aria-pressed', 'true');
  // A walk begun afresh does not show where the last one had got to.
  fireEvent.click(screen.getByRole('button', { name: /Leave aisle/ }));
  fireEvent.click(aisle('B'));
  expect(screen.getByText('Aisle B')).toBeInTheDocument();
});
