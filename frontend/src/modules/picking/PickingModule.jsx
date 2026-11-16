import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Minus, Plus } from 'lucide-react';
import { inventory as inventoryApi, jobs as jobsApi } from '../../api';
import { notify } from '../../lib/notify';
import { useOffer } from '../../lib/useMyAccess';
import Button from '../../ui/Button';
import StatusBadge from '../../ui/StatusBadge';
import { T } from '../../ui/tokens';
import { pickableLines, pickMoveFor, pickTarget, linePickedInFull } from '../jobs/jobPicking';
import { statusLabel } from '../jobs/jobStatuses';
import CameraScanner, { cameraScanAvailable } from './CameraScanner';
import { bySku, jobNumber, lineForScan, walkOrder } from './pickScan';

const TOUCH = 48;
const field = {
  width: '100%', boxSizing: 'border-box', height: TOUCH, padding: '0 12px', fontFamily: T.font, fontSize: 16,
  border: `1px solid ${T.hairline}`, borderRadius: T.radiusField, background: T.panel, color: T.text,
};

/**
 * Picking on a phone at the shelf (docs/superpowers/specs/2026-11-09-phone-picking.md).
 * Scan or type the job number from its label; the lines come in the order the
 * shelves are walked; each scan of a garment — its stock code or its barcode —
 * counts one picked, or tap + and −. A hardware scanner types into the scan
 * field like a keyboard; on a phone the camera reads the code instead. Save
 * the picks, then mark the job Picked or Inco/Pick.
 */
