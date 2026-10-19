/**
 * Racking marked for a company: the list, marking a section from two boxes,
 * removing one, and where the marking shows up elsewhere on the screen. The
 * 3D drawing is Sections3D's (the scene is stubbed) and the maths is tested
 * in sections.test.js.
 */
import { act, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import { adminSettings, rackSections, stock } from '../../../api';
import { subscribe } from '../../../lib/notify';
import { DEFAULT_LAYOUT as L } from '../layout';
import { sectionBetween, sectionShape } from '../sections';
import { SECTION_COLORS } from '../binColors';
import WarehouseModule from '../WarehouseModule';

vi.mock('../../../api', () => ({
  adminSettings: { get: vi.fn(), set: vi.fn() },
  stock: { binMap: vi.fn(), putAway: vi.fn(), locationSummary: vi.fn() },
  rackSections: { list: vi.fn(), create: vi.fn(), remove: vi.fn() },
}));
// What the scene was last handed; `onSelect` stands in for a click on a box.
const scene = vi.hoisted(() => ({ props: null }));
vi.mock('../Warehouse3D', () => ({
  default: (props) => {
    scene.props = props;
    return <div data-testid="scene" />;
  },
}));

const CUSTOMERS = [
  { id: 'CUST001', name: 'Zone Bowling', status: 'Active' },
  { id: 'CUST002', name: 'Acme Hire', status: 'Active' },
];
const row = (id, customer, from, to, options) => ({
  id, branch: 'HQ', customer_id: customer.id, customer_name: customer.name, created_by: 'emon', created_at: null,
  ...sectionBetween(L, from, to, options),
});
const ZONE = row(1, CUSTOMERS[0], 'B.3.A.1', 'B.7.L.6');
const ACME = row(2, CUSTOMERS[1], 'C.4.A.1', 'C.4.C.6');

let toasts;
let stop;
beforeEach(() => {
  vi.clearAllMocks();
  scene.props = null;
  adminSettings.get.mockResolvedValue({ key: 'warehouse_layout:HQ', value: null });
  stock.binMap.mockResolvedValue({ branch: 'HQ', bins: [] });
  rackSections.list.mockResolvedValue({ branch: 'HQ', sections: [ZONE, ACME] });
  window.WebGLRenderingContext = function WebGLRenderingContext() {};
  HTMLCanvasElement.prototype.getContext = () => ({});
  toasts = [];
  stop = subscribe((t) => toasts.push(t));
});
afterEach(() => stop());

const open = async (role = 'manager', options) => {
  const rendered = renderWithQuery(<WarehouseModule currentUser={{ role }} onOpenSku={() => {}} customers={CUSTOMERS} />, options);
  await screen.findByTestId('scene');
  await screen.findByRole('region', { name: 'Company sections' }).catch(() => null);
  return rendered;
};
const list = () => within(screen.getByRole('region', { name: 'Company sections' }));
const clickBox = (code) => act(() => { scene.props.onSelect(code); });
const startMarking = async (company = 'zone') => {
  fireEvent.click(list().getByRole('button', { name: /Mark a section/ }));
  const form = within(screen.getByRole('complementary', { name: 'Mark a section' }));
  if (company) {
    fireEvent.change(form.getByLabelText('Company'), { target: { value: company } });
    fireEvent.click(within(form.getByRole('list', { name: 'Matching customers' })).getAllByRole('button')[0]);
  }
  return form;
};

describe('the list', () => {
  test('names each company’s sections in the racking’s own words, and hands them to the scene with a colour each', async () => {
    await open('staff');
    expect(list().getByText('Zone Bowling')).toBeInTheDocument();
    expect(list().getByText('Aisle B, right-hand side · bays 3, 5, 7 · all levels')).toBeInTheDocument();
    expect(list().getByText('Aisle C, left-hand side · bay 4 · levels A–C')).toBeInTheDocument();
    expect(rackSections.list).toHaveBeenCalledWith('HQ');
    expect(scene.props.sections).toEqual([ZONE, ACME]);
    expect(scene.props.sectionColors.get('CUST001')).toBe(SECTION_COLORS[0]);
    expect(scene.props.sectionColors.get('CUST002')).toBe(SECTION_COLORS[1]);
    expect(scene.props.draft).toBeNull();
  });

  test('staff can see the sections but not mark or remove one', async () => {
    await open('staff');
    expect(list().queryByRole('button', { name: /Mark a section/ })).not.toBeInTheDocument();
    expect(list().queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();
  });

  test('with none marked it says so, and a manager is told what marking is for', async () => {
    rackSections.list.mockResolvedValue({ branch: 'HQ', sections: [] });
    await open('manager');
    expect(list().getByText(/No racking is marked for a company at HQ\. Mark a section/)).toBeInTheDocument();
  });

  test('choosing a section walks to its aisle, level with its middle, facing its rack', async () => {
    await open('staff');
    fireEvent.click(list().getByRole('button', { name: /Zone Bowling/ }));
    const shape = sectionShape(L, ZONE);
    expect(scene.props.walk).toEqual({ aisleIndex: 3, z: (shape.z[0] + shape.z[1]) / 2, side: 'right' });
    fireEvent.click(list().getByRole('button', { name: /Acme Hire/ }));
    expect(scene.props.walk).toMatchObject({ aisleIndex: 2, side: 'left' });
  });

  test('a section that no longer fits the racking is listed as that, and cannot be walked to', async () => {
    const gone = { ...ZONE, id: 3, bay_to: 31, to_bin: 'B.31.L.6' };
    rackSections.list.mockResolvedValue({ branch: 'HQ', sections: [gone] });
    await open('staff');
    const button = list().getByRole('button', { name: /Zone Bowling/ });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('B.3.A.1 to B.31.L.6 — not in this racking');
  });

  test('if the sections cannot be loaded the racking is still shown, and the list offers to try again', async () => {
    rackSections.list.mockRejectedValueOnce(new Error('Request failed: 500'));
    await open('manager', { allowQueryErrors: true });
    const alert = await screen.findByText(/Couldn't load the company sections: Request failed: 500/);
    expect(screen.getByTestId('scene')).toBeInTheDocument();
    expect(scene.props.sections).toEqual([]);
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(list().getByText('Zone Bowling')).toBeInTheDocument());
  });

  test('sections are asked for again for another branch', async () => {
    await open('staff');
    rackSections.list.mockResolvedValue({ branch: 'MELB', sections: [] });
    fireEvent.change(screen.getByLabelText('Branch'), { target: { value: 'MELB' } });
    await waitFor(() => expect(rackSections.list).toHaveBeenCalledWith('MELB'));
    await waitFor(() => expect(list().getByText(/No racking is marked for a company at MELB/)).toBeInTheDocument());
  });
});

describe('marking a section', () => {
  test('a company and two boxes clicked in the view: whole bays, floor to top, and saved as its two corners', async () => {
    const saved = row(3, CUSTOMERS[0], 'D.3.A.1', 'D.7.L.6');
    rackSections.create.mockResolvedValue(saved);
    await open();
    const form = await startMarking();
    expect(form.getByRole('button', { name: 'Mark for Zone Bowling' })).toBeDisabled();

    clickBox('D.3.D.4');
    expect(form.getByLabelText('First box')).toHaveValue('D.3.D.4');
    // One box is already a section: its whole bay.
    expect(form.getByText(/Aisle D, right-hand side · bay 3 · all levels — 72 boxes\./)).toBeInTheDocument();
    expect(scene.props.draft).toMatchObject({ from_bin: 'D.3.A.1', to_bin: 'D.3.L.6' });

    clickBox('D.7.E.2');
    expect(form.getByLabelText('Second box')).toHaveValue('D.7.E.2');
    expect(form.getByText(/Aisle D, right-hand side · bays 3, 5, 7 · all levels — 216 boxes\./)).toBeInTheDocument();
    expect(scene.props.draft).toMatchObject({ from_bin: 'D.3.A.1', to_bin: 'D.7.L.6' });

    rackSections.list.mockResolvedValue({ branch: 'HQ', sections: [ZONE, ACME, saved] });
    fireEvent.click(form.getByRole('button', { name: 'Mark for Zone Bowling' }));
    await waitFor(() => expect(rackSections.create).toHaveBeenCalledWith({ branch: 'HQ', customer_id: 'CUST001', from_bin: 'D.3.A.1', to_bin: 'D.7.L.6' }));
    // The form goes, the list shows it, and it is said aloud.
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Mark a section' })).not.toBeInTheDocument());
    await waitFor(() => expect(list().getByText('Aisle D, right-hand side · bays 3, 5, 7 · all levels')).toBeInTheDocument());
    expect(toasts.at(-1)).toMatchObject({ type: 'success', message: 'Marked for Zone Bowling: Aisle D, right-hand side · bays 3, 5, 7 · all levels' });
    expect(scene.props.draft).toBeNull();
  });

  test('a box clicked while marking is a corner, not a box to open: no bin panel, and the camera is left alone', async () => {
    await open();
    await startMarking();
    const focus = scene.props.focus;
    clickBox('D.3.D.4');
    expect(screen.queryByRole('complementary', { name: /^Bin / })).not.toBeInTheDocument();
    expect(scene.props.selected).toBeNull();
    expect(scene.props.focus).toBe(focus);
  });

  test('a third box moves the second corner', async () => {
    await open();
    const form = await startMarking();
    clickBox('D.3.D.4');
    clickBox('D.7.E.2');
    clickBox('D.5.E.2');
    expect(form.getByLabelText('First box')).toHaveValue('D.3.D.4');
    expect(form.getByLabelText('Second box')).toHaveValue('D.5.E.2');
    expect(scene.props.draft).toMatchObject({ from_bin: 'D.3.A.1', to_bin: 'D.5.L.6' });
  });

  test('unticking whole bays or all levels marks exactly between the two boxes', async () => {
    rackSections.create.mockResolvedValue(row(3, CUSTOMERS[0], 'D.3.D.4', 'D.7.E.2'));
    await open();
    const form = await startMarking();
    clickBox('D.7.E.2');
    clickBox('D.3.D.4'); // either order
    fireEvent.click(form.getByLabelText('All levels, floor to top'));
    expect(scene.props.draft).toMatchObject({ from_bin: 'D.3.D.1', to_bin: 'D.7.E.6' });
    fireEvent.click(form.getByLabelText('Whole bays'));
    expect(scene.props.draft).toMatchObject({ from_bin: 'D.3.D.4', to_bin: 'D.7.E.2' });
    expect(form.getByText(/bay 3 box 4 to bay 7 box 2 · levels D–E — 22 boxes\./)).toBeInTheDocument();
    fireEvent.click(form.getByRole('button', { name: 'Mark for Zone Bowling' }));
    await waitFor(() => expect(rackSections.create).toHaveBeenCalledWith({ branch: 'HQ', customer_id: 'CUST001', from_bin: 'D.3.D.4', to_bin: 'D.7.E.2' }));
  });

  test('the corners can be typed, however the codes are written', async () => {
    await open();
    const form = await startMarking();
    fireEvent.change(form.getByLabelText('First box'), { target: { value: 'd.03.a.01' } });
    // Letters go in as capitals, as the labels on the boxes read.
    expect(form.getByLabelText('First box')).toHaveValue('D.03.A.01');
    fireEvent.change(form.getByLabelText('Second box'), { target: { value: ' D.5.B.2 ' } });
    expect(scene.props.draft).toMatchObject({ from_bin: 'D.3.A.1', to_bin: 'D.5.L.6' });
    expect(form.getByRole('button', { name: 'Mark for Zone Bowling' })).toBeEnabled();
  });

  test('says why two boxes do not make a section, and will not save one', async () => {
    await open();
    const form = await startMarking();
    const save = form.getByRole('button', { name: 'Mark for Zone Bowling' });
    fireEvent.change(form.getByLabelText('First box'), { target: { value: 'A-01-04' } });
    // Not a location the system knows, so it is shown in small letters.
    expect(form.getByRole('alert')).toHaveTextContent('The first box “a-01-04” is not an aisle.bay.level.box code, like B.3.A.1.');
    expect(save).toBeDisabled();
    expect(scene.props.draft).toBeNull();

    fireEvent.change(form.getByLabelText('First box'), { target: { value: 'D.3.A.1' } });
    fireEvent.change(form.getByLabelText('Second box'), { target: { value: 'D.44.A.1' } });
    expect(form.getByRole('alert')).toHaveTextContent('The second box “d.44.a.1” is in a bay beyond the racking.');

    fireEvent.change(form.getByLabelText('Second box'), { target: { value: 'D.4.A.1' } });
    expect(form.getByRole('alert')).toHaveTextContent(/opposite sides of the aisle: odd bays face even bays/);
    fireEvent.change(form.getByLabelText('Second box'), { target: { value: 'E.3.A.1' } });
    expect(form.getByRole('alert')).toHaveTextContent(/different aisles/);
    expect(save).toBeDisabled();
    fireEvent.submit(screen.getByRole('form', { name: 'Mark a section for a company' }));
    expect(rackSections.create).not.toHaveBeenCalled();
  });

  test('a corner being typed is offered the boxes it could be, and Enter takes one without saving the form', async () => {
    await open();
    const form = await startMarking();
    const first = form.getByLabelText('First box');
    fireEvent.change(first, { target: { value: 'd.3.' } });
    expect(first).toHaveValue('D.3.');
    const offered = within(screen.getByRole('listbox', { name: 'Locations this could be' })).getAllByRole('option');
    expect(offered[0]).toHaveTextContent('D.3.A.1');
    expect(offered).toHaveLength(12);
    // The start of a real location is unfinished, not wrong.
    expect(form.getByRole('alert')).toHaveTextContent('The first box “D.3.” is not a whole location yet — finish it, or choose one from the list.');
    expect(form.getByRole('button', { name: 'Mark for Zone Bowling' })).toBeDisabled();
    fireEvent.keyDown(first, { key: 'Enter' });
    expect(first).toHaveValue('D.3.A.1');
    expect(rackSections.create).not.toHaveBeenCalled();
    expect(scene.props.draft).toMatchObject({ from_bin: 'D.3.A.1', to_bin: 'D.3.L.6' });
  });

  test('nothing can be saved without a company', async () => {
    await open();
    const form = await startMarking(null);
    clickBox('D.3.D.4');
    expect(form.getByRole('button', { name: 'Mark section' })).toBeDisabled();
    fireEvent.change(form.getByLabelText('Company'), { target: { value: 'nobody' } });
    expect(form.getByText('No customer matches “nobody”.')).toBeInTheDocument();
    fireEvent.submit(screen.getByRole('form', { name: 'Mark a section for a company' }));
    expect(rackSections.create).not.toHaveBeenCalled();
  });

  test('boxes already marked for a company are refused before saving, naming whose they are', async () => {
    await open();
    const form = await startMarking('acme');
    clickBox('B.5.C.3');
    expect(form.getByRole('alert')).toHaveTextContent('Some of these boxes are already Zone Bowling’s (B.3.A.1 to B.7.L.6).');
    expect(form.getByRole('button', { name: 'Mark for Acme Hire' })).toBeDisabled();
    // The bays facing them across the walkway are free.
    fireEvent.change(form.getByLabelText('First box'), { target: { value: 'B.6.C.3' } });
    expect(form.queryByRole('alert')).not.toBeInTheDocument();
    expect(form.getByRole('button', { name: 'Mark for Acme Hire' })).toBeEnabled();
  });

  test('when someone else marks those boxes first, the refusal is shown and the list is fetched again', async () => {
    rackSections.create.mockRejectedValue(Object.assign(new Error("Overlaps Acme Hire's section D.3.A.1 - D.3.L.6"), { status: 409 }));
    await open();
    const form = await startMarking();
    clickBox('D.3.D.4');
    const taken = row(4, CUSTOMERS[1], 'D.3.A.1', 'D.3.L.6');
    rackSections.list.mockResolvedValue({ branch: 'HQ', sections: [ZONE, ACME, taken] });
    fireEvent.click(form.getByRole('button', { name: 'Mark for Zone Bowling' }));
    expect(await form.findByText(/Couldn't mark the section: Overlaps Acme Hire's section/)).toBeInTheDocument();
    // The form is still there with what was entered, and now knows whose the boxes are.
    expect(form.getByLabelText('First box')).toHaveValue('D.3.D.4');
    await waitFor(() => expect(form.getByText(/already Acme Hire’s \(D\.3\.A\.1 to D\.3\.L\.6\)/)).toBeInTheDocument());
    // Entering other corners drops the refusal about the last ones.
    fireEvent.change(form.getByLabelText('First box'), { target: { value: 'D.9.A.1' } });
    await waitFor(() => expect(form.queryByText(/Couldn't mark the section/)).not.toBeInTheDocument());
  });

  test('a refusal is dropped just the same when the new corner is clicked in the view', async () => {
    rackSections.create.mockRejectedValue(Object.assign(new Error("Overlaps Acme Hire's section D.3.A.1 - D.3.L.6"), { status: 409 }));
    await open();
    const form = await startMarking();
    clickBox('D.3.D.4');
    fireEvent.click(form.getByRole('button', { name: 'Mark for Zone Bowling' }));
    expect(await form.findByText(/Couldn't mark the section/)).toBeInTheDocument();
    clickBox('D.9.E.2');
    await waitFor(() => expect(form.queryByText(/Couldn't mark the section/)).not.toBeInTheDocument());
  });

  test('Cancel puts the box panel’s behaviour back: a box clicked is opened again', async () => {
    await open();
    const form = await startMarking();
    clickBox('D.3.D.4');
    fireEvent.click(form.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('complementary', { name: 'Mark a section' })).not.toBeInTheDocument();
    expect(scene.props.draft).toBeNull();
    clickBox('D.3.D.4');
    expect(screen.getByRole('complementary', { name: 'Bin D.3.D.4' })).toBeInTheDocument();
    // And starting again starts empty.
    const again = await startMarking(null);
    expect(again.getByLabelText('First box')).toHaveValue('');
  });
});

describe('removing a section', () => {
  test('asks first, says the stock is not touched, and removes it on a yes', async () => {
    rackSections.remove.mockResolvedValue({ ok: true });
    await open();
    fireEvent.click(list().getByRole('button', { name: "Remove Zone Bowling's section, B.3.A.1 to B.7.L.6" }));
    const ask = within(list().getByRole('group', { name: "Remove Zone Bowling's section?" }));
    expect(ask.getByText(/The stock in it is not touched/)).toBeInTheDocument();
    expect(rackSections.remove).not.toHaveBeenCalled();

    rackSections.list.mockResolvedValue({ branch: 'HQ', sections: [ACME] });
    fireEvent.click(ask.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(rackSections.remove).toHaveBeenCalledWith(1));
    await waitFor(() => expect(list().queryByText('Zone Bowling')).not.toBeInTheDocument());
    expect(toasts.at(-1)).toMatchObject({ type: 'success', message: "Zone Bowling's section removed" });
  });

  test('Keep leaves it alone', async () => {
    await open();
    fireEvent.click(list().getByRole('button', { name: "Remove Acme Hire's section, C.4.A.1 to C.4.C.6" }));
    fireEvent.click(list().getByRole('button', { name: 'Keep' }));
    expect(rackSections.remove).not.toHaveBeenCalled();
    expect(list().getByRole('button', { name: /^Acme Hire/ })).toBeInTheDocument();
  });

  test('a removal that fails is said aloud, and the list shows what is there now', async () => {
    rackSections.remove.mockRejectedValue(Object.assign(new Error('Section not found'), { status: 404 }));
    await open();
    fireEvent.click(list().getByRole('button', { name: "Remove Zone Bowling's section, B.3.A.1 to B.7.L.6" }));
    rackSections.list.mockResolvedValue({ branch: 'HQ', sections: [ACME] });
    fireEvent.click(list().getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(toasts.at(-1)).toMatchObject({ type: 'error', message: "Couldn't remove Zone Bowling's section: Section not found" }));
    await waitFor(() => expect(list().queryByText('Zone Bowling')).not.toBeInTheDocument());
  });
});

describe('where a section shows up', () => {
  test('a box’s panel says whose section it is in', async () => {
    await open('staff');
    clickBox('B.5.C.3');
    expect(within(screen.getByRole('complementary', { name: 'Bin B.5.C.3' })).getByText('In Zone Bowling’s section')).toBeInTheDocument();
    clickBox('B.6.C.3');
    expect(within(screen.getByRole('complementary', { name: 'Bin B.6.C.3' })).queryByText(/section/)).not.toBeInTheDocument();
  });

  test('walking past it, the bays are named with the company whose they are', async () => {
    await open('staff');
    fireEvent.click(within(screen.getByRole('group', { name: 'Walk an aisle' })).getByRole('button', { name: 'Aisle B' }));
    act(() => { scene.props.onWalkAt({ aisleIndex: 3, bays: { odd: 5, even: 6 } }); });
    expect(screen.getByText('Aisle B · bay 5 on the right (Zone Bowling), bay 6 on the left')).toBeInTheDocument();
  });
});

describe('the keyboard keeps its place', () => {
  test('asking to remove puts it on Keep; keeping puts it back on the button that asked', async () => {
    await open();
    const ask = list().getByRole('button', { name: "Remove Zone Bowling's section, B.3.A.1 to B.7.L.6" });
    ask.focus();
    fireEvent.click(ask);
    expect(list().getByRole('button', { name: 'Keep' })).toHaveFocus();
    fireEvent.click(list().getByRole('button', { name: 'Keep' }));
    expect(list().getByRole('button', { name: "Remove Zone Bowling's section, B.3.A.1 to B.7.L.6" })).toHaveFocus();
  });

  test('once a section is removed it goes to the list, not to the page', async () => {
    rackSections.remove.mockResolvedValue({ ok: true });
    await open();
    fireEvent.click(list().getByRole('button', { name: "Remove Zone Bowling's section, B.3.A.1 to B.7.L.6" }));
    rackSections.list.mockResolvedValue({ branch: 'HQ', sections: [ACME] });
    fireEvent.click(list().getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(list().queryByText('Zone Bowling')).not.toBeInTheDocument());
    expect(screen.getByRole('region', { name: 'Company sections' })).toHaveFocus();
  });

  test('a removal answered after the person has gone elsewhere does not pull them back', async () => {
    let finish;
    rackSections.remove.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await open();
    fireEvent.click(list().getByRole('button', { name: "Remove Zone Bowling's section, B.3.A.1 to B.7.L.6" }));
    fireEvent.click(list().getByRole('button', { name: 'Remove' }));
    const search = screen.getByLabelText('Find SKU, product or bin');
    search.focus();
    await act(async () => { finish({ ok: true }); });
    await waitFor(() => expect(toasts.at(-1)).toMatchObject({ type: 'success' }));
    expect(search).toHaveFocus();
  });

  test('closing the marking form puts it back on Mark a section', async () => {
    await open();
    const form = await startMarking(null);
    expect(form.getByLabelText('Company')).toHaveFocus();
    fireEvent.click(form.getByRole('button', { name: 'Cancel' }));
    expect(list().getByRole('button', { name: /Mark a section/ })).toHaveFocus();
  });

  test('choosing a company moves it on to the first corner', async () => {
    await open();
    const form = await startMarking();
    expect(form.getByLabelText('First box')).toHaveFocus();
  });
});
