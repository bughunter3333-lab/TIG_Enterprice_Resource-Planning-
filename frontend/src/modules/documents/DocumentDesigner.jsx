import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Printer, RotateCcw, Save, Trash2 } from 'lucide-react';
import * as api from '../../api';
import { notify } from '../../lib/notify';
import {
  BAND_LABELS, BLOCK_TYPES, DOC_TYPES, JOB_FIELDS, LINE_COLUMNS,
  PAPER, PARTY_SOURCES, TOTAL_FIELDS, bandsOf, blockId, defaultTemplate,
} from '../../lib/documentTemplates';
import TemplateRenderer from '../../components/documents/TemplateRenderer';
import { T } from '../../ui/tokens';
import { printDocument } from './printDocument';

/**
 * Design the printed documents.
 *
 * A document is bands, a band is blocks, and the preview on the right is the
 * same component that prints — so there is no "close enough" step between what
 * is designed here and what comes out of the printer.
 *
 * Deliberately not a drag-and-drop canvas. These documents carry a variable
 * number of lines, and anything positioned by coordinate is correct for a job
 * with three items and wrong for one with forty.
 */

const label = { fontSize: 10, textTransform: 'uppercase', letterSpacing: '.12em', color: T.textMuted, display: 'block', marginBottom: 3 };
const input = { width: '100%', height: T.inputHeight, border: `1px solid ${T.hairline}`, borderRadius: T.radius, padding: '0 7px', fontSize: T.fsGrid, fontFamily: T.font, background: T.panel, color: T.text };
const chip = (on) => ({
  fontSize: 11, padding: '3px 8px', borderRadius: T.radius, cursor: 'pointer',
  border: `1px solid ${on ? T.accentStrong : T.hairline}`,
  background: on ? T.accentTint : T.panel,
  color: on ? T.accentStrong : T.textMuted,
  transition: `background ${T.transition}, border-color ${T.transition}`,
});

