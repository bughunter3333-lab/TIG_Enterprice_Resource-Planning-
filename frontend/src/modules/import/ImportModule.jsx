import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, Download, FileSpreadsheet, FileText, Package, RefreshCw, Truck, Users } from 'lucide-react';
import { notify } from '../../lib/notify';
import { T } from '../../ui/tokens';
import * as api from '../../api';

/**
 * Data import — the CSV/spreadsheet loader for customers, stock, suppliers and
 * jobs.
 *
 * Lifted out of TotalImageERP.jsx, and its state came with it. All four pieces
 * (files, previews, results, per-file loading) were read by this surface and
 * nowhere else, so threading them back in as eight props would have moved the
 * markup while leaving the coupling exactly where it was. Moved down instead,
 * which is why this takes no props at all.
 *
 * The ribbon above it still lives in the shell; only the body is here.
 */
export default function ImportModule() {
  const queryClient = useQueryClient();
  const [importFiles, setImportFiles] = useState({});
  const [importResults, setImportResults] = useState({});
  const [importLoading, setImportLoading] = useState({});
  const [importPreviews, setImportPreviews] = useState({});

  const ENTITIES = [
    {
      key: 'customers',
      label: 'Customers',
      icon: Users,
      color: 'blue',
      fields: 'id / Card Code / Cust#, name, contact, email, phone, mobile, address, abn, account_type, payment_terms, credit_limit, account_manager',
      description: 'Import customer accounts. Jim2: export CardFile list — Card Code, Acc. Mgr are auto-mapped.',
      jim2hint: 'Jim2 → CardFile List → Export Grid',
    },
    {
      key: 'suppliers',
      label: 'Suppliers',
      icon: Truck,
      color: 'green',
      fields: 'id / Vend#, name, contact, email, phone, address, payment_terms, currency',
      description: 'Import supplier/vendor records. Jim2: export Vendor CardFile list.',
      jim2hint: 'Jim2 → Vendor CardFile → Export Grid',
    },
    {
      key: 'inventory',
      label: 'Inventory / Stock',
      icon: Package,
      color: 'purple',
      fields: 'Stock Code / sku, ShortDesc / name, StockGroup1 / category, On Hand / stock, Cost Price / unit_cost, RRPInc / sell_price, location',
      description: 'Import stock items. Jim2: Stock Code, ShortDesc, On Hand, Cost Price, RRPInc are all recognised.',
      jim2hint: 'Jim2 → Stock List → Export Grid',
    },
    {
      key: 'jobs',
      label: 'Jobs / Orders',
      icon: FileText,
      color: 'orange',
      fields: 'Job#, Cust#, Status, Inv#, Date In, Date Due, Ship#, Cust Ref#, OurRef, Item Desc, Name/Contact, Total Ex., Tax, Total Inc., Invoice Paid $, Balance Due $, Acc. Mgr',
      description: 'Paste Jim2 Job List export directly — all Jim2 column names are recognised automatically.',
      jim2hint: 'Jim2 → Job List → Export Grid (any columns)',
    },
    {
      key: 'card-files',
      label: 'Card Files (Ship Addresses)',
      icon: BookOpen,
      color: 'teal',
      fields: 'ship_code / Card Code, customer_code / Cust#, company_name / Name, contact_name, address1, suburb, state, postcode, phone, email',
      description: 'Import ship-to delivery addresses. Jim2: export CardFile list filtered to Ship# cards.',
      jim2hint: 'Jim2 → CardFile List (filter Ship# type) → Export Grid',
    },
  ];

  const colorMap = {
    blue:   { card: 'border-blue-200 bg-blue-50',     badge: 'bg-blue-100 text-blue-800',     btn: 'bg-blue-700 hover:bg-blue-800',     icon: 'text-blue-800' },
    green:  { card: 'border-green-200 bg-green-50',   badge: 'bg-green-100 text-green-700',   btn: 'bg-green-600 hover:bg-green-700',   icon: 'text-green-600' },
    purple: { card: 'border-purple-200 bg-purple-50', badge: 'bg-purple-100 text-purple-700', btn: 'bg-purple-600 hover:bg-purple-700', icon: 'text-purple-600' },
    orange: { card: 'border-indigo-200 bg-indigo-50', badge: 'bg-indigo-100 text-indigo-700', btn: 'bg-indigo-600 hover:bg-indigo-700', icon: 'text-indigo-600' },
    teal:   { card: 'border-teal-200 bg-teal-50',     badge: 'bg-teal-100 text-teal-700',     btn: 'bg-teal-600 hover:bg-teal-700',     icon: 'text-teal-600' },
  };

  const handleFileSelect = async (key, file) => {
    if (!file) return;
    setImportFiles(f => ({ ...f, [key]: file }));
    setImportResults(r => ({ ...r, [key]: null }));
    try {
      const preview = await api.importData.preview(file);
      setImportPreviews(p => ({ ...p, [key]: preview }));
    } catch (e) {
      notify(`Could not read ${file.name}: ${e?.message || 'preview failed'}`, { type: 'error' });
    }
  };

  const handleImport = async (key) => {
    const file = importFiles[key];
    if (!file) return;
    setImportLoading(l => ({ ...l, [key]: true }));
    setImportResults(r => ({ ...r, [key]: null }));
    try {
      const apiKey = key.replace('-', '');  // 'card-files' → 'cardfiles' won't work; handle explicitly
      let result;
      if (key === 'card-files') {
        result = await api.importData.cardFiles(file);
      } else {
        result = await api.importData[key](file);
      }
      setImportResults(r => ({ ...r, [key]: { ...result, ok: true } }));
      // Refresh the affected data via React Query cache invalidation
      if (key === 'customers') queryClient.invalidateQueries({ queryKey: ['customers'] });
      if (key === 'suppliers') queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      if (key === 'inventory') queryClient.invalidateQueries({ queryKey: ['inventory'] });
      if (key === 'jobs') queryClient.invalidateQueries({ queryKey: ['jobs'] });
      if (key === 'card-files') queryClient.invalidateQueries({ queryKey: ['cardFiles'] });
    } catch (e) {
      setImportResults(r => ({ ...r, [key]: { ok: false, error: e.message } }));
    } finally {
      setImportLoading(l => ({ ...l, [key]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center" style={{ color: T.text }}>
            <FileSpreadsheet className="w-6 h-6 mr-2" style={{ color: T.accentStrong }} />
            Import Data
          </h2>
          <p className="text-sm mt-1" style={{ color: T.textMuted }}>Upload CSV files from your previous ERP to migrate data into this system.</p>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
        <p className="font-semibold mb-1">How it works</p>
        <ol className="list-decimal list-inside space-y-1 text-blue-800">
          <li>Download the CSV template for the data type you want to import.</li>
          <li>Fill it in with your existing data (or export from your old ERP and use the flexible column matching — most common column names are recognised automatically).</li>
          <li>Upload the file below and click <strong>Import</strong>.</li>
          <li>Existing records with the same ID will be <strong>updated</strong>. New records will be <strong>inserted</strong>.</li>
        </ol>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {ENTITIES.map(entity => {
          const Icon = entity.icon;
          const c = colorMap[entity.color];
          const preview = importPreviews[entity.key];
          const result = importResults[entity.key];
          const isLoading = importLoading[entity.key];
          const file = importFiles[entity.key];

          return (
            <div key={entity.key} className="rounded-xl overflow-hidden"
              style={{ background: T.panel, border: `2px solid ${result?.ok ? '#86efac' : T.hairline}` }}>
              {/* Card header — specialty colour kept per entity identity */}
              <div className={`px-5 py-4 border-b flex items-center justify-between ${c.card}`}>
                <div className="flex items-center space-x-3">
                  <Icon className={`w-5 h-5 ${c.icon}`} />
                  <div>
                    <h3 className="font-semibold" style={{ color: T.text }}>{entity.label}</h3>
                    <p className="text-xs" style={{ color: T.textMuted }}>{entity.description}</p>
                  </div>
                </div>
                <a
                  href={api.importData.templateUrl(entity.key)}
                  download
                  className={`flex items-center text-xs px-3 py-1.5 rounded-lg text-white ${c.btn} no-underline`}
                >
                  <Download className="w-3 h-3 mr-1" />Template
                </a>
              </div>

              <div className="p-5 space-y-4">
                {/* Column info */}
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: T.textMuted }}>Recognised columns (Jim2 names auto-mapped)</p>
                  <p className="text-xs font-mono leading-relaxed" style={{ color: T.textFaint }}>{entity.fields}</p>
                  {entity.jim2hint && (
                    <p className="text-xs mt-1.5 rounded px-2 py-1" style={{ color: T.accentStrong, background: T.accentTint }}>
                      💡 {entity.jim2hint}
                    </p>
                  )}
                </div>

                {/* File drop zone */}
                <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg px-4 py-5 cursor-pointer transition-colors ${file ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'}`}>
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={e => handleFileSelect(entity.key, e.target.files?.[0])}
                  />
                  {file ? (
                    <div className="text-center">
                      <FileSpreadsheet className="w-8 h-8 text-green-500 mx-auto mb-1" />
                      <p className="text-sm font-medium text-green-700">{file.name}</p>
                      <p className="text-xs text-green-600">
                        {preview
                          ? `${preview.row_count} rows · ${preview.columns.length} columns`
                            + (preview.detected_type && preview.detected_type !== 'unknown' ? ` · auto-detected: ${preview.detected_type}` : '')
                          : 'Parsing...'}
                      </p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <FileSpreadsheet className="w-8 h-8 mx-auto mb-1" style={{ color: T.hairline }} />
                      <p className="text-sm" style={{ color: T.textMuted }}>Click to select CSV file</p>
                      <p className="text-xs" style={{ color: T.textFaint }}>or drag and drop</p>
                    </div>
                  )}
                </label>

                {/* Preview table */}
                {preview && preview.preview.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1" style={{ color: T.textMuted }}>Preview (first {Math.min(preview.preview.length, 3)} rows)</p>
                    <div className="overflow-x-auto rounded text-xs" style={{ border: `1px solid ${T.hairline}` }}>
                      <table className="w-full">
                        <thead style={{ background: T.hairlineSoft }}>
                          <tr>
                            {preview.columns.slice(0, 6).map(col => (
                              <th key={col} className="px-2 py-1.5 text-left font-medium whitespace-nowrap" style={{ color: T.textMuted }}>{col}</th>
                            ))}
                            {preview.columns.length > 6 && <th className="px-2 py-1.5" style={{ color: T.textFaint }}>+{preview.columns.length - 6} more</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.preview.slice(0, 3).map((row, i) => (
                            <tr key={i} style={{ borderTop: `1px solid ${T.hairline}` }}>
                              {preview.columns.slice(0, 6).map(col => (
                                <td key={col} className="px-2 py-1.5 whitespace-nowrap max-w-[120px] truncate" style={{ color: T.text }}>{row[col] || '—'}</td>
                              ))}
                              {preview.columns.length > 6 && <td className="px-2 py-1.5" style={{ color: T.textFaint }}>…</td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Result banner */}
                {result && result.ok && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                    <p className="font-semibold text-green-800 mb-1">Import complete</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded p-2" style={{ background: T.panel }}>
                        <p className="text-lg font-bold text-green-600">{result.inserted}</p>
                        <p className="text-xs" style={{ color: T.textMuted }}>Inserted</p>
                      </div>
                      <div className="rounded p-2" style={{ background: T.panel }}>
                        <p className="text-lg font-bold" style={{ color: T.accentStrong }}>{result.updated}</p>
                        <p className="text-xs" style={{ color: T.textMuted }}>Updated</p>
                      </div>
                      <div className="rounded p-2" style={{ background: T.panel }}>
                        <p className="text-lg font-bold" style={{ color: T.textMuted }}>{result.skipped}</p>
                        <p className="text-xs" style={{ color: T.textMuted }}>Skipped</p>
                      </div>
                    </div>
                    {result.errors && result.errors.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-red-700 mb-1">{result.errors.length} row(s) had errors:</p>
                        <div className="max-h-24 overflow-y-auto space-y-0.5">
                          {result.errors.map((e, i) => (
                            <p key={i} className="text-xs text-red-600">Row {e.row}: {e.error}</p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {result && !result.ok && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                    <p className="font-semibold">Import failed</p>
                    <p className="text-xs mt-1">{result.error}</p>
                  </div>
                )}

                {/* Import button — specialty colour kept per entity identity */}
                <button
                  onClick={() => handleImport(entity.key)}
                  disabled={!file || isLoading}
                  className={`w-full py-2.5 rounded-lg text-white font-medium text-sm flex items-center justify-center transition-colors ${c.btn} disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {isLoading ? (
                    <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Importing…</>
                  ) : (
                    <><FileSpreadsheet className="w-4 h-4 mr-2" />Import {entity.label}</>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tips */}
      <div className="rounded-lg p-4 text-sm" style={{ background: T.hairlineSoft, border: `1px solid ${T.hairline}`, color: T.textMuted }}>
        <p className="font-semibold mb-2" style={{ color: T.text }}>Tips for a successful import</p>
        <ul className="space-y-1 list-disc list-inside" style={{ color: T.textMuted }}>
          <li>Column names are matched flexibly — <code className="px-1 rounded text-xs" style={{ background: T.hairline }}>Customer Name</code>, <code className="px-1 rounded text-xs" style={{ background: T.hairline }}>customer_name</code>, and <code className="px-1 rounded text-xs" style={{ background: T.hairline }}>Company</code> all map to the name field.</li>
          <li>Import <strong>Customers</strong> and <strong>Suppliers</strong> first, then <strong>Inventory</strong>, then <strong>Jobs</strong>.</li>
          <li>Existing records (matched by ID) are <em>updated</em>, not duplicated. Safe to re-run after corrections.</li>
          <li>CSV files must be UTF-8 encoded. Excel users: File → Save As → CSV UTF-8.</li>
          <li>Dates can be in <code className="px-1 rounded text-xs" style={{ background: T.hairline }}>DD/MM/YYYY</code> or <code className="px-1 rounded text-xs" style={{ background: T.hairline }}>YYYY-MM-DD</code> format.</li>
        </ul>
      </div>
    </div>
  );
}
