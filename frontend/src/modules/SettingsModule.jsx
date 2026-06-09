import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Building2, CreditCard, Mail, Save, CheckCircle, AlertCircle, RefreshCw, Wifi, Terminal } from 'lucide-react';
import * as api from '../api';
import { notify } from '../lib/notify';

const TABS = [
  { id: 'company', label: 'Company Info', icon: Building2 },
  { id: 'bank', label: 'Bank & Payments', icon: CreditCard },
  { id: 'email', label: 'SMTP / Email', icon: Mail },
  { id: 'tyro', label: 'Tyro EFTPOS', icon: Terminal },
];

function FieldRow({ label, children }) {
  return (
    <div className="grid grid-cols-3 items-center gap-3">
      <label className="text-sm font-medium text-gray-600 text-right">{label}</label>
      <div className="col-span-2">{children}</div>
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = 'text', disabled = false }) {
  return (
    <input
      type={type}
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-400"
    />
  );
}

export default function SettingsModule({ currentUser }) {
  const [tab, setTab] = useState('company');
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);
  const [smtpTest, setSmtpTest] = useState(null);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['settings/company'],
    queryFn: () => api.settings.getCompany(),
    staleTime: 60000,
    onError: (e) => { const m = e?.message || String(e); notify(m, { type: 'error' }); },
  });

  useEffect(() => {
    if (data) setForm({ ...data });
  }, [data]);

  const isAdmin = currentUser?.role === 'admin';

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: (payload) => api.settings.updateCompany(payload),
    onSuccess: (updated) => {
      setForm({ ...updated });
      qc.setQueryData(['settings/company'], updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }));
  }

  if (isLoading || !form) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />Loading settings…
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {!isAdmin && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          You have read-only access. Admin role required to change settings.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />{t.label}
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
        {/* ── Company Info ── */}
        {tab === 'company' && (
          <>
            <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-2">
              <Building2 className="w-4 h-4 text-blue-600" />Company Information
            </h3>
            <FieldRow label="Company Name">
              <TextInput value={form.company_name} onChange={v => set('company_name', v)} placeholder="e.g. Total Image Group Pty Ltd" disabled={!isAdmin} />
            </FieldRow>
            <FieldRow label="ABN">
              <TextInput value={form.abn} onChange={v => set('abn', v)} placeholder="e.g. 12 345 678 901" disabled={!isAdmin} />
            </FieldRow>
            <FieldRow label="Address">
              <textarea
                value={form.address || ''}
                onChange={e => set('address', e.target.value)}
                rows={3}
                disabled={!isAdmin}
                placeholder="Street address, suburb, state, postcode"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 resize-none"
              />
            </FieldRow>
            <FieldRow label="Phone">
              <TextInput value={form.phone} onChange={v => set('phone', v)} placeholder="e.g. 02 9123 4567" disabled={!isAdmin} />
            </FieldRow>
            <FieldRow label="Email">
              <TextInput value={form.email} onChange={v => set('email', v)} placeholder="accounts@yourcompany.com.au" disabled={!isAdmin} />
            </FieldRow>
            <FieldRow label="Website">
              <TextInput value={form.website} onChange={v => set('website', v)} placeholder="https://www.yourcompany.com.au" disabled={!isAdmin} />
            </FieldRow>
            <FieldRow label="GST Rate (%)">
              <TextInput value={form.gst_rate} onChange={v => set('gst_rate', v)} type="number" placeholder="10" disabled={!isAdmin} />
            </FieldRow>
            <FieldRow label="Invoice Prefix">
              <TextInput value={form.invoice_prefix} onChange={v => set('invoice_prefix', v)} placeholder="INV" disabled={!isAdmin} />
            </FieldRow>
            <FieldRow label="Quote Prefix">
              <TextInput value={form.quote_prefix} onChange={v => set('quote_prefix', v)} placeholder="QT" disabled={!isAdmin} />
            </FieldRow>
            <FieldRow label="Default Payment Terms">
              <select value={form.payment_terms_default || 'Net 30'} onChange={e => set('payment_terms_default', e.target.value)}
                disabled={!isAdmin}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50">
                {['Net 7','Net 14','Net 21','Net 30','Net 60','COD','Prepaid'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </FieldRow>
          </>
        )}

        {/* ── Bank & Payments ── */}
        {tab === 'bank' && (
          <>
            <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-2">
              <CreditCard className="w-4 h-4 text-green-600" />Bank Account Details
            </h3>
            <p className="text-xs text-gray-500 mb-3">These details are printed on emailed invoices under the payment section.</p>
            <FieldRow label="Bank Name">
              <TextInput value={form.bank_name} onChange={v => set('bank_name', v)} placeholder="e.g. Commonwealth Bank" disabled={!isAdmin} />
            </FieldRow>
            <FieldRow label="BSB">
              <TextInput value={form.bank_bsb} onChange={v => set('bank_bsb', v)} placeholder="e.g. 062-000" disabled={!isAdmin} />
            </FieldRow>
            <FieldRow label="Account Number">
              <TextInput value={form.bank_account} onChange={v => set('bank_account', v)} placeholder="e.g. 12345678" disabled={!isAdmin} />
            </FieldRow>
            <FieldRow label="Account Name">
              <TextInput value={form.bank_account_name} onChange={v => set('bank_account_name', v)} placeholder="e.g. Total Image Group Pty Ltd" disabled={!isAdmin} />
            </FieldRow>
            {form.bank_name && (
              <div className="bg-gray-50 border rounded-lg p-4 text-sm text-gray-700 mt-2">
                <p className="font-semibold text-gray-800 mb-1">Preview — Invoice Payment Details Block:</p>
                <p>Bank: {form.bank_name}</p>
                <p>BSB: {form.bank_bsb} &nbsp; Account: {form.bank_account}</p>
                <p>Account Name: {form.bank_account_name}</p>
              </div>
            )}
          </>
        )}

        {/* ── SMTP ── */}
        {tab === 'email' && (
          <>
            <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-2">
              <Mail className="w-4 h-4 text-blue-600" />SMTP Email Settings
            </h3>
            <p className="text-xs text-gray-500 mb-3">Configure an SMTP account to send invoices and quotes directly from TIG ERP.</p>
            <FieldRow label="SMTP Host">
              <TextInput value={form.smtp_host} onChange={v => set('smtp_host', v)} placeholder="e.g. smtp.gmail.com" disabled={!isAdmin} />
            </FieldRow>
            <FieldRow label="SMTP Port">
              <TextInput value={form.smtp_port} onChange={v => set('smtp_port', parseInt(v) || 587)} type="number" placeholder="587" disabled={!isAdmin} />
            </FieldRow>
            <FieldRow label="SMTP Username">
              <TextInput value={form.smtp_user} onChange={v => set('smtp_user', v)} placeholder="your@email.com" disabled={!isAdmin} />
            </FieldRow>
            <FieldRow label="SMTP Password">
              <TextInput value={form.smtp_password} onChange={v => set('smtp_password', v)} type="password" placeholder="App password or SMTP password" disabled={!isAdmin} />
            </FieldRow>
            <FieldRow label="From Name">
              <TextInput value={form.smtp_from_name} onChange={v => set('smtp_from_name', v)} placeholder="e.g. Total Image Group" disabled={!isAdmin} />
            </FieldRow>
            <FieldRow label="Connection">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={!!form.smtp_use_tls} onChange={e => set('smtp_use_tls', e.target.checked)}
                    disabled={!isAdmin} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                  Use STARTTLS (port 587, recommended)
                </label>
              </div>
              <p className="text-xs text-gray-400 mt-1">Uncheck for SSL/TLS (port 465)</p>
            </FieldRow>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
              <strong>Gmail tip:</strong> Use an App Password (not your login password). Go to Google Account → Security → 2-Step Verification → App passwords.
            </div>
            {isAdmin && (
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  disabled={smtpTesting || !form.smtp_host}
                  onClick={async () => {
                    setSmtpTesting(true);
                    setSmtpTest(null);
                    try {
                      const r = await api.settings.testSmtp();
                      setSmtpTest({ ok: true, message: r.message });
                    } catch (err) {
                      setSmtpTest({ ok: false, message: err.message });
                    } finally {
                      setSmtpTesting(false);
                    }
                  }}
                  className="flex items-center gap-2 border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {smtpTesting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                  {smtpTesting ? 'Testing…' : 'Test Connection'}
                </button>
                {smtpTest && (
                  <span className={`flex items-center gap-1.5 text-sm ${smtpTest.ok ? 'text-green-700' : 'text-red-600'}`}>
                    {smtpTest.ok
                      ? <CheckCircle className="w-4 h-4 shrink-0" />
                      : <AlertCircle className="w-4 h-4 shrink-0" />}
                    {smtpTest.message}
                  </span>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Tyro EFTPOS ── */}
        {tab === 'tyro' && (
          <>
            <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-2">
              <Terminal className="w-4 h-4 text-blue-600" />Tyro EFTPOS Integration
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Connect TIG ERP to your Tyro EFTPOS terminal. When taking card payments in the job payment screen,
              the charge will be sent directly to the terminal for the customer to tap or insert their card.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-700 mb-4">
              <strong>Setup:</strong> Your Merchant ID and Terminal ID are provided by Tyro when you sign up.
              Use <em>Sandbox</em> for testing without a real terminal — switch to <em>Production</em> when you're ready to go live.
            </div>
            <FieldRow label="Merchant ID">
              <TextInput
                value={form.tyro_merchant_id}
                onChange={v => set('tyro_merchant_id', v)}
                placeholder="e.g. MID-12345"
                disabled={!isAdmin}
              />
            </FieldRow>
            <FieldRow label="Terminal ID">
              <TextInput
                value={form.tyro_terminal_id}
                onChange={v => set('tyro_terminal_id', v)}
                placeholder="e.g. TID-67890"
                disabled={!isAdmin}
              />
            </FieldRow>
            <FieldRow label="Environment">
              <select
                value={form.tyro_environment || 'sandbox'}
                onChange={e => set('tyro_environment', e.target.value)}
                disabled={!isAdmin}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50"
              >
                <option value="sandbox">Sandbox (testing)</option>
                <option value="production">Production (live)</option>
              </select>
            </FieldRow>
            {form.tyro_merchant_id && (
              <div className="bg-gray-50 border rounded-lg p-4 text-sm text-gray-700 mt-2 space-y-1">
                <p className="font-semibold text-gray-800 mb-1">Current configuration:</p>
                <p>Merchant ID: <span className="font-mono">{form.tyro_merchant_id}</span></p>
                {form.tyro_terminal_id && <p>Terminal ID: <span className="font-mono">{form.tyro_terminal_id}</span></p>}
                <p>Environment: <span className={`font-semibold ${form.tyro_environment === 'production' ? 'text-green-700' : 'text-amber-700'}`}>
                  {form.tyro_environment === 'production' ? 'Production — live charges' : 'Sandbox — test mode'}
                </span></p>
              </div>
            )}
          </>
        )}
      </div>

      {isAdmin && (
        <div className="flex items-center gap-3 justify-end">
          {saved && (
            <span className="flex items-center gap-1 text-sm text-green-600">
              <CheckCircle className="w-4 h-4" />Settings saved successfully
            </span>
          )}
          <button
            onClick={() => save(form)}
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Settings
          </button>
        </div>
      )}
    </div>
  );
}
