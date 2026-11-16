/**
 * Crediting an invoice, worked out the way the server works it out
 * (backend/app/core/credit_notes.py, core/job_totals.py) so the dialog shows
 * what the credit note will be as it is typed. The server's figure is the
 * one that stands; this is the same rule, not a second one.
 * docs/superpowers/specs/2026-11-09-returns-credit-notes.md
 */

export const CREDITABLE_STATUSES = ['INVOICE', 'PAID'];
const GST_RATE = 0.1;

const cents = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Whether a job is an invoice, and so may be credited. */
export const isCreditable = (job) => CREDITABLE_STATUSES.includes(job?.status);

/** The lines that carry money: goods, decorations and charges, not layout. */
export const creditableLines = (job) =>
  (job?.items || []).filter((i) => (i.displayType || 'product') === 'product' && Number(i.order) > 0);

/** Goods can come back; a decoration, alteration or charge is money only. */
export const mayComeBack = (item) => !item.isService && !item.isCharge;

/**
 * A garment with work done to it, which never goes back into stock: its own
 * decoration type, a logo or alteration line applying to it, or a logo line
 * that names no garment and so decorates them all (server: `decorated`).
 */
export function decorated(item, items) {
  if (item.decorationType && item.decorationType !== 'None') return true;
  return (items || []).some((other) => other !== item && (
    other.appliesToItemId === item.id || (other.logoId != null && other.appliesToItemId == null)
  ));
}

/** Per job line: how many earlier credit notes credited, and how many came back. */
export function creditedSoFar(notes) {
  const credited = new Map();
  const back = new Map();
  for (const note of notes || []) {
    for (const line of note.lines || []) {
      if (line.job_item_id == null) continue;
      credited.set(line.job_item_id, (credited.get(line.job_item_id) || 0) + line.qty);
      if (line.goods_back) back.set(line.job_item_id, (back.get(line.job_item_id) || 0) + line.qty);
    }
  }
  return { credited, back };
}

/** How many of a line are left to credit. */
export const leftToCredit = (item, so) => Math.max(0, Number(item.order) - (so.credited.get(item.id) || 0));

/** How many of a line went out and have not come back. */
export const leftToReturn = (item, so) => Math.max(0, Number(item.supply) - (so.back.get(item.id) || 0));

/**
 * What crediting `picks` ({ [itemId]: qty }) of these lines comes to: lines
 * priced ex GST add up ex with GST on the sum; each line priced inc GST is its
 * inc price, of which GST is one eleventh, rounded line by line.
 */
export function estimate(items, picks) {
  let exLines = 0;
  let ex = 0;
  let tax = 0;
  let inc = 0;
  for (const item of items) {
    const qty = Number(picks[item.id]) || 0;
    if (!qty) continue;
    if (item.pricedInc) {
      const lineInc = cents(qty * cents(item.priceInc));
      const lineGst = cents(lineInc / (1 + 1 / GST_RATE));
      ex += lineInc - lineGst;
      tax += lineGst;
      inc += lineInc;
    } else {
      exLines += cents(qty * cents(item.priceEx));
    }
  }
  const byEx = cents(exLines);
  const byExTax = cents(byEx * GST_RATE);
  return { ex: cents(ex + byEx), tax: cents(tax + byExTax), inc: cents(inc + byEx + byExTax) };
}

/** What of the invoice no credit note has credited yet. */
export function leftOnInvoice(job, notes) {
  const sum = (key) => (notes || []).reduce((s, n) => s + (Number(n[key]) || 0), 0);
  return {
    ex: cents((Number(job.subtotal) || 0) - sum('total_ex')),
    tax: cents((Number(job.tax) || 0) - sum('tax')),
    inc: cents((Number(job.total) || 0) - sum('total_inc')),
  };
}

/**
 * The credit note `picks` make: the lines' figure, except that the note
 * crediting everything left — or more than is left, by rounding — takes
 * exactly what is left, so the invoice nets to the cent (server: _note_totals).
 */
export function noteEstimate(job, notes, picks) {
  const lines = creditableLines(job);
  const so = creditedSoFar(notes);
  const left = leftOnInvoice(job, notes);
  const worked = estimate(lines, picks);
  const creditsAll = lines.every((l) => leftToCredit(l, so) === (Number(picks[l.id]) || 0));
  return worked.inc > 0 && (creditsAll || worked.inc > left.inc) ? left : worked;
}

/** An amount (inc GST) credited with no lines: GST in the invoice's own proportion (server: _amount_totals). */
export function amountEstimate(job, notes, amount) {
  const left = leftOnInvoice(job, notes);
  const inc = cents(amount);
  if (!(inc > 0)) return { ex: 0, tax: 0, inc: 0 };
  if (inc >= left.inc) return left;
  const tax = left.inc > 0 ? cents((inc * left.tax) / left.inc) : 0;
  return { ex: cents(inc - tax), tax, inc };
}

/** Credit left to apply on a note. */
export const creditLeft = (note) => Number(note?.unapplied) || 0;
