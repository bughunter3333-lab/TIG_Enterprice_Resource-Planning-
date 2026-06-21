import { useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Users, Filter, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { T } from '../ui/tokens';

const STATUS_COLORS = {
  QUOTE: 'bg-gray-100 text-gray-700 border-gray-300',
  New: 'bg-amber-100 text-amber-700 border-amber-300',
  ORDER: 'bg-amber-100 text-amber-700 border-amber-300',
  'In Progress': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  PROOF: 'bg-purple-100 text-purple-700 border-purple-300',
  PRINT: 'bg-indigo-100 text-indigo-700 border-indigo-300',
  'Pick/Pack': 'bg-cyan-100 text-cyan-700 border-cyan-300',
  FINISH: 'bg-green-100 text-green-800 border-green-300',
  INVOICE: 'bg-teal-100 text-teal-700 border-teal-300',
  PAID: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  CANCEL: 'bg-red-100 text-red-700 border-red-300',
};

const DEC_COLORS = {
  EMB:    { dot: 'bg-purple-500',  pill: 'bg-purple-50 text-purple-700',  label: 'Embroidery' },
  TRS:    { dot: 'bg-indigo-500',  pill: 'bg-indigo-50 text-indigo-700',  label: 'Transfer' },
  Screen: { dot: 'bg-amber-500',    pill: 'bg-amber-50 text-amber-700',      label: 'Screen Print' },
  DTF:    { dot: 'bg-teal-500',    pill: 'bg-teal-50 text-teal-700',      label: 'DTF' },
  Laser:  { dot: 'bg-red-500',     pill: 'bg-red-50 text-red-700',        label: 'Laser' },
  Sub:    { dot: 'bg-pink-500',    pill: 'bg-pink-50 text-pink-700',      label: 'Sublimation' },
  Pad:    { dot: 'bg-amber-600',    pill: 'bg-amber-50 text-amber-700',      label: 'Pad Print' },
  Vinyl:  { dot: 'bg-green-500',   pill: 'bg-green-50 text-green-700',    label: 'Vinyl Cut' },
  None:   { dot: 'bg-gray-300',    pill: 'bg-gray-50 text-gray-500',      label: 'None' },
};

const PROD_STATUSES = ['ORDER', 'In Progress', 'PROOF', 'PRINT', 'Pick/Pack', 'FINISH'];

function parseDate(str) {
  if (!str) return null;
  const parts = str.split('/');
  if (parts.length === 3) {
    const [d, m, y] = parts;
    return new Date(+y, +m - 1, +d);
  }
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekStart(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function addDays(d, n) {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt;
}

function ScheduleJobCard({ job, onPin, onDrop, isDragOver }) {
  const due = parseDate(job.due);
  const now = new Date();
  const isOverdue = due && due < now && !['FINISH', 'PAID', 'CANCEL', 'INVOICE'].includes(job.status);
  const daysLeft = due ? Math.ceil((due - now) / 86400000) : null;
  const decs = [...new Set((job.items || []).map(i => i.decorationType).filter(d => d && d !== 'None'))];
  const primaryDec = decs[0] || null;
  const decStyle = primaryDec ? DEC_COLORS[primaryDec] : DEC_COLORS.None;

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('jobId', job.id); e.dataTransfer.setData('jobData', JSON.stringify(job)); }}
      onClick={() => onPin(job)}
      className="group p-2.5 rounded-lg border cursor-grab active:cursor-grabbing hover:shadow-md transition-all select-none"
      style={isOverdue
        ? { borderColor: T.danger, background: T.dangerTint }
        : { borderColor: T.hairline, background: T.panel }}
    >
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <span className="font-mono text-xs font-bold" style={{ color: T.accentStrong }}>#{job.id}</span>
        <div className="flex items-center gap-1 shrink-0">
          {job.priority === 'Urgent' && <span className="text-[10px] px-1 rounded font-bold leading-4" style={{ background: T.dangerTint, color: T.danger }}>URG</span>}
          {job.priority === 'High' && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1 rounded font-bold leading-4">HIGH</span>}
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[job.status] || 'bg-gray-100 text-gray-600'}`}>{job.status}</span>
        </div>
      </div>
      <p className="text-xs font-semibold truncate leading-tight" style={{ color: T.text }}>{job.customer}</p>
      {decs.length > 0 && (
        <div className="flex gap-1 flex-wrap mt-1.5">
          {decs.slice(0, 2).map(d => (
            <span key={d} className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5 font-medium ${DEC_COLORS[d]?.pill || 'bg-gray-50 text-gray-500'}`}>
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${DEC_COLORS[d]?.dot || 'bg-gray-400'}`} />
              {DEC_COLORS[d]?.label || d}
            </span>
          ))}
          {decs.length > 2 && <span className="text-[10px]" style={{ color: T.textFaint }}>+{decs.length - 2}</span>}
        </div>
      )}
      <div className="flex items-center justify-between mt-1.5 pt-1.5" style={{ borderTop: `1px solid ${T.hairline}` }}>
        {due ? (
          <span className="text-[10px] font-medium" style={{ color: isOverdue ? T.danger : daysLeft <= 1 ? '#c2410c' : T.textFaint }}>
            {isOverdue ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Due today' : `${daysLeft}d left`}
          </span>
        ) : <span className="text-[10px]" style={{ color: T.textFaint }}>No due date</span>}
        <span className="text-[10px] font-semibold" style={{ color: T.textMuted }}>${(job.total || 0).toFixed(0)}</span>
      </div>
      {job.assignedTo && (
        <p className="text-[10px] mt-0.5 truncate" style={{ color: T.textFaint }}>👤 {job.assignedTo}</p>
      )}
    </div>
  );
}

function DayColumn({ date, jobs, isToday, onPin, onDropJob, filterStatus }) {
  const [dragOver, setDragOver] = useState(false);
  const dayName = date.toLocaleDateString('en-AU', { weekday: 'short' });
  const dayNum = date.getDate();
  const monthShort = date.toLocaleDateString('en-AU', { month: 'short' });
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;

  const displayed = filterStatus === 'all' ? jobs : jobs.filter(j => j.status === filterStatus);
  const overdueCount = displayed.filter(j => {
    const d = parseDate(j.due);
    return d && d < new Date() && !['FINISH', 'PAID', 'CANCEL', 'INVOICE'].includes(j.status);
  }).length;

  return (
    <div
      className={`flex-1 min-w-0 rounded-xl border-t-4 transition-colors ${dragOver ? 'ring-2 ring-inset' : ''}`}
      style={{
        borderTopColor: isToday ? T.accentStrong : T.hairline,
        background: isToday ? '#fefce8' : isWeekend ? T.hairlineSoft : T.panel,
        ...(dragOver ? { outlineColor: T.accentStrong } : {}),
      }}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault();
        setDragOver(false);
        const jobId = e.dataTransfer.getData('jobId');
        if (jobId) onDropJob(jobId, date);
      }}
    >
      {/* Header */}
      <div className="px-2 py-2 text-center" style={{ borderBottom: `1px solid ${T.hairline}` }}>
        <p className="text-xs font-medium uppercase tracking-wide" style={{ color: T.textMuted }}>{dayName}</p>
        <div
          className="text-lg font-bold mx-auto w-8 h-8 flex items-center justify-center rounded-full"
          style={isToday
            ? { background: T.accentStrong, color: '#fff' }
            : { color: isWeekend ? T.textFaint : T.text }}
        >
          {dayNum}
        </div>
        <p className="text-[10px]" style={{ color: T.textFaint }}>{monthShort}</p>
        <div className="flex items-center justify-center gap-2 mt-1">
          <span className="text-[10px] font-medium" style={{ color: T.textMuted }}>{displayed.length} job{displayed.length !== 1 ? 's' : ''}</span>
          {overdueCount > 0 && <span className="text-[10px] px-1 rounded font-bold" style={{ background: T.dangerTint, color: T.danger }}>{overdueCount} late</span>}
        </div>
      </div>

      {/* Cards */}
      <div className="p-2 space-y-2 min-h-32 max-h-[55vh] overflow-y-auto">
        {displayed.length === 0 ? (
          <div className="text-center py-6 text-xs" style={{ color: dragOver ? T.accentStrong : T.textFaint }}>
            {dragOver ? 'Drop to reschedule' : isWeekend ? 'Weekend' : '—'}
          </div>
        ) : (
          displayed.map(job => (
            <ScheduleJobCard key={job.id} job={job} onPin={onPin} />
          ))
        )}
        {dragOver && displayed.length > 0 && (
          <div className="border-2 border-dashed rounded-lg py-2 text-center text-xs" style={{ borderColor: T.accentStrong, color: T.accentStrong }}>Drop here</div>
        )}
      </div>
    </div>
  );
}

export default function SchedulingModule({ jobs = [], onPinJob, onUpdateJobDue, currentUser }) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [filterDec, setFilterDec] = useState('all');
  const [filterStaff, setFilterStaff] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showWeekend, setShowWeekend] = useState(false);
  const [droppingJob, setDroppingJob] = useState(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekEnd = addDays(weekStart, 6);
  const weekLabel = `${weekStart.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const days = Array.from({ length: showWeekend ? 7 : 5 }, (_, i) => addDays(weekStart, i));

  // Jobs that are "in play" (production statuses OR overdue from earlier)
  const relevantJobs = jobs.filter(j => {
    if (!PROD_STATUSES.includes(j.status) && j.status !== 'QUOTE' && j.status !== 'New') return false;
    if (filterDec !== 'all') {
      const decs = (j.items || []).map(i => i.decorationType).filter(Boolean);
      if (!decs.includes(filterDec)) return false;
    }
    if (filterStaff !== 'all' && j.assignedTo !== filterStaff) return false;
    return true;
  });

  // Group by due date
  const jobsByDay = {};
  const unscheduledJobs = [];
  const laterJobs = [];

  relevantJobs.forEach(job => {
    const d = parseDate(job.due);
    if (!d) { unscheduledJobs.push(job); return; }
    const key = isoDate(d);
    if (d >= weekStart && d <= weekEnd) {
      if (!jobsByDay[key]) jobsByDay[key] = [];
      jobsByDay[key].push(job);
    } else if (d < weekStart) {
      unscheduledJobs.push(job); // overdue from before this week
    } else {
      laterJobs.push(job);
    }
  });

  // Staff workload this week
  const staffWorkload = {};
  relevantJobs.forEach(job => {
    const d = parseDate(job.due);
    if (d && d >= weekStart && d <= weekEnd) {
      const name = job.assignedTo || 'Unassigned';
      staffWorkload[name] = (staffWorkload[name] || 0) + 1;
    }
  });

  const allStaff = [...new Set(jobs.map(j => j.assignedTo).filter(Boolean))].sort();
  const allDecs = Object.keys(DEC_COLORS).filter(k => k !== 'None');

  const overdueFromPrev = unscheduledJobs.filter(j => {
    const d = parseDate(j.due);
    return d && d < weekStart;
  });
  const noDateJobs = unscheduledJobs.filter(j => !parseDate(j.due));

  function handleDropJob(jobId, newDate) {
    const dueDDMMYYYY = `${String(newDate.getDate()).padStart(2, '0')}/${String(newDate.getMonth() + 1).padStart(2, '0')}/${newDate.getFullYear()}`;
    if (onUpdateJobDue) onUpdateJobDue(jobId, dueDDMMYYYY);
  }

  const totalThisWeek = days.reduce((sum, d) => sum + (jobsByDay[isoDate(d)] || []).length, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5" style={{ color: T.accentStrong }} />
          <h2 className="text-lg font-bold" style={{ color: T.text }}>Production Schedule</h2>
          <span className="text-sm px-2 py-0.5 rounded-full" style={{ color: T.textMuted, background: T.hairlineSoft }}>{totalThisWeek} jobs this week</span>
        </div>

        {/* Week navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart(getWeekStart(today))}
            className="text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors"
            style={{ borderColor: T.hairline, background: T.panel, color: T.textMuted }}
          >
            Today
          </button>
          <div className="flex items-center rounded-lg overflow-hidden shadow-sm" style={{ border: `1px solid ${T.hairline}`, background: T.panel }}>
            <button onClick={() => setWeekStart(w => addDays(w, -7))} className="p-2 transition-colors hover:bg-gray-50">
              <ChevronLeft className="w-4 h-4" style={{ color: T.textMuted }} />
            </button>
            <span className="px-3 text-sm font-semibold min-w-48 text-center" style={{ color: T.text }}>{weekLabel}</span>
            <button onClick={() => setWeekStart(w => addDays(w, 7))} className="p-2 transition-colors hover:bg-gray-50">
              <ChevronRight className="w-4 h-4" style={{ color: T.textMuted }} />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <select value={filterDec} onChange={e => setFilterDec(e.target.value)}
            className="rounded-lg px-2 py-1.5 text-xs focus:outline-none"
            style={{ border: `1px solid ${T.hairline}`, color: T.text }}>
            <option value="all">All Decoration</option>
            {allDecs.map(d => <option key={d} value={d}>{DEC_COLORS[d]?.label || d}</option>)}
          </select>
          <select value={filterStaff} onChange={e => setFilterStaff(e.target.value)}
            className="rounded-lg px-2 py-1.5 text-xs focus:outline-none"
            style={{ border: `1px solid ${T.hairline}`, color: T.text }}>
            <option value="all">All Staff</option>
            {allStaff.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="rounded-lg px-2 py-1.5 text-xs focus:outline-none"
            style={{ border: `1px solid ${T.hairline}`, color: T.text }}>
            <option value="all">All Statuses</option>
            {PROD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            onClick={() => setShowWeekend(v => !v)}
            className="text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors"
            style={showWeekend
              ? { background: T.accentTint, color: T.accentStrong, borderColor: T.accent }
              : { background: T.panel, color: T.textMuted, borderColor: T.hairline }}
          >
            Weekend
          </button>
        </div>
      </div>

      {/* Decoration legend */}
      <div className="flex items-center gap-2 flex-wrap">
        {Object.entries(DEC_COLORS).filter(([k]) => k !== 'None').map(([key, val]) => (
          <button
            key={key}
            onClick={() => setFilterDec(f => f === key ? 'all' : key)}
            className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border transition-colors ${
              filterDec === key ? val.pill + ' border-current font-semibold' : ''
            }`}
            style={filterDec === key ? {} : { background: T.panel, color: T.textMuted, borderColor: T.hairline }}
          >
            <span className={`w-2 h-2 rounded-full ${val.dot}`} />
            {val.label}
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        {/* Main week grid */}
        <div className="flex-1 min-w-0">
          {/* Overdue carry-over */}
          {overdueFromPrev.length > 0 && (
            <div className="mb-3 rounded-xl p-3" style={{ background: T.dangerTint, border: `1px solid ${T.danger}` }}>
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 shrink-0" style={{ color: T.danger }} />
                <span className="text-sm font-semibold" style={{ color: T.danger }}>Overdue from previous weeks ({overdueFromPrev.length})</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {overdueFromPrev.map(job => (
                  <ScheduleJobCard key={job.id} job={job} onPin={onPinJob} />
                ))}
              </div>
            </div>
          )}

          {/* Day columns */}
          <div className="flex gap-2">
            {days.map(date => {
              const key = isoDate(date);
              const isToday = isoDate(date) === isoDate(today);
              const dayJobs = jobsByDay[key] || [];
              return (
                <DayColumn
                  key={key}
                  date={date}
                  jobs={dayJobs}
                  isToday={isToday}
                  onPin={onPinJob}
                  onDropJob={handleDropJob}
                  filterStatus={filterStatus}
                />
              );
            })}
          </div>

          {/* Unscheduled */}
          {noDateJobs.length > 0 && (
            <div className="mt-3 rounded-xl p-3" style={{ background: T.hairlineSoft, border: `1px solid ${T.hairline}` }}>
              <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: T.textMuted }}>No Due Date ({noDateJobs.length})</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {noDateJobs.map(job => (
                  <ScheduleJobCard key={job.id} job={job} onPin={onPinJob} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: staff workload */}
        <div className="w-48 shrink-0 space-y-3">
          <div className="rounded-lg p-4" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4" style={{ color: T.accentStrong }} />
              <h3 className="text-sm font-semibold" style={{ color: T.text }}>Staff This Week</h3>
            </div>
            {Object.keys(staffWorkload).length === 0 ? (
              <p className="text-xs text-center py-4" style={{ color: T.textFaint }}>No jobs assigned</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(staffWorkload)
                  .sort((a, b) => b[1] - a[1])
                  .map(([name, count]) => {
                    const maxCount = Math.max(...Object.values(staffWorkload));
                    const pct = (count / maxCount) * 100;
                    const isSelected = filterStaff === name;
                    return (
                      <button
                        key={name}
                        onClick={() => setFilterStaff(f => f === name ? 'all' : name)}
                        className="w-full text-left transition-colors rounded-lg p-1.5"
                        style={{ background: isSelected ? T.accentTint : 'transparent' }}
                      >
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-medium truncate" style={{ color: isSelected ? T.accentStrong : T.text }}>{name}</span>
                          <span className="text-xs shrink-0 ml-1" style={{ color: T.textMuted }}>{count}</span>
                        </div>
                        <div className="w-full rounded-full h-1" style={{ background: T.hairline }}>
                          <div className="h-1 rounded-full transition-all" style={{ width: `${pct}%`, background: T.accentStrong }} />
                        </div>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Decoration mix this week */}
          {(() => {
            const decMix = {};
            days.forEach(date => {
              (jobsByDay[isoDate(date)] || []).forEach(job => {
                (job.items || []).forEach(item => {
                  if (item.decorationType && item.decorationType !== 'None') {
                    decMix[item.decorationType] = (decMix[item.decorationType] || 0) + 1;
                  }
                });
              });
            });
            const total = Object.values(decMix).reduce((s, v) => s + v, 0);
            if (!total) return null;
            return (
              <div className="rounded-lg p-4" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-purple-500" />
                  <h3 className="text-sm font-semibold" style={{ color: T.text }}>Dec. Mix</h3>
                </div>
                <div className="space-y-1.5">
                  {Object.entries(decMix).sort((a, b) => b[1] - a[1]).map(([dec, count]) => {
                    const info = DEC_COLORS[dec] || DEC_COLORS.None;
                    const pct = Math.round((count / total) * 100);
                    return (
                      <div key={dec} className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${info.dot}`} />
                        <span className="text-[10px] truncate flex-1" style={{ color: T.textMuted }}>{info.label}</span>
                        <span className="text-[10px] shrink-0" style={{ color: T.textFaint }}>{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Later this schedule */}
          {laterJobs.length > 0 && (
            <div className="rounded-lg p-4" style={{ background: T.panel, border: `1px solid ${T.hairline}` }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: T.textMuted }}>Coming Up ({laterJobs.length})</p>
              <div className="space-y-1.5">
                {laterJobs.slice(0, 6).map(job => {
                  const d = parseDate(job.due);
                  return (
                    <button
                      key={job.id}
                      onClick={() => onPinJob && onPinJob(job)}
                      className="w-full text-left p-1.5 rounded transition-colors hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold" style={{ color: T.accentStrong }}>#{job.id}</span>
                        <span className="text-[10px]" style={{ color: T.textFaint }}>
                          {d ? d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '—'}
                        </span>
                      </div>
                      <p className="text-[10px] truncate" style={{ color: T.textMuted }}>{job.customer}</p>
                    </button>
                  );
                })}
                {laterJobs.length > 6 && (
                  <p className="text-[10px] text-center" style={{ color: T.textFaint }}>+{laterJobs.length - 6} more</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-center" style={{ color: T.textFaint }}>
        Drag job cards between day columns to reschedule · Click any card to open the job · Decoration filters apply globally
      </p>
    </div>
  );
}
