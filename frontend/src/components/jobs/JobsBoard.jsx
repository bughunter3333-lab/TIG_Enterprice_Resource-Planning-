import { useState } from 'react';
import KanbanColumn from './KanbanColumn';

const STATUSES = ['QUOTE', 'ORDER', 'In Progress', 'PROOF', 'PRINT', 'FINISH', 'INVOICE', 'PAID'];

const STATUS_COLORS = {
  QUOTE: '#f59e0b', ORDER: '#3b82f6', 'In Progress': '#8b5cf6',
  PROOF: '#06b6d4', PRINT: '#ec4899', FINISH: '#10b981',
  INVOICE: '#a855f7', PAID: '#64748b', CANCEL: '#ef4444',
};

export default function JobsBoard({ jobs, onJobClick, currentUser }) {
  const [view, setView] = useState('board');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const today = new Date().toISOString().slice(0, 10);

  const filtered = (jobs ?? []).filter(job => {
    if (filter === 'today') return job.due === today && !['PAID','CANCEL'].includes(job.status);
    if (filter === 'overdue') return job.due && job.due < today && !['PAID','CANCEL'].includes(job.status);
    if (filter === 'mine') return job.assignedTo === currentUser?.username;
    return true;
  }).filter(job => {
    if (!search) return true;
    const q = search.toLowerCase();
    return String(job.id).toLowerCase().includes(q) || (job.customer ?? '').toLowerCase().includes(q);
  });

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
        {['all', 'today', 'overdue', 'mine'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              fontSize: 10, padding: '3px 9px', borderRadius: 5, border: '1px solid #e2e8f0',
              background: filter === f ? '#eff6ff' : 'white', borderColor: filter === f ? '#bfdbfe' : '#e2e8f0',
              color: filter === f ? '#3b82f6' : '#64748b', fontWeight: filter === f ? 600 : 400, cursor: 'pointer',
            }}
          >
            {f === 'all' ? 'All' : f === 'today' ? 'Due Today' : f === 'overdue' ? 'Overdue' : 'Mine'}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search jobs…"
          style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', outline: 'none', width: 160 }}
        />
        <button onClick={() => setView('board')} title="Board" style={{ padding: '4px 8px', borderRadius: '5px 0 0 5px', border: '1px solid #e2e8f0', background: view === 'board' ? '#eff6ff' : 'white', cursor: 'pointer', fontSize: 13, color: view === 'board' ? '#3b82f6' : '#64748b' }}>⊞</button>
        <button onClick={() => setView('list')} title="List" style={{ padding: '4px 8px', borderRadius: '0 5px 5px 0', border: '1px solid #e2e8f0', borderLeft: 'none', background: view === 'list' ? '#eff6ff' : 'white', cursor: 'pointer', fontSize: 13, color: view === 'list' ? '#3b82f6' : '#64748b' }}>☰</button>
      </div>

      {view === 'board' ? (
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
          {STATUSES.map(status => (
            <KanbanColumn
              key={status}
              status={status}
              jobs={filtered.filter(j => j.status === status)}
              onJobClick={onJobClick}
            />
          ))}
        </div>
      ) : (
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 9, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 120px 80px 80px 80px', padding: '7px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 10, fontWeight: 700, color: '#94a3b8' }}>
            <span>JOB #</span><span>CUSTOMER</span><span>STATUS</span><span>DEC</span><span>TOTAL</span><span>DUE</span>
          </div>
          {filtered.map(job => {
            const color = STATUS_COLORS[job.status] ?? '#94a3b8';
            const dec = [...new Set((job.items ?? []).map(i => i.decorationType).filter(d => d && d !== 'None'))][0] ?? '—';
            return (
              <div
                key={job.id}
                onClick={() => onJobClick(job)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onJobClick(job); } }}
                style={{ display: 'grid', gridTemplateColumns: '80px 1fr 120px 80px 80px 80px', padding: '8px 14px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: 12 }}
              >
                <span style={{ color: '#3b82f6', fontWeight: 600 }}>#{job.id}</span>
                <span style={{ color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.customer}</span>
                <span><span style={{ background: `${color}20`, color, padding: '1px 6px', borderRadius: 8, fontSize: 10, fontWeight: 600 }}>{job.status}</span></span>
                <span style={{ color: '#64748b', fontSize: 10 }}>{dec}</span>
                <span style={{ color: '#0f172a', fontWeight: 600 }}>${(job.total ?? 0).toLocaleString('en-AU', { maximumFractionDigits: 0 })}</span>
                <span style={{ color: '#94a3b8', fontSize: 10 }}>{job.due ?? '—'}</span>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: 24 }}>No jobs match this filter</div>
          )}
        </div>
      )}
    </div>
  );
}
