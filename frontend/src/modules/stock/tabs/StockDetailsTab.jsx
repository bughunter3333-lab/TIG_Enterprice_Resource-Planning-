import { T } from '../../../ui/tokens';
import KpiTile from '../../../ui/KpiTile';
import { availableQty } from '../stockFormat';

function Field({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '3px 0', borderBottom: `1px solid ${T.hairlineSoft}`, fontSize: T.fsGrid }}>
      <span style={{ color: T.textMuted, width: 110, flexShrink: 0 }}>{label}</span>
      <span style={{ color: T.text }}>{value || <span style={{ color: T.textFaint }}>—</span>}</span>
    </div>
  );
}

export default function StockDetailsTab({ item }) {
  if (!item) return null;
  const onHand = Number(item.stock) || 0;
  const committed = Number(item.committed_qty) || 0;
  const onPo = Number(item.on_order_qty) || 0;
  return (
    <div style={{ fontFamily: T.font }}>
      <div style={{ display: 'flex', gap: 0, marginBottom: 12, border: `1px solid ${T.hairline}`, borderRadius: T.radius, overflow: 'hidden' }}>
        <KpiTile label="ON HAND" value={onHand} />
        <KpiTile label="COMMITTED" value={committed} />
        <KpiTile label="AVAILABLE" value={availableQty(item)} tone="ok" />
        <KpiTile label="ON PO" value={onPo} tone="accent" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
        <div>
          <Field label="Code" value={item.sku} />
          <Field label="Description" value={item.name} />
          <Field label="Type" value={item.item_type} />
          <Field label="GL Group" value={item.gl_group} />
          <Field label="Barcode" value={item.barcode} />
        </div>
        <div>
          <Field label="Category" value={item.category} />
          <Field label="Supplier" value={item.supplier} />
          <Field label="Buy Unit" value={item.buy_unit} />
          <Field label="Sell Unit" value={item.sell_unit} />
          <Field label="Reorder Level" value={item.reorderLevel} />
        </div>
      </div>
    </div>
  );
}