export default function PickingModule() {
  const queryClient = useQueryClient();
  const offer = useOffer();
  const canPick = offer('POST', '/jobs/{job_id}/pick');
  const [job, setJob] = useState(null);
  const [draft, setDraft] = useState({});
  const [scan, setScan] = useState('');
  const [said, setSaid] = useState(null); // { ok, text } — the last scan's answer
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const scanField = useRef(null);
  const { data: stockList } = useQuery({ queryKey: ['inventory'], queryFn: () => inventoryApi.list() });
  const stock = useMemo(() => bySku(stockList), [stockList]);

  const lines = useMemo(() => (job ? walkOrder(pickableLines(job), stock) : []), [job, stock]);

  // A hardware scanner types like a keyboard into whatever has focus. After a
  // tap on + or −, or a save, that is a button or nothing — and the scan's
  // Enter pressed the button again. Typing outside a field goes to the scan
  // field instead; the field is not focused after each tap, which on a phone
  // would bring the keyboard up every time.
  useEffect(() => {
    const toScanField = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
      scanField.current?.focus();
    };
    document.addEventListener('keydown', toScanField, true);
    return () => document.removeEventListener('keydown', toScanField, true);
  }, []);
  const pickedOf = useCallback((line) => (draft[line.id] !== undefined ? draft[line.id] : (line.qtyPick || 0)), [draft]);
  const setPicked = (line, qty) => setDraft((d) => ({ ...d, [line.id]: Math.max(0, Math.min(pickTarget(line), qty)) }));
  const dirty = lines.some((l) => draft[l.id] !== undefined && draft[l.id] !== (l.qtyPick || 0));
  const allIn = lines.length > 0 && lines.every((l) => linePickedInFull(l, pickedOf(l)));
  const move = job ? pickMoveFor(job.status, lines, pickedOf) : null;

  const answer = (ok, text) => {
    setSaid({ ok, text });
    if (!ok) navigator.vibrate?.([80, 60, 80]);
  };

  const openJob = async (text) => {
    const id = jobNumber(text);
    if (!id) return;
    try {
      const found = await jobsApi.get(id);
      setJob(found);
      setDraft({});
      answer(true, `Job ${found.id} — ${found.customer || 'no customer'}`);
    } catch (e) {
      answer(false, e.status === 404 ? `No job ${id}.` : e.message);
    }
  };

  const onCode = useCallback((code) => {
    if (!job) { openJob(code); return; }
    const line = lineForScan(lines, code, stock, pickedOf);
    if (!line) { answer(false, `${code} is not on job ${job.id}.`); return; }
    const now = pickedOf(line);
    if (now >= pickTarget(line)) { answer(false, `${line.stockCode} is picked in full already.`); return; }
    setPicked(line, now + 1);
    answer(true, `${line.stockCode} — ${now + 1} of ${pickTarget(line)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, lines, stock, pickedOf]);

  const submitScan = (e) => {
    e.preventDefault();
    const code = scan.trim();
    setScan('');
    if (code) onCode(code);
    scanField.current?.focus();
  };

  const save = async (thenMove) => {
    setBusy(true);
    let saved = null;
    try {
      const picks = lines.map((l) => ({ item_id: l.id, qty_pick: pickedOf(l) }));
      ({ job: saved } = await jobsApi.pick(job.id, picks));
      setJob(saved);
      setDraft({});
      if (thenMove) {
        // The status answer carries the job without its lines: keep the
        // lines the picks came back with.
        const moved = await jobsApi.updateStatus(job.id, thenMove);
        setJob({ ...saved, ...moved, items: saved.items });
      }
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      notify(thenMove ? `Job ${job.id} is ${statusLabel(thenMove)}.` : 'Picks saved.', { type: 'success' });
    } catch (e) {
      notify(saved && thenMove ? `Picks saved; could not mark it ${statusLabel(thenMove)}: ${e.message}` : e.message, { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', display: 'grid', gap: 12 }}>
      <form onSubmit={submitScan} style={{ display: 'flex', gap: 8 }}>
        <label htmlFor="pick-scan" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          {job ? 'Scan or type a stock code' : 'Scan or type a job number'}
        </label>
        <input
          id="pick-scan"
          ref={scanField}
          autoFocus
          autoComplete="off"
          inputMode={job ? 'text' : 'numeric'}
          value={scan}
          onChange={(e) => setScan(e.target.value)}
          placeholder={job ? 'Scan a garment, or type its code' : 'Scan the job label, or type its number'}
          style={field}
        />
        {cameraScanAvailable() && (
          <Button aria-label="Scan with the camera" onClick={() => setCamera((c) => !c)} style={{ height: TOUCH, width: TOUCH, padding: 0 }}>
            <Camera size={20} aria-hidden />
          </Button>
        )}
      </form>
      {camera && <CameraScanner onCode={onCode} onClose={() => setCamera(false)} />}
      {said && (
        <p role="status" style={{ margin: 0, fontSize: T.fsBase, fontWeight: 600, color: said.ok ? T.ok : T.danger }}>{said.text}</p>
      )}

      {job && (
        <section aria-label={`Picking job ${job.id}`} style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: T.fsSection, fontFamily: T.fontMono }}>{job.id}</h2>
            <StatusBadge status={job.status} />
            <span style={{ flex: 1, minWidth: 0, color: T.textMuted, fontSize: T.fsBase, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.customer}</span>
            <Button variant="ghost" onClick={() => { setJob(null); setDraft({}); setSaid(null); scanField.current?.focus(); }}>Another job</Button>
          </div>
          {lines.length === 0 && <p style={{ margin: 0, color: T.textMuted }}>Nothing on this job is picked off a shelf.</p>}
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {lines.map((line) => {
              const picked = pickedOf(line);
              const target = pickTarget(line);
              const full = linePickedInFull(line, picked);
              const bin = stock.get(String(line.stockCode ?? '').toUpperCase())?.location;
              return (
                <li key={line.id} style={{ border: `1px solid ${full ? T.ok : T.hairline}`, background: full ? T.okTint : T.panel, borderRadius: T.radius, padding: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: T.fsBase }}>{line.stockCode}</div>
                    <div style={{ fontSize: T.fsSmall, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line.description}</div>
                    <div style={{ fontSize: T.fsSmall, color: T.textMuted }}>
                      {bin ? <>Bin <strong style={{ color: T.text }}>{bin}</strong></> : 'No bin'}
                      {line.bOrd > 0 && <span style={{ color: T.warn }}> · {line.bOrd} on back-order</span>}
                    </div>
                  </div>
                  {canPick && <Button aria-label={`One less ${line.stockCode}`} onClick={() => setPicked(line, picked - 1)} style={{ height: TOUCH, width: TOUCH, padding: 0 }}><Minus size={18} aria-hidden /></Button>}
                  <span aria-label={`${picked} of ${target} picked`} style={{ minWidth: 56, textAlign: 'center', fontSize: 18, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{picked}/{target}</span>
                  {canPick && <Button aria-label={`One more ${line.stockCode}`} onClick={() => setPicked(line, picked + 1)} style={{ height: TOUCH, width: TOUCH, padding: 0 }}><Plus size={18} aria-hidden /></Button>}
                </li>
              );
            })}
          </ol>
          {canPick && lines.length > 0 && (
            <div style={{ display: 'grid', gap: 8 }}>
              {move && (
                <Button variant="primary" disabled={busy} onClick={() => save(move)} style={{ height: TOUCH }}>
                  {move === 'Picked' ? 'Save and mark picked' : 'Save and mark Inco/Pick'}
                </Button>
              )}
              <Button disabled={busy || !dirty} onClick={() => save(null)} style={{ height: TOUCH }}>Save picks</Button>
              {!move && allIn && <p style={{ margin: 0, fontSize: T.fsSmall, color: T.textMuted }}>All picked. The job is {statusLabel(job.status)}.</p>}
            </div>
          )}
          {!canPick && <p style={{ margin: 0, fontSize: T.fsSmall, color: T.textMuted }}>Your role views picks; recording them is for staff.</p>}
        </section>
      )}
    </div>
  );
}
