import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import * as api from '../../api';
import { T, statusOnDark } from '../../ui/tokens';
import { todayKey } from '../../lib/dates';
import { useMyAccess } from '../../lib/useMyAccess';
import { basQuarter } from '../accounting/accountingFormat';
import { formatCount, homeSections, tileLink, tileReading } from './homeSections';
import { workInHand } from './workInHand';

// The data a tile reads that the app has not already loaded. Each is fetched
// only while a tile the person may see reads it, so a role never calls a route
// it may not. The keys are those of the screens the tiles open, so the tile
// and the screen share one answer.
const FETCHED = {
  agedReceivables: () => ({ queryKey: ['reports/aged-receivables'], queryFn: () => api.reports.agedReceivables() }),
  apSummary: () => ({ queryKey: ['ap-summary'], queryFn: () => api.supplierBills.summary() }),
  ledgerHealth: () => ({ queryKey: ['ledger-health'], queryFn: () => api.accounting.health() }),
  basQuarter: ({ today }) => {
    const { from, to } = basQuarter(today);
    return { queryKey: ['ledger-bas', from, to], queryFn: () => api.accounting.bas(from, to) };
  },
  users: () => ({ queryKey: ['users'], queryFn: () => api.users.list() }),
  garmentReqs: () => ({ queryKey: ['orderRequirements', 'garment'], queryFn: () => api.jobs.orderRequirements('garment') }),
};
const FETCHED_IDS = Object.keys(FETCHED);

const LONG_DATE = new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

// The value line keeps one height whether it holds a number, the busy bar or
// "Couldn't load", so a tile does not move when its data arrives.
const VALUE_HEIGHT = 36;

const grid = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(14.5rem, 1fr))', gap: 16,
};

// A figure card (the owner's reference anatomy): what it counts, the figure
// large with its unit beside it, and a quiet strip saying what it means and
// that it opens. Late or owed work carries a red dot and figure.
function Tile({ tile, reading, onOpen }) {
  const [hover, setHover] = useState(false);
  const { state, value, detail } = reading;
  const ready = state === 'ready';
  const shown = ready ? (tile.format ?? formatCount)(value) : null;
  const unit = ready ? (detail ?? (typeof tile.unit === 'function' ? tile.unit(value) : tile.unit)) : '';
  const alarm = ready && tile.tone === 'danger' && value > 0;
  // An amount reads "$4.3K, 7 invoices"; a count "3 jobs".
  const label = ready
    ? `${tile.title}, ${shown}${detail ? ',' : ''} ${unit}, ${tile.footer}`
    : `${tile.title}, ${state === 'loading' ? 'loading' : "couldn't load"}`;

  return (
    // One native button per tile: Enter and Space, the app's focus ring, and
    // one name for a screen reader.
    <button
      type="button"
      aria-label={label}
      aria-busy={state === 'loading' || undefined}
      onClick={() => onOpen(tile)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        appearance: 'none', margin: 0, font: 'inherit', textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column',
        gap: 10, boxSizing: 'border-box', padding: '14px 14px 10px', background: T.panel,
        border: `1px solid ${hover ? T.fieldBorder : T.hairline}`, borderRadius: T.radiusLg,
        boxShadow: hover ? T.shadowMd : T.shadowSm, transition: `box-shadow ${T.transition}, border-color ${T.transition}`,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px' }}>
        <span style={{ flex: 1, fontSize: T.fsGrid, fontWeight: 600, color: T.text, lineHeight: 1.3 }}>{tile.title}</span>
        {alarm && <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: T.danger, boxShadow: `0 0 0 3px ${T.dangerTint}` }} />}
      </span>
      <span style={{ height: VALUE_HEIGHT, display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 2px' }}>
        {ready && (
          <>
            <span style={{
              fontSize: T.fsKpi, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: `${VALUE_HEIGHT}px`,
              color: alarm ? T.danger : T.text, fontVariantNumeric: 'tabular-nums',
            }}>
              {shown}
            </span>
            <span style={{ fontSize: T.fsGrid, color: T.textMuted }}>{unit}</span>
          </>
        )}
        {state === 'loading' && (
          <span aria-hidden style={{ alignSelf: 'center', width: 64, height: 24, borderRadius: T.radius, background: T.hairlineSoft }} />
        )}
        {state === 'error' && (
          <span style={{ alignSelf: 'center', fontSize: T.fsGrid, color: T.textMuted }}>Couldn't load</span>
        )}
      </span>
      <span style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: T.radius,
        background: T.panelAlt, border: `1px solid ${T.hairlineSoft}`, fontSize: T.fsSmall, color: T.textMuted,
      }}>
        <span style={{ flex: 1, minWidth: 0 }}>{tile.footer}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: hover ? T.accent : T.text, fontWeight: 500, whiteSpace: 'nowrap', transition: `color ${T.transition}` }}>
          Open<ArrowRight size={12} aria-hidden />
        </span>
      </span>
    </button>
  );
}

