import { T, statusColor } from '../tokens';
import { parseD } from '../dates';

test('statusColor maps every real job status and falls back for unknown', () => {
  for (const s of ['QUOTE','New','ORDER','In Progress','PROOF','PRINT','Pick/Pack','FINISH','INVOICE','PAID','CANCEL']) {
    expect(statusColor(s)).toMatch(/^#[0-9a-f]{6}$/i);
  }
  expect(statusColor('NO_SUCH_STATUS')).toBe(T.textMuted);
});

test('parseD parses DD/MM/YYYY and rejects empty', () => {
  const d = parseD('25/03/2026');
  expect(d.getFullYear()).toBe(2026);
  expect(d.getMonth()).toBe(2);
  expect(d.getDate()).toBe(25);
  expect(parseD('')).toBeNull();
  expect(parseD(null)).toBeNull();
});
