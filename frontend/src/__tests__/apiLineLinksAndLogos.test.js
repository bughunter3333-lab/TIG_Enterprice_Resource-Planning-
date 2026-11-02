/**
 * What the job form and the Logos tab send (F02, F19, F09): a line's link to
 * its garment, and a logo edit that names only what changed.
 */
import { afterEach, expect, test, vi } from 'vitest';
import { jobs, logos } from '../api';

const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const sent = (fetchMock) => {
  const [url, init] = fetchMock.mock.calls[0];
  return { url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined };
};

afterEach(() => { vi.unstubAllGlobals(); });

test('a job line names its garment by id when saved, by position when sent with it', async () => {
  const fetchMock = vi.fn(async () => ok({ id: '1', items: [] }));
  vi.stubGlobal('fetch', fetchMock);
  await jobs.update('1', { items: [
    { id: 11, description: 'Polo', appliesToItemId: null },
    { id: 12, description: 'Hem', appliesToItemId: 11 },
    { description: 'Shirt' },
    { description: 'Logo', appliesToItemId: null, appliesToLine: 2 },
  ] });
  const { body } = sent(fetchMock);
  expect(body.items.map(i => [i.applies_to_item_id, i.applies_to_line])).toEqual([[null, undefined], [11, undefined], [null, undefined], [null, 2]]);
});

test('a new job sends the same links', async () => {
  const fetchMock = vi.fn(async () => ok({ id: '1', items: [] }));
  vi.stubGlobal('fetch', fetchMock);
  await jobs.create({ items: [{ description: 'Polo' }, { description: 'Logo', appliesToLine: 0 }] });
  expect(sent(fetchMock).body.items[1]).toMatchObject({ applies_to_item_id: null, applies_to_line: 0 });
});

test('a logo edit is a PATCH of only the fields named', async () => {
  const fetchMock = vi.fn(async () => ok({ id: 4, code: 'EMB.CFG.LHC', is_active: false }));
  vi.stubGlobal('fetch', fetchMock);
  const saved = await logos.update(4, { priceEx: '7', madeBy: 'in_house', supplierId: '', isActive: false });
  expect(sent(fetchMock)).toMatchObject({ method: 'PATCH', body: { price_ex: 7, made_by: 'in_house', supplier_id: null, is_active: false } });
  expect(Object.keys(sent(fetchMock).body)).not.toContain('stitch_count');
  expect(saved.isActive).toBe(false);
});

test('the logo list asks for inactive logos only when told to', async () => {
  const fetchMock = vi.fn(async () => ok([]));
  vi.stubGlobal('fetch', fetchMock);
  await logos.list('CFG');
  await logos.list('CFG', { includeInactive: true });
  expect(fetchMock.mock.calls[0][0]).toMatch(/\/logos\?customer_id=CFG$/);
  expect(fetchMock.mock.calls[1][0]).toMatch(/\/logos\?customer_id=CFG&include_inactive=true$/);
});
