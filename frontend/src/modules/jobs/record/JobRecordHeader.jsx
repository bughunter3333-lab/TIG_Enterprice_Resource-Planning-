import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronDown, Copy, Edit, Lock, Mail, MoreHorizontal, Printer, ArrowRight, Truck } from 'lucide-react';
import { T } from '../../../ui/tokens';
import Button from '../../../ui/Button';
import StatusBadge from '../../../ui/StatusBadge';
import OverTime from '../OverTime';
import Watchout from '../Watchout';
import JobStepper from './JobStepper';
import { money, dueOf } from './recordFormat';

function MenuButton({ items, label = 'Print', icon: Icon = Printer }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <Button aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon size={14} aria-hidden />{label}<ChevronDown size={13} aria-hidden />
      </Button>
      {open && (
        <div role="menu" style={{
          position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 40, minWidth: 210, padding: 4,
          background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radiusLg, boxShadow: T.shadowPress,
        }}>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); item.onClick(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px',
                border: 'none', background: 'transparent', borderRadius: T.radius - 2, cursor: 'pointer',
                font: 'inherit', fontSize: T.fsGrid, color: T.text, textAlign: 'left',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.hairlineSoft; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              {item.icon ? <item.icon size={14} color={T.textFaint} aria-hidden /> : <Icon size={14} color={T.textFaint} aria-hidden />}{item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Figure({ label, value, tone, note, first }) {
  return (
    <div style={{ padding: '0 20px', borderLeft: first ? 'none' : `1px solid ${T.hairlineSoft}`, minWidth: 0 }}>
      <div style={{ fontSize: T.fsSmall, color: T.textMuted }}>{label}</div>
      <div style={{ marginTop: 2, fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em', color: tone ?? T.text, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {value || <span style={{ color: T.textFaint, fontWeight: 400 }}>—</span>}
      </div>
      {note && <div style={{ fontSize: 11, color: tone ?? T.textFaint, marginTop: 1 }}>{note}</div>}
    </div>
  );
}

/**
 * The top of a job's record: which job, whose, where it stands, the money that
 * matters, and the one thing to do next. Every other action is a quiet button
 * beside it; the next step is the only blue one (similarity: one colour means
 * "do this").
 */
export default function JobRecordHeader({
  job, onBack, onEdit, editDisabled, editTitle, onClone, onEmail, printItems, moreActions = [], nextStep, onNextStep, nextStepBusy,
}) {
  const due = dueOf(job);
  const paid = Math.max(0, (Number(job.total) || 0) - (Number(job.balanceDue) || 0));
  const NextIcon = nextStep?.kind === 'despatch' ? Truck : ArrowRight;
  return (
    <section style={{
      background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radiusLg, boxShadow: T.shadowSm,
      fontFamily: T.font, padding: '14px 20px 16px', display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: T.fsGrid, minWidth: 0 }}>
          <button type="button" onClick={onBack} style={{
            display: 'inline-flex', alignItems: 'center', gap: 2, border: 'none', background: 'transparent', padding: '2px 4px 2px 0',
            font: 'inherit', color: T.textMuted, cursor: 'pointer', borderRadius: T.radiusSm,
          }}>
            <ChevronLeft size={15} aria-hidden />Jobs
          </button>
          <span aria-hidden style={{ color: T.fieldBorder }}>/</span>
          <span style={{ fontFamily: T.fontMono, color: T.text }}>{job.id}</span>
        </nav>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Button onClick={onEdit} disabled={editDisabled} title={editTitle || undefined}><Edit size={14} aria-hidden />Edit</Button>
          <Button onClick={onClone}><Copy size={14} aria-hidden />Clone</Button>
          <MenuButton items={printItems} />
          <Button onClick={onEmail}><Mail size={14} aria-hidden />Email</Button>
          {moreActions.length > 0 && <MenuButton label="More" icon={MoreHorizontal} items={moreActions} />}
          {nextStep && (
            <Button variant="primary" onClick={onNextStep} disabled={nextStepBusy} style={{ marginLeft: 4 }}>
              {nextStep.label}<NextIcon size={14} aria-hidden />
            </Button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: T.fsTitle + 2, fontWeight: 600, letterSpacing: '-0.02em', color: T.text }}>{job.customer || 'No customer'}</h1>
        <StatusBadge status={job.status} />
        <OverTime job={job} long />
        {job.priority === 'Urgent' && (
          <span style={{ fontSize: 11, fontWeight: 600, color: T.danger, background: T.dangerTint, padding: '3px 7px', borderRadius: T.radiusSm }}>Urgent</span>
        )}
        {job.locked && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: T.accentStrong, background: T.accentTint, padding: '3px 7px', borderRadius: T.radiusSm }}>
            <Lock size={11} aria-hidden />Locked
          </span>
        )}
      </div>
      {job.description && <p style={{ margin: '-8px 0 0', fontSize: T.fsGrid, color: T.textMuted }}>{job.description}</p>}

      <Watchout text={job.customerWatchout} style={{ marginTop: 10 }} />
      <JobStepper status={job.status} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', borderTop: `1px solid ${T.hairlineSoft}`, paddingTop: 12, marginLeft: -20, marginRight: -20 }}>
        <Figure first label="Total (inc GST)" value={money(job.totalInc || job.total)} />
        <Figure label="Paid" value={money(paid)} tone={paid > 0 ? T.ok : undefined} />
        <Figure label="Balance" value={money(job.balanceDue)} tone={job.balanceDue > 0 ? T.danger : T.ok} />
        <Figure label="Due" value={due.text} tone={due.overdue ? T.danger : undefined} note={due.overdue ? 'Overdue' : undefined} />
        <Figure label="Assigned" value={job.assignedTo} />
        <Figure label="Cust ref" value={job.custRef} />
      </div>
    </section>
  );
}
