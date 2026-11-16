// Colours for the 3D warehouse, from SAP Horizon's element colours so the
// states read the same as everywhere else in the app (palette.js holds the
// text-safe variants; these are the brighter element fills a 3D surface needs).
export const BIN_COLORS = {
  stocked: '#0070f2',  // sapBrandColor — stock on hand
  empty: '#e76500',    // sapCriticalElementColor — slotted, nothing on hand
  over: '#f53232',     // sapNegativeElementColor — over the bins' capacity
  // Hi-vis yellow: the one colour that appears nowhere in the racking itself
  // (blue uprights, orange beams, kraft boxes), outlined in the focus blue.
  selected: '#ffd000',
  outline: '#0032a5', // sapContent_FocusColor
  // The physical warehouse, from the owner's photo of aisle B: kraft
  // cardboard boxes on orange beams between blue uprights. Every position
  // has a box, so a box with nothing slotted is drawn as plain cardboard.
  kraft: '#c9a46d',
  label: '#f7f7f4',     // a white location label on the box's front lip
  labelText: '#131e29',
  goods: '#2a2e35',     // the opening of a box with stock in it
  hollow: '#6b5236',    // the opening of an empty box: its cardboard inside
  upright: '#1f5fc0',
  beam: '#e85a1c',
  deck: '#d6dbe0',
  floor: '#dfe3e6',
  bench: '#cfd5da',
  receiving: '#d1efff', // sapAccentBackgroundColor6
  walk: '#0070f2',      // sapBrandColor — the line down each aisle, as on a street map
  sky: '#f5f6f7',       // sapBackgroundColor
};

// One per company with a section of racking marked for it, in turn. Horizon's
// accent colours, less the ones that already mean something here: blue is
// stock on hand and the uprights, orange the beams and an empty slot, red
// over capacity, yellow the selected box. All carry white text.
export const SECTION_COLORS = ['#046c7a', '#a100c2', '#256f3a', '#5d36ff', '#ba066c', '#5b738b', '#6c32a9'];

// The legend: a box's label colour is its state.
export const LEGEND = [
  { state: 'stocked', label: 'Stock on hand' },
  { state: 'empty', label: 'Slotted, none on hand' },
  { state: 'over', label: 'Over capacity' },
  { state: 'label', label: 'Nothing slotted' },
];
