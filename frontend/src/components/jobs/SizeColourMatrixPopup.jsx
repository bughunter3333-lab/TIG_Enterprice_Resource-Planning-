import { useState } from 'react';
import { X } from 'lucide-react';

const DEFAULT_SIZES = ['XS','S','M','L','XL','2XL','3XL'];
const SIZE_PRESETS = ['4XS','3XS','2XS','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'];
const COLOUR_PRESETS = ['Black','White','Navy','Red','Royal Blue','Grey','Green','Maroon','Gold','Sky'];

export default function SizeColourMatrixPopup({ current, onApply, onClose }) {
  const [sizes, setSizes] = useState(DEFAULT_SIZES);
  const [colours, setColours] = useState([]);
  const [useColours, setUseColours] = useState(false);
  const [matrix, setMatrix] = useState({});
  const [newSize, setNewSize] = useState('');
  const [newColour, setNewColour] = useState('');

  const rows = useColours ? colours : [''];
  const getQty = (c, sz) => parseInt(matrix[`${c}::${sz}`] || 0) || 0;
  const setQty = (c, sz, val) => setMatrix(m => ({ ...m, [`${c}::${sz}`]: Math.max(0, parseInt(val) || 0) }));
  const totalBySize = (sz) => rows.reduce((s, c) => s + getQty(c, sz), 0);
  const totalByColour = (c) => sizes.reduce((s, sz) => s + getQty(c, sz), 0);
  const grandTotal = sizes.reduce((s, sz) => s + totalBySize(sz), 0);

  const handleApply = () => {
    let lines = [];
    if (useColours) {
      colours.forEach(c => {
        const parts = sizes.map(sz => getQty(c, sz) > 0 ? `${sz}×${getQty(c, sz)}` : null).filter(Boolean);
        if (parts.length) lines.push(`${c}: ${parts.join('  ')}`);
      });
    } else {
      const parts = sizes.map(sz => getQty('', sz) > 0 ? `${sz}×${getQty('', sz)}` : null).filter(Boolean);
      if (parts.length) lines.push(parts.join('  '));
    }
    onApply(lines.join('\n'), grandTotal);
  };

  const addSize = (s) => { if (!sizes.includes(s)) setSizes(ss => [...ss, s]); };
  const addColour = (c) => { if (c && !colours.includes(c)) setColours(cs => [...cs, c]); };

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-fg">Size / Colour Matrix</h3>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer select-none">
              <input type="checkbox" checked={useColours} onChange={e => { setUseColours(e.target.checked); if (e.target.checked && colours.length === 0) setColours(['Black','White']); }} className="rounded" />
              Track by colour
            </label>
            <button onClick={onClose}><X className="w-4 h-4 text-faint hover:text-muted" /></button>
          </div>
        </div>

        <div className="overflow-x-auto mb-3">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                {useColours && <th className="px-3 py-1.5 bg-panel-alt border border-hairline font-semibold text-muted text-left min-w-24">Colour</th>}
                {sizes.map(sz => (
                  <th key={sz} className="px-2 py-1.5 bg-panel-alt border border-hairline font-bold text-header text-center min-w-14">
                    <div className="flex items-center justify-between gap-1">
                      <span>{sz}</span>
                      <button onClick={() => setSizes(ss => ss.filter(s => s !== sz))} className="text-faint hover:text-danger leading-none">×</button>
                    </div>
                  </th>
                ))}
                <th className="px-2 py-1.5 bg-accent-tint border border-hairline font-bold text-accent-strong text-center">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((colour) => (
                <tr key={colour || 'none'}>
                  {useColours && (
                    <td className="px-3 py-1 border border-hairline bg-panel-alt font-medium text-header flex items-center gap-1">
                      <span className="flex-1">{colour}</span>
                      <button onClick={() => setColours(cs => cs.filter(c => c !== colour))} className="text-faint hover:text-danger text-xs leading-none">×</button>
                    </td>
                  )}
                  {sizes.map(sz => (
                    <td key={sz} className="border border-hairline p-0.5">
                      <input type="number" min="0" value={getQty(colour, sz) || ''}
                        onChange={e => setQty(colour, sz, e.target.value)}
                        className="w-full text-center text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent-focus rounded px-1 py-0.5" />
                    </td>
                  ))}
                  <td className="px-2 py-1 border border-accent bg-accent-tint text-center font-bold text-accent-strong">
                    {totalByColour(colour) || <span className="text-faint">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                {useColours && <td className="px-3 py-1 border border-hairline bg-accent-tint font-bold text-accent-strong">Total</td>}
                {sizes.map(sz => (
                  <td key={sz} className="px-2 py-1 border border-hairline bg-accent-tint text-center font-bold text-accent-strong">
                    {totalBySize(sz) || <span className="text-faint">—</span>}
                  </td>
                ))}
                <td className="px-2 py-1 border border-accent bg-accent-tint text-center font-bold text-accent-strong text-sm">{grandTotal}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-muted font-medium">Add size:</span>
            {SIZE_PRESETS.filter(s => !sizes.includes(s)).slice(0, 8).map(s => (
              <button key={s} onClick={() => addSize(s)} className="px-2 py-0.5 border border-hairline rounded hover:bg-hairline-soft">{s}</button>
            ))}
            <input value={newSize} onChange={e => setNewSize(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newSize.trim()) { addSize(newSize.trim()); setNewSize(''); }}}
              placeholder="Custom…" className="w-20 border rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-accent-focus" />
          </div>
          {useColours && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-muted font-medium">Add colour:</span>
              {COLOUR_PRESETS.filter(c => !colours.includes(c)).slice(0, 6).map(c => (
                <button key={c} onClick={() => addColour(c)} className="px-2 py-0.5 border border-hairline rounded hover:bg-hairline-soft">{c}</button>
              ))}
              <input value={newColour} onChange={e => setNewColour(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newColour.trim()) { addColour(newColour.trim()); setNewColour(''); }}}
                placeholder="Custom…" className="w-20 border rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-accent-focus" />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-hairline-soft">
          <span className="text-sm text-muted">Grand total: <span className="font-bold text-fg text-base">{grandTotal} pcs</span></span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm text-header hover:bg-panel-alt">Cancel</button>
            <button onClick={handleApply} className="px-5 py-2 bg-accent-strong text-white rounded-lg text-sm font-semibold hover:bg-accent-strong">
              Apply{grandTotal > 0 ? ` (${grandTotal} pcs)` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
