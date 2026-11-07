import { useState } from 'react';
import { X, ChevronRight, ChevronDown, ListFilter, Trash2, Boxes, FileText, ShoppingCart } from 'lucide-react';
import { T, statusColor } from '../tokens';
import { todayKey } from '../../lib/dates';
import { inView, viewLabel } from '../../modules/jobs/jobMetrics';
import { statusLabel } from '../../modules/jobs/jobStatuses';

// Built-in quick lists — the shared job views (modules/jobs/jobMetrics.js), so
// each count here is the length of the list it opens, and agrees with the
// status strip and the quick filters. They sit alongside the user's own saved
// lists (Jim2 lets users build their own; these are presets).
export const SAVED_LISTS = ['mine', 'dueToday', 'overdue', 'pickPack'].map((id) => ({
  id,
  label: viewLabel(id),
  test: (j, user) => inView(j, id, { today: todayKey(), user }),
}));

function SectionLabel({ children }) {
  return (
    <div style={{ padding: '16px 10px 4px', fontSize: 11, fontWeight: 500, color: T.textFaint }}>
      {children}
    </div>
  );
}

const rowHover = {
  onMouseEnter: (e) => { e.currentTarget.style.background = T.railHover; },
  onMouseLeave: (e) => { e.currentTarget.style.background = 'transparent'; },
};

// A job's status in the tree: its phase dot and the word, quietly.
function StatusMark({ status, maxWidth = 80 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0, maxWidth, flexShrink: 1 }}>
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor(status), flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{statusLabel(status)}</span>
    </span>
  );
}

// One tree row. `caret` shows an expand chevron for parent nodes; when `onCaretClick`
// is given the caret toggles expansion independently of the row's primary click.
function TreeRow({ depth = 0, caret = null, onCaretClick, icon = null, label, count, countColor, bold, onClick, title, children: trailing }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter') onClick?.(); }}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, minHeight: 28,
        padding: `0 10px 0 ${8 + depth * 14}px`, borderRadius: T.radiusSm,
        fontSize: T.fsGrid, cursor: 'pointer', color: T.text,
        transition: `background ${T.transition}`,
      }}
      {...rowHover}
    >
      <span
        onClick={onCaretClick ? (e) => { e.stopPropagation(); onCaretClick(); } : undefined}
        style={{ width: 14, display: 'flex', flexShrink: 0, color: T.textFaint }}
      >
        {caret}
      </span>
      {icon && <span style={{ display: 'flex', flexShrink: 0, color: T.textMuted }}>{icon}</span>}
      <span style={{ flex: 1, fontWeight: bold ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      {trailing}
      {count != null && (
        <span style={{ fontSize: 11, fontWeight: 600, color: countColor ?? T.textMuted, fontVariantNumeric: 'tabular-nums' }}>
          {count}
        </span>
      )}
    </div>
  );
}

