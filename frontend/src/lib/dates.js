// Parses the app's dd/mm/yyyy display format back to a Date. Returns null
// rather than an Invalid Date, so callers can test it without isNaN.
export const parseD = (str) => { if (!str) return null; const s = str.split(' ')[0]; const p = s.split('/'); return p.length === 3 ? new Date(`${p[2]}-${p[1]}-${p[0]}`) : new Date(s); };
