/**
 * The document template model.
 *
 * These five documents — job sheet, delivery note, consignment note, picking
 * list, ship label — were previously written twice each: once as React for the
 * screen and once as ReportLab for the PDF. Two renderers for one document is
 * two places to change and two places to drift, and it is why nobody could
 * adjust a layout without a developer.
 *
 * A template here is data. One renderer reads it for the screen, for print and
 * for PDF (the browser's own print-to-PDF), so what you design is what comes
 * out of the printer.
 *
 * ── The shape ──────────────────────────────────────────────────────────────
 *
 * A document is an ordered list of BANDS, and a band is an ordered list of
 * BLOCKS. That is the same model a banded report writer uses, and it is chosen
 * over free positioning for one reason: these documents carry a variable number
 * of lines. A job with three items and a job with forty have to print from the
 * same template, and anything absolutely positioned below the item table is
 * wrong for one of them. Bands flow; coordinates do not.
 *
 *   header   printed once at the top
 *   lines    the item table, which grows
 *   footer   printed once at the bottom
 *
 * A label has no line table, so it uses a single `body` band.
 */

// ── Paper ───────────────────────────────────────────────────────────────────

export const PAPER = {
  A4: { label: 'A4 portrait', width: 210, height: 297, margin: 12 },
  A4L: { label: 'A4 landscape', width: 297, height: 210, margin: 12 },
  A5: { label: 'A5 portrait', width: 148, height: 210, margin: 10 },
  label100x150: { label: 'Label 100 × 150 mm', width: 100, height: 150, margin: 4 },
  label100x100: { label: 'Label 100 × 100 mm', width: 100, height: 100, margin: 4 },
};

// ── What a block can put on the page ────────────────────────────────────────

export const BLOCK_TYPES = {
  logo: { label: 'Logo', hint: 'The company mark, or the wordmark if there is no image.' },
  companyBlock: { label: 'Our details', hint: 'Company name, ABN, address and contact.' },
  docTitle: { label: 'Document title', hint: 'The document name and the job number.' },
  partyBlock: { label: 'Address block', hint: 'Customer, ship-to, sender or receiver.' },
  fieldGrid: { label: 'Field grid', hint: 'A grid of labelled values from the job.' },
  lineTable: { label: 'Item table', hint: 'The job lines. Only meaningful in the lines band.' },
  totals: { label: 'Totals', hint: 'Counts and sums drawn from the lines.' },
  barcode: { label: 'Barcode', hint: 'Code 128 of the job number or a reference.' },
  freeText: { label: 'Text', hint: 'Fixed wording. Supports {tokens}.' },
  signature: { label: 'Signature', hint: 'Ruled lines for name, signature and date.' },
  divider: { label: 'Divider', hint: 'A horizontal rule.' },
  spacer: { label: 'Spacer', hint: 'Vertical space.' },
};

// ── Job fields available to a field grid, and to {tokens} in text ───────────
//
// Only fields that mean something on a printed document. The job object carries
// far more, but a delivery note has no business showing a margin.

export const JOB_FIELDS = [
  { key: 'id', label: 'Job #' },
  { key: 'customer', label: 'Customer' },
  { key: 'dateIn', label: 'Date in' },
  { key: 'due', label: 'Due' },
  { key: 'out', label: 'Out' },
  { key: 'status', label: 'Status' },
  { key: 'invoice', label: 'Invoice #' },
  { key: 'quote', label: 'Quote #' },
  { key: 'custRef', label: 'Customer ref' },
  { key: 'ourRef', label: 'Our ref' },
  { key: 'projectNo', label: 'Project #' },
  { key: 'description', label: 'Description' },
  { key: 'notes', label: 'Notes' },
  { key: 'assignedTo', label: 'Assigned to' },
  { key: 'accMgr', label: 'Account manager' },
  { key: 'branch', label: 'Branch' },
  { key: 'priority', label: 'Priority' },
  { key: 'type', label: 'Job type' },
  { key: 'shipTo', label: 'Ship-to code' },
  { key: 'shippingAddress', label: 'Shipping address' },
  { key: 'nameContact', label: 'Contact' },
  { key: 'paymentMethod', label: 'Payment method' },
  { key: 'weightTotal', label: 'Total weight (kg)' },
  { key: 'requestedBy', label: 'Requested by' },
];

