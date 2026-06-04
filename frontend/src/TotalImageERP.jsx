import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Package, Users, User, FileText, BarChart3, Warehouse, Plus, Edit, Trash2, Eye, DollarSign, TrendingUp, ShoppingCart, AlertCircle, X, Calendar, Printer, Download, Bell, Save, Mail, Phone, MapPin, CreditCard, Box, Truck, FileSpreadsheet, LogOut, Bot, Send, RefreshCw, PieChart, ClipboardList, Layers, ChevronDown, ChevronRight, Tag, CheckSquare, BookOpen, Navigation, Weight, Ruler, Settings, ExternalLink, Copy, LayoutGrid, Clock } from 'lucide-react';
import * as api from './api';
import { BarChart, Bar, LineChart, Line, PieChart as RechartsPie, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ReportsModule from './modules/ReportsModule';
import EmailModule from './modules/EmailModule';
import SettingsModule from './modules/SettingsModule';
import UserManagement from './modules/UserManagement';
import StylesModule from './modules/StylesModule';
import SchedulingModule from './modules/SchedulingModule';
import AccountsPayableModule from './modules/AccountsPayableModule';

const DEC_OPTIONS = [
  { v: 'None',   l: 'None',          emoji: '',    dot: 'bg-gray-300',    pill: 'bg-gray-100 text-gray-500 border-gray-200' },
  { v: 'EMB',    l: 'Embroidery',    emoji: '🧵', dot: 'bg-purple-500',  pill: 'bg-purple-50 text-purple-700 border-purple-200', codeKey: 'embCode', codeHolder: 'EMB code…', codeRing: 'focus:ring-purple-400 text-purple-700 border-purple-300' },
  { v: 'TRS',    l: 'Transfer',      emoji: '♨️',  dot: 'bg-orange-500',  pill: 'bg-orange-50 text-orange-700 border-orange-200', codeKey: 'trsCode', codeHolder: 'TRS code…', codeRing: 'focus:ring-orange-400 text-orange-700 border-orange-300' },
  { v: 'Screen', l: 'Screen Print',  emoji: '🖨️',  dot: 'bg-blue-500',    pill: 'bg-blue-50 text-blue-700 border-blue-200' },
  { v: 'DTF',    l: 'DTF Print',     emoji: '🖨️',  dot: 'bg-teal-500',    pill: 'bg-teal-50 text-teal-700 border-teal-200' },
  { v: 'Laser',  l: 'Laser Engrave', emoji: '⚡',  dot: 'bg-red-500',     pill: 'bg-red-50 text-red-700 border-red-200' },
  { v: 'Sub',    l: 'Sublimation',   emoji: '🌈', dot: 'bg-pink-500',    pill: 'bg-pink-50 text-pink-700 border-pink-200' },
  { v: 'Pad',    l: 'Pad Print',     emoji: '🔵', dot: 'bg-blue-600',    pill: 'bg-blue-50 text-blue-700 border-blue-200' },
  { v: 'Vinyl',  l: 'Vinyl Cut',     emoji: '✂️',  dot: 'bg-green-500',   pill: 'bg-green-50 text-green-700 border-green-200' },
];

const DraggableModal = ({ onClose, children, cardClass = '', cardStyle = {}, overlayClass = '' }) => {
  const [pos, setPos] = useState(null);
  const cardRef = useRef(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button,input,select,textarea,a,[role="option"],[data-no-drag]')) return;
    e.preventDefault();
    const rect = cardRef.current.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const onMove = (mv) => setPos({ x: mv.clientX - dragOffset.current.x, y: mv.clientY - dragOffset.current.y });
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  return (
    <div className={`fixed inset-0 bg-black/50 z-50 ${overlayClass}`} onClick={onClose}>
      <div
        ref={cardRef}
        className={`absolute bg-white rounded-xl shadow-2xl ${cardClass}`}
        style={pos
          ? { left: pos.x, top: pos.y, cursor: 'default', ...cardStyle }
          : { left: '50%', top: '50%', transform: 'translate(-50%,-50%)', cursor: 'default', ...cardStyle }
        }
        onClick={(e) => e.stopPropagation()}
        onMouseDown={handleMouseDown}
      >
        {children}
      </div>
    </div>
  );
};

const WAREHOUSE_ZONES = [
  { zone: 'A', rows: 15, bays: 8, capacity: 480, utilization: 78, items: 342, description: 'General Apparel' },
  { zone: 'B', rows: 12, bays: 6, capacity: 288, utilization: 92, items: 418, description: 'Shirts & Polos' },
  { zone: 'C', rows: 10, bays: 5, capacity: 200, utilization: 65, items: 234, description: 'Outerwear & Jackets' },
  { zone: 'D', rows: 8, bays: 4, capacity: 128, utilization: 45, items: 127, description: 'Accessories & Services' },
];

function POGoodsReceiptsPanel({ po }) {
  const queryClient = useQueryClient();
  const { data: receipts = [], isFetching, refetch } = useQuery({
    queryKey: ['goods-receipts', po.id],
    queryFn: () => api.goodsReceipts.list({ po_id: po.id }),
    staleTime: 30000,
  });

  const [showForm, setShowForm] = React.useState(false);
  const [formLines, setFormLines] = React.useState([]);
  const [grRef, setGrRef] = React.useState('');
  const [grNotes, setGrNotes] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState('');
  const today = new Date().toISOString().slice(0, 10);

  function openForm() {
    setFormLines((po.items || []).map(item => ({
      sku: item.sku,
      description: item.description,
      qtyExpected: item.qtyOrdered - item.qtyReceived,
      qtyReceived: item.qtyOrdered - item.qtyReceived,
      unitCost: item.unitCost,
      condition: 'Good',
    })));
    setGrRef('');
    setGrNotes('');
    setErr('');
    setShowForm(true);
  }

  async function submitGR() {
    const lines = formLines.filter(l => l.qtyReceived > 0);
    if (!lines.length) { setErr('Enter at least one received quantity > 0'); return; }
    setSaving(true); setErr('');
    try {
      await api.goodsReceipts.create({
        poId: po.id,
        supplierName: po.supplier,
        supplierId: po.supplierCode,
        receivedDate: today,
        reference: grRef || null,
        notes: grNotes || null,
        lines: formLines.map(l => ({ ...l })),
      });
      queryClient.invalidateQueries(['goods-receipts', po.id]);
      queryClient.invalidateQueries(['purchaseOrders']);
      queryClient.invalidateQueries(['inventory']);
      setShowForm(false);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  async function accept(id) {
    await api.goodsReceipts.accept(id);
    queryClient.invalidateQueries(['goods-receipts', po.id]);
    queryClient.invalidateQueries(['purchaseOrders']);
    queryClient.invalidateQueries(['inventory']);
  }

  async function reject(id) {
    if (!window.confirm('Reject this goods receipt?')) return;
    await api.goodsReceipts.reject(id);
    queryClient.invalidateQueries(['goods-receipts', po.id]);
  }

  const statusCls = { Pending: 'bg-amber-100 text-amber-700', Accepted: 'bg-emerald-100 text-emerald-700', Rejected: 'bg-red-100 text-red-600', Inspecting: 'bg-blue-100 text-blue-700' };

  return (
    <div className="px-5 py-4 border-t border-gray-100 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Goods Receipts</h4>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
            <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          {!['Received', 'Cancelled'].includes(po.status) && !showForm && (
            <button onClick={openForm}
              className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700">
              <Plus className="w-3 h-3" />New Receipt
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-[10px] font-medium text-gray-500 block mb-0.5">Delivery Reference</label>
              <input className="w-full border rounded px-2 py-1 text-xs" value={grRef} onChange={e => setGrRef(e.target.value)} placeholder="e.g. DEL-001234" /></div>
            <div><label className="text-[10px] font-medium text-gray-500 block mb-0.5">Notes</label>
              <input className="w-full border rounded px-2 py-1 text-xs" value={grNotes} onChange={e => setGrNotes(e.target.value)} /></div>
          </div>
          {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{err}</p>}
          <table className="w-full text-xs border rounded overflow-hidden">
            <thead className="bg-gray-100 border-b">
              <tr>
                {['SKU','Expected','Received','Condition'].map(h => <th key={h} className="text-left px-2 py-1.5 font-semibold text-gray-600">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {formLines.map((ln, idx) => (
                <tr key={ln.sku} className="border-b last:border-0">
                  <td className="px-2 py-1.5 font-mono font-bold text-indigo-700">{ln.sku}</td>
                  <td className="px-2 py-1.5 text-center text-gray-500">{ln.qtyExpected}</td>
                  <td className="px-2 py-1.5">
                    <input type="number" min="0" max={ln.qtyExpected}
                      value={formLines[idx].qtyReceived}
                      onChange={e => setFormLines(lines => lines.map((l, i) => i === idx ? { ...l, qtyReceived: parseInt(e.target.value) || 0 } : l))}
                      className="w-16 border rounded px-1.5 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-emerald-400 font-semibold text-emerald-700" />
                  </td>
                  <td className="px-2 py-1.5">
                    <select value={formLines[idx].condition}
                      onChange={e => setFormLines(lines => lines.map((l, i) => i === idx ? { ...l, condition: e.target.value } : l))}
                      className="border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400">
                      {['Good','Damaged','Short','Surplus'].map(c => <option key={c}>{c}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-3 py-1 text-xs text-gray-600 hover:text-gray-800">Cancel</button>
            <button onClick={submitGR} disabled={saving}
              className="px-3 py-1 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-1">
              {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}Save Receipt
            </button>
          </div>
        </div>
      )}

      {receipts.length === 0 && !showForm ? (
        <p className="text-xs text-gray-400 text-center py-4">No goods receipts yet.</p>
      ) : (
        receipts.map(gr => (
          <div key={gr.id} className="border border-gray-100 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-gray-700">GR-{gr.id}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${statusCls[gr.status] || 'bg-gray-100 text-gray-600'}`}>{gr.status}</span>
              <span className="text-xs text-gray-400">{gr.receivedDate}</span>
              {gr.reference && <span className="text-xs text-gray-500">· {gr.reference}</span>}
              <div className="ml-auto flex gap-1">
                {gr.status === 'Pending' && (
                  <>
                    <button onClick={() => accept(gr.id)}
                      className="px-2 py-0.5 text-[10px] bg-emerald-600 text-white rounded font-semibold hover:bg-emerald-700">Accept</button>
                    <button onClick={() => reject(gr.id)}
                      className="px-2 py-0.5 text-[10px] bg-red-100 text-red-600 rounded font-semibold hover:bg-red-200">Reject</button>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {(gr.lines || []).map(ln => (
                <div key={ln.id} className="flex items-center gap-1 text-[10px] bg-gray-50 border border-gray-100 rounded px-2 py-1">
                  <span className="font-mono font-bold text-indigo-600">{ln.sku}</span>
                  <span className={ln.condition !== 'Good' ? 'text-amber-600 font-semibold' : 'text-gray-500'}>×{ln.qtyReceived}</span>
                  {ln.condition !== 'Good' && <span className="text-amber-600">({ln.condition})</span>}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function SupplierPriceListPanel({ supplierId }) {
  const queryClient = useQueryClient();
  const { data: items = [], isFetching, refetch } = useQuery({
    queryKey: ['supplier-price-list', supplierId],
    queryFn: () => api.supplierPriceLists.list(supplierId),
    staleTime: 30000,
  });

  const emptyForm = { sku: '', description: '', unitCost: '', minQty: 1, leadTimeDays: '', validFrom: '', validTo: '', notes: '' };
  const [form, setForm] = React.useState(null);
  const [editId, setEditId] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState('');

  async function save() {
    if (!form.sku || !form.unitCost) { setErr('SKU and Unit Cost are required'); return; }
    setSaving(true); setErr('');
    try {
      if (editId) {
        await api.supplierPriceLists.update(supplierId, editId, { ...form, unitCost: parseFloat(form.unitCost) });
      } else {
        await api.supplierPriceLists.create(supplierId, { ...form, unitCost: parseFloat(form.unitCost) });
      }
      queryClient.invalidateQueries(['supplier-price-list', supplierId]);
      setForm(null); setEditId(null);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  async function del(id) {
    if (!window.confirm('Remove this price list entry?')) return;
    await api.supplierPriceLists.delete(supplierId, id);
    queryClient.invalidateQueries(['supplier-price-list', supplierId]);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Contracted prices &amp; lead times from this supplier</p>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
            <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />Refresh
          </button>
          <button onClick={() => { setForm({ ...emptyForm }); setEditId(null); setErr(''); }}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-700 text-white text-xs font-semibold rounded-lg hover:bg-blue-800">
            <Plus className="w-3 h-3" />Add Price
          </button>
        </div>
      </div>

      {form && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-semibold text-indigo-800">{editId ? 'Edit' : 'Add'} Price List Entry</h4>
          {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{err}</p>}
          <div className="grid grid-cols-3 gap-2">
            <div><label className="text-[10px] font-medium text-gray-500 block mb-0.5">SKU *</label>
              <input className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" value={form.sku}
                onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} disabled={!!editId} /></div>
            <div><label className="text-[10px] font-medium text-gray-500 block mb-0.5">Unit Cost *</label>
              <input type="number" min="0" step="0.01" className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" value={form.unitCost}
                onChange={e => setForm(f => ({ ...f, unitCost: e.target.value }))} /></div>
            <div><label className="text-[10px] font-medium text-gray-500 block mb-0.5">Min Qty</label>
              <input type="number" min="1" className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" value={form.minQty}
                onChange={e => setForm(f => ({ ...f, minQty: parseInt(e.target.value) || 1 }))} /></div>
            <div><label className="text-[10px] font-medium text-gray-500 block mb-0.5">Lead Time (days)</label>
              <input type="number" min="0" className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" value={form.leadTimeDays}
                onChange={e => setForm(f => ({ ...f, leadTimeDays: e.target.value }))} /></div>
            <div><label className="text-[10px] font-medium text-gray-500 block mb-0.5">Valid From</label>
              <input type="date" className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" value={form.validFrom}
                onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))} /></div>
            <div><label className="text-[10px] font-medium text-gray-500 block mb-0.5">Valid To</label>
              <input type="date" className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" value={form.validTo}
                onChange={e => setForm(f => ({ ...f, validTo: e.target.value }))} /></div>
            <div className="col-span-3"><label className="text-[10px] font-medium text-gray-500 block mb-0.5">Description / Notes</label>
              <input className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setForm(null); setEditId(null); }} className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800">Cancel</button>
            <button onClick={save} disabled={saving} className="px-3 py-1.5 text-xs bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-60 flex items-center gap-1">
              {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}Save
            </button>
          </div>
        </div>
      )}

      {items.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['SKU','Unit Cost','Min Qty','Lead Time','Valid','Notes',''].map(h => (
                  <th key={h} className="text-left px-2 py-2 font-semibold text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-2 py-2 font-mono font-bold text-indigo-700">{item.sku}</td>
                  <td className="px-2 py-2 font-semibold text-gray-800">${parseFloat(item.unit_cost || 0).toFixed(2)}</td>
                  <td className="px-2 py-2 text-gray-600">{item.min_qty || 1}</td>
                  <td className="px-2 py-2 text-gray-500">{item.lead_time_days ? `${item.lead_time_days}d` : '—'}</td>
                  <td className="px-2 py-2 text-gray-500 text-[10px]">
                    {item.valid_from && item.valid_to ? `${item.valid_from} – ${item.valid_to}` : item.valid_from || item.valid_to || '—'}
                  </td>
                  <td className="px-2 py-2 text-gray-500 max-w-28 truncate" title={item.notes}>{item.notes || '—'}</td>
                  <td className="px-2 py-2">
                    <div className="flex gap-1">
                      <button onClick={() => { setEditId(item.id); setForm({ sku: item.sku, description: item.description || '', unitCost: item.unit_cost, minQty: item.min_qty || 1, leadTimeDays: item.lead_time_days || '', validFrom: item.valid_from || '', validTo: item.valid_to || '', notes: item.notes || '' }); setErr(''); }}
                        className="p-1 hover:bg-indigo-50 rounded text-indigo-500"><Edit className="w-3 h-3" /></button>
                      <button onClick={() => del(item.id)} className="p-1 hover:bg-red-50 rounded text-red-400"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !isFetching && <p className="text-sm text-gray-400 text-center py-8">No price list entries yet.</p>
      )}
    </div>
  );
}

function EmailJobModal({ job, customers, onClose }) {
  const qc = useQueryClient();
  const isQuote = job.status === 'QUOTE';
  const cust = customers.find(c => c.id === job.customerId) || {};
  const [form, setForm] = useState({
    to_email: cust.email || '',
    cc: '',
    subject: isQuote
      ? `Quote #${job.id} – ${job.customer}`
      : `Invoice #${job.invoice || job.id} – ${job.customer}`,
    message: '',
    email_type: isQuote ? 'quote' : 'invoice',
  });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    if (!form.to_email.trim()) { setError('Recipient email is required'); return; }
    setSending(true);
    setError('');
    try {
      await api.email.send({ job_id: String(job.id), ...form });
      setSent(true);
      qc.invalidateQueries(['email-log']);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <DraggableModal onClose={onClose} cardClass="w-full max-w-lg">
      <div className="flex items-center justify-between px-5 py-3.5 border-b">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-indigo-600" />
          <span className="font-semibold text-gray-800">Email {isQuote ? 'Quote' : 'Invoice'}</span>
          <span className="text-xs text-gray-400 font-mono">#{job.invoice || job.id}</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
      </div>
      {sent ? (
        <div className="px-6 py-10 text-center">
          <div className="text-5xl mb-3 text-green-500">✓</div>
          <p className="text-gray-700 font-medium">Email sent to {form.to_email}</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm hover:bg-blue-800">Close</button>
        </div>
      ) : (
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">To *</label>
            <input type="email" value={form.to_email} onChange={e => setForm({ ...form, to_email: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="customer@example.com" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">CC</label>
            <input type="email" value={form.cc} onChange={e => setForm({ ...form, cc: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="optional" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
            <input type="text" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
            <select value={form.email_type} onChange={e => setForm({ ...form, email_type: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
              <option value="invoice">Invoice</option>
              <option value="quote">Quote</option>
              <option value="reminder">Payment Reminder</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Message (optional)</label>
            <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
              rows={4} placeholder="Add a personal note…"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={send} disabled={sending}
              className="px-4 py-2 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50 flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5" />{sending ? 'Sending…' : 'Send Email'}
            </button>
          </div>
        </div>
      )}
    </DraggableModal>
  );
}

function ProofPanel({ job, onUpdate }) {
  const PROOF_STYLES = {
    none:     'bg-gray-100 text-gray-500',
    sent:     'bg-blue-100 text-blue-700',
    approved: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-red-100 text-red-700',
  };
  const [proofNotes, setProofNotes] = useState(job.proofNotes || '');
  const [saving, setSaving] = useState(false);

  const update = async (status, notes) => {
    setSaving(true);
    try { await onUpdate(status, notes ?? proofNotes); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-2.5">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Proof Approval</h4>
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${PROOF_STYLES[job.proofStatus] || PROOF_STYLES.none}`}>
          {job.proofStatus === 'none' ? 'No proof' : job.proofStatus}
        </span>
      </div>
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-1">
          <button onClick={() => update('sent')} disabled={saving}
            className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${job.proofStatus === 'sent' ? 'bg-blue-600 text-white' : 'bg-blue-50 hover:bg-blue-100 text-blue-700'}`}>
            <Send className="w-3 h-3" />Sent to Client
          </button>
          <button onClick={() => update('approved')} disabled={saving}
            className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${job.proofStatus === 'approved' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'}`}>
            <CheckSquare className="w-3 h-3" />Approved
          </button>
          <button onClick={() => update('rejected')} disabled={saving}
            className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${job.proofStatus === 'rejected' ? 'bg-red-600 text-white' : 'bg-red-50 hover:bg-red-100 text-red-700'}`}>
            <X className="w-3 h-3" />Rejected
          </button>
          <button onClick={() => update('none', '')} disabled={saving}
            className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium bg-gray-50 hover:bg-gray-100 text-gray-500 transition-colors">
            Clear
          </button>
        </div>
        <textarea
          value={proofNotes}
          onChange={e => setProofNotes(e.target.value)}
          onBlur={() => { if (proofNotes !== job.proofNotes) update(job.proofStatus || 'none', proofNotes); }}
          rows={2}
          placeholder="Proof notes (revision requests, approval notes…)"
          className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none text-gray-600"
        />
      </div>
    </div>
  );
}

const DEFAULT_SIZES = ['XS','S','M','L','XL','2XL','3XL'];
const SIZE_PRESETS = ['4XS','3XS','2XS','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'];
const COLOUR_PRESETS = ['Black','White','Navy','Red','Royal Blue','Grey','Green','Maroon','Gold','Sky'];

function SizeColourMatrixPopup({ current, onApply, onClose }) {
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
                        className="w-full text-center text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded px-1 py-0.5" />
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
              placeholder="Custom…" className="w-20 border rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
          </div>
          {useColours && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-gray-500 font-medium">Add colour:</span>
              {COLOUR_PRESETS.filter(c => !colours.includes(c)).slice(0, 6).map(c => (
                <button key={c} onClick={() => addColour(c)} className="px-2 py-0.5 border border-gray-300 rounded hover:bg-gray-100">{c}</button>
              ))}
              <input value={newColour} onChange={e => setNewColour(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newColour.trim()) { addColour(newColour.trim()); setNewColour(''); }}}
                placeholder="Custom…" className="w-20 border rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
          <span className="text-sm text-gray-600">Grand total: <span className="font-bold text-gray-900 text-base">{grandTotal} pcs</span></span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
            <button onClick={handleApply} className="px-5 py-2 bg-blue-700 text-white rounded-lg text-sm font-semibold hover:bg-blue-800">
              Apply{grandTotal > 0 ? ` (${grandTotal} pcs)` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const TotalImageERP = ({ currentUser, onLogout }) => {
  const [activeModule, setActiveModule] = useState('dashboard');
  const [pinnedJobs, setPinnedJobs] = useState([]);
  const [activeJob, setActiveJob] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [editingItem, setEditingItem] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [jobsViewMode, setJobsViewMode] = useState('table');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterCustomer, setFilterCustomer] = useState('all');
  const [filterAssignedTo, setFilterAssignedTo] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterDateField, setFilterDateField] = useState('dateIn');
  const [filterShipCode, setFilterShipCode] = useState('all');
  const [filterCustomerGroup, setFilterCustomerGroup] = useState('all');
  const [filterOpenFreight, setFilterOpenFreight] = useState(false);
  const [filterQuick, setFilterQuick] = useState(null);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [confirmModal, setConfirmModal] = useState({ show: false, message: '', onConfirm: null });
  const [paymentModal, setPaymentModal] = useState({ show: false, jobId: null, maxAmount: 0, amount: '', method: 'Credit Card' });
  const [stockAdjustModal, setStockAdjustModal] = useState({ show: false, sku: '', name: '', currentStock: 0, adjustment: '', reason: '' });
  const [commentInput, setCommentInput] = useState('');
  const [openDecIdx, setOpenDecIdx] = useState(null);
  const [skuDropdown, setSkuDropdown] = useState({ idx: -1, query: '', highlighted: 0, rect: null });
  const [descDropdown, setDescDropdown] = useState({ idx: -1, query: '', highlighted: 0, rect: null });
  const [poSkuDropdown, setPoSkuDropdown] = useState({ idx: -1, query: '', highlighted: 0 });
  const [custDropdown, setCustDropdown] = useState({ open: false, query: '', highlighted: 0 });
  const [shipDropdown, setShipDropdown] = useState({ open: false, query: '', highlighted: 0 });
  const [assignedDropdown, setAssignedDropdown] = useState({ open: false, query: '', highlighted: 0 });
  const [categoryDropdown, setCategoryDropdown] = useState({ open: false, query: '', highlighted: 0 });
  const [locationDropdown, setLocationDropdown] = useState({ open: false, query: '', highlighted: 0 });
  const [supplierDropdown, setSupplierDropdown] = useState({ open: false, query: '', highlighted: 0 });
  const [searchSuggestOpen, setSearchSuggestOpen] = useState(false);
  const [colWidths, setColWidths] = useState({ stock: 130, desc: 210, order: 58, supply: 56, bord: 52, priceEx: 76, priceInc: 76, margin: 52, total: 76, hide: 32 });
  const [lineItemsHeight, setLineItemsHeight] = useState(480);
  const [ctxMenu, setCtxMenu] = useState({ visible: false, x: 0, y: 0, rowIdx: -1 });

  const [apiError, setApiError] = useState('');

  const queryClient = useQueryClient();
  const { data: jobs = [], isLoading: jobsLoading } = useQuery({ queryKey: ['jobs'], queryFn: api.jobs.list, refetchInterval: 60_000 });
  const { data: inventory = [], isLoading: invLoading } = useQuery({ queryKey: ['inventory'], queryFn: api.inventory.list, refetchInterval: 60_000 });
  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: api.customers.list });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: api.suppliers.list });
  const { data: purchaseOrders = [] } = useQuery({ queryKey: ['purchaseOrders'], queryFn: api.purchaseOrders.list, refetchInterval: 60_000 });
  const { data: garmentReqs = [], refetch: refetchGarmentReqs } = useQuery({ queryKey: ['orderRequirements', 'garment'], queryFn: () => api.jobs.orderRequirements('garment'), enabled: activeModule === 'order-requirements', staleTime: 0 });
  const { data: decorationReqs = [], refetch: refetchDecorationReqs } = useQuery({ queryKey: ['orderRequirements', 'decoration'], queryFn: () => api.jobs.orderRequirements('decoration'), enabled: activeModule === 'order-requirements', staleTime: 0 });
  const { data: stockMovements = [] } = useQuery({ queryKey: ['stockMovements'], queryFn: () => api.inventory.movements({ limit: 50 }), refetchInterval: 60_000 });
  const { data: cardFiles = [] } = useQuery({ queryKey: ['cardFiles'], queryFn: api.cardFiles.list });
  const { data: ofParcels = [] } = useQuery({ queryKey: ['ofParcels'], queryFn: api.openFreight.listParcels });
  const loading = (jobsLoading && !jobs.length) || (invLoading && !inventory.length);
  const [cardFileModal, setCardFileModal] = useState({ open: false, editing: null });
  const [cardFileForm, setCardFileForm] = useState({ shipCode: '', customerCode: '', companyName: '', contactName: '', address1: '', address2: '', suburb: '', state: '', postcode: '', country: 'AU', phone: '', email: '', notes: '' });
  const [selectedCardFile, setSelectedCardFile] = useState(null);
  const [cardFileSearch, setCardFileSearch] = useState('');
  const [cardFileGroup, setCardFileGroup] = useState('all');

  // Open Freight
  const [ofModalOpen, setOfModalOpen] = useState(false);
  const [ofTab, setOfTab] = useState('parcels');
  const [ofAccount, setOfAccount] = useState({ accountNumber: '', accountName: '', depot: '', contactName: '', contactPhone: '', contactEmail: '', apiKey: '', apiKeySet: false, notes: '' });
  const [ofAccountDirty, setOfAccountDirty] = useState(false);
  const [ofParcelModal, setOfParcelModal] = useState({ open: false, editing: null });
  const [ofParcelForm, setOfParcelForm] = useState({ name: '', parcelType: '', service: 'Standard', carrierCode: '', maxWeightKg: '', lengthCm: '', widthCm: '', heightCm: '', rate: '', notes: '' });
  const [importFiles, setImportFiles] = useState({});
  const [importResults, setImportResults] = useState({});
  const [importLoading, setImportLoading] = useState({});
  const [importPreviews, setImportPreviews] = useState({});

  // AI Assistant
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMessages, setAiMessages] = useState([
    { role: 'assistant', text: 'Hi! I\'m your ERP assistant — powered by live data + ML analytics.\n\nAsk me about jobs, inventory, revenue, or try:\n• *Forecast next month\'s revenue*\n• *Show anomalies*\n• *Customer churn risk*', ts: new Date() }
  ]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPos, setAiPos] = useState(null);
  const [aiClaudeEnabled, setAiClaudeEnabled] = useState(false);
  const aiEndRef = useRef(null);
  const aiDragOffset = useRef({ x: 0, y: 0 });
  const aiPanelRef = useRef(null);

  useEffect(() => {
    api.ai.status().then(s => setAiClaudeEnabled(!!s?.claude_available)).catch(() => {});
  }, []);
  const jobSearchRef = useRef(null);
  const [f12Open, setF12Open] = useState(false);
  const [f12Input, setF12Input] = useState('');
  const [f12Pos, setF12Pos] = useState(null);
  const f12Ref = useRef(null);
  const f12PopupRef = useRef(null);
  const f12DragOffset = useRef({ x: 0, y: 0 });

  // Warehouse bin map
  const [selectedBin, setSelectedBin] = useState(null);
  const [selectedWarehouseZone, setSelectedWarehouseZone] = useState('A');

  // Inventory module view state
  const [invTab, setInvTab] = useState('stock');
  const [invCatFilter, setInvCatFilter] = useState('all');
  const [invStatusFilter, setInvStatusFilter] = useState('all');

  // Suppliers module
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [suppTab, setSuppTab] = useState('details');

  // Purchase Orders module
  const [selectedPO, setSelectedPO] = useState(null);
  const [poStatusFilter, setPoStatusFilter] = useState('all');
  const [receiveQtys, setReceiveQtys] = useState({});

  // Sidebar nav context menu
  const [navCtxMenu, setNavCtxMenu] = useState({ open: false, x: 0, y: 0, itemId: null, pinnedJobId: null });

  // Jim2-style UI state
  const [tigMenuOpen, setTigMenuOpen] = useState(false);
  const [navExpanded, setNavExpanded] = useState({ jobs: true });
  const [navTreeTab, setNavTreeTab] = useState('navigation');

  // New ribbon action modals
  const [dispatchModal, setDispatchModal] = useState({ open: false, job: null, shipVia: '', shipRef: '', cartons: 1, notes: '', advanceStatus: false, loading: false, error: '' });
  const [unprintModal, setUnprintModal] = useState({ open: false, job: null, loading: false, error: '' });
  const [salesRegModal, setSalesRegModal] = useState({ open: false, loading: false, dateFrom: '', dateTo: '', data: null, error: '' });
  const [transferModal, setTransferModal] = useState({ open: false, fromSku: '', toSku: '', toLocation: '', quantity: 1, reference: '', notes: '', loading: false, error: '' });
  const [stocktakeModal, setStocktakeModal] = useState({ open: false, method: 'Informed', reference: '', items: [], loading: false, error: '', results: null });
  const [stockFlowModal, setStockFlowModal] = useState({ open: false, loading: false, data: null, search: '' });
  const [pickPackModal, setPickPackModal] = useState({ open: false, job: null });
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const globalSearchRef = useRef(null);

  // Job detail / list view separation
  const [showJobDetail, setShowJobDetail] = useState(false);
  const [jobListModal, setJobListModal] = useState({ open: false, name: '', customerId: '', status: '', priority: '' });
  const [activeJobList, setActiveJobList] = useState(null); // { name, customerId, status, priority }

  // Order Requirements module
  const [orderReqTab, setOrderReqTab] = useState('garment');
  const [orderReqSelected, setOrderReqSelected] = useState(new Set());
  const [orderReqPoModal, setOrderReqPoModal] = useState({ open: false, poId: '', supplierId: '', supplierName: '', expectedDate: '', notes: '', saving: false, error: '' });

  // Job detail tabs
  const [jobDetailTab, setJobDetailTab] = useState('job');
  const [pickState, setPickState] = useState({});
  const [printDropdownOpen, setPrintDropdownOpen] = useState(false);
  const [reportDropdownOpen, setReportDropdownOpen] = useState(false);
  const [jobsSort, setJobsSort] = useState({ col: 'dateIn', dir: 'desc' });

  // Customer detail
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [custDetailTab, setCustDetailTab] = useState('overview');

  // Document printing
  const [documentPrint, setDocumentPrint] = useState(null);

  // Invoice
  const [invoiceJob, setInvoiceJob] = useState(null);
  const [emailModalJob, setEmailModalJob] = useState(null);
  const [matrixPopup, setMatrixPopup] = useState(null); // { idx } when open

  // Notifications panel
  const [notifOpen, setNotifOpen] = useState(false);

  // User settings
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [changePasswordForm, setChangePasswordForm] = useState({ current: '', newPass: '', confirm: '' });
  const [changePasswordMsg, setChangePasswordMsg] = useState('');


  // Bulk selection
  const [selectedJobIds, setSelectedJobIds] = useState(new Set());
  const [bulkActionOpen, setBulkActionOpen] = useState(false);

  // Calendar view state
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());

  const [dashActionTab, setDashActionTab] = useState('overdue');

  // Dashboard quick notes
  const [dashNotes, setDashNotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tig_dash_notes') || '[]'); } catch { return []; }
  });
  const [dashNoteInput, setDashNoteInput] = useState('');

  // Job templates (persisted in localStorage)
  const [jobTemplates, setJobTemplates] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tig_job_templates') || '[]'); } catch { return []; }
  });
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateSaveName, setTemplateSaveName] = useState('');
  const [templateSaveOpen, setTemplateSaveOpen] = useState(false);

  // Close context menu on any click outside
  useEffect(() => {
    const close = () => setCtxMenu(m => ({ ...m, visible: false }));
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      // F12 — open quick job lookup popup
      if (e.key === 'F12') {
        e.preventDefault();
        setF12Open(o => { if (!o) { setF12Input(''); setF12Pos(null); } return !o; });
        setTimeout(() => f12Ref.current?.focus(), 50);
        return;
      }
      // Ctrl+S / Cmd+S — save active modal
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (showModal) {
          if (modalType === 'job') saveJob();
          else if (modalType === 'inventory') saveInventoryItem();
          else if (modalType === 'customer') saveCustomer();
          else if (modalType === 'supplier') saveSupplier();
          else if (modalType === 'po') savePO();
        }
        return;
      }
      // Ctrl+K / Cmd+K — global search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setGlobalSearchOpen(true);
        setGlobalSearchQuery('');
        setTimeout(() => globalSearchRef.current?.focus(), 50);
        return;
      }
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.altKey) {
        if (e.key === 'j' || e.key === 'J') { e.preventDefault(); setActiveModule('jobs'); setTimeout(() => jobSearchRef.current?.focus(), 50); }
        if (e.key === 'i' || e.key === 'I') { e.preventDefault(); setActiveModule('inventory'); }
        if (e.key === 'd' || e.key === 'D') { e.preventDefault(); setActiveModule('dashboard'); }
        if (e.key === 'c' || e.key === 'C') { e.preventDefault(); setActiveModule('customers'); }
        if (e.key === 'r' || e.key === 'R') { e.preventDefault(); setActiveModule('reports'); }
        if (e.key === 'n' || e.key === 'N') { e.preventDefault(); if (activeModule === 'jobs') openModal('job'); else if (activeModule === 'inventory') openModal('inventory'); else if (activeModule === 'customers') openModal('customer'); }
      }
      if (e.key === 'Escape') {
        if (globalSearchOpen) { setGlobalSearchOpen(false); return; }
        if (f12Open) { setF12Open(false); return; }
        if (showModal) closeModal();
        if (activeJob) { setPinnedJobs([]); setActiveJob(null); setShowJobDetail(false); }
        setSelectedJobIds(new Set());
        setBulkActionOpen(false);
        setTemplateModalOpen(false);
        setTemplateSaveOpen(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [activeModule, showModal, modalType, activeJob, f12Open, globalSearchOpen]);

  // Load ofAccount on mount (form state — not managed by React Query)
  useEffect(() => {
    api.openFreight.getAccount().then(acc => setOfAccount(acc)).catch(() => {});
  }, []);

  // Derive notifications from live data
  useEffect(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const parseD = (str) => { if (!str) return null; const s = str.split(' ')[0]; const p = s.split('/'); return p.length === 3 ? new Date(`${p[2]}-${p[1]}-${p[0]}`) : new Date(s); };

    const lowStockItems = inventory.filter(item => item.stock < item.reorderLevel);
    const overdueJobs = jobs.filter(job => {
      if (['FINISH','PAID','CANCEL'].includes(job.status)) return false;
      try { const d = parseD(job.due); return d && d < now; } catch { return false; }
    });

    // Quote expiry alerts (within 7 days)
    const in7Days = new Date(now); in7Days.setDate(in7Days.getDate() + 7);
    const expiringQuotes = jobs.filter(j => {
      if (j.status !== 'QUOTE' || !j.validityDate) return false;
      const d = parseD(j.validityDate);
      return d && d >= now && d <= in7Days;
    });

    // Jobs due today
    const dueTodayJobs = jobs.filter(j => {
      if (['FINISH','PAID','CANCEL'].includes(j.status)) return false;
      const d = parseD(j.due);
      return d && d.toISOString().split('T')[0] === todayStr;
    });

    // Credit limit breaches
    const creditBreaches = customers.filter(c => {
      if (!c.creditLimit || c.creditLimit <= 0) return false;
      const outstanding = jobs.filter(j => j.customerId === c.id).reduce((s, j) => s + parseFloat(j.balanceDue || 0), 0);
      return outstanding > c.creditLimit;
    });

    setNotifications([
      ...dueTodayJobs.map(job => ({
        id: `today-${job.id}`, type: 'warning', title: 'Due Today',
        message: `Job #${job.id} for ${job.customer} is due today — ${job.status}`,
        time: 'Today'
      })),
      ...overdueJobs.map(job => ({
        id: `overdue-${job.id}`, type: 'error', title: 'Overdue Job',
        message: `Job #${job.id} for ${job.customer} is overdue. Due: ${job.due}`,
        time: 'Now'
      })),
      ...expiringQuotes.map(job => ({
        id: `quote-exp-${job.id}`, type: 'warning', title: 'Quote Expiring',
        message: `Quote #${job.id} for ${job.customer} expires ${job.validityDate} — follow up needed`,
        time: 'Soon'
      })),
      ...creditBreaches.map(c => ({
        id: `credit-${c.id}`, type: 'error', title: 'Credit Limit Exceeded',
        message: `${c.name} has exceeded their credit limit of $${Number(c.creditLimit).toLocaleString('en-AU')}`,
        time: 'Now'
      })),
      ...lowStockItems.map(item => ({
        id: `low-${item.sku}`, type: 'warning', title: 'Low Stock Alert',
        message: `${item.name} (${item.sku}) is below reorder level. Current: ${item.stock}, Min: ${item.reorderLevel}`,
        time: 'Now'
      })),
    ]);
  }, [inventory, jobs, customers]);

  useEffect(() => {
    if (!tigMenuOpen) return;
    const close = () => setTigMenuOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [tigMenuOpen]);

  useEffect(() => {
    if (!navCtxMenu.open) return;
    const close = () => setNavCtxMenu(m => ({ ...m, open: false }));
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    return () => { window.removeEventListener('click', close); window.removeEventListener('contextmenu', close); };
  }, [navCtxMenu.open]);

  // Form state
  const [jobForm, setJobForm] = useState({
    customer: '',
    customerId: '',
    status: 'ORDER',
    priority: 'Normal',
    type: 'Standard',
    quote: '',
    dateIn: new Date().toISOString().split('T')[0],
    due: '',
    assignedTo: '',
    branch: 'HQ',
    shipToId: null,
    shippingAddress: '',
    paymentMethod: 'Account',
    paymentStatus: 'unpaid',
    commitmentDate: '',
    validityDate: '',
    locked: false,
    invoiceStatus: 'not_invoiced',
    proofStatus: 'none',
    proofNotes: '',
    items: []
  });

  const [inventoryForm, setInventoryForm] = useState({
    sku: '',
    name: '',
    category: '',
    stock: 0,
    reorderLevel: 0,
    location: '',
    supplier: '',
    supplierCode: '',
    unitCost: 0,
    unitPrice: 0,
    minOrder: 1,
    leadTime: 7
  });

  const [customerForm, setCustomerForm] = useState({
    name: '',
    contact: '',
    email: '',
    phone: '',
    mobile: '',
    address: '',
    abn: '',
    accountType: 'Account',
    paymentTerms: 'Net 30',
    creditLimit: 0,
    accountManager: ''
  });

  const [supplierForm, setSupplierForm] = useState({
    code: '',
    name: '',
    contact: '',
    email: '',
    phone: '',
    address: '',
    paymentTerms: 'Net 30',
    currency: 'AUD',
    status: 'Active',
  });

  const [poForm, setPoForm] = useState({
    supplierCode: '',
    supplier: '',
    date: new Date().toISOString().split('T')[0],
    expectedDate: '',
    notes: '',
    items: [],
  });

  // Modal handlers
  const openModal = (type, item = null) => {
    setModalType(type);
    setEditingItem(item);
    
    if (type === 'job') {
      if (item) {
        const parseDateToInput = (dateStr) => {
          if (!dateStr) return '';
          const s = dateStr.split(' ')[0];
          const parts = s.split('/');
          if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
          return s;
        };
        setJobForm({
          ...item,
          dateIn: parseDateToInput(item.dateIn),
          due: parseDateToInput(item.due),
          notes: item.notes || '',
        });
      } else {
        setJobForm({
          customer: '', customerId: '', status: 'ORDER', priority: 'Normal',
          type: 'Standard', quote: '', dateIn: new Date().toISOString().split('T')[0],
          due: '', out: '', assignedTo: '', branch: 'HQ', shipToId: null, shippingAddress: '',
          paymentMethod: 'Account', custRef: '', ourRef: '', description: '', shipTo: '',
          projectNo: '', notes: '', paymentStatus: 'unpaid', commitmentDate: '', validityDate: '',
          locked: false, invoiceStatus: 'not_invoiced', proofStatus: 'none', proofNotes: '',
          fuelLevy: 0, items: []
        });
      }
    } else if (type === 'inventory') {
      if (item) {
        const matchedSupplier = suppliers.find(s => s.name === item.supplier);
        setInventoryForm({ ...item, supplierCode: matchedSupplier?.code || '' });
      } else {
        setInventoryForm({
          sku: '',
          name: '',
          category: '',
          stock: 0,
          reorderLevel: 0,
          location: '',
          supplier: '',
          supplierCode: '',
          unitCost: 0,
          unitPrice: 0,
          minOrder: 1,
          leadTime: 7
        });
      }
    } else if (type === 'customer') {
      if (item) {
        setCustomerForm(item);
      } else {
        setCustomerForm({
          name: '',
          contact: '',
          email: '',
          phone: '',
          mobile: '',
          address: '',
          abn: '',
          accountType: 'Account',
          paymentTerms: 'Net 30',
          creditLimit: 0,
          accountManager: ''
        });
      }
    } else if (type === 'supplier') {
      if (item) {
        setSupplierForm(item);
      } else {
        setSupplierForm({ code: '', name: '', contact: '', email: '', phone: '', address: '', paymentTerms: 'Net 30', currency: 'AUD', status: 'Active' });
      }
    } else if (type === 'po') {
      setPoForm({ supplierCode: '', supplier: '', date: new Date().toISOString().split('T')[0], expectedDate: '', notes: '', items: [] });
    }

    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setModalType('');
    setEditingItem(null);
    setCustDropdown({ open: false, query: '', highlighted: 0 });
    setShipDropdown({ open: false, query: '', highlighted: 0 });
    setAssignedDropdown({ open: false, query: '', highlighted: 0 });
    setCategoryDropdown({ open: false, query: '', highlighted: 0 });
    setLocationDropdown({ open: false, query: '', highlighted: 0 });
    setDescDropdown({ idx: -1, query: '', highlighted: 0 });
    setPoSkuDropdown({ idx: -1, query: '', highlighted: 0 });
  };

  // ── Job item helpers ──────────────────────────────────────────────────────
  const startLineItemsResize = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = lineItemsHeight;
    const onMove = (ev) => setLineItemsHeight(Math.max(120, startH + ev.clientY - startY));
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const startColResize = (col, e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = colWidths[col];
    const onMove = (ev) => setColWidths(w => ({ ...w, [col]: Math.max(48, startW + ev.clientX - startX) }));
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const blankItem = () => ({
    displayType: 'product', decorationType: 'None',
    description: '', sizes: '', stockCode: '', embCode: '', trsCode: '',
    order: 0, supply: 0, bOrd: 0, purchasePrice: 0, discount: 0, marginPercent: 0, margin: 0,
    priceEx: 0, priceInc: 0, total: 0,
    qtyDelivered: 0, qtyInvoiced: 0, qtyPick: 0, poNo: '', poDue: '', hide: false,
  });

  const addJobItem = () => setJobForm(f => ({
    ...f,
    items: [...f.items, blankItem()]
  }));

  const removeJobItem = (idx) => setJobForm(f => {
    const items = f.items.filter((_, i) => i !== idx);
    return recalcJobTotals({ ...f, items });
  });
  const ctxAddAbove = (idx) => setJobForm(f => { const items = [...f.items]; items.splice(idx, 0, blankItem()); return { ...f, items }; });
  const ctxAddBelow = (idx) => setJobForm(f => { const items = [...f.items]; items.splice(idx + 1, 0, blankItem()); return { ...f, items }; });
  const ctxDuplicate = (idx) => setJobForm(f => { const items = [...f.items]; items.splice(idx + 1, 0, { ...items[idx] }); return { ...f, items }; });
  const ctxMoveUp = (idx) => setJobForm(f => { if (idx === 0) return f; const items = [...f.items]; [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]]; return { ...f, items }; });
  const ctxMoveDown = (idx) => setJobForm(f => { if (idx >= f.items.length - 1) return f; const items = [...f.items]; [items[idx], items[idx + 1]] = [items[idx + 1], items[idx]]; return { ...f, items }; });
  const ctxClearRow = (idx) => setJobForm(f => { const items = f.items.map((it, i) => i === idx ? blankItem() : it); return recalcJobTotals({ ...f, items }); });
  const closeCtx = () => setCtxMenu(m => ({ ...m, visible: false }));

  const updateJobItem = (idx, field, value) => setJobForm(f => {
    const items = [...f.items];
    items[idx] = { ...items[idx], [field]: value };
    // Clear stale decoration codes when type changes
    if (field === 'decorationType') {
      if (value !== 'EMB') items[idx].embCode = '';
      if (value !== 'TRS') items[idx].trsCode = '';
    }
    const it = items[idx];
    const qty = parseFloat(field === 'order' ? value : it.order) || 0;
    const bOrd = parseFloat(field === 'bOrd' ? value : it.bOrd) || 0;

    // Look up stock on hand for the linked SKU (null if no SKU or not in inventory)
    const stockCode = field === 'stockCode' ? value : it.stockCode;
    const invItem = stockCode ? inventory.find(i => i.sku === stockCode) : null;
    const soh = invItem != null ? Math.max(0, invItem.stock) : null; // null = unknown/no link

    if (soh !== null) {
      // Stock-linked item: supply is always capped at what's on hand
      if (field === 'stockCode' || field === 'order') {
        const canSupply = Math.min(qty, soh);
        items[idx].supply = canSupply;
        items[idx].bOrd = Math.max(0, qty - canSupply);
      } else if (field === 'supply') {
        const capped = Math.min(Math.max(0, parseFloat(value) || 0), soh);
        items[idx].supply = capped;
        items[idx].bOrd = Math.max(0, qty - capped);
      } else if (field === 'bOrd') {
        const derivedSupply = Math.min(Math.max(0, qty - bOrd), soh);
        items[idx].supply = derivedSupply;
        items[idx].bOrd = Math.max(0, qty - derivedSupply);
      }
    } else {
      // No inventory link — free split
      const supply = parseFloat(field === 'supply' ? value : it.supply) || 0;
      if (field === 'order' || field === 'supply') {
        items[idx].bOrd = Math.max(0, qty - supply);
      } else if (field === 'bOrd') {
        items[idx].supply = Math.max(0, qty - bOrd);
      }
    }
    let priceEx = parseFloat(field === 'priceEx' ? value : it.priceEx) || 0;
    const purchasePrice = parseFloat(field === 'purchasePrice' ? value : it.purchasePrice) || 0;
    const discount = parseFloat(field === 'discount' ? value : it.discount) || 0;
    // priceInc edited directly → back-calculate priceEx
    if (field === 'priceInc' && parseFloat(value) > 0) {
      const derived = parseFloat((parseFloat(value) / 1.1).toFixed(2));
      items[idx].priceEx = derived;
      priceEx = derived;
    }
    // discount changed → un-apply previous discount from priceEx, then apply new one
    if (field === 'discount' && it.priceEx > 0) {
      const prevDiscount = parseFloat(it.discount) || 0;
      const basePrice = prevDiscount > 0 ? it.priceEx / (1 - prevDiscount / 100) : it.priceEx;
      priceEx = parseFloat((basePrice * (1 - discount / 100)).toFixed(4));
      items[idx].priceEx = parseFloat(priceEx.toFixed(2));
    }
    const priceInc = field === 'priceInc' ? parseFloat(value) || 0 : parseFloat((priceEx * 1.1).toFixed(2));
    if (field !== 'priceInc') items[idx].priceInc = priceInc;
    items[idx].total = parseFloat((qty * priceEx).toFixed(2));
    // margin only meaningful when cost has been entered
    if (priceEx > 0 && purchasePrice > 0) {
      items[idx].margin = parseFloat((priceEx - purchasePrice).toFixed(2));
      items[idx].marginPercent = parseFloat(((priceEx - purchasePrice) / priceEx * 100).toFixed(1));
    } else {
      items[idx].margin = 0;
      items[idx].marginPercent = 0;
    }
    return recalcJobTotals({ ...f, items });
  });

  const recalcJobTotals = (form) => {
    const subtotal = form.items.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
    const tax = parseFloat((subtotal * 0.1).toFixed(2));
    const total = parseFloat((subtotal + tax).toFixed(2));
    const balanceDue = parseFloat((total - (parseFloat(form.invoicePaid) || 0)).toFixed(2));
    return { ...form, subtotal, tax, total, balanceDue };
  };

  // Pinned-job helpers
  const pinJob = (job) => {
    setPinnedJobs(prev => prev.find(j => j.id === job.id) ? prev.map(j => j.id === job.id ? job : j) : [...prev, job]);
    setActiveJob(job);
    setShowJobDetail(true);
  };

  const unpinJob = (jobId) => {
    setPinnedJobs(prev => prev.filter(j => j.id !== jobId));
    setActiveJob(cur => (cur?.id === jobId ? null : cur));
    if (activeJob?.id === jobId) setShowJobDetail(false);
  };

  const updatePinnedJob = (updated) => {
    setPinnedJobs(prev => prev.map(j => j.id === updated.id ? updated : j));
    setActiveJob(cur => (cur?.id === updated.id ? updated : cur));
  };

  // CRUD operations
  const saveJob = async () => {
    try {
      const formWithTotals = recalcJobTotals(jobForm);
      if (editingItem) {
        const updated = await api.jobs.update(editingItem.id, formWithTotals);
        updatePinnedJob(updated);
      } else {
        await api.jobs.create(formWithTotals);
      }
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      closeModal();
    } catch (e) { setApiError(e.message); }
  };

  const deleteJob = (jobId) => {
    setConfirmModal({
      show: true,
      message: `Are you sure you want to delete job #${jobId}? This cannot be undone.`,
      onConfirm: async () => {
        try {
          await api.jobs.delete(jobId);
          unpinJob(jobId);
          queryClient.invalidateQueries({ queryKey: ['jobs'] });
        } catch (e) { setApiError(e.message); }
        setConfirmModal({ show: false, message: '', onConfirm: null });
      }
    });
  };

  // ── Job Templates ──────────────────────────────────────────────────────────
  const saveJobTemplate = (name) => {
    const tpl = { id: Date.now(), name, items: jobForm.items, notes: jobForm.notes };
    const updated = [...jobTemplates, tpl];
    setJobTemplates(updated);
    localStorage.setItem('tig_job_templates', JSON.stringify(updated));
    setTemplateSaveOpen(false);
    setTemplateSaveName('');
  };

  const loadJobTemplate = (tpl) => {
    setJobForm(f => recalcJobTotals({ ...f, items: tpl.items.map(it => ({ ...it })), notes: tpl.notes || f.notes }));
    setTemplateModalOpen(false);
  };

  const deleteJobTemplate = (id) => {
    const updated = jobTemplates.filter(t => t.id !== id);
    setJobTemplates(updated);
    localStorage.setItem('tig_job_templates', JSON.stringify(updated));
  };

  // ── Payment terms → due date ───────────────────────────────────────────────
  const calcDueFromTerms = (terms, fromDate) => {
    const base = fromDate ? new Date(fromDate) : new Date();
    const days = terms?.startsWith('Net ') ? parseInt(terms.replace('Net ', ''), 10)
                 : terms === 'COD' || terms === 'On Receipt' ? 0
                 : terms === 'EOM' ? (() => { const d = new Date(base); d.setMonth(d.getMonth() + 1, 0); return Math.floor((d - base) / 86400000); })()
                 : 30;
    const due = new Date(base);
    due.setDate(due.getDate() + (isNaN(days) ? 30 : days));
    return due.toISOString().split('T')[0];
  };

  const applyCustomerToJobForm = (c) => ({
    customer: c.name,
    customerId: c.id || '',
    shippingAddress: c.address || '',
    due: calcDueFromTerms(c.paymentTerms),
    nameContact: c.contact || '',
  });

  // ── Job Cloning ────────────────────────────────────────────────────────────
  const cloneJob = (job) => {
    openModal('job');
    setTimeout(() => {
      setJobForm(f => recalcJobTotals({
        ...f,
        customer: job.customer,
        customerId: job.customerId,
        status: 'QUOTE',
        priority: job.priority,
        type: job.type,
        assignedTo: job.assignedTo,
        shippingAddress: job.shippingAddress,
        paymentMethod: job.paymentMethod,
        shipTo: job.shipTo,
        custRef: job.custRef || '',
        ourRef: job.ourRef || '',
        description: job.description || '',
        notes: job.notes || '',
        items: (job.items || []).map(it => ({ ...it, id: undefined })),
      }));
    }, 0);
  };

  // ── Bulk Operations ────────────────────────────────────────────────────────
  const toggleJobSelect = (id) => setSelectedJobIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleSelectAll = (jobs) => {
    if (selectedJobIds.size === jobs.length) {
      setSelectedJobIds(new Set());
    } else {
      setSelectedJobIds(new Set(jobs.map(j => j.id)));
    }
  };

  const bulkStatusChange = async (status) => {
    for (const id of selectedJobIds) {
      try { await api.jobs.updateStatus(id, status); } catch {}
    }
    queryClient.invalidateQueries({ queryKey: ['jobs'] });
    setSelectedJobIds(new Set());
    setBulkActionOpen(false);
  };

  const bulkDelete = () => {
    const ids = [...selectedJobIds];
    setConfirmModal({
      show: true,
      message: `Delete ${ids.length} selected jobs? This cannot be undone.`,
      onConfirm: async () => {
        for (const id of ids) {
          try { await api.jobs.delete(id); } catch {}
        }
        queryClient.invalidateQueries({ queryKey: ['jobs'] });
        setSelectedJobIds(new Set());
        setConfirmModal({ show: false, message: '', onConfirm: null });
      }
    });
  };

  const saveInventoryItem = async () => {
    try {
      if (editingItem) {
        await api.inventory.update(editingItem.sku, inventoryForm);
      } else {
        await api.inventory.create(inventoryForm);
      }
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      closeModal();
    } catch (e) { setApiError(e.message); }
  };

  const deleteInventoryItem = (sku) => {
    setConfirmModal({
      show: true,
      message: `Are you sure you want to delete SKU "${sku}"? This cannot be undone.`,
      onConfirm: async () => {
        try {
          await api.inventory.delete(sku);
          queryClient.invalidateQueries({ queryKey: ['inventory'] });
        } catch (e) { setApiError(e.message); }
        setConfirmModal({ show: false, message: '', onConfirm: null });
      }
    });
  };

  const saveCustomer = async () => {
    try {
      if (editingItem) {
        await api.customers.update(editingItem.id, customerForm);
      } else {
        await api.customers.create(customerForm);
      }
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      closeModal();
    } catch (e) { setApiError(e.message); }
  };

  const deleteCustomer = (customerId) => {
    setConfirmModal({
      show: true,
      message: `Are you sure you want to delete this customer? This cannot be undone.`,
      onConfirm: async () => {
        try {
          await api.customers.delete(customerId);
          queryClient.invalidateQueries({ queryKey: ['customers'] });
        } catch (e) { setApiError(e.message); }
        setConfirmModal({ show: false, message: '', onConfirm: null });
      }
    });
  };

  const saveSupplier = async () => {
    try {
      if (editingItem) {
        await api.suppliers.update(editingItem.code, supplierForm);
      } else {
        await api.suppliers.create(supplierForm);
      }
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      closeModal();
    } catch (e) { setApiError(e.message); }
  };

  const deleteSupplier = (code) => {
    setConfirmModal({
      show: true,
      message: `Are you sure you want to delete this supplier? This cannot be undone.`,
      onConfirm: async () => {
        try {
          await api.suppliers.delete(code);
          queryClient.invalidateQueries({ queryKey: ['suppliers'] });
        } catch (e) { setApiError(e.message); }
        setConfirmModal({ show: false, message: '', onConfirm: null });
      }
    });
  };

  const savePO = async () => {
    try {
      await api.purchaseOrders.create(poForm);
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      closeModal();
    } catch (e) { setApiError(e.message); }
  };

  const updatePOStatus = async (id, status) => {
    try {
      await api.purchaseOrders.updateStatus(id, status);
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
    } catch (e) { setApiError(e.message); }
  };

  const deletePO = (id) => {
    setConfirmModal({
      show: true,
      message: `Are you sure you want to delete PO ${id}? This cannot be undone.`,
      onConfirm: async () => {
        try {
          await api.purchaseOrders.delete(id);
          if (selectedPO?.id === id) setSelectedPO(null);
          queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
        } catch (e) { setApiError(e.message); }
        setConfirmModal({ show: false, message: '', onConfirm: null });
      }
    });
  };

  const receivePO = async (po) => {
    const items = (po.items || [])
      .map(item => ({ id: item.id, qty_received: parseInt(receiveQtys[`${po.id}-${item.id}`] || 0, 10) }))
      .filter(i => i.qty_received > 0);
    if (!items.length) { setApiError('Enter at least one received quantity.'); return; }
    try {
      const updated = await api.purchaseOrders.receive(po.id, items);
      setSelectedPO(updated);
      setReceiveQtys({});
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    } catch (e) { setApiError(e.message); }
  };

  const updateJobStatus = async (jobId, newStatus) => {
    try {
      const updated = await api.jobs.updateStatus(jobId, newStatus);
      updatePinnedJob(updated);
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    } catch (e) { setApiError(e.message); }
  };

  const updateJobDue = async (jobId, newDue) => {
    try {
      const updated = await api.jobs.patchDue(jobId, newDue);
      updatePinnedJob(updated);
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    } catch (e) { setApiError(e.message); }
  };

  const adjustStock = async (sku, adjustment, reason) => {
    try {
      await api.inventory.adjust(sku, adjustment, reason);
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    } catch (e) { setApiError(e.message); }
  };

  const addJobComment = async (jobId, comment, isInternal = false) => {
    try {
      await api.jobs.addComment(jobId, comment, isInternal);
      const updated = await api.jobs.get(jobId);
      updatePinnedJob(updated);
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    } catch (e) { setApiError(e.message); }
  };

  const recordPayment = async (jobId, amount, method) => {
    try {
      const updated = await api.jobs.recordPayment(jobId, amount, method);
      updatePinnedJob(updated);
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    } catch (e) { setApiError(e.message); }
  };

  // Dashboard calculations
  const dashboardStats = (() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;
    const parseJobDate = (str) => { if (!str) return null; const s = str.split(' ')[0]; const p = s.split('/'); return p.length === 3 ? new Date(`${p[2]}-${p[1]}-${p[0]}`) : new Date(s); };
    const isOverdue = (j) => { if (['FINISH','PAID','CANCEL'].includes(j.status)) return false; const d = parseJobDate(j.due); return d && d < now; };
    const jobDateIn = (j) => { const d = parseJobDate(j.dateIn); return d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` : ''; };
    const revenueThisMonth = jobs.filter(j => jobDateIn(j) === thisMonth).reduce((s, j) => s + (j.total || 0), 0);
    const revenueLastMonth = jobs.filter(j => jobDateIn(j) === lastMonth).reduce((s, j) => s + (j.total || 0), 0);
    const revChange = revenueLastMonth > 0 ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth * 100) : null;
    const overdueJobs = jobs.filter(isOverdue);
    const quotesAwaitingApproval = jobs.filter(j => j.status === 'QUOTE').length;
    const inProduction = jobs.filter(j => ['ORDER','In Progress','PROOF','PRINT','Pick/Pack'].includes(j.status)).length;
    const toInvoice = jobs.filter(j => j.invoiceStatus === 'to_invoice').length;
    const statusBreakdown = {};
    ['QUOTE','ORDER','In Progress','PROOF','PRINT','Pick/Pack','FINISH','INVOICE'].forEach(s => { statusBreakdown[s] = jobs.filter(j => j.status === s).length; });

    // On-time delivery rate (finished/invoiced/paid jobs in last 90 days that met their due date)
    const ninetyDaysAgo = new Date(now); ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const completedRecent = jobs.filter(j => {
      if (!['FINISH','INVOICE','PAID'].includes(j.status)) return false;
      const d = parseJobDate(j.dateIn); return d && d >= ninetyDaysAgo;
    });
    const onTimeCount = completedRecent.filter(j => {
      const due = parseJobDate(j.due); const out = parseJobDate(j.out);
      if (!due) return true;
      const completedDate = out || now;
      return completedDate <= due;
    }).length;
    const onTimeRate = completedRecent.length > 0 ? Math.round((onTimeCount / completedRecent.length) * 100) : null;

    // Quotes expiring within 7 days
    const in7Days = new Date(now); in7Days.setDate(in7Days.getDate() + 7);
    const quoteExpiringSoon = jobs.filter(j => {
      if (j.status !== 'QUOTE') return false;
      if (!j.validityDate) return false;
      const d = parseJobDate(j.validityDate);
      return d && d >= now && d <= in7Days;
    });

    // Jobs due today
    const dueToday = jobs.filter(j => {
      if (['FINISH','PAID','CANCEL'].includes(j.status)) return false;
      const d = parseJobDate(j.due);
      if (!d) return false;
      return d.toISOString().split('T')[0] === todayStr;
    });

    // Jobs due in next 48 hours (not today)
    const in48h = new Date(now); in48h.setHours(in48h.getHours() + 48);
    const dueSoon = jobs.filter(j => {
      if (['FINISH','PAID','CANCEL'].includes(j.status)) return false;
      const d = parseJobDate(j.due);
      if (!d) return false;
      const ds = d.toISOString().split('T')[0];
      return ds > todayStr && d <= in48h;
    });

    // 6-month revenue trend
    const revenueByMonth = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('en-AU', { month: 'short' });
      const rev = jobs.filter(j => ['INVOICE','PAID','FINISH'].includes(j.status) && jobDateIn(j) === key)
        .reduce((s, j) => s + (j.subtotal || 0), 0);
      return { month: label, revenue: Math.round(rev) };
    });

    // Top 5 customers by revenue
    const custRevMap = {};
    jobs.filter(j => ['INVOICE','PAID'].includes(j.status)).forEach(j => {
      const key = j.customerId || j.customer || 'Unknown';
      const name = j.customer || key;
      if (!custRevMap[key]) custRevMap[key] = { name, revenue: 0, jobCount: 0 };
      custRevMap[key].revenue += (j.subtotal || 0);
      custRevMap[key].jobCount += 1;
    });
    const topCustomers = Object.values(custRevMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5).map(c => ({
      ...c, revenue: Math.round(c.revenue)
    }));

    // Average margin across jobs with items
    const jobsWithItems = jobs.filter(j => j.items && j.items.length > 0);
    const avgMarginPct = jobsWithItems.length > 0
      ? jobsWithItems.reduce((s, j) => {
          const rev = j.subtotal || 0;
          const cost = (j.items || []).reduce((cs, i) => cs + (parseFloat(i.purchasePrice || 0) * parseInt(i.order || 0, 10)), 0);
          return s + (rev > 0 ? ((rev - cost) / rev) * 100 : 0);
        }, 0) / jobsWithItems.length
      : null;

    // Decoration type breakdown across all job items
    const decBreakdown = {};
    jobs.forEach(j => (j.items || []).forEach(i => {
      if (i.decorationType && i.decorationType !== 'None') {
        decBreakdown[i.decorationType] = (decBreakdown[i.decorationType] || 0) + 1;
      }
    }));

    return {
      activeJobs: jobs.filter(j => !['FINISH','PAID','CANCEL'].includes(j.status)).length,
      completedToday: jobs.filter(j => j.status === 'FINISH' && j.out === now.toLocaleDateString('en-GB')).length,
      pendingInvoices: jobs.filter(j => j.balanceDue > 0).length,
      lowStock: inventory.filter(i => i.stock < i.reorderLevel).length,
      totalRevenue: jobs.reduce((sum, j) => sum + (j.total || 0), 0),
      outstandingPayments: jobs.reduce((sum, j) => sum + (j.balanceDue || 0), 0),
      warehouseCapacity: Math.round((WAREHOUSE_ZONES.reduce((sum, z) => sum + (z.capacity * z.utilization / 100), 0) / (WAREHOUSE_ZONES.reduce((sum, z) => sum + z.capacity, 0) || 1)) * 100),
      totalCustomers: customers.length,
      activeCustomers: customers.filter(c => c.status === 'Active').length,
      avgOrderValue: jobs.length > 0 ? jobs.reduce((sum, j) => sum + (j.total || 0), 0) / jobs.length : 0,
      revenueThisMonth, revenueLastMonth, revChange,
      overdueJobs, quotesAwaitingApproval, inProduction, toInvoice, statusBreakdown,
      onTimeRate, quoteExpiringSoon, dueToday, dueSoon,
      revenueByMonth, topCustomers, avgMarginPct, decBreakdown,
    };
  })();

  // Auto-reorder
  const runAutoReorder = async () => {
    try {
      const result = await api.inventory.autoReorder();
      if (result.created === 0) {
        setApiError('No low-stock items found — all inventory is above reorder levels.');
      } else {
        queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
        setApiError('');
        alert(`Auto-reorder complete: ${result.created} draft PO(s) created (${result.purchase_orders.join(', ')}). Check the Purchase Orders tab.`);
      }
    } catch (e) { setApiError(e.message); }
  };

  // AI chat
  const sendAiMessage = async () => {
    if (!aiInput.trim() || aiLoading) return;
    const userMsg = aiInput.trim();
    setAiInput('');
    setAiMessages(prev => [...prev, { role: 'user', text: userMsg, ts: new Date() }]);
    setAiLoading(true);
    try {
      const context = `Jobs: ${jobs.length} total, ${jobs.filter(j => j.status === 'FINISH').length} finished. ` +
        `Inventory: ${inventory.length} SKUs, ${inventory.filter(i => i.stock <= i.reorderLevel).length} low stock. ` +
        `Customers: ${customers.length}. Suppliers: ${suppliers.length}. ` +
        `Purchase Orders: ${purchaseOrders.length} total, ${purchaseOrders.filter(p => p.status === 'Draft').length} drafts. ` +
        `Revenue this period: $${jobs.reduce((s, j) => s + (j.total || 0), 0).toLocaleString()}.`;
      const res = await api.ai.chat(userMsg, context);
      setAiMessages(prev => [...prev, { role: 'assistant', text: res.response, ts: new Date() }]);
    } catch (e) {
      setAiMessages(prev => [...prev, { role: 'assistant', text: `Error: ${e.message}`, ts: new Date() }]);
    } finally {
      setAiLoading(false);
      setTimeout(() => aiEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };


  // Change password
  const handleChangePassword = async () => {
    if (changePasswordForm.newPass !== changePasswordForm.confirm) {
      setChangePasswordMsg('New passwords do not match.');
      return;
    }
    try {
      await api.auth.changePassword(changePasswordForm.current, changePasswordForm.newPass);
      setChangePasswordMsg('Password changed successfully.');
      setChangePasswordForm({ current: '', newPass: '', confirm: '' });
    } catch (e) {
      setChangePasswordMsg(e.message);
    }
  };

  // Export functions
  const exportToCSV = (data, filename) => {
    const csv = [
      Object.keys(data[0]).join(','),
      ...data.map(row => Object.values(row).join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const printInvoice = (job) => {
    setInvoiceJob(job);
  };

  const _legacyPrintInvoice_unused = (job) => {
    const printWindow = window.open('', '', 'height=800,width=600');
    printWindow.document.write(`
      <html>
        <head>
          <title>Invoice ${job.invoice}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .totals { text-align: right; margin-top: 20px; }
          </style>
        </head>
        <body>
          <h1>Total Image Group</h1>
          <h2>Tax Invoice</h2>
          <p><strong>Invoice #:</strong> ${job.invoice}</p>
          <p><strong>Job #:</strong> ${job.id}</p>
          <p><strong>Date:</strong> ${job.dateIn}</p>
          <p><strong>Customer:</strong> ${job.customer}</p>
          <p><strong>Due Date:</strong> ${job.due}</p>
          
          <table>
            <thead>
              <tr>
                <th>Stock Code</th>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit Price (Inc)</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${job.items.map(item => `
                <tr>
                  <td>${item.stockCode}</td>
                  <td>${item.description}</td>
                  <td>${item.order}</td>
                  <td>$${item.priceInc.toFixed(2)}</td>
                  <td>$${item.total.toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="totals">
            <p><strong>Subtotal:</strong> $${job.subtotal.toFixed(2)}</p>
            <p><strong>GST:</strong> $${job.tax.toFixed(2)}</p>
            <p><strong>Total:</strong> $${job.total.toFixed(2)}</p>
            <p><strong>Amount Paid:</strong> $${job.invoicePaid.toFixed(2)}</p>
            <p style="font-size: 1.2em;"><strong>Balance Due:</strong> $${job.balanceDue.toFixed(2)}</p>
          </div>
          
          <p style="margin-top: 40px;">Thank you for your business!</p>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // Render Dashboard
  const renderDashboard = () => {
    const ds = dashboardStats;
    const SC = { QUOTE:'bg-gray-100 text-gray-700', New:'bg-blue-100 text-blue-700', ORDER:'bg-indigo-100 text-indigo-700', 'In Progress':'bg-cyan-100 text-cyan-700', PROOF:'bg-yellow-100 text-yellow-700', PRINT:'bg-orange-100 text-orange-700', 'Pick/Pack':'bg-teal-100 text-teal-700', FINISH:'bg-green-100 text-green-800', INVOICE:'bg-purple-100 text-purple-700', PAID:'bg-emerald-100 text-emerald-800', CANCEL:'bg-red-100 text-red-600' };
    const parseJobDate2 = (str) => { if (!str) return null; const s = str.split(' ')[0]; const p = s.split('/'); return p.length === 3 ? new Date(`${p[2]}-${p[1]}-${p[0]}`) : new Date(s); };
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const firstName = (currentUser?.full_name || currentUser?.username || '').split(' ')[0] || 'there';
    const toInvoiceJobs = jobs.filter(j => j.invoiceStatus === 'to_invoice');
    const actionTabs = [
      { id: 'overdue',  label: 'Overdue',         count: ds.overdueJobs.length,       items: ds.overdueJobs,       accent: 'text-red-600',    badge: 'bg-red-100 text-red-700 border border-red-200' },
      { id: 'today',   label: 'Due Today',         count: ds.dueToday.length,          items: ds.dueToday,          accent: 'text-orange-600', badge: 'bg-orange-100 text-orange-700 border border-orange-200' },
      { id: 'invoice', label: 'Needs Invoice',     count: toInvoiceJobs.length,        items: toInvoiceJobs,        accent: 'text-purple-600', badge: 'bg-purple-100 text-purple-700 border border-purple-200' },
      { id: 'quotes',  label: 'Quotes Expiring',   count: ds.quoteExpiringSoon.length, items: ds.quoteExpiringSoon, accent: 'text-amber-600',  badge: 'bg-amber-100 text-amber-700 border border-amber-200' },
    ].filter(t => t.count > 0);
    const activeActionTab = actionTabs.find(t => t.id === dashActionTab) || actionTabs[0];
    return (
    <div className="space-y-4">

      {/* ── Role Center Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">{greeting}, {firstName} 👋</h2>
          <p className="text-xs text-gray-500 mt-0.5">{new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · Total Image Group</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => openModal('job')} className="flex items-center gap-2 bg-[#1e3a8a] text-white px-3 py-2 rounded-lg hover:bg-blue-900 text-sm font-semibold shadow-sm">
          <Plus className="w-4 h-4" /> New Job
        </button>
        <button onClick={() => openModal('po')} className="flex items-center gap-2 bg-white border text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm font-medium shadow-sm">
          <Package className="w-4 h-4" /> New Purchase Order
        </button>
        <button onClick={() => openModal('customer')} className="flex items-center gap-2 bg-white border text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm font-medium shadow-sm">
          <Users className="w-4 h-4" /> New Customer
        </button>
        <button onClick={() => setActiveModule('jobs')} className="flex items-center gap-2 bg-white border text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm font-medium shadow-sm ml-auto">
          All Jobs →
        </button>
      </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 p-5 cursor-pointer hover:border-blue-300 transition-colors flex items-center gap-4" onClick={() => setActiveModule('jobs')}>
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
            <LayoutGrid className="w-5 h-5 text-blue-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-400">All open orders</p>
            <p className="font-bold text-gray-800 text-xl leading-tight">{ds.activeJobs}</p>
            <p className="font-semibold text-gray-600 text-sm">Active Jobs</p>
            <div className="flex gap-3 mt-1 text-xs">
              <span className="text-gray-400">{ds.quotesAwaitingApproval} quotes</span>
              <span className="text-cyan-600">{ds.inProduction} in prod</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-5 cursor-pointer hover:border-blue-300 transition-colors flex items-center gap-4" onClick={() => setActiveModule('jobs')}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${ds.overdueJobs.length > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
            <AlertCircle className={`w-5 h-5 ${ds.overdueJobs.length > 0 ? 'text-red-500' : 'text-gray-400'}`} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-400">Past due date</p>
            <p className={`font-bold text-xl leading-tight ${ds.overdueJobs.length > 0 ? 'text-red-600' : 'text-gray-400'}`}>{ds.overdueJobs.length}</p>
            <p className="font-semibold text-gray-600 text-sm">Overdue</p>
            <p className="text-xs text-gray-400 mt-1 truncate">{ds.overdueJobs.length > 0 ? ds.overdueJobs.slice(0,2).map(j=>`#${j.id}`).join(', ') : 'All on time ✓'}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5 text-green-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-400">This month</p>
            <p className="font-bold text-gray-800 text-xl leading-tight">${ds.revenueThisMonth.toLocaleString('en-AU', { maximumFractionDigits: 0 })}</p>
            <p className="font-semibold text-gray-600 text-sm">Revenue</p>
            {ds.revChange !== null && (
              <p className={`text-xs mt-1 ${ds.revChange >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {ds.revChange >= 0 ? '▲' : '▼'} {Math.abs(ds.revChange).toFixed(1)}% vs last month
              </p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
            <DollarSign className="w-5 h-5 text-red-500" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-400">Not paid</p>
            <p className="font-bold text-red-600 text-xl leading-tight">${ds.outstandingPayments.toLocaleString('en-AU', { maximumFractionDigits: 0 })}</p>
            <p className="font-semibold text-gray-600 text-sm">Due Balance</p>
            <p className="text-xs text-gray-400 mt-1">{ds.pendingInvoices} unpaid · {ds.toInvoice} to invoice</p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-5 flex items-center gap-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${ds.onTimeRate === null ? 'bg-gray-100' : ds.onTimeRate >= 90 ? 'bg-emerald-100' : ds.onTimeRate >= 75 ? 'bg-yellow-100' : 'bg-red-100'}`}>
            <CheckSquare className={`w-5 h-5 ${ds.onTimeRate === null ? 'text-gray-400' : ds.onTimeRate >= 90 ? 'text-emerald-600' : ds.onTimeRate >= 75 ? 'text-yellow-600' : 'text-red-500'}`} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-400">Last 90 days</p>
            <p className={`font-bold text-xl leading-tight ${ds.onTimeRate === null ? 'text-gray-400' : ds.onTimeRate >= 90 ? 'text-emerald-600' : ds.onTimeRate >= 75 ? 'text-yellow-600' : 'text-red-600'}`}>
              {ds.onTimeRate === null ? '—' : `${ds.onTimeRate}%`}
            </p>
            <p className="font-semibold text-gray-600 text-sm">On-Time Delivery</p>
            {ds.avgMarginPct !== null && (
              <p className="text-xs text-gray-400 mt-1">Avg margin {ds.avgMarginPct.toFixed(1)}%</p>
            )}
          </div>
        </div>
      </div>


      {/* Job pipeline + recent */}
      <div className="grid grid-cols-3 gap-5">
        {/* Pipeline — iDURAS-style with % labels */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-700 flex items-center gap-2"><LayoutGrid className="w-4 h-4 text-blue-500" /> Jobs Preview</h3>
            <span className="text-xs text-gray-400">{ds.activeJobs} total</span>
          </div>
          <div className="space-y-2.5">
            {(() => {
              const allStatuses = ['QUOTE','New','ORDER','In Progress','PROOF','PRINT','Pick/Pack','FINISH','INVOICE','PAID','CANCEL'];
              const total = jobs.length || 1;
              return allStatuses.map(status => {
                const count = jobs.filter(j => j.status === status).length;
                if (!count) return null;
                const pct = Math.round((count / total) * 100);
                const barColors = { QUOTE:'bg-gray-400', New:'bg-blue-400', ORDER:'bg-indigo-500', 'In Progress':'bg-cyan-500', PROOF:'bg-yellow-500', PRINT:'bg-orange-500', 'Pick/Pack':'bg-teal-500', FINISH:'bg-green-500', INVOICE:'bg-purple-500', PAID:'bg-emerald-500', CANCEL:'bg-red-400' };
                return (
                  <div key={status} className="flex items-center gap-2 cursor-pointer hover:opacity-80 group" onClick={() => setActiveModule('jobs')}>
                    <span className="text-xs text-gray-600 w-20 truncate shrink-0">{status}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full transition-all ${barColors[status] || 'bg-gray-400'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 w-8 text-right shrink-0">{pct}%</span>
                  </div>
                );
              });
            })()}
            {jobs.length === 0 && <p className="text-gray-400 text-sm text-center py-4">No jobs yet</p>}
          </div>
        </div>

        {/* Action Required – tabbed panel */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" /> Action Required
            </h3>
            {actionTabs.length > 0 && (
              <span className="text-xs bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-bold">
                {actionTabs.reduce((s, t) => s + t.count, 0)}
              </span>
            )}
          </div>
          {actionTabs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-green-500">
              <span className="text-3xl">✓</span>
              <p className="text-sm font-medium mt-2 text-green-600">All caught up!</p>
              <p className="text-xs text-gray-400 mt-1">No actions required</p>
            </div>
          ) : (
            <>
              <div className="flex gap-1 mb-3 flex-wrap">
                {actionTabs.map(tab => (
                  <button key={tab.id} onClick={() => setDashActionTab(tab.id)}
                    className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${dashActionTab === tab.id || (!actionTabs.find(t => t.id === dashActionTab) && actionTabs[0].id === tab.id) ? tab.badge + ' font-semibold' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    {tab.label} <span className="font-bold">{tab.count}</span>
                  </button>
                ))}
              </div>
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {(activeActionTab?.items || []).slice(0, 8).map(job => {
                  const due = parseJobDate2(job.due);
                  const daysOver = due && new Date() > due ? Math.floor((new Date() - due) / 86400000) : null;
                  return (
                    <div key={job.id} className="flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-gray-50 border border-gray-100" onClick={() => { pinJob(job); setActiveModule('jobs'); }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-blue-600">#{job.id}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${SC[job.status] || 'bg-gray-100 text-gray-600'}`}>{job.status}</span>
                        </div>
                        <p className="text-xs text-gray-500 truncate">{job.customer}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {daysOver !== null && <span className="text-xs text-red-600 font-bold block">{daysOver}d late</span>}
                        {daysOver === null && job.due && <span className="text-xs text-gray-400 block">{job.due}</span>}
                        <span className="text-xs font-semibold text-gray-700">${(job.total||0).toFixed(0)}</span>
                      </div>
                    </div>
                  );
                })}
                {(activeActionTab?.items.length || 0) > 8 && (
                  <button onClick={() => setActiveModule('jobs')} className="w-full text-xs text-blue-600 hover:text-blue-800 py-1 text-center">
                    +{activeActionTab.items.length - 8} more → View all
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Recent jobs */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-700 flex items-center gap-2"><FileText className="w-4 h-4 text-blue-500" /> Recent Jobs</h3>
            <button onClick={() => setActiveModule('jobs')} className="text-xs text-blue-600 hover:text-blue-800">View all →</button>
          </div>
          <div className="space-y-2">
            {jobs.slice(0, 6).map(job => (
              <div key={job.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer" onClick={() => { pinJob(job); setActiveModule('jobs'); }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-semibold text-blue-600">#{job.id}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${SC[job.status] || 'bg-gray-100 text-gray-600'}`}>{job.status}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{job.customer}</p>
                </div>
                <span className="text-xs font-semibold text-gray-700 shrink-0">${(job.total||0).toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Financial + low stock row */}
      <div className="grid grid-cols-3 gap-5">
        {/* Financial summary */}
        <div className="col-span-2 bg-white rounded-lg border border-slate-200 p-5">
          <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2"><DollarSign className="w-4 h-4 text-green-500" /> Financial Overview</h3>
          <div className="grid grid-cols-4 gap-4 mb-4">
            {[
              { label: 'Total Revenue', value: `$${ds.totalRevenue.toLocaleString('en-AU',{maximumFractionDigits:0})}`, color: 'text-green-600' },
              { label: 'Outstanding', value: `$${ds.outstandingPayments.toLocaleString('en-AU',{maximumFractionDigits:0})}`, color: 'text-red-600' },
              { label: 'Avg Order', value: `$${ds.avgOrderValue.toLocaleString('en-AU',{maximumFractionDigits:0})}`, color: 'text-blue-600' },
              { label: 'Active Customers', value: ds.activeCustomers, color: 'text-purple-600' },
            ].map(stat => (
              <div key={stat.label} className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">{stat.label}</p>
                <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>
          {/* 6-month revenue trend chart */}
          <div>
            <p className="text-xs text-gray-400 mb-2">6-Month Revenue Trend (ex GST)</p>
            <ResponsiveContainer width="100%" height={90}>
              <BarChart data={ds.revenueByMonth} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip formatter={(v) => [`$${v.toLocaleString('en-AU')}`, 'Revenue']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Bar dataKey="revenue" fill="#2563eb" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Low stock */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-700 flex items-center gap-2"><AlertCircle className="w-4 h-4 text-yellow-500" /> Low Stock</h3>
            <button onClick={() => setActiveModule('inventory')} className="text-xs text-blue-600 hover:text-blue-800">View all →</button>
          </div>
          {inventory.filter(i => i.stock < i.reorderLevel).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">All stock levels OK</p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {inventory.filter(i => i.stock < i.reorderLevel).slice(0, 6).map(item => (
                <div key={item.sku} className="flex items-center justify-between p-1.5 bg-yellow-50 rounded">
                  <div>
                    <p className="text-xs font-medium font-mono text-gray-700">{item.sku}</p>
                    <p className="text-[10px] text-gray-500 truncate max-w-[100px]">{item.name}</p>
                  </div>
                  <span className="text-xs font-bold text-red-600">{item.stock}/{item.reorderLevel}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top customers + Decoration breakdown */}
      {(ds.topCustomers.length > 0 || Object.keys(ds.decBreakdown).length > 0) && (
        <div className="grid grid-cols-2 gap-5">
          {/* Top customers */}
          {ds.topCustomers.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-5">
              <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-blue-500" /> Top Customers by Revenue</h3>
              <div className="space-y-2">
                {ds.topCustomers.map((c, i) => {
                  const maxRev = ds.topCustomers[0].revenue || 1;
                  const pct = (c.revenue / maxRev) * 100;
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-4 shrink-0 text-right">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-medium text-gray-700 truncate">{c.name}</span>
                          <span className="text-xs font-semibold text-green-700 ml-2 shrink-0">${c.revenue.toLocaleString('en-AU')}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 w-12 text-right shrink-0">{c.jobCount} jobs</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Decoration type breakdown */}
          {Object.keys(ds.decBreakdown).length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-5">
              <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2"><Tag className="w-4 h-4 text-purple-500" /> Decoration Mix</h3>
              <div className="space-y-2">
                {Object.entries(ds.decBreakdown).sort((a, b) => b[1] - a[1]).map(([type, count]) => {
                  const total = Object.values(ds.decBreakdown).reduce((s, v) => s + v, 0);
                  const pct = Math.round((count / total) * 100);
                  const decOpt = DEC_OPTIONS.find(d => d.v === type);
                  return (
                    <div key={type} className="flex items-center gap-2">
                      <span className="text-xs w-24 shrink-0 flex items-center gap-1">
                        <span>{decOpt?.emoji || ''}</span>
                        <span className="text-gray-700 truncate">{decOpt?.l || type}</span>
                      </span>
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                        <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 w-12 text-right shrink-0">{count} ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Alerts and Notifications */}
      {notifications.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-700 flex items-center gap-2"><Bell className="w-4 h-4" /> Alerts</h3>
            <span className="text-xs text-gray-500">{notifications.length} active</span>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {notifications.map(notif => (
              <div key={notif.id} className={`p-3 rounded-lg flex items-start gap-3 ${notif.type === 'error' ? 'bg-red-50 border border-red-200' : notif.type === 'warning' ? 'bg-yellow-50 border border-yellow-200' : 'bg-blue-50 border border-blue-200'}`}>
                <AlertCircle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${notif.type === 'error' ? 'text-red-500' : notif.type === 'warning' ? 'text-yellow-500' : 'text-blue-500'}`} />
                <div className="flex-1">
                  <p className="font-medium text-sm">{notif.title}</p>
                  <p className="text-xs text-gray-600">{notif.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom row: Staff workload + Quick notes + Activity feed */}
      <div className="grid grid-cols-3 gap-5">
        {/* Staff Workload */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-blue-500" /> Staff Workload</h3>
          {(() => {
            const staffMap = {};
            jobs.filter(j => j.assignedTo && !['FINISH','PAID','CANCEL'].includes(j.status)).forEach(j => {
              staffMap[j.assignedTo] = (staffMap[j.assignedTo] || 0) + 1;
            });
            const staff = Object.entries(staffMap).sort((a, b) => b[1] - a[1]);
            const maxVal = Math.max(...staff.map(s => s[1]), 1);
            return staff.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No assigned jobs</p>
            ) : (
              <div className="space-y-2">
                {staff.map(([name, count]) => (
                  <div key={name} className="flex items-center gap-2">
                    <div className="w-20 text-xs text-gray-600 truncate shrink-0">{name.split(' ')[0]}</div>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${(count / maxVal) * 100}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-gray-600 w-4 text-right">{count}</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Quick Notes */}
        <div className="bg-amber-50 rounded-xl shadow-sm p-5 border border-amber-200">
          <h3 className="font-semibold text-amber-800 mb-3 flex items-center gap-2"><ClipboardList className="w-4 h-4" /> Quick Notes</h3>
          <div className="flex gap-1 mb-3">
            <input value={dashNoteInput} onChange={e => setDashNoteInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && dashNoteInput.trim()) {
                  const updated = [{ id: Date.now(), text: dashNoteInput.trim(), time: new Date().toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }, ...dashNotes].slice(0, 10);
                  setDashNotes(updated);
                  localStorage.setItem('tig_dash_notes', JSON.stringify(updated));
                  setDashNoteInput('');
                }
              }}
              placeholder="Add a note… (Enter)" className="flex-1 text-xs border border-amber-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400" />
            <button onClick={() => {
              if (!dashNoteInput.trim()) return;
              const updated = [{ id: Date.now(), text: dashNoteInput.trim(), time: new Date().toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }, ...dashNotes].slice(0, 10);
              setDashNotes(updated);
              localStorage.setItem('tig_dash_notes', JSON.stringify(updated));
              setDashNoteInput('');
            }} className="text-xs bg-amber-500 text-white px-2 py-1.5 rounded hover:bg-amber-600">+</button>
          </div>
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {dashNotes.length === 0 ? <p className="text-xs text-amber-500 text-center py-2">No notes yet</p> : dashNotes.map(n => (
              <div key={n.id} className="flex items-start gap-1.5 group bg-white rounded p-1.5 border border-amber-100">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-800">{n.text}</p>
                  <p className="text-[10px] text-gray-400">{n.time}</p>
                </div>
                <button onClick={() => {
                  const updated = dashNotes.filter(x => x.id !== n.id);
                  setDashNotes(updated);
                  localStorage.setItem('tig_dash_notes', JSON.stringify(updated));
                }} className="text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2"><Clock className="w-4 h-4 text-gray-500" /> Recent Activity</h3>
          <div className="space-y-2 max-h-44 overflow-y-auto">
            {(() => {
              const allComments = jobs.flatMap(j =>
                (j.comments || []).filter(c => c.isInternal).map(c => ({ ...c, jobId: j.id, customer: j.customer }))
              ).sort((a, b) => b.id - a.id).slice(0, 12);
              return allComments.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No recent activity</p>
              ) : allComments.map(c => (
                <div key={c.id} className="flex items-start gap-2 text-xs">
                  <div className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-[10px] flex-shrink-0">{c.initials || '?'}</div>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-gray-700">#{c.jobId}</span>
                    <span className="text-gray-400 mx-1">·</span>
                    <span className="text-gray-600 truncate">{c.comment}</span>
                    <p className="text-[10px] text-gray-400">{c.date} {c.time}</p>
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      </div>
    </div>
    );
  };

  // Render Jobs Module
  const renderJobs = () => {
    // Build unique lists for filter dropdowns
    const uniqueCustomers = [...new Map(jobs.map(j => [j.customerId, { id: j.customerId, name: j.customer }])).values()]
      .filter(c => c.id).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const uniqueAssignees = [...new Set(jobs.map(j => j.assignedTo).filter(Boolean))].sort();
    const uniqueShipCodes = [...new Set(jobs.map(j => j.shipTo).filter(Boolean))].sort();
    const uniqueGroups = [...new Set(jobs.map(j => j.customerId ? j.customerId.split('.')[0] : null).filter(Boolean))].sort();

    const parseJobDate = (str) => {
      if (!str) return null;
      const s = str.split(' ')[0];
      const parts = s.split('/');
      if (parts.length === 3) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      return new Date(s);
    };

    const filteredJobs = jobs.filter(job => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = !term ||
        String(job.id).toLowerCase().includes(term) ||
        (job.customer || '').toLowerCase().includes(term) ||
        (job.customerId || '').toLowerCase().includes(term) ||
        (job.invoice || '').toLowerCase().includes(term) ||
        (job.custRef || '').toLowerCase().includes(term) ||
        (job.ourRef || '').toLowerCase().includes(term) ||
        (job.shipTo || '').toLowerCase().includes(term);

      const matchesStatus = filterStatus === 'all' || job.status === filterStatus;
      const matchesPriority = filterPriority === 'all' || job.priority === filterPriority;
      const matchesCustomer = filterCustomer === 'all' || job.customerId === filterCustomer;
      const matchesAssigned = filterAssignedTo === 'all' || job.assignedTo === filterAssignedTo;

      let matchesDate = true;
      if (filterDateFrom || filterDateTo) {
        const jobDate = parseJobDate(job[filterDateField]);
        if (jobDate) {
          if (filterDateFrom && jobDate < new Date(filterDateFrom)) matchesDate = false;
          if (filterDateTo && jobDate > new Date(filterDateTo + 'T23:59:59')) matchesDate = false;
        }
      }

      const matchesShipCode = filterShipCode === 'all' || job.shipTo === filterShipCode;
      const jobGroup = job.customerId ? job.customerId.split('.')[0] : '';
      const matchesGroup = filterCustomerGroup === 'all' || jobGroup === filterCustomerGroup;
      const matchesOpenFreight = !filterOpenFreight || (
        job.shipTo && !['PAID', 'CANCEL'].includes(job.status)
      );

      const matchesJobList = !activeJobList || (
        (!activeJobList.customerId || job.customerId === activeJobList.customerId) &&
        (!activeJobList.status || job.status === activeJobList.status) &&
        (!activeJobList.priority || job.priority === activeJobList.priority)
      );

      let matchesQuick = true;
      if (filterQuick) {
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const due = parseJobDate(job.due);
        const finished = ['PAID','CANCEL','FINISH','INVOICE'].includes(job.status);
        if (filterQuick === 'overdue')     matchesQuick = !!due && due < now && !finished;
        if (filterQuick === 'dueToday')    matchesQuick = !!due && due.toISOString().split('T')[0] === todayStr && !finished;
        if (filterQuick === 'thisWeek') {
          const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7);
          matchesQuick = !!due && due >= now && due <= weekEnd && !finished;
        }
        if (filterQuick === 'inProduction') matchesQuick = ['In Progress','PROOF','PRINT','Pick/Pack'].includes(job.status);
        if (filterQuick === 'needsInvoice') matchesQuick = job.invoiceStatus === 'to_invoice' || job.status === 'FINISH';
        if (filterQuick === 'myJobs')       matchesQuick = job.assignedTo === (currentUser?.full_name || currentUser?.username);
        if (filterQuick === 'urgent')       matchesQuick = job.priority === 'Urgent';
      }

      return matchesSearch && matchesStatus && matchesPriority && matchesCustomer && matchesAssigned && matchesDate && matchesShipCode && matchesGroup && matchesOpenFreight && matchesJobList && matchesQuick;
    });

    const hasActiveFilters = filterStatus !== 'all' || filterPriority !== 'all' || filterCustomer !== 'all' ||
      filterAssignedTo !== 'all' || filterDateFrom || filterDateTo || searchTerm ||
      filterShipCode !== 'all' || filterCustomerGroup !== 'all' || filterOpenFreight || filterQuick;

    const clearFilters = () => {
      setSearchTerm('');
      setFilterStatus('all');
      setFilterPriority('all');
      setFilterCustomer('all');
      setFilterAssignedTo('all');
      setFilterDateFrom('');
      setFilterDateTo('');
      setFilterShipCode('all');
      setFilterCustomerGroup('all');
      setFilterOpenFreight(false);
      setFilterQuick(null);
      setShowMoreFilters(false);
    };

    const statusColors = {
      QUOTE: 'bg-gray-100 text-gray-700',
      New: 'bg-blue-100 text-blue-700',
      ORDER: 'bg-indigo-100 text-indigo-700',
      'In Progress': 'bg-yellow-100 text-yellow-800',
      PROOF: 'bg-purple-100 text-purple-700',
      PRINT: 'bg-orange-100 text-orange-700',
      'Pick/Pack': 'bg-cyan-100 text-cyan-700',
      FINISH: 'bg-green-100 text-green-800',
      INVOICE: 'bg-teal-100 text-teal-700',
      PAID: 'bg-emerald-100 text-emerald-800',
      CANCEL: 'bg-red-100 text-red-700',
    };

    const jStatusColors = {
      QUOTE:'bg-gray-100 text-gray-700', New:'bg-blue-100 text-blue-700', ORDER:'bg-indigo-100 text-indigo-700',
      'In Progress':'bg-yellow-100 text-yellow-800', PROOF:'bg-purple-100 text-purple-700', PRINT:'bg-orange-100 text-orange-700',
      'Pick/Pack':'bg-cyan-100 text-cyan-700', FINISH:'bg-green-100 text-green-800', INVOICE:'bg-teal-100 text-teal-700',
      PAID:'bg-emerald-100 text-emerald-800', CANCEL:'bg-red-100 text-red-700',
    };

    return (
      <div className="space-y-4">
        {!showJobDetail && (<><div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <p className="text-sm text-gray-500">
              {filteredJobs.length} of {jobs.length} jobs
              {hasActiveFilters && <button onClick={clearFilters} className="ml-2 text-indigo-600 hover:underline text-xs font-medium">Clear filters</button>}
            </p>
            {activeJobList && (
              <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1 text-xs font-medium text-indigo-700">
                <ClipboardList className="w-3.5 h-3.5" />
                <span>{activeJobList.name}</span>
                <button onClick={() => setActiveJobList(null)} className="ml-1 text-indigo-400 hover:text-indigo-700"><X className="w-3 h-3" /></button>
              </div>
            )}
          </div>
          <div className="flex space-x-2 items-center">
            {/* View mode toggle */}
            <div className="flex rounded-lg border overflow-hidden text-xs">
              {[['table','≡ Table'],['kanban','⬛ Kanban'],['production','⚙ Production'],['calendar','📅 Calendar']].map(([mode, label]) => (
                <button key={mode} onClick={() => setJobsViewMode(mode)}
                  className={`px-3 py-2 font-medium text-xs ${jobsViewMode === mode ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {label}
                </button>
              ))}
            </div>
            <button onClick={() => exportToCSV(filteredJobs, 'jobs')}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 flex items-center text-sm font-medium">
              <Download className="w-4 h-4 mr-2" />Export
            </button>
            <button
              onClick={() => { setOfModalOpen(true); setOfTab('parcels'); }}
              className="flex items-center space-x-2 px-4 py-2 rounded border text-sm font-medium bg-white border-orange-400 text-orange-600 hover:bg-orange-50 transition-colors"
            >
              <Truck className="w-4 h-4" />
              <span>Open Freight</span>
              <Settings className="w-3.5 h-3.5 opacity-60" />
            </button>
            <button onClick={() => setJobListModal({ open: true, name: '', customerId: '', status: '', priority: '' })}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 text-sm font-medium">
              <ClipboardList className="w-4 h-4" />Create Job List
            </button>
            <button onClick={() => openModal('job')}
              className="bg-blue-700 text-white px-4 py-2 rounded-lg hover:bg-blue-800 flex items-center text-sm">
              <Plus className="w-4 h-4 mr-2" />New Job
            </button>
          </div>
        </div>

        {/* Bulk Action Bar */}
        {selectedJobIds.size > 0 && (
          <div className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-3 text-sm shadow">
            <span className="font-medium">{selectedJobIds.size} job{selectedJobIds.size > 1 ? 's' : ''} selected</span>
            <div className="relative">
              <button onClick={() => setBulkActionOpen(o => !o)} className="bg-white text-blue-700 px-3 py-1 rounded font-medium hover:bg-blue-50 flex items-center gap-1">
                Change Status <ChevronDown className="w-3 h-3" />
              </button>
              {bulkActionOpen && (
                <div className="absolute left-0 top-full mt-1 bg-white text-gray-700 rounded-lg shadow-xl border z-50 min-w-40">
                  {['QUOTE','ORDER','In Progress','PROOF','PRINT','Pick/Pack','FINISH','INVOICE','PAID','CANCEL'].map(s => (
                    <button key={s} onMouseDown={() => bulkStatusChange(s)} className="block w-full text-left px-3 py-1.5 hover:bg-blue-50 text-sm">{s}</button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={bulkDelete} className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 font-medium">Delete</button>
            <button onClick={() => setSelectedJobIds(new Set())} className="ml-auto text-blue-200 hover:text-white text-xs">✕ Clear</button>
          </div>
        )}

        {/* Quick Filter Chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400 font-medium shrink-0">Quick:</span>
          {[
            { id: 'myJobs',       label: '👤 My Jobs',       color: 'border-blue-300 text-blue-700 bg-blue-50' },
            { id: 'overdue',      label: '🔴 Overdue',        color: 'border-red-300 text-red-700 bg-red-50' },
            { id: 'dueToday',     label: '📅 Due Today',      color: 'border-orange-300 text-orange-700 bg-orange-50' },
            { id: 'thisWeek',     label: '📆 This Week',      color: 'border-amber-300 text-amber-700 bg-amber-50' },
            { id: 'inProduction', label: '⚙ In Production',  color: 'border-cyan-300 text-cyan-700 bg-cyan-50' },
            { id: 'needsInvoice', label: '💰 Needs Invoice',  color: 'border-purple-300 text-purple-700 bg-purple-50' },
            { id: 'urgent',       label: '🚨 Urgent',         color: 'border-rose-300 text-rose-700 bg-rose-50' },
          ].map(chip => {
            const active = filterQuick === chip.id;
            return (
              <button key={chip.id}
                onClick={() => setFilterQuick(active ? null : chip.id)}
                className={`px-3 py-1 rounded-full border text-xs font-medium transition-all select-none ${active ? chip.color + ' shadow-sm ring-1 ring-inset ring-current/20' : 'border-gray-200 text-gray-500 bg-white hover:border-gray-300 hover:bg-gray-50'}`}>
                {chip.label}
                {active && <span className="ml-1.5 opacity-60">×</span>}
              </button>
            );
          })}
          {hasActiveFilters && !filterQuick && (
            <button onClick={clearFilters} className="px-3 py-1 rounded-full border border-gray-200 text-xs text-gray-400 hover:text-red-500 hover:border-red-300 bg-white transition-colors">
              Clear all ×
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
          {/* Row 1 */}
          <div className="grid grid-cols-5 gap-3">
            <div className="relative col-span-2">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
              <input ref={jobSearchRef} type="text" placeholder="Search job#, customer, invoice, ref, ship code…  (F12)"
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setSearchSuggestOpen(true); }}
                onFocus={() => setSearchSuggestOpen(true)}
                onBlur={() => setTimeout(() => setSearchSuggestOpen(false), 200)}
                autoComplete="off"
              />
              {searchSuggestOpen && searchTerm.length > 0 && (() => {
                const q = searchTerm.toLowerCase();
                const hits = jobs.filter(j =>
                  (j.id || '').toLowerCase().includes(q) ||
                  (j.customer || '').toLowerCase().includes(q) ||
                  (j.customerId || '').toLowerCase().includes(q) ||
                  (j.shipTo || '').toLowerCase().includes(q) ||
                  (j.invoice || '').toLowerCase().includes(q)
                ).slice(0, 7);
                if (!hits.length) return null;
                const statusColor = { 'QUOTE':'bg-purple-100 text-purple-700', 'ORDER':'bg-blue-100 text-blue-700', 'In Progress':'bg-yellow-100 text-yellow-700', 'FINISH':'bg-green-100 text-green-700', 'INVOICE':'bg-teal-100 text-teal-700', 'CANCEL':'bg-red-100 text-red-700' };
                return (
                  <div className="absolute left-0 top-full mt-1 w-full bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden" style={{ fontSize: '13px' }}>
                    <div className="px-3 py-1.5 text-xs text-gray-400 border-b bg-gray-50 flex items-center gap-1"><Search className="w-3 h-3" />Jobs matching "{searchTerm}"</div>
                    {hits.map(j => (
                      <div key={j.id} onMouseDown={() => { setSearchTerm(j.id); setSearchSuggestOpen(false); }}
                        className="flex items-center gap-3 px-3 py-2 cursor-pointer border-b last:border-0 hover:bg-blue-50">
                        <span className="font-mono font-bold text-blue-700 text-xs w-20 flex-shrink-0">{j.id}</span>
                        <span className="flex-1 truncate text-gray-700">{j.customer}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusColor[j.status] || 'bg-gray-100 text-gray-600'}`}>{j.status}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">All Statuses</option>
              <option value="QUOTE">Quote</option>
              <option value="New">New</option>
              <option value="ORDER">Order</option>
              <option value="In Progress">In Progress</option>
              <option value="PROOF">Proof</option>
              <option value="PRINT">Print</option>
              <option value="Pick/Pack">Pick/Pack</option>
              <option value="FINISH">Finished</option>
              <option value="INVOICE">Invoice</option>
              <option value="PAID">Paid</option>
              <option value="CANCEL">Cancelled</option>
            </select>

            <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">All Priorities</option>
              <option value="Low">Low</option>
              <option value="Normal">Normal</option>
              <option value="High">High</option>
              <option value="Urgent">Urgent</option>
            </select>

            <button
              onClick={() => setFilterOpenFreight(v => !v)}
              title="Show jobs with a ship code that haven't been dispatched yet"
              className={`flex items-center justify-center space-x-2 px-3 py-2 rounded border text-sm font-medium transition-colors ${
                filterOpenFreight
                  ? 'bg-cyan-600 text-white border-cyan-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-cyan-50 hover:border-cyan-400'
              }`}
            >
              <Truck className="w-4 h-4" />
              <span>Pending Dispatch</span>
            </button>
          </div>

          {/* Row 2: collapsed filters */}
          {showMoreFilters && (
          <div className="grid grid-cols-5 gap-3">
            <select value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">All Customers</option>
              {uniqueCustomers.map(c => (
                <option key={c.id} value={c.id}>{c.id} — {c.name}</option>
              ))}
            </select>

            <select value={filterShipCode} onChange={(e) => setFilterShipCode(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">All Ship Codes</option>
              {uniqueShipCodes.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <select value={filterCustomerGroup} onChange={(e) => setFilterCustomerGroup(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">All Groups</option>
              {uniqueGroups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>

            <select value={filterAssignedTo} onChange={(e) => setFilterAssignedTo(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">All Staff</option>
              {uniqueAssignees.map(a => <option key={a} value={a}>{a}</option>)}
            </select>

            <select value={filterDateField} onChange={(e) => setFilterDateField(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="dateIn">Filter by: Date In</option>
              <option value="due">Filter by: Due Date</option>
              <option value="out">Filter by: Out Date</option>
            </select>
          </div>
          )}

          {/* Row 3: date range + presets + more toggle */}
          <div className="flex items-center space-x-3 flex-wrap gap-y-1">
            {/* Date preset shortcuts */}
            {[
              { label: 'Today', fn: () => { const t = new Date().toISOString().slice(0,10); setFilterDateFrom(t); setFilterDateTo(t); } },
              { label: 'This week', fn: () => { const n = new Date(); const mon = new Date(n); mon.setDate(n.getDate() - n.getDay() + 1); setFilterDateFrom(mon.toISOString().slice(0,10)); setFilterDateTo(n.toISOString().slice(0,10)); } },
              { label: 'This month', fn: () => { const n = new Date(); setFilterDateFrom(`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-01`); setFilterDateTo(n.toISOString().slice(0,10)); } },
              { label: 'Last month', fn: () => { const n = new Date(); const f = new Date(n.getFullYear(), n.getMonth()-1, 1); const l = new Date(n.getFullYear(), n.getMonth(), 0); setFilterDateFrom(f.toISOString().slice(0,10)); setFilterDateTo(l.toISOString().slice(0,10)); } },
            ].map(p => (
              <button key={p.label} type="button" onClick={p.fn}
                className="text-xs px-2 py-1 rounded border border-gray-200 bg-white text-gray-500 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 transition-colors whitespace-nowrap">
                {p.label}
              </button>
            ))}
            <span className="text-xs text-gray-400 whitespace-nowrap">or</span>
            <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <span className="text-xs text-gray-500">→</span>
            <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button
              onClick={() => setShowMoreFilters(v => !v)}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded border font-medium transition-colors ${
                showMoreFilters || filterCustomer !== 'all' || filterShipCode !== 'all' || filterCustomerGroup !== 'all' || filterAssignedTo !== 'all'
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                  : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <ChevronDown className={`w-3 h-3 transition-transform ${showMoreFilters ? 'rotate-180' : ''}`} />
              More
              {(filterCustomer !== 'all' || filterShipCode !== 'all' || filterCustomerGroup !== 'all' || filterAssignedTo !== 'all') && (
                <span className="ml-0.5 w-4 h-4 rounded-full bg-blue-700 text-white text-[10px] flex items-center justify-center font-bold">
                  {[filterCustomer !== 'all', filterShipCode !== 'all', filterCustomerGroup !== 'all', filterAssignedTo !== 'all'].filter(Boolean).length}
                </span>
              )}
            </button>
            {hasActiveFilters && (
              <button onClick={clearFilters}
                className="flex items-center space-x-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1.5 rounded border border-red-200">
                <X className="w-3 h-3" /><span>Clear all</span>
              </button>
            )}
          </div>
        </div>

        {/* Kanban Board */}
        {jobsViewMode === 'kanban' && (() => {
          const kanbanCols = [
            { key: 'QUOTE', label: 'Quote', color: 'border-t-gray-400', bg: 'bg-gray-50' },
            { key: 'ORDER', label: 'Order', color: 'border-t-indigo-400', bg: 'bg-indigo-50' },
            { key: 'In Progress', label: 'In Progress', color: 'border-t-yellow-400', bg: 'bg-yellow-50' },
            { key: 'PROOF', label: 'Proof', color: 'border-t-purple-400', bg: 'bg-purple-50' },
            { key: 'PRINT', label: 'Print', color: 'border-t-orange-400', bg: 'bg-orange-50' },
            { key: 'Pick/Pack', label: 'Pick/Pack', color: 'border-t-cyan-400', bg: 'bg-cyan-50' },
            { key: 'FINISH', label: 'Finish', color: 'border-t-green-400', bg: 'bg-green-50' },
            { key: 'INVOICE', label: 'Invoice', color: 'border-t-teal-400', bg: 'bg-teal-50' },
          ];
          return (
            <div className="overflow-x-auto pb-4">
              <p className="text-xs text-gray-400 mb-2 pl-1">Drag cards between columns to update status</p>
              <div className="flex gap-3 min-w-max">
                {kanbanCols.map(col => {
                  const colJobs = filteredJobs.filter(j => j.status === col.key).sort((a, b) => {
                    const da = parseJobDate(a.due), db = parseJobDate(b.due);
                    if (!da && !db) return 0; if (!da) return 1; if (!db) return -1;
                    return da - db;
                  });
                  return (
                    <div
                      key={col.key}
                      className={`w-56 flex-shrink-0 rounded-lg border-t-4 ${col.color} shadow transition-all`}
                      onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('ring-2','ring-blue-400','ring-inset'); }}
                      onDragLeave={e => { e.currentTarget.classList.remove('ring-2','ring-blue-400','ring-inset'); }}
                      onDrop={e => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('ring-2','ring-blue-400','ring-inset');
                        const jobId = e.dataTransfer.getData('kanban-job-id');
                        if (jobId && jobId !== col.key) updateJobStatus(jobId, col.key);
                      }}
                    >
                      <div className={`${col.bg} px-3 py-2 rounded-t-lg flex items-center justify-between`}>
                        <span className="font-semibold text-sm text-gray-700">{col.label}</span>
                        <span className="text-xs bg-white px-1.5 py-0.5 rounded-full text-gray-500 font-medium shadow-sm">{colJobs.length}</span>
                      </div>
                      <div className="bg-white rounded-b-lg min-h-32 space-y-2 p-2 max-h-[60vh] overflow-y-auto">
                        {colJobs.map(job => {
                          const d = parseJobDate(job.due);
                          const over = d && d < new Date() && !['FINISH','PAID','CANCEL','INVOICE'].includes(job.status);
                          const decs = [...new Set((job.items || []).filter(i => i.decorationType && i.decorationType !== 'None').map(i => i.decorationType))];
                          return (
                            <div key={job.id}
                              draggable
                              onDragStart={e => { e.dataTransfer.setData('kanban-job-id', job.id); e.currentTarget.style.opacity = '0.5'; }}
                              onDragEnd={e => { e.currentTarget.style.opacity = '1'; }}
                              onClick={() => { pinJob(job); }}
                              className={`p-2.5 rounded-lg border cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow select-none ${over ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}
                            >
                              <div className="flex items-start justify-between gap-1 mb-1">
                                <span className="font-mono text-xs font-bold text-blue-600">#{job.id}</span>
                                <div className="flex gap-0.5">
                                  {job.priority === 'Urgent' && <span className="text-[10px] bg-red-100 text-red-600 px-1 rounded font-bold">URG</span>}
                                  {job.priority === 'High' && <span className="text-[10px] bg-orange-100 text-orange-600 px-1 rounded font-bold">HIGH</span>}
                                </div>
                              </div>
                              <p className="text-xs font-medium text-gray-800 truncate">{job.customer}</p>
                              {job.custRef && <p className="text-xs text-gray-400 truncate">Ref: {job.custRef}</p>}
                              {decs.length > 0 && (
                                <div className="flex gap-1 flex-wrap mt-1">
                                  {decs.slice(0,2).map(d => <span key={d} className="text-[10px] bg-purple-50 text-purple-700 px-1 rounded">{d}</span>)}
                                </div>
                              )}
                              <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-gray-100">
                                <span className={`text-xs flex items-center gap-0.5 ${over ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
                                  <Calendar className="w-3 h-3" />{job.due || '—'}{over ? ' ⚠' : ''}
                                </span>
                                <span className="text-xs font-semibold text-gray-700">${(job.total || 0).toLocaleString('en-AU', { minimumFractionDigits: 0 })}</span>
                              </div>
                              {job.assignedTo && <p className="text-xs text-gray-400 mt-0.5 truncate">👤 {job.assignedTo}</p>}
                            </div>
                          );
                        })}
                        {colJobs.length === 0 && <p className="text-xs text-gray-300 text-center py-4">Drop here</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Calendar View */}
        {jobsViewMode === 'calendar' && (() => {
          const today = new Date();
          const firstDay = new Date(calYear, calMonth, 1);
          const lastDay = new Date(calYear, calMonth + 1, 0);
          const startPad = firstDay.getDay(); // 0=Sun
          const totalCells = Math.ceil((startPad + lastDay.getDate()) / 7) * 7;
          const monthName = firstDay.toLocaleString('en-AU', { month: 'long', year: 'numeric' });

          const jobsByDay = {};
          filteredJobs.forEach(job => {
            const d = parseJobDate(job.due);
            if (d) {
              const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
              if (!jobsByDay[key]) jobsByDay[key] = [];
              jobsByDay[key].push(job);
            }
          });

          const statusColors2 = {
            QUOTE: 'bg-gray-200 text-gray-700', New: 'bg-blue-200 text-blue-800',
            ORDER: 'bg-indigo-200 text-indigo-800', 'In Progress': 'bg-yellow-200 text-yellow-800',
            PROOF: 'bg-purple-200 text-purple-800', PRINT: 'bg-orange-200 text-orange-800',
            'Pick/Pack': 'bg-cyan-200 text-cyan-800', FINISH: 'bg-green-200 text-green-800',
            INVOICE: 'bg-teal-200 text-teal-800', PAID: 'bg-emerald-200 text-emerald-800',
            CANCEL: 'bg-red-200 text-red-700',
          };

          return (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => { const d = new Date(calYear, calMonth - 1, 1); setCalMonth(d.getMonth()); setCalYear(d.getFullYear()); }} className="p-1.5 rounded hover:bg-gray-100">←</button>
                <h3 className="font-semibold text-lg">{monthName}</h3>
                <button onClick={() => { const d = new Date(calYear, calMonth + 1, 1); setCalMonth(d.getMonth()); setCalYear(d.getFullYear()); }} className="p-1.5 rounded hover:bg-gray-100">→</button>
              </div>
              <div className="grid grid-cols-7 gap-0 border-l border-t">
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                  <div key={d} className="text-center text-xs font-semibold text-gray-400 py-2 border-r border-b bg-gray-50">{d}</div>
                ))}
                {Array.from({ length: totalCells }).map((_, i) => {
                  const dayNum = i - startPad + 1;
                  const isValid = dayNum >= 1 && dayNum <= lastDay.getDate();
                  const isToday = isValid && today.getDate() === dayNum && today.getMonth() === calMonth && today.getFullYear() === calYear;
                  const key = `${calYear}-${calMonth}-${dayNum}`;
                  const dayJobs = isValid ? (jobsByDay[key] || []) : [];
                  return (
                    <div key={i} className={`border-r border-b min-h-20 p-1 ${isValid ? 'bg-white' : 'bg-gray-50'} ${isToday ? 'bg-blue-50' : ''}`}>
                      {isValid && (
                        <>
                          <div className={`text-xs font-medium mb-0.5 ${isToday ? 'bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center' : 'text-gray-400'}`}>
                            {dayNum}
                          </div>
                          <div className="space-y-0.5">
                            {dayJobs.slice(0, 3).map(job => (
                              <div key={job.id} onClick={() => { pinJob(job); }}
                                className={`text-xs px-1 py-0.5 rounded cursor-pointer truncate ${statusColors2[job.status] || 'bg-gray-200 text-gray-700'}`}
                                title={`#${job.id} ${job.customer}`}>
                                #{job.id} {job.customer?.split(' ')[0]}
                              </div>
                            ))}
                            {dayJobs.length > 3 && <div className="text-xs text-gray-400 pl-1">+{dayJobs.length - 3} more</div>}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 mt-2 text-right">Showing jobs by due date · {filteredJobs.filter(j => { const d = parseJobDate(j.due); return d && d.getMonth() === calMonth && d.getFullYear() === calYear; }).length} jobs this month</p>
            </div>
          );
        })()}

        {/* Production Board */}
        {jobsViewMode === 'production' && (() => {
          const prodStages = [
            { key: 'ORDER',       label: 'Order',        color: 'border-t-indigo-400', bg: 'bg-indigo-50',  icon: '📋' },
            { key: 'In Progress', label: 'In Progress',  color: 'border-t-yellow-400', bg: 'bg-yellow-50', icon: '⚙️' },
            { key: 'PROOF',       label: 'Artwork/Proof',color: 'border-t-purple-400', bg: 'bg-purple-50', icon: '🎨' },
            { key: 'PRINT',       label: 'Production',   color: 'border-t-orange-400', bg: 'bg-orange-50', icon: '🖨️' },
            { key: 'Pick/Pack',   label: 'Pick & Pack',  color: 'border-t-cyan-400',   bg: 'bg-cyan-50',   icon: '📦' },
            { key: 'FINISH',      label: 'Finishing',    color: 'border-t-green-400',  bg: 'bg-green-50',  icon: '✅' },
          ];
          const allProdJobs = filteredJobs.filter(j => prodStages.map(s => s.key).includes(j.status));
          const now = new Date();
          return (
            <div className="space-y-3">
              {/* Summary row */}
              <div className="flex items-center gap-4 flex-wrap">
                <p className="text-sm font-medium text-gray-700">{allProdJobs.length} jobs in production</p>
                {(() => {
                  const overdue = allProdJobs.filter(j => { const d = parseJobDate(j.due); return d && d < now; });
                  const urgent = allProdJobs.filter(j => j.priority === 'Urgent');
                  const dueToday = allProdJobs.filter(j => { const d = parseJobDate(j.due); return d && d.toDateString() === now.toDateString(); });
                  return <>
                    {overdue.length > 0 && <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-semibold">{overdue.length} overdue</span>}
                    {dueToday.length > 0 && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full font-semibold">{dueToday.length} due today</span>}
                    {urgent.length > 0 && <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-semibold">⚡ {urgent.length} urgent</span>}
                  </>;
                })()}
              </div>

              {allProdJobs.length === 0 ? (
                <div className="bg-white rounded-xl p-16 text-center text-gray-400 shadow-sm">
                  <p className="text-lg font-medium">Production floor is clear</p>
                  <p className="text-sm mt-1">No jobs are currently in production stages.</p>
                </div>
              ) : (
                <div className="overflow-x-auto pb-2">
                  <div className="flex gap-3 min-w-max">
                    {prodStages.map(stage => {
                      const stageJobs = filteredJobs.filter(j => j.status === stage.key).sort((a, b) => {
                        const priority = { Urgent: 0, High: 1, Normal: 2, Low: 3 };
                        const pa = priority[a.priority] ?? 2, pb = priority[b.priority] ?? 2;
                        if (pa !== pb) return pa - pb;
                        const da = parseJobDate(a.due), db = parseJobDate(b.due);
                        if (!da && !db) return 0; if (!da) return 1; if (!db) return -1;
                        return da - db;
                      });
                      return (
                        <div
                          key={stage.key}
                          className={`w-60 flex-shrink-0 rounded-xl border-t-4 ${stage.color} shadow-sm`}
                          onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('ring-2','ring-blue-400','ring-inset'); }}
                          onDragLeave={e => e.currentTarget.classList.remove('ring-2','ring-blue-400','ring-inset')}
                          onDrop={e => {
                            e.preventDefault();
                            e.currentTarget.classList.remove('ring-2','ring-blue-400','ring-inset');
                            const jobId = e.dataTransfer.getData('prod-job-id');
                            if (jobId) updateJobStatus(jobId, stage.key);
                          }}
                        >
                          <div className={`${stage.bg} px-3 py-2.5 rounded-t-xl`}>
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-sm text-gray-700">{stage.icon} {stage.label}</span>
                              <span className="text-xs bg-white px-1.5 py-0.5 rounded-full text-gray-500 font-medium">{stageJobs.length}</span>
                            </div>
                          </div>
                          <div className="bg-white rounded-b-xl min-h-32 space-y-2 p-2 max-h-[62vh] overflow-y-auto">
                            {stageJobs.length === 0 && <p className="text-xs text-gray-300 text-center py-6">No jobs</p>}
                            {stageJobs.map(job => {
                              const due = parseJobDate(job.due);
                              const isOverdue = due && due < now;
                              const daysLeft = due ? Math.ceil((due - now) / 86400000) : null;
                              const decs = [...new Set((job.items || []).filter(i => i.decorationType && i.decorationType !== 'None').map(i => i.decorationType))];
                              const itemCount = (job.items || []).filter(i => !i.displayType || i.displayType === 'product').length;
                              return (
                                <div
                                  key={job.id}
                                  draggable
                                  onDragStart={e => { e.dataTransfer.setData('prod-job-id', job.id); e.currentTarget.style.opacity = '0.5'; }}
                                  onDragEnd={e => { e.currentTarget.style.opacity = '1'; }}
                                  onClick={() => pinJob(job)}
                                  className={`p-3 rounded-lg border cursor-grab active:cursor-grabbing hover:shadow-md transition-all select-none ${
                                    isOverdue ? 'border-red-300 bg-red-50' :
                                    job.priority === 'Urgent' ? 'border-red-200 bg-white' :
                                    job.priority === 'High' ? 'border-orange-200 bg-white' :
                                    'border-gray-200 bg-white'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-1 mb-1.5">
                                    <span className="font-mono text-xs font-bold text-blue-600">#{job.id}</span>
                                    <div className="flex items-center gap-1">
                                      {job.priority === 'Urgent' && <span className="text-[10px] bg-red-100 text-red-700 px-1 rounded font-bold leading-4">URG</span>}
                                      {job.priority === 'High' && <span className="text-[10px] bg-orange-100 text-orange-700 px-1 rounded font-bold leading-4">HIGH</span>}
                                    </div>
                                  </div>
                                  <p className="text-xs font-semibold text-gray-800 truncate">{job.customer}</p>
                                  {job.description && <p className="text-[10px] text-gray-400 truncate mt-0.5">{job.description}</p>}
                                  {decs.length > 0 && (
                                    <div className="flex gap-1 flex-wrap mt-1.5">
                                      {decs.slice(0, 2).map(d => <span key={d} className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-medium">{d}</span>)}
                                    </div>
                                  )}
                                  <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-gray-100">
                                    <div>
                                      {due ? (
                                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                          isOverdue ? 'bg-red-100 text-red-700' :
                                          daysLeft === 0 ? 'bg-orange-100 text-orange-700' :
                                          daysLeft <= 2 ? 'bg-amber-50 text-amber-700' :
                                          'text-gray-400'
                                        }`}>
                                          {isOverdue ? `${Math.abs(daysLeft)}d late` : daysLeft === 0 ? 'Today' : `${daysLeft}d`}
                                        </span>
                                      ) : <span className="text-[10px] text-gray-300">No due date</span>}
                                    </div>
                                    <span className="text-[10px] font-bold text-gray-700">${(job.total || 0).toFixed(0)}</span>
                                  </div>
                                  {(job.assignedTo || itemCount > 0) && (
                                    <div className="flex items-center justify-between mt-1 text-[10px] text-gray-400">
                                      {job.assignedTo && <span>👤 {job.assignedTo}</span>}
                                      {itemCount > 0 && <span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Jobs Table */}
        {jobsViewMode === 'table' && (() => {
          // ── Sort ──────────────────────────────────────────────────────────
          const sortedJobs = [...filteredJobs].sort((a, b) => {
            const { col, dir } = jobsSort;
            let av = a[col], bv = b[col];
            if (col === 'total' || col === 'balanceDue') { av = Number(av || 0); bv = Number(bv || 0); }
            else if (col === 'dateIn' || col === 'due') {
              av = av ? parseJobDate(av)?.getTime() || 0 : 0;
              bv = bv ? parseJobDate(bv)?.getTime() || 0 : 0;
            } else { av = (av || '').toString().toLowerCase(); bv = (bv || '').toString().toLowerCase(); }
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return dir === 'asc' ? cmp : -cmp;
          });
          const SortTh = ({ col, children, right, mono }) => {
            const active = jobsSort.col === col;
            return (
              <th
                className={`px-3 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100 transition-colors ${right ? 'text-right' : 'text-left'}`}
                onClick={() => setJobsSort(s => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }))}
              >
                <span className={`flex items-center gap-0.5 ${right ? 'justify-end' : ''}`}>
                  {children}
                  <span className={`ml-0.5 ${active ? 'text-[#1e3a8a]' : 'text-gray-300'}`}>
                    {active ? (jobsSort.dir === 'asc' ? '▲' : '▼') : '⇅'}
                  </span>
                </span>
              </th>
            );
          };
          // Status left-border colors for enterprise row style
          const rowBorder = { QUOTE:'border-l-gray-400', New:'border-l-blue-500', ORDER:'border-l-indigo-500', 'In Progress':'border-l-yellow-500', PROOF:'border-l-purple-500', PRINT:'border-l-orange-500', 'Pick/Pack':'border-l-cyan-500', FINISH:'border-l-green-600', INVOICE:'border-l-teal-500', PAID:'border-l-emerald-600', CANCEL:'border-l-red-400' };
          const priorityDot = { Urgent:'bg-red-500', High:'bg-orange-400', Normal:'bg-gray-300', Low:'bg-gray-200' };

          return (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f8f9fb] border-b-2 border-gray-200">
                  <th className="px-3 py-2.5 w-9 border-l-4 border-l-transparent">
                    <input type="checkbox" className="rounded w-3.5 h-3.5"
                      checked={filteredJobs.length > 0 && filteredJobs.every(j => selectedJobIds.has(j.id))}
                      onChange={() => toggleSelectAll(filteredJobs)} />
                  </th>
                  <SortTh col="id" mono>Job #</SortTh>
                  <SortTh col="customer">Customer</SortTh>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-left">Ship Code</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-left">Invoice #</th>
                  <SortTh col="status">Status</SortTh>
                  <SortTh col="priority">Priority</SortTh>
                  <SortTh col="assignedTo">Assigned</SortTh>
                  <SortTh col="dateIn">Date In</SortTh>
                  <SortTh col="due">Due</SortTh>
                  <SortTh col="total" right>Total</SortTh>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-center">Margin</th>
                  <SortTh col="balanceDue" right>Balance</SortTh>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-center w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedJobs.length === 0 ? (
                  <tr>
                    <td colSpan="14" className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-2 text-gray-400">
                        <FileText className="w-10 h-10 text-gray-200" />
                        <p className="font-medium text-sm">No jobs match the current filters</p>
                        <button onClick={clearFilters} className="text-xs text-blue-600 hover:underline">Clear all filters</button>
                      </div>
                    </td>
                  </tr>
                ) : sortedJobs.map(job => {
                  const d = parseJobDate(job.due);
                  const isOverdueRow = d && d < new Date() && !['FINISH','PAID','CANCEL'].includes(job.status);
                  const isDueTodayRow = d && d.toISOString().split('T')[0] === new Date().toISOString().split('T')[0] && !['FINISH','PAID','CANCEL'].includes(job.status);
                  const rowBg = selectedJobIds.has(job.id) ? 'bg-blue-50' : isOverdueRow ? 'bg-red-50/40' : isDueTodayRow ? 'bg-orange-50/30' : '';
                  return (
                  <tr key={job.id}
                    className={`group cursor-pointer transition-colors hover:bg-blue-50/60 ${rowBg} border-l-4 ${rowBorder[job.status] || 'border-l-gray-200'}`}
                    onClick={() => { pinJob(job); }}
                  >
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" className="rounded w-3.5 h-3.5" checked={selectedJobIds.has(job.id)} onChange={() => toggleJobSelect(job.id)} />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-mono font-bold text-[#1e3a8a] text-sm">#{job.id}</span>
                      {job.locked && <span className="ml-1 text-[10px]" title="Locked">🔒</span>}
                    </td>
                    <td className="px-3 py-2.5 max-w-[180px]">
                      <p className="font-semibold text-gray-800 text-sm truncate">{job.customer}</p>
                      <p className="text-[10px] text-gray-400 font-mono leading-tight">{job.customerId}{job.custRef ? ` · ${job.custRef}` : ''}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      {job.shipTo ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); setActiveModule('card-files'); setSelectedCardFile(cardFiles.find(c => c.shipCode === job.shipTo) || null); setFilterShipCode(job.shipTo); }}
                          className="font-mono text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded hover:bg-blue-100 border border-blue-200"
                          title="View card file"
                        >{job.shipTo}</button>
                      ) : <span className="text-gray-200 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 font-mono">{job.invoice || <span className="text-gray-200">—</span>}</td>
                    <td className="px-3 py-2.5">
                      <select
                        value={job.status}
                        onChange={(e) => { e.stopPropagation(); updateJobStatus(job.id, e.target.value); }}
                        onClick={(e) => e.stopPropagation()}
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border-0 cursor-pointer ${statusColors[job.status] || 'bg-gray-100 text-gray-700'}`}
                      >
                        <option value="QUOTE">Quote</option>
                        <option value="New">New</option>
                        <option value="ORDER">Order</option>
                        <option value="In Progress">In Progress</option>
                        <option value="PROOF">Proof</option>
                        <option value="PRINT">Print</option>
                        <option value="Pick/Pack">Pick/Pack</option>
                        <option value="FINISH">Finish</option>
                        <option value="INVOICE">Invoice</option>
                        <option value="PAID">Paid</option>
                        <option value="CANCEL">Cancel</option>
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`flex items-center gap-1.5 text-xs font-medium ${job.priority === 'Urgent' ? 'text-red-600' : job.priority === 'High' ? 'text-orange-600' : 'text-gray-400'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityDot[job.priority] || 'bg-gray-300'}`} />
                        {job.priority || 'Normal'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">{job.assignedTo || <span className="text-gray-200">—</span>}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 tabular-nums">{job.dateIn}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">
                      {job.due ? (
                        <span className={`font-medium ${isOverdueRow ? 'text-red-600' : isDueTodayRow ? 'text-orange-600' : 'text-gray-700'}`}>
                          {job.due}
                          {isOverdueRow && <span className="ml-1 text-[10px]">⚠</span>}
                          {isDueTodayRow && <span className="ml-1 text-[10px] text-orange-500">●</span>}
                        </span>
                      ) : <span className="text-gray-200">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="text-sm font-semibold text-gray-800 tabular-nums">
                        ${(job.total || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {job.cost > 0 ? (
                        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${job.marginPct >= 30 ? 'bg-green-100 text-green-800' : job.marginPct >= 10 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-700'}`}>
                          {job.marginPct}%
                        </span>
                      ) : <span className="text-gray-200 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className={`text-sm font-semibold tabular-nums ${job.balanceDue > 0.005 ? 'text-red-600' : 'text-emerald-600'}`}>
                          ${(job.balanceDue || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        {job.paymentStatus === 'paid' && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded font-bold">✓</span>}
                        {job.paymentStatus === 'partial' && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1 py-0.5 rounded font-bold">½</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); pinJob(job); setShowJobDetail(true); }} className="p-1 hover:bg-gray-200 rounded" title="View"><Eye className="w-3.5 h-3.5 text-gray-600" /></button>
                        <button onClick={(e) => { e.stopPropagation(); openModal('job', job); }} className="p-1 hover:bg-blue-100 rounded" title="Edit"><Edit className="w-3.5 h-3.5 text-blue-600" /></button>
                        <button onClick={(e) => { e.stopPropagation(); cloneJob(job); }} className="p-1 hover:bg-purple-100 rounded" title="Clone"><Copy className="w-3.5 h-3.5 text-purple-500" /></button>
                        <button onClick={(e) => { e.stopPropagation(); deleteJob(job.id); }} className="p-1 hover:bg-red-100 rounded" title="Delete"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </div>
          );
        })()}
        </>
        )}

        {/* Job Detail — full-page child module */}
        {activeJob && showJobDetail && (
          <div className="space-y-3">
            {/* ── Breadcrumb ─────────────────────────────────────────────── */}
            <div className="flex items-center gap-1.5 text-sm select-none bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-2.5">
              <button onClick={() => setShowJobDetail(false)} className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium transition-colors shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
                Jobs
              </button>
              <span className="text-gray-300">/</span>
              <span className="font-mono text-gray-500 text-xs shrink-0">#{activeJob.id}</span>
              <span className="text-gray-300">/</span>
              <span className="font-medium text-gray-700 truncate">{activeJob.customer}</span>
              <span className={`shrink-0 text-xs font-semibold px-2.5 py-0.5 rounded-full ${jStatusColors[activeJob.status] || 'bg-gray-100 text-gray-600'}`}>{activeJob.status}</span>
              {activeJob.locked && <span className="shrink-0 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">🔒 Locked</span>}
              {activeJob.priority === 'Urgent' && <span className="shrink-0 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">Urgent</span>}
              <div className="flex-1" />
              {activeJob.status === 'QUOTE' && (
                <button onClick={() => updateJobStatus(activeJob.id, 'ORDER')} className="shrink-0 flex items-center gap-1 text-xs px-3 py-1.5 bg-blue-700 text-white rounded-lg hover:bg-blue-800 font-medium">
                  Convert to Order →
                </button>
              )}
              <button onClick={() => openModal('job', activeJob)} className="shrink-0 flex items-center gap-1 text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
                <Edit className="w-3.5 h-3.5" />Edit
              </button>
              <button onClick={() => cloneJob(activeJob)} className="shrink-0 flex items-center gap-1 text-xs px-3 py-1.5 bg-white border text-gray-600 rounded-lg hover:bg-gray-50 font-medium">
                <Copy className="w-3.5 h-3.5" />Clone
              </button>
              <div className="relative shrink-0">
                <button onClick={() => setPrintDropdownOpen(o => !o)} className="flex items-center gap-1 text-xs px-3 py-1.5 bg-white border text-gray-600 rounded-lg hover:bg-gray-50 font-medium">
                  <Printer className="w-3.5 h-3.5" />Print<ChevronDown className="w-3 h-3" />
                </button>
                {printDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-white border rounded-xl shadow-2xl z-30 w-44 py-1.5 overflow-hidden" onMouseLeave={() => setPrintDropdownOpen(false)}>
                    {[
                      { type:'invoice',      label:'TAX Invoice',    action:()=>{ setInvoiceJob(activeJob); setPrintDropdownOpen(false); } },
                      { type:'pickingSlip',  label:'Picking Slip',   action:()=>{ setDocumentPrint({ type:'pickingSlip',  job:activeJob }); setPrintDropdownOpen(false); } },
                      { type:'deliveryNote', label:'Delivery Note',  action:()=>{ setDocumentPrint({ type:'deliveryNote', job:activeJob }); setPrintDropdownOpen(false); } },
                      { type:'jobSheet',     label:'Job Sheet',      action:()=>{ setDocumentPrint({ type:'jobSheet',     job:activeJob }); setPrintDropdownOpen(false); } },
                      { type:'shipLabel',    label:'Ship Label',     action:()=>{ setDocumentPrint({ type:'shipLabel',    job:activeJob }); setPrintDropdownOpen(false); } },
                    ].map(d => (
                      <button key={d.type} onClick={d.action} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2">
                        <Printer className="w-3.5 h-3.5 text-gray-400" />{d.label}
                      </button>
                    ))}
                    <div className="border-t mx-2 my-1" />
                    <a
                      href={`/api/jobs/${activeJob.id}/pdf?type=${activeJob.status === 'QUOTE' ? 'quote' : 'invoice'}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setPrintDropdownOpen(false)}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-green-50 flex items-center gap-2 text-green-700 no-underline"
                    >
                      <Download className="w-3.5 h-3.5" />Download PDF
                    </a>
                  </div>
                )}
              </div>
              <button onClick={() => setEmailModalJob(activeJob)} className="shrink-0 flex items-center gap-1 text-xs px-3 py-1.5 bg-white border text-gray-600 rounded-lg hover:bg-gray-50 font-medium">
                <Mail className="w-3.5 h-3.5" />Email
              </button>
            </div>
            <div className="flex gap-4 items-start">
              <div className="flex-1 min-w-0">

            {/* ── Detail card ────────────────────────────────────────────── */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
            {/* Jim2-style compact header grid */}
            {(() => {
              const F = ({ label, value, badge, mono, red, green }) => (
                <div className="flex items-baseline gap-1 min-w-0 py-0.5 border-b border-gray-100">
                  <span className="text-gray-400 text-xs whitespace-nowrap shrink-0 w-20">{label}</span>
                  {badge
                    ? <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${badge}`}>{value || '—'}</span>
                    : <span className={`text-xs font-medium truncate ${mono ? 'font-mono text-blue-700' : red ? 'text-red-600' : green ? 'text-green-600' : 'text-gray-800'}`}>{value || <span className="text-gray-300">—</span>}</span>}
                </div>
              );
              const isOverdue = (d) => d && new Date(d.split('/').reverse().join('-')) < new Date() && !['FINISH','PAID','CANCEL'].includes(activeJob.status);
              return (
                <div className="grid grid-cols-4 gap-x-6 mb-5 pb-4 border-b text-xs">
                  {/* Col 1 – job identity */}
                  <div>
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Job</div>
                    <F label="Job #" value={activeJob.id} mono />
                    <F label="Cust Ref#" value={activeJob.custRef} />
                    <F label="Invoice#" value={activeJob.invoice} mono />
                    <F label="Date In" value={activeJob.dateIn} />
                    <F label="Desc." value={activeJob.description} />
                    <F label="Project#" value={activeJob.projectNo} />
                    <F label="Serial#" value={activeJob.serialNo} />
                    <F label="Quote Ref" value={activeJob.quote} />
                  </div>
                  {/* Col 2 – customer & shipping */}
                  <div>
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Customer</div>
                    <F label="Cust#" value={activeJob.customerId} mono />
                    <F label="Name" value={activeJob.customer} />
                    <F label="Contact" value={activeJob.nameContact} />
                    <F label="Ship#" value={activeJob.shipTo} mono />
                    <F label="Our Ref#" value={activeJob.ourRef} />
                    <F label="Assigned" value={activeJob.assignedTo} />
                    {activeJob.shippingAddress && (
                      <div className="mt-1 text-xs text-gray-500 bg-gray-50 rounded px-1.5 py-1 leading-relaxed">{activeJob.shippingAddress}</div>
                    )}
                  </div>
                  {/* Col 3 – status & dates */}
                  <div>
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Status & Dates</div>
                    <F label="Status" value={activeJob.status}
                      badge={`${jStatusColors[activeJob.status] || 'bg-gray-100 text-gray-600'}`} />
                    <F label="Priority" value={activeJob.priority}
                      red={['High','Urgent'].includes(activeJob.priority)} />
                    <F label="Type" value={activeJob.type} />
                    <F label="Due" value={activeJob.due} red={isOverdue(activeJob.due)} />
                    <F label="Out" value={activeJob.out} />
                    <F label="Commitment" value={activeJob.commitmentDate} />
                    {activeJob.validityDate && (
                      <F label="Valid Until" value={activeJob.validityDate}
                        red={new Date(activeJob.validityDate) < new Date()} />
                    )}
                  </div>
                  {/* Col 4 – financial */}
                  <div>
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Financial</div>
                    <F label="Payment" value={activeJob.paymentMethod} />
                    <F label="Paid Status" value={activeJob.paymentStatus || 'unpaid'}
                      badge={activeJob.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' : activeJob.paymentStatus === 'partial' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-50 text-red-600'} />
                    <F label="Inv. Status" value={(activeJob.invoiceStatus || 'not_invoiced').replace(/_/g, ' ')}
                      badge={activeJob.invoiceStatus === 'invoiced' ? 'bg-blue-100 text-blue-700' : activeJob.invoiceStatus === 'to_invoice' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'} />
                    {activeJob.proofStatus && activeJob.proofStatus !== 'none' && (
                      <F label="Proof" value={activeJob.proofStatus}
                        badge={activeJob.proofStatus === 'approved' ? 'bg-emerald-100 text-emerald-700' : activeJob.proofStatus === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'} />
                    )}
                    <div className="mt-2 pt-2 border-t space-y-0.5">
                      <div className="flex justify-between text-xs"><span className="text-gray-400">Subtotal</span><span className="font-medium">${(activeJob.subtotal || 0).toFixed(2)}</span></div>
                      <div className="flex justify-between text-xs"><span className="text-gray-400">GST</span><span className="font-medium">${(activeJob.tax || 0).toFixed(2)}</span></div>
                      <div className="flex justify-between text-sm font-bold border-t pt-1 mt-1"><span>Total</span><span>${(activeJob.total || 0).toFixed(2)}</span></div>
                      <div className="flex justify-between text-xs"><span className="text-gray-400">Paid</span><span className="text-green-600 font-medium">${(activeJob.invoicePaid || 0).toFixed(2)}</span></div>
                      <div className="flex justify-between text-xs"><span className="text-gray-400">Balance</span>
                        <span className={`font-semibold ${activeJob.balanceDue > 0 ? 'text-red-600' : 'text-green-600'}`}>${(activeJob.balanceDue || 0).toFixed(2)}</span>
                      </div>
                    </div>
                    {activeJob.balanceDue > 0 && (
                      <button
                        onClick={() => setPaymentModal({ show: true, jobId: activeJob.id, maxAmount: activeJob.balanceDue, amount: activeJob.balanceDue.toFixed(2), method: 'Credit Card' })}
                        className="mt-2 w-full bg-green-600 text-white px-2 py-1.5 rounded hover:bg-green-700 text-xs flex items-center justify-center gap-1"
                      >
                        <CreditCard className="w-3 h-3" />Record Payment
                      </button>
                    )}
                    {activeJob.locked && (
                      <div className="mt-1 text-center text-xs font-semibold px-2 py-1 rounded bg-amber-100 text-amber-700">🔒 Locked</div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ── Jim2-style Comments panel (middle, always visible) ── */}
            <div className="mb-4 border border-gray-200 rounded bg-gray-50">
              <div className="flex items-center justify-between px-3 py-1.5 bg-gray-100 border-b border-gray-200 rounded-t">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Comments & Activity</span>
                <span className="text-[10px] text-gray-400">{(activeJob.comments || []).length} entries</span>
              </div>
              {(activeJob.comments || []).length > 0 && (
                <div className="overflow-x-auto max-h-44 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-100 border-b sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-center text-gray-500 font-semibold w-7">#</th>
                        <th className="px-2 py-1 text-left text-gray-500 font-semibold whitespace-nowrap">Date</th>
                        <th className="px-2 py-1 text-left text-gray-500 font-semibold whitespace-nowrap">Time</th>
                        <th className="px-2 py-1 text-left text-gray-500 font-semibold whitespace-nowrap">User</th>
                        <th className="px-2 py-1 text-left text-gray-500 font-semibold whitespace-nowrap">Status</th>
                        <th className="px-2 py-1 text-center text-gray-500 font-semibold whitespace-nowrap w-7" title="Include in customer documents">Inc</th>
                        <th className="px-2 py-1 text-left text-gray-500 font-semibold">Comment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {[...activeJob.comments].reverse().map((comment, idx) => (
                        <tr key={idx} className={comment.isInternal ? 'bg-amber-50' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                          <td className="px-2 py-1 text-center text-gray-400">{activeJob.comments.length - idx}</td>
                          <td className="px-2 py-1 text-gray-600 whitespace-nowrap">{comment.date}</td>
                          <td className="px-2 py-1 text-gray-600 whitespace-nowrap">{comment.time}</td>
                          <td className="px-2 py-1 font-mono font-semibold text-gray-700 whitespace-nowrap" title={comment.authorName}>{comment.initials}</td>
                          <td className="px-2 py-1 whitespace-nowrap">
                            {comment.status && (
                              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px]">{comment.status}</span>
                            )}
                          </td>
                          <td className="px-2 py-1 text-center">
                            {comment.inc ? <span className="text-green-600 font-bold">✓</span> : <span className="text-gray-200">—</span>}
                          </td>
                          <td className={`px-2 py-1 ${comment.isInternal ? 'italic text-amber-800' : 'text-gray-800'}`}>
                            {comment.isInternal && <span className="mr-1 text-amber-600 font-semibold">[int]</span>}
                            {comment.comment}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {(activeJob.comments || []).length === 0 && (
                <p className="text-xs text-gray-400 text-center py-3">No comments yet</p>
              )}
              <div className="flex gap-2 px-3 py-2 border-t border-gray-200">
                <input
                  type="text"
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && commentInput.trim()) {
                      addJobComment(activeJob.id, commentInput.trim());
                      setCommentInput('');
                    }
                  }}
                  placeholder="Add a comment or note… (Enter to submit)"
                  className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <button
                  onClick={() => { if (commentInput.trim()) { addJobComment(activeJob.id, commentInput.trim(), true); setCommentInput(''); } }}
                  className="text-xs bg-gray-100 text-gray-600 border border-gray-300 px-2 py-1 rounded hover:bg-gray-200 whitespace-nowrap"
                  title="Add as internal note (not visible to customer)"
                >Internal</button>
                <button
                  onClick={() => { if (commentInput.trim()) { addJobComment(activeJob.id, commentInput.trim()); setCommentInput(''); } }}
                  className="text-xs bg-[#1e3a8a] text-white px-3 py-1 rounded hover:bg-blue-800 whitespace-nowrap"
                >Add</button>
              </div>
            </div>

            {/* ── Jim2-style Line Items panel (bottom) ── */}
            {activeJob.items && activeJob.items.length > 0 && (
              <div className="border border-gray-200 rounded overflow-hidden">
                <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-200 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Order Items</span>
                  <span className="text-[10px] text-gray-400">{activeJob.items.filter(i => !i.displayType).length} lines</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" style={{ minWidth: 860 }}>
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap">Status</th>
                        <th className="px-2 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap">PO #</th>
                        <th className="px-2 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap">PO Due</th>
                        <th className="px-2 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap">Stock Code</th>
                        <th className="px-2 py-1.5 text-left font-semibold text-gray-600">Description</th>
                        <th className="px-2 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap">Order</th>
                        <th className="px-2 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap">Supply</th>
                        <th className="px-2 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap">B. Ord</th>
                        <th className="px-2 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap">Qty Pick</th>
                        <th className="px-2 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap">Price Ex</th>
                        <th className="px-2 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap">Price Inc</th>
                        <th className="px-2 py-1.5 text-center font-semibold text-gray-600 whitespace-nowrap">Tax</th>
                        <th className="px-2 py-1.5 text-center font-semibold text-gray-600 whitespace-nowrap">Hide</th>
                        <th className="px-2 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {activeJob.items.map((item, idx) => {
                        const isSec = item.displayType === 'section';
                        const isNote = item.displayType === 'note';
                        if (isSec) return (
                          <tr key={idx} className="bg-blue-50 border-l-4 border-l-blue-400">
                            <td colSpan={14} className="px-3 py-1.5 font-bold text-blue-800 text-xs">{item.description}</td>
                          </tr>
                        );
                        if (isNote) return (
                          <tr key={idx} className="bg-yellow-50">
                            <td colSpan={14} className="px-3 py-1.5 italic text-yellow-700 text-xs">{item.description}</td>
                          </tr>
                        );
                        return (
                        <tr key={idx} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'} hover:bg-blue-50 ${item.hide ? 'opacity-50' : ''}`}>
                          <td className="px-2 py-1.5">
                            {item.itemStatus
                              ? <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">{item.itemStatus}</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-2 py-1.5 font-mono text-gray-700">{item.poNo || <span className="text-gray-300">—</span>}</td>
                          <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{item.poDue || <span className="text-gray-300">—</span>}</td>
                          <td className="px-2 py-1.5 font-mono text-blue-700">{item.stockCode || <span className="text-gray-300">—</span>}</td>
                          <td className="px-2 py-1.5">
                            <div className="font-medium text-gray-900">{item.description}</div>
                            {item.sizes && <div className="text-gray-500 whitespace-pre-line mt-0.5">{item.sizes}</div>}
                            {item.embCode && <div className="text-xs text-purple-700 font-mono mt-0.5">🧵 {item.embCode}</div>}
                            {item.trsCode && <div className="text-xs text-orange-700 font-mono mt-0.5">♨️ {item.trsCode}</div>}
                          </td>
                          <td className="px-2 py-1.5 text-right text-gray-800">{item.order}</td>
                          <td className="px-2 py-1.5 text-right">
                            <span className={item.supply >= item.order ? 'text-green-600 font-medium' : 'text-red-600'}>
                              {item.supply}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-right text-orange-600 font-medium">{item.bOrd > 0 ? item.bOrd : <span className="text-gray-300">—</span>}</td>
                          <td className="px-2 py-1.5 text-right text-purple-700 font-medium">{item.qtyPick > 0 ? item.qtyPick : <span className="text-gray-300">—</span>}</td>
                          <td className="px-2 py-1.5 text-right">${(item.priceEx || 0).toFixed(2)}</td>
                          <td className="px-2 py-1.5 text-right">${(item.priceInc || 0).toFixed(2)}</td>
                          <td className="px-2 py-1.5 text-center text-gray-500">{item.taxType || 'G'}</td>
                          <td className="px-2 py-1.5 text-center">{item.hide ? <span className="text-orange-500 font-bold">✓</span> : <span className="text-gray-200">✗</span>}</td>
                          <td className="px-2 py-1.5 text-right font-semibold">${(item.total || 0).toFixed(2)}</td>
                        </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                      <tr>
                        <td colSpan={13} className="px-3 py-1.5 text-right text-xs text-gray-500">
                          {activeJob.weightTotal > 0 && (
                            <span className="mr-4 text-indigo-600"><strong>Weight: {Number(activeJob.weightTotal).toFixed(2)} kg</strong></span>
                          )}
                          <span className="mr-4">Subtotal: <strong>${(activeJob.subtotal || 0).toFixed(2)}</strong></span>
                          <span className="mr-4">GST: <strong>${(activeJob.tax || 0).toFixed(2)}</strong></span>
                          <span className="mr-4">Total (Inc): <strong className="text-gray-800">${(activeJob.totalInc || activeJob.total || 0).toFixed(2)}</strong></span>
                          {activeJob.balanceDue > 0 && <span className="text-red-600">Balance: <strong>${(activeJob.balanceDue || 0).toFixed(2)}</strong></span>}
                        </td>
                        <td className="px-2 py-1.5 text-right font-bold text-sm">
                          ${(activeJob.totalInc || activeJob.total || 0).toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* ── Secondary tab strip ──────────────────────────────────── */}
            <div className="mt-3 border-t border-gray-200 pt-1 flex gap-0 text-xs">
              {[
                { id: 'pickpack',  label: 'Pick / Pack', icon: CheckSquare },
                { id: 'documents', label: 'Documents',   icon: ClipboardList },
                { id: 'cost',      label: 'Cost',        icon: DollarSign },
                { id: 'activity',  label: 'Activity',    icon: Bell },
              ].map(tab => {
                const Icon = tab.icon;
                const isActive = jobDetailTab === tab.id;
                return (
                  <button key={tab.id}
                    onClick={() => setJobDetailTab(isActive ? 'job' : tab.id)}
                    className={`flex items-center gap-1 px-3 py-1.5 border-b-2 transition-colors ${isActive ? 'border-blue-500 text-blue-600 font-medium bg-blue-50' : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}>
                    <Icon className="w-3 h-3" />{tab.label}
                  </button>
                );
              })}
            </div>

            {/* ── PICK / PACK TAB ──────────────────────────────────────── */}
            {jobDetailTab === 'pickpack' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-600">Check off items as you pick them from the warehouse.</p>
                  <button
                    onClick={() => setDocumentPrint({ type: 'pickingSlip', job: activeJob })}
                    className="text-sm bg-orange-500 text-white px-3 py-1.5 rounded hover:bg-orange-600 flex items-center"
                  >
                    <Printer className="w-3 h-3 mr-1" />Print Picking Slip
                  </button>
                </div>
                {(activeJob.items || []).length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-6 border rounded">No items on this job.</p>
                ) : (
                  <div className="border rounded overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 w-10 text-center text-xs font-medium text-gray-500">✓</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Stock Code</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Sizes</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Bin</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Qty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(activeJob.items || []).map((item, idx) => {
                          const picked = (pickState[activeJob.id] || {})[idx] || false;
                          const binLoc = inventory.find(i => i.sku === item.stockCode)?.location || '—';
                          return (
                            <tr key={idx} className={picked ? 'bg-green-50' : 'hover:bg-gray-50'}>
                              <td className="px-3 py-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={picked}
                                  onChange={() => setPickState(prev => ({
                                    ...prev,
                                    [activeJob.id]: { ...(prev[activeJob.id] || {}), [idx]: !picked }
                                  }))}
                                  className="w-4 h-4 rounded cursor-pointer accent-green-600"
                                />
                              </td>
                              <td className={`px-3 py-3 font-mono text-xs ${picked ? 'line-through text-gray-400' : ''}`}>{item.stockCode}</td>
                              <td className={`px-3 py-3 ${picked ? 'line-through text-gray-400' : ''}`}>{item.description}</td>
                              <td className="px-3 py-3 text-xs text-gray-500">{item.sizes || '—'}</td>
                              <td className="px-3 py-3 font-mono text-xs text-blue-600 font-medium">{binLoc}</td>
                              <td className="px-3 py-3 text-right font-medium">{item.order || item.qty || 0}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {(activeJob.items || []).length > 0 && (() => {
                  const total = activeJob.items.length;
                  const pickedCount = Object.values(pickState[activeJob.id] || {}).filter(Boolean).length;
                  const pct = Math.round((pickedCount / total) * 100);
                  return (
                    <div className="bg-gray-50 rounded p-3">
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <span className="text-gray-600">Pick Progress</span>
                        <span className="font-medium">{pickedCount}/{total} items ({pct}%)</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className={`h-2 rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                      {pct === 100 && (
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-green-600 text-sm font-medium">All items picked!</span>
                          <button onClick={() => updateJobStatus(activeJob.id, 'FINISH')} className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700">
                            Mark Complete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── DOCUMENTS TAB ────────────────────────────────────────── */}
            {jobDetailTab === 'documents' && (
              <div>
                <p className="text-sm text-gray-500 mb-4">Generate and print documents for Job #{activeJob.id}.</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { type: 'invoice', label: 'TIG TAX Invoice', desc: 'Standard tax invoice with totals and payment details', icon: FileText, color: 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700' },
                    { type: 'pickingSlip', label: 'TIG Picking Slip', desc: 'Warehouse pick list with bin locations and checkboxes', icon: ClipboardList, color: 'bg-orange-50 hover:bg-orange-100 border-orange-200 text-orange-700' },
                    { type: 'deliveryNote', label: 'TIG Delivery Note', desc: 'Customer delivery confirmation with signature fields', icon: Truck, color: 'bg-green-50 hover:bg-green-100 border-green-200 text-green-700' },
                    { type: 'jobSheet', label: 'TIG Job Sheet', desc: 'Production order with job details and instructions', icon: FileSpreadsheet, color: 'bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700' },
                    { type: 'shipLabel', label: 'Ship Label', desc: 'Large-format shipping label with recipient address and job number', icon: Tag, color: 'bg-red-50 hover:bg-red-100 border-red-200 text-red-700' },
                  ].map(doc => {
                    const Icon = doc.icon;
                    return (
                      <button
                        key={doc.type}
                        onClick={() => {
                          if (doc.type === 'invoice') setInvoiceJob(activeJob);
                          else setDocumentPrint({ type: doc.type, job: activeJob });
                        }}
                        className={`p-4 rounded-lg border text-left transition-colors ${doc.color}`}
                      >
                        <Icon className="w-5 h-5 mb-2" />
                        <p className="font-semibold text-sm">{doc.label}</p>
                        <p className="text-xs opacity-70 mt-0.5">{doc.desc}</p>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 pt-4 border-t text-xs text-gray-400">
                  <p>All documents open a print-ready preview. Use your browser's print function (Ctrl+P) to print or save as PDF.</p>
                </div>
              </div>
            )}

            {/* ── COST TAB ─────────────────────────────────────────────── */}
            {jobDetailTab === 'cost' && (
              <div className="space-y-4">
                {(() => {
                  const productLines = (activeJob.items || []).filter(i => i.displayType !== 'section' && i.displayType !== 'note');
                  const totalCost = productLines.reduce((s, i) => s + (parseFloat(i.purchasePrice || 0) * (parseInt(i.order) || 0)), 0);
                  const grossMargin = (activeJob.subtotal || 0) - totalCost;
                  const marginPct = activeJob.subtotal > 0 ? (grossMargin / activeJob.subtotal * 100) : 0;
                  const hasCostData = totalCost > 0;
                  return (
                    <div className="grid grid-cols-3 gap-4">
                      {(hasCostData ? [
                        { label: 'Total Cost', value: totalCost.toFixed(2), color: 'text-gray-700', note: 'From line item costs' },
                        { label: 'Gross Margin', value: grossMargin.toFixed(2), color: grossMargin >= 0 ? 'text-green-600' : 'text-red-500', note: `${marginPct.toFixed(1)}% of revenue` },
                        { label: 'Margin %', value: `${marginPct.toFixed(1)}%`, color: marginPct >= 30 ? 'text-green-600' : marginPct >= 15 ? 'text-yellow-600' : 'text-red-500', note: marginPct >= 30 ? 'Healthy' : marginPct >= 15 ? 'OK' : 'Low' },
                      ] : [
                        { label: 'Est. Materials', value: ((activeJob.subtotal || 0) * 0.55).toFixed(2), color: 'text-gray-800', note: '~55% estimate' },
                        { label: 'Est. Labour', value: ((activeJob.subtotal || 0) * 0.30).toFixed(2), color: 'text-gray-800', note: '~30% estimate' },
                        { label: 'Est. Margin', value: ((activeJob.subtotal || 0) * 0.15).toFixed(2), color: 'text-green-600', note: '~15% estimate' },
                      ]).map(row => (
                        <div key={row.label} className="bg-gray-50 rounded-lg p-4 text-center">
                          <p className="text-xs text-gray-500 mb-1">{row.label}</p>
                          <p className={`text-2xl font-bold ${row.color}`}>{row.value.startsWith('%') ? row.value : `$${row.value}`}</p>
                          <p className="text-xs text-gray-400 mt-1">{row.note}</p>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <div className="border rounded p-4 text-sm">
                  <div className="flex justify-between py-1.5 border-b"><span className="text-gray-600">Subtotal (ex GST):</span><span className="font-medium">${(activeJob.subtotal || 0).toFixed(2)}</span></div>
                  <div className="flex justify-between py-1.5 border-b"><span className="text-gray-600">GST (10%):</span><span className="font-medium">${(activeJob.tax || 0).toFixed(2)}</span></div>
                  <div className="flex justify-between py-1.5 border-b font-semibold"><span>Invoice Total:</span><span>${(activeJob.total || 0).toFixed(2)}</span></div>
                  <div className="flex justify-between py-1.5 border-b text-green-600"><span>Paid:</span><span>${(activeJob.invoicePaid || 0).toFixed(2)}</span></div>
                  <div className="flex justify-between py-1.5 font-bold text-red-600"><span>Balance Due:</span><span>${(activeJob.balanceDue || 0).toFixed(2)}</span></div>
                </div>
                {/* Decoration type breakdown */}
                {(() => {
                  const decMap = {};
                  (activeJob.items || []).filter(i => i.decorationType && i.decorationType !== 'None').forEach(i => {
                    if (!decMap[i.decorationType]) decMap[i.decorationType] = { count: 0, total: 0 };
                    decMap[i.decorationType].count += 1;
                    decMap[i.decorationType].total += parseFloat(i.total || 0);
                  });
                  const entries = Object.entries(decMap);
                  if (!entries.length) return null;
                  return (
                    <div className="border rounded p-4 text-sm">
                      <p className="font-medium text-gray-700 mb-2">Decoration Types</p>
                      {entries.map(([type, v]) => (
                        <div key={type} className="flex justify-between py-1 border-b last:border-0 text-xs">
                          <span className="text-purple-700 font-medium">{type}</span>
                          <span>{v.count} line{v.count > 1 ? 's' : ''}</span>
                          <span className="font-medium">${v.total.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {jobDetailTab === 'activity' && (
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-700">Status History & Activity Log</h4>
                {/* Status timeline */}
                {(() => {
                  const statusChanges = (activeJob.comments || []).filter(c => c.comment?.startsWith('Status changed to') || c.isInternal);
                  if (!statusChanges.length) return <p className="text-gray-400 text-sm text-center py-4">No activity recorded yet.</p>;
                  return (
                    <div className="relative border-l-2 border-gray-200 ml-4 space-y-0">
                      {[...statusChanges].reverse().map((c, i) => (
                        <div key={c.id || i} className="relative pl-6 pb-4">
                          <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white ${c.comment?.startsWith('Status changed') ? 'bg-blue-500' : c.comment?.startsWith('Payment') ? 'bg-green-500' : c.comment?.startsWith('Job locked') || c.comment?.startsWith('Job unlocked') ? 'bg-amber-500' : 'bg-gray-400'}`} />
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-sm font-medium text-gray-800">{c.comment}</p>
                              <p className="text-xs text-gray-400">{c.authorName || c.initials} · {c.date} {c.time}</p>
                            </div>
                            {c.status && <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded ml-2 shrink-0">{c.status}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {/* Add comment */}
                <div className="border-t pt-3">
                  <h4 className="font-semibold text-gray-700 mb-2">Add Comment</h4>
                  <div className="flex gap-2">
                    <textarea
                      value={commentInput}
                      onChange={e => setCommentInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && commentInput.trim()) { addJobComment(activeJob.id, commentInput.trim()); setCommentInput(''); e.preventDefault(); } }}
                      placeholder="Add a note or comment… (Enter to submit, Shift+Enter for new line)"
                      rows={2}
                      className="flex-1 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                    />
                    <div className="flex flex-col gap-1">
                      <button onClick={() => { if (commentInput.trim()) { addJobComment(activeJob.id, commentInput.trim()); setCommentInput(''); } }}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 font-medium">Send</button>
                      <button onClick={() => { if (commentInput.trim()) { addJobComment(activeJob.id, commentInput.trim(), true); setCommentInput(''); } }}
                        className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300 font-medium">Internal</button>
                    </div>
                  </div>
                </div>
                {/* All comments unified */}
                <h4 className="font-semibold text-gray-700 border-t pt-3">All Comments</h4>
                {[...(activeJob.comments || [])].sort((a, b) => b.id - a.id).map((c, i) => (
                  <div key={c.id || i} className={`rounded-lg p-3 text-sm ${c.isInternal ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}`}>
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0">{(c.initials || '?').slice(0, 2)}</div>
                        <span className="font-medium text-gray-700 text-xs">{c.authorName || c.initials}</span>
                        {c.isInternal && <span className="text-[10px] bg-amber-200 text-amber-700 px-1 rounded font-medium">Internal</span>}
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">{c.date} {c.time}</span>
                    </div>
                    <p className="text-gray-600 text-xs ml-6">{c.comment}</p>
                  </div>
                ))}
                {!(activeJob.comments || []).length && <p className="text-gray-400 text-sm text-center py-2">No comments yet.</p>}
              </div>
            )}

            </div>
              </div>{/* /flex-1 */}

              {/* ── FactBox Sidebar ────────────────────────────────────── */}
              {(() => {
                const fbCust = customers.find(c => c.id === activeJob.customerId) || {};
                const custJobs = jobs.filter(j => j.customerId === activeJob.customerId && j.id !== activeJob.id);
                const openCustJobs = custJobs.filter(j => !['PAID','CANCEL'].includes(j.status));
                const paid = (activeJob.total || 0) - (activeJob.balanceDue || 0);
                const balPct = activeJob.total > 0 ? Math.max(0, Math.min(100, (paid / activeJob.total) * 100)) : 0;
                return (
                  <div className="w-72 shrink-0 space-y-3">

                    {/* Customer Card */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                      <div className="flex items-center justify-between mb-2.5">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Customer</h4>
                        {fbCust.id && <button onClick={() => setActiveModule('customers')} className="text-[11px] text-blue-600 hover:text-blue-800">View →</button>}
                      </div>
                      <p className="font-semibold text-gray-800 text-sm leading-tight">{activeJob.customer}</p>
                      {fbCust.contact && <p className="text-xs text-gray-500 mt-0.5">{fbCust.contact}</p>}
                      <div className="mt-2 space-y-1">
                        {fbCust.phone && <div className="flex items-center gap-1.5 text-xs text-gray-600"><Phone className="w-3 h-3 text-gray-400 shrink-0" />{fbCust.phone}</div>}
                        {fbCust.mobile && fbCust.mobile !== fbCust.phone && <div className="flex items-center gap-1.5 text-xs text-gray-600"><Phone className="w-3 h-3 text-gray-400 shrink-0" />{fbCust.mobile}</div>}
                        {fbCust.email && <div className="flex items-center gap-1.5 text-xs text-gray-600"><Mail className="w-3 h-3 text-gray-400 shrink-0" /><span className="truncate">{fbCust.email}</span></div>}
                        {(activeJob.shipTo || fbCust.address) && <div className="flex items-start gap-1.5 text-xs text-gray-600 mt-1"><MapPin className="w-3 h-3 text-gray-400 shrink-0 mt-0.5" /><span className="leading-tight">{activeJob.shipTo || fbCust.address}</span></div>}
                      </div>
                      {fbCust.paymentTerms && <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">Terms: <span className="font-medium text-gray-700">{fbCust.paymentTerms}</span></div>}
                    </div>

                    {/* Financial Summary */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2.5">Financials</h4>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="font-medium text-gray-700">${(activeJob.subtotal || 0).toFixed(2)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">GST</span><span className="font-medium text-gray-700">${(activeJob.tax || 0).toFixed(2)}</span></div>
                        <div className="flex justify-between border-t pt-1 mt-1"><span className="font-semibold text-gray-700">Total (inc. GST)</span><span className="font-bold text-gray-800">${(activeJob.totalInc || activeJob.total || 0).toFixed(2)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Paid</span><span className="font-medium text-green-600">${paid.toFixed(2)}</span></div>
                        {activeJob.balanceDue > 0 && <div className="flex justify-between"><span className="font-semibold text-red-600">Balance Due</span><span className="font-bold text-red-600">${Number(activeJob.balanceDue).toFixed(2)}</span></div>}
                      </div>
                      {activeJob.total > 0 && (
                        <div className="mt-2.5">
                          <div className="w-full bg-gray-100 rounded-full h-1.5">
                            <div className="bg-green-500 h-1.5 rounded-full transition-all" style={{ width: `${balPct}%` }} />
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5 text-right">{balPct.toFixed(0)}% paid</p>
                        </div>
                      )}
                      {activeJob.balanceDue > 0 && (
                        <button onClick={() => setPaymentModal({ show: true, jobId: activeJob.id, maxAmount: activeJob.balanceDue, amount: activeJob.balanceDue.toFixed(2), method: 'Credit Card' })}
                          className="w-full mt-2 text-xs bg-green-600 text-white py-1.5 rounded-lg hover:bg-green-700 font-semibold">
                          Record Payment
                        </button>
                      )}
                    </div>

                    {/* Quick Actions */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2.5">Quick Actions</h4>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          { label: 'Edit Job',  icon: Edit,          action: () => openModal('job', activeJob),                                color: 'bg-blue-50 hover:bg-blue-100 text-blue-700' },
                          { label: 'Clone',     icon: Copy,          action: () => cloneJob(activeJob),                                        color: 'bg-gray-50 hover:bg-gray-100 text-gray-700' },
                          { label: 'Job Sheet', icon: Printer,       action: () => setDocumentPrint({ type: 'jobSheet', job: activeJob }),      color: 'bg-purple-50 hover:bg-purple-100 text-purple-700' },
                          { label: 'Invoice',   icon: FileText,      action: () => setInvoiceJob(activeJob),                                   color: 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700' },
                          { label: 'Delivery',  icon: Package,       action: () => setDocumentPrint({ type: 'deliveryNote', job: activeJob }), color: 'bg-teal-50 hover:bg-teal-100 text-teal-700' },
                          { label: 'Picking',   icon: ClipboardList, action: () => setDocumentPrint({ type: 'pickingSlip', job: activeJob }),  color: 'bg-orange-50 hover:bg-orange-100 text-orange-700' },
                        ].map(a => (
                          <button key={a.label} onClick={a.action} className={`flex flex-col items-center gap-1 p-2 rounded-lg text-[11px] font-medium transition-colors ${a.color}`}>
                            <a.icon className="w-4 h-4" />{a.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Proof Approval */}
                    <ProofPanel
                      key={activeJob.id}
                      job={activeJob}
                      onUpdate={async (status, notes) => {
                        await api.jobs.update(activeJob.id, { ...activeJob, proofStatus: status, proofNotes: notes });
                        queryClient.invalidateQueries({ queryKey: ['jobs'] });
                        setActiveJob(j => ({ ...j, proofStatus: status, proofNotes: notes }));
                      }}
                    />

                    {/* Related */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2.5">Related</h4>
                      <div className="space-y-1.5">
                        <button onClick={() => { setActiveModule('jobs'); setFilterCustomer(activeJob.customerId || ''); }}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-xs font-medium text-gray-700">
                          <span className="flex items-center gap-2"><FileText className="w-3.5 h-3.5 text-gray-400" />Other Jobs</span>
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${openCustJobs.length > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'}`}>{openCustJobs.length}</span>
                        </button>
                        {activeJob.poNumber && (
                          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 text-xs text-gray-600">
                            <span className="flex items-center gap-2"><Package className="w-3.5 h-3.5 text-gray-400" />Customer PO</span>
                            <span className="font-mono font-medium text-gray-700">{activeJob.poNumber}</span>
                          </div>
                        )}
                        {activeJob.assignedTo && (
                          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 text-xs text-gray-600">
                            <span className="flex items-center gap-2"><Users className="w-3.5 h-3.5 text-gray-400" />Assigned To</span>
                            <span className="font-medium text-gray-700">{activeJob.assignedTo}</span>
                          </div>
                        )}
                        {activeJob.status === 'QUOTE' && (
                          <button onClick={() => updateJobStatus(activeJob.id, 'ORDER')}
                            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-xs font-semibold text-white mt-1">
                            Convert to Order →
                          </button>
                        )}
                      </div>
                    </div>

                  </div>
                );
              })()}

            </div>{/* /flex wrapper */}
          </div>
        )}
      </div>
    );
  };

  // Render Inventory Module
  const renderInventory = () => {
    const categories = ['all', ...Array.from(new Set(inventory.map(i => i.category).filter(Boolean))).sort()];

    const filtered = inventory.filter(item => {
      const q = searchTerm.toLowerCase();
      const matchSearch = !q ||
        (item.sku || '').toLowerCase().includes(q) ||
        (item.name || '').toLowerCase().includes(q) ||
        (item.category || '').toLowerCase().includes(q) ||
        (item.location || '').toLowerCase().includes(q) ||
        (item.supplier || '').toLowerCase().includes(q);
      const matchCat = invCatFilter === 'all' || item.category === invCatFilter;
      const stockPct = item.reorderLevel > 0 ? item.stock / item.reorderLevel : 1;
      const matchStatus = invStatusFilter === 'all' ||
        (invStatusFilter === 'ok' && stockPct >= 1.5) ||
        (invStatusFilter === 'low' && stockPct < 1.5 && item.stock > 0) ||
        (invStatusFilter === 'out' && item.stock <= 0);
      return matchSearch && matchCat && matchStatus;
    });

    const totalValue = inventory.reduce((s, i) => s + (i.stock || 0) * (i.unitCost || 0), 0);
    const lowStockCount = inventory.filter(i => i.stock < i.reorderLevel && i.stock > 0).length;
    const outOfStockCount = inventory.filter(i => i.stock <= 0).length;

    const stockBadge = (item) => {
      if (item.stock <= 0) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700"><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"/>OUT</span>;
      if (item.stock < item.reorderLevel) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"/>LOW</span>;
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"/>OK</span>;
    };

    const movTypeStyle = (t) => ({
      'Adjustment':     'bg-blue-100 text-blue-700',
      'Purchase':       'bg-emerald-100 text-emerald-700',
      'Job Allocation': 'bg-orange-100 text-orange-700',
      'Sale':           'bg-purple-100 text-purple-700',
      'Return':         'bg-teal-100 text-teal-700',
    }[t] || 'bg-gray-100 text-gray-600');

    // Bin map: build zone → bins from inventory locations (e.g. "A-03")
    const zones = ['A','B','C','D','E','F'];
    const binsByZone = zones.reduce((acc, z) => {
      acc[z] = inventory
        .filter(i => (i.location || '').startsWith(z + '-'))
        .reduce((m, i) => { m[i.location] = (m[i.location] || []); m[i.location].push(i); return m; }, {});
      return acc;
    }, {});

    return (
      <div className="space-y-4">

        {/* ── KPI Strip ── */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total SKUs', value: inventory.length, sub: `${filtered.length} shown`, icon: Package, color: 'text-indigo-600', bg: 'bg-indigo-50' },
            { label: 'Stock Value', value: `$${totalValue.toLocaleString('en-AU', { maximumFractionDigits: 0 })}`, sub: 'At cost', icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Low Stock', value: lowStockCount, sub: 'Below reorder level', icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50', click: () => setInvStatusFilter('low') },
            { label: 'Out of Stock', value: outOfStockCount, sub: 'Zero on hand', icon: Box, color: 'text-red-600', bg: 'bg-red-50', click: () => setInvStatusFilter('out') },
          ].map(k => (
            <div key={k.label} onClick={k.click} className={`bg-white rounded-lg border border-slate-200 p-4 flex items-start gap-3 ${k.click ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}>
              <div className={`w-9 h-9 rounded-lg ${k.bg} flex items-center justify-center shrink-0`}>
                <k.icon className={`w-4.5 h-4.5 ${k.color}`} style={{ width: 18, height: 18 }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500 leading-none">{k.label}</p>
                <p className={`text-xl font-bold mt-0.5 ${k.color}`}>{k.value}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{k.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Toolbar ── */}
        <div className="bg-white rounded-xl shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="SKU, name, location, supplier…"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              autoComplete="off"
            />
          </div>
          {/* Category filter */}
          <select
            value={invCatFilter}
            onChange={e => setInvCatFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}
          </select>
          {/* Status filter */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
            {[['all','All'],['ok','In Stock'],['low','Low'],['out','Out']].map(([v,l]) => (
              <button key={v} onClick={() => setInvStatusFilter(v)}
                className={`px-3 py-2 transition-colors ${invStatusFilter === v ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-2">
            <button onClick={runAutoReorder} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 text-sm font-medium hover:bg-amber-100 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />Auto-Reorder
            </button>
            <button onClick={() => exportToCSV(inventory, 'inventory')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors">
              <Download className="w-3.5 h-3.5" />Export
            </button>
            <button onClick={() => openModal('inventory')} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 transition-colors">
              <Plus className="w-3.5 h-3.5" />Add Item
            </button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          {[['stock', Package, 'Stock List'], ['movements', Layers, 'Movements'], ['map', LayoutGrid, 'Bin Map']].map(([id, Icon, label]) => (
            <button key={id} onClick={() => setInvTab(id)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${invTab === id ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>

        {/* ── Stock List Tab ── */}
        {invTab === 'stock' && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium">{filtered.length} item{filtered.length !== 1 ? 's' : ''} matching filters</span>
              {(invCatFilter !== 'all' || invStatusFilter !== 'all' || searchTerm) && (
                <button onClick={() => { setInvCatFilter('all'); setInvStatusFilter('all'); setSearchTerm(''); }}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
                  <X className="w-3 h-3" />Clear filters
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">SKU</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Item / Category</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Stock Level</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider" title="On Hand minus Committed (reserved for active jobs)">Available</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Location</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Supplier</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Cost</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Price</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Value</th>
                    <th className="px-4 py-3 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.length === 0 && (
                    <tr><td colSpan={11} className="px-4 py-12 text-center text-gray-400">
                      <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No items match your filters</p>
                    </td></tr>
                  )}
                  {filtered.map(item => {
                    const pct = item.reorderLevel > 0 ? Math.min(100, Math.round((item.stock / item.reorderLevel) * 100)) : 100;
                    const barColor = item.stock <= 0 ? 'bg-red-400' : pct < 100 ? 'bg-amber-400' : 'bg-emerald-400';
                    const totalVal = (item.stock || 0) * (item.unitCost || 0);
                    return (
                      <tr key={item.sku} className="hover:bg-indigo-50/30 transition-colors group">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{item.sku}</span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800 text-sm leading-tight">{item.name}</p>
                          {item.category && <span className="text-[11px] text-gray-400 mt-0.5 block">{item.category}</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 min-w-32">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className={`text-sm font-bold tabular-nums w-8 text-right ${item.stock <= 0 ? 'text-red-600' : pct < 100 ? 'text-amber-600' : 'text-emerald-600'}`}>{item.stock}</span>
                            <span className="text-[11px] text-gray-400">/ {item.reorderLevel}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {(() => {
                            const avail = Math.max(0, (item.stock || 0) - (item.committed_qty || 0));
                            const committed = item.committed_qty || 0;
                            return (
                              <div title={committed > 0 ? `${committed} committed to active jobs` : 'No committed stock'}>
                                <span className={`text-sm font-bold tabular-nums ${avail <= 0 ? 'text-red-600' : avail < (item.reorderLevel || 0) ? 'text-amber-600' : 'text-emerald-700'}`}>{avail}</span>
                                {committed > 0 && <span className="text-[10px] text-gray-400 block">−{committed} committed</span>}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3">
                          {item.location
                            ? <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-semibold">{item.location}</span>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{item.supplier || <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3 text-right text-sm text-gray-600 tabular-nums">${(item.unitCost || 0).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-gray-800 tabular-nums">${(item.unitPrice || 0).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-sm text-gray-700 tabular-nums font-medium">${totalVal.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-4 py-3 text-center">{stockBadge(item)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => setStockAdjustModal({ show: true, sku: item.sku, name: item.name, currentStock: item.stock, adjustment: '', reason: '' })}
                              className="p-1.5 rounded-lg hover:bg-amber-100 text-amber-600 transition-colors" title="Adjust Stock">
                              <Box className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => openModal('inventory', item)}
                              className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-600 transition-colors" title="Edit">
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteInventoryItem(item.sku)}
                              className="p-1.5 rounded-lg hover:bg-red-100 text-red-500 transition-colors" title="Delete">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Movements Tab ── */}
        {invTab === 'movements' && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800 text-sm">Stock Movement History</h3>
              <span className="text-xs text-gray-400">{stockMovements.length} records</span>
            </div>
            {stockMovements.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <Layers className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No stock movements recorded yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Date / Time</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">SKU</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Item</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Qty</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Reference</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {stockMovements.slice(0, 50).map((mv, idx) => {
                      const itemName = inventory.find(i => i.sku === mv.sku)?.name || '—';
                      const isIn = mv.quantity > 0;
                      return (
                        <tr key={mv.id || idx} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{mv.date}</td>
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{mv.sku}</span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 max-w-[200px] truncate">{itemName}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${movTypeStyle(mv.type)}`}>{mv.type}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-bold tabular-nums text-sm ${isIn ? 'text-emerald-600' : 'text-red-500'}`}>
                              {isIn ? '+' : ''}{mv.quantity}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 font-mono">{mv.reference || '—'}</td>
                          <td className="px-4 py-3 text-xs text-gray-400 max-w-[200px] truncate">{mv.notes || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Bin Map Tab ── */}
        {invTab === 'map' && (
          <div className="grid grid-cols-3 gap-4">
            {zones.map(zone => {
              const bins = binsByZone[zone];
              const binKeys = Object.keys(bins).sort();
              const itemsInZone = inventory.filter(i => (i.location || '').startsWith(zone + '-'));
              const lowInZone = itemsInZone.filter(i => i.stock < i.reorderLevel).length;
              return (
                <div key={zone} className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className={`px-4 py-3 flex items-center justify-between border-b ${selectedWarehouseZone === zone ? 'bg-blue-700' : 'bg-gray-50'}`}>
                    <button onClick={() => setSelectedWarehouseZone(zone)} className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-lg font-black text-sm flex items-center justify-center ${selectedWarehouseZone === zone ? 'bg-white text-indigo-700' : 'bg-indigo-100 text-indigo-700'}`}>{zone}</div>
                      <span className={`font-semibold text-sm ${selectedWarehouseZone === zone ? 'text-white' : 'text-gray-700'}`}>Zone {zone}</span>
                    </button>
                    <div className="flex items-center gap-2">
                      {lowInZone > 0 && <span className="text-[10px] font-bold bg-amber-400 text-white px-1.5 py-0.5 rounded-full">{lowInZone} low</span>}
                      <span className={`text-[11px] ${selectedWarehouseZone === zone ? 'text-indigo-200' : 'text-gray-400'}`}>{itemsInZone.length} SKUs</span>
                    </div>
                  </div>
                  <div className="p-3">
                    {binKeys.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-4">No bins assigned</p>
                    ) : (
                      <div className="grid grid-cols-3 gap-1.5">
                        {binKeys.map(bin => {
                          const items = bins[bin];
                          const hasLow = items.some(i => i.stock < i.reorderLevel);
                          const hasOut = items.some(i => i.stock <= 0);
                          return (
                            <button key={bin} onClick={() => setSelectedBin(selectedBin === bin ? null : bin)}
                              title={items.map(i => `${i.sku}: ${i.stock}`).join(', ')}
                              className={`rounded-lg p-2 text-center text-[11px] font-bold border-2 transition-all ${
                                selectedBin === bin ? 'border-indigo-500 bg-indigo-50 text-indigo-700' :
                                hasOut ? 'border-red-200 bg-red-50 text-red-600' :
                                hasLow ? 'border-amber-200 bg-amber-50 text-amber-700' :
                                'border-emerald-200 bg-emerald-50 text-emerald-700'
                              }`}>
                              <span className="block font-mono">{bin}</span>
                              <span className="text-[10px] font-normal opacity-70">{items.length} SKU{items.length !== 1 ? 's' : ''}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {/* Expanded bin detail */}
                    {selectedBin && bins[selectedBin] && (
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        {bins[selectedBin].map(i => (
                          <div key={i.sku} className="flex items-center justify-between py-1 text-xs">
                            <span className="font-mono font-bold text-indigo-700">{i.sku}</span>
                            <span className="text-gray-600 truncate mx-2 flex-1">{i.name}</span>
                            {stockBadge(i)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    );
  };

  // Render Customers Module
  const renderCustomers = () => {
    const filteredCustomers = customers.filter(cust =>
      (cust.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (cust.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (cust.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (cust.contact || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const custJobs = (c) => jobs.filter(j => j.customerId === c.id);
    const custOutstanding = (c) => custJobs(c).reduce((s, j) => s + parseFloat(j.balanceDue || 0), 0);
    const custRevenue = (c) => custJobs(c).reduce((s, j) => s + parseFloat(j.total || 0), 0);
    const creditUtil = (c) => c.creditLimit > 0 ? Math.min(100, (custOutstanding(c) / c.creditLimit) * 100) : 0;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{filteredCustomers.length} of {customers.length} accounts</p>
          <div className="flex gap-2">
            <button onClick={() => exportToCSV(customers, 'customers')} className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 flex items-center text-sm font-medium"><Download className="w-4 h-4 mr-2" />Export</button>
            <button onClick={() => openModal('customer')} className="bg-blue-700 text-white px-4 py-2 rounded-lg hover:bg-blue-800 flex items-center text-sm"><Plus className="w-4 h-4 mr-2" />New Customer</button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total Customers', value: customers.length, color: 'text-blue-600', sub: `${customers.filter(c=>c.status==='Active'||!c.status).length} active` },
            { label: 'Total Revenue', value: `$${customers.reduce((s,c)=>s+custRevenue(c),0).toLocaleString('en-AU',{maximumFractionDigits:0})}`, color: 'text-green-600', sub: 'All time' },
            { label: 'Outstanding AR', value: `$${customers.reduce((s,c)=>s+custOutstanding(c),0).toLocaleString('en-AU',{maximumFractionDigits:0})}`, color: 'text-red-600', sub: 'Unpaid balances' },
            { label: 'Over Credit Limit', value: customers.filter(c=>c.creditLimit>0&&custOutstanding(c)>c.creditLimit).length, color: 'text-orange-600', sub: 'Accounts exceeded' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-lg border border-slate-200 p-4">
              <p className="text-xs text-gray-500">{k.label}</p>
              <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</p>
              <p className="text-xs text-gray-400 mt-1">{k.sub}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="bg-white rounded-xl shadow-sm p-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
            <input type="text" placeholder="Search by name, ID, email, contact…"
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)} autoComplete="off" />
          </div>
        </div>

        {/* Table + Detail */}
        <div className="grid grid-cols-5 gap-4">
          {/* Customer Table */}
          <div className="col-span-2 bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Customer</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Balance</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCustomers.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">No customers found</td></tr>
                )}
                {filteredCustomers.map(c => {
                  const outstanding = custOutstanding(c);
                  const util = creditUtil(c);
                  const overLimit = c.creditLimit > 0 && outstanding > c.creditLimit;
                  return (
                    <tr key={c.id} onClick={() => { setSelectedCustomer(c); setCustDetailTab('overview'); }}
                      className={`cursor-pointer hover:bg-blue-50 transition-colors ${selectedCustomer?.id === c.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 text-white font-bold text-xs flex items-center justify-center flex-shrink-0">
                            {(c.name||'?').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-800 truncate">{c.name}</p>
                            <p className="text-xs text-gray-400 font-mono">{c.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className={`font-semibold text-sm ${outstanding > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                          {outstanding > 0 ? `$${outstanding.toLocaleString('en-AU',{maximumFractionDigits:0})}` : '—'}
                        </span>
                        {overLimit && <span className="ml-1 text-[10px] bg-red-100 text-red-600 px-1 rounded font-bold">OVER</span>}
                      </td>
                      <td className="px-3 py-3">
                        {c.creditLimit > 0 ? (
                          <div>
                            <div className="w-16 bg-gray-200 rounded-full h-1.5 ml-auto">
                              <div className={`h-1.5 rounded-full ${util>100?'bg-red-500':util>80?'bg-orange-400':'bg-green-500'}`} style={{width:`${Math.min(100,util)}%`}}/>
                            </div>
                            <p className="text-[10px] text-gray-400 text-right mt-0.5">{util.toFixed(0)}%</p>
                          </div>
                        ) : <span className="text-xs text-gray-300 block text-right">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Customer Detail Panel */}
          <div className="col-span-3">
            {!selectedCustomer ? (
              <div className="bg-white rounded-lg shadow h-full flex flex-col items-center justify-center py-16 text-gray-400">
                <Users className="w-12 h-12 mb-3 opacity-30" />
                <p className="font-medium">Select a customer to view details</p>
              </div>
            ) : (() => {
              const c = selectedCustomer;
              const cJobs = custJobs(c);
              const outstanding = custOutstanding(c);
              const revenue = custRevenue(c);
              const util = creditUtil(c);
              const overLimit = c.creditLimit > 0 && outstanding > c.creditLimit;
              const now = new Date();

              // Aged debtors for this customer
              const aging = { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 };
              cJobs.filter(j => parseFloat(j.balanceDue || 0) > 0).forEach(j => {
                const bal = parseFloat(j.balanceDue || 0);
                try {
                  const parts = (j.due || '').split('/');
                  const due = parts.length === 3 ? new Date(`${parts[2]}-${parts[1]}-${parts[0]}`) : null;
                  if (!due || due >= now) { aging.current += bal; return; }
                  const days = Math.floor((now - due) / 86400000);
                  if (days <= 30) aging.d30 += bal;
                  else if (days <= 60) aging.d60 += bal;
                  else if (days <= 90) aging.d90 += bal;
                  else aging.d90p += bal;
                } catch { aging.current += bal; }
              });

              return (
                <div className="bg-white rounded-lg shadow">
                  {/* Customer header */}
                  <div className="p-5 border-b flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-700 text-white font-black text-2xl flex items-center justify-center shadow-md">
                        {(c.name||'?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">{c.name}</h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{c.id}</span>
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${c.status === 'Active' || !c.status ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>{c.status || 'Active'}</span>
                          <span className="text-xs text-gray-500">{c.accountType || 'Account'}</span>
                          {overLimit && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold">⚠ Over Credit Limit</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => openModal('customer', c)} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 flex items-center gap-1 text-sm font-medium">
                        <Edit className="w-3.5 h-3.5" />Edit
                      </button>
                      <button onClick={() => { setSelectedCustomer(null); deleteCustomer(c.id); }} className="px-3 py-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100 flex items-center gap-1 text-sm">
                        <Trash2 className="w-3.5 h-3.5" />Delete
                      </button>
                      <button onClick={() => setSelectedCustomer(null)} className="p-1.5 hover:bg-gray-100 rounded">
                        <X className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>
                  </div>

                  {/* Account KPIs */}
                  <div className="grid grid-cols-4 gap-0 border-b">
                    {[
                      { label: 'Total Jobs', value: cJobs.length, color: 'text-blue-600' },
                      { label: 'Lifetime Revenue', value: `$${revenue.toLocaleString('en-AU',{maximumFractionDigits:0})}`, color: 'text-green-600' },
                      { label: 'Outstanding', value: `$${outstanding.toLocaleString('en-AU',{maximumFractionDigits:0})}`, color: outstanding > 0 ? 'text-red-600' : 'text-gray-400' },
                      { label: 'Credit Used', value: c.creditLimit > 0 ? `${util.toFixed(0)}%` : 'Unlimited', color: util > 80 ? 'text-orange-600' : 'text-gray-600' },
                    ].map((k, i) => (
                      <div key={k.label} className={`p-4 text-center ${i < 3 ? 'border-r' : ''}`}>
                        <p className="text-xs text-gray-500">{k.label}</p>
                        <p className={`text-xl font-bold mt-0.5 ${k.color}`}>{k.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Credit limit bar */}
                  {c.creditLimit > 0 && (
                    <div className="px-5 py-2 border-b bg-gray-50 flex items-center gap-3">
                      <span className="text-xs text-gray-500 shrink-0">Credit: ${outstanding.toLocaleString('en-AU',{maximumFractionDigits:0})} / ${c.creditLimit.toLocaleString()}</span>
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div className={`h-2 rounded-full ${overLimit?'bg-red-500':util>80?'bg-orange-400':'bg-green-500'}`} style={{width:`${Math.min(100,util)}%`}}/>
                      </div>
                      <span className={`text-xs font-semibold shrink-0 ${overLimit?'text-red-600':util>80?'text-orange-600':'text-gray-500'}`}>{util.toFixed(0)}%</span>
                    </div>
                  )}

                  {/* Tabs */}
                  <div className="flex border-b px-4 gap-1 bg-gray-50">
                    {['overview','jobs','aging','statement'].map(tab => (
                      <button key={tab} onClick={() => setCustDetailTab(tab)}
                        className={`px-4 py-2.5 text-sm font-medium border-b-2 capitalize transition-colors ${custDetailTab===tab?'border-blue-600 text-blue-600':'border-transparent text-gray-500 hover:text-gray-700'}`}>
                        {tab === 'aging' ? 'Aged AR' : tab}
                      </button>
                    ))}
                  </div>

                  <div className="p-5">
                    {/* Overview Tab */}
                    {custDetailTab === 'overview' && (
                      <div className="grid grid-cols-2 gap-6 text-sm">
                        <div className="space-y-3">
                          <h4 className="font-semibold text-gray-700 border-b pb-1">Contact Details</h4>
                          {[['Contact',c.contact],['Email',c.email],['Phone',c.phone||c.mobile],['Mobile',c.mobile&&c.phone?c.mobile:null],['Address',c.address]].filter(([,v])=>v).map(([label,val])=>(
                            <div key={label} className="flex gap-3"><span className="text-gray-500 w-16 shrink-0">{label}:</span><span className="text-gray-800 font-medium">{val}</span></div>
                          ))}
                          {c.abn && <div className="flex gap-3"><span className="text-gray-500 w-16 shrink-0">ABN:</span><span className="font-mono font-medium">{c.abn}</span></div>}
                        </div>
                        <div className="space-y-3">
                          <h4 className="font-semibold text-gray-700 border-b pb-1">Account Settings</h4>
                          {[['Type',c.accountType||'Account'],['Terms',c.paymentTerms||'Net 30'],['Credit Limit',c.creditLimit?`$${Number(c.creditLimit).toLocaleString()}`:'Unlimited'],['Account Mgr',c.accountManager]].filter(([,v])=>v).map(([label,val])=>(
                            <div key={label} className="flex gap-3"><span className="text-gray-500 w-24 shrink-0">{label}:</span><span className="text-gray-800 font-medium">{val}</span></div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Jobs Tab */}
                    {custDetailTab === 'jobs' && (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm text-gray-500">{cJobs.length} jobs · ${revenue.toLocaleString('en-AU',{maximumFractionDigits:0})} total</p>
                          <button onClick={() => { setActiveModule('jobs'); setFilterCustomer(c.id); }} className="text-xs text-blue-600 hover:underline">View in Jobs →</button>
                        </div>
                        <div className="max-h-72 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50 sticky top-0">
                              <tr><th className="text-left px-3 py-2">Job #</th><th className="text-left px-3 py-2">Status</th><th className="text-left px-3 py-2">Date</th><th className="text-right px-3 py-2">Total</th><th className="text-right px-3 py-2">Balance</th></tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {cJobs.sort((a,b)=>b.id.localeCompare(a.id)).map(j => (
                                <tr key={j.id} className="hover:bg-blue-50 cursor-pointer" onClick={() => { pinJob(j); setActiveModule('jobs'); }}>
                                  <td className="px-3 py-2 font-mono font-bold text-blue-600">#{j.id}</td>
                                  <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 font-medium">{j.status}</span></td>
                                  <td className="px-3 py-2 text-gray-500">{j.dateIn}</td>
                                  <td className="px-3 py-2 text-right font-medium">${(j.total||0).toFixed(2)}</td>
                                  <td className={`px-3 py-2 text-right font-semibold ${j.balanceDue > 0 ? 'text-red-600' : 'text-gray-400'}`}>${(j.balanceDue||0).toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Aged AR Tab */}
                    {custDetailTab === 'aging' && (
                      <div>
                        <p className="text-sm text-gray-500 mb-4">Accounts receivable aging — overdue by due date</p>
                        <div className="grid grid-cols-5 gap-3 mb-5">
                          {[['Current',aging.current,'green'],['1–30d',aging.d30,'yellow'],['31–60d',aging.d60,'orange'],['61–90d',aging.d90,'red'],['90d+',aging.d90p,'red']].map(([label,amt,col])=>(
                            <div key={label} className={`rounded-lg p-3 text-center border ${col==='green'?'bg-green-50 border-green-200':col==='yellow'?'bg-yellow-50 border-yellow-200':col==='orange'?'bg-orange-50 border-orange-200':'bg-red-50 border-red-200'}`}>
                              <p className="text-xs font-semibold text-gray-500 mb-1">{label}</p>
                              <p className={`text-lg font-bold ${col==='green'?'text-green-700':col==='yellow'?'text-yellow-700':col==='orange'?'text-orange-600':'text-red-600'}`}>${amt.toFixed(0)}</p>
                            </div>
                          ))}
                        </div>
                        <div className="text-sm">
                          <div className="flex justify-between font-bold py-2 border-t-2"><span>Total Outstanding:</span><span className="text-red-600">${outstanding.toFixed(2)}</span></div>
                        </div>
                      </div>
                    )}

                    {/* Statement Tab */}
                    {custDetailTab === 'statement' && (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm text-gray-500">Account statement — all transactions</p>
                          <div className="flex items-center gap-2">
                            <a
                              href={`/api/customers/${c.id}/statement.pdf`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-xs bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 flex items-center gap-1"
                            ><Download className="w-3 h-3"/>Download PDF</a>
                            <button onClick={() => window.print()} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 flex items-center gap-1"><Printer className="w-3 h-3"/>Print</button>
                          </div>
                        </div>
                        <table className="w-full text-xs border-collapse">
                          <thead className="bg-gray-50"><tr>
                            <th className="text-left px-3 py-2 border-b">Date</th>
                            <th className="text-left px-3 py-2 border-b">Job #</th>
                            <th className="text-left px-3 py-2 border-b">Description</th>
                            <th className="text-right px-3 py-2 border-b">Charges</th>
                            <th className="text-right px-3 py-2 border-b">Payments</th>
                            <th className="text-right px-3 py-2 border-b">Balance</th>
                          </tr></thead>
                          <tbody>
                            {(() => {
                              let running = 0;
                              return cJobs.sort((a,b)=>a.dateIn?.localeCompare(b.dateIn||'')||0).map(j => {
                                running += parseFloat(j.total||0);
                                const paid = parseFloat(j.deposit||j.invoicePaid||0);
                                running -= paid;
                                return (
                                  <tr key={j.id} className="border-b hover:bg-gray-50">
                                    <td className="px-3 py-2 text-gray-500">{j.dateIn}</td>
                                    <td className="px-3 py-2 font-mono font-bold text-blue-600">#{j.id}</td>
                                    <td className="px-3 py-2">{j.status} {j.custRef?`· Ref: ${j.custRef}`:''}</td>
                                    <td className="px-3 py-2 text-right">${(j.total||0).toFixed(2)}</td>
                                    <td className="px-3 py-2 text-right text-green-600">{paid > 0 ? `-$${paid.toFixed(2)}` : '—'}</td>
                                    <td className={`px-3 py-2 text-right font-semibold ${running>0?'text-red-600':'text-green-600'}`}>${running.toFixed(2)}</td>
                                  </tr>
                                );
                              });
                            })()}
                          </tbody>
                          <tfoot>
                            <tr className="bg-gray-100 font-bold border-t-2"><td colSpan={3} className="px-3 py-2">Total Outstanding</td><td className="px-3 py-2 text-right">${revenue.toFixed(2)}</td><td className="px-3 py-2 text-right text-green-600">-${(revenue-outstanding).toFixed(2)}</td><td className={`px-3 py-2 text-right ${outstanding>0?'text-red-600':'text-green-600'}`}>${outstanding.toFixed(2)}</td></tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      {/* Create Job List modal */}
      {jobListModal.open && (
        <DraggableModal onClose={() => setJobListModal(m => ({ ...m, open: false }))} cardClass="w-full max-w-md">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-indigo-500" />
              <h3 className="text-sm font-semibold text-gray-800">Create Job List</h3>
            </div>
            <button onClick={() => setJobListModal(m => ({ ...m, open: false }))} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
          </div>
          <div className="px-6 py-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">List Name</label>
              <input value={jobListModal.name} onChange={e => setJobListModal(m => ({ ...m, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Arcare Active Jobs" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Customer</label>
              <select value={jobListModal.customerId} onChange={e => setJobListModal(m => ({ ...m, customerId: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">All Customers</option>
                {uniqueCustomers.map(c => <option key={c.id} value={c.id}>{c.id} — {c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Status</label>
                <select value={jobListModal.status} onChange={e => setJobListModal(m => ({ ...m, status: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">All Statuses</option>
                  {['QUOTE','New','ORDER','In Progress','PROOF','PRINT','Pick/Pack','FINISH','INVOICE','PAID','CANCEL'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Priority</label>
                <select value={jobListModal.priority} onChange={e => setJobListModal(m => ({ ...m, priority: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">All Priorities</option>
                  {['Low','Normal','High','Urgent'].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <p className="text-xs text-gray-400">Leave fields empty to include all.</p>
          </div>
          <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
            <button onClick={() => setJobListModal(m => ({ ...m, open: false }))} className="px-4 py-2 text-xs text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
            <button
              onClick={() => {
                const hasFilter = jobListModal.customerId || jobListModal.status || jobListModal.priority;
                const cust = uniqueCustomers.find(c => c.id === jobListModal.customerId);
                const label = jobListModal.name || [cust?.name, jobListModal.status, jobListModal.priority].filter(Boolean).join(' · ') || 'All Jobs';
                setActiveJobList(hasFilter || jobListModal.name ? { name: label, customerId: jobListModal.customerId, status: jobListModal.status, priority: jobListModal.priority } : null);
                setJobListModal(m => ({ ...m, open: false }));
              }}
              className="px-5 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 flex items-center gap-1.5">
              <ClipboardList className="w-3.5 h-3.5" />Run List
            </button>
          </div>
        </DraggableModal>
      )}
      </div>
    );
  };

  const renderSuppliers = () => {
    const filtered = suppliers.filter(s => {
      const q = searchTerm.toLowerCase();
      return !q || (s.name||'').toLowerCase().includes(q) || (s.code||'').toLowerCase().includes(q) || (s.contact||'').toLowerCase().includes(q) || (s.email||'').toLowerCase().includes(q);
    });
    const suppPOs = (s) => purchaseOrders.filter(p => p.supplierCode === s.code || p.supplier === s.name);
    const suppItems = (s) => inventory.filter(i => (i.supplier||'').toLowerCase() === (s.name||'').toLowerCase());
    const suppSpend = (s) => suppPOs(s).reduce((t,p) => t + (p.total||0), 0);
    const suppActive = suppliers.filter(s => s.status === 'Active').length;
    const totalSpend = purchaseOrders.reduce((t,p) => t + (p.total||0), 0);
    const sel = selectedSupplier;
    return (
      <div className="space-y-4">
        {/* KPI Strip */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total Suppliers', value: suppliers.length, sub: `${suppActive} active`, icon: Truck, color: 'text-indigo-600', bg: 'bg-indigo-50' },
            { label: 'Active', value: suppActive, sub: `${suppliers.length - suppActive} inactive`, icon: CheckSquare, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Total PO Spend', value: `$${totalSpend.toLocaleString('en-AU',{maximumFractionDigits:0})}`, sub: 'All purchase orders', icon: DollarSign, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Linked SKUs', value: inventory.filter(i=>i.supplier).length, sub: 'Items with supplier', icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-lg border border-slate-200 p-4 flex items-start gap-3">
              <div className={`w-9 h-9 rounded-lg ${k.bg} flex items-center justify-center shrink-0`}>
                <k.icon style={{width:18,height:18}} className={k.color} />
              </div>
              <div>
                <p className="text-xs text-gray-500">{k.label}</p>
                <p className={`text-xl font-bold mt-0.5 ${k.color}`}>{k.value}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{k.sub}</p>
              </div>
            </div>
          ))}
        </div>
        {/* Toolbar */}
        <div className="bg-white rounded-xl shadow-sm px-4 py-3 flex items-center gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
            <input type="text" placeholder="Search by name, code, contact…"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)} autoComplete="off" />
          </div>
          <div className="ml-auto flex gap-2">
            <button onClick={() => exportToCSV(suppliers,'suppliers')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50"><Download className="w-3.5 h-3.5"/>Export</button>
            <button onClick={() => openModal('supplier')} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-700 text-white text-sm font-medium hover:bg-blue-800"><Plus className="w-3.5 h-3.5"/>Add Supplier</button>
          </div>
        </div>
        {/* Split layout */}
        <div className="grid grid-cols-5 gap-4">
          {/* List */}
          <div className="col-span-2 bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100">
              <span className="text-xs text-gray-500 font-medium">{filtered.length} supplier{filtered.length!==1?'s':''}</span>
            </div>
            <div className="divide-y divide-gray-50 max-h-[580px] overflow-y-auto">
              {filtered.length===0 && <div className="py-12 text-center text-gray-400"><Truck className="w-8 h-8 mx-auto mb-2 opacity-30"/><p className="text-sm">No suppliers found</p></div>}
              {filtered.map(sup => {
                const spend = suppSpend(sup);
                const poCount = suppPOs(sup).length;
                const isSel = sel?.code === sup.code;
                return (
                  <div key={sup.code} onClick={() => { setSelectedSupplier(sup); setSuppTab('details'); }}
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-blue-50 transition-colors border-l-4 ${isSel ? 'bg-blue-50 border-l-indigo-500' : 'border-l-transparent'}`}>
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 text-white font-black text-sm flex items-center justify-center shrink-0">
                      {(sup.name||'?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-800 text-sm truncate">{sup.name}</p>
                        <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${sup.status==='Active'?'bg-emerald-100 text-emerald-700':'bg-gray-100 text-gray-500'}`}>{sup.status}</span>
                      </div>
                      <p className="text-[11px] text-gray-400 font-mono mt-0.5">{sup.code}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[11px] text-gray-500">{poCount} PO{poCount!==1?'s':''}</span>
                        {spend>0 && <span className="text-[11px] font-semibold text-orange-600">${spend.toLocaleString('en-AU',{maximumFractionDigits:0})}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Detail */}
          <div className="col-span-3">
            {!sel ? (
              <div className="bg-white rounded-xl shadow-sm h-full flex flex-col items-center justify-center py-20 text-gray-400">
                <Truck className="w-12 h-12 mb-3 opacity-20"/>
                <p className="font-medium">Select a supplier to view details</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 text-white font-black text-lg flex items-center justify-center shrink-0">
                    {(sel.name||'?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-bold text-gray-900 leading-tight">{sel.name}</h2>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{sel.code} · {sel.currency||'AUD'}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => { setActiveModule('purchase-orders'); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 text-xs font-semibold hover:bg-orange-100 border border-orange-200">
                      <Plus className="w-3 h-3"/>New PO
                    </button>
                    <button onClick={() => openModal('supplier',sel)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Edit className="w-4 h-4 text-blue-600"/></button>
                    <button onClick={() => deleteSupplier(sel.code)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Trash2 className="w-4 h-4 text-red-500"/></button>
                  </div>
                </div>
                <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
                  {[
                    {label:'Total Spend', value:`$${suppSpend(sel).toLocaleString('en-AU',{maximumFractionDigits:0})}`},
                    {label:'Purchase Orders', value:suppPOs(sel).length},
                    {label:'Stocked Items', value:suppItems(sel).length},
                  ].map(k => (
                    <div key={k.label} className="px-5 py-3 text-center">
                      <p className="text-lg font-bold text-gray-800">{k.value}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{k.label}</p>
                    </div>
                  ))}
                </div>
                <div className="flex border-b border-gray-100 px-4">
                  {[['details','Details'],['pos','Purchase Orders'],['items','Stock Items'],['pricelist','Price List']].map(([id,label]) => (
                    <button key={id} onClick={() => setSuppTab(id)}
                      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${suppTab===id?'border-indigo-600 text-indigo-700':'border-transparent text-gray-500 hover:text-gray-700'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="p-5">
                  {suppTab==='details' && (
                    <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                      {[['Contact',sel.contact||'—'],['Email',sel.email||'—'],['Phone',sel.phone||'—'],['Payment Terms',sel.paymentTerms||'—'],['Currency',sel.currency||'AUD'],['Status',sel.status||'Active']].map(([label,val]) => (
                        <div key={label}>
                          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                          <p className="text-gray-800 font-medium">{val}</p>
                        </div>
                      ))}
                      {sel.address && <div className="col-span-2"><p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Address</p><p className="text-gray-800 whitespace-pre-line">{sel.address}</p></div>}
                    </div>
                  )}
                  {suppTab==='pos' && (
                    <div className="space-y-2">
                      {suppPOs(sel).length===0 ? <p className="text-sm text-gray-400 text-center py-8">No purchase orders for this supplier</p>
                      : suppPOs(sel).map(po => {
                        const cls = {Draft:'bg-gray-100 text-gray-600',Sent:'bg-blue-100 text-blue-700',Partial:'bg-amber-100 text-amber-700',Received:'bg-emerald-100 text-emerald-700',Cancelled:'bg-red-100 text-red-600'}[po.status]||'bg-gray-100 text-gray-600';
                        return (
                          <div key={po.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-indigo-700">{po.id}</span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cls}`}>{po.status}</span>
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">{po.date} · {(po.items||[]).length} line{(po.items||[]).length!==1?'s':''}</p>
                            </div>
                            <span className="font-semibold text-sm text-gray-800">${(po.total||0).toLocaleString('en-AU',{maximumFractionDigits:0})}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {suppTab==='items' && (
                    <div className="space-y-2">
                      {suppItems(sel).length===0 ? <p className="text-sm text-gray-400 text-center py-8">No inventory items linked to this supplier</p>
                      : suppItems(sel).map(item => (
                        <div key={item.sku} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100">
                          <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded w-24 shrink-0">{item.sku}</span>
                          <span className="flex-1 text-sm text-gray-700 truncate">{item.name}</span>
                          <span className={`text-xs font-semibold ${item.stock<=0?'text-red-600':item.stock<item.reorderLevel?'text-amber-600':'text-emerald-600'}`}>{item.stock} on hand</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {suppTab==='pricelist' && <SupplierPriceListPanel supplierId={sel.code} />}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderPurchaseOrders = () => {
    const statusMeta = {
      Draft:     { cls:'bg-gray-100 text-gray-700',     dot:'bg-gray-400'     },
      Sent:      { cls:'bg-blue-100 text-blue-700',     dot:'bg-blue-500'     },
      Partial:   { cls:'bg-amber-100 text-amber-700',   dot:'bg-amber-400'    },
      Received:  { cls:'bg-emerald-100 text-emerald-700', dot:'bg-emerald-500' },
      Cancelled: { cls:'bg-red-100 text-red-600',       dot:'bg-red-400'      },
    };
    const filtered = purchaseOrders.filter(po => {
      const q = searchTerm.toLowerCase();
      const matchQ = !q || (po.id||'').toLowerCase().includes(q) || (po.supplier||'').toLowerCase().includes(q);
      const matchS = poStatusFilter==='all' || po.status===poStatusFilter;
      return matchQ && matchS;
    });
    const totalValue = purchaseOrders.reduce((t,p)=>t+(p.total||0),0);
    const draftCount = purchaseOrders.filter(p=>p.status==='Draft').length;
    const pendingCount = purchaseOrders.filter(p=>['Sent','Partial'].includes(p.status)).length;
    const today = new Date();
    const isOverdue = (po) => {
      if (['Received','Cancelled'].includes(po.status)) return false;
      if (!po.expectedDate) return false;
      const parts = (po.expectedDate||'').split('/');
      const d = parts.length===3 ? new Date(`${parts[2]}-${parts[1]}-${parts[0]}`) : new Date(po.expectedDate);
      return d < today;
    };

    return (
      <div className="space-y-4">
        {/* KPI Strip */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label:'Total POs', value:purchaseOrders.length, sub:`${filtered.length} matching`, icon:ClipboardList, color:'text-indigo-600', bg:'bg-indigo-50', onClick:()=>setPoStatusFilter('all') },
            { label:'Draft / Pending Send', value:draftCount, sub:'Awaiting dispatch', icon:FileText, color:'text-gray-600', bg:'bg-gray-100', onClick:()=>setPoStatusFilter('Draft') },
            { label:'Awaiting Receipt', value:pendingCount, sub:'Sent or partially received', icon:Truck, color:'text-amber-600', bg:'bg-amber-50', onClick:()=>setPoStatusFilter('Sent') },
            { label:'Total Value', value:`$${totalValue.toLocaleString('en-AU',{maximumFractionDigits:0})}`, sub:'All purchase orders', icon:DollarSign, color:'text-emerald-600', bg:'bg-emerald-50' },
          ].map(k => (
            <div key={k.label} onClick={k.onClick} className={`bg-white rounded-lg border border-slate-200 p-4 flex items-start gap-3 ${k.onClick?'cursor-pointer hover:shadow-md transition-shadow':''}`}>
              <div className={`w-9 h-9 rounded-lg ${k.bg} flex items-center justify-center shrink-0`}>
                <k.icon style={{width:18,height:18}} className={k.color}/>
              </div>
              <div>
                <p className="text-xs text-gray-500">{k.label}</p>
                <p className={`text-xl font-bold mt-0.5 ${k.color}`}>{k.value}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{k.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Status Pipeline */}
        <div className="bg-white rounded-xl shadow-sm px-4 py-3 flex items-center gap-2 overflow-x-auto">
          {['all','Draft','Sent','Partial','Received','Cancelled'].map((s,i,arr) => (
            <React.Fragment key={s}>
              <button onClick={()=>setPoStatusFilter(s)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  poStatusFilter===s
                    ? 'bg-blue-700 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {s!=='all' && <span className={`w-1.5 h-1.5 rounded-full ${statusMeta[s]?.dot||'bg-gray-400'}`}/>}
                {s==='all' ? `All (${purchaseOrders.length})` : `${s} (${purchaseOrders.filter(p=>p.status===s).length})`}
              </button>
              {i < arr.length-1 && s!=='all' && i < arr.length-2 && <span className="text-gray-200 text-xs">›</span>}
            </React.Fragment>
          ))}
          <div className="ml-auto flex gap-2 shrink-0">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2 text-gray-400"/>
              <input type="text" placeholder="Search PO, supplier…" value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"/>
            </div>
            <button onClick={()=>exportToCSV(purchaseOrders,'purchase-orders')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50"><Download className="w-3.5 h-3.5"/>Export</button>
            <button onClick={()=>openModal('po')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-medium hover:bg-blue-800"><Plus className="w-3.5 h-3.5"/>New PO</button>
          </div>
        </div>

        {/* Main table + detail split */}
        <div className="grid grid-cols-5 gap-4">
          {/* PO List */}
          <div className={`${selectedPO ? 'col-span-2' : 'col-span-5'} bg-white rounded-xl shadow-sm overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">PO #</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Supplier</th>
                    {!selectedPO && <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Ordered</th>}
                    {!selectedPO && <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Expected</th>}
                    {!selectedPO && <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Lines</th>}
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                    <th className="text-center px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-3 py-3"/>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.length===0 && (
                    <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                      <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-30"/>
                      <p className="text-sm">No purchase orders match your filters</p>
                    </td></tr>
                  )}
                  {filtered.map(po => {
                    const overdue = isOverdue(po);
                    const isSel = selectedPO?.id === po.id;
                    return (
                      <tr key={po.id} onClick={()=>setSelectedPO(isSel?null:po)}
                        className={`cursor-pointer hover:bg-indigo-50/30 transition-colors border-l-4 ${isSel?'bg-indigo-50/40 border-l-indigo-500':'border-l-transparent'}`}>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-bold text-indigo-700">{po.id}</span>
                          {overdue && <span className="ml-1 text-[10px] font-bold text-red-500 bg-red-50 px-1 rounded">OVERDUE</span>}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-800">{po.supplier}</td>
                        {!selectedPO && <td className="px-4 py-3 text-xs text-gray-500">{po.date||'—'}</td>}
                        {!selectedPO && <td className="px-4 py-3 text-xs text-gray-500">{po.expectedDate||'—'}</td>}
                        {!selectedPO && <td className="px-4 py-3 text-xs text-gray-500">{(po.items||[]).length}</td>}
                        <td className="px-4 py-3 text-right font-semibold text-sm tabular-nums">${(po.total||0).toLocaleString('en-AU',{maximumFractionDigits:0})}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusMeta[po.status]?.cls||'bg-gray-100 text-gray-600'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${statusMeta[po.status]?.dot||'bg-gray-400'}`}/>
                            {po.status}
                          </span>
                        </td>
                        <td className="px-3 py-3" onClick={e=>e.stopPropagation()}>
                          <button onClick={()=>deletePO(po.id)} className="p-1.5 hover:bg-red-50 rounded-lg" title="Delete"><Trash2 className="w-3.5 h-3.5 text-red-500"/></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* PO Detail + Receive Panel */}
          {selectedPO && (
            <div className="col-span-3 bg-white rounded-xl shadow-sm overflow-hidden flex flex-col">
              {/* Header */}
              <div className="px-5 py-4 border-b border-gray-100 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-indigo-700">{selectedPO.id}</span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${statusMeta[selectedPO.status]?.cls}`}>{selectedPO.status}</span>
                    {isOverdue(selectedPO) && <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">OVERDUE</span>}
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5">{selectedPO.supplier}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Ordered: {selectedPO.date||'—'} · Expected: {selectedPO.expectedDate||'—'}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select value={selectedPO.status} onChange={e=>{ updatePOStatus(selectedPO.id,e.target.value); setSelectedPO(p=>({...p,status:e.target.value})); }}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    {['Draft','Sent','Partial','Received','Cancelled'].map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                  <button onClick={()=>setSelectedPO(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-400"/></button>
                </div>
              </div>

              {/* Line items with receive inputs */}
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">SKU</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Description</th>
                      <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Ordered</th>
                      <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Received</th>
                      <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Receive Now</th>
                      <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(selectedPO.items||[]).map(item => {
                      const pct = item.qtyOrdered>0 ? Math.min(100,Math.round((item.qtyReceived/item.qtyOrdered)*100)) : 0;
                      const remaining = item.qtyOrdered - item.qtyReceived;
                      const key = `${selectedPO.id}-${item.id}`;
                      const isDone = item.qtyReceived >= item.qtyOrdered;
                      return (
                        <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${isDone?'opacity-60':''}`}>
                          <td className="px-4 py-3"><span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{item.sku||'—'}</span></td>
                          <td className="px-4 py-3 text-sm text-gray-700 max-w-[140px] truncate">{item.description||'—'}</td>
                          <td className="px-3 py-3 text-center font-semibold text-sm">{item.qtyOrdered}</td>
                          <td className="px-3 py-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className={`font-semibold text-sm ${isDone?'text-emerald-600':item.qtyReceived>0?'text-amber-600':'text-gray-400'}`}>{item.qtyReceived}</span>
                              <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${isDone?'bg-emerald-400':item.qtyReceived>0?'bg-amber-400':'bg-gray-200'}`} style={{width:`${pct}%`}}/>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center">
                            {!isDone ? (
                              <input type="number" min="0" max={remaining}
                                value={receiveQtys[key]||''}
                                onChange={e=>setReceiveQtys(prev=>({...prev,[key]:e.target.value}))}
                                placeholder={`0–${remaining}`}
                                className="w-20 text-center border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"/>
                            ) : <span className="text-emerald-500 text-xs font-bold">✓ Complete</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums">${(item.total||0).toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer: total + receive button */}
              <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50">
                <div>
                  <p className="text-xs text-gray-500">PO Total</p>
                  <p className="text-xl font-bold text-gray-800">${(selectedPO.total||0).toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2})}</p>
                </div>
                {!['Received','Cancelled'].includes(selectedPO.status) && (
                  <button onClick={()=>receivePO(selectedPO)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 transition-colors shadow-sm">
                    <CheckSquare className="w-4 h-4"/>Confirm Receipt
                  </button>
                )}
              </div>
              {selectedPO.notes && (
                <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
                  <p className="text-xs text-gray-500 font-semibold uppercase mb-1">Notes</p>
                  <p className="text-sm text-gray-700">{selectedPO.notes}</p>
                </div>
              )}
              <POGoodsReceiptsPanel po={selectedPO} />
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderOrderRequirements = () => {
    const reqs = orderReqTab === 'garment' ? garmentReqs : decorationReqs;
    const refetch = orderReqTab === 'garment' ? refetchGarmentReqs : refetchDecorationReqs;

    const groupKey = (req) => orderReqTab === 'garment' ? req.sku : `${req.decoration_type}:${req.sku}`;

    const toggleGroup = (key) => {
      setOrderReqSelected(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    };

    const toggleAll = () => {
      const allKeys = reqs.map(groupKey);
      if (orderReqSelected.size === allKeys.length && allKeys.length > 0) {
        setOrderReqSelected(new Set());
      } else {
        setOrderReqSelected(new Set(allKeys));
      }
    };

    const selectedReqs = reqs.filter(r => orderReqSelected.has(groupKey(r)));
    const selectedItemCount = selectedReqs.reduce((t, r) => t + r.jobs.length, 0);
    const selectedTotalQty = selectedReqs.reduce((t, r) => t + (r.total_b_ord || r.total_qty || 0), 0);
    const selectedEstCost = selectedReqs.reduce((t, r) => t + ((r.total_b_ord || 0) * (r.unit_cost || 0)), 0);

    const today = new Date();
    const defaultPoId = `PO-${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;

    const openPoCreation = () => {
      const firstSelected = selectedReqs[0];
      setOrderReqPoModal({ open: true, poId: defaultPoId, supplierId: '', supplierName: firstSelected?.supplier || '', expectedDate: '', notes: '', saving: false, error: '' });
    };

    const submitPO = async () => {
      if (!orderReqPoModal.poId.trim()) {
        setOrderReqPoModal(m => ({ ...m, error: 'PO # is required' }));
        return;
      }
      const requirements = selectedReqs.flatMap(r =>
        r.jobs.map(j => ({ item_id: j.item_id, qty: j.b_ord || j.qty || 0 }))
      ).filter(r => r.qty > 0);
      if (!requirements.length) return;

      setOrderReqPoModal(m => ({ ...m, saving: true, error: '' }));
      try {
        await api.purchaseOrders.createFromRequirements({ id: orderReqPoModal.poId, supplierCode: orderReqPoModal.supplierId, supplier: orderReqPoModal.supplierName, expectedDate: orderReqPoModal.expectedDate, notes: orderReqPoModal.notes, requirements });
        queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
        queryClient.invalidateQueries({ queryKey: ['jobs'] });
        queryClient.invalidateQueries({ queryKey: ['orderRequirements'] });
        setOrderReqSelected(new Set());
        setOrderReqPoModal({ open: false, poId: '', supplierId: '', supplierName: '', expectedDate: '', notes: '', saving: false, error: '' });
      } catch (err) {
        setOrderReqPoModal(m => ({ ...m, saving: false, error: err.message }));
      }
    };

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Order Requirements</h2>
              <p className="text-xs text-gray-500 mt-0.5">Items needed to fulfil active jobs — create purchase orders directly from here</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => refetch()} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50">
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
              {orderReqSelected.size > 0 && (
                <button onClick={openPoCreation} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 shadow-sm">
                  <ShoppingCart className="w-3.5 h-3.5" />
                  Create PO ({selectedTotalQty} units{selectedEstCost > 0 ? ` · $${selectedEstCost.toLocaleString('en-AU', { maximumFractionDigits: 0 })}` : ''})
                </button>
              )}
            </div>
          </div>
          {/* Tabs */}
          <div className="flex gap-1 mt-3 border-b border-gray-100">
            {[
              { key: 'garment', label: 'Garment Requirements', count: garmentReqs.reduce((t, r) => t + r.total_b_ord, 0) },
              { key: 'decoration', label: 'Decoration Work', count: decorationReqs.length },
            ].map(tab => (
              <button key={tab.key} onClick={() => { setOrderReqTab(tab.key); setOrderReqSelected(new Set()); }}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${orderReqTab === tab.key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {tab.label}
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${orderReqTab === tab.key ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>{tab.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {reqs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <CheckSquare className="w-10 h-10 mb-3 text-gray-200" />
              <p className="text-sm font-medium text-gray-500">No outstanding {orderReqTab === 'garment' ? 'garment' : 'decoration'} requirements</p>
              <p className="text-xs mt-1">All active jobs are {orderReqTab === 'garment' ? 'fully stocked' : 'decorated or have linked POs'}</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="w-8 px-3 py-2.5">
                    <input type="checkbox" className="rounded" checked={orderReqSelected.size === reqs.length && reqs.length > 0} onChange={toggleAll} />
                  </th>
                  {orderReqTab === 'garment' ? (
                    <>
                      <th className="px-3 py-2.5 text-left text-gray-500 font-semibold">Stock Code</th>
                      <th className="px-3 py-2.5 text-left text-gray-500 font-semibold">Description</th>
                      <th className="px-3 py-2.5 text-left text-gray-500 font-semibold">Supplier</th>
                      <th className="px-3 py-2.5 text-right text-gray-500 font-semibold">B. Ord</th>
                      <th className="px-3 py-2.5 text-right text-gray-500 font-semibold">Unit Cost</th>
                      <th className="px-3 py-2.5 text-right text-gray-500 font-semibold">Est. Total</th>
                      <th className="px-3 py-2.5 text-left text-gray-500 font-semibold">Affected Jobs</th>
                    </>
                  ) : (
                    <>
                      <th className="px-3 py-2.5 text-left text-gray-500 font-semibold">Type</th>
                      <th className="px-3 py-2.5 text-left text-gray-500 font-semibold">Code</th>
                      <th className="px-3 py-2.5 text-left text-gray-500 font-semibold">Description</th>
                      <th className="px-3 py-2.5 text-right text-gray-500 font-semibold">Total Qty</th>
                      <th className="px-3 py-2.5 text-left text-gray-500 font-semibold">Affected Jobs</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reqs.map(req => {
                  const key = groupKey(req);
                  const checked = orderReqSelected.has(key);
                  return (
                    <tr key={key} className={`hover:bg-indigo-50/30 cursor-pointer transition-colors ${checked ? 'bg-indigo-50' : ''}`} onClick={() => toggleGroup(key)}>
                      <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" className="rounded" checked={checked} onChange={() => toggleGroup(key)} />
                      </td>
                      {orderReqTab === 'garment' ? (
                        <>
                          <td className="px-3 py-2.5 font-mono text-blue-700 font-semibold">{req.sku || <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-2.5 text-gray-800">{req.description}</td>
                          <td className="px-3 py-2.5 text-gray-600">{req.supplier || <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-orange-600">{req.total_b_ord}</td>
                          <td className="px-3 py-2.5 text-right text-gray-600">{req.unit_cost > 0 ? `$${req.unit_cost.toFixed(2)}` : <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-gray-700">{req.unit_cost > 0 ? `$${(req.total_b_ord * req.unit_cost).toLocaleString('en-AU', { maximumFractionDigits: 2 })}` : <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {req.jobs.map(j => (
                                <button key={j.item_id} onClick={e => { e.stopPropagation(); const job = jobs.find(jb => jb.id === j.job_id); if (job) { pinJob(job); setActiveModule('jobs'); } }}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 hover:bg-indigo-100 text-gray-600 hover:text-indigo-700 font-mono text-[10px] transition-colors"
                                  title={`${j.customer_name} — ${j.b_ord} units`}>
                                  #{j.job_id} <span className="text-orange-500 font-bold">×{j.b_ord}</span>
                                </button>
                              ))}
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2.5">
                            {(() => { const d = DEC_OPTIONS.find(o => o.v === req.decoration_type); return d ? <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold ${d.pill}`}>{d.emoji} {d.l}</span> : req.decoration_type; })()}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-blue-700 font-semibold">{req.sku || <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-2.5 text-gray-800">{req.description}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-indigo-600">{req.total_qty}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {req.jobs.map(j => (
                                <button key={j.item_id} onClick={e => { e.stopPropagation(); const job = jobs.find(jb => jb.id === j.job_id); if (job) { pinJob(job); setActiveModule('jobs'); } }}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 hover:bg-indigo-100 text-gray-600 hover:text-indigo-700 font-mono text-[10px] transition-colors"
                                  title={`${j.customer_name} — ${j.qty} units`}>
                                  #{j.job_id} <span className="text-indigo-500 font-bold">×{j.qty}</span>
                                </button>
                              ))}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td colSpan={orderReqTab === 'garment' ? 4 : 4} className="px-3 py-2 text-xs font-semibold text-gray-500">
                    {orderReqSelected.size > 0 ? `${orderReqSelected.size} of ${reqs.length} groups selected` : `${reqs.length} group${reqs.length !== 1 ? 's' : ''} total`}
                  </td>
                  {orderReqTab === 'garment' ? (
                    <>
                      <td className="px-3 py-2 text-right text-xs font-bold text-orange-600">{reqs.reduce((t, r) => t + r.total_b_ord, 0)}</td>
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right text-xs font-bold text-gray-700">${reqs.reduce((t, r) => t + r.total_b_ord * (r.unit_cost || 0), 0).toLocaleString('en-AU', { maximumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2" />
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-right text-xs font-bold text-indigo-600">{reqs.reduce((t, r) => t + r.total_qty, 0)}</td>
                      <td className="px-3 py-2" />
                    </>
                  )}
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* PO creation modal */}
        {orderReqPoModal.open && (
          <DraggableModal onClose={() => setOrderReqPoModal(m => ({ ...m, open: false }))} cardClass="w-full max-w-lg">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-indigo-500" />
                <h3 className="text-sm font-semibold text-gray-800">Create Purchase Order</h3>
              </div>
              <button onClick={() => setOrderReqPoModal(m => ({ ...m, open: false }))} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">PO Number *</label>
                  <input value={orderReqPoModal.poId} onChange={e => setOrderReqPoModal(m => ({ ...m, poId: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="PO-20260429" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Expected Date</label>
                  <input type="date"
                    value={orderReqPoModal.expectedDate ? (() => { const p = orderReqPoModal.expectedDate.split('/'); return p.length===3 ? `${p[2]}-${p[1]}-${p[0]}` : orderReqPoModal.expectedDate; })() : ''}
                    onChange={e => {
                      if (!e.target.value) { setOrderReqPoModal(m => ({ ...m, expectedDate: '' })); return; }
                      const d = new Date(e.target.value + 'T00:00:00');
                      setOrderReqPoModal(m => ({ ...m, expectedDate: `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` }));
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Supplier</label>
                <input value={orderReqPoModal.supplierName} onChange={e => setOrderReqPoModal(m => ({ ...m, supplierName: e.target.value, supplierId: '' }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Supplier name…" list="req-supp-list" />
                <datalist id="req-supp-list">{suppliers.map(s => <option key={s.code} value={s.name} />)}</datalist>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Notes</label>
                <textarea value={orderReqPoModal.notes} onChange={e => setOrderReqPoModal(m => ({ ...m, notes: e.target.value }))} rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="Optional notes…" />
              </div>
              {/* Preview */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 border-b border-gray-200">
                  {selectedReqs.length} group{selectedReqs.length !== 1 ? 's' : ''} · {selectedItemCount} job item{selectedItemCount !== 1 ? 's' : ''} will be linked
                </div>
                <div className="max-h-44 overflow-y-auto">
                  <table className="w-full text-xs">
                    <tbody>
                      {selectedReqs.map(req => {
                        const key = groupKey(req);
                        return (
                          <tr key={key} className="border-b border-gray-100 last:border-0">
                            <td className="px-3 py-1.5 font-mono text-blue-700 font-semibold">{req.sku || req.decoration_type}</td>
                            <td className="px-3 py-1.5 text-gray-600 truncate max-w-[160px]">{req.description}</td>
                            <td className="px-3 py-1.5 text-right font-bold text-orange-600">×{req.total_b_ord || req.total_qty}</td>
                            {orderReqTab === 'garment' && <td className="px-3 py-1.5 text-right text-gray-500">{req.unit_cost > 0 ? `$${(req.total_b_ord * req.unit_cost).toFixed(2)}` : ''}</td>}
                          </tr>
                        );
                      })}
                    </tbody>
                    {orderReqTab === 'garment' && selectedEstCost > 0 && (
                      <tfoot>
                        <tr className="bg-gray-50">
                          <td colSpan={3} className="px-3 py-1.5 text-xs font-semibold text-right text-gray-500">Estimated Total:</td>
                          <td className="px-3 py-1.5 text-right font-bold text-gray-800">${selectedEstCost.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
              {orderReqPoModal.error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{orderReqPoModal.error}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setOrderReqPoModal(m => ({ ...m, open: false }))} className="px-4 py-2 text-xs text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
              <button onClick={submitPO} disabled={orderReqPoModal.saving}
                className="px-5 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 flex items-center gap-1.5">
                {orderReqPoModal.saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />}
                {orderReqPoModal.saving ? 'Creating…' : 'Create PO & Link Jobs'}
              </button>
            </div>
          </DraggableModal>
        )}
      </div>
    );
  };

  const renderReports = () => (
    <ReportsModule
      jobs={jobs}
      inventory={inventory}
      suppliers={suppliers}
      purchaseOrders={purchaseOrders}
      onOpenJob={(jobId) => {
        const j = jobs.find(j => j.id === jobId);
        if (j) { setActiveModule('jobs'); openModal('job', j); }
      }}
      onNavigateToPO={(po) => {
        setActiveModule('purchase-orders');
        setSelectedPO(po);
      }}
    />
  );


  const renderInvoice = () => {
    if (!invoiceJob) return null;
    const j = invoiceJob;
    const custData = customers.find(c => c.id === j.customerId) || {};
    const visibleItems = (j.items || []).filter(i => !i.hide && i.displayType !== 'note');
    const subtotal = visibleItems.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
    const gst = parseFloat((subtotal * 0.1).toFixed(2));
    const grandTotal = parseFloat((subtotal + gst).toFixed(2));
    const paid = parseFloat(j.deposit || j.invoicePaid || 0);
    const balance = parseFloat((grandTotal - paid).toFixed(2));
    const isQuote = j.status === 'QUOTE';
    const docTitle = isQuote ? 'TAX QUOTE' : 'TAX INVOICE';

    return (
      <DraggableModal onClose={() => setInvoiceJob(null)} cardClass="w-full max-w-3xl max-h-[95vh] overflow-y-auto print:shadow-none print:rounded-none print:max-h-none print:overflow-visible" overlayClass="print:hidden">

          {/* Screen-only toolbar */}
          <div className="flex items-center justify-between px-6 py-3 border-b bg-gray-50 print:hidden rounded-t-lg">
            <div className="flex items-center gap-3">
              <span className={`text-xs font-bold px-2 py-1 rounded ${isQuote ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{docTitle}</span>
              <span className="text-sm text-gray-600 font-mono">#{j.invoice || j.id}</span>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${balance <= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>{balance <= 0 ? 'PAID' : `Balance $${balance.toFixed(2)}`}</span>
            </div>
            <div className="flex gap-2">
              <a
                href={`/api/jobs/${j.id}/pdf?type=${j.status === 'QUOTE' ? 'quote' : 'invoice'}`}
                target="_blank"
                rel="noreferrer"
                className="bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700 flex items-center gap-1 no-underline"
              >
                <Download className="w-3.5 h-3.5" />Download PDF
              </a>
              <button onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 flex items-center gap-1">
                <Printer className="w-3.5 h-3.5" />Print
              </button>
              <button onClick={() => setInvoiceJob(null)} className="p-1.5 hover:bg-gray-200 rounded"><X className="w-4 h-4" /></button>
            </div>
          </div>

          {/* Document body */}
          <div className="px-10 py-8 print:px-8 print:py-6" id="invoice-content" style={{ fontFamily: 'Arial, sans-serif', fontSize: '13px', color: '#1a1a1a' }}>

            {/* Header: Company + Document Title */}
            <div className="flex justify-between items-start mb-7">
              <div>
                <div style={{ width: 56, height: 56, background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                  <span style={{ color: '#fff', fontWeight: 900, fontSize: 20, letterSpacing: -1 }}>TIG</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.2 }}>Total Image Group</div>
                <div style={{ color: '#555', fontSize: 12, marginTop: 4 }}>123 Example Street, Melbourne VIC 3000</div>
                <div style={{ color: '#555', fontSize: 12 }}>Phone: (03) 9000 0000 · info@totalimagegroup.com.au</div>
                <div style={{ color: '#555', fontSize: 12, marginTop: 2 }}><strong>ABN:</strong> 12 345 678 901</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: 1, color: isQuote ? '#6d28d9' : '#1d4ed8', marginBottom: 6 }}>{docTitle}</div>
                <table style={{ marginLeft: 'auto', fontSize: 12 }}>
                  <tbody>
                    <tr><td style={{ color: '#555', paddingRight: 16, paddingBottom: 2 }}>{isQuote ? 'Quote No:' : 'Invoice No:'}</td><td style={{ fontWeight: 700 }}>{j.invoice || j.id}</td></tr>
                    <tr><td style={{ color: '#555', paddingRight: 16, paddingBottom: 2 }}>Job Ref:</td><td style={{ fontFamily: 'monospace' }}>{j.id}</td></tr>
                    <tr><td style={{ color: '#555', paddingRight: 16, paddingBottom: 2 }}>Date:</td><td>{j.dateIn}</td></tr>
                    {j.due && <tr><td style={{ color: '#555', paddingRight: 16, paddingBottom: 2 }}>{isQuote ? 'Valid Until:' : 'Due Date:'}</td><td style={{ fontWeight: 600, color: '#dc2626' }}>{j.due}</td></tr>}
                    {custData.paymentTerms && !isQuote && <tr><td style={{ color: '#555', paddingRight: 16 }}>Terms:</td><td>{custData.paymentTerms}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Horizontal rule */}
            <div style={{ borderTop: '3px solid #1d4ed8', marginBottom: 20 }} />

            {/* Bill To / Ship To / Our Ref */}
            <div className="grid grid-cols-3 gap-6 mb-7" style={{ fontSize: 12 }}>
              <div>
                <div style={{ fontWeight: 700, textTransform: 'uppercase', color: '#888', fontSize: 10, letterSpacing: 1, marginBottom: 5 }}>Bill To</div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{j.customer}</div>
                {custData.abn && <div style={{ color: '#555', marginTop: 2 }}>ABN: {custData.abn}</div>}
                {j.shippingAddress && <div style={{ color: '#555', marginTop: 4, whiteSpace: 'pre-line' }}>{j.shippingAddress}</div>}
                {custData.phone && <div style={{ color: '#555', marginTop: 2 }}>Ph: {custData.phone}</div>}
                {custData.email && <div style={{ color: '#555' }}>{custData.email}</div>}
              </div>
              {j.shipTo && (
                <div>
                  <div style={{ fontWeight: 700, textTransform: 'uppercase', color: '#888', fontSize: 10, letterSpacing: 1, marginBottom: 5 }}>Ship To</div>
                  <div style={{ fontWeight: 600 }}>{j.shipTo}</div>
                </div>
              )}
              <div>
                <div style={{ fontWeight: 700, textTransform: 'uppercase', color: '#888', fontSize: 10, letterSpacing: 1, marginBottom: 5 }}>References</div>
                {j.custRef && <div style={{ color: '#333' }}>Cust Ref: <strong>{j.custRef}</strong></div>}
                {j.ourRef && <div style={{ color: '#333' }}>Our Ref: <strong>{j.ourRef}</strong></div>}
                {j.assignedTo && <div style={{ color: '#555', marginTop: 2 }}>Sales Rep: {j.assignedTo}</div>}
                {j.nameContact && <div style={{ color: '#555' }}>Attn: {j.nameContact}</div>}
              </div>
            </div>

            {/* Line Items Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 16 }}>
              <thead>
                <tr style={{ background: '#1d4ed8', color: '#fff' }}>
                  <th style={{ textAlign: 'left', padding: '7px 10px', fontWeight: 600 }}>Description</th>
                  <th style={{ textAlign: 'left', padding: '7px 8px', fontWeight: 600, width: 80 }}>Decoration</th>
                  <th style={{ textAlign: 'right', padding: '7px 8px', fontWeight: 600, width: 52 }}>Qty</th>
                  <th style={{ textAlign: 'right', padding: '7px 8px', fontWeight: 600, width: 75 }}>Unit (ex)</th>
                  <th style={{ textAlign: 'right', padding: '7px 8px', fontWeight: 600, width: 50 }}>Disc%</th>
                  <th style={{ textAlign: 'right', padding: '7px 8px', fontWeight: 600, width: 80 }}>Amount</th>
                  <th style={{ textAlign: 'center', padding: '7px 8px', fontWeight: 600, width: 40 }}>GST</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item, i) => {
                  const isSec = item.displayType === 'section';
                  if (isSec) return (
                    <tr key={i} style={{ background: '#eff6ff' }}>
                      <td colSpan={7} style={{ padding: '5px 10px', fontWeight: 700, color: '#1d4ed8', fontSize: 12 }}>{item.description}</td>
                    </tr>
                  );
                  const gstType = item.taxType || 'GST';
                  return (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '6px 10px' }}>
                        <div style={{ fontWeight: 500 }}>{item.description}</div>
                        {item.stockCode && <div style={{ color: '#888', fontSize: 10 }}>SKU: {item.stockCode}</div>}
                        {item.sizes && <div style={{ color: '#666', fontSize: 11 }}>{item.sizes}</div>}
                        {item.embCode && <div style={{ color: '#7c3aed', fontSize: 10, fontFamily: 'monospace' }}>🧵 EMB: {item.embCode}</div>}
                        {item.trsCode && <div style={{ color: '#c2410c', fontSize: 10, fontFamily: 'monospace' }}>♨️ TRS: {item.trsCode}</div>}
                      </td>
                      <td style={{ padding: '6px 8px', color: '#555' }}>{item.decorationType !== 'None' ? item.decorationType : ''}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{item.orderQty || item.order || item.qty || 0}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>${(parseFloat(item.priceEx) || 0).toFixed(2)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: item.discount > 0 ? '#dc2626' : '#ccc' }}>{item.discount > 0 ? `${item.discount}%` : '—'}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>${(parseFloat(item.total) || 0).toFixed(2)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', color: '#16a34a', fontSize: 10 }}>{gstType}</td>
                    </tr>
                  );
                })}
                {visibleItems.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: '20px', textAlign: 'center', color: '#aaa' }}>No line items</td></tr>
                )}
              </tbody>
            </table>

            {/* Totals + Payment Details */}
            <div className="flex justify-between items-start gap-8">
              {/* Payment details / bank */}
              <div style={{ fontSize: 11, color: '#555', flex: 1 }}>
                {!isQuote && (
                  <>
                    <div style={{ fontWeight: 700, marginBottom: 4, color: '#333' }}>Payment Details</div>
                    <div>Bank: Commonwealth Bank of Australia</div>
                    <div>BSB: 063-000 · Account: 1234 5678</div>
                    <div>Account Name: Total Image Group Pty Ltd</div>
                    <div style={{ marginTop: 4 }}>Reference: <strong>{j.invoice || j.id}</strong></div>
                    <div style={{ marginTop: 8, color: '#888' }}>Payment methods accepted: EFT, Credit Card, Cheque</div>
                  </>
                )}
                {isQuote && (
                  <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 6, padding: '8px 12px' }}>
                    <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 2 }}>This is a Quote — Not a Tax Invoice</div>
                    <div style={{ color: '#78350f', fontSize: 10 }}>Prices valid until {j.due || j.validityDate || '30 days from issue'}. GST will apply upon invoicing.</div>
                  </div>
                )}
              </div>

              {/* Totals box */}
              <div style={{ minWidth: 240 }}>
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr><td style={{ padding: '4px 12px 4px 0', color: '#555' }}>Subtotal (ex GST)</td><td style={{ textAlign: 'right', padding: '4px 0', fontFamily: 'monospace' }}>${subtotal.toFixed(2)}</td></tr>
                    <tr style={{ borderTop: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '4px 12px 4px 0', color: '#555' }}>GST (10%)</td>
                      <td style={{ textAlign: 'right', padding: '4px 0', fontFamily: 'monospace' }}>${gst.toFixed(2)}</td>
                    </tr>
                    <tr style={{ borderTop: '2px solid #1d4ed8', background: '#eff6ff' }}>
                      <td style={{ padding: '7px 12px 7px 6px', fontWeight: 700, fontSize: 14 }}>TOTAL (inc GST)</td>
                      <td style={{ textAlign: 'right', padding: '7px 6px 7px 0', fontWeight: 700, fontSize: 14, fontFamily: 'monospace' }}>${grandTotal.toFixed(2)}</td>
                    </tr>
                    {paid > 0 && <>
                      <tr><td style={{ padding: '4px 12px 4px 0', color: '#16a34a' }}>Less: Amount Paid</td><td style={{ textAlign: 'right', padding: '4px 0', color: '#16a34a', fontFamily: 'monospace' }}>-${paid.toFixed(2)}</td></tr>
                      <tr style={{ borderTop: '2px solid #dc2626', background: '#fef2f2' }}>
                        <td style={{ padding: '7px 12px 7px 6px', fontWeight: 700, fontSize: 14, color: '#dc2626' }}>BALANCE DUE</td>
                        <td style={{ textAlign: 'right', padding: '7px 6px 7px 0', fontWeight: 700, fontSize: 14, color: '#dc2626', fontFamily: 'monospace' }}>${balance.toFixed(2)}</td>
                      </tr>
                    </>}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Notes */}
            {j.notes && (
              <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid #e5e7eb', fontSize: 11 }}>
                <div style={{ fontWeight: 700, marginBottom: 4, color: '#333' }}>Notes / Special Instructions</div>
                <div style={{ color: '#555', whiteSpace: 'pre-line' }}>{j.notes}</div>
              </div>
            )}

            {/* Footer */}
            <div style={{ marginTop: 24, paddingTop: 12, borderTop: '2px solid #1d4ed8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: '#888' }}>
              <div>Total Image Group Pty Ltd · ABN 12 345 678 901 · Registered for GST</div>
              <div>Thank you for your business</div>
              <div>Page 1 of 1</div>
            </div>
          </div>
      </DraggableModal>
    );
  };

  const renderAIAssistant = () => {
    const parseMarkdown = (text) => {
      const lines = (text || '').split('\n');
      return lines.map((line, i) => {
        const renderInline = (str) => {
          const parts = str.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
          return parts.map((p, j) => {
            if (p.startsWith('**') && p.endsWith('**')) return <strong key={j}>{p.slice(2, -2)}</strong>;
            if (p.startsWith('*') && p.endsWith('*')) return <em key={j}>{p.slice(1, -1)}</em>;
            return p;
          });
        };
        if (!line.trim()) return <div key={i} className="h-1.5" />;
        const bulletMatch = line.match(/^(\s*)[•\-]\s(.+)/);
        if (bulletMatch) {
          const indent = bulletMatch[1].length;
          return (
            <div key={i} className="flex text-xs leading-relaxed" style={{ paddingLeft: indent * 6 }}>
              <span className="mr-1.5 text-indigo-400 flex-shrink-0">•</span>
              <span>{renderInline(bulletMatch[2])}</span>
            </div>
          );
        }
        if (line.startsWith('→')) {
          return <div key={i} className="text-xs text-indigo-600 mt-1 font-medium">{renderInline(line)}</div>;
        }
        return <div key={i} className="text-xs leading-relaxed">{renderInline(line)}</div>;
      });
    };

    const quickChips = [
      { label: '📋 Daily briefing', msg: 'daily briefing' },
      { label: '📈 Revenue forecast', msg: 'forecast next month revenue' },
      { label: '⚠ Overdue jobs', msg: 'show overdue jobs' },
      { label: '📦 Low stock', msg: 'low stock alert' },
      { label: '🔍 Anomalies', msg: 'show anomalies unusual activity' },
      { label: '👥 Churn risk', msg: 'customer churn risk analysis' },
      { label: '📊 ABC analysis', msg: 'abc pareto analysis' },
      { label: '💰 Margin analysis', msg: 'margin profit analysis' },
      { label: '📅 DSO', msg: 'days sales outstanding receivables' },
      { label: '⏱ Turnaround', msg: 'job turnaround time' },
      { label: '📆 Seasonality', msg: 'seasonality trends' },
    ];

    const sendChip = async (msg) => {
      if (aiLoading) return;
      setAiMessages(prev => [...prev, { role: 'user', text: msg, ts: new Date() }]);
      setAiLoading(true);
      try {
        const ctx = `Jobs:${jobs.length},LowStock:${inventory.filter(i=>i.stock<=i.reorderLevel).length},Customers:${customers.length},Suppliers:${suppliers.length}`;
        const res = await api.ai.chat(msg, ctx);
        setAiMessages(prev => [...prev, { role: 'assistant', text: res.response, ts: new Date() }]);
      } catch (e) {
        setAiMessages(prev => [...prev, { role: 'assistant', text: `Error: ${e.message}`, ts: new Date() }]);
      } finally {
        setAiLoading(false);
        setTimeout(() => aiEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    };

    const copyToClipboard = (text) => {
      navigator.clipboard.writeText(text).catch(() => {});
    };

    const fmtTime = (ts) => {
      if (!ts) return '';
      const d = ts instanceof Date ? ts : new Date(ts);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const onHeaderMouseDown = (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('button')) return;
      e.preventDefault();
      const panel = aiPanelRef.current;
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      aiDragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const onMove = (mv) => setAiPos({ x: mv.clientX - aiDragOffset.current.x, y: mv.clientY - aiDragOffset.current.y });
      const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };

    const panelStyle = aiPos
      ? { position: 'fixed', left: aiPos.x, top: aiPos.y, bottom: 'auto', right: 'auto', zIndex: 50, width: 440, height: 560 }
      : { position: 'fixed', bottom: 96, right: 24, zIndex: 50, width: 440, height: 560 };

    return (
      <>
        <button
          onClick={() => setAiOpen(o => !o)}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-blue-700 hover:bg-blue-800 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110"
          title="AI Assistant"
        >
          <Bot className="w-6 h-6" />
          {!aiOpen && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full text-[9px] flex items-center justify-center font-bold">ML</span>
          )}
        </button>
        {aiOpen && (
          <div ref={aiPanelRef} style={panelStyle} className="bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
            {/* Header */}
            <div
              onMouseDown={onHeaderMouseDown}
              className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-t-2xl select-none cursor-grab active:cursor-grabbing"
            >
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-sm leading-none flex items-center gap-1.5">
                    TIG AI Assistant
                    {aiClaudeEnabled && (
                      <span className="text-[9px] bg-amber-400 text-amber-900 px-1.5 py-0.5 rounded-full font-bold leading-none">Claude</span>
                    )}
                  </div>
                  <div className="text-[10px] text-indigo-200 mt-0.5">
                    {aiClaudeEnabled ? 'Powered by Claude · ML analytics' : 'Live data · ML analytics'}
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setAiMessages([{ role: 'assistant', text: 'Conversation cleared. How can I help?', ts: new Date() }])}
                  className="w-6 h-6 rounded hover:bg-white/20 flex items-center justify-center text-indigo-200 hover:text-white"
                  title="Clear chat"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setAiOpen(false)} className="w-6 h-6 rounded hover:bg-white/20 flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick chips */}
            <div className="px-3 py-2 border-b bg-gray-50 flex flex-wrap gap-1">
              {quickChips.map(chip => (
                <button
                  key={chip.label}
                  onClick={() => sendChip(chip.msg)}
                  disabled={aiLoading}
                  className="text-[10px] px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-40 transition-colors font-medium"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {aiMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-1.5`}>
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mb-0.5">
                      <Bot className="w-3.5 h-3.5 text-indigo-600" />
                    </div>
                  )}
                  <div className="flex flex-col gap-0.5" style={{ maxWidth: '82%' }}>
                    <div className={`px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-blue-700 text-white rounded-br-sm'
                        : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                    }`}>
                      {msg.role === 'assistant' ? parseMarkdown(msg.text) : msg.text}
                    </div>
                    <div className={`flex items-center gap-1.5 px-1 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {msg.ts && <span className="text-[9px] text-gray-400">{fmtTime(msg.ts)}</span>}
                      {msg.role === 'assistant' && (
                        <button
                          onClick={() => copyToClipboard(msg.text)}
                          className="text-[9px] text-gray-400 hover:text-gray-600 flex items-center gap-0.5 transition-colors"
                          title="Copy"
                        >
                          <Copy className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-6 h-6 rounded-full bg-blue-700 flex items-center justify-center flex-shrink-0 mb-0.5">
                      <User className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                </div>
              ))}
              {aiLoading && (
                <div className="flex items-end gap-1.5">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-3.5 h-3.5 text-indigo-600" />
                  </div>
                  <div className="bg-gray-100 px-3 py-2.5 rounded-2xl rounded-bl-sm">
                    <div className="flex space-x-1">
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={aiEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t bg-white">
              <div className="flex space-x-2 items-center">
                <input
                  type="text"
                  value={aiInput}
                  onChange={e => setAiInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendAiMessage()}
                  placeholder="Ask about jobs, revenue, stock, forecasts…"
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
                />
                <button
                  onClick={sendAiMessage}
                  disabled={aiLoading || !aiInput.trim()}
                  className="w-8 h-8 flex-shrink-0 bg-blue-700 text-white rounded-xl flex items-center justify-center hover:bg-blue-800 disabled:opacity-40 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  // Render Warehouse Module — Live Bin-Location Map
  const renderWarehouse = () => {
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
        <h2 className="text-2xl font-bold flex items-center">
          <Warehouse className="w-6 h-6 mr-2 text-blue-600" />
          Live Warehouse — Bin Location Map
        </h2>
        <div className="flex space-x-2">
          <button
            onClick={() => exportToCSV(zoneItems, `warehouse-zone-${selectedWarehouseZone}`)}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 flex items-center text-sm font-medium"
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
            className={`bg-white rounded-lg border border-slate-200 p-4 text-left transition-all hover:shadow-md ${selectedWarehouseZone === z.zone ? 'ring-2 ring-blue-500' : ''}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xl font-bold text-gray-700">Zone {z.zone}</span>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${z.utilization > 80 ? 'bg-red-100 text-red-700' : z.utilization > 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                {z.utilization}%
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-2">{z.description}</p>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div className={`h-1.5 rounded-full ${z.utilization > 80 ? 'bg-red-500' : z.utilization > 60 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${z.utilization}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-1">{z.rows}×{z.bays} grid • {z.items} items</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Rack bin map */}
        <div className="col-span-2 bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold flex items-center text-sm">
              <Layers className="w-4 h-4 mr-2 text-blue-600" />
              Zone {selectedWarehouseZone} — {zone.description}
              <span className="ml-2 text-xs text-gray-400 font-normal">{zone.bays} bays × {zone.rows} levels</span>
            </h3>
            <div className="flex items-center space-x-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-gray-100 border border-gray-300 inline-block"></span>Empty</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-100 border border-blue-300 inline-block"></span>Occupied</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-100 border border-red-300 inline-block"></span>Low Stock</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-100 border border-green-400 inline-block ring-2 ring-green-400"></span>Selected</span>
            </div>
          </div>

          {/* Visual rack grid — levels top to bottom, bays left to right */}
          <div className="overflow-auto border rounded-lg bg-gray-50 p-3" style={{ maxHeight: '520px' }}>
            <table className="border-collapse mx-auto">
              <thead>
                <tr>
                  <th className="w-7 text-right pr-2 text-xs text-gray-400 font-normal pb-1">Lvl</th>
                  {bays.map(bay => (
                    <th key={bay} className="text-center text-xs text-gray-500 font-normal pb-1 px-0.5" style={{ minWidth: '72px' }}>
                      Bay {bay}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {levels.map(level => (
                  <tr key={level}>
                    <td className="text-right pr-2 text-xs text-gray-400 font-mono align-middle py-0.5">{level}</td>
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
                            <span className={`font-mono leading-none ${isSelected ? 'text-green-700' : status === 'low' ? 'text-red-600' : status === 'occupied' ? 'text-blue-600' : 'text-gray-400'}`} style={{ fontSize: '9px' }}>
                              {binCode}
                            </span>
                            {items.length > 0 && (
                              <span className={`font-semibold mt-0.5 ${status === 'low' ? 'text-red-700' : 'text-blue-700'}`} style={{ fontSize: '10px' }}>
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
            <div className="mt-3 border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-sm flex items-center">
                  <Tag className="w-4 h-4 mr-1.5 text-blue-500" />
                  Bin: <span className="font-mono ml-1 text-blue-700">{selectedBin}</span>
                </h4>
                <button onClick={() => setSelectedBin(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
              </div>
              {(binMap[selectedBin] || []).length === 0 ? (
                <div className="bg-gray-50 rounded p-3 text-center">
                  <p className="text-sm text-gray-400">Empty bin — available for stock</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {(binMap[selectedBin] || []).map(item => (
                    <div key={item.sku} className="flex items-center justify-between bg-gray-50 rounded p-2">
                      <div>
                        <span className="font-mono text-xs text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded">{item.sku}</span>
                        <span className="text-sm ml-2">{item.name}</span>
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
          <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs text-gray-500">
            <span>Zone {selectedWarehouseZone}: {totalOccupied} of {bays.length * levels.length} bins occupied</span>
            <span>{zoneItems.filter(i => i.stock < i.reorderLevel).length} items low stock in this zone</span>
          </div>
        </div>

        {/* Zone inventory sidebar */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 flex flex-col">
          <h3 className="font-semibold mb-3 text-sm flex items-center">
            <Package className="w-4 h-4 mr-2 text-gray-500" />
            Zone {selectedWarehouseZone} Stock
            <span className="ml-1 bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-xs">{zoneItems.length} SKUs</span>
          </h3>
          <div className="relative mb-3">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Find item..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className={`p-2 rounded border cursor-pointer transition-colors ${selectedBin === item.location ? 'bg-green-50 border-green-300' : 'border-transparent hover:bg-blue-50 hover:border-blue-200'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{item.location}</span>
                    <span className={`text-xs font-semibold ${item.stock < item.reorderLevel ? 'text-red-600' : 'text-green-600'}`}>
                      {item.stock} {item.stock < item.reorderLevel ? '⚠' : ''}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-gray-800 truncate mt-1">{item.name}</p>
                  <p className="text-xs text-gray-400">{item.sku} • {item.category}</p>
                </div>
              ))}
            {zoneItems.length === 0 && (
              <div className="text-center py-10 text-gray-400">
                <Warehouse className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No items in Zone {selectedWarehouseZone}.</p>
                <p className="text-xs mt-1">Set inventory location to "{selectedWarehouseZone}-bay-level"</p>
                <p className="text-xs mt-0.5 text-blue-500">e.g. "{selectedWarehouseZone}-01-1"</p>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
    );
  };

  // Modal Renderer
  const renderModal = () => {
    if (!showModal) return null;

    return (
      <DraggableModal onClose={closeModal} cardClass="overflow-auto" cardStyle={{ resize: 'both', width: '90vw', maxWidth: '1400px', minWidth: '520px', height: '90vh', minHeight: '400px', maxHeight: '96vh' }}>
          <div className="flex flex-col h-full">
            {/* Modal title bar */}
            <div className="flex items-center justify-between px-5 py-3 bg-[#1e3a8a] cursor-move select-none shrink-0">
              <h2 className="text-sm font-semibold text-white tracking-wide">
                {editingItem ? 'Edit' : 'New'} {modalType.charAt(0).toUpperCase() + modalType.slice(1)}
              </h2>
              <button onClick={closeModal} className="text-blue-300 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          <div className="p-6 flex-1 overflow-auto">

            {modalType === 'job' && (
              <div className="space-y-2 text-sm">
                {/* ── Jim2-style compact header grid ── */}
                <div className="border rounded-lg overflow-visible text-xs bg-white shadow-sm">

                  {/* Row 1: Primary identifiers */}
                  <div className="flex divide-x border-b bg-gray-50/60">
                    {/* Job # */}
                    <div className="flex flex-col px-2.5 py-1.5" style={{minWidth:72}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Job #</span>
                      <span className="font-mono font-bold text-blue-700 text-sm">{editingItem?.id || 'NEW'}</span>
                    </div>
                    {/* Customer name */}
                    <div className="flex flex-col px-2.5 py-1.5 flex-1 relative" style={{minWidth:200}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Customer *</span>
                      <input type="text"
                        value={custDropdown.open ? custDropdown.query : jobForm.customer}
                        onChange={(e) => { setCustDropdown({ open: true, query: e.target.value, highlighted: 0 }); setJobForm({ ...jobForm, customer: e.target.value }); }}
                        onFocus={() => setCustDropdown({ open: true, query: jobForm.customer, highlighted: 0 })}
                        onBlur={() => setTimeout(() => setCustDropdown(s => ({ ...s, open: false })), 200)}
                        onKeyDown={(e) => {
                          const hits = customers.filter(c => { const q = custDropdown.query.toLowerCase(); return !q || c.name.toLowerCase().includes(q) || (c.id || '').toLowerCase().includes(q); }).slice(0, 8);
                          if (e.key === 'ArrowDown') { e.preventDefault(); setCustDropdown(s => ({ ...s, highlighted: Math.min(s.highlighted + 1, hits.length - 1) })); }
                          if (e.key === 'ArrowUp') { e.preventDefault(); setCustDropdown(s => ({ ...s, highlighted: Math.max(s.highlighted - 1, 0) })); }
                          if (e.key === 'Enter' && hits[custDropdown.highlighted]) { e.preventDefault(); setJobForm(f => ({ ...f, ...applyCustomerToJobForm(hits[custDropdown.highlighted]) })); setCustDropdown({ open: false, query: '', highlighted: 0 }); }
                          if (e.key === 'Escape') setCustDropdown({ open: false, query: '', highlighted: 0 });
                        }}
                        className="bg-transparent border-0 p-0 focus:outline-none font-medium text-gray-800 w-full text-xs placeholder-gray-300"
                        placeholder="Type to search…" autoComplete="off" required />
                      {custDropdown.open && (() => {
                        const q = custDropdown.query.toLowerCase();
                        const hits = customers.filter(c => !q || c.name.toLowerCase().includes(q) || (c.id||'').toLowerCase().includes(q)).slice(0, 8);
                        if (!hits.length) return null;
                        return (
                          <div className="absolute left-0 top-full mt-1 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden" style={{fontSize:12,minWidth:280}}>
                            <div className="px-3 py-1.5 text-xs text-gray-400 border-b bg-gray-50 flex items-center gap-1"><Search className="w-3 h-3" />{q ? `"${custDropdown.query}"` : 'All customers'}</div>
                            {hits.map((c, i) => (
                              <div key={c.id||c.name} onMouseDown={() => { setJobForm(f => ({ ...f, ...applyCustomerToJobForm(c) })); setCustDropdown({ open: false, query: '', highlighted: 0 }); }} onMouseEnter={() => setCustDropdown(s => ({ ...s, highlighted: i }))}
                                className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-b last:border-0 ${i === custDropdown.highlighted ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold text-[10px] flex items-center justify-center shrink-0">{c.name.charAt(0).toUpperCase()}</div>
                                <div className="flex-1 min-w-0"><div className="font-medium text-gray-800 truncate text-xs">{c.name}</div>{c.id && <div className="text-xs text-gray-400 font-mono">{c.id}</div>}</div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    {/* Cust ID */}
                    <div className="flex flex-col px-2.5 py-1.5" style={{minWidth:140}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Cust #</span>
                      <select value={jobForm.customerId} onChange={(e) => { const c = customers.find(c => c.id === e.target.value); setJobForm(f => c ? { ...f, ...applyCustomerToJobForm(c) } : { ...f, customerId: e.target.value }); }}
                        className="bg-transparent border-0 p-0 focus:outline-none text-xs text-gray-700 w-full">
                        <option value="">— select —</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.id} — {c.name}</option>)}
                      </select>
                    </div>
                    {/* Invoice # */}
                    <div className="flex flex-col px-2.5 py-1.5" style={{minWidth:110}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Invoice #</span>
                      <input value={jobForm.invoice || ''} onChange={e => setJobForm({...jobForm, invoice: e.target.value})} className="bg-transparent border-0 p-0 focus:outline-none text-xs text-gray-700 w-full font-mono" placeholder="INV-XXXX" />
                    </div>
                    {/* Quote Ref */}
                    <div className="flex flex-col px-2.5 py-1.5" style={{minWidth:90}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Quote Ref</span>
                      <input value={jobForm.quote || ''} onChange={e => setJobForm({...jobForm, quote: e.target.value})} className="bg-transparent border-0 p-0 focus:outline-none text-xs text-gray-700 w-full" placeholder="QT-XXXX" />
                    </div>
                  </div>

                  {/* Row 2: References */}
                  <div className="flex divide-x border-b">
                    <div className="flex flex-col px-2.5 py-1.5" style={{minWidth:130}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Cust Ref #</span>
                      <input value={jobForm.custRef || ''} onChange={e => setJobForm({...jobForm, custRef: e.target.value})} className="bg-transparent border-0 p-0 focus:outline-none text-xs text-gray-700 w-full" placeholder="Customer's ref" />
                    </div>
                    <div className="flex flex-col px-2.5 py-1.5" style={{minWidth:130}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Our Ref #</span>
                      <input value={jobForm.ourRef || ''} onChange={e => setJobForm({...jobForm, ourRef: e.target.value})} className="bg-transparent border-0 p-0 focus:outline-none text-xs text-gray-700 w-full" placeholder="Internal contact" />
                    </div>
                    {/* Ship To */}
                    <div className="flex flex-col px-2.5 py-1.5 relative" style={{minWidth:130}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Ship To</span>
                      <input type="text"
                        value={shipDropdown.open ? shipDropdown.query : (jobForm.shipTo || '')}
                        onChange={(e) => { setShipDropdown({ open: true, query: e.target.value, highlighted: 0 }); setJobForm({ ...jobForm, shipTo: e.target.value }); }}
                        onFocus={() => setShipDropdown({ open: true, query: jobForm.shipTo || '', highlighted: 0 })}
                        onBlur={() => setTimeout(() => setShipDropdown(s => ({ ...s, open: false })), 200)}
                        onKeyDown={(e) => {
                          const q = shipDropdown.query.toLowerCase();
                          const hits = cardFiles.filter(cf => !q || (cf.shipCode||'').toLowerCase().includes(q) || (cf.companyName||'').toLowerCase().includes(q)).slice(0, 8);
                          if (e.key === 'ArrowDown') { e.preventDefault(); setShipDropdown(s => ({ ...s, highlighted: Math.min(s.highlighted + 1, hits.length - 1) })); }
                          if (e.key === 'ArrowUp') { e.preventDefault(); setShipDropdown(s => ({ ...s, highlighted: Math.max(s.highlighted - 1, 0) })); }
                          if (e.key === 'Enter' && hits[shipDropdown.highlighted]) { e.preventDefault(); const cf = hits[shipDropdown.highlighted]; const fullAddr = [cf.address1, cf.address2, cf.suburb, cf.state, cf.postcode].filter(Boolean).join('\n'); setJobForm({ ...jobForm, shipTo: cf.shipCode, shippingAddress: fullAddr || jobForm.shippingAddress }); setShipDropdown({ open: false, query: '', highlighted: 0 }); }
                          if (e.key === 'Escape') setShipDropdown({ open: false, query: '', highlighted: 0 });
                        }}
                        className="bg-transparent border-0 p-0 focus:outline-none text-xs text-gray-700 w-full" placeholder="Code or address" autoComplete="off" />
                      {shipDropdown.open && (() => {
                        const q = shipDropdown.query.toLowerCase();
                        const hits = cardFiles.filter(cf => !q || (cf.shipCode||'').toLowerCase().includes(q) || (cf.companyName||'').toLowerCase().includes(q)).slice(0, 8);
                        if (!hits.length) return null;
                        return (
                          <div className="absolute left-0 top-full mt-1 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden" style={{fontSize:12,minWidth:260}}>
                            <div className="px-3 py-1.5 text-xs text-gray-400 border-b bg-gray-50 flex items-center gap-1"><Search className="w-3 h-3" />Card files</div>
                            {hits.map((cf, i) => { const addr = [cf.suburb, cf.state, cf.postcode].filter(Boolean).join(' '); return (
                              <div key={cf.shipCode} onMouseDown={() => { const fullAddr = [cf.address1, cf.address2, cf.suburb, cf.state, cf.postcode].filter(Boolean).join('\n'); setJobForm({ ...jobForm, shipTo: cf.shipCode, shippingAddress: fullAddr || jobForm.shippingAddress }); setShipDropdown({ open: false, query: '', highlighted: 0 }); }} onMouseEnter={() => setShipDropdown(s => ({ ...s, highlighted: i }))}
                                className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-b last:border-0 ${i === shipDropdown.highlighted ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                <div className="shrink-0 bg-green-100 text-green-700 text-[10px] font-bold font-mono px-1.5 py-0.5 rounded">{cf.shipCode}</div>
                                <div className="flex-1 min-w-0"><div className="font-medium text-gray-800 truncate text-xs">{cf.companyName||cf.shipCode}</div>{addr && <div className="text-xs text-gray-400 truncate">{addr}</div>}</div>
                              </div>
                            ); })}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="flex flex-col px-2.5 py-1.5 flex-1" style={{minWidth:160}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Description</span>
                      <input value={jobForm.description || ''} onChange={e => setJobForm({...jobForm, description: e.target.value})} className="bg-transparent border-0 p-0 focus:outline-none text-xs text-gray-700 w-full" placeholder="e.g. Ad-Hoc Sale" />
                    </div>
                    <div className="flex flex-col px-2.5 py-1.5" style={{minWidth:100}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Project #</span>
                      <input value={jobForm.projectNo || ''} onChange={e => setJobForm({...jobForm, projectNo: e.target.value})} className="bg-transparent border-0 p-0 focus:outline-none text-xs text-gray-700 w-full" />
                    </div>
                    <div className="flex flex-col px-2.5 py-1.5" style={{minWidth:90}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Branch</span>
                      <select value={jobForm.branch || 'HQ'} onChange={e => setJobForm({...jobForm, branch: e.target.value})} className="bg-transparent border-0 p-0 focus:outline-none text-xs text-gray-700 w-full">
                        {['HQ','Warehouse','Melbourne','Sydney','Brisbane','Perth'].map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    {/* Assigned To */}
                    <div className="flex flex-col px-2.5 py-1.5 relative" style={{minWidth:130}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Assigned To</span>
                      <input type="text"
                        value={assignedDropdown.open ? assignedDropdown.query : jobForm.assignedTo}
                        onChange={(e) => { setAssignedDropdown({ open: true, query: e.target.value, highlighted: 0 }); setJobForm({...jobForm, assignedTo: e.target.value}); }}
                        onFocus={() => setAssignedDropdown({ open: true, query: jobForm.assignedTo, highlighted: 0 })}
                        onBlur={() => setTimeout(() => setAssignedDropdown(s => ({ ...s, open: false })), 200)}
                        onKeyDown={(e) => {
                          const q = assignedDropdown.query.toLowerCase();
                          const names = [...new Set(jobs.map(j => j.assignedTo).filter(Boolean))];
                          const hits = names.filter(n => !q || n.toLowerCase().includes(q)).slice(0, 7);
                          if (e.key === 'ArrowDown') { e.preventDefault(); setAssignedDropdown(s => ({ ...s, highlighted: Math.min(s.highlighted + 1, hits.length - 1) })); }
                          if (e.key === 'ArrowUp') { e.preventDefault(); setAssignedDropdown(s => ({ ...s, highlighted: Math.max(s.highlighted - 1, 0) })); }
                          if (e.key === 'Enter' && hits[assignedDropdown.highlighted]) { e.preventDefault(); setJobForm({...jobForm, assignedTo: hits[assignedDropdown.highlighted]}); setAssignedDropdown({ open: false, query: '', highlighted: 0 }); }
                          if (e.key === 'Escape') setAssignedDropdown({ open: false, query: '', highlighted: 0 });
                        }}
                        className="bg-transparent border-0 p-0 focus:outline-none text-xs text-gray-700 w-full" placeholder="Type or pick…" autoComplete="off" />
                      {assignedDropdown.open && (() => {
                        const q = (assignedDropdown.query || '').toLowerCase();
                        const names = [...new Set(jobs.map(j => j.assignedTo).filter(Boolean))];
                        const hits = names.filter(n => !q || n.toLowerCase().includes(q)).slice(0, 7);
                        if (!hits.length) return null;
                        return (
                          <div className="absolute left-0 top-full mt-1 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden" style={{fontSize:12,minWidth:200}}>
                            <div className="px-3 py-1.5 text-xs text-gray-400 border-b bg-gray-50">Previous assignees</div>
                            {hits.map((name, i) => (
                              <div key={name} onMouseDown={() => { setJobForm({...jobForm, assignedTo: name}); setAssignedDropdown({ open: false, query: '', highlighted: 0 }); }} onMouseEnter={() => setAssignedDropdown(s => ({ ...s, highlighted: i }))}
                                className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-b last:border-0 ${i === assignedDropdown.highlighted ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[10px] flex items-center justify-center shrink-0">{name.charAt(0).toUpperCase()}</div>
                                <span className="text-xs text-gray-800">{name}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="flex flex-col px-2.5 py-1.5" style={{minWidth:100}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Serial #</span>
                      <input value={jobForm.serialNo || ''} onChange={e => setJobForm({...jobForm, serialNo: e.target.value})} className="bg-transparent border-0 p-0 focus:outline-none text-xs text-gray-700 w-full" />
                    </div>
                  </div>

                  {/* Row 3: Dates */}
                  <div className="flex divide-x border-b bg-gray-50/40">
                    {[
                      { label: 'Date In', key: 'dateIn' },
                      { label: 'Due Date', key: 'due' },
                      { label: 'Out Date', key: 'out' },
                      { label: 'Commitment', key: 'commitmentDate' },
                      { label: 'Valid Until', key: 'validityDate' },
                    ].map(({ label, key }) => (
                      <div key={key} className="flex flex-col px-2.5 py-1.5 flex-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{label}</span>
                        <input type="date" value={jobForm[key] || ''} onChange={e => setJobForm({...jobForm, [key]: e.target.value})}
                          className="bg-transparent border-0 p-0 focus:outline-none text-xs text-gray-700 w-full" />
                      </div>
                    ))}
                    <div className="flex flex-col px-2.5 py-1.5 flex-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Pay Method</span>
                      <select value={jobForm.paymentMethod} onChange={e => setJobForm({...jobForm, paymentMethod: e.target.value})} className="bg-transparent border-0 p-0 focus:outline-none text-xs text-gray-700 w-full">
                        <option>Account</option><option>Credit Card</option><option>Cash</option><option>Bank Transfer</option>
                      </select>
                    </div>
                  </div>

                  {/* Row 4: Status flags */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 border-b bg-white">
                    {/* Status */}
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Status</span>
                      <select value={jobForm.status} onChange={e => setJobForm({...jobForm, status: e.target.value})}
                        className="border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 font-semibold bg-white text-xs">
                        {['QUOTE','New','ORDER','In Progress','PROOF','PRINT','Pick/Pack','FINISH','INVOICE','PAID','CANCEL'].map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="w-px h-4 bg-gray-200" />
                    {/* Priority */}
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Priority</span>
                      <select value={jobForm.priority} onChange={e => setJobForm({...jobForm, priority: e.target.value})}
                        className={`border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 text-xs ${jobForm.priority === 'Urgent' ? 'bg-red-100 text-red-700 border-red-300' : jobForm.priority === 'High' ? 'bg-orange-100 text-orange-700 border-orange-300' : 'bg-white text-gray-700'}`}>
                        <option>Low</option><option>Normal</option><option>High</option><option>Urgent</option>
                      </select>
                    </div>
                    {/* Type */}
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Type</span>
                      <select value={jobForm.type} onChange={e => setJobForm({...jobForm, type: e.target.value})} className="border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white text-xs">
                        <option>Standard</option><option>Custom</option><option>Rush</option>
                      </select>
                    </div>
                    <div className="w-px h-4 bg-gray-200" />
                    {/* Paid */}
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Paid</span>
                      <select value={jobForm.paymentStatus || 'unpaid'} onChange={e => setJobForm({...jobForm, paymentStatus: e.target.value})}
                        className={`border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 text-xs font-semibold ${jobForm.paymentStatus === 'paid' ? 'bg-green-100 text-green-700 border-green-300' : jobForm.paymentStatus === 'partial' ? 'bg-yellow-100 text-yellow-700 border-yellow-300' : 'bg-red-50 text-red-600 border-red-200'}`}>
                        <option value="unpaid">Unpaid</option><option value="partial">Partial</option><option value="paid">Paid</option>
                      </select>
                    </div>
                    {/* Invoice status */}
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Invoice</span>
                      <select value={jobForm.invoiceStatus || 'not_invoiced'} onChange={e => setJobForm({...jobForm, invoiceStatus: e.target.value})}
                        className={`border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 text-xs font-medium ${jobForm.invoiceStatus === 'invoiced' ? 'bg-blue-100 text-blue-700 border-blue-300' : jobForm.invoiceStatus === 'to_invoice' ? 'bg-orange-100 text-orange-700 border-orange-300' : 'bg-gray-100 text-gray-500 border-gray-300'}`}>
                        <option value="not_invoiced">Not Invoiced</option><option value="to_invoice">To Invoice</option><option value="invoiced">Invoiced</option>
                      </select>
                    </div>
                    {/* Proof */}
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Proof</span>
                      <select value={jobForm.proofStatus || 'none'} onChange={e => setJobForm({...jobForm, proofStatus: e.target.value})}
                        className={`border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 text-xs font-medium ${jobForm.proofStatus === 'approved' ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : jobForm.proofStatus === 'sent' ? 'bg-blue-100 text-blue-700 border-blue-300' : jobForm.proofStatus === 'rejected' ? 'bg-red-100 text-red-700 border-red-300' : 'bg-gray-100 text-gray-500 border-gray-300'}`}>
                        <option value="none">No Proof</option><option value="sent">Sent</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
                      </select>
                    </div>
                    <div className="w-px h-4 bg-gray-200" />
                    {/* Lock */}
                    <button type="button" onClick={() => setJobForm(f => ({ ...f, locked: !f.locked }))}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold transition-colors ${jobForm.locked ? 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200' : 'bg-white text-gray-400 border-gray-300 hover:bg-gray-50'}`}>
                      {jobForm.locked ? '🔒 Locked' : '🔓 Unlocked'}
                    </button>
                  </div>

                  {/* Row 5: Notes + Shipping address + Credit warning */}
                  <div className="flex divide-x">
                    <div className="flex flex-col px-2.5 py-1.5 flex-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Job Notes</span>
                      <textarea value={jobForm.notes || ''} onChange={e => setJobForm({...jobForm, notes: e.target.value})}
                        className="bg-transparent border-0 p-0 focus:outline-none text-xs text-gray-700 w-full resize-none leading-relaxed" rows={2} placeholder="Special instructions, artwork notes…" />
                    </div>
                    <div className="flex flex-col px-2.5 py-1.5" style={{minWidth:220}}>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Shipping Address</span>
                      <textarea value={jobForm.shippingAddress || ''} onChange={e => setJobForm({...jobForm, shippingAddress: e.target.value})}
                        className="bg-transparent border-0 p-0 focus:outline-none text-xs text-gray-700 w-full resize-none leading-relaxed" rows={2} />
                    </div>
                    {(() => {
                      const fc = customers.find(c => c.id === jobForm.customerId);
                      if (!fc || !fc.creditLimit) return null;
                      const outstanding = jobs.filter(j => j.customerId === fc.id).reduce((s, j) => s + parseFloat(j.balanceDue || 0), 0);
                      const overLimit = outstanding > fc.creditLimit;
                      const util = Math.min(100, (outstanding / fc.creditLimit) * 100);
                      if (util < 80) return null;
                      return (
                        <div className={`flex items-center gap-2 px-3 py-2 text-xs ${overLimit ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'}`} style={{minWidth:200}}>
                          <span className="text-base">{overLimit ? '🚫' : '⚠️'}</span>
                          <div>
                            <div className="font-semibold">{overLimit ? 'Over Credit Limit' : 'Near Limit'}</div>
                            <div className="text-[10px]">${outstanding.toLocaleString('en-AU', {maximumFractionDigits:0})} / ${Number(fc.creditLimit).toLocaleString()} ({util.toFixed(0)}%)</div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                </div>
                {/* ── end compact header ── */}
                {/* ↓ Line Items follow immediately after compact header ↓ */}
                <div className="hidden">

                  {/* Column 1: Customer & Dates */}
                  <div className="space-y-2">
                    <div className="relative">
                      <label className="block font-medium text-gray-500 mb-0.5">Customer Name</label>
                      <input
                        type="text"
                        value={custDropdown.open ? custDropdown.query : jobForm.customer}
                        onChange={(e) => {
                          setCustDropdown({ open: true, query: e.target.value, highlighted: 0 });
                          setJobForm({ ...jobForm, customer: e.target.value });
                        }}
                        onFocus={() => setCustDropdown({ open: true, query: jobForm.customer, highlighted: 0 })}
                        onBlur={() => setTimeout(() => setCustDropdown(s => ({ ...s, open: false })), 200)}
                        onKeyDown={(e) => {
                          const hits = customers.filter(c => {
                            const q = custDropdown.query.toLowerCase();
                            return !q || c.name.toLowerCase().includes(q) || (c.id || '').toLowerCase().includes(q);
                          }).slice(0, 8);
                          if (e.key === 'ArrowDown') { e.preventDefault(); setCustDropdown(s => ({ ...s, highlighted: Math.min(s.highlighted + 1, hits.length - 1) })); }
                          if (e.key === 'ArrowUp') { e.preventDefault(); setCustDropdown(s => ({ ...s, highlighted: Math.max(s.highlighted - 1, 0) })); }
                          if (e.key === 'Enter' && hits[custDropdown.highlighted]) {
                            e.preventDefault();
                            const c = hits[custDropdown.highlighted];
                            setJobForm(f => ({ ...f, ...applyCustomerToJobForm(c) }));
                            setCustDropdown({ open: false, query: '', highlighted: 0 });
                          }
                          if (e.key === 'Escape') setCustDropdown({ open: false, query: '', highlighted: 0 });
                        }}
                        className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Type to search customers…"
                        autoComplete="off"
                        required
                      />
                      {custDropdown.open && (() => {
                        const q = custDropdown.query.toLowerCase();
                        const hits = customers.filter(c => !q || c.name.toLowerCase().includes(q) || (c.id || '').toLowerCase().includes(q)).slice(0, 8);
                        if (!hits.length) return null;
                        return (
                          <div className="absolute left-0 top-full mt-1 w-full bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden" style={{ fontSize: '13px', minWidth: 280 }}>
                            <div className="px-3 py-1.5 text-xs text-gray-400 border-b bg-gray-50 flex items-center gap-1">
                              <Search className="w-3 h-3" />{q ? `Customers matching "${custDropdown.query}"` : 'All customers'}
                            </div>
                            {hits.map((c, i) => (
                              <div
                                key={c.id || c.name}
                                onMouseDown={() => {
                                  setJobForm(f => ({ ...f, ...applyCustomerToJobForm(c) }));
                                  setCustDropdown({ open: false, query: '', highlighted: 0 });
                                }}
                                onMouseEnter={() => setCustDropdown(s => ({ ...s, highlighted: i }))}
                                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b last:border-0 ${i === custDropdown.highlighted ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                              >
                                <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center flex-shrink-0">
                                  {c.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-gray-800 truncate text-xs">{c.name}</div>
                                  {c.id && <div className="text-xs text-gray-400 font-mono">{c.id}</div>}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    <div>
                      <label className="block font-medium text-gray-500 mb-0.5">Customer ID</label>
                      <select
                        value={jobForm.customerId}
                        onChange={(e) => {
                          const c = customers.find(c => c.id === e.target.value);
                          setJobForm(f => c ? { ...f, ...applyCustomerToJobForm(c) } : { ...f, customerId: e.target.value });
                        }}
                        className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">Select Customer</option>
                        {customers.map(c => (
                          <option key={c.id} value={c.id}>{c.id} — {c.name}</option>
                        ))}
                      </select>
                    </div>
                    {(() => {
                      const fc = customers.find(c => c.id === jobForm.customerId);
                      if (!fc || !fc.creditLimit) return null;
                      const outstanding = jobs.filter(j => j.customerId === fc.id).reduce((s, j) => s + parseFloat(j.balanceDue || 0), 0);
                      const overLimit = outstanding > fc.creditLimit;
                      const util = Math.min(100, (outstanding / fc.creditLimit) * 100);
                      if (util < 80) return null;
                      return (
                        <div className={`rounded-lg px-3 py-2 text-sm flex items-start gap-2 ${overLimit ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-yellow-50 border border-yellow-200 text-yellow-700'}`}>
                          <span className="text-lg leading-tight">{overLimit ? '🚫' : '⚠️'}</span>
                          <div>
                            <span className="font-semibold">{overLimit ? 'Over Credit Limit' : 'Near Credit Limit'}</span>
                            <span className="ml-1">{fc.name} — ${outstanding.toLocaleString('en-AU', { maximumFractionDigits: 0 })} outstanding of ${Number(fc.creditLimit).toLocaleString()} limit ({util.toFixed(0)}% used)</span>
                          </div>
                        </div>
                      );
                    })()}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-medium text-gray-500 mb-0.5">Date In</label>
                        <input type="date" value={jobForm.dateIn} onChange={(e) => setJobForm({...jobForm, dateIn: e.target.value})}
                          className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block font-medium text-gray-500 mb-0.5">Due Date <span className="text-gray-400 font-normal text-xs">(auto from terms)</span></label>
                        <input type="date" value={jobForm.due} onChange={(e) => setJobForm({...jobForm, due: e.target.value})}
                          className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-medium text-gray-500 mb-0.5">Out Date</label>
                        <input type="date" value={jobForm.out || ''} onChange={(e) => setJobForm({...jobForm, out: e.target.value})}
                          className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block font-medium text-gray-500 mb-0.5">Commitment Date</label>
                        <input type="date" value={jobForm.commitmentDate || ''} onChange={(e) => setJobForm({...jobForm, commitmentDate: e.target.value})}
                          className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500" title="Promised delivery date" />
                      </div>
                    </div>
                  </div>

                  {/* Column 2: References & Assignment */}
                  <div className="space-y-2">
                    <div>
                      <label className="block font-medium text-gray-500 mb-0.5">Cust Ref #</label>
                      <input type="text" value={jobForm.custRef || ''} onChange={(e) => setJobForm({...jobForm, custRef: e.target.value})}
                        className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="Customer's own reference" />
                    </div>
                    <div>
                      <label className="block font-medium text-gray-500 mb-0.5">Our Ref #</label>
                      <input type="text" value={jobForm.ourRef || ''} onChange={(e) => setJobForm({...jobForm, ourRef: e.target.value})}
                        className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="Internal contact" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-medium text-gray-500 mb-0.5">Quote Ref</label>
                        <input type="text" value={jobForm.quote} onChange={(e) => setJobForm({...jobForm, quote: e.target.value})}
                          className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block font-medium text-gray-500 mb-0.5">Valid Until</label>
                        <input type="date" value={jobForm.validityDate || ''} onChange={(e) => setJobForm({...jobForm, validityDate: e.target.value})}
                          className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500" title="Quote expiry date" />
                      </div>
                    </div>
                    <div>
                      <label className="block font-medium text-gray-500 mb-0.5">Description</label>
                      <input type="text" value={jobForm.description || ''} onChange={(e) => setJobForm({...jobForm, description: e.target.value})}
                        className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="e.g. Ad-Hoc Sale" />
                    </div>
                    <div>
                      <label className="block font-medium text-gray-500 mb-0.5">Project #</label>
                      <input type="text" value={jobForm.projectNo || ''} onChange={(e) => setJobForm({...jobForm, projectNo: e.target.value})}
                        className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div className="relative">
                      <label className="block font-medium text-gray-500 mb-0.5">Assigned To</label>
                      <input
                        type="text"
                        value={assignedDropdown.open ? assignedDropdown.query : jobForm.assignedTo}
                        onChange={(e) => { setAssignedDropdown({ open: true, query: e.target.value, highlighted: 0 }); setJobForm({...jobForm, assignedTo: e.target.value}); }}
                        onFocus={() => setAssignedDropdown({ open: true, query: jobForm.assignedTo, highlighted: 0 })}
                        onBlur={() => setTimeout(() => setAssignedDropdown(s => ({ ...s, open: false })), 200)}
                        onKeyDown={(e) => {
                          const q = assignedDropdown.query.toLowerCase();
                          const names = [...new Set(jobs.map(j => j.assignedTo).filter(Boolean))];
                          const hits = names.filter(n => !q || n.toLowerCase().includes(q)).slice(0, 7);
                          if (e.key === 'ArrowDown') { e.preventDefault(); setAssignedDropdown(s => ({ ...s, highlighted: Math.min(s.highlighted + 1, hits.length - 1) })); }
                          if (e.key === 'ArrowUp') { e.preventDefault(); setAssignedDropdown(s => ({ ...s, highlighted: Math.max(s.highlighted - 1, 0) })); }
                          if (e.key === 'Enter' && hits[assignedDropdown.highlighted]) { e.preventDefault(); setJobForm({...jobForm, assignedTo: hits[assignedDropdown.highlighted]}); setAssignedDropdown({ open: false, query: '', highlighted: 0 }); }
                          if (e.key === 'Escape') setAssignedDropdown({ open: false, query: '', highlighted: 0 });
                        }}
                        className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Type or pick…"
                        autoComplete="off"
                      />
                      {assignedDropdown.open && (() => {
                        const q = (assignedDropdown.query || '').toLowerCase();
                        const names = [...new Set(jobs.map(j => j.assignedTo).filter(Boolean))];
                        const hits = names.filter(n => !q || n.toLowerCase().includes(q)).slice(0, 7);
                        if (!hits.length) return null;
                        return (
                          <div className="absolute left-0 top-full mt-1 w-full bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden" style={{ fontSize: '13px', minWidth: 200 }}>
                            <div className="px-3 py-1.5 text-xs text-gray-400 border-b bg-gray-50">Previous assignees</div>
                            {hits.map((name, i) => (
                              <div key={name}
                                onMouseDown={() => { setJobForm({...jobForm, assignedTo: name}); setAssignedDropdown({ open: false, query: '', highlighted: 0 }); }}
                                onMouseEnter={() => setAssignedDropdown(s => ({ ...s, highlighted: i }))}
                                className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-b last:border-0 ${i === assignedDropdown.highlighted ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center flex-shrink-0">{name.charAt(0).toUpperCase()}</div>
                                <span className="text-gray-800 text-xs">{name}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Column 3: Shipping & Notes */}
                  <div className="space-y-2">
                    <div className="relative">
                      <label className="block font-medium text-gray-500 mb-0.5">Ship To</label>
                      <input
                        type="text"
                        value={shipDropdown.open ? shipDropdown.query : (jobForm.shipTo || '')}
                        onChange={(e) => {
                          setShipDropdown({ open: true, query: e.target.value, highlighted: 0 });
                          setJobForm({ ...jobForm, shipTo: e.target.value });
                        }}
                        onFocus={() => setShipDropdown({ open: true, query: jobForm.shipTo || '', highlighted: 0 })}
                        onBlur={() => setTimeout(() => setShipDropdown(s => ({ ...s, open: false })), 200)}
                        onKeyDown={(e) => {
                          const q = shipDropdown.query.toLowerCase();
                          const hits = cardFiles.filter(cf => !q || (cf.shipCode || '').toLowerCase().includes(q) || (cf.companyName || '').toLowerCase().includes(q)).slice(0, 8);
                          if (e.key === 'ArrowDown') { e.preventDefault(); setShipDropdown(s => ({ ...s, highlighted: Math.min(s.highlighted + 1, hits.length - 1) })); }
                          if (e.key === 'ArrowUp') { e.preventDefault(); setShipDropdown(s => ({ ...s, highlighted: Math.max(s.highlighted - 1, 0) })); }
                          if (e.key === 'Enter' && hits[shipDropdown.highlighted]) {
                            e.preventDefault();
                            const cf = hits[shipDropdown.highlighted];
                            const addr = [cf.address1, cf.address2, cf.suburb, cf.state, cf.postcode].filter(Boolean).join('\n');
                            setJobForm({ ...jobForm, shipTo: cf.shipCode, shippingAddress: addr || jobForm.shippingAddress });
                            setShipDropdown({ open: false, query: '', highlighted: 0 });
                          }
                          if (e.key === 'Escape') setShipDropdown({ open: false, query: '', highlighted: 0 });
                        }}
                        className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Ship-to code or address"
                        autoComplete="off"
                      />
                      {shipDropdown.open && (() => {
                        const q = shipDropdown.query.toLowerCase();
                        const hits = cardFiles.filter(cf => !q || (cf.shipCode || '').toLowerCase().includes(q) || (cf.companyName || '').toLowerCase().includes(q)).slice(0, 8);
                        if (!hits.length) return null;
                        return (
                          <div className="absolute left-0 top-full mt-1 w-full bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden" style={{ fontSize: '13px', minWidth: 280 }}>
                            <div className="px-3 py-1.5 text-xs text-gray-400 border-b bg-gray-50 flex items-center gap-1">
                              <Search className="w-3 h-3" />{q ? `Ship codes matching "${shipDropdown.query}"` : 'Card file addresses'}
                            </div>
                            {hits.map((cf, i) => {
                              const addr = [cf.suburb, cf.state, cf.postcode].filter(Boolean).join(' ');
                              return (
                                <div
                                  key={cf.shipCode}
                                  onMouseDown={() => {
                                    const fullAddr = [cf.address1, cf.address2, cf.suburb, cf.state, cf.postcode].filter(Boolean).join('\n');
                                    setJobForm({ ...jobForm, shipTo: cf.shipCode, shippingAddress: fullAddr || jobForm.shippingAddress });
                                    setShipDropdown({ open: false, query: '', highlighted: 0 });
                                  }}
                                  onMouseEnter={() => setShipDropdown(s => ({ ...s, highlighted: i }))}
                                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer border-b last:border-0 ${i === shipDropdown.highlighted ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                >
                                  <div className="flex-shrink-0 bg-green-100 text-green-700 text-xs font-bold font-mono px-2 py-0.5 rounded">
                                    {cf.shipCode}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-gray-800 truncate text-xs">{cf.companyName || cf.shipCode}</div>
                                    {addr && <div className="text-xs text-gray-400 truncate">{addr}</div>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                    <div>
                      <label className="block font-medium text-gray-500 mb-0.5">Shipping Address</label>
                      <textarea
                        value={jobForm.shippingAddress}
                        onChange={(e) => setJobForm({...jobForm, shippingAddress: e.target.value})}
                        className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        rows="3"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-gray-500 mb-0.5">Job Notes</label>
                      <textarea
                        value={jobForm.notes || ''}
                        onChange={(e) => setJobForm({...jobForm, notes: e.target.value})}
                        className="w-full border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        rows="3"
                        placeholder="Special instructions, artwork notes..."
                      />
                    </div>
                  </div>

                </div>


              {/* Line Items */}
              <div className="border rounded-lg bg-gray-50 flex flex-col" style={{ height: lineItemsHeight, minHeight: 120 }}>
                <div className="px-3 py-2 flex-1" style={{ minHeight: 0, overflowY: 'visible', overflowX: 'auto' }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className="font-semibold text-gray-700 text-sm">Line Items <span className="text-xs text-gray-400 font-normal">(right-click for options)</span></h3>
                    <div className="flex items-center gap-1 flex-wrap">
                      <div className="relative">
                        <button type="button" onClick={() => setTemplateModalOpen(true)}
                          className="text-xs bg-white text-slate-600 border border-slate-300 px-2 py-1 rounded hover:bg-slate-50 flex items-center gap-1">
                          <BookOpen className="w-3 h-3" />Load
                        </button>
                        {templateModalOpen && (
                          <div className="absolute left-0 top-full mt-1 w-72 bg-white rounded-lg shadow-xl border z-50 p-3" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-semibold text-gray-700">Job Templates</span>
                              <button onClick={() => setTemplateModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                            </div>
                            {jobTemplates.length === 0 ? (
                              <p className="text-xs text-gray-400 text-center py-3">No templates saved yet.</p>
                            ) : (
                              <div className="space-y-1 max-h-48 overflow-y-auto">
                                {jobTemplates.map(tpl => (
                                  <div key={tpl.id} className="flex items-center justify-between gap-2 p-2 rounded hover:bg-gray-50 group">
                                    <button type="button" onMouseDown={() => loadJobTemplate(tpl)} className="flex-1 text-left text-sm text-gray-700 hover:text-blue-600 font-medium truncate">
                                      {tpl.name} <span className="text-xs text-gray-400 font-normal">({tpl.items?.length || 0} items)</span>
                                    </button>
                                    <button type="button" onMouseDown={() => deleteJobTemplate(tpl.id)} className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="relative">
                        <button type="button" onClick={() => setTemplateSaveOpen(o => !o)}
                          className="text-xs bg-white text-slate-600 border border-slate-300 px-2 py-1 rounded hover:bg-slate-50 flex items-center gap-1">
                          <Save className="w-3 h-3" />Save
                        </button>
                        {templateSaveOpen && (
                          <div className="absolute left-0 top-full mt-1 w-60 bg-white rounded-lg shadow-xl border z-50 p-3" onClick={e => e.stopPropagation()}>
                            <p className="text-xs font-semibold text-gray-600 mb-1.5">Template name</p>
                            <input autoFocus type="text" value={templateSaveName}
                              onChange={e => setTemplateSaveName(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter' && templateSaveName.trim()) saveJobTemplate(templateSaveName.trim()); if (e.key === 'Escape') setTemplateSaveOpen(false); }}
                              className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 mb-2" placeholder="e.g. Standard Polo Order" />
                            <div className="flex gap-2">
                              <button type="button" onMouseDown={() => { if (templateSaveName.trim()) saveJobTemplate(templateSaveName.trim()); }}
                                className="flex-1 bg-green-600 text-white text-xs py-1.5 rounded hover:bg-green-700 font-medium" disabled={!templateSaveName.trim()}>Save</button>
                              <button type="button" onMouseDown={() => setTemplateSaveOpen(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                            </div>
                          </div>
                        )}
                      </div>
                      <button type="button" onClick={() => setJobForm(f => ({ ...f, items: [...f.items, { ...blankItem(), displayType: 'note' }] }))}
                        className="text-xs bg-white text-slate-600 border border-slate-300 px-2 py-1 rounded hover:bg-slate-50">+ Note</button>
                      <button type="button" onClick={addJobItem}
                        className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 flex items-center gap-0.5">
                        <Plus className="w-3 h-3" />Add Item
                      </button>
                      <button type="button"
                        onClick={() => setJobForm(f => recalcJobTotals({ ...f, items: [...f.items, { ...blankItem(), displayType: 'product', description: 'Freight', stockCode: 'FREIGHT', priceEx: 0, priceInc: 0, qty: 1, order: 1 }] }))}
                        className="text-xs bg-white text-slate-600 border border-slate-300 px-2 py-1 rounded hover:bg-slate-50">+ Freight</button>
                      <button type="button"
                        onClick={() => {
                          const freightItem = jobForm.items.find(i => (i.stockCode || '').toUpperCase() === 'FREIGHT' || (i.description || '').toLowerCase().includes('freight'));
                          const freightAmt = freightItem ? parseFloat(freightItem.priceEx || freightItem.total || 0) : 0;
                          const levy = freightAmt > 0 ? Math.round(freightAmt * 0.13 * 100) / 100 : 0;
                          setJobForm(f => recalcJobTotals({ ...f, items: [...f.items, { ...blankItem(), displayType: 'product', description: 'Fuel Levy', stockCode: 'FUEL-LEVY', priceEx: levy, priceInc: levy * 1.1, qty: 1, order: 1 }] }));
                        }}
                        className="text-xs bg-white text-slate-600 border border-slate-300 px-2 py-1 rounded hover:bg-slate-50">+ Fuel Levy</button>
                    </div>
                  </div>

                  {jobForm.items.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">No items yet. Click "Add Item" to begin.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="line-items-table border-collapse" style={{ tableLayout: 'fixed', width: '100%', minWidth: 820, fontSize: 12 }}>
                        <thead>
                          <tr className="bg-gray-100 border-b-2 border-gray-300 text-gray-500 select-none">
                            <th className="px-1 py-1 text-center text-[11px] font-semibold border-r border-gray-200" style={{ width: 26 }}>#</th>
                            {[
                              { key: 'stock', label: 'Stock Code', align: 'left' },
                              { key: 'desc', label: 'Description', align: 'left' },
                              { key: 'order', label: 'Ord', align: 'right' },
                              { key: 'supply', label: 'Sup', align: 'right' },
                              { key: 'bord', label: 'B.Ord', align: 'right', color: 'text-orange-500' },
                              { key: 'priceEx', label: 'Price Ex', align: 'right' },
                              { key: 'priceInc', label: 'Price Inc', align: 'right' },
                              { key: 'margin', label: 'M%', align: 'right', color: 'text-green-600' },
                              { key: 'total', label: 'Total', align: 'right', color: 'text-gray-700' },
                              { key: 'hide', label: 'H', align: 'center' },
                            ].map(col => (
                              <th key={col.key} className={`text-${col.align} px-1 py-1 text-[11px] font-semibold relative border-r border-gray-200 ${col.color || 'text-gray-500'}`} style={{ width: colWidths[col.key] }}>
                                {col.label}
                                <div onMouseDown={(e) => startColResize(col.key, e)} className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10" />
                              </th>
                            ))}
                            <th style={{ width: 24 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {jobForm.items.map((item, idx) => {
                            const isSec = item.displayType === 'section';
                            const isNote = item.displayType === 'note';
                            const invItem = item.stockCode ? inventory.find(i => i.sku === item.stockCode) : null;
                            const isOutOfStock = !isSec && !isNote && invItem != null && invItem.stock <= 0;
                            const isLowMargin = !isSec && !isNote && item.priceEx > 0 && item.purchasePrice > 0 && (item.marginPercent || 0) < 15;
                            const decOpt = DEC_OPTIONS.find(o => o.v === (item.decorationType || 'None')) || DEC_OPTIONS[0];
                            const hasDecoration = !isSec && !isNote && item.decorationType && item.decorationType !== 'None';

                            const rowBg = isSec ? 'bg-blue-50' : isNote ? 'bg-yellow-50'
                              : isOutOfStock ? 'bg-orange-50' : isLowMargin ? 'bg-red-50'
                              : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50';
                            const borderLeft = isSec ? 'border-l-2 border-l-blue-400' : isNote ? 'border-l-2 border-l-yellow-300'
                              : isOutOfStock ? 'border-l-2 border-l-orange-400' : isLowMargin ? 'border-l-2 border-l-red-400' : '';

                            const ci = 'w-full h-6 border border-gray-200 rounded px-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white';
                            const ciR = ci + ' text-right tabular-nums';

                            const dIsOpen = descDropdown.idx === idx;
                            const dq = dIsOpen ? descDropdown.query : (item.description || '');
                            const skuIsOpen = skuDropdown.idx === idx;
                            const skuQ = skuIsOpen ? skuDropdown.query : (item.stockCode || '');

                            const invSearch = (term) => inventory.map(inv => {
                              const sku = inv.sku.toLowerCase(); const name = (inv.name || '').toLowerCase(); const t = term.toLowerCase();
                              if (!t) return { inv, score: 1 };
                              if (name === t) return { inv, score: 100 };
                              if (name.startsWith(t)) return { inv, score: 80 };
                              if (sku === t) return { inv, score: 75 };
                              if (sku.startsWith(t)) return { inv, score: 70 };
                              if (name.includes(t)) return { inv, score: 50 };
                              if (sku.includes(t)) return { inv, score: 40 };
                              return { inv, score: 0 };
                            }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);

                            const dScored = dIsOpen ? invSearch(descDropdown.query) : [];
                            const skuScored = skuIsOpen ? inventory.map(inv => {
                              const sku = inv.sku.toLowerCase(); const name = (inv.name || '').toLowerCase(); const term = skuQ.toLowerCase();
                              if (!term) return { inv, score: 1 };
                              if (sku === term) return { inv, score: 100 };
                              if (sku.startsWith(term)) return { inv, score: 80 };
                              if (sku.includes(term)) return { inv, score: 60 };
                              if (name.includes(term)) return { inv, score: 30 };
                              return { inv, score: 0 };
                            }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 8) : [];

                            const hl = (text, term) => { if (!term) return text; const i = (text || '').toLowerCase().indexOf(term.toLowerCase()); if (i === -1) return text; return <>{text.slice(0, i)}<strong className="text-gray-900">{text.slice(i, i + term.length)}</strong>{text.slice(i + term.length)}</>; };

                            const selectInvItem = (inv) => {
                              setJobForm(f => {
                                const items = [...f.items];
                                const cost = parseFloat(inv.unitCost || 0);
                                const priceEx = parseFloat(inv.unitPrice || inv.unitCost || 0);
                                const priceInc = parseFloat((priceEx * 1.1).toFixed(2));
                                const margin = cost > 0 ? parseFloat((priceEx - cost).toFixed(2)) : 0;
                                const marginPercent = priceEx > 0 && cost > 0 ? parseFloat(((priceEx - cost) / priceEx * 100).toFixed(1)) : 0;
                                items[idx] = { ...items[idx], stockCode: inv.sku, description: inv.name, purchasePrice: cost, priceEx, priceInc, margin, marginPercent, total: parseFloat((priceEx * (parseFloat(items[idx].order) || 0)).toFixed(2)) };
                                return recalcJobTotals({ ...f, items });
                              });
                              setDescDropdown({ idx: -1, query: '', highlighted: 0 });
                              setSkuDropdown({ idx: -1, query: '', highlighted: 0 });
                            };

                            return (
                              <React.Fragment key={idx}>
                                <tr
                                  className={`border-b border-gray-100 hover:bg-blue-50/30 ${rowBg} ${borderLeft} ${ctxMenu.rowIdx === idx && ctxMenu.visible ? 'ring-1 ring-inset ring-blue-300' : ''}`}
                                  onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ visible: true, x: e.clientX, y: e.clientY, rowIdx: idx }); }}
                                >
                                  <td className="px-1 py-0.5 text-center text-[10px] text-gray-400 select-none border-r border-gray-100" style={{ width: 26 }}>
                                    <span className={isSec ? 'text-blue-500 font-bold' : isNote ? 'text-yellow-600' : ''}>{isSec ? '§' : isNote ? '¶' : idx + 1}</span>
                                  </td>

                                  {isSec || isNote ? (
                                    <td colSpan={11} className="px-2 py-0.5">
                                      <input type="text" value={item.description || ''} onChange={e => updateJobItem(idx, 'description', e.target.value)}
                                        className={`w-full bg-transparent text-xs h-6 focus:outline-none border-b border-transparent focus:border-current px-0 ${isSec ? 'font-bold text-blue-800' : 'italic text-yellow-700'}`}
                                        placeholder={isSec ? 'Section heading…' : 'Note or instruction…'} />
                                    </td>
                                  ) : (<>
                                    {/* Stock Code */}
                                    <td className="px-0.5 py-0.5 relative border-r border-gray-100" style={{ width: colWidths.stock }}>
                                      <input type="text" value={skuQ}
                                        onChange={e => { setSkuDropdown(s => ({ ...s, idx, query: e.target.value, highlighted: 0 })); updateJobItem(idx, 'stockCode', e.target.value); }}
                                        onFocus={(e) => { const r = e.target.getBoundingClientRect(); setSkuDropdown({ idx, query: item.stockCode || '', highlighted: 0, rect: r }); }}
                                        onBlur={() => setTimeout(() => setSkuDropdown({ idx: -1, query: '', highlighted: 0, rect: null }), 200)}
                                        onKeyDown={e => {
                                          if (!skuIsOpen) return;
                                          if (e.key === 'ArrowDown') { e.preventDefault(); setSkuDropdown(s => ({ ...s, highlighted: Math.min(s.highlighted + 1, skuScored.length - 1) })); }
                                          if (e.key === 'ArrowUp') { e.preventDefault(); setSkuDropdown(s => ({ ...s, highlighted: Math.max(s.highlighted - 1, 0) })); }
                                          if (e.key === 'Enter' && skuScored[skuDropdown.highlighted]) { e.preventDefault(); selectInvItem(skuScored[skuDropdown.highlighted].inv); }
                                          if (e.key === 'Escape') setSkuDropdown({ idx: -1, query: '', highlighted: 0 });
                                        }}
                                        className={ci + ' font-mono'} placeholder="SKU…" autoComplete="off" />
                                      {skuIsOpen && skuDropdown.rect && (
                                        <div className="bg-white rounded-xl shadow-2xl border border-gray-200" style={{ position: 'fixed', zIndex: 99999, minWidth: 380, left: skuDropdown.rect.left, top: skuDropdown.rect.top - 4, transform: 'translateY(-100%)' }}>
                                          <div className="px-3 py-1.5 text-xs text-gray-500 border-b bg-gray-50 flex items-center gap-1.5"><Search className="w-3 h-3" />{skuQ ? `SKU: "${skuQ}"` : 'Browse by SKU'}</div>
                                          {skuScored.length === 0 ? <div className="px-4 py-4 text-xs text-gray-400 text-center">No matches</div>
                                            : skuScored.map(({ inv }, i) => (
                                              <div key={inv.sku} onMouseDown={() => selectInvItem(inv)} onMouseEnter={() => setSkuDropdown(s => ({ ...s, highlighted: i }))}
                                                className={`flex items-center gap-3 px-3 py-2 cursor-pointer border-b last:border-0 ${i === skuDropdown.highlighted ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                                <div className="flex-1 min-w-0">
                                                  <div className="font-mono font-bold text-blue-700 text-xs">{hl(inv.sku, skuQ)}</div>
                                                  <div className="text-gray-500 text-xs truncate">{inv.name}</div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                  <div className={`text-xs font-semibold ${(inv.stock || 0) === 0 ? 'text-red-500' : 'text-green-600'}`}>{(inv.stock || 0) === 0 ? 'Out' : inv.stock}</div>
                                                  {inv.unitPrice > 0 && <div className="text-gray-400 text-xs">${inv.unitPrice.toFixed(2)}</div>}
                                                </div>
                                              </div>
                                            ))}
                                        </div>
                                      )}
                                    </td>

                                    {/* Description + Sizes */}
                                    <td className="px-0.5 py-0.5 border-r border-gray-100" style={{ width: colWidths.desc }}>
                                      <input type="text" value={dq}
                                        onChange={e => { setDescDropdown(s => ({ ...s, idx, query: e.target.value, highlighted: 0 })); updateJobItem(idx, 'description', e.target.value); }}
                                        onFocus={(e) => { const r = e.target.getBoundingClientRect(); setDescDropdown({ idx, query: item.description || '', highlighted: 0, rect: r }); }}
                                        onBlur={() => setTimeout(() => setDescDropdown({ idx: -1, query: '', highlighted: 0, rect: null }), 200)}
                                        onKeyDown={e => {
                                          if (!dIsOpen) return;
                                          if (e.key === 'ArrowDown') { e.preventDefault(); setDescDropdown(s => ({ ...s, highlighted: Math.min(s.highlighted + 1, dScored.length - 1) })); }
                                          if (e.key === 'ArrowUp') { e.preventDefault(); setDescDropdown(s => ({ ...s, highlighted: Math.max(s.highlighted - 1, 0) })); }
                                          if (e.key === 'Enter' && dScored[descDropdown.highlighted]) { e.preventDefault(); selectInvItem(dScored[descDropdown.highlighted].inv); }
                                          if (e.key === 'Escape') setDescDropdown({ idx: -1, query: '', highlighted: 0 });
                                        }}
                                        className={ci} placeholder="Description…" autoComplete="off" />
                                      {dIsOpen && descDropdown.rect && dScored.length > 0 && (
                                        <div className="bg-white rounded-xl shadow-2xl border border-gray-200" style={{ position: 'fixed', zIndex: 99999, minWidth: 420, left: descDropdown.rect.left, top: descDropdown.rect.top - 4, transform: 'translateY(-100%)' }}>
                                          <div className="px-3 py-1.5 text-xs text-gray-500 border-b bg-gray-50 flex items-center gap-1.5"><Search className="w-3 h-3" />{dq ? `"${dq}"` : 'All items'}</div>
                                          {dScored.map(({ inv }, i) => (
                                            <div key={inv.sku} onMouseDown={() => selectInvItem(inv)} onMouseEnter={() => setDescDropdown(s => ({ ...s, highlighted: i }))}
                                              className={`flex items-center gap-3 px-3 py-2 cursor-pointer border-b last:border-0 ${i === descDropdown.highlighted ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                              <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-gray-900 text-xs">{hl(inv.name || '', dq)}</div>
                                                <div className="font-mono text-blue-600 text-xs">{inv.sku}{inv.category && <span className="text-gray-400 ml-1.5">· {inv.category}</span>}</div>
                                              </div>
                                              <div className="text-right shrink-0">
                                                <div className={`text-xs font-semibold ${(inv.stock || 0) === 0 ? 'text-red-500' : 'text-green-600'}`}>{(inv.stock || 0) === 0 ? 'Out' : `${inv.stock}`}</div>
                                                {inv.unitPrice > 0 && <div className="text-gray-400 text-xs">${inv.unitPrice.toFixed(2)}</div>}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      <div className="flex items-center gap-0.5 mt-0.5">
                                        <input type="text" value={item.sizes || ''} onChange={e => updateJobItem(idx, 'sizes', e.target.value)}
                                          className="flex-1 h-5 border border-gray-100 rounded px-1 text-[10px] text-gray-400 placeholder-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
                                          placeholder="Sizes…" />
                                        <button type="button" onClick={() => setMatrixPopup({ idx })} title="Size/colour matrix"
                                          className="shrink-0 h-5 w-5 flex items-center justify-center border border-indigo-200 text-indigo-500 rounded hover:bg-indigo-50 text-[10px] font-bold leading-none">⊞</button>
                                      </div>
                                    </td>

                                    {/* Order */}
                                    <td className="px-0.5 py-0.5 border-r border-gray-100" style={{ width: colWidths.order }}>
                                      <input type="number" value={item.order || ''} onChange={e => updateJobItem(idx, 'order', e.target.value)} className={ciR} min="0" />
                                    </td>

                                    {/* Supply */}
                                    <td className="px-0.5 py-0.5 border-r border-gray-100" style={{ width: colWidths.supply }}>
                                      <input type="number" value={isOutOfStock ? 0 : (item.supply || '')} onChange={e => updateJobItem(idx, 'supply', e.target.value)}
                                        className={`${ciR} ${isOutOfStock ? 'bg-gray-100 text-gray-400 pointer-events-none' : ''}`}
                                        min="0" readOnly={isOutOfStock} title={invItem != null ? `${invItem.stock} on hand` : ''} />
                                    </td>

                                    {/* B.Ord */}
                                    <td className="px-0.5 py-0.5 border-r border-gray-100" style={{ width: colWidths.bord }}>
                                      <input type="number" value={item.bOrd || ''} onChange={e => updateJobItem(idx, 'bOrd', e.target.value)}
                                        className={`${ciR} ${item.bOrd > 0 ? 'text-orange-600 font-semibold border-orange-300 bg-orange-50' : ''}`}
                                        min="0" placeholder="0" />
                                    </td>

                                    {/* Price Ex */}
                                    <td className="px-0.5 py-0.5 border-r border-gray-100" style={{ width: colWidths.priceEx }}>
                                      <input type="number" step="0.01" value={item.priceEx || ''} onChange={e => updateJobItem(idx, 'priceEx', e.target.value)} className={`${ciR} font-medium`} min="0" />
                                    </td>

                                    {/* Price Inc */}
                                    <td className="px-0.5 py-0.5 border-r border-gray-100" style={{ width: colWidths.priceInc }}>
                                      <input type="number" step="0.01" value={item.priceInc || ''} onChange={e => updateJobItem(idx, 'priceInc', e.target.value)} className={ciR} min="0" />
                                    </td>

                                    {/* Margin % */}
                                    <td className="px-1 py-0.5 text-right border-r border-gray-100" style={{ width: colWidths.margin }}
                                      title={isLowMargin ? `Low margin: ${(item.marginPercent || 0).toFixed(1)}% < 15%` : ''}>
                                      <span className={`text-[11px] font-semibold ${isLowMargin ? 'text-red-600' : item.marginPercent > 0 ? 'text-green-600' : item.marginPercent < 0 ? 'text-red-500' : 'text-gray-300'}`}>
                                        {item.priceEx > 0 && item.purchasePrice > 0 ? `${isLowMargin ? '⚠' : ''}${(item.marginPercent || 0).toFixed(0)}%` : '—'}
                                      </span>
                                    </td>

                                    {/* Total */}
                                    <td className="px-1 py-0.5 text-right font-bold text-[11px] text-gray-800 border-r border-gray-100 tabular-nums" style={{ width: colWidths.total }}>
                                      ${(parseFloat(item.total) || 0).toFixed(2)}
                                    </td>

                                    {/* Hide */}
                                    <td className="px-0.5 py-0.5 text-center border-r border-gray-100" style={{ width: colWidths.hide }}>
                                      <input type="checkbox" className="w-3 h-3 accent-blue-600 cursor-pointer" checked={item.hide || false} onChange={e => updateJobItem(idx, 'hide', e.target.checked)} title="Hide from customer documents" />
                                    </td>
                                  </>)}

                                  <td className="px-0.5 py-0.5 text-center" style={{ width: 24 }}>
                                    <button type="button" onClick={() => removeJobItem(idx)} className="text-red-200 hover:text-red-500 transition-colors">
                                      <X className="w-3 h-3" />
                                    </button>
                                  </td>
                                </tr>

                                {/* Decoration sub-row */}
                                {hasDecoration && (
                                  <tr className={`border-b border-gray-100 ${decOpt.v === 'EMB' ? 'bg-purple-50/50' : decOpt.v === 'TRS' || decOpt.v === 'SP' ? 'bg-orange-50/50' : decOpt.v === 'DTF' ? 'bg-cyan-50/50' : decOpt.v === 'SCR' ? 'bg-rose-50/50' : 'bg-gray-50/50'}`}>
                                    <td className="text-center text-[10px] text-gray-300 select-none border-r border-gray-100" style={{ width: 26 }}>↳</td>
                                    <td colSpan={10} className="px-2 py-0.5">
                                      <div className="flex items-center gap-2 relative">
                                        <button type="button" onClick={() => setOpenDecIdx(openDecIdx === idx ? null : idx)}
                                          className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold ${decOpt.pill}`}>
                                          {decOpt.emoji} {decOpt.l} <ChevronDown className="w-2.5 h-2.5 opacity-40" />
                                        </button>
                                        {openDecIdx === idx && (
                                          <>
                                            <div className="fixed inset-0 z-40" onClick={() => setOpenDecIdx(null)} />
                                            <div className="absolute left-0 top-full mt-0.5 z-50 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden" style={{ minWidth: 148 }}>
                                              {DEC_OPTIONS.map(opt => (
                                                <button key={opt.v} type="button"
                                                  onMouseDown={() => { updateJobItem(idx, 'decorationType', opt.v); setOpenDecIdx(null); }}
                                                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-gray-50 ${opt.v === (item.decorationType || 'None') ? 'font-semibold bg-gray-50' : 'text-gray-700'}`}>
                                                  <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dot}`} /> {opt.emoji} {opt.l}
                                                </button>
                                              ))}
                                            </div>
                                          </>
                                        )}
                                        {decOpt.v === 'EMB' && (
                                          <input type="text" value={item.embCode || ''} onChange={e => updateJobItem(idx, 'embCode', e.target.value)}
                                            className="h-5 border border-purple-200 rounded px-1.5 text-[11px] font-mono text-purple-700 focus:outline-none focus:ring-1 focus:ring-purple-400 w-44 bg-white" placeholder="EMB code…" />
                                        )}
                                        {(decOpt.v === 'TRS' || decOpt.v === 'SP') && (
                                          <input type="text" value={item.trsCode || ''} onChange={e => updateJobItem(idx, 'trsCode', e.target.value)}
                                            className="h-5 border border-orange-200 rounded px-1.5 text-[11px] font-mono text-orange-700 focus:outline-none focus:ring-1 focus:ring-orange-400 w-44 bg-white" placeholder="TRS/SP code…" />
                                        )}
                                      </div>
                                    </td>
                                    <td style={{ width: 24 }}></td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {jobForm.items.length > 0 && (() => {
                    const productItems = jobForm.items.filter(i => i.displayType !== 'section' && i.displayType !== 'note');
                    const totalCost = productItems.reduce((s, i) => s + ((parseFloat(i.purchasePrice) || 0) * (parseFloat(i.order) || 0)), 0);
                    const grossMargin = (jobForm.subtotal || 0) - totalCost;
                    const marginPct = jobForm.subtotal > 0 ? (grossMargin / jobForm.subtotal * 100) : 0;
                    const marginColor = marginPct >= 30 ? 'text-green-600' : marginPct >= 15 ? 'text-yellow-600' : 'text-red-500';
                    return (
                      <div className="mt-2 pt-2 border-t flex justify-between items-start gap-4">
                        {totalCost > 0 && (
                          <div className={`flex-1 rounded-lg p-2.5 text-xs border ${marginPct < 0 ? 'bg-red-50 border-red-200' : marginPct < 15 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-1">
                                {marginPct < 0 && <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                                <span className="font-semibold text-gray-600">Profitability</span>
                              </div>
                              <span className={`font-bold text-sm ${marginColor}`}>{marginPct.toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1.5 mb-1 overflow-hidden">
                              {marginPct >= 0
                                ? <div className={`h-1.5 rounded-full ${marginPct >= 30 ? 'bg-green-500' : marginPct >= 15 ? 'bg-yellow-400' : 'bg-red-500'}`} style={{ width: `${Math.min(100, marginPct)}%` }} />
                                : <div className="h-1.5 w-full bg-red-500 rounded-full animate-pulse" />
                              }
                            </div>
                            <div className="flex justify-between text-gray-500">
                              <span>Cost: ${totalCost.toFixed(2)}</span>
                              <span className={marginColor}>Profit: ${grossMargin.toFixed(2)}</span>
                            </div>
                          </div>
                        )}
                        <div className="w-56 space-y-0.5 text-xs flex-shrink-0">
                          {totalCost > 0 && <div className="flex justify-between text-gray-400"><span>Total Cost:</span><span>${totalCost.toFixed(2)}</span></div>}
                          {totalCost > 0 && (
                            <div className={`flex justify-between font-medium ${grossMargin >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              <span>Gross Margin:</span><span>${grossMargin.toFixed(2)} ({marginPct.toFixed(1)}%)</span>
                            </div>
                          )}
                          <div className="flex justify-between text-gray-600 border-t pt-0.5">
                            <span>Subtotal (ex GST):</span><span>${(jobForm.subtotal || 0).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-gray-600">
                            <span>GST (10%):</span><span>${(jobForm.tax || 0).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between font-bold text-sm border-t pt-0.5">
                            <span>Total (inc GST):</span><span>${(jobForm.total || 0).toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                {/* Drag handle */}
                <div
                  onMouseDown={startLineItemsResize}
                  className="h-2 flex items-center justify-center cursor-ns-resize rounded-b-lg bg-gray-100 hover:bg-blue-100 group border-t border-gray-200 flex-shrink-0"
                  title="Drag to resize"
                >
                  <div className="w-8 h-0.5 bg-gray-300 group-hover:bg-blue-400 rounded-full" />
                </div>
              </div>

              {apiError && (
                <div className="mt-2 flex items-center justify-between bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">
                  <span>{apiError}</span>
                  <button onClick={() => setApiError('')} className="ml-3 text-red-400 hover:text-red-600 text-sm font-bold">✕</button>
                </div>
              )}
              <div className="flex justify-end space-x-2 pt-4 border-t">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 border rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveJob}
                  disabled={!jobForm.customerId}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Job
                </button>
              </div>
            </div>
            )}

            {modalType === 'inventory' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                    <input
                      type="text"
                      value={inventoryForm.sku}
                      onChange={(e) => setInventoryForm({...inventoryForm, sku: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={editingItem !== null}
                      required
                    />
                  </div>

                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <input
                      type="text"
                      value={categoryDropdown.open ? categoryDropdown.query : inventoryForm.category}
                      onChange={(e) => { setCategoryDropdown({ open: true, query: e.target.value, highlighted: 0 }); setInventoryForm({...inventoryForm, category: e.target.value}); }}
                      onFocus={() => setCategoryDropdown({ open: true, query: inventoryForm.category, highlighted: 0 })}
                      onBlur={() => setTimeout(() => setCategoryDropdown(s => ({ ...s, open: false })), 200)}
                      onKeyDown={(e) => {
                        const q = (categoryDropdown.query || '').toLowerCase();
                        const cats = [...new Set(inventory.map(i => i.category).filter(Boolean))];
                        const hits = cats.filter(c => !q || c.toLowerCase().includes(q)).slice(0, 8);
                        if (e.key === 'ArrowDown') { e.preventDefault(); setCategoryDropdown(s => ({ ...s, highlighted: Math.min(s.highlighted + 1, hits.length - 1) })); }
                        if (e.key === 'ArrowUp') { e.preventDefault(); setCategoryDropdown(s => ({ ...s, highlighted: Math.max(s.highlighted - 1, 0) })); }
                        if (e.key === 'Enter' && hits[categoryDropdown.highlighted]) { e.preventDefault(); setInventoryForm({...inventoryForm, category: hits[categoryDropdown.highlighted]}); setCategoryDropdown({ open: false, query: '', highlighted: 0 }); }
                        if (e.key === 'Escape') setCategoryDropdown({ open: false, query: '', highlighted: 0 });
                      }}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. Apparel, Accessories…"
                      autoComplete="off"
                    />
                    {categoryDropdown.open && (() => {
                      const q = (categoryDropdown.query || '').toLowerCase();
                      const cats = [...new Set(inventory.map(i => i.category).filter(Boolean))];
                      const hits = cats.filter(c => !q || c.toLowerCase().includes(q)).slice(0, 8);
                      if (!hits.length) return null;
                      return (
                        <div className="absolute left-0 top-full mt-1 w-full bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden" style={{ fontSize: '13px' }}>
                          <div className="px-3 py-1.5 text-xs text-gray-400 border-b bg-gray-50">Existing categories</div>
                          {hits.map((cat, i) => {
                            const count = inventory.filter(inv => inv.category === cat).length;
                            return (
                              <div key={cat}
                                onMouseDown={() => { setInventoryForm({...inventoryForm, category: cat}); setCategoryDropdown({ open: false, query: '', highlighted: 0 }); }}
                                onMouseEnter={() => setCategoryDropdown(s => ({ ...s, highlighted: i }))}
                                className={`flex items-center justify-between px-3 py-2.5 cursor-pointer border-b last:border-0 ${i === categoryDropdown.highlighted ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                <span className="text-gray-800 font-medium">{cat}</span>
                                <span className="text-xs text-gray-400">{count} item{count !== 1 ? 's' : ''}</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Item Name</label>
                    <input
                      type="text"
                      value={inventoryForm.name}
                      onChange={(e) => setInventoryForm({...inventoryForm, name: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Stock Quantity</label>
                    <input
                      type="number"
                      value={inventoryForm.stock}
                      onChange={(e) => setInventoryForm({...inventoryForm, stock: parseInt(e.target.value) || 0})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Level</label>
                    <input
                      type="number"
                      value={inventoryForm.reorderLevel}
                      onChange={(e) => setInventoryForm({...inventoryForm, reorderLevel: parseInt(e.target.value) || 0})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="0"
                    />
                  </div>

                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                    <input
                      type="text"
                      value={locationDropdown.open ? locationDropdown.query : inventoryForm.location}
                      onChange={(e) => { setLocationDropdown({ open: true, query: e.target.value, highlighted: 0 }); setInventoryForm({...inventoryForm, location: e.target.value}); }}
                      onFocus={() => setLocationDropdown({ open: true, query: inventoryForm.location, highlighted: 0 })}
                      onBlur={() => setTimeout(() => setLocationDropdown(s => ({ ...s, open: false })), 200)}
                      onKeyDown={(e) => {
                        const q = (locationDropdown.query || '').toLowerCase();
                        const locs = [...new Set(inventory.map(i => i.location).filter(Boolean))].sort();
                        const hits = locs.filter(l => !q || l.toLowerCase().includes(q)).slice(0, 8);
                        if (e.key === 'ArrowDown') { e.preventDefault(); setLocationDropdown(s => ({ ...s, highlighted: Math.min(s.highlighted + 1, hits.length - 1) })); }
                        if (e.key === 'ArrowUp') { e.preventDefault(); setLocationDropdown(s => ({ ...s, highlighted: Math.max(s.highlighted - 1, 0) })); }
                        if (e.key === 'Enter' && hits[locationDropdown.highlighted]) { e.preventDefault(); setInventoryForm({...inventoryForm, location: hits[locationDropdown.highlighted]}); setLocationDropdown({ open: false, query: '', highlighted: 0 }); }
                        if (e.key === 'Escape') setLocationDropdown({ open: false, query: '', highlighted: 0 });
                      }}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., A-15-3"
                      autoComplete="off"
                    />
                    {locationDropdown.open && (() => {
                      const q = (locationDropdown.query || '').toLowerCase();
                      const locs = [...new Set(inventory.map(i => i.location).filter(Boolean))].sort();
                      const hits = locs.filter(l => !q || l.toLowerCase().includes(q)).slice(0, 8);
                      if (!hits.length) return null;
                      return (
                        <div className="absolute left-0 top-full mt-1 w-full bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden" style={{ fontSize: '13px' }}>
                          <div className="px-3 py-1.5 text-xs text-gray-400 border-b bg-gray-50">Existing bin locations</div>
                          {hits.map((loc, i) => {
                            const occupant = inventory.find(inv => inv.location === loc);
                            return (
                              <div key={loc}
                                onMouseDown={() => { setInventoryForm({...inventoryForm, location: loc}); setLocationDropdown({ open: false, query: '', highlighted: 0 }); }}
                                onMouseEnter={() => setLocationDropdown(s => ({ ...s, highlighted: i }))}
                                className={`flex items-center justify-between px-3 py-2.5 cursor-pointer border-b last:border-0 ${i === locationDropdown.highlighted ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                <span className="font-mono font-bold text-gray-700">{loc}</span>
                                {occupant && <span className="text-xs text-gray-400 truncate max-w-[140px]">{occupant.name}</span>}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                    <select
                      value={inventoryForm.supplierCode}
                      onChange={(e) => {
                        const selectedSupplier = suppliers.find(s => s.code === e.target.value);
                        setInventoryForm({
                          ...inventoryForm, 
                          supplierCode: e.target.value,
                          supplier: selectedSupplier?.name || ''
                        });
                      }}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select Supplier</option>
                      {suppliers.map(s => (
                        <option key={s.code} value={s.code}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Unit Cost ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={inventoryForm.unitCost}
                      onChange={(e) => setInventoryForm({...inventoryForm, unitCost: parseFloat(e.target.value) || 0})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={inventoryForm.unitPrice}
                      onChange={(e) => setInventoryForm({...inventoryForm, unitPrice: parseFloat(e.target.value) || 0})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Order Qty</label>
                    <input
                      type="number"
                      value={inventoryForm.minOrder}
                      onChange={(e) => setInventoryForm({...inventoryForm, minOrder: parseInt(e.target.value) || 1})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="1"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Lead Time (days)</label>
                    <input
                      type="number"
                      value={inventoryForm.leadTime}
                      onChange={(e) => setInventoryForm({...inventoryForm, leadTime: parseInt(e.target.value) || 7})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="1"
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-4 border-t">
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 border rounded hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveInventoryItem}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Item
                  </button>
                </div>
              </div>
            )}

            {modalType === 'customer' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
                    <input
                      type="text"
                      value={customerForm.name}
                      onChange={(e) => setCustomerForm({...customerForm, name: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Account Type</label>
                    <select
                      value={customerForm.accountType || 'Account'}
                      onChange={(e) => setCustomerForm({...customerForm, accountType: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Account">Account</option>
                      <option value="Cash">Cash</option>
                      <option value="Prepaid">Prepaid</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
                    <input
                      type="text"
                      value={customerForm.contact}
                      onChange={(e) => setCustomerForm({...customerForm, contact: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={customerForm.email}
                      onChange={(e) => setCustomerForm({...customerForm, email: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={customerForm.phone}
                      onChange={(e) => setCustomerForm({...customerForm, phone: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mobile</label>
                    <input
                      type="tel"
                      value={customerForm.mobile}
                      onChange={(e) => setCustomerForm({...customerForm, mobile: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                    <textarea
                      value={customerForm.address}
                      onChange={(e) => setCustomerForm({...customerForm, address: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows="2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ABN</label>
                    <input
                      type="text"
                      value={customerForm.abn}
                      onChange={(e) => setCustomerForm({...customerForm, abn: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms</label>
                    <select
                      value={customerForm.paymentTerms}
                      onChange={(e) => setCustomerForm({...customerForm, paymentTerms: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Net 7">Net 7</option>
                      <option value="Net 14">Net 14</option>
                      <option value="Net 30">Net 30</option>
                      <option value="Net 45">Net 45</option>
                      <option value="COD">COD</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Credit Limit ($)</label>
                    <input
                      type="number"
                      step="1000"
                      value={customerForm.creditLimit}
                      onChange={(e) => setCustomerForm({...customerForm, creditLimit: parseFloat(e.target.value) || 0})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Account Manager</label>
                    <input
                      type="text"
                      value={customerForm.accountManager}
                      onChange={(e) => setCustomerForm({...customerForm, accountManager: e.target.value})}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-4 border-t">
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 border rounded hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveCustomer}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Customer
                  </button>
                </div>
              </div>
            )}

            {modalType === 'supplier' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Code</label>
                    <input type="text" value={supplierForm.code} onChange={e => setSupplierForm({...supplierForm, code: e.target.value})} disabled={!!editingItem} className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50" placeholder="e.g. SUP001" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Name</label>
                    <input type="text" value={supplierForm.name} onChange={e => setSupplierForm({...supplierForm, name: e.target.value})} className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
                    <input type="text" value={supplierForm.contact} onChange={e => setSupplierForm({...supplierForm, contact: e.target.value})} className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input type="email" value={supplierForm.email} onChange={e => setSupplierForm({...supplierForm, email: e.target.value})} className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input type="tel" value={supplierForm.phone} onChange={e => setSupplierForm({...supplierForm, phone: e.target.value})} className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms</label>
                    <select value={supplierForm.paymentTerms} onChange={e => setSupplierForm({...supplierForm, paymentTerms: e.target.value})} className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {['Net 7','Net 14','Net 30','Net 45','Net 60','COD'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                    <select value={supplierForm.currency} onChange={e => setSupplierForm({...supplierForm, currency: e.target.value})} className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {['AUD','USD','EUR','GBP','CNY'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select value={supplierForm.status} onChange={e => setSupplierForm({...supplierForm, status: e.target.value})} className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                    <textarea value={supplierForm.address} onChange={e => setSupplierForm({...supplierForm, address: e.target.value})} className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" rows="2" />
                  </div>
                </div>
                <div className="flex justify-end space-x-2 pt-4 border-t">
                  <button onClick={closeModal} className="px-4 py-2 border rounded hover:bg-gray-50">Cancel</button>
                  <button onClick={saveSupplier} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center">
                    <Save className="w-4 h-4 mr-2" />Save Supplier
                  </button>
                </div>
              </div>
            )}

            {modalType === 'po' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                    <input
                      type="text"
                      value={supplierDropdown.open ? supplierDropdown.query : (poForm.supplier || '')}
                      onChange={(e) => { setSupplierDropdown({ open: true, query: e.target.value, highlighted: 0 }); setPoForm({...poForm, supplier: e.target.value, supplierCode: ''}); }}
                      onFocus={() => setSupplierDropdown({ open: true, query: poForm.supplier || '', highlighted: 0 })}
                      onBlur={() => setTimeout(() => setSupplierDropdown(s => ({ ...s, open: false })), 200)}
                      onKeyDown={(e) => {
                        const q = supplierDropdown.query.toLowerCase();
                        const hits = suppliers.filter(s => !q || s.name.toLowerCase().includes(q) || (s.code || '').toLowerCase().includes(q)).slice(0, 8);
                        if (e.key === 'ArrowDown') { e.preventDefault(); setSupplierDropdown(s => ({ ...s, highlighted: Math.min(s.highlighted + 1, hits.length - 1) })); }
                        if (e.key === 'ArrowUp') { e.preventDefault(); setSupplierDropdown(s => ({ ...s, highlighted: Math.max(s.highlighted - 1, 0) })); }
                        if (e.key === 'Enter' && hits[supplierDropdown.highlighted]) {
                          e.preventDefault();
                          const s = hits[supplierDropdown.highlighted];
                          setPoForm({...poForm, supplierCode: s.code, supplier: s.name});
                          setSupplierDropdown({ open: false, query: '', highlighted: 0 });
                        }
                        if (e.key === 'Escape') setSupplierDropdown({ open: false, query: '', highlighted: 0 });
                      }}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Type to search suppliers…"
                      autoComplete="off"
                    />
                    {supplierDropdown.open && (() => {
                      const q = supplierDropdown.query.toLowerCase();
                      const hits = suppliers.filter(s => !q || s.name.toLowerCase().includes(q) || (s.code || '').toLowerCase().includes(q)).slice(0, 8);
                      if (!hits.length) return null;
                      return (
                        <div className="absolute left-0 top-full mt-1 w-full bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden" style={{ fontSize: '13px', minWidth: 300 }}>
                          <div className="px-3 py-1.5 text-xs text-gray-400 border-b bg-gray-50 flex items-center gap-1">
                            <Search className="w-3 h-3" />{q ? `Matching "${supplierDropdown.query}"` : 'All suppliers'}
                          </div>
                          {hits.map((s, i) => (
                            <div
                              key={s.code}
                              onMouseDown={() => { setPoForm({...poForm, supplierCode: s.code, supplier: s.name}); setSupplierDropdown({ open: false, query: '', highlighted: 0 }); }}
                              onMouseEnter={() => setSupplierDropdown(st => ({ ...st, highlighted: i }))}
                              className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b last:border-0 ${i === supplierDropdown.highlighted ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                            >
                              <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 font-bold text-xs flex items-center justify-center flex-shrink-0">
                                {s.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-gray-800 truncate">{s.name}</div>
                                {s.code && <div className="text-xs text-gray-400 font-mono">{s.code}</div>}
                              </div>
                              {s.contactName && <div className="text-xs text-gray-500 truncate max-w-[100px]">{s.contactName}</div>}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Order Date</label>
                    <input type="date" value={poForm.date} onChange={e => setPoForm({...poForm, date: e.target.value})} className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Expected Delivery</label>
                    <input type="date" value={poForm.expectedDate} onChange={e => setPoForm({...poForm, expectedDate: e.target.value})} className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea value={poForm.notes} onChange={e => setPoForm({...poForm, notes: e.target.value})} className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" rows="2" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-gray-700">Line Items</h3>
                    <button type="button" onClick={() => setPoForm({...poForm, items: [...poForm.items, {sku:'',description:'',quantity:1,unitCost:0,total:0}]})} className="text-sm text-blue-600 hover:underline flex items-center">
                      <Plus className="w-3 h-3 mr-1" />Add Item
                    </button>
                  </div>
                  {poForm.items.length === 0 && <p className="text-sm text-gray-400 text-center py-4 border rounded">No items added yet.</p>}
                  {poForm.items.map((item, idx) => {
                    const poIsOpen = poSkuDropdown.idx === idx;
                    const poQ = poIsOpen ? poSkuDropdown.query : (item.sku || '');
                    const poScored = inventory.map(inv => {
                      const sku = inv.sku.toLowerCase(); const name = (inv.name||'').toLowerCase(); const term = poQ.toLowerCase();
                      if (!term) return { inv, score: 1 };
                      if (sku === term) return { inv, score: 100 };
                      if (sku.startsWith(term)) return { inv, score: 80 };
                      if (sku.includes(term)) return { inv, score: 60 };
                      if (name.startsWith(term)) return { inv, score: 50 };
                      if (name.includes(term)) return { inv, score: 30 };
                      return { inv, score: 0 };
                    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);
                    const selectPoItem = (inv) => {
                      const items = [...poForm.items];
                      items[idx] = { ...items[idx], sku: inv.sku, description: inv.name, unitCost: inv.unitCost || 0, total: (items[idx].quantity || 1) * (inv.unitCost || 0) };
                      setPoForm({ ...poForm, items });
                      setPoSkuDropdown({ idx: -1, query: '', highlighted: 0 });
                    };
                    return (
                    <div key={idx} className="grid grid-cols-12 gap-2 mb-2 items-center">
                      <div className="col-span-2 relative">
                        <input type="text" placeholder="SKU" value={poQ}
                          onChange={e => { setPoSkuDropdown({ idx, query: e.target.value, highlighted: 0 }); const items=[...poForm.items]; items[idx]={...items[idx],sku:e.target.value}; setPoForm({...poForm,items}); }}
                          onFocus={() => setPoSkuDropdown({ idx, query: item.sku || '', highlighted: 0 })}
                          onBlur={() => setTimeout(() => setPoSkuDropdown({ idx: -1, query: '', highlighted: 0 }), 200)}
                          onKeyDown={e => {
                            if (!poIsOpen) return;
                            if (e.key === 'ArrowDown') { e.preventDefault(); setPoSkuDropdown(s => ({ ...s, highlighted: Math.min(s.highlighted + 1, poScored.length - 1) })); }
                            if (e.key === 'ArrowUp') { e.preventDefault(); setPoSkuDropdown(s => ({ ...s, highlighted: Math.max(s.highlighted - 1, 0) })); }
                            if (e.key === 'Enter' && poScored[poSkuDropdown.highlighted]) { e.preventDefault(); selectPoItem(poScored[poSkuDropdown.highlighted].inv); }
                            if (e.key === 'Escape') setPoSkuDropdown({ idx: -1, query: '', highlighted: 0 });
                          }}
                          className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                          autoComplete="off"
                        />
                        {poIsOpen && poScored.length > 0 && (
                          <div className="absolute left-0 top-full mt-1 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden" style={{ fontSize: '12px' }}>
                            {poScored.map(({ inv }, i) => (
                              <div key={inv.sku} onMouseDown={() => selectPoItem(inv)} onMouseEnter={() => setPoSkuDropdown(s => ({ ...s, highlighted: i }))}
                                className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-b last:border-0 ${i === poSkuDropdown.highlighted ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                <span className="font-mono font-bold text-blue-700 w-20 flex-shrink-0 truncate">{inv.sku}</span>
                                <span className="flex-1 text-gray-600 truncate">{inv.name}</span>
                                {inv.unitCost > 0 && <span className="text-gray-400 flex-shrink-0">${inv.unitCost.toFixed(2)}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <input type="text" placeholder="Description" value={item.description} onChange={e => { const items=[...poForm.items]; items[idx]={...items[idx],description:e.target.value}; setPoForm({...poForm,items}); }} className="col-span-4 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <input type="number" placeholder="Qty" value={item.quantity} min="1" onChange={e => { const items=[...poForm.items]; const qty=parseInt(e.target.value)||0; items[idx]={...items[idx],quantity:qty,total:qty*items[idx].unitCost}; setPoForm({...poForm,items}); }} className="col-span-2 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <input type="number" placeholder="Unit Cost" step="0.01" value={item.unitCost} min="0" onChange={e => { const items=[...poForm.items]; const cost=parseFloat(e.target.value)||0; items[idx]={...items[idx],unitCost:cost,total:items[idx].quantity*cost}; setPoForm({...poForm,items}); }} className="col-span-2 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <span className="col-span-1 text-sm text-right font-medium">${(item.total||0).toFixed(2)}</span>
                      <button type="button" onClick={() => { const items=poForm.items.filter((_,i)=>i!==idx); setPoForm({...poForm,items}); }} className="col-span-1 text-red-400 hover:text-red-600 flex justify-center"><X className="w-4 h-4" /></button>
                    </div>
                    );
                  })}
                  {poForm.items.length > 0 && (
                    <div className="text-right text-sm font-semibold pt-2 border-t">
                      Total: ${poForm.items.reduce((s,i)=>s+(i.total||0),0).toFixed(2)}
                    </div>
                  )}
                </div>
                <div className="flex justify-end space-x-2 pt-4 border-t">
                  <button onClick={closeModal} className="px-4 py-2 border rounded hover:bg-gray-50">Cancel</button>
                  <button onClick={savePO} disabled={!poForm.supplierCode} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center">
                    <Save className="w-4 h-4 mr-2" />Create PO
                  </button>
                </div>
              </div>
            )}
          </div>
          </div>
      </DraggableModal>
    );
  };

  const renderConfirmModal = () => {
    if (!confirmModal.show) return null;
    return (
      <DraggableModal onClose={() => setConfirmModal({ show: false, message: '', onConfirm: null })} cardClass="max-w-sm w-full p-6">
          <div className="flex items-start space-x-3 mb-4">
            <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-gray-800">{confirmModal.message}</p>
          </div>
          <div className="flex justify-end space-x-2">
            <button
              onClick={() => setConfirmModal({ show: false, message: '', onConfirm: null })}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={confirmModal.onConfirm}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Delete
            </button>
          </div>
      </DraggableModal>
    );
  };

  const renderPaymentModal = () => {
    if (!paymentModal.show) return null;
    return (
      <DraggableModal onClose={() => setPaymentModal({ show: false, jobId: null, maxAmount: 0, amount: '', method: 'Credit Card' })} cardClass="max-w-sm w-full p-6">
          <div className="flex items-center justify-between mb-4 cursor-move select-none">
            <h3 className="text-lg font-bold">Record Payment</h3>
            <button onClick={() => setPaymentModal({ show: false, jobId: null, maxAmount: 0, amount: '', method: 'Credit Card' })}>
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={paymentModal.maxAmount}
                value={paymentModal.amount}
                onChange={(e) => setPaymentModal({ ...paymentModal, amount: e.target.value })}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-1">Balance due: ${paymentModal.maxAmount.toFixed(2)}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
              <select
                value={paymentModal.method}
                onChange={(e) => setPaymentModal({ ...paymentModal, method: e.target.value })}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option>Credit Card</option>
                <option>Cash</option>
                <option>Bank Transfer</option>
                <option>Account</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end space-x-2 mt-4 pt-4 border-t">
            <button
              onClick={() => setPaymentModal({ show: false, jobId: null, maxAmount: 0, amount: '', method: 'Credit Card' })}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const amount = parseFloat(paymentModal.amount);
                if (amount > 0) recordPayment(paymentModal.jobId, amount, paymentModal.method);
                setPaymentModal({ show: false, jobId: null, maxAmount: 0, amount: '', method: 'Credit Card' });
              }}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center"
            >
              <CreditCard className="w-4 h-4 mr-2" />
              Confirm Payment
            </button>
          </div>
      </DraggableModal>
    );
  };

  const renderStockAdjustModal = () => {
    if (!stockAdjustModal.show) return null;
    const adj = parseInt(stockAdjustModal.adjustment) || 0;
    const newStock = Math.max(0, stockAdjustModal.currentStock + adj);
    return (
      <DraggableModal onClose={() => setStockAdjustModal({ show: false, sku: '', name: '', currentStock: 0, adjustment: '', reason: '' })} cardClass="max-w-sm w-full p-6">
          <div className="flex items-center justify-between mb-4 cursor-move select-none">
            <h3 className="text-lg font-bold">Adjust Stock</h3>
            <button onClick={() => setStockAdjustModal({ show: false, sku: '', name: '', currentStock: 0, adjustment: '', reason: '' })}>
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          <p className="text-sm text-gray-600 mb-4">{stockAdjustModal.name}</p>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Adjustment (+/-)</label>
              <input
                type="number"
                value={stockAdjustModal.adjustment}
                onChange={(e) => setStockAdjustModal({ ...stockAdjustModal, adjustment: e.target.value })}
                placeholder="e.g. +10 or -5"
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-1">
                Current: {stockAdjustModal.currentStock} → New: <span className={newStock < stockAdjustModal.currentStock ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>{newStock}</span>
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <input
                type="text"
                value={stockAdjustModal.reason}
                onChange={(e) => setStockAdjustModal({ ...stockAdjustModal, reason: e.target.value })}
                placeholder="e.g. Stocktake, Damaged goods..."
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex justify-end space-x-2 mt-4 pt-4 border-t">
            <button
              onClick={() => setStockAdjustModal({ show: false, sku: '', name: '', currentStock: 0, adjustment: '', reason: '' })}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (adj !== 0) adjustStock(stockAdjustModal.sku, adj, stockAdjustModal.reason || 'Manual adjustment');
                setStockAdjustModal({ show: false, sku: '', name: '', currentStock: 0, adjustment: '', reason: '' });
              }}
              disabled={adj === 0}
              className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              <Box className="w-4 h-4 mr-2" />
              Apply Adjustment
            </button>
          </div>
      </DraggableModal>
    );
  };

  // ── Dispatch Modal ──────────────────────────────────────────────────────────
  const renderDispatchModal = () => {
    if (!dispatchModal.open) return null;
    const close = () => setDispatchModal(m => ({ ...m, open: false }));
    const submit = async () => {
      if (!dispatchModal.shipVia || !dispatchModal.shipRef) return setDispatchModal(m => ({ ...m, error: 'Ship Via and Reference are required.' }));
      setDispatchModal(m => ({ ...m, loading: true, error: '' }));
      try {
        const updated = await api.jobs.dispatch(dispatchModal.job.id, { shipVia: dispatchModal.shipVia, shipRef: dispatchModal.shipRef, cartons: dispatchModal.cartons, notes: dispatchModal.notes, advanceStatus: dispatchModal.advanceStatus });
        queryClient.invalidateQueries({ queryKey: ['jobs'] });
        if (activeJob?.id === updated.id) setActiveJob(updated);
        close();
      } catch (e) { setDispatchModal(m => ({ ...m, loading: false, error: e.message })); }
    };
    return (
      <DraggableModal onClose={close} cardClass="w-[480px] p-6">
        <div className="flex items-center justify-between mb-4 cursor-move select-none">
          <h3 className="text-lg font-bold flex items-center gap-2"><Box className="w-5 h-5 text-blue-600" />Dispatch Job #{dispatchModal.job?.id}</h3>
          <button onClick={close}><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        {dispatchModal.error && <p className="text-sm text-red-600 mb-3 bg-red-50 px-3 py-2 rounded">{dispatchModal.error}</p>}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Ship Via *</label>
              <input value={dispatchModal.shipVia} onChange={e => setDispatchModal(m => ({ ...m, shipVia: e.target.value }))} placeholder="e.g. StarTrack, Australia Post" className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Ship Reference *</label>
              <input value={dispatchModal.shipRef} onChange={e => setDispatchModal(m => ({ ...m, shipRef: e.target.value }))} placeholder="Tracking number" className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">No. of Cartons</label>
            <input type="number" min="1" value={dispatchModal.cartons} onChange={e => setDispatchModal(m => ({ ...m, cartons: parseInt(e.target.value) || 1 }))} className="w-32 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <input value={dispatchModal.notes} onChange={e => setDispatchModal(m => ({ ...m, notes: e.target.value }))} placeholder="Optional notes" className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {dispatchModal.job?.status === 'FINISH' && (
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={dispatchModal.advanceStatus} onChange={e => setDispatchModal(m => ({ ...m, advanceStatus: e.target.checked }))} />
              Advance status to INVOICE after dispatch
            </label>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5 pt-4 border-t">
          <button onClick={close} className="px-4 py-2 border rounded hover:bg-gray-50 text-sm">Cancel</button>
          <button onClick={submit} disabled={dispatchModal.loading} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm disabled:opacity-50 flex items-center gap-2">
            <Truck className="w-4 h-4" />{dispatchModal.loading ? 'Dispatching...' : 'Confirm Dispatch'}
          </button>
        </div>
      </DraggableModal>
    );
  };

  // ── Unprint Modal ────────────────────────────────────────────────────────────
  const renderUnprintModal = () => {
    if (!unprintModal.open) return null;
    const close = () => setUnprintModal(m => ({ ...m, open: false }));
    const confirm = async () => {
      setUnprintModal(m => ({ ...m, loading: true, error: '' }));
      try {
        const updated = await api.jobs.unprint(unprintModal.job.id);
        queryClient.invalidateQueries({ queryKey: ['jobs'] });
        if (activeJob?.id === updated.id) setActiveJob(updated);
        close();
      } catch (e) { setUnprintModal(m => ({ ...m, loading: false, error: e.message })); }
    };
    return (
      <DraggableModal onClose={close} cardClass="w-[420px] p-6">
        <div className="flex items-center justify-between mb-4 cursor-move select-none">
          <h3 className="text-lg font-bold flex items-center gap-2"><Printer className="w-5 h-5 text-orange-600" />Unprint Job #{unprintModal.job?.id}</h3>
          <button onClick={close}><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <p className="text-sm text-gray-700 mb-2">This will revert the job from <span className="font-semibold text-orange-600">{unprintModal.job?.status}</span> back to <span className="font-semibold text-blue-600">FINISH</span>.</p>
        <p className="text-xs text-gray-500 mb-4">An internal comment will be added recording this action. Use this to recall and re-issue an invoice.</p>
        {unprintModal.error && <p className="text-sm text-red-600 mb-3 bg-red-50 px-3 py-2 rounded">{unprintModal.error}</p>}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <button onClick={close} className="px-4 py-2 border rounded hover:bg-gray-50 text-sm">Cancel</button>
          <button onClick={confirm} disabled={unprintModal.loading} className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 text-sm disabled:opacity-50 flex items-center gap-2">
            <Printer className="w-4 h-4" />{unprintModal.loading ? 'Reverting...' : 'Confirm Unprint'}
          </button>
        </div>
      </DraggableModal>
    );
  };

  // ── Sales Register Modal ─────────────────────────────────────────────────────
  const renderSalesRegModal = () => {
    if (!salesRegModal.open) return null;
    const close = () => setSalesRegModal(m => ({ ...m, open: false }));
    const load = async () => {
      setSalesRegModal(m => ({ ...m, loading: true, error: '' }));
      try {
        const params = {};
        if (salesRegModal.dateFrom) params.date_from = salesRegModal.dateFrom;
        if (salesRegModal.dateTo) params.date_to = salesRegModal.dateTo;
        const result = await api.jobs.salesRegister(params);
        setSalesRegModal(m => ({ ...m, loading: false, data: result }));
      } catch (e) { setSalesRegModal(m => ({ ...m, loading: false, error: e.message })); }
    };
    const exportCSV = () => {
      if (!salesRegModal.data) return;
      const rows = [['Job ID','Customer','Status','Date In','Invoice','Total Ex','Tax','Total Inc','Balance Due']];
      salesRegModal.data.jobs.forEach(j => rows.push([j.id, j.customer, j.status, j.dateIn, j.invoice || '', (j.subtotal||0).toFixed(2), (j.tax||0).toFixed(2), (j.total||0).toFixed(2), (j.balanceDue||0).toFixed(2)]));
      const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = `sales-register-${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
    };
    return (
      <DraggableModal onClose={close} cardClass="w-[900px] p-6" cardStyle={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="flex items-center justify-between mb-4 cursor-move select-none">
          <h3 className="text-lg font-bold flex items-center gap-2"><DollarSign className="w-5 h-5 text-green-600" />Sales Register</h3>
          <button onClick={close}><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="flex items-end gap-3 mb-4">
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Date From</label><input type="date" value={salesRegModal.dateFrom} onChange={e => setSalesRegModal(m => ({ ...m, dateFrom: e.target.value, data: null }))} className="border rounded px-3 py-1.5 text-sm" /></div>
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Date To</label><input type="date" value={salesRegModal.dateTo} onChange={e => setSalesRegModal(m => ({ ...m, dateTo: e.target.value, data: null }))} className="border rounded px-3 py-1.5 text-sm" /></div>
          <button onClick={load} disabled={salesRegModal.loading} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm disabled:opacity-50">{salesRegModal.loading ? 'Loading...' : 'Load'}</button>
          {salesRegModal.data && <button onClick={exportCSV} className="px-4 py-2 border rounded hover:bg-gray-50 text-sm flex items-center gap-1"><FileSpreadsheet className="w-4 h-4" />Export CSV</button>}
        </div>
        {salesRegModal.error && <p className="text-sm text-red-600 mb-3">{salesRegModal.error}</p>}
        {salesRegModal.data && (
          <>
            <div className="flex gap-4 mb-3 text-sm">
              <span className="font-medium">{salesRegModal.data.summary.count} jobs</span>
              <span>Ex: <span className="font-semibold text-gray-800">${salesRegModal.data.summary.total_ex.toFixed(2)}</span></span>
              <span>Tax: <span className="font-semibold text-gray-800">${salesRegModal.data.summary.total_tax.toFixed(2)}</span></span>
              <span>Inc: <span className="font-semibold text-green-700 text-base">${salesRegModal.data.summary.total_inc.toFixed(2)}</span></span>
            </div>
            <div className="overflow-auto flex-1 border rounded">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>{['Job','Customer','Status','Date In','Invoice','Ex GST','GST','Inc GST','Balance'].map(h => <th key={h} className="px-3 py-2 text-left font-medium text-gray-600">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {salesRegModal.data.jobs.map(j => (
                    <tr key={j.id} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-1.5 font-mono font-medium text-blue-700">{j.id}</td>
                      <td className="px-3 py-1.5">{j.customer}</td>
                      <td className="px-3 py-1.5"><span className={`px-2 py-0.5 rounded text-[10px] font-medium ${j.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{j.status}</span></td>
                      <td className="px-3 py-1.5 text-gray-500">{j.dateIn}</td>
                      <td className="px-3 py-1.5 text-gray-500">{j.invoice || '—'}</td>
                      <td className="px-3 py-1.5 text-right">${(j.subtotal||0).toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-right text-gray-500">${(j.tax||0).toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-right font-medium">${(j.total||0).toFixed(2)}</td>
                      <td className={`px-3 py-1.5 text-right ${(j.balanceDue||0) > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>${(j.balanceDue||0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {!salesRegModal.data && !salesRegModal.loading && <p className="text-sm text-gray-400 text-center py-12">Select a date range and click Load to view the Sales Register.</p>}
      </DraggableModal>
    );
  };

  // ── Transfer Stock Modal ─────────────────────────────────────────────────────
  const renderTransferModal = () => {
    if (!transferModal.open) return null;
    const close = () => setTransferModal(m => ({ ...m, open: false }));
    const submit = async () => {
      if (!transferModal.fromSku) return setTransferModal(m => ({ ...m, error: 'Source SKU is required.' }));
      if (!transferModal.toSku && !transferModal.toLocation) return setTransferModal(m => ({ ...m, error: 'Destination SKU or Location is required.' }));
      setTransferModal(m => ({ ...m, loading: true, error: '' }));
      try {
        await api.inventory.transfer({ fromSku: transferModal.fromSku, toSku: transferModal.toSku || null, toLocation: transferModal.toLocation || null, quantity: transferModal.quantity, reference: transferModal.reference, notes: transferModal.notes });
        queryClient.invalidateQueries({ queryKey: ['inventory'] });
        queryClient.invalidateQueries({ queryKey: ['stockMovements'] });
        close();
      } catch (e) { setTransferModal(m => ({ ...m, loading: false, error: e.message })); }
    };
    const fromItem = inventory.find(i => i.sku === transferModal.fromSku);
    return (
      <DraggableModal onClose={close} cardClass="w-[500px] p-6">
        <div className="flex items-center justify-between mb-4 cursor-move select-none">
          <h3 className="text-lg font-bold flex items-center gap-2"><RefreshCw className="w-5 h-5 text-blue-600" />Transfer Stock</h3>
          <button onClick={close}><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        {transferModal.error && <p className="text-sm text-red-600 mb-3 bg-red-50 px-3 py-2 rounded">{transferModal.error}</p>}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Source SKU *</label>
            <select value={transferModal.fromSku} onChange={e => setTransferModal(m => ({ ...m, fromSku: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm">
              <option value="">— Select source item —</option>
              {inventory.map(i => <option key={i.sku} value={i.sku}>{i.sku} — {i.name} (Stock: {i.stock})</option>)}
            </select>
            {fromItem && <p className="text-xs text-gray-500 mt-1">Available: {fromItem.stock} | Location: {fromItem.location || 'N/A'}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Quantity *</label>
            <input type="number" min="1" max={fromItem?.stock || 9999} value={transferModal.quantity} onChange={e => setTransferModal(m => ({ ...m, quantity: parseInt(e.target.value) || 1 }))} className="w-32 border rounded px-3 py-2 text-sm" />
          </div>
          <div className="border-t pt-3">
            <p className="text-xs text-gray-500 mb-2 font-medium">DESTINATION — fill one:</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Destination SKU</label>
                <select value={transferModal.toSku} onChange={e => setTransferModal(m => ({ ...m, toSku: e.target.value, toLocation: '' }))} className="w-full border rounded px-3 py-2 text-sm">
                  <option value="">— Same item —</option>
                  {inventory.filter(i => i.sku !== transferModal.fromSku).map(i => <option key={i.sku} value={i.sku}>{i.sku} — {i.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">New Location</label>
                <input value={transferModal.toLocation} onChange={e => setTransferModal(m => ({ ...m, toLocation: e.target.value, toSku: '' }))} placeholder="e.g. Bin A3" className="w-full border rounded px-3 py-2 text-sm" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Reference</label>
              <input value={transferModal.reference} onChange={e => setTransferModal(m => ({ ...m, reference: e.target.value }))} placeholder="XFER-001" className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
              <input value={transferModal.notes} onChange={e => setTransferModal(m => ({ ...m, notes: e.target.value }))} placeholder="Optional" className="w-full border rounded px-3 py-2 text-sm" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5 pt-4 border-t">
          <button onClick={close} className="px-4 py-2 border rounded hover:bg-gray-50 text-sm">Cancel</button>
          <button onClick={submit} disabled={transferModal.loading} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm disabled:opacity-50 flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />{transferModal.loading ? 'Transferring...' : 'Transfer'}
          </button>
        </div>
      </DraggableModal>
    );
  };

  // ── Stocktake Modal ──────────────────────────────────────────────────────────
  const renderStocktakeModal = () => {
    if (!stocktakeModal.open) return null;
    const close = () => setStocktakeModal(m => ({ ...m, open: false }));
    const submit = async () => {
      setStocktakeModal(m => ({ ...m, loading: true, error: '' }));
      try {
        const result = await api.inventory.stocktake(stocktakeModal.items, stocktakeModal.reference, stocktakeModal.method);
        queryClient.invalidateQueries({ queryKey: ['inventory'] });
        queryClient.invalidateQueries({ queryKey: ['stockMovements'] });
        setStocktakeModal(m => ({ ...m, loading: false, results: result }));
      } catch (e) { setStocktakeModal(m => ({ ...m, loading: false, error: e.message })); }
    };
    const updateCount = (sku, val) => setStocktakeModal(m => ({ ...m, items: m.items.map(i => i.sku === sku ? { ...i, countedQty: parseInt(val) || 0 } : i) }));
    return (
      <DraggableModal onClose={close} cardClass="w-[700px] p-6" cardStyle={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="flex items-center justify-between mb-4 cursor-move select-none">
          <h3 className="text-lg font-bold flex items-center gap-2"><CheckSquare className="w-5 h-5 text-green-600" />Stocktake</h3>
          <button onClick={close}><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        {stocktakeModal.results ? (
          <>
            <p className="text-sm text-green-700 font-medium mb-3">Stocktake complete — {stocktakeModal.results.reference}</p>
            <div className="overflow-auto flex-1 border rounded">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 sticky top-0"><tr>{['SKU','Previous','Counted','Variance'].map(h => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  {stocktakeModal.results.results.map(r => (
                    <tr key={r.sku} className="border-t">
                      <td className="px-3 py-1.5 font-mono">{r.sku}</td>
                      <td className="px-3 py-1.5">{r.previous}</td>
                      <td className="px-3 py-1.5">{r.counted}</td>
                      <td className={`px-3 py-1.5 font-medium ${r.variance > 0 ? 'text-green-600' : r.variance < 0 ? 'text-red-600' : 'text-gray-400'}`}>{r.variance > 0 ? '+' : ''}{r.variance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end pt-3"><button onClick={close} className="px-4 py-2 bg-gray-600 text-white rounded text-sm">Close</button></div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Method</label>
                <select value={stocktakeModal.method} onChange={e => setStocktakeModal(m => ({ ...m, method: e.target.value }))} className="border rounded px-3 py-1.5 text-sm">
                  <option>Informed</option><option>Blind</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Reference</label>
                <input value={stocktakeModal.reference} onChange={e => setStocktakeModal(m => ({ ...m, reference: e.target.value }))} placeholder="auto-generated if blank" className="border rounded px-3 py-1.5 text-sm w-44" />
              </div>
            </div>
            {stocktakeModal.error && <p className="text-sm text-red-600 mb-3">{stocktakeModal.error}</p>}
            <div className="overflow-auto flex-1 border rounded mb-4">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 sticky top-0"><tr>{['SKU','Name','System Qty',stocktakeModal.method === 'Blind' ? 'Counted Qty' : 'Counted Qty'].map(h => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  {stocktakeModal.items.map(item => (
                    <tr key={item.sku} className="border-t">
                      <td className="px-3 py-1 font-mono">{item.sku}</td>
                      <td className="px-3 py-1">{item.name}</td>
                      <td className="px-3 py-1 text-gray-500">{stocktakeModal.method === 'Blind' ? '—' : item.currentStock}</td>
                      <td className="px-3 py-0.5"><input type="number" min="0" value={item.countedQty} onChange={e => updateCount(item.sku, e.target.value)} className={`w-20 border rounded px-2 py-1 text-xs ${item.countedQty !== item.currentStock ? 'border-orange-400 bg-orange-50' : ''}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t">
              <button onClick={close} className="px-4 py-2 border rounded hover:bg-gray-50 text-sm">Cancel</button>
              <button onClick={submit} disabled={stocktakeModal.loading} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm disabled:opacity-50 flex items-center gap-2">
                <CheckSquare className="w-4 h-4" />{stocktakeModal.loading ? 'Saving...' : 'Commit Stocktake'}
              </button>
            </div>
          </>
        )}
      </DraggableModal>
    );
  };

  // ── Stock Flow Modal ─────────────────────────────────────────────────────────
  const renderStockFlowModal = () => {
    if (!stockFlowModal.open) return null;
    const close = () => setStockFlowModal(m => ({ ...m, open: false }));
    const filtered = (stockFlowModal.data || []).filter(i => !stockFlowModal.search || i.sku.toLowerCase().includes(stockFlowModal.search.toLowerCase()) || i.name.toLowerCase().includes(stockFlowModal.search.toLowerCase()));
    return (
      <DraggableModal onClose={close} cardClass="w-[900px] p-6" cardStyle={{ maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div className="flex items-center justify-between mb-4 cursor-move select-none">
          <h3 className="text-lg font-bold flex items-center gap-2"><TrendingUp className="w-5 h-5 text-blue-600" />Stock Flow</h3>
          <button onClick={close}><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <input value={stockFlowModal.search} onChange={e => setStockFlowModal(m => ({ ...m, search: e.target.value }))} placeholder="Search SKU or name..." className="border rounded px-3 py-2 text-sm mb-3 w-64" />
        {stockFlowModal.loading && <p className="text-sm text-gray-500 py-8 text-center">Loading stock flow data...</p>}
        {!stockFlowModal.loading && (
          <div className="overflow-auto flex-1 space-y-3">
            {filtered.map(item => (
              <div key={item.sku} className="border rounded p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-mono font-medium text-sm text-blue-700">{item.sku}</span>
                    <span className="ml-2 text-sm text-gray-700">{item.name}</span>
                    {item.location && <span className="ml-2 text-xs text-gray-400">@ {item.location}</span>}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-600">
                    <span>Stock: <span className={`font-semibold ${item.stock <= item.min_stock ? 'text-red-600' : 'text-gray-800'}`}>{item.stock}</span></span>
                    <span>Min: {item.min_stock}</span>
                    <span>Cost: ${item.unit_cost.toFixed(2)}</span>
                    <span>Price: ${item.sell_price.toFixed(2)}</span>
                  </div>
                </div>
                {item.movements.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-t">
                      <thead className="text-gray-500"><tr><th className="text-left py-1 pr-3">Date</th><th className="text-left py-1 pr-3">Type</th><th className="text-right py-1 pr-3">Qty</th><th className="text-left py-1 pr-3">Reference</th><th className="text-left py-1">Notes</th></tr></thead>
                      <tbody>
                        {item.movements.map(m => (
                          <tr key={m.id} className="border-t">
                            <td className="py-1 pr-3 text-gray-500">{m.date}</td>
                            <td className="py-1 pr-3">{m.type}</td>
                            <td className={`py-1 pr-3 text-right font-medium ${m.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>{m.quantity > 0 ? '+' : ''}{m.quantity}</td>
                            <td className="py-1 pr-3 text-gray-500">{m.reference || '—'}</td>
                            <td className="py-1 text-gray-500">{m.notes || ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="text-xs text-gray-400 pt-1">No movement history</p>}
              </div>
            ))}
            {filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No items match.</p>}
          </div>
        )}
      </DraggableModal>
    );
  };

  // Card Files Module
  const renderCardFiles = () => {
    const uniqueCfGroups = [...new Set(cardFiles.map(c => c.group).filter(Boolean))].sort();

    const filtered = cardFiles.filter(c => {
      const term = cardFileSearch.toLowerCase();
      const matchesSearch = !term ||
        c.shipCode.toLowerCase().includes(term) ||
        c.customerCode.toLowerCase().includes(term) ||
        (c.companyName || '').toLowerCase().includes(term) ||
        (c.suburb || '').toLowerCase().includes(term);
      const matchesGroup = cardFileGroup === 'all' || c.group === cardFileGroup;
      return matchesSearch && matchesGroup;
    });

    const openCreate = () => {
      setCardFileForm({ shipCode: '', customerCode: '', companyName: '', contactName: '', address1: '', address2: '', suburb: '', state: '', postcode: '', country: 'AU', phone: '', email: '', notes: '' });
      setCardFileModal({ open: true, editing: null });
    };

    const openEdit = (card) => {
      setCardFileForm({ ...card });
      setCardFileModal({ open: true, editing: card.shipCode });
    };

    const saveCard = async () => {
      try {
        if (cardFileModal.editing) {
          const updated = await api.cardFiles.update(cardFileModal.editing, cardFileForm);
          if (selectedCardFile?.shipCode === cardFileModal.editing) setSelectedCardFile(updated);
        } else {
          await api.cardFiles.create(cardFileForm);
        }
        queryClient.invalidateQueries({ queryKey: ['cardFiles'] });
        setCardFileModal({ open: false, editing: null });
      } catch (e) { alert(e.message); }
    };

    const deleteCard = async (shipCode) => {
      if (!window.confirm(`Delete card file ${shipCode}?`)) return;
      try {
        await api.cardFiles.delete(shipCode);
        if (selectedCardFile?.shipCode === shipCode) setSelectedCardFile(null);
        queryClient.invalidateQueries({ queryKey: ['cardFiles'] });
      } catch (e) { alert(e.message); }
    };

    const card = selectedCardFile;
    const relatedJobs = card ? jobs.filter(j => j.shipTo === card.shipCode) : [];

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{filtered.length} of {cardFiles.length} cards</p>
          <button onClick={openCreate}
            className="bg-blue-700 text-white px-4 py-2 rounded-lg hover:bg-blue-800 flex items-center">
            <Plus className="w-4 h-4 mr-2" />New Card File
          </button>
        </div>

        <div className="flex gap-4">
          {/* Left: list */}
          <div className="w-72 flex-shrink-0 space-y-3">
            {/* Search + group filter */}
            <div className="bg-white rounded-xl shadow-sm p-3 space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                <input type="text" placeholder="Search ship code, company..."
                  className="w-full pl-9 pr-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={cardFileSearch} onChange={e => setCardFileSearch(e.target.value)} />
              </div>
              <select value={cardFileGroup} onChange={e => setCardFileGroup(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">All Groups</option>
                {uniqueCfGroups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            {/* Card list */}
            <div className="bg-white rounded-lg shadow divide-y max-h-[70vh] overflow-y-auto">
              {filtered.length === 0 && (
                <div className="px-4 py-8 text-center text-gray-400 text-sm">No card files found.</div>
              )}
              {filtered.map(c => (
                <button key={c.shipCode}
                  onClick={() => setSelectedCardFile(c)}
                  className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors ${selectedCardFile?.shipCode === c.shipCode ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="font-mono font-semibold text-blue-700 text-sm">{c.shipCode}</p>
                      <p className="text-xs text-gray-500 truncate">{c.companyName || c.customerCode}</p>
                      {c.suburb && <p className="text-xs text-gray-400">{c.suburb}{c.state ? `, ${c.state}` : ''}</p>}
                    </div>
                    <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono ml-2 flex-shrink-0">{c.group}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right: detail */}
          <div className="flex-1">
            {!card ? (
              <div className="bg-white rounded-lg shadow flex items-center justify-center h-64 text-gray-400">
                <div className="text-center">
                  <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>Select a card file to view details</p>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow">
                {/* Card header */}
                <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b">
                  <div>
                    <div className="flex items-center space-x-3">
                      <span className="font-mono font-black text-2xl text-blue-700">{card.shipCode}</span>
                      <span className="text-sm bg-gray-100 text-gray-600 px-2 py-1 rounded font-mono">Group: {card.group}</span>
                    </div>
                    <p className="text-gray-500 text-sm mt-1">Customer Code: <span className="font-mono font-semibold text-gray-700">{card.customerCode}</span></p>
                  </div>
                  <div className="flex space-x-2">
                    <button onClick={() => openEdit(card)}
                      className="flex items-center space-x-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded text-sm">
                      <Edit className="w-4 h-4" /><span>Edit</span>
                    </button>
                    <button onClick={() => deleteCard(card.shipCode)}
                      className="flex items-center space-x-1 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded text-sm">
                      <Trash2 className="w-4 h-4" /><span>Delete</span>
                    </button>
                  </div>
                </div>

                {/* Address + contact */}
                <div className="grid grid-cols-2 gap-6 px-6 py-5">
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Ship-To Address</p>
                    <div className="space-y-1">
                      {card.companyName && <p className="font-semibold text-gray-800">{card.companyName}</p>}
                      {card.address1 && <p className="text-sm text-gray-600">{card.address1}</p>}
                      {card.address2 && <p className="text-sm text-gray-600">{card.address2}</p>}
                      {(card.suburb || card.state || card.postcode) && (
                        <p className="text-sm text-gray-600">
                          {[card.suburb, card.state, card.postcode].filter(Boolean).join('  ')}
                        </p>
                      )}
                      {card.country && card.country !== 'AU' && <p className="text-sm text-gray-600">{card.country}</p>}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Contact</p>
                    <div className="space-y-2">
                      {card.contactName && <p className="text-sm text-gray-700 flex items-center"><User className="w-4 h-4 mr-2 text-gray-400" />{card.contactName}</p>}
                      {card.phone && <p className="text-sm text-gray-700 flex items-center"><Phone className="w-4 h-4 mr-2 text-gray-400" />{card.phone}</p>}
                      {card.email && <p className="text-sm text-gray-700 flex items-center"><Mail className="w-4 h-4 mr-2 text-gray-400" />{card.email}</p>}
                    </div>
                    {card.notes && (
                      <div className="mt-4">
                        <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Notes</p>
                        <p className="text-sm text-gray-600 bg-gray-50 rounded p-2">{card.notes}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Related jobs */}
                <div className="px-6 pb-5 border-t pt-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Jobs shipping to {card.shipCode} ({relatedJobs.length})</p>
                  {relatedJobs.length === 0 ? (
                    <p className="text-sm text-gray-400">No jobs found for this ship code.</p>
                  ) : (
                    <div className="divide-y rounded border overflow-hidden">
                      {relatedJobs.slice(0, 10).map(j => (
                        <button key={j.id} onClick={() => { pinJob(j); setActiveModule('jobs'); }}
                          className="w-full text-left px-4 py-2.5 hover:bg-blue-50 flex items-center justify-between">
                          <div>
                            <span className="font-mono text-blue-600 font-semibold text-sm">#{j.id}</span>
                            <span className="ml-3 text-sm text-gray-600">{j.customer}</span>
                            {j.invoice && <span className="ml-2 text-xs text-gray-400">Inv: {j.invoice}</span>}
                          </div>
                          <div className="flex items-center space-x-3">
                            <span className="text-xs text-gray-500">{j.due}</span>
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                              { QUOTE:'bg-gray-100 text-gray-700', New:'bg-blue-100 text-blue-700', 'Pick/Pack':'bg-cyan-100 text-cyan-700', FINISH:'bg-green-100 text-green-800', INVOICE:'bg-teal-100 text-teal-700', PAID:'bg-emerald-100 text-emerald-800', CANCEL:'bg-red-100 text-red-700' }[j.status] || 'bg-gray-100 text-gray-600'
                            }`}>{j.status}</span>
                          </div>
                        </button>
                      ))}
                      {relatedJobs.length > 10 && (
                        <div className="px-4 py-2 text-xs text-gray-400 text-center">+{relatedJobs.length - 10} more — use job filter to see all</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Create / Edit Modal */}
        {cardFileModal.open && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <h3 className="text-lg font-bold">{cardFileModal.editing ? `Edit Card File — ${cardFileModal.editing}` : 'New Card File'}</h3>
                <button onClick={() => setCardFileModal({ open: false, editing: null })}><X className="w-5 h-5" /></button>
              </div>
              <div className="px-6 py-5 space-y-4">
                {/* Codes */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ship Code <span className="text-red-500">*</span>
                      <span className="text-xs font-normal text-gray-400 ml-1">(e.g. RESP.SYD)</span>
                    </label>
                    <input type="text" value={cardFileForm.shipCode}
                      onChange={e => {
                        const v = e.target.value.toUpperCase();
                        const prefix = v.split('.')[0];
                        setCardFileForm(f => ({
                          ...f,
                          shipCode: v,
                          customerCode: f.customerCode || prefix,
                        }));
                      }}
                      disabled={!!cardFileModal.editing}
                      className="w-full border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                      placeholder="RESP.SYD" />
                    {cardFileForm.shipCode && (
                      <p className="text-xs text-gray-400 mt-1">Group: <strong>{cardFileForm.shipCode.split('.')[0]}</strong></p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Customer Code <span className="text-red-500">*</span>
                      <span className="text-xs font-normal text-gray-400 ml-1">(e.g. RESP.HO)</span>
                    </label>
                    <input type="text" value={cardFileForm.customerCode}
                      onChange={e => setCardFileForm(f => ({ ...f, customerCode: e.target.value.toUpperCase() }))}
                      className="w-full border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="RESP.HO" />
                  </div>
                </div>

                {/* Company + Contact */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                    <input type="text" value={cardFileForm.companyName}
                      onChange={e => setCardFileForm(f => ({ ...f, companyName: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Respite Care Sydney" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
                    <input type="text" value={cardFileForm.contactName}
                      onChange={e => setCardFileForm(f => ({ ...f, contactName: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>

                {/* Address */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 1</label>
                  <input type="text" value={cardFileForm.address1}
                    onChange={e => setCardFileForm(f => ({ ...f, address1: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 2</label>
                  <input type="text" value={cardFileForm.address2}
                    onChange={e => setCardFileForm(f => ({ ...f, address2: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Suburb / City</label>
                    <input type="text" value={cardFileForm.suburb}
                      onChange={e => setCardFileForm(f => ({ ...f, suburb: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                    <select value={cardFileForm.state}
                      onChange={e => setCardFileForm(f => ({ ...f, state: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">—</option>
                      {['NSW','VIC','QLD','WA','SA','TAS','ACT','NT'].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Postcode</label>
                    <input type="text" value={cardFileForm.postcode}
                      onChange={e => setCardFileForm(f => ({ ...f, postcode: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="2000" />
                  </div>
                </div>

                {/* Phone + Email */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input type="text" value={cardFileForm.phone}
                      onChange={e => setCardFileForm(f => ({ ...f, phone: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input type="email" value={cardFileForm.email}
                      onChange={e => setCardFileForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea rows={3} value={cardFileForm.notes}
                    onChange={e => setCardFileForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="flex justify-end space-x-3 px-6 py-4 border-t bg-gray-50">
                <button onClick={() => setCardFileModal({ open: false, editing: null })}
                  className="px-4 py-2 border rounded text-sm hover:bg-gray-100">Cancel</button>
                <button onClick={saveCard}
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 flex items-center">
                  <Save className="w-4 h-4 mr-1" />{cardFileModal.editing ? 'Save Changes' : 'Create Card File'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Import Data Module
  const renderImport = () => {
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
      blue:   { card: 'border-blue-200 bg-blue-50',     badge: 'bg-blue-100 text-blue-700',     btn: 'bg-blue-600 hover:bg-blue-700',     icon: 'text-blue-600' },
      green:  { card: 'border-green-200 bg-green-50',   badge: 'bg-green-100 text-green-700',   btn: 'bg-green-600 hover:bg-green-700',   icon: 'text-green-600' },
      purple: { card: 'border-purple-200 bg-purple-50', badge: 'bg-purple-100 text-purple-700', btn: 'bg-purple-600 hover:bg-purple-700', icon: 'text-purple-600' },
      orange: { card: 'border-orange-200 bg-orange-50', badge: 'bg-orange-100 text-orange-700', btn: 'bg-orange-600 hover:bg-orange-700', icon: 'text-orange-600' },
      teal:   { card: 'border-teal-200 bg-teal-50',     badge: 'bg-teal-100 text-teal-700',     btn: 'bg-teal-600 hover:bg-teal-700',     icon: 'text-teal-600' },
    };

    const handleFileSelect = async (key, file) => {
      if (!file) return;
      setImportFiles(f => ({ ...f, [key]: file }));
      setImportResults(r => ({ ...r, [key]: null }));
      try {
        const preview = await api.importData.preview(file);
        setImportPreviews(p => ({ ...p, [key]: preview }));
      } catch {}
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
            <h2 className="text-2xl font-bold flex items-center">
              <FileSpreadsheet className="w-6 h-6 mr-2 text-blue-600" />
              Import Data
            </h2>
            <p className="text-sm text-gray-500 mt-1">Upload CSV files from your previous ERP to migrate data into this system.</p>
          </div>
        </div>

        {/* How it works */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          <p className="font-semibold mb-1">How it works</p>
          <ol className="list-decimal list-inside space-y-1 text-blue-700">
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
              <div key={entity.key} className={`bg-white rounded-xl shadow border-2 ${result?.ok ? 'border-green-300' : 'border-gray-100'} overflow-hidden`}>
                {/* Card header */}
                <div className={`px-5 py-4 border-b flex items-center justify-between ${c.card}`}>
                  <div className="flex items-center space-x-3">
                    <Icon className={`w-5 h-5 ${c.icon}`} />
                    <div>
                      <h3 className="font-semibold text-gray-800">{entity.label}</h3>
                      <p className="text-xs text-gray-500">{entity.description}</p>
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
                    <p className="text-xs font-medium text-gray-500 mb-1">Recognised columns (Jim2 names auto-mapped)</p>
                    <p className="text-xs text-gray-400 font-mono leading-relaxed">{entity.fields}</p>
                    {entity.jim2hint && (
                      <p className="text-xs mt-1.5 text-blue-600 bg-blue-50 rounded px-2 py-1">
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
                        <FileSpreadsheet className="w-8 h-8 text-gray-300 mx-auto mb-1" />
                        <p className="text-sm text-gray-500">Click to select CSV file</p>
                        <p className="text-xs text-gray-400">or drag and drop</p>
                      </div>
                    )}
                  </label>

                  {/* Preview table */}
                  {preview && preview.preview.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Preview (first {Math.min(preview.preview.length, 3)} rows)</p>
                      <div className="overflow-x-auto border rounded text-xs">
                        <table className="w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              {preview.columns.slice(0, 6).map(col => (
                                <th key={col} className="px-2 py-1.5 text-left text-gray-500 font-medium whitespace-nowrap">{col}</th>
                              ))}
                              {preview.columns.length > 6 && <th className="px-2 py-1.5 text-gray-400">+{preview.columns.length - 6} more</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {preview.preview.slice(0, 3).map((row, i) => (
                              <tr key={i} className="hover:bg-gray-50">
                                {preview.columns.slice(0, 6).map(col => (
                                  <td key={col} className="px-2 py-1.5 text-gray-700 whitespace-nowrap max-w-[120px] truncate">{row[col] || '—'}</td>
                                ))}
                                {preview.columns.length > 6 && <td className="px-2 py-1.5 text-gray-400">…</td>}
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
                        <div className="bg-white rounded p-2">
                          <p className="text-lg font-bold text-green-600">{result.inserted}</p>
                          <p className="text-xs text-gray-500">Inserted</p>
                        </div>
                        <div className="bg-white rounded p-2">
                          <p className="text-lg font-bold text-blue-600">{result.updated}</p>
                          <p className="text-xs text-gray-500">Updated</p>
                        </div>
                        <div className="bg-white rounded p-2">
                          <p className="text-lg font-bold text-gray-500">{result.skipped}</p>
                          <p className="text-xs text-gray-500">Skipped</p>
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

                  {/* Import button */}
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
        <div className="bg-gray-50 border rounded-lg p-4 text-sm text-gray-600">
          <p className="font-semibold text-gray-700 mb-2">Tips for a successful import</p>
          <ul className="space-y-1 list-disc list-inside text-gray-500">
            <li>Column names are matched flexibly — <code className="bg-gray-200 px-1 rounded text-xs">Customer Name</code>, <code className="bg-gray-200 px-1 rounded text-xs">customer_name</code>, and <code className="bg-gray-200 px-1 rounded text-xs">Company</code> all map to the name field.</li>
            <li>Import <strong>Customers</strong> and <strong>Suppliers</strong> first, then <strong>Inventory</strong>, then <strong>Jobs</strong>.</li>
            <li>Existing records (matched by ID) are <em>updated</em>, not duplicated. Safe to re-run after corrections.</li>
            <li>CSV files must be UTF-8 encoded. Excel users: File → Save As → CSV UTF-8.</li>
            <li>Dates can be in <code className="bg-gray-200 px-1 rounded text-xs">DD/MM/YYYY</code> or <code className="bg-gray-200 px-1 rounded text-xs">YYYY-MM-DD</code> format.</li>
          </ul>
        </div>
      </div>
    );
  };

  // Scheduling Module
  const renderScheduling = () => (
    <SchedulingModule
      jobs={jobs}
      onPinJob={(job) => { pinJob(job); setActiveModule('jobs'); }}
      onUpdateJobDue={updateJobDue}
      currentUser={currentUser}
    />
  );

  // ── Open Freight Modal ────────────────────────────────────────────────────
  const renderOpenFreightModal = () => {
    if (!ofModalOpen) return null;

    const PARCEL_TYPES = ['Satchel', 'Box', 'Envelope', 'Pallet', 'Bag', 'Tube', 'Other'];
    const SERVICES = ['Standard', 'Express', 'Overnight', 'Same Day', 'Economy'];
    const TYPE_COLORS = {
      Satchel: 'bg-blue-100 text-blue-700',
      Box: 'bg-orange-100 text-orange-700',
      Envelope: 'bg-yellow-100 text-yellow-800',
      Pallet: 'bg-gray-100 text-gray-700',
      Bag: 'bg-green-100 text-green-700',
      Tube: 'bg-purple-100 text-purple-700',
      Other: 'bg-gray-100 text-gray-600',
    };

    const openAddParcel = () => {
      setOfParcelForm({ name: '', parcelType: 'Satchel', service: 'Standard', carrierCode: '', maxWeightKg: '', lengthCm: '', widthCm: '', heightCm: '', rate: '', notes: '' });
      setOfParcelModal({ open: true, editing: null });
    };

    const openEditParcel = (p) => {
      setOfParcelForm({
        name: p.name, parcelType: p.parcelType, service: p.service,
        carrierCode: p.carrierCode, maxWeightKg: p.maxWeightKg || '',
        lengthCm: p.lengthCm || '', widthCm: p.widthCm || '',
        heightCm: p.heightCm || '', rate: p.rate || '', notes: p.notes,
      });
      setOfParcelModal({ open: true, editing: p.id });
    };

    const saveParcel = async () => {
      try {
        const data = {
          ...ofParcelForm,
          maxWeightKg: ofParcelForm.maxWeightKg ? parseFloat(ofParcelForm.maxWeightKg) : null,
          lengthCm: ofParcelForm.lengthCm ? parseFloat(ofParcelForm.lengthCm) : null,
          widthCm: ofParcelForm.widthCm ? parseFloat(ofParcelForm.widthCm) : null,
          heightCm: ofParcelForm.heightCm ? parseFloat(ofParcelForm.heightCm) : null,
          rate: ofParcelForm.rate ? parseFloat(ofParcelForm.rate) : null,
        };
        if (ofParcelModal.editing) {
          await api.openFreight.updateParcel(ofParcelModal.editing, data);
        } else {
          await api.openFreight.createParcel(data);
        }
        queryClient.invalidateQueries({ queryKey: ['ofParcels'] });
        setOfParcelModal({ open: false, editing: null });
      } catch (e) { alert(e.message); }
    };

    const deleteParcel = async (id, name) => {
      if (!window.confirm(`Delete parcel type "${name}"?`)) return;
      try {
        await api.openFreight.deleteParcel(id);
        queryClient.invalidateQueries({ queryKey: ['ofParcels'] });
      } catch (e) { alert(e.message); }
    };

    const saveAccount = async () => {
      try {
        const saved = await api.openFreight.saveAccount(ofAccount);
        setOfAccount(saved);
        setOfAccountDirty(false);
      } catch (e) { alert(e.message); }
    };

    return (
      <>
        {/* Main Open Freight modal */}
        <DraggableModal onClose={() => setOfModalOpen(false)} cardClass="w-full max-w-3xl max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-orange-500 to-orange-600 rounded-t-xl">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                  <Truck className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Open Freight</h2>
                  <p className="text-xs text-orange-100">Carrier account &amp; parcel types</p>
                </div>
              </div>
              <button onClick={() => setOfModalOpen(false)} className="p-1.5 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b bg-gray-50 px-6 rounded-none">
              {[
                { id: 'parcels', label: 'Parcel Types', icon: Box },
                { id: 'account', label: 'Account', icon: Settings },
              ].map(tab => {
                const Icon = tab.icon;
                return (
                  <button key={tab.id} onClick={() => setOfTab(tab.id)}
                    className={`flex items-center space-x-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      ofTab === tab.id
                        ? 'border-orange-500 text-orange-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}>
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                    {tab.id === 'parcels' && ofParcels.length > 0 && (
                      <span className="bg-orange-100 text-orange-700 text-xs px-1.5 py-0.5 rounded-full font-semibold">
                        {ofParcels.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">

              {/* ── PARCEL TYPES TAB ─────────────────────────────────────── */}
              {ofTab === 'parcels' && (
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-sm text-gray-500">Configure the parcel types you use with Open Freight. These can be selected when booking a shipment.</p>
                    </div>
                    <button onClick={openAddParcel}
                      className="flex items-center space-x-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 text-sm font-medium shadow-sm transition-colors">
                      <Plus className="w-4 h-4" />
                      <span>Add Parcel Type</span>
                    </button>
                  </div>

                  {ofParcels.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">
                      <Box className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p className="font-medium text-gray-500">No parcel types yet</p>
                      <p className="text-sm mt-1">Click <strong>+ Add Parcel Type</strong> to create your first one</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {ofParcels.map(p => (
                        <div key={p.id} className="bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-800 truncate">{p.name}</p>
                              <div className="flex items-center space-x-2 mt-1">
                                {p.parcelType && (
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[p.parcelType] || 'bg-gray-100 text-gray-600'}`}>
                                    {p.parcelType}
                                  </span>
                                )}
                                {p.service && (
                                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{p.service}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex space-x-1 ml-2 flex-shrink-0">
                              <button onClick={() => openEditParcel(p)}
                                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteParcel(p.id, p.name)}
                                className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2 mt-3 text-xs text-gray-500">
                            {p.maxWeightKg > 0 && (
                              <div className="flex items-center space-x-1">
                                <Weight className="w-3 h-3 text-gray-400" />
                                <span>Max {p.maxWeightKg} kg</span>
                              </div>
                            )}
                            {(p.lengthCm > 0 || p.widthCm > 0 || p.heightCm > 0) && (
                              <div className="flex items-center space-x-1 col-span-2">
                                <Ruler className="w-3 h-3 text-gray-400" />
                                <span>
                                  {[p.lengthCm, p.widthCm, p.heightCm].filter(Boolean).join(' × ')} cm
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
                            {p.carrierCode && (
                              <span className="text-xs font-mono text-gray-400 bg-gray-50 px-2 py-0.5 rounded">
                                {p.carrierCode}
                              </span>
                            )}
                            {p.rate > 0 && (
                              <span className="ml-auto text-sm font-bold text-orange-600">
                                ${Number(p.rate).toFixed(2)}
                              </span>
                            )}
                          </div>
                          {p.notes && <p className="text-xs text-gray-400 mt-2 italic">{p.notes}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── ACCOUNT TAB ──────────────────────────────────────────── */}
              {ofTab === 'account' && (
                <div className="p-6 space-y-5">
                  <p className="text-sm text-gray-500">Store your Open Freight account credentials and depot details here for quick reference when booking shipments.</p>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
                      <input type="text" value={ofAccount.accountNumber}
                        onChange={e => { setOfAccount(a => ({ ...a, accountNumber: e.target.value })); setOfAccountDirty(true); }}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                        placeholder="e.g. OF-12345" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Account Name</label>
                      <input type="text" value={ofAccount.accountName}
                        onChange={e => { setOfAccount(a => ({ ...a, accountName: e.target.value })); setOfAccountDirty(true); }}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                        placeholder="Total Image Group" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Depot / Branch</label>
                      <input type="text" value={ofAccount.depot}
                        onChange={e => { setOfAccount(a => ({ ...a, depot: e.target.value })); setOfAccountDirty(true); }}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                        placeholder="e.g. Sydney West" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
                      <input type="text" value={ofAccount.contactName}
                        onChange={e => { setOfAccount(a => ({ ...a, contactName: e.target.value })); setOfAccountDirty(true); }}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone</label>
                      <input type="text" value={ofAccount.contactPhone}
                        onChange={e => { setOfAccount(a => ({ ...a, contactPhone: e.target.value })); setOfAccountDirty(true); }}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
                      <input type="email" value={ofAccount.contactEmail}
                        onChange={e => { setOfAccount(a => ({ ...a, contactEmail: e.target.value })); setOfAccountDirty(true); }}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      API Key / Login
                      <span className="ml-1 text-xs font-normal text-gray-400">(optional)</span>
                    </label>
                    <input type="password" value={ofAccount.apiKey}
                      onChange={e => { setOfAccount(a => ({ ...a, apiKey: e.target.value })); setOfAccountDirty(true); }}
                      className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
                      placeholder={ofAccount.apiKeySet ? '(configured — leave blank to keep)' : 'API key or login credentials'} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea rows={3} value={ofAccount.notes}
                      onChange={e => { setOfAccount(a => ({ ...a, notes: e.target.value })); setOfAccountDirty(true); }}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                      placeholder="Any additional account notes…" />
                  </div>
                  <div className="flex justify-end">
                    <button onClick={saveAccount} disabled={!ofAccountDirty}
                      className={`flex items-center space-x-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                        ofAccountDirty
                          ? 'bg-orange-500 text-white hover:bg-orange-600'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      }`}>
                      <Save className="w-4 h-4" />
                      <span>{ofAccountDirty ? 'Save Account' : 'Saved'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
        </DraggableModal>

        {/* ── Add / Edit Parcel Type sub-modal ─────────────────────────── */}
        {ofParcelModal.open && (
          <DraggableModal onClose={() => setOfParcelModal({ open: false, editing: null })} cardClass="w-full max-w-lg max-h-[90vh] overflow-y-auto" overlayClass="z-[60]">
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <h3 className="font-bold text-gray-800">
                  {ofParcelModal.editing ? 'Edit Parcel Type' : 'New Parcel Type'}
                </h3>
                <button onClick={() => setOfParcelModal({ open: false, editing: null })}>
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
                  <input type="text" value={ofParcelForm.name}
                    onChange={e => setOfParcelForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    placeholder="e.g. Standard Satchel 500g" autoFocus />
                </div>

                {/* Type + Service */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Parcel Type</label>
                    <div className="flex flex-wrap gap-2">
                      {PARCEL_TYPES.map(t => (
                        <button key={t} type="button"
                          onClick={() => setOfParcelForm(f => ({ ...f, parcelType: t }))}
                          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                            ofParcelForm.parcelType === t
                              ? (TYPE_COLORS[t] || 'bg-gray-200 text-gray-700') + ' border-current'
                              : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                          }`}>{t}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Service Level</label>
                    <select value={ofParcelForm.service}
                      onChange={e => setOfParcelForm(f => ({ ...f, service: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                      {SERVICES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                {/* Weight + Dimensions */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Size &amp; Weight</label>
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Max Weight (kg)</label>
                      <input type="number" step="0.1" min="0" value={ofParcelForm.maxWeightKg}
                        onChange={e => setOfParcelForm(f => ({ ...f, maxWeightKg: e.target.value }))}
                        className="w-full border rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-400"
                        placeholder="0.5" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Length (cm)</label>
                      <input type="number" step="0.1" min="0" value={ofParcelForm.lengthCm}
                        onChange={e => setOfParcelForm(f => ({ ...f, lengthCm: e.target.value }))}
                        className="w-full border rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-400"
                        placeholder="30" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Width (cm)</label>
                      <input type="number" step="0.1" min="0" value={ofParcelForm.widthCm}
                        onChange={e => setOfParcelForm(f => ({ ...f, widthCm: e.target.value }))}
                        className="w-full border rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-400"
                        placeholder="20" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Height (cm)</label>
                      <input type="number" step="0.1" min="0" value={ofParcelForm.heightCm}
                        onChange={e => setOfParcelForm(f => ({ ...f, heightCm: e.target.value }))}
                        className="w-full border rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-400"
                        placeholder="10" />
                    </div>
                  </div>
                </div>

                {/* Carrier code + Rate */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Carrier Code
                      <span className="ml-1 text-xs font-normal text-gray-400">(for labels)</span>
                    </label>
                    <input type="text" value={ofParcelForm.carrierCode}
                      onChange={e => setOfParcelForm(f => ({ ...f, carrierCode: e.target.value.toUpperCase() }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
                      placeholder="e.g. SAT500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Rate ($ per parcel)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                      <input type="number" step="0.01" min="0" value={ofParcelForm.rate}
                        onChange={e => setOfParcelForm(f => ({ ...f, rate: e.target.value }))}
                        className="w-full border rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                        placeholder="0.00" />
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <input type="text" value={ofParcelForm.notes}
                    onChange={e => setOfParcelForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    placeholder="Any special handling notes…" />
                </div>
              </div>

              <div className="flex justify-end space-x-3 px-6 py-4 border-t bg-gray-50 rounded-b-xl">
                <button onClick={() => setOfParcelModal({ open: false, editing: null })}
                  className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-100 text-gray-600">Cancel</button>
                <button onClick={saveParcel} disabled={!ofParcelForm.name.trim()}
                  className={`flex items-center space-x-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                    ofParcelForm.name.trim()
                      ? 'bg-orange-500 text-white hover:bg-orange-600'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}>
                  <Save className="w-4 h-4" />
                  <span>{ofParcelModal.editing ? 'Save Changes' : 'Add Parcel Type'}</span>
                </button>
              </div>
          </DraggableModal>
        )}
      </>
    );
  };

  // Document Print Modal (Picking Slip, Delivery Note, Job Sheet)
  const renderDocumentPrint = () => {
    if (!documentPrint) return null;
    const { type, job: j } = documentPrint;
    const titles = { pickingSlip: 'PICKING SLIP', deliveryNote: 'DELIVERY NOTE', jobSheet: 'JOB SHEET', shipLabel: 'SHIP LABEL' };

    if (type === 'shipLabel') {
      const totalQty = (j.items || []).reduce((s, it) => s + (it.order || it.qty || 0), 0);
      const itemCount = (j.items || []).length;
      return (
        <DraggableModal onClose={() => setDocumentPrint(null)} cardClass="w-full max-w-lg">
            <div className="flex items-center justify-between px-6 pt-5 pb-3 print:hidden border-b">
              <h2 className="text-lg font-bold">Ship Label Preview — Job #{j.id}</h2>
              <div className="flex space-x-2">
                <button onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 flex items-center">
                  <Printer className="w-4 h-4 mr-1" />Print
                </button>
                <button onClick={() => setDocumentPrint(null)} className="p-2 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
              </div>
            </div>

            {/* Label body — 4×6 inch print */}
            <div className="m-5 border-4 border-gray-900 rounded-lg overflow-hidden print:m-0 print:border-0">
              {/* FROM strip */}
              <div className="bg-gray-900 text-white px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-widest text-gray-400">From</p>
                  <p className="font-bold text-sm">Total Image Group</p>
                  <p className="text-xs text-gray-300">info@totalimage.com.au</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Job #</p>
                  <p className="font-mono font-black text-2xl tracking-widest">{String(j.id).padStart(6, '0')}</p>
                </div>
              </div>

              {/* TO block */}
              <div className="px-6 py-5 bg-white">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Ship To</p>
                <p className="text-2xl font-black text-gray-900 leading-tight">{j.customer}</p>
                {(j.shipTo || j.shippingAddress) && (
                  <p className="text-base text-gray-700 mt-2 whitespace-pre-line leading-snug">
                    {j.shipTo || j.shippingAddress}
                  </p>
                )}
              </div>

              {/* Divider */}
              <div className="border-t-2 border-dashed border-gray-400 mx-4" />

              {/* Job meta row */}
              <div className="grid grid-cols-3 divide-x divide-gray-200 bg-gray-50">
                <div className="px-4 py-3 text-center">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Due Date</p>
                  <p className="font-bold text-sm mt-0.5">{j.due || '—'}</p>
                </div>
                <div className="px-4 py-3 text-center">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Items</p>
                  <p className="font-bold text-sm mt-0.5">{itemCount} line{itemCount !== 1 ? 's' : ''}</p>
                </div>
                <div className="px-4 py-3 text-center">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Total Qty</p>
                  <p className="font-bold text-sm mt-0.5">{totalQty}</p>
                </div>
              </div>

              {/* Extra refs */}
              {(j.custRef || j.ourRef || j.invoice) && (
                <div className="px-5 py-3 bg-white border-t text-xs text-gray-500 space-y-0.5">
                  {j.invoice && <p><span className="font-semibold">Invoice #:</span> {j.invoice}</p>}
                  {j.custRef && <p><span className="font-semibold">Cust Ref #:</span> {j.custRef}</p>}
                  {j.ourRef && <p><span className="font-semibold">Our Ref #:</span> {j.ourRef}</p>}
                </div>
              )}

              {/* Barcode placeholder */}
              <div className="bg-white px-5 pb-4 pt-2 border-t flex flex-col items-center">
                <div className="flex space-x-px">
                  {[3,1,4,1,5,2,3,1,4,2,1,3,5,1,2,4,1,3,2,5,1,4,1,2,3,1,5,2,1,4,3,1,2,5,1].map((w, i) => (
                    <div key={i} style={{ width: w * 2, height: 32 }} className="bg-gray-900" />
                  ))}
                </div>
                <p className="font-mono text-xs text-gray-600 mt-1 tracking-widest">{String(j.id).padStart(6, '0')}</p>
              </div>
            </div>

            <style>{`@media print { @page { size: 4in 6in; margin: 4mm; } }`}</style>
            <div className="px-6 pb-4 text-xs text-gray-400 text-center print:hidden">
              Print on 4×6 inch label paper.
            </div>
        </DraggableModal>
      );
    }
    return (
      <DraggableModal onClose={() => setDocumentPrint(null)} cardClass="w-full max-w-2xl max-h-[95vh] overflow-y-auto">
          <style>{`@media print { @page { size: A4 portrait; margin: 15mm; } }`}</style>
          <div className="flex items-center justify-between px-6 pt-6 pb-2 print:hidden">
            <h2 className="text-lg font-bold">{titles[type]} Preview — Job #{j.id}</h2>
            <div className="flex space-x-2">
              <button onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 flex items-center">
                <Printer className="w-4 h-4 mr-1" />Print
              </button>
              <button onClick={() => setDocumentPrint(null)} className="p-2 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
          </div>

          <div className="px-8 pb-8 pt-4">
            {/* Header */}
            <div className="flex justify-between items-start mb-5">
              <div>
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-800 rounded flex items-center justify-center text-white font-bold text-sm mb-1">TIG</div>
                <h1 className="text-base font-bold text-gray-800">Total Image Group</h1>
                <p className="text-xs text-gray-500">info@totalimage.com.au</p>
              </div>
              <div className="text-right">
                <h2 className="text-xl font-bold text-gray-800 tracking-wide">{titles[type]}</h2>
                <p className="text-sm text-gray-600">Job #: <strong>{j.id}</strong></p>
                {j.invoice && <p className="text-sm text-gray-500">Invoice #: {j.invoice}</p>}
                <p className="text-sm text-gray-500">Date In: {j.dateIn}</p>
                <p className="text-sm text-gray-500">Due: {j.due}</p>
              </div>
            </div>

            {/* Customer / delivery info */}
            <div className="grid grid-cols-2 gap-6 mb-5 border-t border-b py-4">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase mb-1">{type === 'deliveryNote' ? 'Deliver To' : 'Customer'}</p>
                <p className="font-semibold text-gray-800">{j.customer}</p>
                {j.shippingAddress && <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{j.shippingAddress}</p>}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Job Details</p>
                <div className="text-sm text-gray-600 space-y-0.5">
                  <p>Status: <strong>{j.status}</strong></p>
                  <p>Priority: <strong>{j.priority}</strong></p>
                  <p>Type: {j.type}</p>
                  {j.assignedTo && <p>Assigned To: {j.assignedTo}</p>}
                </div>
              </div>
            </div>

            {/* Items table */}
            <table className="w-full text-sm mb-5">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Stock Code</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Description</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Sizes</th>
                  {type === 'pickingSlip' && <th className="text-left px-3 py-2 font-medium text-gray-600">Bin Location</th>}
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Qty</th>
                  {type === 'pickingSlip' && <th className="text-center px-3 py-2 font-medium text-gray-600">Picked ✓</th>}
                </tr>
              </thead>
              <tbody>
                {(j.items || []).filter(item => type !== 'deliveryNote' || !item.hide).map((item, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-3 py-2 font-mono text-xs">{item.stockCode || '—'}</td>
                    <td className="px-3 py-2">{item.description}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{item.sizes || '—'}</td>
                    {type === 'pickingSlip' && (() => {
                      const inv = inventory.find(i => i.sku === item.stockCode);
                      const inStock = inv && inv.stock > 0;
                      return (
                        <td className="px-3 py-2 font-mono text-xs">
                          {inStock
                            ? <span className="text-blue-700 font-medium">{inv.location || '—'}</span>
                            : <span className="text-red-500 font-medium">OUT OF STOCK</span>}
                        </td>
                      );
                    })()}
                    <td className="px-3 py-2 text-right font-medium">{item.order || item.qty || 0}</td>
                    {type === 'pickingSlip' && (
                      <td className="px-3 py-2 text-center">
                        <div className="w-5 h-5 border-2 border-gray-400 rounded inline-block"></div>
                      </td>
                    )}
                  </tr>
                ))}
                {(j.items || []).filter(item => type !== 'deliveryNote' || !item.hide).length === 0 && (
                  <tr><td colSpan="6" className="px-3 py-4 text-center text-gray-400 text-sm">No line items on this job.</td></tr>
                )}
              </tbody>
            </table>

            {/* Picking slip signature */}
            {type === 'pickingSlip' && (
              <div className="grid grid-cols-3 gap-6 text-sm border-t pt-4">
                <div><p className="text-xs text-gray-500 mb-1">Picked by:</p><div className="border-b border-gray-400 h-8"></div></div>
                <div><p className="text-xs text-gray-500 mb-1">Date / Time:</p><div className="border-b border-gray-400 h-8"></div></div>
                <div><p className="text-xs text-gray-500 mb-1">QC Checked by:</p><div className="border-b border-gray-400 h-8"></div></div>
              </div>
            )}

            {/* Delivery note signatures */}
            {type === 'deliveryNote' && (
              <div className="grid grid-cols-2 gap-6 text-sm border-t pt-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Driver / Despatcher Signature:</p>
                  <div className="border-b border-gray-400 h-12 mb-1"></div>
                  <p className="text-xs text-gray-400">Name: _____________________ Date: __________</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Received by (Customer):</p>
                  <div className="border-b border-gray-400 h-12 mb-1"></div>
                  <p className="text-xs text-gray-400">Name: _____________________ Date: __________</p>
                </div>
              </div>
            )}

            {/* Job sheet extras */}
            {type === 'jobSheet' && (
              <div className="border-t pt-4 space-y-4">
                {j.notes && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Special Instructions / Notes</p>
                    <div className="border rounded p-3 text-sm text-gray-700 min-h-12">{j.notes}</div>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div><p className="text-xs text-gray-500 mb-1">Production Start:</p><div className="border-b border-gray-400 h-8"></div></div>
                  <div><p className="text-xs text-gray-500 mb-1">Production End:</p><div className="border-b border-gray-400 h-8"></div></div>
                  <div><p className="text-xs text-gray-500 mb-1">QC Pass / Fail:</p><div className="border-b border-gray-400 h-8"></div></div>
                </div>
              </div>
            )}

            <div className="mt-6 pt-3 border-t text-xs text-gray-400 text-center">
              Total Image Group — {titles[type]} — Printed {new Date().toLocaleString()}
            </div>
          </div>
      </DraggableModal>
    );
  };

  return (
    <div className="h-screen bg-[#edf2f7] flex flex-col overflow-hidden">

      {/* ── Jim2-style: TIG System Menu + Module Tabs ── */}
      <header className="shrink-0 bg-[#1e3a8a] flex items-stretch select-none z-40 shadow-md" style={{ minHeight: 26, maxHeight: 26 }}>
        {/* TIG System Menu Button */}
        <div className="relative shrink-0">
          <button
            onClick={() => setTigMenuOpen(o => !o)}
            className={`h-full px-3 flex items-center gap-1 border-r border-blue-900 text-[11px] font-bold transition-colors ${tigMenuOpen ? 'bg-white text-[#1e3a8a]' : 'hover:bg-blue-800 text-white'}`}
          >
            <span className="font-black tracking-wide">TIG</span>
            <ChevronDown className="w-2.5 h-2.5 opacity-70" />
          </button>
          {tigMenuOpen && (
            <div className="absolute left-0 top-full z-[9999] bg-white border border-gray-300 shadow-2xl min-w-[200px] text-[12px] py-1 rounded-b-md" onClick={() => setTigMenuOpen(false)}>
              <button onClick={() => { setShowUserSettings(true); setChangePasswordMsg(''); }} className="w-full text-left px-4 py-1.5 hover:bg-[#1e3a8a] hover:text-white flex items-center gap-2.5 text-gray-700">
                <User className="w-3.5 h-3.5 shrink-0" /> User Preferences
              </button>
              <div className="border-t border-gray-200 my-0.5" />
              <button className="w-full text-left px-4 py-1.5 hover:bg-[#1e3a8a] hover:text-white flex items-center gap-2.5 text-gray-700">
                <RefreshCw className="w-3.5 h-3.5 shrink-0" /> New Session
              </button>
              <button className="w-full text-left px-4 py-1.5 hover:bg-[#1e3a8a] hover:text-white flex items-center gap-2.5 text-gray-700">
                <LayoutGrid className="w-3.5 h-3.5 shrink-0" /> Calculator
              </button>
              <button className="w-full text-left px-4 py-1.5 hover:bg-[#1e3a8a] hover:text-white flex items-center gap-2.5 text-gray-700">
                <Settings className="w-3.5 h-3.5 shrink-0" /> Shortcuts
              </button>
              <div className="border-t border-gray-200 my-0.5" />
              <button className="w-full text-left px-4 py-1.5 hover:bg-[#1e3a8a] hover:text-white flex items-center gap-2.5 text-gray-700">
                <BookOpen className="w-3.5 h-3.5 shrink-0" /> Help
              </button>
              <button className="w-full text-left px-4 py-1.5 hover:bg-[#1e3a8a] hover:text-white flex items-center gap-2.5 text-gray-700">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> About
              </button>
              <div className="border-t border-gray-200 my-0.5" />
              <button onClick={onLogout} className="w-full text-left px-4 py-1.5 hover:bg-red-600 hover:text-white flex items-center gap-2.5 text-gray-700">
                <LogOut className="w-3.5 h-3.5 shrink-0" /> Log Off
              </button>
            </div>
          )}
        </div>

        {/* Module Tabs — Jim2 exact set */}
        <nav className="flex items-stretch flex-1 overflow-x-auto scrollbar-none">
          {[
            { id: 'jobs',               label: 'Jobs' },
            { id: 'projects',           label: 'Projects' },
            { id: 'assets',             label: 'Assets' },
            { id: 'quotes',             label: 'Quotes' },
            { id: 'purchase-orders',    label: 'Purchases' },
            { id: 'card-files',         label: 'CardFiles' },
            { id: 'order-requirements', label: 'Items' },
            { id: 'inventory',          label: 'Stock' },
            { id: 'styles',             label: 'Styles' },
            { id: 'accounts',           label: 'Accounts' },
            { id: 'reports',            label: 'Management' },
            { id: 'dashboard',          label: 'Dashboard' },
            { id: 'scheduling',         label: 'Scheduling' },
            { id: 'email',              label: 'Email' },
            { id: 'ebusiness',          label: 'eBusiness' },
            { id: 'documents',          label: 'Documents' },
            { id: 'import',             label: 'Tools' },
            { id: 'settings',           label: 'Settings' },
            { id: 'user-management',    label: 'Users', adminOnly: true },
          ].filter(m => !m.adminOnly || currentUser?.role === 'admin').map(m => (
            <button
              key={m.id}
              onClick={() => { setActiveModule(m.id); setSearchTerm(''); }}
              className={`px-3 text-[11px] font-medium border-r border-blue-900/40 whitespace-nowrap transition-colors ${
                activeModule === m.id
                  ? 'bg-white text-[#1e3a8a] font-semibold'
                  : 'text-blue-200 hover:bg-blue-800 hover:text-white'
              }`}
            >{m.label}</button>
          ))}
        </nav>

        {/* Right: F12 + Ctrl+K + Refresh + Notifications + User + Logout */}
        <div className="flex items-center gap-0.5 px-2 border-l border-blue-900 shrink-0">
          <button onClick={() => { setGlobalSearchOpen(true); setGlobalSearchQuery(''); setTimeout(() => globalSearchRef.current?.focus(), 50); }} title="Global Search (Ctrl+K)" className="px-2 py-0.5 bg-blue-700 hover:bg-blue-600 rounded text-[10px] font-mono text-white mr-1 flex items-center gap-1"><Search className="w-3 h-3" /><span className="hidden sm:inline">Ctrl+K</span></button>
          <button onClick={() => setF12Open(true)} title="F12 Quick Job Search" className="px-2 py-0.5 bg-blue-700 hover:bg-blue-600 rounded text-[10px] font-mono text-white mr-1">F12</button>
          <button onClick={() => queryClient.invalidateQueries()} title="Refresh All" className="p-1 hover:bg-blue-800 rounded text-blue-300 hover:text-white">
            <RefreshCw className="w-3 h-3" />
          </button>
          <div className="relative">
            <button onClick={() => setNotifOpen(o => !o)} className="p-1 hover:bg-blue-800 rounded text-blue-300 hover:text-white relative" title="Notifications">
              <Bell className="w-3 h-3" />
              {notifications.length > 0 && (
                <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full text-white text-[7px] flex items-center justify-center leading-none">
                  {notifications.length > 9 ? '9+' : notifications.length}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-full mt-1 w-80 bg-white rounded-xl shadow-2xl border z-50 max-h-96 overflow-y-auto" onMouseLeave={() => setNotifOpen(false)}>
                <div className="flex items-center justify-between px-4 py-3 border-b">
                  <h3 className="font-semibold text-sm">Notifications</h3>
                  <span className="text-xs text-gray-400">{notifications.length} active</span>
                </div>
                {notifications.length === 0
                  ? <p className="text-center text-sm text-gray-400 py-8">All clear — no alerts</p>
                  : <div className="divide-y">{notifications.map(n => (
                      <div key={n.id} className={`px-4 py-3 flex items-start gap-3 ${n.type === 'error' ? 'hover:bg-red-50' : 'hover:bg-yellow-50'}`}>
                        <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${n.type === 'error' ? 'text-red-500' : 'text-yellow-500'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">{n.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{n.message}</p>
                        </div>
                      </div>
                    ))}</div>
                }
              </div>
            )}
          </div>
          <div className="w-px h-4 bg-blue-700 mx-1" />
          <button onClick={() => { setShowUserSettings(true); setChangePasswordMsg(''); }} className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-blue-800 rounded">
            <div className="w-4 h-4 rounded-full bg-blue-400 flex items-center justify-center text-white font-bold text-[9px] shrink-0">
              {(currentUser?.full_name || currentUser?.username || '?')[0].toUpperCase()}
            </div>
            <span className="text-[10px] text-blue-200 hidden sm:block max-w-[80px] truncate">{currentUser?.username}</span>
          </button>
          <button onClick={onLogout} title="Sign out" className="p-1 hover:bg-blue-800 rounded text-blue-300 hover:text-red-300">
            <LogOut className="w-3 h-3" />
          </button>
        </div>
      </header>

      {/* ── Ribbon Toolbar ── */}
      <div className="shrink-0 bg-[#f4f6f9] border-b border-slate-300 overflow-x-auto">
        <div className="flex items-end min-h-[58px] px-1 pb-1 gap-0">

          {/* ── JOBS ribbon ── */}
          {activeModule === 'jobs' && (<>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button onClick={() => openModal('job')} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px]">
                <Plus className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Add Job</span>
              </button>
              <button onClick={() => { if (activeJob) { setShowJobDetail(true); setActiveModule('jobs'); } }} disabled={!activeJob} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] disabled:opacity-40">
                <Eye className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">View Job</span>
              </button>
              <button onClick={() => setJobListModal(m => ({ ...m, open: true }))} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px]">
                <ClipboardList className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Create List</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Truck className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Return</span>
              </button>
              <button onClick={() => setSalesRegModal(m => ({ ...m, open: true, data: null, error: '' }))} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px]">
                <DollarSign className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Sales Reg.</span>
              </button>
              <button disabled={!activeJob} onClick={() => activeJob && setDispatchModal(m => ({ ...m, open: true, job: activeJob, shipVia: '', shipRef: '', cartons: 1, notes: '', error: '' }))} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] disabled:opacity-40">
                <Box className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Dispatch</span>
              </button>
              <button disabled={!activeJob} onClick={() => activeJob && setPaymentModal({ show: true, jobId: activeJob.id, maxAmount: activeJob.totalInc || 0, amount: '', method: 'Credit Card' })} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] disabled:opacity-40">
                <CreditCard className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Payment</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Download className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Import Jobs</span>
              </button>
            </div>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button
                disabled={!activeJob || !['INVOICE','PAID'].includes(activeJob?.status)}
                onClick={() => activeJob && setUnprintModal({ open: true, job: activeJob, loading: false, error: '' })}
                title={!activeJob ? 'Open a job first' : !['INVOICE','PAID'].includes(activeJob?.status) ? `Only available on INVOICE or PAID jobs (current: ${activeJob?.status})` : 'Revert this job from invoiced back to FINISH'}
                className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] disabled:opacity-40"
              >
                <Printer className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Unprint</span>
              </button>
              <button disabled={!activeJob} onClick={() => activeJob && setInvoiceJob(activeJob)} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] disabled:opacity-40">
                <FileText className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Invoice Job</span>
              </button>
            </div>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button disabled={!activeJob} onClick={() => activeJob && openModal('job', activeJob)} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] disabled:opacity-40">
                <Edit className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Edit</span>
              </button>
              <button disabled={!activeJob} onClick={() => activeJob && cloneJob(activeJob)} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] disabled:opacity-40">
                <Copy className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Clone</span>
              </button>
            </div>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Plus className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">New</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Layers className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Related</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Send className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Reply</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Mail className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Forward</span>
              </button>
              <button disabled={!activeJob} onClick={() => activeJob && setDocumentPrint({ type: 'job', job: activeJob })} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] disabled:opacity-40">
                <Eye className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Preview</span>
              </button>
            </div>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button disabled={!activeJob} onClick={() => activeJob && setDocumentPrint({ type: 'job', job: activeJob })} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] disabled:opacity-40">
                <Printer className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Print</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Mail className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Email</span>
              </button>
              <button onClick={() => { const filtered = jobs.filter(j => filterStatus === 'all' || j.status === filterStatus); exportToCSV(filtered.map(j => ({ ID: j.id, Customer: j.customer, Status: j.status, DateIn: j.dateIn, Due: j.due, Invoice: j.invoice || '', Total: j.total, Balance: j.balanceDue, Priority: j.priority })), 'jobs'); }} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px]">
                <FileSpreadsheet className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Excel</span>
              </button>
              <div className="relative">
                <button
                  disabled={!activeJob}
                  onClick={() => setReportDropdownOpen(o => !o)}
                  className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] disabled:opacity-40"
                  title={activeJob ? 'Print a report for this job' : 'Open a job first'}
                >
                  <BarChart3 className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Report ▾</span>
                </button>
                {reportDropdownOpen && activeJob && (
                  <div
                    className="absolute left-0 top-full z-[9999] bg-white border border-gray-300 shadow-2xl min-w-[230px] py-1 text-[12px]"
                    onMouseLeave={() => setReportDropdownOpen(false)}
                    onClick={() => setReportDropdownOpen(false)}
                  >
                    {[
                      { type: 'jobSheet',     label: 'TIG Job Sheet',                       action: () => setDocumentPrint({ type: 'jobSheet',     job: activeJob }) },
                      { type: 'pickingSlip',  label: 'TIG Picking Slip',                    action: () => setDocumentPrint({ type: 'pickingSlip',  job: activeJob }) },
                      { type: 'deliveryNote', label: 'TIG Delivery Note',                   action: () => setDocumentPrint({ type: 'deliveryNote', job: activeJob }) },
                      { type: 'shipLabel',    label: 'Job Label',                           action: () => setDocumentPrint({ type: 'shipLabel',    job: activeJob }) },
                      { type: 'shipLabel',    label: 'Ship Label – Total Image',            action: () => setDocumentPrint({ type: 'shipLabel',    job: activeJob }) },
                      { type: 'deliveryNote', label: 'TIG Delivery Note – NZ',              action: () => setDocumentPrint({ type: 'deliveryNote', job: activeJob }) },
                      null,
                      { type: 'invoice',      label: 'TIG TAX Proforma Invoice',            action: () => setInvoiceJob(activeJob) },
                      { type: 'invoice',      label: 'TIG TAX Proforma Invoice Balance ONLY', disabled: true, action: () => {} },
                      null,
                      { type: 'pdf-job-sheet',    label: 'Download Job Sheet (PDF)',    action: () => window.open(`/api/jobs/${activeJob?.id}/pdf?type=job-sheet`, '_blank') },
                      { type: 'pdf-picking-slip', label: 'Download Picking Slip (PDF)', action: () => window.open(`/api/jobs/${activeJob?.id}/pdf?type=picking-slip`, '_blank') },
                      { type: 'pdf-invoice',      label: 'Download Invoice (PDF)',      action: () => window.open(`/api/jobs/${activeJob?.id}/pdf?type=${activeJob?.status === 'QUOTE' ? 'quote' : 'invoice'}`, '_blank') },
                    ].map((r, i) =>
                      r === null
                        ? <div key={i} className="border-t border-gray-200 my-0.5" />
                        : (
                          <button
                            key={i}
                            disabled={r.disabled}
                            onClick={r.action}
                            className={`w-full text-left px-4 py-1.5 flex items-center gap-2.5 ${r.disabled ? 'text-gray-300 cursor-default' : 'hover:bg-[#1e3a8a] hover:text-white text-gray-700'}`}
                          >
                            <FileText className="w-3.5 h-3.5 shrink-0" />{r.label}
                          </button>
                        )
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-end gap-0">
              <button
                disabled={!activeJob}
                title={activeJob ? 'View job notes & internal comments' : 'Open a job first'}
                onClick={() => { if (activeJob) { pinJob(activeJob); setShowJobDetail(true); } }}
                className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] disabled:opacity-40"
              >
                <BookOpen className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Scripts</span>
              </button>
            </div>
          </>)}

          {/* ── PURCHASES ribbon ── */}
          {activeModule === 'purchase-orders' && (<>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button onClick={() => openModal('purchaseOrder')} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px]">
                <Plus className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Add Purchase</span>
              </button>
              <button disabled={!selectedPO} onClick={() => selectedPO && openModal('purchaseOrder', selectedPO)} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] disabled:opacity-40">
                <Edit className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">View/Edit</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <ClipboardList className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">PO List</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Truck className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Return to Vendor</span>
              </button>
            </div>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Printer className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Unprint</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Settings className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">PO Other</span>
              </button>
            </div>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Box className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Pick/Pack</span>
              </button>
            </div>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Mail className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Email Actions</span>
              </button>
            </div>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <BarChart3 className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Job Reports</span>
              </button>
            </div>
            <div className="flex items-end gap-0">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <BookOpen className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Scripts</span>
              </button>
            </div>
          </>)}

          {/* ── CARDFILES ribbon ── */}
          {activeModule === 'card-files' && (<>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button onClick={() => setCardFileModal({ open: true, editing: null })} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px]">
                <Plus className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Add CardFile</span>
              </button>
              <button disabled={!selectedCardFile} onClick={() => selectedCardFile && setCardFileModal({ open: true, editing: selectedCardFile })} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] disabled:opacity-40">
                <Edit className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">View/Edit</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <ClipboardList className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Create List</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Clock className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Time Sheets</span>
              </button>
              <button onClick={() => setCardFileModal({ open: true, editing: null })} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px]">
                <User className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Quick Add</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Layers className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Merge</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Users className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Reassign</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <CreditCard className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Payment</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Settings className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">CF Other</span>
              </button>
            </div>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Plus className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">New</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Layers className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Related</span>
              </button>
            </div>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Printer className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Print</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Mail className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Email</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <FileSpreadsheet className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Excel</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <BarChart3 className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Report ▾</span>
              </button>
            </div>
            <div className="flex items-end gap-0">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <BookOpen className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Scripts</span>
              </button>
            </div>
          </>)}

          {/* ── ITEMS (order-requirements) ribbon ── */}
          {activeModule === 'order-requirements' && (<>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button onClick={() => openModal('inventory')} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px]">
                <Plus className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Add Item</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Edit className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">View/Edit Item</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <ClipboardList className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Create Item List</span>
              </button>
            </div>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Plus className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">New</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Layers className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Related</span>
              </button>
            </div>
          </>)}

          {/* ── STOCK (inventory) ribbon ── */}
          {activeModule === 'inventory' && (<>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button onClick={() => openModal('inventory')} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px]">
                <Plus className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Add Stock</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Edit className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">View/Edit Stock</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <ClipboardList className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Create List</span>
              </button>
              <button onClick={() => setTransferModal(m => ({ ...m, open: true, fromSku: '', toSku: '', toLocation: '', quantity: 1, reference: '', notes: '', error: '' }))} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px]">
                <RefreshCw className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Transfer Stock</span>
              </button>
              <button onClick={() => setStockAdjustModal(m => ({ ...m, show: true }))} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px]">
                <Settings className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Stock Adjustments</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <ShoppingCart className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Procurement</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Package className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Packaging</span>
              </button>
              <button onClick={() => setActiveModule('warehouse')} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px]">
                <Warehouse className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Warehouse Mgmt</span>
              </button>
              <button onClick={() => setStocktakeModal(m => ({ ...m, open: true, method: 'Informed', reference: '', items: inventory.map(i => ({ sku: i.sku, name: i.name, currentStock: i.stock, countedQty: i.stock, notes: '' })), results: null, error: '' }))} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px]">
                <CheckSquare className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Stocktake</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Tag className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Promo Pricing</span>
              </button>
              <button onClick={() => { setStockFlowModal({ open: true, loading: true, data: null, search: '' }); api.inventory.stockFlow().then(d => setStockFlowModal(m => ({ ...m, loading: false, data: d }))).catch(e => setStockFlowModal(m => ({ ...m, loading: false, data: [] }))); }} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px]">
                <TrendingUp className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Stock Flow</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Settings className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Stock Other</span>
              </button>
            </div>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Printer className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Unprint</span>
              </button>
            </div>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Box className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Pick/Pack</span>
              </button>
            </div>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Mail className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Email Actions</span>
              </button>
            </div>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <BarChart3 className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Job Reports</span>
              </button>
            </div>
            <div className="flex items-end gap-0">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <BookOpen className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Scripts</span>
              </button>
            </div>
          </>)}

          {/* ── ACCOUNTS ribbon ── */}
          {activeModule === 'accounts' && (<>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px]">
                <DollarSign className="w-5 h-5 text-indigo-600" /><span className="text-[9px] text-indigo-700 whitespace-nowrap font-semibold">AP Bills</span>
              </button>
              {[['Users','Debtors (AR)'],['BarChart3','GST/BAS']].map(([, lbl]) => (
                <button key={lbl} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                  <DollarSign className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">{lbl}</span>
                </button>
              ))}
            </div>
          </>)}

          {/* ── MANAGEMENT (reports) ribbon ── */}
          {activeModule === 'reports' && (<>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button onClick={() => setActiveModule('reports')} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px]">
                <BarChart3 className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Reports</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <PieChart className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Business Analysis</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <DollarSign className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Budgets</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <TrendingUp className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Cash Flow</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <TrendingUp className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Commission Rates</span>
              </button>
            </div>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Settings className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Management</span>
              </button>
            </div>
            <div className="flex items-end gap-0">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Plus className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">New</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Layers className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Related</span>
              </button>
            </div>
          </>)}

          {/* ── DASHBOARD ribbon ── */}
          {activeModule === 'dashboard' && (<>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button onClick={() => setActiveModule('dashboard')} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px]">
                <LayoutGrid className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Mgmt Dashboard</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <User className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Security</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <LayoutGrid className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Dashboard Board</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Edit className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Edit</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Trash2 className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Delete</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <LayoutGrid className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Select Layout</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Layers className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Combine Layout</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Plus className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Add Widget</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Settings className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Manage Widget</span>
              </button>
            </div>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <LayoutGrid className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Widgets</span>
              </button>
            </div>
            <div className="flex items-end gap-0">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Plus className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">New</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Layers className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Related</span>
              </button>
            </div>
          </>)}

          {/* ── SCHEDULING ribbon ── */}
          {activeModule === 'scheduling' && (<>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              {['Schedule','Task','Day','Work Week','Week','Month','Year','Timeline','Current Job','Scheduler View'].map(lbl => (
                <button key={lbl} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                  <Calendar className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">{lbl}</span>
                </button>
              ))}
            </div>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Layers className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Group By</span>
              </button>
            </div>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Search className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Filters</span>
              </button>
            </div>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Users className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Resources</span>
              </button>
            </div>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Settings className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Manage Views</span>
              </button>
            </div>
            <div className="flex items-end gap-0">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Eye className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Views</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Plus className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">New</span>
              </button>
            </div>
          </>)}

          {/* ── EMAIL ribbon ── */}
          {activeModule === 'email' && (<>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              {['Create List','Email Rules','Templates','Editor','Archive','Email Security','Send/Receive','Delete','Unread/Read','Move'].map(lbl => (
                <button key={lbl} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                  <Mail className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">{lbl}</span>
                </button>
              ))}
            </div>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Mail className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Email</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Settings className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Email Other</span>
              </button>
            </div>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Send className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Email Actions</span>
              </button>
            </div>
            <div className="flex items-end gap-0">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Plus className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">New</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Layers className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Related</span>
              </button>
            </div>
          </>)}

          {/* ── eBUSINESS ribbon ── */}
          {activeModule === 'ebusiness' && (<>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Package className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Vendor Stock Feeds</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Download className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Import Vendor Prices</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Users className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Customer Feeds</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <ExternalLink className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">eBusiness Trans.</span>
              </button>
            </div>
            <div className="flex items-end gap-0">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Plus className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">New</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Layers className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Related</span>
              </button>
            </div>
          </>)}

          {/* ── DOCUMENTS ribbon ── */}
          {activeModule === 'documents' && (<>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              {['Add Document','View/Edit','Create List','Open','Save Properties','Delete','Actions','Checkout','Cancel Checkout','Large Icons','Show Hidden','List Layout'].map(lbl => (
                <button key={lbl} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                  <FileText className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">{lbl}</span>
                </button>
              ))}
            </div>
            <div className="flex items-end gap-0">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Plus className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">New</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Layers className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Related</span>
              </button>
            </div>
          </>)}

          {/* ── TOOLS (import) ribbon ── */}
          {activeModule === 'import' && (<>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Settings className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Options</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Settings className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Setup</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <AlertCircle className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Status</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <AlertCircle className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Watchouts</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <DollarSign className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Currency Rates</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Users className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Groups</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <User className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Security</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Clock className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">History</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <ExternalLink className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Integration Config</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <BookOpen className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Scripting Engine</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <BarChart3 className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Report Designer</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px]">
                <Download className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Import Data</span>
              </button>
            </div>
            <div className="flex items-end gap-0">
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Settings className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Tools</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Settings className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Tools Other</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <CreditCard className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Tools Accounts</span>
              </button>
            </div>
          </>)}

          {/* ── SETTINGS ribbon ── */}
          {activeModule === 'settings' && (<>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              {['Company','Bank & Payments','SMTP'].map(lbl => (
                <button key={lbl} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px]">
                  <Settings className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">{lbl}</span>
                </button>
              ))}
            </div>
          </>)}

          {/* ── USER MANAGEMENT ribbon ── */}
          {activeModule === 'user-management' && (<>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button onClick={() => {}} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px]">
                <Users className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Users</span>
              </button>
            </div>
          </>)}

          {/* ── CUSTOMERS ribbon (hidden tab, accessible via nav) ── */}
          {activeModule === 'customers' && (<>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button onClick={() => openModal('customer')} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px]">
                <Plus className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">New Customer</span>
              </button>
            </div>
          </>)}

          {/* ── SUPPLIERS ribbon ── */}
          {activeModule === 'suppliers' && (<>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button onClick={() => openModal('supplier')} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px]">
                <Plus className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">New Supplier</span>
              </button>
            </div>
          </>)}

          {/* ── WAREHOUSE ribbon ── */}
          {activeModule === 'warehouse' && (<>
            <div className="flex items-end gap-0 pr-2 mr-1 border-r border-gray-300">
              <button onClick={() => setActiveModule('inventory')} className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px]">
                <Package className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Stock Items</span>
              </button>
              <button className="flex flex-col items-center px-2 py-1 hover:bg-slate-200 rounded gap-0.5 min-w-[46px] opacity-40 cursor-default">
                <Warehouse className="w-5 h-5 text-gray-600" /><span className="text-[9px] text-gray-600 whitespace-nowrap">Bin Map</span>
              </button>
            </div>
          </>)}

        </div>
      </div>

      {/* ── Attention Bar — always-visible live KPIs (NetSuite / BC style) ── */}
      <div className="shrink-0 bg-white border-b border-gray-200 flex items-center h-7 select-none overflow-x-auto">
        {[
          { label: 'Overdue',    count: dashboardStats.overdueJobs.length, urgent: dashboardStats.overdueJobs.length > 0, icon: AlertCircle, iconColor: 'text-red-500',    bg: 'hover:bg-red-50',    text: 'text-red-600',    border: 'border-red-100',    action: () => { setActiveModule('jobs'); setFilterStatus('all'); setSearchTerm(''); } },
          { label: 'Due Today',  count: dashboardStats.dueToday.length,    urgent: dashboardStats.dueToday.length > 0,    icon: Clock,       iconColor: 'text-orange-500', bg: 'hover:bg-orange-50', text: 'text-orange-600', border: 'border-orange-100', action: () => { setActiveModule('jobs'); } },
          { label: 'To Invoice', count: dashboardStats.toInvoice,          urgent: dashboardStats.toInvoice > 0,          icon: FileText,    iconColor: 'text-purple-500', bg: 'hover:bg-purple-50', text: 'text-purple-600', border: 'border-purple-100', action: () => { setActiveModule('jobs'); setFilterStatus('FINISH'); } },
          { label: 'Low Stock',  count: dashboardStats.lowStock,           urgent: dashboardStats.lowStock > 0,           icon: Package,     iconColor: 'text-amber-500',  bg: 'hover:bg-amber-50',  text: 'text-amber-600',  border: 'border-amber-100',  action: () => setActiveModule('inventory') },
          { label: 'In Prod.',   count: dashboardStats.inProduction,       urgent: false,                                 icon: Layers,      iconColor: 'text-blue-500',   bg: 'hover:bg-blue-50',   text: 'text-blue-600',   border: 'border-blue-100',   action: () => setActiveModule('jobs') },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.label} onClick={item.action}
              className={`flex items-center gap-1.5 px-3 h-full border-r border-gray-200 text-[11px] font-medium transition-colors whitespace-nowrap ${item.bg} ${item.urgent ? item.text : 'text-gray-500'}`}>
              <Icon className={`w-3 h-3 shrink-0 ${item.urgent ? item.iconColor : 'text-gray-300'}`} />
              <span className={`font-bold tabular-nums ${item.urgent ? '' : 'text-gray-400'}`}>{item.count}</span>
              <span className={item.urgent ? 'opacity-90' : 'opacity-60'}>{item.label}</span>
            </button>
          );
        })}
        <div className="flex-1" />
        {dashboardStats.overdueJobs.length === 0 && dashboardStats.dueToday.length === 0 && dashboardStats.toInvoice === 0 && (
          <span className="text-[10px] text-emerald-600 font-medium px-3 flex items-center gap-1"><CheckSquare className="w-3 h-3" />All caught up</span>
        )}
        <span className="text-[10px] text-gray-400 px-3 border-l border-gray-200 whitespace-nowrap hidden lg:block">
          {new Date().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      </div>

      {/* ── Content Row ── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Nav Tree ── */}
        <aside className="w-52 bg-white border-r border-gray-200 flex flex-col shrink-0 overflow-hidden select-none">
          <div className="flex-1 overflow-y-auto">
            {navTreeTab === 'navigation' ? (
              <div className="py-0.5">
                {[
                  { id: 'jobs',               label: 'Jobs',       icon: FileText    },
                  { id: 'projects',           label: 'Projects',   icon: ClipboardList },
                  { id: 'assets',             label: 'Assets',     icon: Package     },
                  { id: 'quotes',             label: 'Quotes',     icon: FileText    },
                  { id: 'purchase-orders',    label: 'Purchases',  icon: ShoppingCart },
                  { id: 'card-files',         label: 'CardFiles',  icon: Users       },
                  { id: 'order-requirements', label: 'Items',      icon: Tag         },
                  { id: 'inventory',          label: 'Stock',      icon: Package     },
                  { id: 'styles',             label: 'Styles',     icon: Layers      },
                  { id: 'accounts',           label: 'Accounts',   icon: DollarSign  },
                  { id: 'reports',            label: 'Management', icon: BarChart3   },
                  { id: 'dashboard',          label: 'Dashboard',  icon: LayoutGrid  },
                  { id: 'scheduling',         label: 'Scheduling', icon: Calendar    },
                  { id: 'email',              label: 'Email',      icon: Mail        },
                  { id: 'ebusiness',          label: 'eBusiness',  icon: ExternalLink },
                  { id: 'documents',          label: 'Documents',  icon: FileSpreadsheet },
                  { id: 'import',             label: 'Tools',      icon: Settings    },
                ].map(mod => {
                  const isActive = activeModule === mod.id;
                  const isExpanded = !!navExpanded[mod.id];
                  const ModIcon = mod.icon;
                  const hasChildren = mod.id === 'jobs' && pinnedJobs.length > 0;
                  return (
                    <div key={mod.id}>
                      <div
                        className={`flex items-center gap-1 px-1.5 py-1 cursor-pointer transition-colors text-[11px] ${isActive ? 'bg-[#cce0f5] text-[#1e3a8a] border-l-2 border-l-[#1e3a8a]' : 'hover:bg-gray-100 text-gray-700'}`}
                        onClick={() => { setActiveModule(mod.id); setSearchTerm(''); }}
                        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setNavCtxMenu({ open: true, x: e.clientX, y: e.clientY, itemId: mod.id, pinnedJobId: null }); }}
                      >
                        <button
                          onClick={e => { e.stopPropagation(); if (hasChildren) setNavExpanded(p => ({ ...p, [mod.id]: !p[mod.id] })); }}
                          className={`w-3.5 h-3.5 shrink-0 flex items-center justify-center text-gray-400 rounded hover:text-gray-600 ${!hasChildren ? 'invisible' : ''}`}
                        >
                          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </button>
                        <ModIcon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-[#1e3a8a]' : 'text-gray-400'}`} />
                        <span className={`flex-1 truncate leading-tight ${isActive ? 'font-semibold' : ''}`}>{mod.label}</span>
                      </div>
                      {/* Expanded pinned jobs under Jobs node */}
                      {mod.id === 'jobs' && isExpanded && pinnedJobs.length > 0 && (
                        <div className="ml-5 border-l border-gray-200">
                          {[...pinnedJobs].sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true })).map(pj => {
                            const isJobActive = activeJob?.id === pj.id && showJobDetail && activeModule === 'jobs';
                            const SC = { QUOTE:'bg-gray-100 text-gray-600', New:'bg-blue-100 text-blue-700', ORDER:'bg-indigo-100 text-indigo-700', 'In Progress':'bg-yellow-100 text-yellow-800', PROOF:'bg-purple-100 text-purple-700', PRINT:'bg-orange-100 text-orange-700', 'Pick/Pack':'bg-cyan-100 text-cyan-700', FINISH:'bg-green-100 text-green-800', INVOICE:'bg-teal-100 text-teal-700', PAID:'bg-emerald-100 text-emerald-800', CANCEL:'bg-red-100 text-red-700' };
                            return (
                              <div
                                key={pj.id}
                                className={`group flex items-center gap-1 px-2 py-1 cursor-pointer transition-colors border-b border-gray-50 ${isJobActive ? 'bg-[#cce0f5] border-l-2 border-l-[#1e3a8a]' : 'hover:bg-blue-50'}`}
                                onClick={() => { setActiveJob(pj); setShowJobDetail(true); setActiveModule('jobs'); }}
                                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setNavCtxMenu({ open: true, x: e.clientX, y: e.clientY, itemId: 'jobs', pinnedJobId: pj.id }); }}
                              >
                                <FileText className="w-3 h-3 text-gray-300 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className={`text-[10px] font-mono font-bold leading-none ${isJobActive ? 'text-[#1e3a8a]' : 'text-gray-700'}`}>{pj.id}</p>
                                  <p className="text-[9px] text-gray-400 truncate leading-tight">{pj.customer || pj.customerName}</p>
                                  {pj.status && <span className={`inline-block text-[8px] px-1 rounded mt-0.5 font-medium ${SC[pj.status] || 'bg-gray-100 text-gray-500'}`}>{pj.status}</span>}
                                </div>
                                <button onClick={e => { e.stopPropagation(); unpinJob(pj.id); }} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 shrink-0">
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-3">
                <p className="text-[10px] text-gray-400 text-center py-6">No search results</p>
              </div>
            )}
          </div>

          {/* Bottom: Navigation | Search Results tabs */}
          <div className="border-t border-gray-200 flex shrink-0 bg-gray-50">
            <button
              onClick={() => setNavTreeTab('navigation')}
              className={`flex-1 py-1.5 text-[10px] font-medium text-center transition-colors ${navTreeTab === 'navigation' ? 'bg-white text-[#1e3a8a] border-t-2 border-t-[#1e3a8a]' : 'text-gray-500 hover:bg-gray-100'}`}
            >Navigation</button>
            <button
              onClick={() => setNavTreeTab('search-results')}
              className={`flex-1 py-1.5 text-[10px] font-medium text-center transition-colors border-l border-gray-200 ${navTreeTab === 'search-results' ? 'bg-white text-[#1e3a8a] border-t-2 border-t-[#1e3a8a]' : 'text-gray-500 hover:bg-gray-100'}`}
            >Search Results</button>
          </div>
        </aside>

        {/* ── Main content column ── */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <main className="flex-1 p-4 overflow-auto">
            {loading && (
              <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading data...</div>
            )}
            {apiError && (
              <div className="mb-4 flex items-center justify-between bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                <span>{apiError}</span>
                <button onClick={() => setApiError('')} className="ml-4 text-red-400 hover:text-red-600">✕</button>
              </div>
            )}
            {!loading && activeModule === 'dashboard'          && renderDashboard()}
            {!loading && activeModule === 'jobs'               && renderJobs()}
            {!loading && activeModule === 'order-requirements' && renderOrderRequirements()}
            {!loading && activeModule === 'inventory'          && renderInventory()}
            {!loading && activeModule === 'customers'          && renderCustomers()}
            {!loading && activeModule === 'suppliers'          && renderSuppliers()}
            {!loading && activeModule === 'purchase-orders'    && renderPurchaseOrders()}
            {!loading && activeModule === 'reports'            && renderReports()}
            {!loading && activeModule === 'warehouse'          && renderWarehouse()}
            {!loading && activeModule === 'scheduling'         && renderScheduling()}
            {!loading && activeModule === 'card-files'         && renderCardFiles()}
            {activeModule === 'import'                         && renderImport()}
            {!loading && activeModule === 'email'              && <EmailModule jobs={jobs} />}
            {!loading && activeModule === 'settings'           && <SettingsModule currentUser={currentUser} />}
            {!loading && activeModule === 'user-management'    && <UserManagement currentUser={currentUser} />}
            {!loading && activeModule === 'styles'             && <StylesModule />}
            {!loading && activeModule === 'accounts' && (
              <AccountsPayableModule suppliers={suppliers} />
            )}
            {!loading && ['ebusiness','documents','projects','assets','quotes'].includes(activeModule) && (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <Settings className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-lg font-medium text-gray-500 capitalize">{activeModule.replace(/-/g,' ')}</p>
                <p className="text-sm text-gray-400 mt-1">This module is coming soon</p>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* ── Status Bar ── */}
      <div className="shrink-0 bg-[#e0e0e0] border-t border-gray-300 flex items-center px-3 gap-3 text-[10px] text-gray-600" style={{ height: 20 }}>
        <span className="font-semibold">User:</span><span>{currentUser?.full_name || currentUser?.username}</span>
        <span className="text-gray-400">|</span>
        <span className="font-semibold">Location:</span><span>HQ</span>
        <span className="text-gray-400">|</span>
        <span className="font-semibold">Server:</span><span>localhost</span>
        <span className="text-gray-400">|</span>
        <span>TIG ERP v1.0</span>
        <div className="flex-1" />
        <span className="text-gray-400">{new Date().toLocaleDateString('en-AU')}</span>
      </div>

      {/* ── Nav context menu ── */}
      {navCtxMenu.open && (
        <div
          className="fixed z-[9999] bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[180px] text-sm"
          style={{ left: navCtxMenu.x, top: navCtxMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          {navCtxMenu.itemId === 'jobs' && navCtxMenu.pinnedJobId && (
            <button
              onClick={() => { unpinJob(navCtxMenu.pinnedJobId); setNavCtxMenu(m => ({ ...m, open: false })); }}
              className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <X className="w-3.5 h-3.5 text-gray-400" />
              Close #{navCtxMenu.pinnedJobId}
            </button>
          )}
          {navCtxMenu.itemId === 'jobs' && pinnedJobs.length > 0 && (
            <button
              onClick={() => { setPinnedJobs([]); setActiveJob(null); setShowJobDetail(false); setNavCtxMenu(m => ({ ...m, open: false })); }}
              className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <X className="w-3.5 h-3.5 text-gray-400" />
              Close all nodes
            </button>
          )}
        </div>
      )}

      {/* ── F12 Quick Job Lookup ── */}
      {f12Open && (
        <div className="fixed inset-0 z-[9999]" onClick={() => setF12Open(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
          <div
            ref={f12PopupRef}
            className="absolute bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            style={f12Pos
              ? { left: f12Pos.x, top: f12Pos.y }
              : { left: '50%', top: '18%', transform: 'translateX(-50%)' }
            }
            onClick={e => e.stopPropagation()}
          >
            {/* Header — drag handle */}
            <div
              className="flex items-center justify-between px-5 pt-5 pb-3 cursor-grab active:cursor-grabbing select-none"
              onMouseDown={e => {
                e.preventDefault();
                const rect = f12PopupRef.current.getBoundingClientRect();
                f12DragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
                const onMove = (ev) => {
                  setF12Pos({ x: ev.clientX - f12DragOffset.current.x, y: ev.clientY - f12DragOffset.current.y });
                };
                const onUp = () => {
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
              }}
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-500" />
                <span className="text-sm font-semibold text-gray-700">Quick Job Lookup</span>
              </div>
              <button onMouseDown={e => e.stopPropagation()} onClick={() => setF12Open(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Input */}
            <div className="px-5 pb-4">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                <input
                  ref={f12Ref}
                  type="text"
                  value={f12Input}
                  onChange={e => setF12Input(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const q = f12Input.trim().toLowerCase();
                      if (!q) return;
                      const hit = jobs.find(j =>
                        (j.id || '').toLowerCase() === q ||
                        (j.id || '').toLowerCase().includes(q) ||
                        (j.invoice || '').toLowerCase().includes(q) ||
                        (j.custRef || '').toLowerCase().includes(q)
                      );
                      if (hit) {
                        pinJob(hit);
                        setActiveModule('jobs');
                        setF12Open(false);
                        setF12Input('');
                      }
                    }
                  }}
                  placeholder="Job #, invoice, or ref…"
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoComplete="off"
                />
              </div>

              {/* Live suggestions */}
              {f12Input.trim().length > 0 && (() => {
                const q = f12Input.trim().toLowerCase();
                const hits = jobs.filter(j =>
                  (j.id || '').toLowerCase().includes(q) ||
                  (j.customer || '').toLowerCase().includes(q) ||
                  (j.invoice || '').toLowerCase().includes(q) ||
                  (j.custRef || '').toLowerCase().includes(q)
                ).slice(0, 6);
                const statusColors = { QUOTE:'bg-gray-100 text-gray-600', New:'bg-blue-100 text-blue-700', ORDER:'bg-indigo-100 text-indigo-700', 'In Progress':'bg-yellow-100 text-yellow-800', PROOF:'bg-purple-100 text-purple-700', PRINT:'bg-orange-100 text-orange-700', 'Pick/Pack':'bg-cyan-100 text-cyan-700', FINISH:'bg-green-100 text-green-800', INVOICE:'bg-teal-100 text-teal-700', PAID:'bg-emerald-100 text-emerald-800', CANCEL:'bg-red-100 text-red-600' };
                return hits.length > 0 ? (
                  <div className="mt-2 rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                    {hits.map(j => (
                      <button key={j.id}
                        onMouseDown={() => { pinJob(j); setActiveModule('jobs'); setF12Open(false); setF12Input(''); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50 text-left border-b border-gray-50 last:border-0 transition-colors">
                        <span className="font-mono text-xs font-bold text-indigo-600 w-24 shrink-0">#{j.id}</span>
                        <span className="flex-1 text-sm text-gray-700 truncate">{j.customer}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${statusColors[j.status] || 'bg-gray-100 text-gray-600'}`}>{j.status}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-gray-400 text-center">No jobs match "{f12Input}"</p>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400">Press <kbd className="bg-white border border-gray-200 rounded px-1.5 py-0.5 text-[10px] font-mono shadow-sm">Enter</kbd> to open · <kbd className="bg-white border border-gray-200 rounded px-1.5 py-0.5 text-[10px] font-mono shadow-sm">Esc</kbd> to close</span>
              <button
                onMouseDown={() => {
                  const q = f12Input.trim().toLowerCase();
                  if (!q) return;
                  const hit = jobs.find(j => (j.id || '').toLowerCase().includes(q) || (j.customer || '').toLowerCase().includes(q));
                  if (hit) { pinJob(hit); setActiveModule('jobs'); setF12Open(false); setF12Input(''); }
                }}
                className="bg-blue-700 text-white text-xs font-medium px-4 py-1.5 rounded-lg hover:bg-blue-800 transition-colors"
              >
                Open Job
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {renderModal()}
      {renderConfirmModal()}
      {renderPaymentModal()}
      {renderStockAdjustModal()}
      {renderDispatchModal()}
      {renderUnprintModal()}
      {renderSalesRegModal()}
      {renderTransferModal()}
      {renderStocktakeModal()}
      {renderStockFlowModal()}
      {renderInvoice()}
      {renderDocumentPrint()}
      {emailModalJob && <EmailJobModal job={emailModalJob} customers={customers} onClose={() => setEmailModalJob(null)} />}
      {matrixPopup !== null && (
        <SizeColourMatrixPopup
          current={jobForm.items[matrixPopup.idx]?.sizes || ''}
          onApply={(text, total) => {
            updateJobItem(matrixPopup.idx, 'sizes', text);
            if (total > 0) updateJobItem(matrixPopup.idx, 'order', total);
            setMatrixPopup(null);
          }}
          onClose={() => setMatrixPopup(null)}
        />
      )}
      {renderOpenFreightModal()}
      {renderAIAssistant()}

      {/* User Settings Modal */}
      {showUserSettings && (
        <DraggableModal onClose={() => setShowUserSettings(false)} cardClass="w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">User Settings</h2>
              <button onClick={() => setShowUserSettings(false)}><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="mb-6 pb-6 border-b">
              <p className="text-sm text-gray-500 mb-1">Logged in as</p>
              <p className="font-semibold">{currentUser?.full_name || currentUser?.username}</p>
              <p className="text-xs text-gray-400 capitalize mt-0.5">{currentUser?.role?.replace('_', ' ')} account</p>
            </div>
            <h3 className="font-semibold mb-4">Change Password</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Current Password</label>
                <input
                  type="password"
                  value={changePasswordForm.current}
                  onChange={e => setChangePasswordForm(f => ({ ...f, current: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter current password"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">New Password</label>
                <input
                  type="password"
                  value={changePasswordForm.newPass}
                  onChange={e => setChangePasswordForm(f => ({ ...f, newPass: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="At least 8 characters"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={changePasswordForm.confirm}
                  onChange={e => setChangePasswordForm(f => ({ ...f, confirm: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Repeat new password"
                />
              </div>
              {changePasswordMsg && (
                <p className={`text-sm ${changePasswordMsg.includes('success') ? 'text-green-600' : 'text-red-600'}`}>
                  {changePasswordMsg}
                </p>
              )}
              <button
                onClick={handleChangePassword}
                disabled={!changePasswordForm.current || !changePasswordForm.newPass}
                className="w-full bg-blue-700 text-white py-2 rounded-lg hover:bg-blue-800 disabled:opacity-40 text-sm font-medium"
              >
                Change Password
              </button>
            </div>
        </DraggableModal>
      )}


      {/* ── Global Search (Ctrl+K) ── */}
      {globalSearchOpen && (
        <div className="fixed inset-0 z-[99999] bg-black/50" onClick={() => setGlobalSearchOpen(false)}>
          <div className="absolute left-1/2 top-[15%] -translate-x-1/2 w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 border-b">
              <Search className="w-5 h-5 text-gray-400 shrink-0" />
              <input
                ref={globalSearchRef}
                type="text"
                value={globalSearchQuery}
                onChange={e => setGlobalSearchQuery(e.target.value)}
                placeholder="Search jobs, customers, inventory, suppliers…"
                className="flex-1 text-base outline-none text-gray-700 placeholder-gray-400"
              />
              <kbd className="text-xs bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 text-gray-500 font-mono shrink-0">Esc</kbd>
            </div>
            {globalSearchQuery.length > 0 && (() => {
              const q = globalSearchQuery.toLowerCase();
              const jobHits = jobs.filter(j =>
                (j.id||'').toLowerCase().includes(q) || (j.customer||'').toLowerCase().includes(q) ||
                (j.invoice||'').toLowerCase().includes(q) || (j.custRef||'').toLowerCase().includes(q)
              ).slice(0, 5);
              const custHits = customers.filter(c =>
                (c.name||'').toLowerCase().includes(q) || (c.id||'').toLowerCase().includes(q) || (c.email||'').toLowerCase().includes(q)
              ).slice(0, 3);
              const invHits = inventory.filter(i =>
                (i.sku||'').toLowerCase().includes(q) || (i.name||'').toLowerCase().includes(q)
              ).slice(0, 3);
              const suppHits = suppliers.filter(s =>
                (s.name||'').toLowerCase().includes(q) || (s.code||'').toLowerCase().includes(q)
              ).slice(0, 2);
              const hasResults = jobHits.length || custHits.length || invHits.length || suppHits.length;
              const statusBg = { QUOTE:'bg-gray-100 text-gray-600', ORDER:'bg-indigo-100 text-indigo-700', 'In Progress':'bg-yellow-100 text-yellow-700', FINISH:'bg-green-100 text-green-700', INVOICE:'bg-teal-100 text-teal-700', PAID:'bg-emerald-100 text-emerald-700', CANCEL:'bg-red-100 text-red-700' };
              return (
                <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-100">
                  {jobHits.length > 0 && (
                    <div>
                      <p className="px-5 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-widest">Jobs</p>
                      {jobHits.map(j => (
                        <div key={j.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-blue-50 cursor-pointer"
                          onClick={() => { pinJob(j); setActiveModule('jobs'); setGlobalSearchOpen(false); }}>
                          <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                          <span className="font-mono text-sm font-bold text-blue-600 w-20 shrink-0">#{j.id}</span>
                          <span className="flex-1 text-sm text-gray-700 truncate">{j.customer}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBg[j.status] || 'bg-gray-100 text-gray-500'}`}>{j.status}</span>
                          <span className="text-sm font-semibold text-gray-600 shrink-0">${(j.total||0).toFixed(0)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {custHits.length > 0 && (
                    <div>
                      <p className="px-5 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-widest">Customers</p>
                      {custHits.map(c => (
                        <div key={c.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-blue-50 cursor-pointer"
                          onClick={() => { setActiveModule('customers'); setGlobalSearchOpen(false); }}>
                          <Users className="w-4 h-4 text-green-400 shrink-0" />
                          <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">{(c.name||'?').charAt(0)}</div>
                          <span className="flex-1 text-sm text-gray-700 truncate">{c.name}</span>
                          <span className="text-xs text-gray-400 font-mono">{c.id}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {invHits.length > 0 && (
                    <div>
                      <p className="px-5 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-widest">Inventory</p>
                      {invHits.map(i => (
                        <div key={i.sku} className="flex items-center gap-3 px-5 py-2.5 hover:bg-blue-50 cursor-pointer"
                          onClick={() => { setActiveModule('inventory'); setGlobalSearchOpen(false); }}>
                          <Package className="w-4 h-4 text-purple-400 shrink-0" />
                          <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded shrink-0">{i.sku}</span>
                          <span className="flex-1 text-sm text-gray-700 truncate">{i.name}</span>
                          <span className={`text-xs font-semibold ${i.stock < i.reorderLevel ? 'text-red-600' : 'text-green-600'}`}>{i.stock} in stock</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {suppHits.length > 0 && (
                    <div>
                      <p className="px-5 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-widest">Suppliers</p>
                      {suppHits.map(s => (
                        <div key={s.code} className="flex items-center gap-3 px-5 py-2.5 hover:bg-blue-50 cursor-pointer"
                          onClick={() => { setActiveModule('suppliers'); setGlobalSearchOpen(false); }}>
                          <Truck className="w-4 h-4 text-orange-400 shrink-0" />
                          <span className="flex-1 text-sm text-gray-700 truncate">{s.name}</span>
                          <span className="text-xs text-gray-400 font-mono">{s.code}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {!hasResults && (
                    <div className="px-5 py-10 text-center text-gray-400">
                      <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No results for "{globalSearchQuery}"</p>
                    </div>
                  )}
                </div>
              );
            })()}
            {globalSearchQuery.length === 0 && (
              <div className="px-5 py-6 text-center text-gray-400">
                <p className="text-sm">Type to search across jobs, customers, inventory, and suppliers</p>
                <div className="flex items-center justify-center gap-4 mt-3 text-xs text-gray-400">
                  <span><kbd className="bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 font-mono">Alt+J</kbd> Jobs</span>
                  <span><kbd className="bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 font-mono">Alt+C</kbd> Customers</span>
                  <span><kbd className="bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 font-mono">Alt+I</kbd> Inventory</span>
                  <span><kbd className="bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 font-mono">F12</kbd> Quick Job</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Right-click context menu for line items */}
      {ctxMenu.visible && (
        <div
          className="fixed bg-white border border-gray-200 rounded-lg shadow-2xl z-[99999] py-1 min-w-[200px] text-sm"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onMouseLeave={closeCtx}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-widest border-b mb-1">Row {ctxMenu.rowIdx + 1}</div>
          <button onMouseDown={() => { ctxAddAbove(ctxMenu.rowIdx); closeCtx(); }} className="w-full text-left px-4 py-2 hover:bg-blue-50 flex items-center gap-2 text-gray-700">
            <Plus className="w-3.5 h-3.5 text-blue-500" /> Add Row Above
          </button>
          <button onMouseDown={() => { ctxAddBelow(ctxMenu.rowIdx); closeCtx(); }} className="w-full text-left px-4 py-2 hover:bg-blue-50 flex items-center gap-2 text-gray-700">
            <Plus className="w-3.5 h-3.5 text-blue-500" /> Add Row Below
          </button>
          <button onMouseDown={() => { ctxDuplicate(ctxMenu.rowIdx); closeCtx(); }} className="w-full text-left px-4 py-2 hover:bg-blue-50 flex items-center gap-2 text-gray-700">
            <span className="text-blue-500 font-bold text-xs">⧉</span> Duplicate Row
          </button>
          <div className="border-t my-1" />
          <button onMouseDown={() => { ctxMoveUp(ctxMenu.rowIdx); closeCtx(); }} disabled={ctxMenu.rowIdx === 0}
            className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2 text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed">
            <span className="text-gray-500">↑</span> Move Up
          </button>
          <button onMouseDown={() => { ctxMoveDown(ctxMenu.rowIdx); closeCtx(); }} disabled={ctxMenu.rowIdx >= jobForm.items.length - 1}
            className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2 text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed">
            <span className="text-gray-500">↓</span> Move Down
          </button>
          <div className="border-t my-1" />
          <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Row Type</div>
          {[['product','📦 Product Line'],['section','§ Section Header'],['note','¶ Note / Instruction']].map(([t, label]) => (
            <button key={t} onMouseDown={() => { setJobForm(f => { const items = [...f.items]; items[ctxMenu.rowIdx] = { ...items[ctxMenu.rowIdx], displayType: t }; return { ...f, items }; }); closeCtx(); }}
              className={`w-full text-left px-4 py-1.5 hover:bg-blue-50 flex items-center gap-2 text-xs ${jobForm.items[ctxMenu.rowIdx]?.displayType === t ? 'font-bold text-blue-700' : 'text-gray-600'}`}>
              {label} {jobForm.items[ctxMenu.rowIdx]?.displayType === t ? '✓' : ''}
            </button>
          ))}
          <div className="border-t my-1" />
          <button onMouseDown={() => { ctxClearRow(ctxMenu.rowIdx); closeCtx(); }} className="w-full text-left px-4 py-2 hover:bg-amber-50 flex items-center gap-2 text-amber-700">
            <span className="text-amber-500">⊘</span> Clear Row
          </button>
          <button onMouseDown={() => { removeJobItem(ctxMenu.rowIdx); closeCtx(); }} className="w-full text-left px-4 py-2 hover:bg-red-50 flex items-center gap-2 text-red-600">
            <X className="w-3.5 h-3.5" /> Delete Row
          </button>
        </div>
      )}
    </div>
  );
};

export default TotalImageERP;
