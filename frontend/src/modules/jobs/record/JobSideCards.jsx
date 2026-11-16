import { ArrowRight, CreditCard, Mail, MapPin, Phone } from 'lucide-react';
import { T } from '../../../ui/tokens';
import Card from '../../../ui/Card';
import Button from '../../../ui/Button';
import { money } from './recordFormat';

const linkButton = {
  display: 'inline-flex', alignItems: 'center', gap: 3, border: 'none', background: 'transparent', padding: 0,
  font: 'inherit', fontSize: T.fsSmall, fontWeight: 500, color: T.accent, cursor: 'pointer',
};

function Line({ icon: Icon, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: T.fsGrid, color: T.text, lineHeight: 1.45 }}>
      <Icon size={14} color={T.textFaint} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{children}</span>
    </div>
  );
}

/** Who the job is for, once — contact, where it goes, their terms. */
export function JobCustomerCard({ job, customer = {}, openJobCount = 0, onViewCustomer, onShowCustomerJobs }) {
  return (
    <Card
      title="Customer"
      actions={customer.id && onViewCustomer && (
        <button type="button" onClick={onViewCustomer} style={linkButton}>View<ArrowRight size={12} aria-hidden /></button>
      )}
      footer={onShowCustomerJobs && (
        <button type="button" onClick={onShowCustomerJobs} style={{ ...linkButton, color: T.text, justifyContent: 'space-between', width: '100%' }}>
          <span>Open jobs for this customer</span>
          <span style={{
            minWidth: 20, height: 20, padding: '0 6px', borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: openJobCount > 0 ? T.accentTint : T.hairlineSoft, color: openJobCount > 0 ? T.accentStrong : T.textMuted,
            fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
          }}>{openJobCount}</span>
        </button>
      )}
    >
      <div style={{ fontSize: T.fsBase, fontWeight: 600, color: T.text }}>{job.customer}</div>
      {customer.contact && <div style={{ fontSize: T.fsGrid, color: T.textMuted, marginTop: 1 }}>{customer.contact}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
        {customer.phone && <Line icon={Phone}>{customer.phone}</Line>}
        {customer.mobile && customer.mobile !== customer.phone && <Line icon={Phone}>{customer.mobile}</Line>}
        {customer.email && <Line icon={Mail}>{customer.email}</Line>}
        {(job.shippingAddress || customer.address) && <Line icon={MapPin}>{job.shippingAddress || customer.address}</Line>}
      </div>
      {customer.paymentTerms && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.hairlineSoft}`, fontSize: T.fsSmall, color: T.textMuted }}>
          Terms <span style={{ color: T.text, fontWeight: 500, marginLeft: 4 }}>{customer.paymentTerms}</span>
        </div>
      )}
    </Card>
  );
}

const STATE_CHIP = {
  paid: { bg: T.okTint, fg: T.ok }, partial: { bg: T.warnTint, fg: T.warn }, unpaid: { bg: T.dangerTint, fg: T.danger },
  invoiced: { bg: T.accentTint, fg: T.accentStrong }, to_invoice: { bg: T.accentTint, fg: T.accentStrong }, not_invoiced: { bg: T.hairlineSoft, fg: T.textMuted },
};

function Chip({ value }) {
  const c = STATE_CHIP[value] ?? STATE_CHIP.not_invoiced;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 7px', borderRadius: T.radiusSm, background: c.bg, color: c.fg, textTransform: 'capitalize' }}>
      {String(value).replace(/_/g, ' ')}
    </span>
  );
}

function Row({ label, value, strong, tone }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: strong ? '7px 0 3px' : '3px 0', borderTop: strong ? `1px solid ${T.hairlineSoft}` : 'none', marginTop: strong ? 4 : 0 }}>
      <span style={{ fontSize: strong ? T.fsGrid : T.fsSmall, fontWeight: strong ? 600 : 400, color: strong ? T.text : T.textMuted }}>{label}</span>
      <span style={{ fontSize: strong ? T.fsBase : T.fsGrid, fontWeight: strong ? 600 : 500, color: tone ?? T.text, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

/** The job's money, once: what it comes to, what is paid, what is credited, what is owed. */
export function JobMoneyCard({ job, onRecordPayment }) {
  const total = Number(job.totalInc || job.total) || 0;
  const balance = Number(job.balanceDue) || 0;
  // Credit notes applied settle the invoice but are not money received.
  const credited = Number(job.credited) || 0;
  const paid = Math.max(0, total - balance - credited);
  const pct = total > 0 ? Math.max(0, Math.min(100, ((paid + credited) / total) * 100)) : 0;
  return (
    <Card
      title="Money"
      actions={<span style={{ display: 'flex', gap: 4 }}><Chip value={job.invoiceStatus || 'not_invoiced'} /><Chip value={job.paymentStatus || 'unpaid'} /></span>}
    >
      <Row label="Subtotal" value={money(job.subtotal)} />
      <Row label="GST" value={money(job.tax)} />
      <Row label="Total (inc GST)" value={money(total)} strong />
      <Row label="Paid" value={money(paid)} tone={paid > 0 ? T.ok : T.textMuted} />
      {credited > 0 && <Row label="Credited" value={money(credited)} tone={T.ok} />}
      <Row label="Balance" value={money(balance)} tone={balance > 0 ? T.danger : T.ok} />
      {total > 0 && (
        <div style={{ marginTop: 8 }}>
          <div role="progressbar" aria-label="Paid" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}
            style={{ height: 6, borderRadius: 3, background: T.hairlineSoft, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: T.ok, borderRadius: 3, transition: `width ${T.spring}` }} />
          </div>
          <div style={{ fontSize: 11, color: T.textFaint, textAlign: 'right', marginTop: 3 }}>{pct.toFixed(0)}% {credited > 0 ? 'settled' : 'paid'}</div>
        </div>
      )}
      {balance > 0 && onRecordPayment && (
        <Button onClick={onRecordPayment} style={{ width: '100%', marginTop: 10 }}>
          <CreditCard size={14} aria-hidden />Record payment
        </Button>
      )}
    </Card>
  );
}
