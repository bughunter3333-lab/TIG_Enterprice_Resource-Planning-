import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2, DollarSign, AlertCircle, Clock, CheckCircle, X, Download, Receipt } from 'lucide-react';
import * as api from '../api';
import { notify } from '../lib/notify';
import { T } from '../ui/tokens';

const fmt$ = (v) => `$${parseFloat(v || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);

const STATUS_STYLES = {
  pending:  'bg-accent-tint text-accent-strong border-accent',
  approved: 'bg-accent-tint text-accent-strong border-accent',
  paid:     'bg-ok-tint text-ok border-ok',
};

/**
 * A bill against a PO, held up against what actually arrived on that PO —
 * received quantities at the PO price, plus landed charges, with GST. The
 * ordered figure sits beside it (F36): matching is for the whole PO, against
 * what was received, not per bill or per line.
 */
function PoMatch({ bill }) {
  const m = bill.poMatch;
  if (!m) return null;
  const more = m.difference > 0;
  return (
    <>
      {m.matches ? (
        <div className="font-sans text-[10px]" style={{ color: T.ok }}>{bill.poId} ✓ matches received</div>
      ) : (
        <div className="font-sans text-[10px]" style={{ color: T.danger }}
          title={`Billed ${fmt$(m.billedInc)} against ${fmt$(m.receivedInc)} received on ${bill.poId}`}>
          {bill.poId}: billed {fmt$(Math.abs(m.difference))} {more ? 'more' : 'less'} than received
        </div>
      )}
      <div className="font-sans text-[10px]" style={{ color: T.textMuted }}>
        Ordered {fmt$(m.orderedInc)} · received {fmt$(m.receivedInc)} · billed {fmt$(m.billedInc)}
      </div>
    </>
  );
}

function isOverdue(bill) {
  return bill.dueDate && bill.dueDate < today() && bill.status !== 'paid' && !isCredit(bill);
}

/** A credit note: a bill for less than nothing — applied to a bill, never paid (S2-09). */
const isCredit = (bill) => bill.amountInc < 0;
const supplierOf = (bill) => bill.supplierId || bill.supplierName;

function exportCSV(rows) {
  if (!rows.length) return;
  // Outstanding and Applied To say how a bill settled by a credit note was
  // settled: paid, yet its payments $110 short (S2-09).
  const headers = ['ID','Supplier','Bill#','Bill Date','Due Date','Description','Excl GST','GST','Incl GST','Status','Paid Date','Paid Amount','Outstanding','Applied To'];
  const lines = [
    headers.join(','),
    ...rows.map(b => [
      b.id, b.supplierName, b.billNumber, b.billDate, b.dueDate,
      `"${(b.description||'').replace(/"/g,'""')}"`,
      b.amountEx, b.tax, b.amountInc, b.status, b.paidDate, b.paidAmount,
      b.outstanding, b.appliedToBillNumber || '',
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
    accountId: bill?.accountId ?? '',
  });
  const [saving, setSaving] = useState(false);
  // The ledger account this bill's cost posts to. Blank lets the ledger decide
  // by kind — Purchases for a bill against a PO, General Expenses otherwise —
  // which lumps rent, power and fuel into one line of the P&L until chosen.
  const { data: accounts = [] } = useQuery({
    queryKey: ['ledger-account-options'],
    queryFn: api.accounting.accountOptions,
    staleTime: 300000,
  });
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
        accountId: form.accountId ? Number(form.accountId) : null,
        // An edit sends the status only when someone changed it. Whether a bill
        // is paid follows from its payments; echoing back the status it opened
        // with stopped a paid bill's total being corrected, or a part-paid one
        // being reduced to what was paid.
        status: bill && form.status === bill.status ? undefined : form.status,
      });
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  const inputStyle = { border: `1px solid ${T.hairline}`, color: T.text };
  const inputCls = 'w-full rounded-lg px-3 py-1.5 text-sm focus:outline-none';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="rounded-lg shadow-xl w-full max-w-lg p-6" style={{ background: T.panel }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold" style={{ color: T.text }}>{bill ? 'Edit Bill' : 'New Supplier Bill'}</h2>
          <button onClick={onClose} style={{ color: T.textFaint }}><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: T.textMuted }}>Supplier *</label>
              {suppliers.length > 0 ? (
                <select value={form.supplierId} onChange={e => handleSupplier(e.target.value)} className={inputCls} style={inputStyle}>
                  <option value="">— Select —</option>
                  {suppliers.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                </select>
              ) : (
                <input value={form.supplierName} onChange={e => set('supplierName', e.target.value)} placeholder="Supplier name" className={inputCls} style={inputStyle} />
              )}
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: T.textMuted }}>Bill / Invoice #</label>
              <input value={form.billNumber} onChange={e => set('billNumber', e.target.value)} placeholder="INV-12345" className={inputCls} style={inputStyle} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: T.textMuted }}>Bill Date</label>
              <input type="date" value={form.billDate} onChange={e => set('billDate', e.target.value)} className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: T.textMuted }}>Due Date</label>
              <input type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} className={inputCls} style={inputStyle} />
            </div>
          </div>

          <div>
            <label className="text-xs mb-1 block" style={{ color: T.textMuted }}>Description</label>
            <input value={form.description} onChange={e => set('description', e.target.value)} placeholder="Brief description…" className={inputCls} style={inputStyle} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: T.textMuted }}>Amount (ex GST)</label>
              <input type="number" step="0.01" value={form.amountEx}
                onChange={e => recalc('amountEx', e.target.value)} className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: T.textMuted }}>GST (10%)</label>
              <input type="number" step="0.01" value={form.tax}
                onChange={e => recalc('tax', e.target.value)} className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: T.textMuted }}>Total (inc GST)</label>
              <input type="number" step="0.01" value={form.amountInc}
                onChange={e => recalc('amountInc', e.target.value)}
                className={`${inputCls} font-semibold`} style={inputStyle} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: T.textMuted }}>PO Reference</label>
              <input value={form.poId} onChange={e => set('poId', e.target.value)} placeholder="PO-001 (optional)" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: T.textMuted }}>Status</label>
              {/* Paid is never chosen: a bill is paid when its recorded payments cover it. */}
              <select value={form.status} onChange={e => set('status', e.target.value)} disabled={form.status === 'paid'} className={inputCls} style={inputStyle}>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                {form.status === 'paid' && <option value="paid">Paid</option>}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="bill-account" className="text-xs mb-1 block" style={{ color: T.textMuted }}>Account</label>
            <select id="bill-account" value={form.accountId} onChange={e => set('accountId', e.target.value)} className={inputCls} style={inputStyle}>
              <option value="">{form.poId ? 'Purchases (against a PO)' : 'General Expenses'} — by default</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs mb-1 block" style={{ color: T.textMuted }}>Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} className={`${inputCls} resize-none`} style={inputStyle} />
          </div>
        </div>

        {err && <p className="mt-3 text-sm px-3 py-2 rounded-lg" style={{ color: T.danger, background: T.dangerTint }}>{err}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg text-sm" style={{ border: `1px solid ${T.hairline}`, color: T.textMuted }}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: T.accentStrong, color: '#fff' }}>
            {saving ? 'Saving…' : bill ? 'Save Changes' : 'Create Bill'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PayModal({ bill, onPay, onTakeBack, onClose }) {
  const [amount, setAmount] = useState(String(bill.outstanding));
  const [paidDate, setPaidDate] = useState(today());
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  // Earlier payments on this bill — a bill is often paid in more than one run.
  const { data: detail } = useQuery({
    queryKey: ['ap-bill', bill.id],
    queryFn: () => api.supplierBills.get(bill.id),
  });
  const payments = detail?.payments ?? [];
  const open = bill.outstanding > 0;

  const handlePay = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setErr('Enter a valid amount'); return; }
    if (amt > bill.outstanding + 0.005) { setErr(`Only ${fmt$(bill.outstanding)} is outstanding`); return; }
    setSaving(true); setErr('');
    try { await onPay(amt, paidDate, reference); }
    catch (e) { setErr(e.message); setSaving(false); }
  };

  const handleTakeBack = async (paymentId) => {
    setSaving(true); setErr('');
    try { await onTakeBack(paymentId); }
    catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="rounded-lg shadow-xl w-80 p-5" style={{ background: T.panel }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold" style={{ color: T.text }}>{open ? 'Record Payment' : 'Payments'}</h3>
          <button onClick={onClose}><X className="w-4 h-4" style={{ color: T.textFaint }} /></button>
        </div>
        <p className="text-sm mb-3" style={{ color: T.textMuted }}>
          Bill: <span className="font-medium" style={{ color: T.text }}>{bill.billNumber || `#${bill.id}`}</span><br />
          Outstanding: <span className="font-semibold" style={{ color: T.danger }}>{fmt$(bill.outstanding)}</span>
        </p>
        {payments.length > 0 && (
          <div className="mb-3">
            <p className="text-xs mb-1" style={{ color: T.textMuted }}>Paid so far</p>
            <ul className="space-y-1">
              {payments.map(p => (
                <li key={p.id} className="flex items-center justify-between text-xs" style={{ color: T.text }}>
                  <span>{p.paidDate} · {fmt$(p.amount)}{p.reference ? ` · ${p.reference}` : ''}</span>
                  <button onClick={() => handleTakeBack(p.id)} disabled={saving}
                    className="underline disabled:opacity-50" style={{ color: T.textMuted }}
                    aria-label={`Take back the payment of ${fmt$(p.amount)} on ${p.paidDate}`}>
                    Take back
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {open && <div className="space-y-3">
          <div>
            <label htmlFor="pay-amount" className="text-xs mb-1 block" style={{ color: T.textMuted }}>This payment</label>
            <input id="pay-amount" type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full rounded-lg px-3 py-1.5 text-sm focus:outline-none"
              style={{ border: `1px solid ${T.hairline}`, color: T.text }} />
          </div>
          <div>
            <label htmlFor="pay-date" className="text-xs mb-1 block" style={{ color: T.textMuted }}>Payment Date</label>
            <input id="pay-date" type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)}
              className="w-full rounded-lg px-3 py-1.5 text-sm focus:outline-none"
              style={{ border: `1px solid ${T.hairline}`, color: T.text }} />
          </div>
          <div>
            <label htmlFor="pay-reference" className="text-xs mb-1 block" style={{ color: T.textMuted }}>Reference</label>
            <input id="pay-reference" value={reference} onChange={e => setReference(e.target.value)} maxLength={100}
              placeholder="EFT reference (optional)"
              className="w-full rounded-lg px-3 py-1.5 text-sm focus:outline-none"
              style={{ border: `1px solid ${T.hairline}`, color: T.text }} />
          </div>
        </div>}
        {err && <p className="mt-2 text-xs" style={{ color: T.danger }}>{err}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 px-3 py-2 rounded-lg text-sm" style={{ border: `1px solid ${T.hairline}`, color: T.textMuted }}>{open ? 'Cancel' : 'Close'}</button>
          {open && (
            <button onClick={handlePay} disabled={saving}
              className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ background: T.accentStrong, color: '#fff' }}>
              {saving ? '…' : 'Record Payment'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Take a supplier's credit note off one of its open bills. The bills offered
 * are the same supplier's, still owing; one owing less than the credit cannot
 * take it, as the server refuses that too.
 */
function ApplyCreditModal({ credit, onApply, onClose }) {
  const [billId, setBillId] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const amount = -credit.amountInc;
  // The supplier's open bills only, asked of the server: the first page of
  // all their bills is the oldest, all paid.
  const { data: theirs = [], isFetching } = useQuery({
    queryKey: ['ap-bills', 'credit-targets', supplierOf(credit)],
    queryFn: () => api.supplierBills.list({
      ...(credit.supplierId ? { supplier_id: credit.supplierId } : { supplier_name: credit.supplierName }),
      open_only: true,
    }),
  });
  const open = theirs.filter(b =>
    b.id !== credit.id && !isCredit(b) && b.status !== 'paid' && supplierOf(b) === supplierOf(credit));

  const handleApply = async () => {
    if (!billId) { setErr('Choose the bill it comes off'); return; }
    setSaving(true); setErr('');
    try { await onApply(Number(billId)); }
    catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div role="dialog" aria-label="Apply credit note" className="rounded-lg shadow-xl w-96 p-5" style={{ background: T.panel }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold" style={{ color: T.text }}>Apply Credit Note</h3>
          <button onClick={onClose} aria-label="Close"><X className="w-4 h-4" style={{ color: T.textFaint }} /></button>
        </div>
        <p className="text-sm mb-3" style={{ color: T.textMuted }}>
          Credit: <span className="font-medium" style={{ color: T.text }}>{credit.billNumber || `#${credit.id}`}</span>
          {' · '}<span className="font-semibold" style={{ color: T.ok }}>{fmt$(amount)}</span><br />
          from {credit.supplierName || '—'}
        </p>
        {!isFetching && open.length === 0 && (
          <p className="text-sm" style={{ color: T.textFaint }}>This supplier has no open bill to apply it to.</p>
        )}
        {open.length > 0 && (
          <fieldset className="space-y-1.5">
            <legend className="text-xs mb-1" style={{ color: T.textMuted }}>Comes off bill</legend>
            {open.map(b => {
              const tooSmall = b.outstanding + 0.005 < amount;
              return (
                <label key={b.id} className="flex items-start gap-2 text-sm rounded-lg px-2 py-1.5"
                  style={{ border: `1px solid ${String(b.id) === billId ? T.accentStrong : T.hairline}`, color: tooSmall ? T.textFaint : T.text, cursor: tooSmall ? 'not-allowed' : 'pointer' }}>
                  <input type="radio" name="credit-target" value={b.id} disabled={tooSmall} className="mt-0.5"
                    checked={String(b.id) === billId} onChange={e => setBillId(e.target.value)} />
                  <span className="flex-1 min-w-0">
                    <span className="flex justify-between gap-2">
                      <span className="truncate">{b.billNumber || `#${b.id}`} · {b.billDate || '—'}</span>
                      <span className="whitespace-nowrap tabular-nums">{fmt$(b.outstanding)} owing</span>
                    </span>
                    {tooSmall && <span className="block text-xs">Owes less than the credit</span>}
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}
        {err && <p className="mt-2 text-xs" style={{ color: T.danger }}>{err}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 px-3 py-2 rounded-lg text-sm" style={{ border: `1px solid ${T.hairline}`, color: T.textMuted }}>Cancel</button>
          <button onClick={handleApply} disabled={saving || open.length === 0}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: T.accentStrong, color: '#fff' }}>
            {saving ? '…' : 'Apply Credit'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AccountsPayableModule({ suppliers = [] }) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [queryErr, setQueryErr] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [billForm, setBillForm] = useState(null);   // null = closed, {} = new, bill = edit
  const [payModal, setPayModal] = useState(null);
  const [creditModal, setCreditModal] = useState(null);
  const [delConfirm, setDelConfirm] = useState(null);

  const { data: bills = [], isFetching } = useQuery({
    queryKey: ['ap-bills', statusFilter],
    queryFn: () => api.supplierBills.list(statusFilter ? { status: statusFilter } : {}),
    staleTime: 30000,
    onError: (e) => { const m = e?.message || String(e); setQueryErr(m); notify(m, { type: 'error' }); },
  });

  const { data: summary } = useQuery({
    queryKey: ['ap-summary'],
    queryFn: api.supplierBills.summary,
    staleTime: 30000,
    onError: (e) => { const m = e?.message || String(e); setQueryErr(m); notify(m, { type: 'error' }); },
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

  const handlePay = async (amt, paidDate, reference) => {
    await api.supplierBills.pay(payModal.id, amt, paidDate, reference);
    invalidate(); setPayModal(null);
  };

  const handleTakeBack = async (paymentId) => {
    await api.supplierBills.deletePayment(payModal.id, paymentId);
    invalidate(); qc.invalidateQueries({ queryKey: ['ap-bill', payModal.id] }); setPayModal(null);
  };

  const handleApplyCredit = async (billId) => {
    await api.supplierBills.applyCredit(creditModal.id, billId);
    invalidate(); setCreditModal(null);
  };

  const handleDelete = async () => {
    await api.supplierBills.delete(delConfirm);
    invalidate(); setDelConfirm(null);
  };

  // What an applied credit note names: the bill it came off.
  const numberOf = (id) => {
    const b = bills.find(x => x.id === id);
    return b ? (b.billNumber || `#${b.id}`) : `#${id}`;
  };

  const filtered = bills.filter(b => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (b.supplierName||'').toLowerCase().includes(q)
      || (b.billNumber||'').toLowerCase().includes(q)
      || (b.description||'').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg p-4" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: T.accentTint }}>
                <Clock className="w-4.5 h-4.5" style={{ color: T.accentStrong }} />
              </div>
              <div>
                <p className="text-xs" style={{ color: T.textMuted }}>Total Open</p>
                <p className="text-lg font-bold" style={{ color: T.text }}>{fmt$(summary.total_open_amount)}</p>
                <p className="text-xs" style={{ color: T.textFaint }}>{summary.total_open_count} bill{summary.total_open_count !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl shadow-sm p-4" style={{ background: T.panel, border: `1px solid ${summary.overdue_count > 0 ? T.danger : T.hairline}` }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: summary.overdue_count > 0 ? T.dangerTint : T.hairlineSoft }}>
                <AlertCircle className="w-4.5 h-4.5" style={{ color: summary.overdue_count > 0 ? T.danger : T.textFaint }} />
              </div>
              <div>
                <p className="text-xs" style={{ color: T.textMuted }}>Overdue</p>
                <p className="text-lg font-bold" style={{ color: summary.overdue_count > 0 ? T.danger : T.textFaint }}>{fmt$(summary.overdue_amount)}</p>
                <p className="text-xs" style={{ color: T.textFaint }}>{summary.overdue_count} bill{summary.overdue_count !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg p-4" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-accent-tint rounded-lg flex items-center justify-center">
                <DollarSign className="w-4.5 h-4.5 text-accent-strong" />
              </div>
              <div>
                <p className="text-xs" style={{ color: T.textMuted }}>Due This Week</p>
                <p className="text-lg font-bold" style={{ color: T.text }}>{fmt$(summary.due_this_week_amount)}</p>
                <p className="text-xs" style={{ color: T.textFaint }}>{summary.due_this_week_count} bill{summary.due_this_week_count !== 1 ? 's' : ''}</p>
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
          className="flex-1 min-w-48 rounded-lg px-3 py-2 text-sm focus:outline-none"
          style={{ border: `1px solid ${T.hairline}`, color: T.text }}
        />
        <div className="flex rounded-lg overflow-hidden text-xs" style={{ border: `1px solid ${T.hairline}` }}>
          {[['', 'All'], ['pending', 'Pending'], ['approved', 'Approved'], ['paid', 'Paid']].map(([v, l]) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className="px-3 py-2 font-medium"
              style={statusFilter === v
                ? { background: T.accentStrong, color: '#fff' }
                : { background: T.panel, color: T.textMuted }}>
              {l}
            </button>
          ))}
        </div>
        <button onClick={() => exportCSV(filtered)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm" style={{ border: `1px solid ${T.hairline}`, color: T.textMuted }}>
          <Download className="w-3.5 h-3.5" />CSV
        </button>
        <button onClick={() => setBillForm({})}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: T.accentStrong, color: '#fff' }}>
          <Plus className="w-4 h-4" />New Bill
        </button>
      </div>

      {/* Table */}
      <div className="rounded-lg overflow-hidden" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
        {isFetching && <div className="h-1 animate-pulse" style={{ background: T.hairline }} />}
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: T.hairlineSoft, borderBottom: `1px solid ${T.hairline}` }}>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>Supplier</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>Bill #</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>Bill Date</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>Due Date</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>Description</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>Ex GST</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>Inc GST</th>
              <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>Status</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>Outstanding</th>
              <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: T.hairline }}>
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-12 text-center text-sm" style={{ color: T.textFaint }}>
                {statusFilter ? `No ${statusFilter} bills` : 'No bills yet — click New Bill to add one'}
              </td></tr>
            )}
            {filtered.map(bill => {
              const over = isOverdue(bill);
              const outstanding = bill.outstanding;
              return (
                <tr key={bill.id} style={over ? { background: T.dangerTint } : {}}>
                  <td className="px-3 py-2.5 font-medium" style={{ color: T.text }}>{bill.supplierName || '—'}</td>
                  <td className="px-3 py-2.5 font-mono text-xs" style={{ color: T.accentStrong }}>
                    {bill.billNumber || `#${bill.id}`}
                    <PoMatch bill={bill} />
                  </td>
                  <td className="px-3 py-2.5 text-xs" style={{ color: T.textMuted }}>{bill.billDate || '—'}</td>
                  <td className="px-3 py-2.5 text-xs font-medium" style={{ color: over ? T.danger : T.textMuted }}>
                    {bill.dueDate || '—'}{over ? ' ⚠' : ''}
                  </td>
                  <td className="px-3 py-2.5 text-xs max-w-48 truncate" style={{ color: T.textMuted }}>{bill.description || '—'}</td>
                  <td className="px-3 py-2.5 text-right" style={{ color: T.textMuted }}>{fmt$(bill.amountEx)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold" style={{ color: T.text }}>{fmt$(bill.amountInc)}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_STYLES[bill.status] || 'bg-hairline-soft text-muted border-hairline'}`}>
                      {bill.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-sm" style={{ color: outstanding > 0 && bill.status !== 'paid' ? T.danger : T.ok }}>
                    {bill.status === 'paid' ? fmt$(0) : fmt$(outstanding)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center gap-1">
                      {isCredit(bill) ? (
                        bill.appliedToBillId ? (
                          <span className="text-[11px]" style={{ color: T.textMuted }}>
                            Applied to {bill.appliedToBillNumber || numberOf(bill.appliedToBillId)}
                          </span>
                        ) : (
                          <button onClick={() => setCreditModal(bill)}
                            aria-label={`Apply credit note ${bill.billNumber || bill.id}`}
                            className="flex items-center gap-0.5 text-[11px] px-2 py-1 rounded-lg font-medium"
                            style={{ border: `1px solid ${T.accentStrong}`, color: T.accentStrong }}>
                            <Receipt className="w-3 h-3" />Apply
                          </button>
                        )
                      ) : bill.status !== 'paid' ? (
                        <button onClick={() => setPayModal(bill)}
                          className="flex items-center gap-0.5 text-[11px] px-2 py-1 rounded-lg font-medium"
                          style={{ background: T.accentStrong, color: '#fff' }}>
                          <CheckCircle className="w-3 h-3" />Pay
                        </button>
                      ) : (
                        <button onClick={() => setPayModal(bill)}
                          className="text-[11px] px-2 py-1 rounded-lg font-medium"
                          style={{ border: `1px solid ${T.hairline}`, color: T.textMuted }}>
                          Payments
                        </button>
                      )}
                      <button onClick={() => setBillForm(bill)}
                        aria-label={`Edit bill ${bill.billNumber || bill.id}`} title="Edit bill"
                        className="p-1 rounded" style={{ color: T.textFaint }}>
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDelConfirm(bill.id)}
                        aria-label={`Delete bill ${bill.billNumber || bill.id}`} title="Delete bill"
                        className="p-1 rounded" style={{ color: T.textFaint }}>
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
              <tr className="font-semibold" style={{ background: T.hairlineSoft, borderTop: `2px solid ${T.hairline}` }}>
                <td colSpan={5} className="px-3 py-2 text-xs" style={{ color: T.textMuted }}>{filtered.length} bill{filtered.length !== 1 ? 's' : ''}</td>
                <td className="px-3 py-2 text-right text-xs" style={{ color: T.textMuted }}>{fmt$(filtered.reduce((s, b) => s + b.amountEx, 0))}</td>
                <td className="px-3 py-2 text-right text-sm" style={{ color: T.text }}>{fmt$(filtered.reduce((s, b) => s + b.amountInc, 0))}</td>
                <td />
                <td className="px-3 py-2 text-right text-sm" style={{ color: T.danger }}>
                  {fmt$(filtered.filter(b => b.status !== 'paid').reduce((s, b) => s + b.outstanding, 0))}
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
        <PayModal bill={payModal} onPay={handlePay} onTakeBack={handleTakeBack} onClose={() => setPayModal(null)} />
      )}

      {/* Apply a credit note */}
      {creditModal && (
        <ApplyCreditModal credit={creditModal} onApply={handleApplyCredit} onClose={() => setCreditModal(null)} />
      )}

      {/* Delete confirm */}
      {delConfirm !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="rounded-lg shadow-xl p-6 w-80" style={{ background: T.panel }}>
            <p className="font-semibold mb-2" style={{ color: T.text }}>Delete this bill?</p>
            <p className="text-sm mb-5" style={{ color: T.textMuted }}>This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setDelConfirm(null)} className="flex-1 px-3 py-2 rounded-lg text-sm" style={{ border: `1px solid ${T.hairline}`, color: T.textMuted }}>Cancel</button>
              <button onClick={handleDelete} className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold" style={{ background: T.danger, color: '#fff' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
