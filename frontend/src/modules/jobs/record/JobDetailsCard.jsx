import { T } from '../../../ui/tokens';
import Card from '../../../ui/Card';
import { dueOf } from './recordFormat';
import { formatDay } from '../../../lib/dates';

function Item({ label, value, mono, tone }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '112px minmax(0, 1fr)', gap: 12, padding: '6px 0', borderBottom: `1px solid ${T.hairlineSoft}` }}>
      <dt style={{ fontSize: T.fsSmall, color: T.textMuted }}>{label}</dt>
      <dd style={{
        margin: 0, fontSize: T.fsGrid, color: value ? (tone ?? T.text) : T.textFaint,
        fontFamily: mono && value ? T.fontMono : undefined, overflowWrap: 'anywhere',
      }}>
        {value || '—'}
      </dd>
    </div>
  );
}

function Column({ title, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: T.fsSmall, fontWeight: 600, color: T.text }}>{title}</h3>
      <dl style={{ margin: 0 }}>{children}</dl>
    </div>
  );
}

/**
 * The job's own facts in two groups — the order, and where it goes — each
 * shown once. The customer's contact details are in the customer card beside
 * it and the money in the money card, so neither is repeated here.
 */
export default function JobDetailsCard({ job }) {
  const due = dueOf(job);
  return (
    <Card title="Details">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 28 }}>
        {/* The fields every job has always show (a dash says "not set"); the
            ones most jobs leave empty appear only when set, so the card is not
            a wall of dashes. */}
        <Column title="Order">
          <Item label="Cust ref" value={job.custRef} />
          <Item label="Invoice #" value={job.invoice} mono />
          <Item label="Date in" value={formatDay(job.dateIn) || job.dateIn} />
          <Item label="Due" value={due.text} tone={due.overdue ? T.danger : undefined} />
          {job.out && <Item label="Out" value={formatDay(job.out) || job.out} />}
          {job.commitmentDate && <Item label="Commitment" value={formatDay(job.commitmentDate) || job.commitmentDate} />}
          {job.validityDate && <Item label="Valid until" value={formatDay(job.validityDate) || job.validityDate} />}
          <Item label="Type" value={job.type} />
          <Item label="Priority" value={job.priority} tone={['High', 'Urgent'].includes(job.priority) ? T.danger : undefined} />
          <Item label="Payment" value={job.paymentMethod} />
          {job.projectNo && <Item label="Project #" value={job.projectNo} />}
          {job.serialNo && <Item label="Serial #" value={job.serialNo} mono />}
          {job.quote && <Item label="Quote ref" value={job.quote} mono />}
          {job.poNumber && <Item label="Customer PO" value={job.poNumber} mono />}
        </Column>
        <Column title="Delivery">
          <Item label="Ship #" value={job.shipTo} mono />
          <Item label="Attention" value={job.nameContact} />
          <Item label="Address" value={job.shippingAddress} />
          {job.ourRef && <Item label="Our ref" value={job.ourRef} />}
          <Item label="Branch" value={job.branch} />
          <Item label="Weight" value={job.weightTotal ? `${Number(job.weightTotal).toFixed(2)} kg` : ''} />
          {job.shipVia && <Item label="Ship via" value={job.shipVia} />}
          {job.connote && <Item label="Connote" value={job.connote} mono />}
          {job.proofStatus && job.proofStatus !== 'none' && <Item label="Proof" value={job.proofStatus} />}
        </Column>
      </div>
    </Card>
  );
}
