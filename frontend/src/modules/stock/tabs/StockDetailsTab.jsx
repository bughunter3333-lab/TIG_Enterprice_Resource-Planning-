import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { T } from '../../../ui/tokens';
import KpiTile from '../../../ui/KpiTile';
import UiField from '../../../ui/Field';
import Button from '../../../ui/Button';
import { inventory } from '../../../api';
import { useOffer } from '../../../lib/useMyAccess';
import { notify } from '../../../lib/notify';
import { availableQty } from '../stockFormat';

// An order is weighed from its lines' stock items, so the weight belongs on the
// item's own page. It could be set only from New stock item or a saved list's
// Edit, and the Stock module did not show it at all (F08).
function WeightEditor({ item }) {
  const qc = useQueryClient();
  const saved = String(item.weight_kg ?? 0);
  const [draft, setDraft] = useState(saved);
  const [problem, setProblem] = useState('');
  useEffect(() => { setDraft(saved); setProblem(''); }, [item.sku, saved]);
  const save = useMutation({
    mutationFn: (kg) => inventory.update(item.sku, { weight_kg: kg }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      notify(`${item.sku}: weight saved`, { type: 'success' });
    },
    onError: (e) => notify(e.message, { type: 'error' }),
  });
  const submit = (e) => {
    e.preventDefault();
    const kg = Number(draft);
    if (draft.trim() === '' || !(kg >= 0)) { setProblem('A weight of 0 kg or more.'); return; }
    setProblem('');
    save.mutate(kg);
  };
  return (
    <form onSubmit={submit} style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 12 }}>
      <UiField label="Weight per unit (kg)" inputMode="decimal" value={draft} error={problem}
        onChange={(e) => setDraft(e.target.value)} style={{ width: 180 }} />
      <Button type="submit" size="sm" disabled={draft === saved || save.isPending}>
        {save.isPending ? 'Saving…' : 'Save weight'}
      </Button>
    </form>
  );
}

function Field({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '3px 0', borderBottom: `1px solid ${T.hairlineSoft}`, fontSize: T.fsGrid }}>
      <span style={{ color: T.textMuted, width: 110, flexShrink: 0 }}>{label}</span>
      <span style={{ color: T.text }}>{value || <span style={{ color: T.textFaint }}>—</span>}</span>
    </div>
  );
}

export default function StockDetailsTab({ item }) {
  const offer = useOffer();
  if (!item) return null;
  const canEdit = offer('PATCH', '/inventory/{sku}');
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
          {!canEdit && <Field label="Weight / unit" value={`${Number(item.weight_kg) || 0} kg`} />}
        </div>
      </div>
      {canEdit && <WeightEditor item={item} />}
    </div>
  );
}
