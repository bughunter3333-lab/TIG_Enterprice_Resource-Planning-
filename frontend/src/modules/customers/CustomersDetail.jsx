import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Edit, Printer, Trash2, Users, X } from 'lucide-react';
import CustomersModule from '../../modules/customers/CustomersModule';
import { custOutstanding as outstandingOf, custRevenue as revenueOf, invoicedJobs } from './customerAggregates';
import { useOffer } from '../../lib/useMyAccess';
import { reports } from '../../api';
import LogosTab from './LogosTab';
import SitesTab from './SitesTab';
import RemittanceForm from './RemittanceForm';

const AGING_BUCKETS = [
  ['current', 'Current', 'green'],
  ['days_1_30', '1–30 days', 'yellow'],
  ['days_31_60', '31–60 days', 'orange'],
  ['days_61_90', '61–90 days', 'red'],
  ['over_90', 'Over 90 days', 'red'],
];

/**
 * This customer's row of the server's aged receivables: aged by payment terms
 * counted from the invoice date (backend/app/core/payment_terms.py). Same query
 * key as Reports → Aged Receivables, so the two never disagree.
 */
function AgedReceivablesTab({ customerId }) {
  const offer = useOffer();
  const { data, isPending, isError } = useQuery({
    queryKey: ['reports/aged-receivables'],
    queryFn: () => reports.agedReceivables(),
  });
  if (isError) return <p className="text-sm text-danger">Couldn't load aged receivables.</p>;
  if (isPending) return <p className="text-sm text-muted">Loading aged receivables…</p>;
  // No row means nothing owed: a real zero, not missing data.
  const row = (data?.rows || []).find((r) => r.customer_id === customerId) || {};
  return (
    <div>
      <p className="text-sm text-muted mb-4">Overdue by payment terms, counted from the invoice date</p>
      <div className="grid grid-cols-5 gap-3 mb-5">
        {AGING_BUCKETS.map(([key, label, col]) => (
          <div key={key} className={`rounded-lg p-3 text-center border ${col==='green'?'bg-ok-tint border-ok':col==='yellow'?'bg-warn-tint border-warn':col==='orange'?'bg-accent-tint border-accent':'bg-danger-tint border-danger'}`}>
            <p className="text-xs font-semibold text-muted mb-1">{label}</p>
            <p className={`text-lg font-bold ${col==='green'?'text-ok':col==='yellow'?'text-warn':col==='orange'?'text-accent-strong':'text-danger'}`}>${Number(row[key] || 0).toFixed(0)}</p>
          </div>
        ))}
      </div>
      <div className="text-sm">
        <div className="flex justify-between font-bold py-2 border-t-2"><span>Total outstanding:</span><span className="text-danger">${Number(row.total || 0).toFixed(2)}</span></div>
      </div>
      {offer('POST', `/customers/${customerId}/remittances`) && Number(row.total || 0) > 0 && (
        <RemittanceForm customerId={customerId} owed={Number(row.total || 0)} />
      )}
    </div>
  );
}

