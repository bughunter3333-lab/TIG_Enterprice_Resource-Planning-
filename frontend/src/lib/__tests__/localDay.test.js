/**
 * A day on the screen is the browser's own day.
 *
 * `toISOString().slice(0, 10)` is UTC's day. In Sydney that is yesterday until
 * 10 or 11 in the morning, and a date built for local midnight is the day
 * before all day long. Reports ended "today" without this morning's invoices,
 * a due date from terms came a day early, and a supplier payment was sent
 * dated yesterday. This machine's tests cannot see it in CI, which runs in
 * UTC, so the scan below keeps the pattern out of the source.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
import { isoDay } from '../dates';
import { localDay } from '../localDay';

test('today and days from it are local days', () => {
  const now = new Date();
  expect(localDay()).toBe(isoDay(now));
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  expect(localDay(1)).toBe(isoDay(tomorrow));
});

const SRC = path.resolve(__dirname, '../..');
const UTC_DAY = /toISOString\(\)\s*\.\s*(?:slice\(\s*0\s*,\s*10\s*\)|substring\(\s*0\s*,\s*10\s*\)|split\(\s*['"]T['"]\s*\)\s*\[\s*0\s*\])/;

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return /\.(jsx?|tsx?)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
  });
}

test('no screen takes its day from UTC', () => {
  const found = sourceFiles(SRC).flatMap((file) =>
    fs.readFileSync(file, 'utf8').split('\n').flatMap((line, i) =>
      UTC_DAY.test(line) && !line.trim().startsWith('*') ? [`${path.relative(SRC, file)}:${i + 1}: ${line.trim()}`] : [],
    ),
  );
  expect(found, 'Use localDay() (lib/localDay) or isoDay(date) (lib/dates)').toEqual([]);
});
