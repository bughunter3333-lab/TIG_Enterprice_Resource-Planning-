import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, TrendingUp, DollarSign, Package, Users, Download, RefreshCw, Clock, AlertTriangle, Layers, Plus, AlertCircle, ShoppingCart, X, Check } from 'lucide-react';
import * as api from '../api';
import { notify } from '../lib/notify';
import { T } from '../ui/tokens';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart as RechartsPie, Pie,
} from 'recharts';
import { countNeedingReorder } from './stock/lowStock';

const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899'];
const fmt$ = (v) => `$${parseFloat(v || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function exportCSV(rows, filename) {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map(r => headers.map(h => {
      const v = r[h] === null || r[h] === undefined ? '' : String(r[h]);
      return v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function ExportButton({ onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title="Export to CSV"
      className="flex items-center gap-1.5 text-sm hover:text-green-700 border hover:border-green-400 hover:bg-green-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ color: T.textMuted, borderColor: T.hairline, background: T.panel }}
    >
      <Download className="w-3.5 h-3.5" />CSV
    </button>
  );
}

function DateRange({ from, to, onChange }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <label style={{ color: T.textMuted }}>From</label>
      <input type="date" value={from} onChange={e => onChange('from', e.target.value)}
        className="rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        style={{ border: `1px solid ${T.hairline}` }} />
      <label style={{ color: T.textMuted }}>To</label>
      <input type="date" value={to} onChange={e => onChange('to', e.target.value)}
        className="rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        style={{ border: `1px solid ${T.hairline}` }} />
    </div>
  );
}

function TotalsBar({ totals, fields }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${fields.length}, 1fr)` }}>
      {fields.map(({ key, label, color }) => (
        <div key={key} className="rounded-lg p-3 text-center" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <p className="text-xs" style={{ color: T.textMuted }}>{label}</p>
          <p className={`text-lg font-bold ${color || ''}`} style={!color ? { color: T.text } : undefined}>{fmt$(totals?.[key])}</p>
        </div>
      ))}
    </div>
  );
}