// A single open job shown flat under Jobs (Jim2 "blue" individual job nodes).
function OpenJobRow({ job, onOpen, onUnpin }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(job)}
      onKeyDown={e => { if (e.key === 'Enter') onOpen(job); }}
      style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 28, padding: '0 10px 0 28px', borderRadius: T.radiusSm, fontSize: T.fsGrid, cursor: 'pointer', color: T.text, transition: `background ${T.transition}` }}
      {...rowHover}
    >
      <span style={{ fontFamily: T.fontMono, fontSize: T.fsSmall }}>{job.id}</span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex' }}><StatusMark status={job.status} /></span>
      {onUnpin && (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Close ${job.id}`}
          onClick={e => { e.stopPropagation(); onUnpin(job.id); }}
          onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onUnpin(job.id); } }}
          onMouseEnter={e => { e.currentTarget.style.color = T.danger; }}
                      onMouseLeave={e => { e.currentTarget.style.color = T.textFaint; }}
                      style={{ color: T.textFaint, display: 'flex', transition: `color ${T.transition}` }}
        >
          <X size={11} />
        </span>
      )}
    </div>
  );
}

export default function LiveTree({
  jobs = [], pinnedJobs = [], currentUser, onOpenJob, onUnpinJob, onSelectList,
  savedLists = [], onRunList, onDeleteList,
  savedStockLists = [], onRunStockList, onDeleteStockList, onOpenStock,
  savedQuoteLists = [], onRunQuoteList, onDeleteQuoteList,
  savedPOLists = [], onRunPOList, onDeletePOList, onOpenPO,
}) {
  const [jobsOpen, setJobsOpen] = useState(true);
  const [stockOpen, setStockOpen] = useState(true);
  const [quotesOpen, setQuotesOpen] = useState(true);
  const [purchasesOpen, setPurchasesOpen] = useState(true);
  const [openLists, setOpenLists] = useState(() => new Set());

  const toggleList = (id) => setOpenLists(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const jobsCount = pinnedJobs.length + savedLists.length;

  return (
    <div style={{ fontFamily: T.font, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <SectionLabel>Open work</SectionLabel>

      {/* Jobs parent → individual open jobs (blue) + saved Lists (yellow) */}
      <TreeRow
        depth={0}
        bold
        caret={jobsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        label="Jobs"
        count={jobsCount || undefined}
        onClick={() => setJobsOpen(o => !o)}
      />
      {jobsOpen && (
        <>
          {pinnedJobs.length === 0 && savedLists.length === 0 && (
            <div style={{ padding: '4px 10px 4px 28px', fontSize: T.fsSmall, color: T.textFaint }}>Jobs you open stay here</div>
          )}

          {/* Individual open jobs — singular, not a batch */}
          {pinnedJobs.map(job => (
            <OpenJobRow key={job.id} job={job} onOpen={onOpenJob} onUnpin={onUnpinJob} />
          ))}

          {/* Saved Lists — named, live count, expand to members */}
          {savedLists.map(list => {
            const isOpen = openLists.has(list.id);
            return (
              <div key={list.id}>
                <TreeRow
                  depth={1}
                  caret={isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  onCaretClick={() => toggleList(list.id)}
                  icon={<ListFilter size={11} />}
                  label={list.name}
                  count={list.jobs.length}
                  onClick={() => onRunList && onRunList(list.id)}
                  title={`Run list "${list.name}" (${list.jobs.length})`}
                >
                  {onDeleteList && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Delete list ${list.name}`}
                      onClick={e => { e.stopPropagation(); onDeleteList(list.id); }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onDeleteList(list.id); } }}
                      onMouseEnter={e => { e.currentTarget.style.color = T.danger; }}
                      onMouseLeave={e => { e.currentTarget.style.color = T.textFaint; }}
                      style={{ color: T.textFaint, display: 'flex', transition: `color ${T.transition}` }}
                    >
                      <Trash2 size={11} />
                    </span>
                  )}
                </TreeRow>
                {isOpen && list.jobs.length === 0 && (
                  <div style={{ padding: '2px 10px 2px 34px', fontSize: T.fsSmall, color: T.textFaint }}>No matching jobs</div>
                )}
                {isOpen && list.jobs.map(job => (
                  <TreeRow
                    key={job.id}
                    depth={2}
                    label={job.id}
                    onClick={() => onOpenJob(job)}
                  >
                    <StatusMark status={job.status} maxWidth={84} />
                  </TreeRow>
                ))}
              </div>
            );
          })}
        </>
      )}

      {/* Stock parent → saved Stock Lists (appears once you create one) */}
      {savedStockLists.length > 0 && (
        <>
          <TreeRow
            depth={0}
            bold
            caret={stockOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            icon={<Boxes size={12} />}
            label="Stock"
            count={savedStockLists.length}
            onClick={() => setStockOpen(o => !o)}
          />
          {stockOpen && savedStockLists.map(list => {
            const isOpen = openLists.has(list.id);
            return (
              <div key={list.id}>
                <TreeRow
                  depth={1}
                  caret={isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  onCaretClick={() => toggleList(list.id)}
                  icon={<ListFilter size={11} />}
                  label={list.name}
                  count={list.items.length}
                  onClick={() => onRunStockList && onRunStockList(list.id)}
                  title={`Open stock list "${list.name}" (${list.items.length})`}
                >
                  {onDeleteStockList && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Delete list ${list.name}`}
                      onClick={e => { e.stopPropagation(); onDeleteStockList(list.id); }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onDeleteStockList(list.id); } }}
                      onMouseEnter={e => { e.currentTarget.style.color = T.danger; }}
                      onMouseLeave={e => { e.currentTarget.style.color = T.textFaint; }}
                      style={{ color: T.textFaint, display: 'flex', transition: `color ${T.transition}` }}
                    >
                      <Trash2 size={11} />
                    </span>
                  )}
                </TreeRow>
                {isOpen && list.items.length === 0 && (
                  <div style={{ padding: '2px 10px 2px 34px', fontSize: T.fsSmall, color: T.textFaint }}>No matching items</div>
                )}
                {isOpen && list.items.map(item => (
                  <TreeRow key={item.sku} depth={2} label={item.sku} onClick={() => onOpenStock && onOpenStock(item.sku)}>
                    <span style={{ color: T.textMuted, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 84 }}>{item.name}</span>
                  </TreeRow>
                ))}
              </div>
            );
          })}
        </>
      )}

      {/* Quotes parent → saved Quote Lists (appears once you create one) */}
      {savedQuoteLists.length > 0 && (
        <>
          <TreeRow
            depth={0}
            bold
            icon={<FileText size={12} />}
            caret={quotesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            label="Quotes"
            count={savedQuoteLists.length}
            onClick={() => setQuotesOpen(o => !o)}
          />
          {quotesOpen && savedQuoteLists.map(list => {
            const isOpen = openLists.has(list.id);
            return (
              <div key={list.id}>
                <TreeRow
                  depth={1}
                  caret={isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  onCaretClick={() => toggleList(list.id)}
                  icon={<ListFilter size={11} />}
                  label={list.name}
                  count={list.jobs.length}
                  onClick={() => onRunQuoteList && onRunQuoteList(list.id)}
                  title={`Open quote list "${list.name}" (${list.jobs.length})`}
                >
                  {onDeleteQuoteList && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Delete list ${list.name}`}
                      onClick={e => { e.stopPropagation(); onDeleteQuoteList(list.id); }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onDeleteQuoteList(list.id); } }}
                      onMouseEnter={e => { e.currentTarget.style.color = T.danger; }}
                      onMouseLeave={e => { e.currentTarget.style.color = T.textFaint; }}
                      style={{ color: T.textFaint, display: 'flex', transition: `color ${T.transition}` }}
                    >
                      <Trash2 size={11} />
                    </span>
                  )}
                </TreeRow>
                {isOpen && list.jobs.length === 0 && (
                  <div style={{ padding: '2px 10px 2px 34px', fontSize: T.fsSmall, color: T.textFaint }}>No matching quotes</div>
                )}
                {isOpen && list.jobs.map(job => (
                  <TreeRow key={job.id} depth={2} label={job.id} onClick={() => onOpenJob(job)}>
                    <StatusMark status={job.status} maxWidth={84} />
                  </TreeRow>
                ))}
              </div>
            );
          })}
        </>
      )}

      {/* Purchases parent → saved Purchase Lists (appears once you create one) */}
      {savedPOLists.length > 0 && (
        <>
          <TreeRow
            depth={0}
            bold
            icon={<ShoppingCart size={12} />}
            caret={purchasesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            label="Purchases"
            count={savedPOLists.length}
            onClick={() => setPurchasesOpen(o => !o)}
          />
          {purchasesOpen && savedPOLists.map(list => {
            const isOpen = openLists.has(list.id);
            return (
              <div key={list.id}>
                <TreeRow
                  depth={1}
                  caret={isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  onCaretClick={() => toggleList(list.id)}
                  icon={<ListFilter size={11} />}
                  label={list.name}
                  count={list.pos.length}
                  onClick={() => onRunPOList && onRunPOList(list.id)}
                  title={`Open purchase list "${list.name}" (${list.pos.length})`}
                >
                  {onDeletePOList && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Delete list ${list.name}`}
                      onClick={e => { e.stopPropagation(); onDeletePOList(list.id); }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onDeletePOList(list.id); } }}
                      onMouseEnter={e => { e.currentTarget.style.color = T.danger; }}
                      onMouseLeave={e => { e.currentTarget.style.color = T.textFaint; }}
                      style={{ color: T.textFaint, display: 'flex', transition: `color ${T.transition}` }}
                    >
                      <Trash2 size={11} />
                    </span>
                  )}
                </TreeRow>
                {isOpen && list.pos.length === 0 && (
                  <div style={{ padding: '2px 10px 2px 34px', fontSize: T.fsSmall, color: T.textFaint }}>No matching orders</div>
                )}
                {isOpen && list.pos.map(po => (
                  <TreeRow key={po.id} depth={2} label={po.id} onClick={() => onOpenPO && onOpenPO(po.id)}>
                    <span style={{ color: T.textMuted, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 84 }}>{po.supplier}</span>
                  </TreeRow>
                ))}
              </div>
            );
          })}
        </>
      )}

      {/* Built-in quick lists */}
      <SectionLabel>Quick lists</SectionLabel>
      {SAVED_LISTS.map(list => {
        const count = jobs.filter(j => list.test(j, currentUser)).length;
        return (
          <div
            key={list.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelectList(list.id)}
            onKeyDown={e => { if (e.key === 'Enter') onSelectList(list.id); }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 28,
              padding: '0 10px', borderRadius: T.radiusSm, fontSize: T.fsGrid, cursor: 'pointer', color: T.text,
              transition: `background ${T.transition}`,
            }}
            {...rowHover}
          >
            <span>{list.label}</span>
            <span style={{
              fontSize: 11, fontWeight: 600, color: list.id === 'overdue' && count > 0 ? T.danger : T.textMuted,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {count}
            </span>
          </div>
        );
      })}
    </div>
  );
}
