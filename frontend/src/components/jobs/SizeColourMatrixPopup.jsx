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
          <h3 className="font-bold text-gray-800">Size / Colour Matrix</h3>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
              <input type="checkbox" checked={useColours} onChange={e => { setUseColours(e.target.checked); if (e.target.checked && colours.length === 0) setColours(['Black','White']); }} className="rounded" />
              Track by colour
            </label>
            <button onClick={onClose}><X className="w-4 h-4 text-gray-400 hover:text-gray-600" /></button>
          </div>
        </div>

        <div className="overflow-x-auto mb-3">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                {useColours && <th className="px-3 py-1.5 bg-gray-50 border border-gray-200 font-semibold text-gray-600 text-left min-w-24">Colour</th>}
                {sizes.map(sz => (
                  <th key={sz} className="px-2 py-1.5 bg-gray-50 border border-gray-200 font-bold text-gray-700 text-center min-w-14">
                    <div className="flex items-center justify-between gap-1">
                      <span>{sz}</span>
                      <button onClick={() => setSizes(ss => ss.filter(s => s !== sz))} className="text-gray-300 hover:text-red-400 leading-none">×</button>
                    </div>
                  </th>
                ))}
                <th className="px-2 py-1.5 bg-indigo-50 border border-gray-200 font-bold text-indigo-600 text-center">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((colour) => (
                <tr key={colour || 'none'}>
                  {useColours && (
                    <td className="px-3 py-1 border border-gray-200 bg-gray-50 font-medium text-gray-700 flex items-center gap-1">
                      <span className="flex-1">{colour}</span>
                      <button onClick={() => setColours(cs => cs.filter(c => c !== colour))} className="text-gray-300 hover:text-red-400 text-xs leading-none">×</button>
                    </td>
                  )}
                  {sizes.map(sz => (
                    <td key={sz} className="border border-gray-200 p-0.5">
                      <input type="number" min="0" value={getQty(colour, sz) || ''}
                        onChange={e => setQty(colour, sz, e.target.value)}
                        className="w-full text-center text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-0.5" />
                    </td>
                  ))}
                  <td className="px-2 py-1 border border-indigo-100 bg-indigo-50 text-center font-bold text-indigo-600">
                    {totalByColour(colour) || <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                {useColours && <td className="px-3 py-1 border border-gray-200 bg-indigo-50 font-bold text-indigo-700">Total</td>}
                {sizes.map(sz => (
                  <td key={sz} className="px-2 py-1 border border-gray-200 bg-indigo-50 text-center font-bold text-indigo-700">
                    {totalBySize(sz) || <span className="text-gray-300">—</span>}
                  </td>
                ))}
                <td className="px-2 py-1 border border-indigo-200 bg-indigo-100 text-center font-bold text-indigo-900 text-sm">{grandTotal}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-gray-500 font-medium">Add size:</span>
            {SIZE_PRESETS.filter(s => !sizes.includes(s)).slice(0, 8).map(s => (
              <button key={s} onClick={() => addSize(s)} className="px-2 py-0.5 border border-gray-300 rounded hover:bg-gray-100">{s}</button>
            ))}
            <input value={newSize} onChange={e => setNewSize(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newSize.trim()) { addSize(newSize.trim()); setNewSize(''); }}}
              placeholder="Custom…" className="w-20 border rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          {useColours && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-gray-500 font-medium">Add colour:</span>
              {COLOUR_PRESETS.filter(c => !colours.includes(c)).slice(0, 6).map(c => (
                <button key={c} onClick={() => addColour(c)} className="px-2 py-0.5 border border-gray-300 rounded hover:bg-gray-100">{c}</button>
              ))}
              <input value={newColour} onChange={e => setNewColour(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newColour.trim()) { addColour(newColour.trim()); setNewColour(''); }}}
                placeholder="Custom…" className="w-20 border rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
          <span className="text-sm text-gray-600">Grand total: <span className="font-bold text-gray-900 text-base">{grandTotal} pcs</span></span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
            <button onClick={handleApply} className="px-5 py-2 bg-blue-800 text-white rounded-lg text-sm font-semibold hover:bg-blue-800">
              Apply{grandTotal > 0 ? ` (${grandTotal} pcs)` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
