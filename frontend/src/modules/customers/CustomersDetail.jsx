import { useState } from 'react';
import { Download, Edit, Printer, Trash2, Users, X } from 'lucide-react';
import CustomersModule from '../../modules/customers/CustomersModule';

export default function CustomersDetail({ customers, deleteCustomer, exportToCSV, jobs, openModal, pinJob, searchTerm, setActiveModule, setFilterCustomer, setSearchTerm }) {
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [custDetailTab, setCustDetailTab] = useState('overview');

  const custJobs = (c) => jobs.filter(j => j.customerId === c.id);
  const custOutstanding = (c) => custJobs(c).reduce((s, j) => s + parseFloat(j.balanceDue || 0), 0);
  const custRevenue = (c) => custJobs(c).reduce((s, j) => s + parseFloat(j.total || 0), 0);
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
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-black text-2xl flex items-center justify-center shadow-md">
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
                    <button onClick={() => openModal('customer', c)} className="px-3 py-1.5 bg-blue-50 text-blue-800 rounded hover:bg-blue-100 flex items-center gap-1 text-sm font-medium">
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
                    { label: 'Total Jobs', value: cJobs.length, color: 'text-blue-800' },
                    { label: 'Lifetime Revenue', value: `$${revenue.toLocaleString('en-AU',{maximumFractionDigits:0})}`, color: 'text-green-600' },
                    { label: 'Outstanding', value: `$${outstanding.toLocaleString('en-AU',{maximumFractionDigits:0})}`, color: outstanding > 0 ? 'text-red-600' : 'text-gray-400' },
                    { label: 'Credit Used', value: c.creditLimit > 0 ? `${util.toFixed(0)}%` : 'Unlimited', color: util > 80 ? 'text-indigo-600' : 'text-gray-600' },
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
                      <div className={`h-2 rounded-full ${overLimit?'bg-red-500':util>80?'bg-indigo-400':'bg-green-500'}`} style={{width:`${Math.min(100,util)}%`}}/>
                    </div>
                    <span className={`text-xs font-semibold shrink-0 ${overLimit?'text-red-600':util>80?'text-indigo-600':'text-gray-500'}`}>{util.toFixed(0)}%</span>
                  </div>
                )}

                {/* Tabs */}
                <div className="flex border-b px-4 gap-1 bg-gray-50">
                  {['overview','jobs','aging','statement'].map(tab => (
                    <button key={tab} onClick={() => setCustDetailTab(tab)}
                      className={`px-4 py-2.5 text-sm font-medium border-b-2 capitalize transition-colors ${custDetailTab===tab?'border-blue-700 text-blue-800':'border-transparent text-gray-500 hover:text-gray-700'}`}>
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
                        <button onClick={() => { setActiveModule('jobs'); setFilterCustomer(c.id); }} className="text-xs text-blue-800 hover:underline">View in Jobs →</button>
                      </div>
                      <div className="max-h-72 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr><th className="text-left px-3 py-2">Job #</th><th className="text-left px-3 py-2">Status</th><th className="text-left px-3 py-2">Date</th><th className="text-right px-3 py-2">Total</th><th className="text-right px-3 py-2">Balance</th></tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {cJobs.sort((a,b)=>b.id.localeCompare(a.id)).map(j => (
                              <tr key={j.id} className="hover:bg-blue-50 cursor-pointer" onClick={() => { pinJob(j); setActiveModule('jobs'); }}>
                                <td className="px-3 py-2 font-mono font-bold text-blue-800">#{j.id}</td>
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
                          <div key={label} className={`rounded-lg p-3 text-center border ${col==='green'?'bg-green-50 border-green-200':col==='yellow'?'bg-yellow-50 border-yellow-200':col==='orange'?'bg-indigo-50 border-indigo-200':'bg-red-50 border-red-200'}`}>
                            <p className="text-xs font-semibold text-gray-500 mb-1">{label}</p>
                            <p className={`text-lg font-bold ${col==='green'?'text-green-700':col==='yellow'?'text-yellow-700':col==='orange'?'text-indigo-600':'text-red-600'}`}>${amt.toFixed(0)}</p>
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
                          <button onClick={() => window.print()} className="text-xs bg-blue-700 text-white px-3 py-1.5 rounded hover:bg-blue-800 flex items-center gap-1"><Printer className="w-3 h-3"/>Print</button>
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
                                  <td className="px-3 py-2 font-mono font-bold text-blue-800">#{j.id}</td>
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
    </>
  );
}
