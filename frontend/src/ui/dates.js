// DD/MM/YYYY parser — copy of the monolith's parseD (TotalImageERP.jsx:22).
// The monolith keeps its own copy until Phase 3 consolidation.
export const parseD = (str) => {
  if (!str) return null;
  const s = String(str).split(' ')[0];
  const p = s.split('/');
  return p.length === 3 ? new Date(`${p[2]}-${p[1]}-${p[0]}`) : new Date(s);
};
