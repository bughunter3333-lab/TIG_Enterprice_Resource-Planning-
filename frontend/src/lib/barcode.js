/**
 * Code 128-B, rendered as SVG bar widths.
 *
 * Written rather than pulled in because it is small, it has no options worth
 * configuring, and a consignment note without a scannable number is a piece of
 * paper someone has to type from. Subset B only: that covers the full printable
 * ASCII range, which is every job number, connote and reference this system
 * produces. Subset C would pack pairs of digits more tightly, and the extra
 * density is not worth a second code path here.
 *
 * Returns bar widths in modules. The caller decides how wide a module is, which
 * is what lets the same number print on a 100mm label and an A4 connote.
 */

// The 107 Code 128 patterns, as bar/space widths. Index is the code value.
// Every pattern is six elements summing to 11 modules except the stop, which
// is seven summing to 13: it carries an extra bar so a scanner can tell the
// end of a symbol from the start of another.
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232', '2331112',
];

const START_B = 104;
const STOP = 106;

/**
 * @param {string} value text to encode; characters outside printable ASCII are dropped
 * @returns {{widths: number[], modules: number}|null} null when there is nothing to encode
 */
export function code128b(value) {
  const text = String(value ?? '').replace(/[^\x20-\x7e]/g, '');
  if (!text) return null;

  const codes = [START_B];
  for (const ch of text) codes.push(ch.charCodeAt(0) - 32);

  // Checksum: start value plus each code times its one-based position, mod 103.
  let sum = START_B;
  for (let i = 1; i < codes.length; i++) sum += codes[i] * i;
  codes.push(sum % 103, STOP);

  const widths = [];
  for (const c of codes) for (const d of PATTERNS[c]) widths.push(Number(d));

  return { widths, modules: widths.reduce((a, b) => a + b, 0) };
}

/**
 * Bars as {x, width} in modules, ready to draw. Even indices are bars, odd are
 * spaces, which is the Code 128 convention.
 */
export function barcodeBars(value) {
  const encoded = code128b(value);
  if (!encoded) return null;
  const bars = [];
  let x = 0;
  encoded.widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x, width: w });
    x += w;
  });
  return { bars, modules: encoded.modules };
}