/** A multi-select of keys, ordered by the user's clicks rather than by the catalogue. */
function KeyPicker({ options, value = [], onChange }) {
  const toggle = (k) => onChange(value.includes(k) ? value.filter(v => v !== k) : [...value, k]);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {options.map(o => (
        <button key={o.key} type="button" style={chip(value.includes(o.key))} onClick={() => toggle(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function BlockSettings({ block, onChange }) {
  const set = (patch) => onChange({ ...block, ...patch });

  switch (block.type) {
    case 'docTitle':
      return (
        <>
          <label style={label} htmlFor="dd-title">Title</label>
          <input id="dd-title" style={input} value={block.text || ''} onChange={e => set({ text: e.target.value })} />
          <label style={{ ...label, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>
            <input type="checkbox" checked={!!block.showJobNumber} onChange={e => set({ showJobNumber: e.target.checked })} />
            Show the job number
          </label>
        </>
      );

    case 'partyBlock':
      return (
        <>
          <label style={label} htmlFor="dd-party">Whose address</label>
          <select id="dd-party" style={input} value={block.source || 'customer'} onChange={e => set({ source: e.target.value })}>
            {PARTY_SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <label style={{ ...label, marginTop: 8 }} htmlFor="dd-party-h">Heading</label>
          <input id="dd-party-h" style={input} value={block.heading || ''} onChange={e => set({ heading: e.target.value })} />
          <label style={{ ...label, marginTop: 8 }} htmlFor="dd-party-size">Size</label>
          <select id="dd-party-size" style={input} value={block.size || 'normal'} onChange={e => set({ size: e.target.value })}>
            <option value="small">Small</option><option value="normal">Normal</option><option value="large">Large</option>
          </select>
        </>
      );

    case 'fieldGrid':
      return (
        <>
          <label style={label} htmlFor="dd-cols">Columns across</label>
          <select id="dd-cols" style={input} value={block.columns || 3} onChange={e => set({ columns: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <label style={{ ...label, marginTop: 10 }}>Fields — click to add, click again to remove</label>
          <KeyPicker options={JOB_FIELDS} value={block.fields} onChange={fields => set({ fields })} />
        </>
      );

    case 'lineTable':
      return (
        <>
          <label style={label}>Columns, in print order</label>
          <KeyPicker options={LINE_COLUMNS} value={block.columns} onChange={columns => set({ columns })} />
          <label style={{ ...label, marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>
            <input type="checkbox" checked={!!block.zebra} onChange={e => set({ zebra: e.target.checked })} />
            Shade alternate rows
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.textMuted }}>
            <input type="checkbox" checked={!!block.showSections} onChange={e => set({ showSections: e.target.checked })} />
            Show section headings
          </label>
        </>
      );

    case 'totals':
      return (
        <>
          <label style={label}>Which totals</label>
          <KeyPicker options={TOTAL_FIELDS} value={block.fields} onChange={fields => set({ fields })} />
          <label style={{ ...label, marginTop: 10 }} htmlFor="dd-t-align">Align</label>
          <select id="dd-t-align" style={input} value={block.align || 'left'} onChange={e => set({ align: e.target.value })}>
            <option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option>
          </select>
        </>
      );

    case 'barcode':
      return (
        <>
          <label style={label} htmlFor="dd-bc">Encode</label>
          <select id="dd-bc" style={input} value={block.source || 'id'} onChange={e => set({ source: e.target.value })}>
            <option value="id">Job number</option>
            <option value="custRef">Customer reference</option>
            <option value="invoice">Invoice number</option>
          </select>
          <label style={{ ...label, marginTop: 8 }} htmlFor="dd-bc-h">Height (mm)</label>
          <input id="dd-bc-h" type="number" style={input} value={block.height ?? 14} onChange={e => set({ height: Number(e.target.value) })} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.textMuted, marginTop: 8 }}>
            <input type="checkbox" checked={!!block.caption} onChange={e => set({ caption: e.target.checked })} />
            Print the number underneath
          </label>
        </>
      );

    case 'freeText':
      return (
        <>
          <label style={label} htmlFor="dd-text">Text — {'{id}'}, {'{customer}'} and any other job field resolve</label>
          <textarea id="dd-text" style={{ ...input, height: 70, padding: 7 }} value={block.text || ''} onChange={e => set({ text: e.target.value })} />
          <label style={{ ...label, marginTop: 8 }} htmlFor="dd-text-size">Size</label>
          <select id="dd-text-size" style={input} value={block.size || 'normal'} onChange={e => set({ size: e.target.value })}>
            <option value="small">Small</option><option value="normal">Normal</option><option value="large">Large</option>
          </select>
        </>
      );

    case 'signature':
      return (
        <>
          <label style={label} htmlFor="dd-sig">One line per signature, separated by commas</label>
          <input
            id="dd-sig" style={input}
            value={(block.lines || []).join(', ')}
            onChange={e => set({ lines: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
          />
        </>
      );

    case 'spacer':
      return (
        <>
          <label style={label} htmlFor="dd-space">Height (mm)</label>
          <input id="dd-space" type="number" style={input} value={block.size ?? 4} onChange={e => set({ size: Number(e.target.value) })} />
        </>
      );

    case 'logo':
      return (
        <>
          <label style={label} htmlFor="dd-logo-h">Height (mm)</label>
          <input id="dd-logo-h" type="number" style={input} value={block.height ?? 12} onChange={e => set({ height: Number(e.target.value) })} />
          <label style={{ ...label, marginTop: 8 }} htmlFor="dd-logo-a">Align</label>
          <select id="dd-logo-a" style={input} value={block.align || 'left'} onChange={e => set({ align: e.target.value })}>
            <option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option>
          </select>
        </>
      );

    default:
      return <p style={{ fontSize: 12, color: T.textMuted, margin: 0 }}>Nothing to configure.</p>;
  }
}

export default function DocumentDesigner() {
  const [docType, setDocType] = useState('jobSheet');
  const [template, setTemplate] = useState(() => defaultTemplate('jobSheet'));
  const [selected, setSelected] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState(null);

  // No default value in the destructure. `= {}` builds a fresh object on every
  // render, the effect below depends on it, and the two spin: effect sets
  // state, state re-renders, render makes a new {}, effect runs again. Left
  // undefined it is the query cache's own reference, which is stable.
  const { data: saved } = useQuery({
    queryKey: ['documentTemplates'],
    queryFn: api.documentTemplates.list,
  });

  const { data: jobs = [] } = useQuery({ queryKey: ['jobs'], queryFn: api.jobs.list });
  const { data: company } = useQuery({ queryKey: ['settings/company'], queryFn: api.settings.getCompany });
  // The bin column resolves against stock, so the preview needs it or a
  // picking list previews every line as out of stock.
  const { data: inventory = [] } = useQuery({ queryKey: ['inventory'], queryFn: api.inventory.list });

  // The preview runs against a real job so the layout is judged on real data —
  // a template that looks right against three tidy lines is not a template.
  const previewJob = useMemo(
    () => jobs.find(j => (j.items || []).length > 2) || jobs[0] || null,
    [jobs],
  );

  useEffect(() => {
    const spec = saved?.[docType];
    setTemplate(spec ? structuredClone(spec) : defaultTemplate(docType));
    setSelected(null);
    setDirty(false);
  }, [docType, saved]);

  const bands = bandsOf(template);

  const mutate = (fn) => {
    setTemplate(prev => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setDirty(true);
  };

  const move = (band, idx, dir) => mutate(t => {
    const arr = t.bands[band];
    const to = idx + dir;
    if (to < 0 || to >= arr.length) return;
    [arr[idx], arr[to]] = [arr[to], arr[idx]];
  });

  const remove = (band, idx) => mutate(t => { t.bands[band].splice(idx, 1); });

  const add = (band, type) => {
    const b = { id: blockId(), type };
    if (type === 'fieldGrid') Object.assign(b, { columns: 3, fields: ['customer', 'due'] });
    if (type === 'lineTable') Object.assign(b, { columns: ['stockCode', 'description', 'order'], zebra: true, showSections: true });
    if (type === 'totals') Object.assign(b, { fields: ['lineCount', 'totalQty'], align: 'right' });
    if (type === 'freeText') Object.assign(b, { text: 'Text', size: 'normal' });
    if (type === 'signature') Object.assign(b, { lines: ['Signature', 'Date'] });
    if (type === 'partyBlock') Object.assign(b, { source: 'customer', heading: 'To' });
    if (type === 'barcode') Object.assign(b, { source: 'id', caption: true, height: 14 });
    if (type === 'docTitle') Object.assign(b, { text: DOC_TYPES[docType].label.toUpperCase(), showJobNumber: true });
    mutate(t => { t.bands[band].push(b); });
    setAdding(null);
    setSelected({ band, id: b.id });
  };

  const save = async () => {
    try {
      await api.documentTemplates.save(docType, template);
      setDirty(false);
      notify(`${DOC_TYPES[docType].label} template saved`, { type: 'success' });
    } catch (e) {
      notify(`Could not save the template: ${e.message}`, { type: 'error' });
    }
  };

  const reset = () => {
    setTemplate(defaultTemplate(docType));
    setSelected(null);
    setDirty(true);
  };

  const selectedBlock = selected
    ? (template.bands[selected.band] || []).find(b => b.id === selected.id)
    : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 300px', gap: 12, height: '100%', minHeight: 0, padding: 12 }}>
      {/* ── Structure ─────────────────────────────────────────────────── */}
      <div style={{ background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radiusLg, padding: 10, overflowY: 'auto' }}>
        <label style={label} htmlFor="dd-doctype">Document</label>
        <select id="dd-doctype" style={input} value={docType} onChange={e => setDocType(e.target.value)}>
          {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>

        <label style={{ ...label, marginTop: 10 }} htmlFor="dd-paper">Paper</label>
        <select id="dd-paper" style={input} value={template.paper} onChange={e => mutate(t => { t.paper = e.target.value; })}>
          {Object.entries(PAPER).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>

        {bands.map(band => (
          <div key={band} style={{ marginTop: 14 }}>
            <div style={{ ...label, marginBottom: 5 }}>{BAND_LABELS[band]}</div>
            {(template.bands[band] || []).map((b, i) => {
              const on = selected?.id === b.id;
              return (
                <div
                  key={b.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px', marginBottom: 3,
                    border: `1px solid ${on ? T.accentStrong : T.hairlineSoft}`,
                    background: on ? T.accentTint : T.panelAlt,
                    borderRadius: T.radius, fontSize: T.fsGrid,
                    transition: `background ${T.transition}, border-color ${T.transition}`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setSelected({ band, id: b.id })}
                    style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', color: T.text, padding: 0 }}
                  >
                    {BLOCK_TYPES[b.type]?.label || b.type}
                  </button>
                  <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(band, i, -1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, padding: 2 }}><ArrowUp size={12} /></button>
                  <button type="button" aria-label="Move down" disabled={i === (template.bands[band] || []).length - 1} onClick={() => move(band, i, 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, padding: 2 }}><ArrowDown size={12} /></button>
                  <button type="button" aria-label="Remove" onClick={() => remove(band, i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.danger, padding: 2 }}><Trash2 size={12} /></button>
                </div>
              );
            })}

            {adding === band ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: 5, background: T.panelAlt, borderRadius: T.radius }}>
                {Object.entries(BLOCK_TYPES).map(([k, v]) => (
                  <button key={k} type="button" title={v.hint} style={chip(false)} onClick={() => add(band, k)}>{v.label}</button>
                ))}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(band)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: `1px dashed ${T.hairline}`, borderRadius: T.radius, color: T.textMuted, fontSize: 11, padding: '4px 7px', cursor: 'pointer', width: '100%' }}
              >
                <Plus size={11} /> Add a block
              </button>
            )}
          </div>
        ))}
      </div>

      {/* ── Preview ───────────────────────────────────────────────────── */}
      <div style={{ background: T.page, border: `1px solid ${T.hairline}`, borderRadius: T.radiusLg, overflow: 'auto', padding: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            type="button" onClick={() => printDocument(template, previewJob, company, inventory)}
            disabled={!previewJob}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: T.chrome, color: T.chromeText, border: 'none', borderRadius: T.radius, padding: '6px 11px', fontSize: T.fsSmall, fontWeight: 700, cursor: 'pointer' }}
          >
            <Printer size={13} /> Print / PDF
          </button>
          <button
            type="button" onClick={save} disabled={!dirty}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: dirty ? T.accentStrong : T.hairline, color: dirty ? '#fff' : T.textMuted, border: 'none', borderRadius: T.radius, padding: '6px 11px', fontSize: T.fsSmall, fontWeight: 700, cursor: dirty ? 'pointer' : 'default' }}
          >
            <Save size={13} /> {dirty ? 'Save template' : 'Saved'}
          </button>
          <button
            type="button" onClick={reset}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', color: T.textMuted, border: `1px solid ${T.hairline}`, borderRadius: T.radius, padding: '6px 11px', fontSize: T.fsSmall, cursor: 'pointer' }}
          >
            <RotateCcw size={13} /> Reset to default
          </button>
          {previewJob && (
            <span style={{ alignSelf: 'center', fontSize: 11, color: T.textMuted }}>
              Previewing job #{previewJob.id}
            </span>
          )}
        </div>

        {previewJob ? (
          <div style={{ boxShadow: T.shadowMd, width: 'fit-content' }}>
            <TemplateRenderer template={template} job={previewJob} company={company} inventory={inventory} />
          </div>
        ) : (
          <p style={{ color: T.textMuted, fontSize: T.fsGrid }}>
            No jobs to preview against yet. Create one and the layout will render here.
          </p>
        )}
      </div>

      {/* ── Settings ──────────────────────────────────────────────────── */}
      <div style={{ background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radiusLg, padding: 12, overflowY: 'auto' }}>
        {selectedBlock ? (
          <>
            <h3 style={{ margin: '0 0 3px', fontSize: T.fsBase, fontWeight: 800 }}>
              {BLOCK_TYPES[selectedBlock.type]?.label}
            </h3>
            <p style={{ margin: '0 0 12px', fontSize: 11, color: T.textMuted }}>
              {BLOCK_TYPES[selectedBlock.type]?.hint}
            </p>
            <BlockSettings
              block={selectedBlock}
              onChange={next => mutate(t => {
                const arr = t.bands[selected.band];
                arr[arr.findIndex(b => b.id === next.id)] = next;
              })}
            />
          </>
        ) : (
          <p style={{ fontSize: T.fsGrid, color: T.textMuted, margin: 0 }}>
            Pick a block on the left to change what it prints, or add one to a band.
          </p>
        )}
      </div>
    </div>
  );
}
