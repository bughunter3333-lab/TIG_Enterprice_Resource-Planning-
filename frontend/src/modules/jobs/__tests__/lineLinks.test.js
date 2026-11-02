import { appliesToChoices, appliesToValue, applyLogo, linkLine, logoMatches, resolveLineLinks } from '../lineLinks';

// A saved polo, a saved logo line, and two lines added in this form: a shirt
// (keyed) and an alteration.
const polo = { id: 11, displayType: 'product', stockCode: 'POLO-M', description: 'Polo', order: 10, supply: 4, bOrd: 6 };
const logo = { id: 12, displayType: 'product', stockCode: 'EMB.CFG.LHC', logoId: 4, order: 10 };
const shirt = { lineKey: 'n1', displayType: 'product', stockCode: 'SHIRT-L', description: 'Shirt', order: 5 };
const hem = { lineKey: 'n2', displayType: 'product', description: 'Hem shorten', order: 5, supply: 0, bOrd: 5 };
const note = { displayType: 'note', description: 'Deliver to gate 2' };

test('a line can apply to the job\'s other goods lines only — not itself, a logo or a note (F19)', () => {
  const items = [polo, logo, shirt, hem, note];
  expect(appliesToChoices(items, 3).map(c => c.value)).toEqual(['id:11', 'key:n1']);
  expect(appliesToChoices(items, 3)[0].label).toBe('Line 1 · POLO-M · Polo');
  expect(appliesToChoices(items, 0).map(c => c.value)).toEqual(['key:n1', 'key:n2']);
});

test('a line already applied to another is not offered as a garment', () => {
  const items = [polo, linkLine(hem, 'id:11'), shirt];
  expect(appliesToChoices(items, 2).map(c => c.value)).toEqual(['id:11']);
});

test('linking a line makes it a service: supplied in full, nothing back-ordered', () => {
  const linked = linkLine(hem, 'key:n1');
  expect(linked).toMatchObject({ appliesTo: 'key:n1', supply: 5, bOrd: 0 });
  expect(appliesToValue(linkLine(linked, ''))).toBe('');
});

test('a saved line keeps the link the server holds until it is changed', () => {
  expect(appliesToValue({ ...hem, appliesToItemId: 11 })).toBe('id:11');
  expect(appliesToValue({ ...hem, appliesToItemId: 11, appliesTo: '' })).toBe('');
});

test('on save a saved target is sent by id and an unsaved one by its line (F02, F19)', () => {
  const items = resolveLineLinks([polo, shirt, linkLine(hem, 'key:n1'), linkLine({ ...hem, lineKey: 'n3' }, 'id:11')]);
  expect(items[2]).toMatchObject({ appliesToItemId: null, appliesToLine: 1 });
  expect(items[3]).toMatchObject({ appliesToItemId: 11, appliesToLine: undefined });
  expect(items[0]).toMatchObject({ appliesToItemId: null, appliesToLine: undefined });
  expect('appliesTo' in items[2]).toBe(false);
});

test('a link whose target was removed or became a note is dropped, not sent', () => {
  expect(resolveLineLinks([linkLine(hem, 'key:n1')])[0].appliesToItemId).toBeNull();
  expect(resolveLineLinks([{ ...polo, displayType: 'note' }, { ...hem, appliesToItemId: 11 }])[1]).toMatchObject({ appliesToItemId: null, appliesToLine: undefined });
});

const LOGOS = [
  { id: 4, code: 'EMB.CFG.LHC', name: 'Left chest', decorationType: 'EMB', position: 'L.Chest', stitchCount: 8500, priceEx: 6.5, costEx: 3.2 },
  { id: 5, code: 'SP.CFG.BACK', name: 'Back print', decorationType: 'SP', position: 'Back', stitchCount: null, priceEx: 4, costEx: 0 },
];

test('the stock-code field suggests the customer\'s logos by code or name', () => {
  expect(logoMatches(LOGOS, 'emb.cfg').map(g => g.id)).toEqual([4]);
  expect(logoMatches(LOGOS, 'back').map(g => g.id)).toEqual([5]);
  expect(logoMatches(LOGOS, '')).toEqual([]);
});

test('choosing a logo makes the line that logo, priced as it is and supplied in full', () => {
  const line = applyLogo({ ...hem, description: '' }, LOGOS[0]);
  expect(line).toMatchObject({
    stockCode: 'EMB.CFG.LHC', description: 'Left chest', logoId: 4, decorationType: 'EMB', decCode: 'EMB.CFG.LHC',
    decPosition: 'L.Chest', stitchCount: 8500, priceEx: 6.5, priceInc: 7.15, purchasePrice: 3.2, supply: 5, bOrd: 0, total: 32.5,
  });
});