// ── Columns available to the item table ─────────────────────────────────────

export const LINE_COLUMNS = [
  { key: 'stockCode', label: 'SKU', align: 'left', width: 22 },
  { key: 'description', label: 'Description', align: 'left', width: 40 },
  { key: 'decorationType', label: 'Decoration', align: 'left', width: 18 },
  { key: 'decPosition', label: 'Position', align: 'left', width: 16 },
  { key: 'sizes', label: 'Sizes', align: 'left', width: 22 },
  { key: 'order', label: 'Ordered', align: 'right', width: 12 },
  { key: 'qty', label: 'Qty', align: 'right', width: 10 },
  { key: 'qtyPick', label: 'Picked', align: 'right', width: 10 },
  { key: 'qtyDelivered', label: 'Delivered', align: 'right', width: 12 },
  { key: 'weightKg', label: 'Weight', align: 'right', width: 12 },
  { key: 'poNo', label: 'PO #', align: 'left', width: 14 },
  // Resolved against stock rather than read off the job line: the picker needs
  // to know where the item is, and that it is there at all. Prints the bin, or
  // OUT OF STOCK where there is none.
  { key: 'binLocation', label: 'Bin', align: 'left', width: 16, source: 'inventory' },
  { key: 'priceEx', label: 'Price ex', align: 'right', width: 14 },
  { key: 'total', label: 'Total', align: 'right', width: 14 },
];

// ── Totals a footer can show ────────────────────────────────────────────────

export const TOTAL_FIELDS = [
  { key: 'lineCount', label: 'Lines' },
  { key: 'totalQty', label: 'Total qty' },
  { key: 'totalPicked', label: 'Total picked' },
  { key: 'totalWeight', label: 'Total weight (kg)' },
  { key: 'cartons', label: 'Cartons' },
  { key: 'totalEx', label: 'Total ex GST' },
  { key: 'tax', label: 'GST' },
  { key: 'totalInc', label: 'Total inc GST' },
];

export const PARTY_SOURCES = [
  { key: 'customer', label: 'Customer' },
  { key: 'shipTo', label: 'Ship to' },
  { key: 'company', label: 'Us (sender)' },
];

export const DOC_TYPES = {
  jobSheet: { label: 'Job Sheet', paper: 'A4', banded: true },
  deliveryNote: { label: 'Delivery Note', paper: 'A4', banded: true },
  consignmentNote: { label: 'Consignment Note', paper: 'A4', banded: true },
  pickingList: { label: 'Picking List', paper: 'A4', banded: true },
  shipLabel: { label: 'Ship Label', paper: 'label100x150', banded: false },
};