export default function CustomersDetail({ customers, deleteCustomer, exportToCSV, jobs, openModal, pinJob, searchTerm, setActiveModule, setFilterCustomer, setSearchTerm }) {
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [custDetailTab, setCustDetailTab] = useState('overview');
  const offer = useOffer();

  const custJobs = (c) => jobs.filter(j => j.customerId === c.id);
  // Invoiced basis, shared with the list and the server's statement: see customerAggregates.js.
  const custOutstanding = (c) => outstandingOf(c, jobs);
  const custRevenue = (c) => revenueOf(c, jobs);
  const creditUtil = (c) => c.creditLimit > 0 ? Math.min(100, (custOutstanding(c) / c.creditLimit) * 100) : 0;

  return (
    <>
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div style={{ flex: '0 0 46%', minWidth: 0 }}>
        <CustomersModule
          customers={customers}
          jobs={jobs}
          search={searchTerm}
          onSearchChange={setSearchTerm}
          selectedId={selectedCustomer?.id ?? null}
          onSelectCustomer={(c) => { setSelectedCustomer(c); setCustDetailTab('overview'); }}
          onNewCustomer={() => openModal('customer')}
          onExport={() => exportToCSV(customers, 'customers')}
        />
      </div>

      {/* Customer Detail Panel */}
      <div style={{ flex: 1, minWidth: 0 }}>
          {!selectedCustomer ? (
            <div className="bg-white rounded-lg shadow h-full flex flex-col items-center justify-center py-16 text-faint">
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
            // Aged AR reads a money report: staff and above (overseas staff get 403).
            const tabs = [
              'overview', 'jobs',
              ...(offer('GET', '/reports/aged-receivables') ? ['aging'] : []),
              'statement',
              ...(offer('GET', '/logos') ? ['logos'] : []),
              ...(offer('GET', '/customers/{customer_id}/ship-tos') ? ['sites'] : []),
            ];

            return (
              <div className="bg-white rounded-lg shadow">
                {/* Customer header */}
                <div className="p-5 border-b flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-accent-strong to-accent-strong text-white font-black text-2xl flex items-center justify-center shadow-md">
                      {(c.name||'?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-fg">{c.name}</h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs font-mono text-muted bg-hairline-soft px-2 py-0.5 rounded">{c.id}</span>
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${c.status === 'Active' || !c.status ? 'bg-ok-tint text-ok' : 'bg-danger-tint text-danger'}`}>{c.status || 'Active'}</span>
                        <span className="text-xs text-muted">{c.accountType || 'Account'}</span>
                        {c.creditHold && <span className="text-xs bg-danger-tint text-danger px-2 py-0.5 rounded font-bold">On credit hold</span>}
                        {overLimit && <span className="text-xs bg-danger-tint text-danger px-2 py-0.5 rounded font-bold">⚠ Over Credit Limit</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openModal('customer', c)} className="px-3 py-1.5 bg-accent-tint text-accent-strong rounded hover:bg-accent-tint flex items-center gap-1 text-sm font-medium">
                      <Edit className="w-3.5 h-3.5" />Edit
                    </button>
                    <button onClick={() => { setSelectedCustomer(null); deleteCustomer(c.id); }} className="px-3 py-1.5 bg-danger-tint text-danger rounded hover:bg-danger-tint flex items-center gap-1 text-sm">
                      <Trash2 className="w-3.5 h-3.5" />Delete
                    </button>
                    <button onClick={() => setSelectedCustomer(null)} className="p-1.5 hover:bg-hairline-soft rounded">
                      <X className="w-4 h-4 text-muted" />
                    </button>
                  </div>
                </div>

                {/* Account KPIs */}
                <div className="grid grid-cols-4 gap-0 border-b">
                  {[
                    { label: 'Total Jobs', value: cJobs.length, color: 'text-accent-strong' },
                    { label: 'Invoiced (ex GST)', value: `$${revenue.toLocaleString('en-AU',{maximumFractionDigits:0})}`, color: 'text-ok' },
                    { label: 'Outstanding', value: `$${outstanding.toLocaleString('en-AU',{maximumFractionDigits:0})}`, color: outstanding > 0 ? 'text-danger' : 'text-faint' },
                    { label: 'Credit Used', value: c.creditLimit > 0 ? `${util.toFixed(0)}%` : 'Unlimited', color: util > 80 ? 'text-accent-strong' : 'text-muted' },
                  ].map((k, i) => (
                    <div key={k.label} className={`p-4 text-center ${i < 3 ? 'border-r' : ''}`}>
                      <p className="text-xs text-muted">{k.label}</p>
                      <p className={`text-xl font-bold mt-0.5 ${k.color}`}>{k.value}</p>
                    </div>
                  ))}
                </div>

                {/* Credit limit bar */}
                {c.creditLimit > 0 && (
                  <div className="px-5 py-2 border-b bg-panel-alt flex items-center gap-3">
                    <span className="text-xs text-muted shrink-0">Credit: ${outstanding.toLocaleString('en-AU',{maximumFractionDigits:0})} / ${c.creditLimit.toLocaleString()}</span>
                    <div className="flex-1 bg-hairline rounded-full h-2">
                      <div className={`h-2 rounded-full ${overLimit?'bg-danger':util>80?'bg-accent-strong':'bg-ok'}`} style={{width:`${Math.min(100,util)}%`}}/>
                    </div>
                    <span className={`text-xs font-semibold shrink-0 ${overLimit?'text-danger':util>80?'text-accent-strong':'text-muted'}`}>{util.toFixed(0)}%</span>
                  </div>
                )}

                {/* Tabs */}
                <div className="flex border-b px-4 gap-1 bg-panel-alt">
                  {tabs.map(tab => (
                    <button key={tab} onClick={() => setCustDetailTab(tab)}
                      className={`px-4 py-2.5 text-sm font-medium border-b-2 capitalize transition-colors ${custDetailTab===tab?'border-accent text-accent-strong':'border-transparent text-muted hover:text-header'}`}>
                      {tab === 'aging' ? 'Aged AR' : tab}
                    </button>
                  ))}
                </div>

                <div className="p-5">
                  {/* Overview Tab */}
                  {custDetailTab === 'overview' && (
                    <div className="grid grid-cols-2 gap-6 text-sm">
                      <div className="space-y-3">
                        <h4 className="font-semibold text-header border-b pb-1">Contact Details</h4>
                        {[['Contact',c.contact],['Email',c.email],['Phone',c.phone||c.mobile],['Mobile',c.mobile&&c.phone?c.mobile:null],['Address',c.address]].filter(([,v])=>v).map(([label,val])=>(
                          <div key={label} className="flex gap-3"><span className="text-muted w-16 shrink-0">{label}:</span><span className="text-fg font-medium">{val}</span></div>
                        ))}
                        {c.abn && <div className="flex gap-3"><span className="text-muted w-16 shrink-0">ABN:</span><span className="font-mono font-medium">{c.abn}</span></div>}
                      </div>
                      <div className="space-y-3">
                        <h4 className="font-semibold text-header border-b pb-1">Account Settings</h4>
                        {[['Type',c.accountType||'Account'],['Terms',c.paymentTerms||'Net 30'],['Credit Limit',c.creditLimit?`$${Number(c.creditLimit).toLocaleString()}`:'Unlimited'],['Account Mgr',c.accountManager]].filter(([,v])=>v).map(([label,val])=>(
                          <div key={label} className="flex gap-3"><span className="text-muted w-24 shrink-0">{label}:</span><span className="text-fg font-medium">{val}</span></div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Jobs Tab */}
                  {custDetailTab === 'jobs' && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm text-muted">{cJobs.length} jobs · ${revenue.toLocaleString('en-AU',{maximumFractionDigits:0})} invoiced ex GST</p>
                        <button onClick={() => { setActiveModule('jobs'); setFilterCustomer(c.id); }} className="text-xs text-accent-strong hover:underline">View in Jobs →</button>
                      </div>
                      <div className="max-h-72 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-panel-alt sticky top-0">
                            <tr><th className="text-left px-3 py-2">Job #</th><th className="text-left px-3 py-2">Status</th><th className="text-left px-3 py-2">Date</th><th className="text-right px-3 py-2">Total</th><th className="text-right px-3 py-2">Balance</th></tr>
                          </thead>
                          <tbody className="divide-y divide-hairline-soft">
                            {cJobs.sort((a,b)=>b.id.localeCompare(a.id)).map(j => (
                              <tr key={j.id} className="hover:bg-accent-tint cursor-pointer" onClick={() => { pinJob(j); setActiveModule('jobs'); }}>
                                <td className="px-3 py-2 font-mono font-bold text-accent-strong">#{j.id}</td>
                                <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded text-[10px] bg-hairline-soft font-medium">{j.status}</span></td>
                                <td className="px-3 py-2 text-muted">{j.dateIn}</td>
                                <td className="px-3 py-2 text-right font-medium">${(j.total||0).toFixed(2)}</td>
                                <td className={`px-3 py-2 text-right font-semibold ${j.balanceDue > 0 ? 'text-danger' : 'text-faint'}`}>${(j.balanceDue||0).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Aged AR Tab */}
                  {custDetailTab === 'aging' && tabs.includes('aging') && <AgedReceivablesTab customerId={c.id} />}

                  {/* Logos Tab */}
                  {custDetailTab === 'logos' && tabs.includes('logos') && <LogosTab customerId={c.id} />}

                  {/* Sites Tab */}
                  {custDetailTab === 'sites' && tabs.includes('sites') && <SitesTab customerId={c.id} />}

                  {/* Statement Tab */}
                  {custDetailTab === 'statement' && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm text-muted">Account statement — all transactions</p>
                        <div className="flex items-center gap-2">
                          {/* The statement PDF is money: staff and above (overseas staff get 403). */}
                          {offer('GET', `/customers/${c.id}/statement.pdf`) && <a
                            href={`/api/customers/${c.id}/statement.pdf`}
                            target="_blank" rel="noopener noreferrer"
                            className="text-xs bg-danger text-white px-3 py-1.5 rounded hover:bg-danger flex items-center gap-1"
                          ><Download className="w-3 h-3"/>Download PDF</a>}
                          <button onClick={() => window.print()} className="text-xs bg-accent-strong text-white px-3 py-1.5 rounded hover:bg-accent-strong flex items-center gap-1"><Printer className="w-3 h-3"/>Print</button>
                        </div>
                      </div>
                      <table className="w-full text-xs border-collapse">
                        <thead className="bg-panel-alt"><tr>
                          <th className="text-left px-3 py-2 border-b">Date</th>
                          <th className="text-left px-3 py-2 border-b">Job #</th>
                          <th className="text-left px-3 py-2 border-b">Description</th>
                          <th className="text-right px-3 py-2 border-b">Charges</th>
                          <th className="text-right px-3 py-2 border-b">Payments</th>
                          <th className="text-right px-3 py-2 border-b">Balance</th>
                        </tr></thead>
                        <tbody>
                          {(() => {
                            // Invoiced jobs only — a quote or an open order is not a charge.
                            let running = 0;
                            return [...invoicedJobs(c, jobs)].sort((a,b)=>a.dateIn?.localeCompare(b.dateIn||'')||0).map(j => {
                              running += parseFloat(j.total||0);
                              const paid = parseFloat(j.deposit||j.invoicePaid||0);
                              running -= paid;
                              return (
                                <tr key={j.id} className="border-b hover:bg-panel-alt">
                                  <td className="px-3 py-2 text-muted">{j.dateIn}</td>
                                  <td className="px-3 py-2 font-mono font-bold text-accent-strong">#{j.id}</td>
                                  <td className="px-3 py-2">{j.status} {j.custRef?`· Ref: ${j.custRef}`:''}</td>
                                  <td className="px-3 py-2 text-right">${(j.total||0).toFixed(2)}</td>
                                  <td className="px-3 py-2 text-right text-ok">{paid > 0 ? `-$${paid.toFixed(2)}` : '—'}</td>
                                  <td className={`px-3 py-2 text-right font-semibold ${running>0?'text-danger':'text-ok'}`}>${running.toFixed(2)}</td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                        <tfoot>
                          <tr className="bg-hairline-soft font-bold border-t-2"><td colSpan={3} className="px-3 py-2">Total Outstanding</td><td className="px-3 py-2 text-right">${invoicedJobs(c, jobs).reduce((s, j) => s + parseFloat(j.total || 0), 0).toFixed(2)}</td><td className="px-3 py-2 text-right text-ok">-${invoicedJobs(c, jobs).reduce((s, j) => s + parseFloat(j.deposit || j.invoicePaid || 0), 0).toFixed(2)}</td><td className={`px-3 py-2 text-right ${outstanding>0?'text-danger':'text-ok'}`}>${outstanding.toFixed(2)}</td></tr>
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
    </>
  );
}
