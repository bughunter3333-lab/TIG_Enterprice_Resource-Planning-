/**
 * The monolith must at least resolve.
 *
 * `TotalImageERP.jsx` is the file that runs the business and nothing imports it
 * in a test, so it is the one file where a mistake is invisible until someone
 * opens the screen.
 *
 * Be clear about what this does and does not buy. It catches a syntax error, a
 * bad module path, and a circular import. It does NOT catch a name used inside
 * a component that was never imported — that reference only evaluates when the
 * component renders, and `npm run build` misses it too, because esbuild happily
 * emits a reference to a name that does not exist. That gap is real and was hit
 * during this work; catching it needs an ESLint `no-undef` pass, which is in
 * docs/backlog.md.
 */
import { expect, test, vi } from 'vitest';

test('TotalImageERP resolves every module it imports', async () => {
  vi.mock('../api', () => ({
    jobs: {}, inventory: {}, customers: {}, suppliers: {}, purchaseOrders: {},
    reports: {}, auth: {}, settings: {}, stock: {}, cardFiles: {}, shipTos: {},
    savedLists: {}, dispatchSessions: {}, goodsReceipts: {}, styles: {},
    supplierBills: {}, openFreight: {}, ai: {}, admin: {}, emails: {},
  }));

  const module = await import('../TotalImageERP');
  expect(typeof module.default).toBe('function');
  // Generous: ~9,800 lines, pulling in every module the app has.
}, 30000);