let seq = 0;
export const blockId = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`;

const block = (type, props = {}) => ({ id: blockId(), type, ...props });

// ── Defaults ────────────────────────────────────────────────────────────────
//
// These reproduce what the hardcoded renderers printed, so switching to
// templates is not a change of output. Everything here is editable afterwards.

function jobSheet() {
  return {
    docType: 'jobSheet',
    name: 'Job Sheet',
    paper: 'A4',
    bands: {
      header: [
        block('logo', { align: 'left', height: 14 }),
        block('docTitle', { text: 'JOB SHEET', showJobNumber: true }),
        block('divider'),
        block('fieldGrid', {
          columns: 3,
          fields: ['customer', 'dateIn', 'due', 'custRef', 'assignedTo', 'priority'],
        }),
        block('spacer', { size: 4 }),
      ],
      lines: [
        block('lineTable', {
          columns: ['stockCode', 'description', 'decorationType', 'decPosition', 'sizes', 'order'],
          zebra: true,
          showSections: true,
        }),
      ],
      footer: [
        block('divider'),
        block('totals', { fields: ['lineCount', 'totalQty'], align: 'right' }),
        block('freeText', { text: 'Job {id} — {customer}', size: 'small', align: 'left' }),
      ],
    },
  };
}

function deliveryNote() {
  return {
    docType: 'deliveryNote',
    name: 'Delivery Note',
    paper: 'A4',
    bands: {
      header: [
        block('logo', { align: 'left', height: 14 }),
        block('docTitle', { text: 'DELIVERY NOTE', showJobNumber: true }),
        block('partyBlock', { source: 'shipTo', heading: 'Deliver to' }),
        block('fieldGrid', { columns: 3, fields: ['dateIn', 'due', 'custRef'] }),
        block('spacer', { size: 4 }),
      ],
      lines: [
        block('lineTable', {
          columns: ['stockCode', 'description', 'order', 'qtyDelivered'],
          zebra: true,
          showSections: false,
        }),
      ],
      footer: [
        block('divider'),
        block('totals', { fields: ['lineCount', 'totalQty'], align: 'right' }),
        block('signature', { lines: ['Received by', 'Signature', 'Date'] }),
      ],
    },
  };
}

function consignmentNote() {
  return {
    docType: 'consignmentNote',
    name: 'Consignment Note',
    paper: 'A4',
    bands: {
      header: [
        block('docTitle', { text: 'CONSIGNMENT NOTE', showJobNumber: true }),
        block('barcode', { source: 'id', caption: true, height: 16 }),
        block('divider'),
        block('partyBlock', { source: 'company', heading: 'Sender' }),
        block('partyBlock', { source: 'shipTo', heading: 'Receiver' }),
        block('fieldGrid', {
          columns: 3,
          fields: ['dateIn', 'custRef', 'weightTotal'],
        }),
      ],
      lines: [
        block('lineTable', {
          columns: ['description', 'order', 'weightKg'],
          zebra: false,
          showSections: false,
        }),
      ],
      footer: [
        block('totals', { fields: ['cartons', 'totalQty', 'totalWeight'], align: 'left' }),
        block('freeText', {
          text: 'Goods received in apparent good order and condition unless noted.',
          size: 'small',
        }),
        // "Received by" rather than "Receiver": the receiver is the company in
        // the address block above, and this is the person who signs for it.
        block('signature', { lines: ['Driver', 'Received by', 'Date and time'] }),
      ],
    },
  };
}

function pickingList() {
  return {
    docType: 'pickingList',
    name: 'Picking List',
    paper: 'A4',
    bands: {
      header: [
        block('docTitle', { text: 'PICKING LIST', showJobNumber: true }),
        block('fieldGrid', { columns: 4, fields: ['customer', 'due', 'branch', 'assignedTo'] }),
        block('divider'),
      ],
      lines: [
        block('lineTable', {
          columns: ['stockCode', 'description', 'sizes', 'binLocation', 'order', 'qtyPick'],
          zebra: true,
          showSections: true,
        }),
      ],
      footer: [
        block('divider'),
        block('totals', { fields: ['lineCount', 'totalQty', 'totalPicked'], align: 'right' }),
        block('signature', { lines: ['Picked by', 'Checked by', 'Date'] }),
      ],
    },
  };
}

function shipLabel() {
  return {
    docType: 'shipLabel',
    name: 'Ship Label',
    paper: 'label100x150',
    bands: {
      body: [
        block('partyBlock', { source: 'company', heading: 'From', size: 'small' }),
        block('divider'),
        block('partyBlock', { source: 'shipTo', heading: 'Ship to', size: 'large' }),
        block('spacer', { size: 4 }),
        block('barcode', { source: 'id', caption: true, height: 18 }),
        block('totals', { fields: ['lineCount', 'totalQty'], align: 'center' }),
      ],
    },
  };
}

const DEFAULTS = {
  jobSheet,
  deliveryNote,
  consignmentNote,
  pickingList,
  shipLabel,
};

export function defaultTemplate(docType) {
  const make = DEFAULTS[docType];
  if (!make) throw new Error(`No default template for document type "${docType}"`);
  return make();
}

export const bandsOf = (template) =>
  DOC_TYPES[template.docType]?.banded ? ['header', 'lines', 'footer'] : ['body'];

export const BAND_LABELS = {
  header: 'Header — printed once at the top',
  lines: 'Lines — grows with the job',
  footer: 'Footer — printed once at the bottom',
  body: 'Label',
};
