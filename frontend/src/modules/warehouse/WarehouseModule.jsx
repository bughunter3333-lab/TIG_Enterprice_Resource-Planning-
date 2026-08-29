import { useState } from 'react';
import { Download, Layers, Package, Search, Tag, Warehouse, X } from 'lucide-react';
import { T } from '../../ui/tokens';
import { WAREHOUSE_ZONES } from './zones';

export default function WarehouseModule({ exportToCSV, inventory, searchTerm, setSearchTerm }) {
  const [selectedBin, setSelectedBin] = useState(null);
  const [selectedWarehouseZone, setSelectedWarehouseZone] = useState('A');

  // Build bin occupancy map from inventory location field (format: Zone-Bay-Level, e.g. "A-05-3")
  const binMap = {};
  inventory.forEach(item => {
    if (item.location) {
      if (!binMap[item.location]) binMap[item.location] = [];
      binMap[item.location].push(item);
    }
  });

  const zone = WAREHOUSE_ZONES.find(z => z.zone === selectedWarehouseZone) || WAREHOUSE_ZONES[0];
  const bays = Array.from({ length: zone.bays }, (_, i) => String(i + 1).padStart(2, '0'));
  const levels = Array.from({ length: zone.rows }, (_, i) => zone.rows - i);

  const getBinCode = (bay, level) => `${selectedWarehouseZone}-${bay}-${level}`;
  const getBinStatus = (binCode) => {
    const items = binMap[binCode] || [];
    if (items.length === 0) return 'empty';
    if (items.some(i => i.stock < i.reorderLevel)) return 'low';
    return 'occupied';
  };

  const zoneItems = inventory.filter(i => i.location && i.location.startsWith(selectedWarehouseZone + '-'));
  const totalOccupied = bays.length * levels.length - bays.reduce((acc, bay) =>
    acc + levels.filter(lvl => getBinStatus(getBinCode(bay, lvl)) === 'empty').length, 0);

  return (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <h2 className="text-2xl font-bold flex items-center" style={{ color: T.text }}>
        <Warehouse className="w-6 h-6 mr-2" style={{ color: T.accentStrong }} />
        Live Warehouse — Bin Location Map
      </h2>
      <div className="flex space-x-2">
        <button
          onClick={() => exportToCSV(zoneItems, `warehouse-zone-${selectedWarehouseZone}`)}
          className="px-4 py-2 rounded-lg flex items-center text-sm font-medium"
          style={{ background: T.hairlineSoft, color: T.text, border: `1px solid ${T.hairline}` }}
        >
          <Download className="w-4 h-4 mr-2" />Export Zone {selectedWarehouseZone}
        </button>
      </div>
    </div>

    {/* Zone selector cards */}
    <div className="grid grid-cols-4 gap-4">
      {WAREHOUSE_ZONES.map(z => (
        <button
          key={z.zone}
          onClick={() => { setSelectedWarehouseZone(z.zone); setSelectedBin(null); }}
          className="rounded-lg p-4 text-left transition-all hover:shadow-md"
          style={{
            background: T.panel,
            border: `1px solid ${T.hairline}`,
            outline: selectedWarehouseZone === z.zone ? `2px solid ${T.accentStrong}` : 'none',
            outlineOffset: 2,
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xl font-bold" style={{ color: T.text }}>Zone {z.zone}</span>
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${z.utilization > 80 ? 'bg-red-100 text-red-700' : z.utilization > 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
              {z.utilization}%
            </span>
          </div>
          <p className="text-xs mb-2" style={{ color: T.textMuted }}>{z.description}</p>
          <div className="w-full rounded-full h-1.5" style={{ background: T.hairline }}>
            <div className={`h-1.5 rounded-full ${z.utilization > 80 ? 'bg-red-500' : z.utilization > 60 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${z.utilization}%` }} />
          </div>
          <p className="text-xs mt-1" style={{ color: T.textFaint }}>{z.rows}×{z.bays} grid • {z.items} items</p>
        </button>
      ))}
    </div>

    <div className="grid grid-cols-3 gap-4">
      {/* Rack bin map */}
      <div className="col-span-2 rounded-lg p-4" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center text-sm" style={{ color: T.text }}>
            <Layers className="w-4 h-4 mr-2" style={{ color: T.accentStrong }} />
            Zone {selectedWarehouseZone} — {zone.description}
            <span className="ml-2 text-xs font-normal" style={{ color: T.textFaint }}>{zone.bays} bays × {zone.rows} levels</span>
          </h3>
          <div className="flex items-center space-x-3 text-xs" style={{ color: T.textMuted }}>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: T.hairlineSoft, border: `1px solid ${T.hairline}` }}></span>Empty</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-100 border border-blue-300 inline-block"></span>Occupied</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-100 border border-red-300 inline-block"></span>Low Stock</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-100 border border-green-400 inline-block ring-2 ring-green-400"></span>Selected</span>
          </div>
        </div>

        {/* Visual rack grid — levels top to bottom, bays left to right */}
        <div className="overflow-auto rounded-lg p-3" style={{ maxHeight: '520px', background: T.hairlineSoft, border: `1px solid ${T.hairline}` }}>
          <table className="border-collapse mx-auto">
            <thead>
              <tr>
                <th className="w-7 text-right pr-2 text-xs font-normal pb-1" style={{ color: T.textFaint }}>Lvl</th>
                {bays.map(bay => (
                  <th key={bay} className="text-center text-xs font-normal pb-1 px-0.5" style={{ minWidth: '72px', color: T.textMuted }}>
                    Bay {bay}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {levels.map(level => (
                <tr key={level}>
                  <td className="text-right pr-2 text-xs font-mono align-middle py-0.5" style={{ color: T.textFaint }}>{level}</td>
                  {bays.map(bay => {
                    const binCode = getBinCode(bay, level);
                    const items = binMap[binCode] || [];
                    const status = getBinStatus(binCode);
                    const isSelected = selectedBin === binCode;
                    return (
                      <td key={bay} className="px-0.5 py-0.5">
                        <button
                          onClick={() => setSelectedBin(isSelected ? null : binCode)}
                          title={`${binCode}${items.length ? ': ' + items.map(i => i.name).join(', ') : ': Empty'}`}
                          className={`w-full rounded border text-center transition-all hover:scale-105 flex flex-col items-center justify-center px-1 py-1.5 ${
                              isSelected ? 'ring-2 ring-green-400 bg-green-50 border-green-400' :
                              status === 'low' ? 'bg-red-50 border-red-300 hover:bg-red-100' :
                              status === 'occupied' ? 'bg-blue-50 border-blue-200 hover:bg-blue-100' :
                              'bg-gray-100 border-gray-200 hover:bg-white'
                            }`}
                        >
                          <span className={`font-mono leading-none ${isSelected ? 'text-green-700' : status === 'low' ? 'text-red-600' : status === 'occupied' ? 'text-amber-700' : 'text-gray-400'}`} style={{ fontSize: '9px' }}>
                            {binCode}
                          </span>
                          {items.length > 0 && (
                            <span className={`font-semibold mt-0.5 ${status === 'low' ? 'text-red-700' : 'text-amber-700'}`} style={{ fontSize: '10px' }}>
                              {items.reduce((s, i) => s + i.stock, 0)} pcs
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Aisle indicator */}
              <tr>
                <td colSpan={zone.bays + 1} className="pt-2 pb-1">
                  <div className="bg-yellow-200 border border-yellow-400 rounded text-center text-xs text-yellow-800 font-medium py-1 tracking-widest">
                    ▼  AISLE  ▼
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Selected bin detail */}
        {selectedBin && (
          <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${T.hairline}` }}>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-sm flex items-center" style={{ color: T.text }}>
                <Tag className="w-4 h-4 mr-1.5" style={{ color: T.accentStrong }} />
                Bin: <span className="font-mono ml-1" style={{ color: T.accentStrong }}>{selectedBin}</span>
              </h4>
              <button onClick={() => setSelectedBin(null)} style={{ color: T.textFaint }}><X className="w-4 h-4" /></button>
            </div>
            {(binMap[selectedBin] || []).length === 0 ? (
              <div className="rounded p-3 text-center" style={{ background: T.hairlineSoft }}>
                <p className="text-sm" style={{ color: T.textFaint }}>Empty bin — available for stock</p>
              </div>
            ) : (
              <div className="space-y-1">
                {(binMap[selectedBin] || []).map(item => (
                  <div key={item.sku} className="flex items-center justify-between rounded p-2" style={{ background: T.hairlineSoft }}>
                    <div>
                      <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ color: T.textMuted, background: T.hairline }}>{item.sku}</span>
                      <span className="text-sm ml-2" style={{ color: T.text }}>{item.name}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm">
                      <span className={`font-semibold ${item.stock < item.reorderLevel ? 'text-red-600' : 'text-green-600'}`}>
                        Qty: {item.stock}
                      </span>
                      {item.stock < item.reorderLevel && (
                        <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-xs">Low</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Occupancy summary */}
        <div className="mt-3 pt-3 flex items-center justify-between text-xs" style={{ borderTop: `1px solid ${T.hairline}`, color: T.textMuted }}>
          <span>Zone {selectedWarehouseZone}: {totalOccupied} of {bays.length * levels.length} bins occupied</span>
          <span>{zoneItems.filter(i => i.stock < i.reorderLevel).length} items low stock in this zone</span>
        </div>
      </div>

      {/* Zone inventory sidebar */}
      <div className="rounded-lg p-4 flex flex-col" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
        <h3 className="font-semibold mb-3 text-sm flex items-center" style={{ color: T.text }}>
          <Package className="w-4 h-4 mr-2" style={{ color: T.textMuted }} />
          Zone {selectedWarehouseZone} Stock
          <span className="ml-1 px-1.5 py-0.5 rounded text-xs" style={{ background: T.accentTint, color: T.accentStrong }}>{zoneItems.length} SKUs</span>
        </h3>
        <div className="relative mb-3">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5" style={{ color: T.textFaint }} />
          <input
            type="text"
            placeholder="Find item..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{ border: `1px solid ${T.hairline}`, color: T.text }}
          />
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto" style={{ maxHeight: '560px' }}>
          {zoneItems
            .filter(i => !searchTerm || i.name.toLowerCase().includes(searchTerm.toLowerCase()) || i.sku.toLowerCase().includes(searchTerm.toLowerCase()))
            .sort((a, b) => (a.location || '').localeCompare(b.location || ''))
            .map(item => (
              <div
                key={item.sku}
                onClick={() => setSelectedBin(item.location)}
                className="p-2 rounded cursor-pointer transition-colors"
                style={{
                  border: `1px solid ${selectedBin === item.location ? '#86efac' : 'transparent'}`,
                  background: selectedBin === item.location ? '#f0fdf4' : T.panel,
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: T.accentTint, color: T.accentStrong }}>{item.location}</span>
                  <span className={`text-xs font-semibold ${item.stock < item.reorderLevel ? 'text-red-600' : 'text-green-600'}`}>
                    {item.stock} {item.stock < item.reorderLevel ? '⚠' : ''}
                  </span>
                </div>
                <p className="text-xs font-medium truncate mt-1" style={{ color: T.text }}>{item.name}</p>
                <p className="text-xs" style={{ color: T.textFaint }}>{item.sku} • {item.category}</p>
              </div>
            ))}
          {zoneItems.length === 0 && (
            <div className="text-center py-10" style={{ color: T.textFaint }}>
              <Warehouse className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No items in Zone {selectedWarehouseZone}.</p>
              <p className="text-xs mt-1">Set inventory location to "{selectedWarehouseZone}-bay-level"</p>
              <p className="text-xs mt-0.5" style={{ color: T.accentStrong }}>e.g. "{selectedWarehouseZone}-01-1"</p>
            </div>
          )}
        </div>
      </div>
    </div>

  </div>
  );
}