// ── Sales Summary ─────────────────────────────────────────────────────────────
function SalesSummaryTab() {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfYear = `${new Date().getFullYear()}-01-01`;
  const [range, setRange] = useState({ from: firstOfYear, to: today });

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['reports/sales-summary', range],
    queryFn: () => api.reports.salesSummary({ date_from: range.from, date_to: range.to }),
    staleTime: 30000,
    onError: (e) => { const m = e?.message || String(e); notify(m, { type: 'error' }); },
  });

  const rows = data?.rows || [];
  const totals = data?.totals || {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <DateRange from={range.from} to={range.to} onChange={(k, v) => setRange(r => ({ ...r, [k]: v }))} />
        <div className="flex items-center gap-2">
          <ExportButton disabled={rows.length === 0} onClick={() => exportCSV(rows.map(r => ({
            Customer: r.customer_name, Jobs: r.job_count,
            'Revenue (ex GST)': r.revenue_ex, 'GST': r.gst,
            'Total (inc GST)': r.revenue_inc, Paid: r.paid, Outstanding: r.outstanding,
          })), `sales-summary-${range.from}-${range.to}.csv`)} />
          <button onClick={() => refetch()} className="flex items-center gap-1 text-sm hover:text-blue-900" style={{ color: T.accentStrong }}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh
          </button>
        </div>
      </div>
      <TotalsBar totals={totals} fields={[
        { key: 'revenue_ex', label: 'Revenue (ex GST)', color: 'text-blue-800' },
        { key: 'gst', label: 'GST Collected', color: 'text-blue-700' },
        { key: 'revenue_inc', label: 'Total (inc GST)', color: 'text-green-700' },
        { key: 'outstanding', label: 'Outstanding', color: 'text-red-600' },
      ]} />
      {rows.length > 0 && (
        <div className="rounded-lg overflow-hidden" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0" style={{ background: T.hairlineSoft }}>
                <tr>
                  {['Customer','Jobs','Revenue (ex)','GST','Total (inc)','Paid','Outstanding'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-semibold" style={{ color: T.textMuted }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.customer_id} style={{ background: i % 2 === 0 ? T.panel : T.hairlineSoft }}>
                    <td className="px-3 py-2 font-medium">{r.customer_name}</td>
                    <td className="px-3 py-2 text-center" style={{ color: T.textMuted }}>{r.job_count}</td>
                    <td className="px-3 py-2 text-right">{fmt$(r.revenue_ex)}</td>
                    <td className="px-3 py-2 text-right text-blue-800">{fmt$(r.gst)}</td>
                    <td className="px-3 py-2 text-right font-medium">{fmt$(r.revenue_inc)}</td>
                    <td className="px-3 py-2 text-right text-green-700">{fmt$(r.paid)}</td>
                    <td className="px-3 py-2 text-right text-red-600">{fmt$(r.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="font-semibold" style={{ background: T.hairlineSoft, borderTop: `2px solid ${T.hairline}` }}>
                <tr>
                  <td className="px-3 py-2">TOTAL</td>
                  <td className="px-3 py-2 text-center">{totals.job_count}</td>
                  <td className="px-3 py-2 text-right">{fmt$(totals.revenue_ex)}</td>
                  <td className="px-3 py-2 text-right text-blue-800">{fmt$(totals.gst)}</td>
                  <td className="px-3 py-2 text-right">{fmt$(totals.revenue_inc)}</td>
                  <td className="px-3 py-2 text-right text-green-700">{fmt$(totals.paid)}</td>
                  <td className="px-3 py-2 text-right text-red-600">{fmt$(totals.outstanding)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
      {!isFetching && rows.length === 0 && (
        <div className="text-center py-16" style={{ color: T.textFaint }}>No invoiced jobs in this period.</div>
      )}
    </div>
  );
}

// ── GST Report ────────────────────────────────────────────────────────────────
function GSTTab() {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfYear = `${new Date().getFullYear()}-01-01`;
  const [range, setRange] = useState({ from: firstOfYear, to: today });

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['reports/gst', range],
    queryFn: () => api.reports.gst({ date_from: range.from, date_to: range.to }),
    staleTime: 30000,
    onError: (e) => { const m = e?.message || String(e); notify(m, { type: 'error' }); },
  });

  const rows = data?.monthly_breakdown || [];
  const summary = data?.summary || {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <DateRange from={range.from} to={range.to} onChange={(k, v) => setRange(r => ({ ...r, [k]: v }))} />
        <div className="flex items-center gap-2">
          <ExportButton disabled={rows.length === 0} onClick={() => exportCSV(rows.map(r => ({
            Month: r.month, Invoices: r.invoices, 'Sales (inc GST)': r.sales_inc, 'Sales (ex GST)': r.sales_ex, 'GST Collected': r.gst,
          })), `gst-report-${range.from}-${range.to}.csv`)} />
          <button onClick={() => refetch()} className="flex items-center gap-1 text-sm hover:text-blue-900" style={{ color: T.accentStrong }}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-xs text-blue-800 font-semibold">G1 — Total Sales (inc GST)</p>
          <p className="text-2xl font-bold text-blue-900">{fmt$(summary.G1_total_sales_inc_gst)}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-xs text-green-600 font-semibold">G1 — Sales (ex GST)</p>
          <p className="text-2xl font-bold text-green-800">{fmt$(summary.G1_total_sales_ex_gst)}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-xs text-blue-700 font-semibold">1A — GST Collected</p>
          <p className="text-2xl font-bold text-blue-900">{fmt$(summary['1A_gst_collected'])}</p>
          <p className="text-xs text-blue-600 mt-1">{summary.invoice_count} invoices</p>
        </div>
      </div>
      {rows.length > 0 && (
        <div className="rounded-lg overflow-hidden" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <table className="w-full text-sm">
            <thead style={{ background: T.hairlineSoft }}>
              <tr>
                {['Month','Invoices','Sales (inc GST)','Sales (ex GST)','GST Collected'].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-xs font-semibold" style={{ color: T.textMuted }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.month} style={{ background: i % 2 === 0 ? T.panel : T.hairlineSoft }}>
                  <td className="px-3 py-2 font-medium">{r.month}</td>
                  <td className="px-3 py-2 text-center">{r.invoices}</td>
                  <td className="px-3 py-2 text-right">{fmt$(r.sales_inc)}</td>
                  <td className="px-3 py-2 text-right">{fmt$(r.sales_ex)}</td>
                  <td className="px-3 py-2 text-right text-blue-800 font-medium">{fmt$(r.gst)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Aged Receivables ──────────────────────────────────────────────────────────
function AgedReceivablesTab() {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['reports/aged-receivables'],
    queryFn: () => api.reports.agedReceivables(),
    staleTime: 30000,
    onError: (e) => { const m = e?.message || String(e); notify(m, { type: 'error' }); },
  });

  const rows = data?.rows || [];
  const totals = data?.totals || {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm" style={{ color: T.textMuted }}>Outstanding balances as at today</p>
        <div className="flex items-center gap-2">
          <ExportButton disabled={rows.length === 0} onClick={() => exportCSV(rows.map(r => ({
            Customer: r.customer_name, 'Current (0-30d)': r.current, '31-60d': r.days_31_60, '61-90d': r.days_61_90, '90d+': r.over_90, Total: r.total, 'Oldest Invoice': r.oldest_invoice,
          })), 'aged-receivables.csv')} />
          <button onClick={() => refetch()} className="flex items-center gap-1 text-sm hover:text-blue-900" style={{ color: T.accentStrong }}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh
          </button>
        </div>
      </div>
      <TotalsBar totals={totals} fields={[
        { key: 'current', label: 'Current (0-30d)', color: 'text-green-700' },
        { key: 'days_31_60', label: '31–60 days', color: 'text-blue-700' },
        { key: 'days_61_90', label: '61–90 days', color: 'text-indigo-600' },
        { key: 'over_90', label: 'Over 90 days', color: 'text-red-700' },
        { key: 'total', label: 'Total Outstanding', color: 'text-gray-900' },
      ]} />
      {rows.length > 0 && (
        <div className="rounded-lg overflow-hidden" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0" style={{ background: T.hairlineSoft }}>
                <tr>
                  {['Customer','Current','31–60d','61–90d','90d+','Total','Oldest Invoice'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-semibold" style={{ color: T.textMuted }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.customer_id} style={{ background: i % 2 === 0 ? T.panel : T.hairlineSoft }}>
                    <td className="px-3 py-2 font-medium">{r.customer_name}</td>
                    <td className="px-3 py-2 text-right text-green-700">{fmt$(r.current)}</td>
                    <td className="px-3 py-2 text-right text-blue-800">{fmt$(r.days_31_60)}</td>
                    <td className="px-3 py-2 text-right text-indigo-700">{fmt$(r.days_61_90)}</td>
                    <td className="px-3 py-2 text-right text-red-700">{fmt$(r.over_90)}</td>
                    <td className="px-3 py-2 text-right font-bold">{fmt$(r.total)}</td>
                    <td className="px-3 py-2 text-xs" style={{ color: T.textMuted }}>{r.oldest_invoice}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="font-semibold" style={{ background: T.hairlineSoft, borderTop: `2px solid ${T.hairline}` }}>
                <tr>
                  <td className="px-3 py-2">TOTAL</td>
                  <td className="px-3 py-2 text-right text-green-700">{fmt$(totals.current)}</td>
                  <td className="px-3 py-2 text-right text-blue-800">{fmt$(totals.days_31_60)}</td>
                  <td className="px-3 py-2 text-right text-indigo-700">{fmt$(totals.days_61_90)}</td>
                  <td className="px-3 py-2 text-right text-red-700">{fmt$(totals.over_90)}</td>
                  <td className="px-3 py-2 text-right">{fmt$(totals.total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
      {!isFetching && rows.length === 0 && (
        <div className="text-center py-16" style={{ color: T.textFaint }}>No outstanding balances.</div>
      )}
    </div>
  );
}

// ── Aged Payables ─────────────────────────────────────────────────────────────
function AgedPayablesTab() {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['reports/aged-payables'],
    queryFn: () => api.reports.agedPayables(),
    staleTime: 30000,
    onError: (e) => { const m = e?.message || String(e); notify(m, { type: 'error' }); },
  });

  const rows = data?.rows || [];
  const totals = data?.totals || {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm" style={{ color: T.textMuted }}>Outstanding supplier balances as at today</p>
        <div className="flex items-center gap-2">
          <ExportButton disabled={rows.length === 0} onClick={() => exportCSV(rows.map(r => ({
            Supplier: r.supplier_name, 'Current (0-30d)': r.current, '31-60d': r.days_31_60, '61-90d': r.days_61_90, '90d+': r.over_90, Total: r.total,
          })), 'aged-payables.csv')} />
          <button onClick={() => refetch()} className="flex items-center gap-1 text-sm hover:text-blue-900" style={{ color: T.accentStrong }}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh
          </button>
        </div>
      </div>
      <TotalsBar totals={totals} fields={[
        { key: 'current', label: 'Current (0-30d)', color: 'text-green-700' },
        { key: 'days_31_60', label: '31–60 days', color: 'text-blue-700' },
        { key: 'days_61_90', label: '61–90 days', color: 'text-indigo-600' },
        { key: 'over_90', label: 'Over 90 days', color: 'text-red-700' },
        { key: 'total', label: 'Total Owing', color: 'text-gray-900' },
      ]} />
      {rows.length > 0 && (
        <div className="rounded-lg overflow-hidden" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0" style={{ background: T.hairlineSoft }}>
                <tr>
                  {['Supplier','Current','31–60d','61–90d','90d+','Total'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-semibold" style={{ color: T.textMuted }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.supplier_id} style={{ background: i % 2 === 0 ? T.panel : T.hairlineSoft }}>
                    <td className="px-3 py-2 font-medium">{r.supplier_name}</td>
                    <td className="px-3 py-2 text-right text-green-700">{fmt$(r.current)}</td>
                    <td className="px-3 py-2 text-right text-blue-800">{fmt$(r.days_31_60)}</td>
                    <td className="px-3 py-2 text-right text-indigo-700">{fmt$(r.days_61_90)}</td>
                    <td className="px-3 py-2 text-right text-red-700">{fmt$(r.over_90)}</td>
                    <td className="px-3 py-2 text-right font-bold">{fmt$(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="font-semibold" style={{ background: T.hairlineSoft, borderTop: `2px solid ${T.hairline}` }}>
                <tr>
                  <td className="px-3 py-2">TOTAL</td>
                  <td className="px-3 py-2 text-right text-green-700">{fmt$(totals.current)}</td>
                  <td className="px-3 py-2 text-right text-blue-800">{fmt$(totals.days_31_60)}</td>
                  <td className="px-3 py-2 text-right text-indigo-700">{fmt$(totals.days_61_90)}</td>
                  <td className="px-3 py-2 text-right text-red-700">{fmt$(totals.over_90)}</td>
                  <td className="px-3 py-2 text-right">{fmt$(totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
      {!isFetching && rows.length === 0 && (
        <div className="text-center py-16" style={{ color: T.textFaint }}>No outstanding supplier balances.</div>
      )}
    </div>
  );
}

// ── Inventory Valuation ───────────────────────────────────────────────────────
function InventoryValuationTab() {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['reports/inventory-valuation'],
    queryFn: () => api.reports.inventoryValuation(),
    staleTime: 30000,
    onError: (e) => { const m = e?.message || String(e); notify(m, { type: 'error' }); },
  });

  const rows = data?.rows || [];
  const totals = data?.totals || {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm" style={{ color: T.textMuted }}>Current stock on hand × unit cost</p>
        <div className="flex items-center gap-2">
          <ExportButton disabled={rows.length === 0} onClick={() => exportCSV(rows.map(r => ({
            Category: r.category, SKUs: r.sku_count, Units: r.total_units, 'Valuation ($)': r.value,
          })), 'inventory-valuation.csv')} />
          <button onClick={() => refetch()} className="flex items-center gap-1 text-sm hover:text-blue-900" style={{ color: T.accentStrong }}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg p-3 text-center" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <p className="text-xs" style={{ color: T.textMuted }}>Total SKUs</p>
          <p className="text-2xl font-bold text-blue-800">{totals.sku_count || 0}</p>
        </div>
        <div className="rounded-lg p-3 text-center" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <p className="text-xs" style={{ color: T.textMuted }}>Total Units</p>
          <p className="text-2xl font-bold text-green-700">{(totals.total_units || 0).toLocaleString()}</p>
        </div>
        <div className="rounded-lg p-3 text-center" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <p className="text-xs" style={{ color: T.textMuted }}>Total Valuation</p>
          <p className="text-2xl font-bold text-purple-700">{fmt$(totals.value)}</p>
        </div>
      </div>
      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg overflow-hidden" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
            <table className="w-full text-sm">
              <thead style={{ background: T.hairlineSoft }}>
                <tr>
                  {['Category','SKUs','Units','Value'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-semibold" style={{ color: T.textMuted }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.category} style={{ background: i % 2 === 0 ? T.panel : T.hairlineSoft }}>
                    <td className="px-3 py-2 font-medium">{r.category}</td>
                    <td className="px-3 py-2 text-center">{r.sku_count}</td>
                    <td className="px-3 py-2 text-center">{r.total_units.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-medium text-purple-700">{fmt$(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-lg p-4" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
            <h4 className="font-semibold text-sm mb-3">Value by Category</h4>
            <ResponsiveContainer width="100%" height={220}>
              <RechartsPie>
                <Pie data={rows} dataKey="value" nameKey="category" cx="50%" cy="50%" outerRadius={80}
                  label={({ category, percent }) => `${category}: ${(percent * 100).toFixed(0)}%`}>
                  {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => fmt$(v)} />
              </RechartsPie>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Job Profitability ─────────────────────────────────────────────────────────
function JobProfitabilityTab() {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfYear = `${new Date().getFullYear()}-01-01`;
  const [range, setRange] = useState({ from: firstOfYear, to: today });

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['reports/job-profitability', range],
    queryFn: () => api.reports.jobProfitability({ date_from: range.from, date_to: range.to }),
    staleTime: 30000,
    onError: (e) => { const m = e?.message || String(e); notify(m, { type: 'error' }); },
  });

  const rows = data?.rows || [];
  const totals = data?.totals || {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <DateRange from={range.from} to={range.to} onChange={(k, v) => setRange(r => ({ ...r, [k]: v }))} />
        <div className="flex items-center gap-2">
          <ExportButton disabled={rows.length === 0} onClick={() => exportCSV(rows.map(r => ({
            'Job#': r.job_id, Customer: r.customer_name, 'Date In': r.date_in, Revenue: r.revenue_ex, Cost: r.cost, Margin: r.margin, 'Margin%': r.margin_pct,
          })), `job-profitability-${range.from}-${range.to}.csv`)} />
          <button onClick={() => refetch()} className="flex items-center gap-1 text-sm hover:text-blue-900" style={{ color: T.accentStrong }}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh
          </button>
        </div>
      </div>
      {totals.revenue_ex > 0 && (
        <TotalsBar totals={totals} fields={[
          { key: 'revenue_ex', label: 'Revenue (ex GST)', color: 'text-blue-800' },
          { key: 'cost', label: 'Product Cost', color: 'text-red-600' },
          { key: 'margin', label: 'Gross Margin', color: 'text-green-700' },
        ]} />
      )}
      {rows.length > 0 && (
        <div className="rounded-lg overflow-hidden" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0" style={{ background: T.hairlineSoft }}>
                <tr>
                  {['Job','Customer','Date','Revenue','Cost','Margin','Margin %'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-semibold" style={{ color: T.textMuted }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.job_id} style={{ background: i % 2 === 0 ? T.panel : T.hairlineSoft }}>
                    <td className="px-3 py-2 font-mono text-xs">{r.job_id}</td>
                    <td className="px-3 py-2">{r.customer}</td>
                    <td className="px-3 py-2 text-xs" style={{ color: T.textMuted }}>{r.date_in}</td>
                    <td className="px-3 py-2 text-right">{fmt$(r.revenue_ex)}</td>
                    <td className="px-3 py-2 text-right text-red-600">{fmt$(r.cost)}</td>
                    <td className="px-3 py-2 text-right text-green-700 font-medium">{fmt$(r.margin)}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${r.margin_pct >= 30 ? 'bg-green-100 text-green-800' : r.margin_pct >= 10 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
                        {r.margin_pct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="font-semibold" style={{ background: T.hairlineSoft, borderTop: `2px solid ${T.hairline}` }}>
                <tr>
                  <td className="px-3 py-2" colSpan={3}>TOTAL ({rows.length} jobs)</td>
                  <td className="px-3 py-2 text-right">{fmt$(totals.revenue_ex)}</td>
                  <td className="px-3 py-2 text-right text-red-600">{fmt$(totals.cost)}</td>
                  <td className="px-3 py-2 text-right text-green-700">{fmt$(totals.margin)}</td>
                  <td className="px-3 py-2 text-right">{totals.margin_pct}%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
      {!isFetching && rows.length === 0 && (
        <div className="text-center py-16" style={{ color: T.textFaint }}>No job data in this period.</div>
      )}
    </div>
  );
}

// ── On-Time Delivery ──────────────────────────────────────────────────────────
function OnTimeDeliveryTab() {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfYear = `${new Date().getFullYear()}-01-01`;
  const [range, setRange] = useState({ from: firstOfYear, to: today });

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['reports/on-time-delivery', range],
    queryFn: () => api.reports.onTimeDelivery({ date_from: range.from, date_to: range.to }),
    staleTime: 30000,
    onError: (e) => { const m = e?.message || String(e); notify(m, { type: 'error' }); },
  });

  const summary = data?.summary || {};
  const byCustomer = data?.by_customer || [];
  const rate = summary.rate ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <DateRange from={range.from} to={range.to} onChange={(k, v) => setRange(r => ({ ...r, [k]: v }))} />
        <div className="flex items-center gap-2">
          <ExportButton disabled={byCustomer.length === 0} onClick={() => exportCSV(byCustomer.map(r => ({
            Customer: r.customer_name, Jobs: r.total, 'On Time': r.on_time, Late: r.late, 'No Date': r.no_due_date, 'Rate %': r.rate,
          })), `on-time-delivery-${range.from}-${range.to}.csv`)} />
          <button onClick={() => refetch()} className="flex items-center gap-1 text-sm hover:text-blue-900" style={{ color: T.accentStrong }}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh
          </button>
        </div>
      </div>

      {summary.total > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <div className={`rounded-lg border p-4 text-center ${rate >= 90 ? 'bg-emerald-50 border-emerald-200' : rate >= 75 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
            <p className="text-xs font-semibold" style={{ color: T.textMuted }}>On-Time Rate</p>
            <p className={`text-3xl font-bold mt-1 ${rate >= 90 ? 'text-emerald-700' : rate >= 75 ? 'text-amber-700' : 'text-red-700'}`}>{rate}%</p>
          </div>
          <div className="rounded-lg p-4 text-center" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
            <p className="text-xs" style={{ color: T.textMuted }}>Total Jobs</p>
            <p className="text-2xl font-bold" style={{ color: T.text }}>{summary.total}</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
            <p className="text-xs text-emerald-600">On Time</p>
            <p className="text-2xl font-bold text-emerald-700">{summary.on_time}</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
            <p className="text-xs text-red-600">Late</p>
            <p className="text-2xl font-bold text-red-700">{summary.late}</p>
            {summary.no_due_date > 0 && <p className="text-xs mt-0.5" style={{ color: T.textFaint }}>{summary.no_due_date} no due date</p>}
          </div>
        </div>
      )}

      {byCustomer.length > 0 && (
        <div className="rounded-lg overflow-hidden" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0" style={{ background: T.hairlineSoft }}>
                <tr>
                  {['Customer','Jobs','On Time','Late','No Date','Rate'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-semibold" style={{ color: T.textMuted }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byCustomer.map((r, i) => (
                  <tr key={r.customer_id} style={{ background: i % 2 === 0 ? T.panel : T.hairlineSoft }}>
                    <td className="px-3 py-2 font-medium">{r.customer_name}</td>
                    <td className="px-3 py-2 text-center">{r.total}</td>
                    <td className="px-3 py-2 text-center text-emerald-700">{r.on_time}</td>
                    <td className="px-3 py-2 text-center text-red-600">{r.late}</td>
                    <td className="px-3 py-2 text-center" style={{ color: T.textFaint }}>{r.no_due_date}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.rate >= 90 ? 'bg-emerald-100 text-emerald-800' : r.rate >= 75 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
                        {r.rate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {!isFetching && summary.total === 0 && (
        <div className="text-center py-16" style={{ color: T.textFaint }}>No completed jobs with due dates in this period.</div>
      )}
    </div>
  );
}

// ── Back Orders ───────────────────────────────────────────────────────────────
function BackOrdersTab({ onOpenJob, suppliers = [], purchaseOrders = [], onNavigateToPO }) {
  const qc = useQueryClient();
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['reports/back-orders'],
    queryFn: () => api.reports.backOrders(),
    staleTime: 30000,
    onError: (e) => { const m = e?.message || String(e); notify(m, { type: 'error' }); },
  });

  const rows = data?.rows || [];
  const totals = data?.totals || {};

  // Selection state
  const [selected, setSelected] = useState(new Set());
  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.sku));
  const toggleRow = (sku) => setSelected(s => { const n = new Set(s); n.has(sku) ? n.delete(sku) : n.add(sku); return n; });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map(r => r.sku)));

  // Raise PO state
  const [raisePOOpen, setRaisePOOpen] = useState(false);
  const [poForm, setPoForm] = useState(null);
  const [raising, setRaising] = useState(false);
  const [poErr, setPoErr] = useState('');

  async function openRaisePO() {
    const selectedRows = rows.filter(r => selected.has(r.sku));
    const nextIdRes = await api.purchaseOrders.nextId().catch(() => ({ id: `PO-${Date.now()}` }));
    // Detect dominant supplier from selected rows
    const supplierCounts = {};
    selectedRows.forEach(r => { if (r.supplier) supplierCounts[r.supplier] = (supplierCounts[r.supplier] || 0) + 1; });
    const topSupplier = Object.entries(supplierCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const matchedSupplier = suppliers.find(s => s.name === topSupplier || s.code === topSupplier);

    setPoForm({
      id: nextIdRes.id,
      supplierCode: matchedSupplier?.code || '',
      supplier: matchedSupplier?.name || topSupplier,
      expectedDate: '',
      notes: `Raised from back order report — ${new Date().toLocaleDateString('en-AU')}`,
      items: selectedRows.map(r => ({
        sku: r.sku,
        description: r.description,
        qty: r.total_b_ord,
        unitCost: r.unit_cost,
        jobIds: (r.jobs || []).map(j => j.job_id),
        jobs: r.jobs || [],
        supplier: r.supplier,
      })),
    });
    setPoErr('');
    setRaisePOOpen(true);
  }

  async function submitRaisePO() {
    if (!poForm.id) { setPoErr('PO ID is required'); return; }
    setRaising(true);
    setPoErr('');
    try {
      const po = await api.purchaseOrders.fromBackOrders(poForm);
      qc.invalidateQueries(['reports/back-orders']);
      qc.invalidateQueries(['purchaseOrders']);
      setSelected(new Set());
      setRaisePOOpen(false);
      onNavigateToPO?.(po);
    } catch (e) {
      setPoErr(e.message);
    } finally {
      setRaising(false);
    }
  }

  // Check if selected items span multiple suppliers
  const selectedRows = rows.filter(r => selected.has(r.sku));
  const uniqueSuppliers = [...new Set(selectedRows.map(r => r.supplier).filter(Boolean))];

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: T.textMuted }}>Items on back order across active jobs</p>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={openRaisePO}
              className="flex items-center gap-1.5 px-3 py-1.5 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 shadow-sm"
              style={{ background: T.accentStrong }}
            >
              <Plus className="w-3.5 h-3.5" />
              Raise PO ({selected.size} SKU{selected.size !== 1 ? 's' : ''})
            </button>
          )}
          <button onClick={() => refetch()} className="flex items-center gap-1 text-sm hover:text-blue-900" style={{ color: T.accentStrong }}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh
          </button>
        </div>
      </div>

      {/* Multi-supplier warning */}
      {selected.size > 0 && uniqueSuppliers.length > 1 && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          Selected items span {uniqueSuppliers.length} suppliers ({uniqueSuppliers.join(', ')}). You can still raise one PO — just confirm the supplier in the form.
        </div>
      )}

      {totals.sku_count > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 text-center">
            <p className="text-xs text-indigo-600">SKUs on Back Order</p>
            <p className="text-2xl font-bold text-indigo-700">{totals.sku_count}</p>
          </div>
          <div className="rounded-lg p-4 text-center" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
            <p className="text-xs" style={{ color: T.textMuted }}>Total Units B/O</p>
            <p className="text-2xl font-bold" style={{ color: T.text }}>{(totals.total_b_ord || 0).toLocaleString()}</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
            <p className="text-xs text-red-600">Total Value</p>
            <p className="text-2xl font-bold text-red-700">{fmt$(totals.total_value)}</p>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded-lg overflow-hidden" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <div className="max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10" style={{ background: T.hairlineSoft }}>
                <tr>
                  <th className="px-3 py-2 w-8">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll}
                      className="rounded border-gray-300 text-blue-800 focus:ring-blue-500" />
                  </th>
                  {['SKU','Description','Category','Supplier','SOH','B/O Qty','Unit Cost','Value','Jobs & POs'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-semibold whitespace-nowrap" style={{ color: T.textMuted }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const isSelected = selected.has(r.sku);
                  const alreadyOnPO = (r.jobs || []).some(j => j.po_no);
                  return (
                    <tr key={r.sku}
                      onClick={() => toggleRow(r.sku)}
                      className={`cursor-pointer align-top transition-colors ${!isSelected && r.stock_on_hand <= 0 ? 'border-l-2 border-l-red-400' : ''}`}
                      style={isSelected
                        ? { background: '#eff6ff', borderLeft: '2px solid #60a5fa' }
                        : { background: i % 2 === 0 ? T.panel : T.hairlineSoft }}>
                      <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleRow(r.sku)}
                          className="rounded border-gray-300 text-blue-800 focus:ring-blue-500" />
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs font-semibold whitespace-nowrap">
                        {r.sku}
                        {alreadyOnPO && <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-800 px-1 py-0.5 rounded">on PO</span>}
                      </td>
                      <td className="px-3 py-2.5 max-w-44 truncate text-xs" title={r.description}>{r.description}</td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color: T.textMuted }}>{r.category || '—'}</td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color: T.textMuted }}>{r.supplier || '—'}</td>
                      <td className={`px-3 py-2.5 text-center font-medium whitespace-nowrap ${r.stock_on_hand <= 0 ? 'text-red-600' : ''}`} style={r.stock_on_hand > 0 ? { color: T.text } : undefined}>{r.stock_on_hand}</td>
                      <td className="px-3 py-2.5 text-center font-bold text-indigo-700 whitespace-nowrap">{r.total_b_ord}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap" style={{ color: T.textMuted }}>{fmt$(r.unit_cost)}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-red-700 whitespace-nowrap">{fmt$(r.total_value)}</td>
                      <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        <div className="flex flex-col gap-1.5">
                          {(r.jobs || []).map(j => (
                            <div key={j.job_id} className="flex items-center gap-1.5 flex-wrap">
                              <button onClick={() => onOpenJob?.(j.job_id)}
                                className="inline-flex items-center gap-1 font-mono text-[11px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded hover:bg-indigo-100 font-semibold"
                                title={`Open job ${j.job_id} — ${j.customer_name}`}>
                                {j.job_id}{j.b_ord > 1 && <span className="text-indigo-500">×{j.b_ord}</span>}
                              </button>
                              {j.po_no && (
                                <span className="font-mono text-[11px] bg-blue-50 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded" title={`PO: ${j.po_no}`}>
                                  PO {j.po_no}
                                </span>
                              )}
                              <span className="text-[11px] truncate max-w-28" style={{ color: T.textFaint }} title={j.customer_name}>{j.customer_name}</span>
                              {j.due && (
                                <span className={`text-[10px] px-1 py-0.5 rounded ${new Date(j.due) < new Date() ? 'bg-red-50 text-red-600' : ''}`} style={new Date(j.due) >= new Date() ? { color: T.textFaint } : undefined}>
                                  due {j.due}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="font-semibold" style={{ background: T.hairlineSoft, borderTop: `2px solid ${T.hairline}` }}>
                <tr>
                  <td />
                  <td className="px-3 py-2" colSpan={4}>TOTAL ({totals.sku_count} SKUs)</td>
                  <td className="px-3 py-2 text-center text-indigo-700">{totals.total_b_ord}</td>
                  <td />
                  <td className="px-3 py-2 text-right text-red-700">{fmt$(totals.total_value)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
      {!isFetching && rows.length === 0 && (
        <div className="text-center py-16" style={{ color: T.textFaint }}>No back orders found.</div>
      )}

      {/* ── Raise PO Modal ── */}
      {raisePOOpen && poForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]" style={{ background: T.panel }}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${T.hairline}` }}>
              <h2 className="font-semibold flex items-center gap-2 text-base" style={{ color: T.text }}>
                <ShoppingCart className="w-4 h-4 text-blue-800" />
                Raise Purchase Order from Back Orders
              </h2>
              <button onClick={() => setRaisePOOpen(false)} className="hover:text-gray-600" style={{ color: T.textMuted }}><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {poErr && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm flex gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{poErr}
                </div>
              )}

              {/* PO details */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <label className="block text-xs font-medium mb-0.5" style={{ color: T.textMuted }}>PO Number *</label>
                  <input className="w-full rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                    style={{ border: `1px solid ${T.hairline}` }}
                    value={poForm.id} onChange={e => setPoForm(f => ({ ...f, id: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-0.5" style={{ color: T.textMuted }}>Supplier</label>
                  <select className="w-full rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    style={{ border: `1px solid ${T.hairline}` }}
                    value={poForm.supplierCode}
                    onChange={e => {
                      const s = suppliers.find(s => s.code === e.target.value);
                      setPoForm(f => ({ ...f, supplierCode: e.target.value, supplier: s?.name || e.target.value }));
                    }}>
                    <option value="">— select supplier —</option>
                    {suppliers.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-0.5" style={{ color: T.textMuted }}>Expected Delivery Date</label>
                  <input type="date" className="w-full rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    style={{ border: `1px solid ${T.hairline}` }}
                    value={poForm.expectedDate} onChange={e => setPoForm(f => ({ ...f, expectedDate: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-0.5" style={{ color: T.textMuted }}>Notes</label>
                  <input className="w-full rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    style={{ border: `1px solid ${T.hairline}` }}
                    value={poForm.notes} onChange={e => setPoForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>

              {/* Line items */}
              <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${T.hairline}` }}>
                <div className="px-3 py-2 text-xs font-semibold" style={{ background: T.hairlineSoft, color: T.textMuted, borderBottom: `1px solid ${T.hairline}` }}>Line Items</div>
                <table className="w-full text-xs">
                  <thead style={{ background: T.hairlineSoft, borderBottom: `1px solid ${T.hairline}` }}>
                    <tr>
                      <th className="text-left px-3 py-2 font-medium" style={{ color: T.textMuted }}>SKU</th>
                      <th className="text-left px-3 py-2 font-medium" style={{ color: T.textMuted }}>Description</th>
                      <th className="text-center px-3 py-2 font-medium" style={{ color: T.textMuted }}>Qty</th>
                      <th className="text-right px-3 py-2 font-medium" style={{ color: T.textMuted }}>Unit Cost</th>
                      <th className="text-right px-3 py-2 font-medium" style={{ color: T.textMuted }}>Total</th>
                      <th className="text-left px-3 py-2 font-medium" style={{ color: T.textMuted }}>Linked Jobs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {poForm.items.map((item, idx) => (
                      <tr key={item.sku} className="last:border-0 hover:bg-gray-50" style={{ borderBottom: `1px solid ${T.hairline}` }}>
                        <td className="px-3 py-2 font-mono font-semibold" style={{ color: T.text }}>{item.sku}</td>
                        <td className="px-3 py-2 max-w-36 truncate" style={{ color: T.textMuted }} title={item.description}>{item.description}</td>
                        <td className="px-3 py-2 text-center">
                          <input type="number" min="1"
                            value={item.qty}
                            onChange={e => setPoForm(f => {
                              const items = [...f.items];
                              items[idx] = { ...items[idx], qty: parseInt(e.target.value) || 0 };
                              return { ...f, items };
                            })}
                            className="w-16 rounded px-1.5 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold text-indigo-700"
                            style={{ border: `1px solid ${T.hairline}` }} />
                        </td>
                        <td className="px-3 py-2 text-right" style={{ color: T.textMuted }}>{fmt$(item.unitCost)}</td>
                        <td className="px-3 py-2 text-right font-semibold" style={{ color: T.text }}>{fmt$(item.qty * item.unitCost)}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {item.jobIds.map(jid => (
                              <span key={jid} className="font-mono text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-1 py-0.5 rounded">
                                {jid}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="font-semibold" style={{ background: T.hairlineSoft, borderTop: `1px solid ${T.hairline}` }}>
                    <tr>
                      <td colSpan={4} className="px-3 py-2 text-right" style={{ color: T.textMuted }}>PO Total</td>
                      <td className="px-3 py-2 text-right" style={{ color: T.text }}>{fmt$(poForm.items.reduce((s, i) => s + i.qty * i.unitCost, 0))}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              <p className="text-xs" style={{ color: T.textFaint }}>
                After raising: job items for these SKUs will be updated with this PO number. You can track receiving status in the Purchases module.
              </p>
            </div>

            {/* Modal footer */}
            <div className="flex justify-end gap-2 px-5 py-3" style={{ borderTop: `1px solid ${T.hairline}`, background: T.hairlineSoft }}>
              <button onClick={() => setRaisePOOpen(false)} className="px-4 py-2 text-sm hover:text-gray-800" style={{ color: T.textMuted }}>Cancel</button>
              <button onClick={submitRaisePO} disabled={raising}
                className="px-4 py-2 text-sm text-white rounded-lg hover:bg-blue-800 disabled:opacity-60 flex items-center gap-1.5 font-semibold"
                style={{ background: T.accentStrong }}>
                {raising ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Raise PO {poForm.id}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Decoration Performance ────────────────────────────────────────────────────
function DecorationPerformanceTab() {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfYear = `${new Date().getFullYear()}-01-01`;
  const [range, setRange] = useState({ from: firstOfYear, to: today });

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['reports/decoration-performance', range],
    queryFn: () => api.reports.decorationPerformance({ date_from: range.from, date_to: range.to }),
    staleTime: 30000,
    onError: (e) => { const m = e?.message || String(e); notify(m, { type: 'error' }); },
  });

  const rows = data?.rows || [];
  const maxRevenue = rows.length ? Math.max(...rows.map(r => r.revenue)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <DateRange from={range.from} to={range.to} onChange={(k, v) => setRange(r => ({ ...r, [k]: v }))} />
        <div className="flex items-center gap-2">
          <ExportButton disabled={rows.length === 0} onClick={() => exportCSV(rows.map(r => ({
            Type: r.decoration_type || 'None', Items: r.item_count, Qty: r.qty, Revenue: r.revenue, Cost: r.cost, Margin: r.margin, 'Margin%': r.margin_pct,
          })), `decoration-performance-${range.from}-${range.to}.csv`)} />
          <button onClick={() => refetch()} className="flex items-center gap-1 text-sm hover:text-blue-900" style={{ color: T.accentStrong }}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh
          </button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg overflow-hidden" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
            <table className="w-full text-sm">
              <thead style={{ background: T.hairlineSoft }}>
                <tr>
                  {['Type','Items','Qty','Revenue','Cost','Margin','Margin %'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-semibold" style={{ color: T.textMuted }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.decoration_type} style={{ background: i % 2 === 0 ? T.panel : T.hairlineSoft }}>
                    <td className="px-3 py-2 font-semibold">{r.decoration_type || 'None'}</td>
                    <td className="px-3 py-2 text-center" style={{ color: T.textMuted }}>{r.item_count}</td>
                    <td className="px-3 py-2 text-center" style={{ color: T.textMuted }}>{(r.qty || 0).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-blue-800">{fmt$(r.revenue)}</td>
                    <td className="px-3 py-2 text-right text-red-600">{fmt$(r.cost)}</td>
                    <td className="px-3 py-2 text-right text-green-700 font-medium">{fmt$(r.margin)}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${r.margin_pct >= 30 ? 'bg-green-100 text-green-800' : r.margin_pct >= 10 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
                        {r.margin_pct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-lg p-4" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
            <h4 className="font-semibold text-sm mb-4">Revenue by Decoration Type</h4>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="decoration_type" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={v => fmt$(v)} />
                <Bar dataKey="revenue" name="Revenue">
                  {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {!isFetching && rows.length === 0 && (
        <div className="text-center py-16" style={{ color: T.textFaint }}>No decoration data in this period.</div>
      )}
    </div>
  );
}

// ── Overview Tab (charts from local data) ─────────────────────────────────────
function OverviewTab({ jobs = [], inventory = [] }) {
  const jobsByStatus = Object.entries(
    jobs.reduce((acc, j) => { acc[j.status] = (acc[j.status] || 0) + 1; return acc; }, {})
  ).map(([name, value]) => ({ name, value }));

  const revenueByMonth = (() => {
    const map = {};
    jobs.forEach(j => {
      const parts = (j.dateIn || '').split('/');
      if (parts.length === 3) {
        const key = `${parts[2]}-${parts[1]}`;
        map[key] = (map[key] || 0) + (j.total || 0);
      }
    });
    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).slice(-6)
      .map(([month, revenue]) => ({ month, revenue: parseFloat(revenue.toFixed(2)) }));
  })();

  const topCustomers = Object.entries(
    jobs.reduce((acc, j) => { acc[j.customer] = (acc[j.customer] || 0) + (j.total || 0); return acc; }, {})
  ).sort(([,a],[,b]) => b - a).slice(0, 5)
    .map(([name, revenue]) => ({ name: name?.length > 15 ? name.slice(0,15)+'…' : name, revenue: parseFloat(revenue.toFixed(2)) }));

  const invByCategory = Object.entries(
    inventory.reduce((acc, i) => {
      const cat = i.category || 'Uncategorised';
      acc[cat] = (acc[cat] || 0) + i.stock * (i.unitCost || 0);
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Revenue', value: fmt$(jobs.reduce((s,j)=>s+(j.total||0),0)), color: 'text-green-600' },
          { label: 'Active Jobs', value: jobs.filter(j=>!['FINISH','CANCEL'].includes(j.status)).length, color: 'text-blue-800' },
          { label: 'Low Stock Items', value: countNeedingReorder(inventory), color: 'text-red-600' },
          { label: 'Inventory Value', value: fmt$(inventory.reduce((s,i)=>s+i.stock*(i.unitCost||0),0)), color: 'text-purple-600' },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-xl p-4" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
            <p className="text-xs" style={{ color: T.textMuted }}>{kpi.label}</p>
            <p className={`text-xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl p-4" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <h3 className="font-semibold text-sm mb-3">Revenue by Month</h3>
          {revenueByMonth.length === 0 ? <p className="text-sm text-center py-8" style={{ color: T.textFaint }}>No data</p> : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={revenueByMonth}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={v => fmt$(v)} />
                <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="rounded-xl p-4" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <h3 className="font-semibold text-sm mb-3">Jobs by Status</h3>
          {jobsByStatus.length === 0 ? <p className="text-sm text-center py-8" style={{ color: T.textFaint }}>No data</p> : (
            <ResponsiveContainer width="100%" height={200}>
              <RechartsPie>
                <Pie data={jobsByStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, value }) => `${name}: ${value}`}>
                  {jobsByStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </RechartsPie>
            </ResponsiveContainer>
          )}
        </div>
        <div className="rounded-xl p-4" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <h3 className="font-semibold text-sm mb-3">Top Customers by Revenue</h3>
          {topCustomers.length === 0 ? <p className="text-sm text-center py-8" style={{ color: T.textFaint }}>No data</p> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topCustomers} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                <Tooltip formatter={v => fmt$(v)} />
                <Bar dataKey="revenue" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="rounded-xl p-4" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
          <h3 className="font-semibold text-sm mb-3">Inventory Value by Category</h3>
          {invByCategory.length === 0 ? <p className="text-sm text-center py-8" style={{ color: T.textFaint }}>No data</p> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={invByCategory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={v => fmt$(v)} />
                <Bar dataKey="value" fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main ReportsModule ─────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'sales', label: 'Sales Summary', icon: TrendingUp },
  { id: 'gst', label: 'GST Report', icon: DollarSign },
  { id: 'aged', label: 'Aged Receivables', icon: Users },
  { id: 'agedpay', label: 'Aged Payables', icon: DollarSign },
  { id: 'inventory', label: 'Inventory Valuation', icon: Package },
  { id: 'profitability', label: 'Job Profitability', icon: BarChart3 },
  { id: 'ontime', label: 'On-Time Delivery', icon: Clock },
  { id: 'backorders', label: 'Back Orders', icon: AlertTriangle },
  { id: 'decoration', label: 'Decoration Mix', icon: Layers },
];

export default function ReportsModule({ jobs = [], inventory = [], suppliers = [], purchaseOrders = [], onOpenJob, onNavigateToPO }) {
  const [tab, setTab] = useState('overview');

  return (
    <div className="space-y-4">
      <div className="flex gap-1 pb-0" style={{ borderBottom: `1px solid ${T.hairline}` }}>
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
              style={tab === t.id
                ? { borderBottomColor: T.accentStrong, color: T.accentStrong }
                : { borderBottomColor: 'transparent', color: T.textMuted }}
            >
              <Icon className="w-3.5 h-3.5" />{t.label}
            </button>
          );
        })}
      </div>
      <div>
        {tab === 'overview'    && <OverviewTab jobs={jobs} inventory={inventory} />}
        {tab === 'sales'       && <SalesSummaryTab />}
        {tab === 'gst'         && <GSTTab />}
        {tab === 'aged'        && <AgedReceivablesTab />}
        {tab === 'agedpay'     && <AgedPayablesTab />}
        {tab === 'inventory'   && <InventoryValuationTab />}
        {tab === 'profitability' && <JobProfitabilityTab />}
        {tab === 'ontime'      && <OnTimeDeliveryTab />}
        {tab === 'backorders'  && <BackOrdersTab onOpenJob={onOpenJob} suppliers={suppliers} purchaseOrders={purchaseOrders} onNavigateToPO={onNavigateToPO} />}
        {tab === 'decoration'  && <DecorationPerformanceTab />}
      </div>
    </div>
  );
}