// The one dark surface on Home: how much work is in hand and where it is.
// Counts only: overseas staff read jobs, not money.
function WorkInHand({ jobs, ctx, onOpenQuickList, tileIds }) {
  const { open, stages, links: allLinks } = workInHand(jobs, ctx);
  // A list the person already has as a tile below is not offered twice.
  const links = allLinks.filter((link) => !tileIds.has(link.view));
  const shown = stages.filter((s) => s.count > 0);
  return (
    <section aria-labelledby="home-work" style={{
      position: 'relative', overflow: 'hidden', marginBottom: 28, padding: '20px 22px',
      background: T.text, color: '#fff', borderRadius: T.radiusLg + 4,
      boxShadow: '0 1px 2px rgba(17,17,20,.2), 0 12px 32px rgba(17,17,20,.14)',
    }}>
      {/* A faint drafting grid, lit from the top left: the panel's one texture. */}
      <span aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.6,
        backgroundImage: 'linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)',
        backgroundSize: '28px 28px',
        WebkitMaskImage: 'radial-gradient(120% 90% at 0% 0%, #000 0%, transparent 70%)',
        maskImage: 'radial-gradient(120% 90% at 0% 0%, #000 0%, transparent 70%)',
      }} />
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '18px 32px', alignItems: 'end' }}>
        <div>
          <h2 id="home-work" style={{ margin: 0, fontSize: T.fsGrid, fontWeight: 500, color: '#a1a1aa' }}>Work in hand</h2>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
            <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{open}</span>
            <span style={{ fontSize: T.fsBase, color: '#d4d4d8' }}>{open === 1 ? 'job' : 'jobs'} between quote and payment</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {links.map((link) => (
            <button
              key={link.view}
              type="button"
              onClick={() => onOpenQuickList?.(link.quick)}
              style={{
                appearance: 'none', cursor: 'pointer', font: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 8,
                height: 32, padding: '0 10px 0 12px', borderRadius: T.radius, color: '#fff',
                background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', fontSize: T.fsGrid,
                transition: `background ${T.transition}`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.12)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.06)'; }}
            >
              <span style={{ color: '#d4d4d8' }}>{link.label}</span>
              <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{link.count}</span>
              <ArrowRight size={13} aria-hidden style={{ color: '#a1a1aa' }} />
            </button>
          ))}
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          {open > 0 ? (
            <>
              <div role="img" aria-label={shown.map((s) => `${s.label} ${s.count}`).join(', ')}
                style={{ display: 'flex', gap: 3, height: 10, borderRadius: 5, overflow: 'hidden' }}>
                {shown.map((s) => (
                  <span key={s.id} style={{ flex: `${s.count} 1 0`, minWidth: 6, background: statusOnDark(s.status) }} />
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', marginTop: 12 }}>
                {stages.map((s) => (
                  <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: T.fsSmall, color: s.count ? '#d4d4d8' : '#8b8b94' }}>
                    <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: s.count ? statusOnDark(s.status) : 'rgba(255,255,255,.18)' }} />
                    {s.label}
                    <span style={{ color: '#fff', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{s.count}</span>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: T.fsGrid, color: '#a1a1aa' }}>No work in hand — every job is paid or closed.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function Section({ section, sources, ctx, onOpen }) {
  const readings = section.tiles.map((tile) => tileReading(tile, sources, ctx));
  // An empty exception queue is not a to-do: when every one of them has
  // loaded and counts nothing, say so instead of showing a row of zeros.
  const allClear = !!section.empty && readings.every((r) => r.state === 'ready' && r.value === 0);
  const headingId = `home-${section.id}`;

  return (
    <section aria-labelledby={headingId} style={{ marginBottom: 28 }}>
      <h2 id={headingId} style={{ fontSize: T.fsSection, fontWeight: 600, letterSpacing: '-0.01em', color: T.text, margin: '0 0 12px' }}>{section.title}</h2>
      {allClear ? (
        <p style={{
          fontSize: T.fsGrid, color: T.textMuted, margin: 0, padding: '14px 16px',
          background: T.panel, border: `1px dashed ${T.hairline}`, borderRadius: T.radiusLg,
        }}>{section.empty}</p>
      ) : (
        <div style={grid}>
          {section.tiles.map((tile, i) => (
            <Tile key={tile.id} tile={tile} reading={readings[i]} onOpen={onOpen} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Home: what needs this person now, and how their work stands, as tiles.
 *
 * Which tiles a role gets is content (homeSections.js); whether one shows is
 * whether the person may call the routes it reads. `sources` carries the data
 * the app has already loaded (jobs, inventory, purchaseOrders), each shaped
 * like a query result; Home fetches the rest itself (FETCHED).
 *
 * A tile opens a jobs quick list (`onOpenQuickList(quick)`) or another screen
 * (`onOpenLink(link)`: `{ module, ...that screen's opening tab or filter }`,
 * or `{ admin: true, usersFilter }` for Users and roles).
 */
export default function HomeModule({ currentUser, sources = {}, onOpenQuickList, onOpenLink }) {
  const { data: access, isError: accessFailed, refetch } = useMyAccess();
  const ctx = { today: todayKey(), user: currentUser };
  const name = currentUser?.full_name || currentUser?.username || '';
  const sections = access ? homeSections(access.role ?? currentUser?.role, access) : [];

  const wanted = new Set(sections.flatMap((section) => section.tiles.map((tile) => tile.source)));
  const fetched = useQueries({
    queries: FETCHED_IDS.map((id) => ({ ...FETCHED[id](ctx), enabled: wanted.has(id) })),
  });
  const read = { ...sources, ...Object.fromEntries(FETCHED_IDS.map((id, i) => [id, fetched[i]])) };

  const open = (tile) => {
    const link = tileLink(tile, ctx) ?? {};
    if (link.quick) onOpenQuickList?.(link.quick);
    else if (link.module || link.admin) onOpenLink?.(link);
  };

  // The work-in-hand panel reads the jobs list, so it shows only to a role
  // that may read it, and only once that list has loaded.
  const jobsSource = read.jobs;
  const showWork = Array.isArray(access?.allowed) && access.allowed.includes('GET /jobs')
    && jobsSource && !jobsSource.isPending && !jobsSource.isError;

  let body;
  if (access) {
    body = sections.length > 0
      ? (
        <>
          {showWork && (
            <WorkInHand
              jobs={jobsSource.data}
              ctx={ctx}
              onOpenQuickList={onOpenQuickList}
              tileIds={new Set(sections.flatMap((s) => s.tiles.map((t) => t.id)))}
            />
          )}
          {sections.map((section) => <Section key={section.id} section={section} sources={read} ctx={ctx} onOpen={open} />)}
        </>
      )
      : <p style={{ fontSize: T.fsBase, color: T.textMuted, margin: 0 }}>Nothing to show here for your role.</p>;
  } else if (accessFailed) {
    body = (
      <p role="alert" style={{ fontSize: T.fsBase, color: T.textMuted, margin: 0 }}>
        Couldn't load what your role can see.{' '}
        <button
          type="button"
          onClick={() => refetch()}
          style={{ appearance: 'none', border: 'none', background: 'none', padding: 0, font: 'inherit', color: T.accentStrong, cursor: 'pointer', textDecoration: 'underline' }}
        >
          Try again
        </button>
      </p>
    );
  } else {
    body = <p role="status" aria-busy="true" style={{ fontSize: T.fsBase, color: T.textMuted, margin: 0 }}>Loading…</p>;
  }

  return (
    <div style={{ fontFamily: T.font, maxWidth: 1240 }}>
      <header style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px 12px', marginBottom: 20 }}>
        <h1 style={{ fontSize: T.fsTitle + 2, fontWeight: 600, letterSpacing: '-0.02em', color: T.text, margin: 0 }}>Home</h1>
        {name && <span style={{ fontSize: T.fsBase, fontWeight: 500, color: T.text }}>{name}</span>}
        <span style={{ fontSize: T.fsBase, color: T.textMuted }}>{LONG_DATE.format(new Date())}</span>
      </header>
      {body}
    </div>
  );
}
