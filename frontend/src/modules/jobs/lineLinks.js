/**
 * Linking a job's lines in the line editor (findings F02, F19).
 *
 * A decoration or an alteration is work done to a garment line, not goods: the
 * server never reserves, buys, picks or ships it. It knows a line is one when
 * the line carries a logo, or names the line it applies to. The form could do
 * neither, so a logo or an alteration keyed on the screen stayed a garment and
 * was bought.
 *
 * A line names its target by reference: `id:<id>` for a saved line, `key:<k>`
 * for one added in this form (its `lineKey`), `line:<n>` for an unsaved line
 * with no key. On save the reference becomes `appliesToItemId` (a saved
 * target) or `appliesToLine` (an unsaved one, by its position — the `sort` the
 * server resolves once every line is in).
 */

let lastKey = 0;
/** A key that names a line added in this form until the server gives it an id. */
export const newLineKey = () => `n${++lastKey}`;

const isLine = (item) => !item.displayType || item.displayType === 'product';

/** How other lines name this one. */
export function lineRef(item, idx) {
  if (item.id != null) return `id:${item.id}`;
  if (item.lineKey) return `key:${item.lineKey}`;
  return `line:${idx}`;
}

/** The line this one applies to, as a reference; '' when none. */
export function appliesToValue(item) {
  if (item.appliesTo !== undefined) return item.appliesTo || '';
  return item.appliesToItemId != null ? `id:${item.appliesToItemId}` : '';
}

/** A goods line: a product line that is neither a logo nor applied to another line. */
export const isGoodsLine = (item) => isLine(item) && item.logoId == null && !appliesToValue(item);

/** The lines line `idx` can apply to: the job's other goods lines. */
export function appliesToChoices(items, idx) {
  return items
    .map((item, i) => ({ item, i }))
    .filter(({ item, i }) => i !== idx && isGoodsLine(item))
    .map(({ item, i }) => ({
      value: lineRef(item, i),
      label: `Line ${i + 1}${item.stockCode ? ` · ${item.stockCode}` : ''}${item.description ? ` · ${item.description}` : ''}`,
    }));
}

/**
 * Point line `item` at another (`ref`), or at none (''). A line that applies
 * to another is supplied in full and never back-ordered, as the server keeps it.
 */
export function linkLine(item, ref) {
  if (!ref) return { ...item, appliesTo: '' };
  const order = parseFloat(item.order) || 0;
  return { ...item, appliesTo: ref, supply: order, bOrd: 0 };
}

/**
 * The lines as they are saved: each reference resolved to `appliesToItemId`
 * or `appliesToLine`. A reference that no longer names one of the job's goods
 * lines (its target was removed, or became a note) is dropped rather than sent.
 */
export function resolveLineLinks(items) {
  return items.map((item, idx) => {
    const ref = appliesToValue(item);
    const target = ref && appliesToChoices(items, idx).find((c) => c.value === ref);
    const { appliesTo, ...rest } = item;
    if (!target) return { ...rest, appliesToItemId: null, appliesToLine: undefined };
    if (ref.startsWith('id:')) return { ...rest, appliesToItemId: Number(ref.slice(3)), appliesToLine: undefined };
    const at = items.findIndex((other, i) => lineRef(other, i) === ref);
    return { ...rest, appliesToItemId: null, appliesToLine: at };
  });
}

/** The customer's logos whose code or name match what is typed in the stock-code field. */
export function logoMatches(logos, term) {
  const t = (term || '').trim().toLowerCase();
  if (!t) return [];
  return (logos || [])
    .filter((g) => g.code.toLowerCase().includes(t) || (g.name || '').toLowerCase().includes(t))
    .slice(0, 5);
}

/**
 * A line given a logo: its code, method, position and stitches, priced and
 * costed as the logo is. It is a service, so it is supplied in full.
 */
export function applyLogo(item, logo) {
  const order = parseFloat(item.order) || 0;
  const priceEx = logo.priceEx || 0;
  const cost = logo.costEx || 0;
  return {
    ...item,
    stockCode: logo.code,
    description: item.description || logo.name || logo.code,
    logoId: logo.id,
    decorationType: logo.decorationType || item.decorationType,
    decCode: logo.code,
    decPosition: logo.position || item.decPosition || '',
    stitchCount: logo.stitchCount ?? item.stitchCount ?? '',
    purchasePrice: cost,
    priceEx,
    priceInc: parseFloat((priceEx * 1.1).toFixed(2)),
    margin: cost > 0 ? parseFloat((priceEx - cost).toFixed(2)) : 0,
    marginPercent: priceEx > 0 && cost > 0 ? parseFloat(((priceEx - cost) / priceEx * 100).toFixed(1)) : 0,
    supply: order,
    bOrd: 0,
    total: parseFloat((priceEx * order).toFixed(2)),
  };
}
