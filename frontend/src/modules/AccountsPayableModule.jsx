import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2, DollarSign, AlertCircle, Clock, CheckCircle, X, Download } from 'lucide-react';
import * as api from '../api';

const fmt$ = (v) => `$${parseFloat(v || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);

const STATUS_STYLES = {
  pending:  'bg-amber-100 text-amber-700 border-amber-200',
  approved: 'bg-blue-100 text-blue-700 border-blue-200',
  paid:     'bg-emerald-100 text-emerald-700 border-emerald-200',
};

function isOverdue(bill) {
  return bill.dueDate && bill.dueDate < today() && bill.status !== 'paid';
}

function exportCSV(rows) {
  if (!rows.length) return;
  const headers = ['ID','Supplier','Bill#','Bill Date','Due Date','Description','Excl GST','GST','Incl GST','Status','Paid Date','Paid Amount'];
  const lines = [
    headers.join(','),
    ...rows.map(b => [
      b.id, b.supplierName, b.billNumber, b.billDate, b.dueDate,
      `"${(b.description||'').replace(/"/g,'""')}"`,
      b.amountEx, b.tax, b.amountInc, b.status, b.paidDate, b.paidAmount,
    ].join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `ap-bills-${today()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function BillForm({ bill, suppliers, onSave, onClose }) {
  const [form, setForm] = useState({
    supplierId: bill?.supplierId || '',
    supplierName: bill?.supplierName || '',
    poId: bill?.poId || '',
    billNumber: bill?.billNumber || '',
    billDate: bill?.billDate || today(),
    dueDate: bill?.dueDate || '',
    description: bill?.description || '',
    amountEx: bill?.amountEx ?? '',
    tax: bill?.tax ?? '',
    amountInc: bill?.amountInc ?? '',
    status: bill?.status || 'pending',
    notes: bill?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const recalc = (key, val) => {
    const f = { ...form, [key]: val };
    if (key === 'amountEx' || key === 'tax') {
      const ex = parseFloat(f.amountEx) || 0;
      const tax = parseFloat(f.tax) || 0;
      f.amountInc = (ex + tax).toFixed(2);
    } else if (key === 'amountInc') {
      const inc = parseFloat(val) || 0;
      const ex = parseFloat((inc / 1.1).toFixed(2));
      f.amountEx = ex;
      f.amountInc = inc;
      f.tax = parseFloat((inc - ex).toFixed(2));
    }
    setForm(f);
  };

  const handleSupplier = (id) => {
    const s = suppliers.find(s => s.code === id);
    setForm(f => ({ ...f, supplierId: id, supplierName: s?.name || '' }));
  };

  const handleSave = async () => {
    if (!form.supplierName && !form.supplierId) { setErr('Supplier is required'); return; }
    setSaving(true); setErr('');
    try {
      await onSave({
        ...form,
        amountEx: parseFloat(form.amountEx) || 0,
        tax: parseFloat(form.tax) || 0,
        amountInc: parseFloat(form.amountInc) || 0,
      });
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  const input = 'w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-800">{bill ? 'Edit Bill' : 'New Supplier Bill'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Supplier *</label>
              {suppliers.length > 0 ? (
                <select value={form.supplierId} onChange={e => handleSupplier(e.target.value)} className={input}>
                  <option value="">— Select —</option>
                  {suppliers.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                </select>
              ) : (
                <input value={form.supplierName} onChange={e => set('supplierName', e.target.value)} placeholder="Supplier name" className={input} />
              )}
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Bill / Invoice #</label>
              <input value={form.billNumber} onChange={e => set('billNumber', e.target.value)} placeholder="INV-12345" className={input} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Bill Date</label>
              <input type="date" value={form.billDate} onChange={e => set('billDate', e.target.value)} className={input} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Due Date</label>
              <input type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} className={input} />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Description</label>
            <input value={form.description} onChange={e => set('description', e.target.value)} placeholder="Brief description…" className={input} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Amount (ex GST)</label>
              <input type="number" step="0.01" value={form.amountEx}
                onChange={e => recalc('amountEx', e.target.value)} className={input} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">GST (10%)</label>
              <input type="number" step="0.01" value={form.tax}
                onChange={e => recalc('tax', e.target.value)} className={input} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Total (inc GST)</label>
              <input type="number" step="0.01" value={form.amountInc}
                onChange={e => recalc('amountInc', e.target.value)}
                className={`${input} font-semibold`} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">PO Reference</label>
              <input value={form.poId} onChange={e => set('poId', e.target.value)} placeholder="PO-001 (optional)" className={input} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className={input}>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="paid">Paid</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} className={`${input} resize-none`} />
          </div>
        </div>

        {err && <p className="mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{err}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
            {saving ? 'Saving…' : bill ? 'Save Changes' : 'Create Bill'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PayModal({ bill, onPay, onClose }) {
  const [amount, setAmount] = useState(String(bill.amountInc - bill.paidAmount));
  const [paidDate, setPaidDate] = useState(today());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handlePay = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setErr('Enter a valid amount'); return; }
    setSaving(true); setErr('');
    try { await onPay(amt, paidDate); }
    catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-80 p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">Record Payment</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <p className="text-sm text-gray-600 mb-3">
          Bill: <span className="font-medium">{bill.billNumber || `#${bill.id}`}</span><br />
          Outstanding: <span className="font-semibold text-red-600">{fmt$(bill.amountInc - bill.paidAmount)}</span>
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Amount Paid</label>
            <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Payment Date</label>
            <input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
        </div>
        {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 px-3 py-2 border rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={handlePay} disabled={saving}
            className="flex-1 px-3 py-2 bg-blue-700 text-white rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
            {saving ? '…' : 'Mark Paid'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AccountsPayableModule({ suppliers = [] }) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [billForm, setBillForm] = useState(null);   // null = closed, {} = new, bill = edit
  const [payModal, setPayModal] = useState(null);
  const [delConfirm, setDelConfirm] = useState(null);

  const { data: bills = [], isFetching, refetch } = useQuery({
    queryKey: ['ap-bills', statusFilter],
    queryFn: () => api.supplierBills.list(statusFilter ? { status: statusFilter } : {}),
    staleTime: 30000,
  });

  const { data: summary } = useQuery({
    queryKey: ['ap-summary'],
    queryFn: api.supplierBills.summary,
    staleTime: 30000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ap-bills'] });
    qc.invalidateQueries({ queryKey: ['ap-summary'] });
  };

  const handleCreate = async (data) => {
    await api.supplierBills.create(data);
    invalidate(); setBillForm(null);
  };

  const handleUpdate = async (data) => {
    await api.supplierBills.update(billForm.id, data);
    invalidate(); setBillForm(null);
  };

  const handlePay = async (amt, paidDate) => {
    await api.supplierBills.pay(payModal.id, amt, paidDate);
    invalidate(); setPayModal(null);
  };

  const handleDelete = async () => {
    await api.supplierBills.delete(delConfirm);
    invalidate(); setDelConfirm(null);
  };

  const filtered = bills.filter(b => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (b.supplierName||'').toLowerCase().includes(q)
      || (b.billNumber||'').toLowerCase().includes(q)
      || (b.description||'').toLowerCase().includes(q);
  });

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center">
                <Clock className="w-4.5 h-4.5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Total Open</p>
                <p className="text-lg font-bold text-gray-800">{fmt$(summary.total_open_amount)}</p>
                <p className="text-xs text-gray-400">{summary.total_open_count} bill{summary.total_open_count !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>
          <div className={`bg-white rounded-xl shadow-sm p-4 border ${summary.overdue_count > 0 ? 'border-red-200' : 'border-gray-100'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${summary.overdue_count > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
                <AlertCircle className={`w-4.5 h-4.5 ${summary.overdue_count > 0 ? 'text-red-500' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className="text-xs text-gray-500">Overdue</p>
                <p className={`text-lg font-bold ${summary.overdue_count > 0 ? 'text-red-600' : 'text-gray-400'}`}>{fmt$(summary.overdue_amount)}</p>
                <p className="text-xs text-gray-400">{summary.overdue_count} bill{summary.overdue_count !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-orange-100 rounded-lg flex items-center justify-center">
                <DollarSign className="w-4.5 h-4.5 text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Due This Week</p>
                <p className="text-lg font-bold text-gray-800">{fmt$(summary.due_this_week_amount)}</p>
                <p className="text-xs text-gray-400">{summary.due_this_week_count} bill{summary.due_this_week_count !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Search supplier, bill#, description…"
          className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          {[['', 'All'], ['pending', 'Pending'], ['approved', 'Approved'], ['paid', 'Paid']].map(([v, l]) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className={`px-3 py-2 font-medium ${statusFilter === v ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {l}
            </button>
          ))}
        </div>
        <button onClick={() => exportCSV(filtered)} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          <Download className="w-3.5 h-3.5" />CSV
        </button>
        <button onClick={() => setBillForm({})}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-semibold hover:bg-blue-800">
          <Plus className="w-4 h-4" />New Bill
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {isFetching && <div className="h-1 bg-blue-200 animate-pulse" />}
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Supplier</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Bill #</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Bill Date</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Due Date</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Description</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Ex GST</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Inc GST</th>
              <th className="px-3 py-2.5 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Outstanding</th>
              <th className="px-3 py-2.5 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-12 text-center text-gray-400 text-sm">
                {statusFilter ? `No ${statusFilter} bills` : 'No bills yet — click New Bill to add one'}
              </td></tr>
            )}
            {filtered.map(bill => {
              const over = isOverdue(bill);
              const outstanding = bill.amountInc - bill.paidAmount;
              return (
                <tr key={bill.id} className={`hover:bg-gray-50 ${over ? 'bg-red-50' : ''}`}>
                  <td className="px-3 py-2.5 font-medium text-gray-800">{bill.supplierName || '—'}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-blue-600">{bill.billNumber || `#${bill.id}`}</td>
                  <td className="px-3 py-2.5 text-gray-600 text-xs">{bill.billDate || '—'}</td>
                  <td className={`px-3 py-2.5 text-xs font-medium ${over ? 'text-red-600' : 'text-gray-600'}`}>
                    {bill.dueDate || '—'}{over ? ' ⚠' : ''}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 text-xs max-w-48 truncate">{bill.description || '—'}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{fmt$(bill.amountEx)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-gray-800">{fmt$(bill.amountInc)}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_STYLES[bill.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                      {bill.status}
                    </span>
                  </td>
                  <td className={`px-3 py-2.5 text-right font-semibold text-sm ${outstanding > 0 && bill.status !== 'paid' ? 'text-red-600' : 'text-emerald-600'}`}>
                    {bill.status === 'paid' ? fmt$(0) : fmt$(outstanding)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center gap-1">
                      {bill.status !== 'paid' && (
                        <button onClick={() => setPayModal(bill)}
                          className="flex items-center gap-0.5 text-[11px] px-2 py-1 bg-blue-700 text-white rounded-lg hover:bg-blue-800 font-medium">
                          <CheckCircle className="w-3 h-3" />Pay
                        </button>
                      )}
                      <button onClick={() => setBillForm(bill)}
                        className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDelConfirm(bill.id)}
                        className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                <td colSpan={5} className="px-3 py-2 text-xs text-gray-600">{filtered.length} bill{filtered.length !== 1 ? 's' : ''}</td>
                <td className="px-3 py-2 text-right text-xs text-gray-700">{fmt$(filtered.reduce((s, b) => s + b.amountEx, 0))}</td>
                <td className="px-3 py-2 text-right text-sm text-gray-800">{fmt$(filtered.reduce((s, b) => s + b.amountInc, 0))}</td>
                <td />
                <td className="px-3 py-2 text-right text-sm text-red-600">
                  {fmt$(filtered.filter(b => b.status !== 'paid').reduce((s, b) => s + (b.amountInc - b.paidAmount), 0))}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Bill create/edit form */}
      {billForm !== null && (
        <BillForm
          bill={billForm.id ? billForm : null}
          suppliers={suppliers}
          onSave={billForm.id ? handleUpdate : handleCreate}
          onClose={() => setBillForm(null)}
        />
      )}

      {/* Pay modal */}
      {payModal && (
        <PayModal bill={payModal} onPay={handlePay} onClose={() => setPayModal(null)} />
      )}

      {/* Delete confirm */}
      {delConfirm !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl p-6 w-80">
            <p className="font-semibold text-gray-800 mb-2">Delete this bill?</p>
            <p className="text-sm text-gray-500 mb-5">This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setDelConfirm(null)} className="flex-1 px-3 py-2 border rounded-lg text-sm">Cancel</button>
              <button onClick={handleDelete} className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
