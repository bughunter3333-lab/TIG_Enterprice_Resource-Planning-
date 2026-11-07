import { T, statusColor } from '../tokens';
import { parseD } from '../dates';

test('statusColor maps every real job status and falls back for unknown', () => {
  for (const s of ['QUOTE','New','ORDER','In Progress','PROOF','Picked','Inco/Pick','PRINT','ProdExt','Pick/Pack','Desp/Ready','FINISH','Ready','INVOICE','PAID','CANCEL']) {
    expect(statusColor(s)).toMatch(/^#[0-9a-f]{6}$/i);
  }
  expect(statusColor('NO_SUCH_STATUS')).toBe(T.textMuted);
});

test("TIG's FINISH reads green when gone, red when ready to invoice, and invoiced is neither", () => {
  // Owner decision 2026-11-07: match Jim2.
  expect(statusColor('FINISH')).toBe(T.ok);
  expect(statusColor('Ready')).toBe(T.danger);
  expect(new Set([statusColor('FINISH'), statusColor('Ready'), statusColor('INVOICE')]).size).toBe(3);
});

test('parseD parses DD/MM/YYYY and rejects empty', () => {
  const d = parseD('25/03/2026');
  expect(d.getFullYear()).toBe(2026);
  expect(d.getMonth()).toBe(2);
  expect(d.getDate()).toBe(25);
  expect(parseD('')).toBeNull();
  expect(parseD(null)).toBeNull();
});
