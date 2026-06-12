# UI Foundation Implementation Plan (Phase 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the design-token system, nine UI primitives, and the new Jim2-anatomy app shell (ModuleBar + LiveTree + StatusBar), wire the shell into the app replacing the old Rail/LabelPanel/Topbar shell, with frontend unit-test infrastructure.

**Architecture:** New `frontend/src/ui/` folder holds tokens and primitives; `frontend/src/ui/shell/` holds the shell. The new `AppShell` accepts the same props as the old `Shell` (plus four new ones: `jobs`, `pinnedJobs`, `onOpenJob`, `onUnpinJob`) so the 9,642-line `TotalImageERP.jsx` changes by only ~6 lines. Old shell files are deleted at the end. Module content is NOT restyled in this phase — that's Phase 2 (core modules) and Phase 3 (secondary + monolith deletion), planned separately per the spec.

**Tech Stack:** React 18, Vite 5, lucide-react, TanStack Query v5 (existing); vitest + jsdom + @testing-library/react (added by Task 1).

**Spec:** `docs/superpowers/specs/2026-06-11-ui-redesign-dense-jim2-design.md`

---

## Codebase facts (verified 2026-06-11 — do not re-derive)

- Old shell: `frontend/src/components/shell/{Rail,LabelPanel,Topbar,Shell}.jsx`. Only `TotalImageERP.jsx` imports `Shell` (line 16); `Shell` is used at line ~8485 with props: `activeModule, onNavigate, adminMode, onAdminToggle, currentUser, badges {jobCount, quoteCount}, onNewJob, searchValue, onSearchChange, notifCount, children`.
- Old LabelPanel nav ids (the complete navigable module list): `dashboard, jobs, quotes, purchase-orders, inventory, card-files, customers, accounts, reports`.
- Real job statuses: `QUOTE, New, ORDER, In Progress, PROOF, PRINT, Pick/Pack, FINISH, INVOICE, PAID, CANCEL`.
- Normalized job fields (from `api.js normalizeJob`): `id, status, due, accMgr, …` — dates are `DD/MM/YYYY` strings; monolith parses with `parseD` (line 22).
- Monolith already tracks open jobs: `pinnedJobs` state + `pinJob(job)` / `unpinJob(jobId)` helpers (~line 1315). LiveTree's OPEN section uses these — no new tracking system.
- `api.js`: `BASE = '/api'`; Vite proxy rewrites `/api/*` → `http://localhost:8000/*`, so `request('/health')` reaches the backend `/health` endpoint. There is no `health` export yet (Task 8 adds it).
- `currentUser` shape: `{ username, role }` (role `'admin'` gates admin tools).
- No frontend test runner exists. `frontend/package.json` has no `test` script.
- Run dev server: `cd frontend && npm run dev` (port 3000; backend on 8000 via `cd backend && uvicorn app.main:app --reload --port 8000`).

## File Map

| File | Responsibility |
|---|---|
| `frontend/src/ui/tokens.js` | Create — design tokens `T` + `STATUS_COLORS` + `statusColor()` |
| `frontend/src/ui/dates.js` | Create — `parseD` DD/MM/YYYY parser (copy of monolith helper; monolith keeps its own until Phase 3) |
| `frontend/src/ui/Button.jsx` | Create — primary/secondary/danger/ghost button |
| `frontend/src/ui/StatusBadge.jsx` | Create — status text in semantic colour |
| `frontend/src/ui/Field.jsx` | Create — label + dense input + error text |
| `frontend/src/ui/Select.jsx` | Create — label + dense native select |
| `frontend/src/ui/Tabs.jsx` | Create — underline tabs |
| `frontend/src/ui/Modal.jsx` | Create — overlay dialog |
| `frontend/src/ui/KpiTile.jsx` | Create — dense stat tile |
| `frontend/src/ui/Toast.jsx` | Create — ToastProvider + useToast |
| `frontend/src/ui/DataGrid.jsx` | Create — dense table with sort/loading/error/empty |
| `frontend/src/ui/FilterBar.jsx` | Create — filter chips + add-filter dropdown |
| `frontend/src/ui/shell/ModuleBar.jsx` | Create — top chrome bar |
| `frontend/src/ui/shell/LiveTree.jsx` | Create — left panel: open jobs + saved lists |
| `frontend/src/ui/shell/StatusBar.jsx` | Create — bottom chrome bar + health dot |
| `frontend/src/ui/shell/AppShell.jsx` | Create — composes the three around content |
| `frontend/src/api.js` | Modify — add `health` export |
| `frontend/src/TotalImageERP.jsx` | Modify — swap `Shell` → `AppShell` (~6 lines) |
| `frontend/src/components/shell/*` | Delete (Task 11, after swap verified) |
| `frontend/vite.config.js` | Modify — add vitest `test` block |
| `frontend/src/test-setup.js` | Create — jest-dom setup |
| `frontend/package.json` | Modify — devDeps + `test` script |
| `frontend/src/ui/__tests__/*.test.jsx` | Create — unit tests per task |

---

### Task 1: Frontend test infrastructure

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/vite.config.js`
- Create: `frontend/src/test-setup.js`
- Create: `frontend/src/ui/__tests__/smoke.test.jsx`

- [ ] **Step 1: Install dev dependencies**

```bash
cd frontend
npm install -D vitest@^2.1.9 jsdom@^25.0.1 @testing-library/react@^16.3.0 @testing-library/jest-dom@^6.6.3
```

- [ ] **Step 2: Add test script to package.json**

In `frontend/package.json` `"scripts"`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Add test block to vite.config.js**

Modify `frontend/vite.config.js` — add a `test` key to the `defineConfig` object (sibling of `plugins` and `server`):

```js
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.js',
    globals: true,
  },
```

- [ ] **Step 4: Create test setup file**

Create `frontend/src/test-setup.js`:

```js
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Write a smoke test**

Create `frontend/src/ui/__tests__/smoke.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';

test('test infrastructure renders JSX', () => {
  render(<div>hello</div>);
  expect(screen.getByText('hello')).toBeInTheDocument();
});
```

- [ ] **Step 6: Run tests — expect PASS**

Run: `cd frontend && npm test`
Expected: `1 passed`

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.js frontend/src/test-setup.js frontend/src/ui/__tests__/smoke.test.jsx
git commit -m "chore: frontend test infrastructure — vitest + testing-library"
```

---

### Task 2: Design tokens + date helper

**Files:**
- Create: `frontend/src/ui/tokens.js`
- Create: `frontend/src/ui/dates.js`
- Test: `frontend/src/ui/__tests__/tokens.test.jsx`

- [ ] **Step 1: Write failing test**

Create `frontend/src/ui/__tests__/tokens.test.jsx`:

```jsx
import { T, statusColor } from '../tokens';
import { parseD } from '../dates';

test('statusColor maps every real job status and falls back for unknown', () => {
  for (const s of ['QUOTE','New','ORDER','In Progress','PROOF','PRINT','Pick/Pack','FINISH','INVOICE','PAID','CANCEL']) {
    expect(statusColor(s)).toMatch(/^#[0-9a-f]{6}$/i);
  }
  expect(statusColor('NO_SUCH_STATUS')).toBe(T.textMuted);
});

test('parseD parses DD/MM/YYYY and rejects empty', () => {
  const d = parseD('25/03/2026');
  expect(d.getFullYear()).toBe(2026);
  expect(d.getMonth()).toBe(2);
  expect(d.getDate()).toBe(25);
  expect(parseD('')).toBeNull();
  expect(parseD(null)).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — cannot resolve `../tokens`

- [ ] **Step 3: Create tokens.js**

Create `frontend/src/ui/tokens.js`:

```js
// Design tokens — single source of visual truth.
// Spec: docs/superpowers/specs/2026-06-11-ui-redesign-dense-jim2-design.md

export const T = {
  // Surfaces (zinc)
  chrome: '#18181b',
  chromeRaised: '#27272a',
  chromeHover: '#3f3f46',
  page: '#fafafa',
  panel: '#ffffff',
  hairline: '#e4e4e7',
  hairlineSoft: '#f4f4f5',

  // Text
  text: '#18181b',
  textMuted: '#71717a',
  textFaint: '#a1a1aa',
  headerText: '#52525b',
  chromeText: '#fafafa',
  chromeTextMuted: '#a1a1aa',

  // Accent (amber identity)
  accent: '#eab308',
  accentStrong: '#ca8a04',
  accentTint: '#fef9c3',
  accentFocus: '#fef08a',

  // Feedback
  danger: '#b91c1c',
  dangerTint: '#fef2f2',
  ok: '#15803d',
  okTint: '#dcfce7',

  // Type
  font: "'Segoe UI', system-ui, sans-serif",
  fsBase: 13,
  fsGrid: 12,
  fsHeader: 11,
  fsSmall: 11,

  // Density
  rowHeight: 30,
  inputHeight: 26,
  radius: 4,
};

// Real workflow statuses (verified against TotalImageERP.jsx).
export const STATUS_COLORS = {
  QUOTE: '#7c3aed',
  New: '#1d4ed8',
  ORDER: '#4f46e5',
  'In Progress': '#b45309',
  PROOF: '#9333ea',
  PRINT: '#c2410c',
  'Pick/Pack': '#0e7490',
  FINISH: '#15803d',
  INVOICE: '#0f766e',
  PAID: '#047857',
  CANCEL: '#71717a',
};

export function statusColor(status) {
  return STATUS_COLORS[status] ?? T.textMuted;
}
```

- [ ] **Step 4: Create dates.js**

Create `frontend/src/ui/dates.js`:

```js
// DD/MM/YYYY parser — copy of the monolith's parseD (TotalImageERP.jsx:22).
// The monolith keeps its own copy until Phase 3 consolidation.
export const parseD = (str) => {
  if (!str) return null;
  const s = String(str).split(' ')[0];
  const p = s.split('/');
  return p.length === 3 ? new Date(`${p[2]}-${p[1]}-${p[0]}`) : new Date(s);
};
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `cd frontend && npm test`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add frontend/src/ui/tokens.js frontend/src/ui/dates.js frontend/src/ui/__tests__/tokens.test.jsx
git commit -m "feat: design tokens, status colour map, date helper"
```

---

### Task 3: StatusBadge + Button

**Files:**
- Create: `frontend/src/ui/StatusBadge.jsx`
- Create: `frontend/src/ui/Button.jsx`
- Test: `frontend/src/ui/__tests__/StatusBadge.test.jsx`

- [ ] **Step 1: Write failing test**

Create `frontend/src/ui/__tests__/StatusBadge.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import StatusBadge from '../StatusBadge';
import Button from '../Button';
import { STATUS_COLORS } from '../tokens';

test('StatusBadge renders status in its semantic colour (uppercased via CSS)', () => {
  render(<StatusBadge status="Pick/Pack" />);
  const el = screen.getByText('Pick/Pack'); // textTransform is CSS-only; DOM text is unchanged
  expect(el).toHaveStyle({ color: STATUS_COLORS['Pick/Pack'] });
  expect(el).toHaveStyle({ textTransform: 'uppercase' });
});

test('Button fires onClick and respects disabled', () => {
  const onClick = vi.fn();
  const { rerender } = render(<Button onClick={onClick}>Save</Button>);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(onClick).toHaveBeenCalledTimes(1);
  rerender(<Button onClick={onClick} disabled>Save</Button>);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(onClick).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — cannot resolve `../StatusBadge`

- [ ] **Step 3: Create StatusBadge.jsx**

```jsx
import { statusColor, T } from './tokens';

export default function StatusBadge({ status, size = 'md' }) {
  if (!status) return null;
  return (
    <span style={{
      color: statusColor(status),
      fontWeight: 600,
      fontSize: size === 'sm' ? 10 : T.fsHeader,
      textTransform: 'uppercase',
      letterSpacing: '0.02em',
      whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  );
}
```

- [ ] **Step 4: Create Button.jsx**

```jsx
import { T } from './tokens';

const VARIANTS = {
  primary:   { background: T.accentStrong, color: '#fff', border: `1px solid ${T.accentStrong}` },
  secondary: { background: T.panel, color: T.text, border: `1px solid ${T.hairline}` },
  danger:    { background: T.danger, color: '#fff', border: `1px solid ${T.danger}` },
  ghost:     { background: 'transparent', color: T.textMuted, border: '1px solid transparent' },
};

export default function Button({ variant = 'secondary', size = 'md', children, disabled, style, ...rest }) {
  return (
    <button
      disabled={disabled}
      style={{
        ...VARIANTS[variant],
        fontFamily: T.font,
        fontSize: size === 'sm' ? T.fsSmall : T.fsGrid,
        fontWeight: 600,
        borderRadius: T.radius,
        padding: size === 'sm' ? '3px 8px' : '5px 12px',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `cd frontend && npm test`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/ui/StatusBadge.jsx frontend/src/ui/Button.jsx frontend/src/ui/__tests__/StatusBadge.test.jsx
git commit -m "feat: StatusBadge and Button primitives"
```

---

### Task 4: Field, Select, Tabs

**Files:**
- Create: `frontend/src/ui/Field.jsx`, `frontend/src/ui/Select.jsx`, `frontend/src/ui/Tabs.jsx`
- Test: `frontend/src/ui/__tests__/forms.test.jsx`

- [ ] **Step 1: Write failing test**

Create `frontend/src/ui/__tests__/forms.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import Field from '../Field';
import Select from '../Select';
import Tabs from '../Tabs';

test('Field renders label, value, and error', () => {
  render(<Field label="Customer" value="BHP" onChange={() => {}} error="Required" />);
  expect(screen.getByLabelText('Customer')).toHaveValue('BHP');
  expect(screen.getByText('Required')).toBeInTheDocument();
});

test('Select renders options and fires onChange', () => {
  const onChange = vi.fn();
  render(<Select label="Branch" value="HQ" onChange={onChange} options={[{ value: 'HQ', label: 'HQ' }, { value: 'MELB', label: 'Melbourne' }]} />);
  fireEvent.change(screen.getByLabelText('Branch'), { target: { value: 'MELB' } });
  expect(onChange).toHaveBeenCalled();
});

test('Tabs switches active tab on click', () => {
  const onChange = vi.fn();
  render(<Tabs tabs={[{ id: 'a', label: 'Details' }, { id: 'b', label: 'Pricing' }]} active="a" onChange={onChange} />);
  fireEvent.click(screen.getByText('Pricing'));
  expect(onChange).toHaveBeenCalledWith('b');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test` — Expected: FAIL (modules missing)

- [ ] **Step 3: Create Field.jsx**

```jsx
import { useId, useState } from 'react';
import { T } from './tokens';

export default function Field({ label, error, style, inputStyle, ...rest }) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontFamily: T.font, ...style }}>
      {label && (
        <label htmlFor={id} style={{ fontSize: T.fsSmall, color: T.headerText, fontWeight: 600 }}>{label}</label>
      )}
      <input
        id={id}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          height: T.inputHeight,
          fontSize: T.fsGrid,
          fontFamily: T.font,
          color: T.text,
          padding: '0 7px',
          border: `1px solid ${error ? T.danger : T.hairline}`,
          borderRadius: T.radius - 1,
          outline: 'none',
          boxShadow: focused ? `0 0 0 2px ${T.accentFocus}` : 'none',
          background: T.panel,
          ...inputStyle,
        }}
        {...rest}
      />
      {error && <div style={{ fontSize: 10, color: T.danger }}>{error}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Create Select.jsx**

```jsx
import { useId } from 'react';
import { T } from './tokens';

export default function Select({ label, options = [], error, style, ...rest }) {
  const id = useId();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontFamily: T.font, ...style }}>
      {label && (
        <label htmlFor={id} style={{ fontSize: T.fsSmall, color: T.headerText, fontWeight: 600 }}>{label}</label>
      )}
      <select
        id={id}
        style={{
          height: T.inputHeight,
          fontSize: T.fsGrid,
          fontFamily: T.font,
          color: T.text,
          border: `1px solid ${error ? T.danger : T.hairline}`,
          borderRadius: T.radius - 1,
          background: T.panel,
          outline: 'none',
        }}
        {...rest}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <div style={{ fontSize: 10, color: T.danger }}>{error}</div>}
    </div>
  );
}
```

- [ ] **Step 5: Create Tabs.jsx**

```jsx
import { T } from './tokens';

export default function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${T.hairline}`, fontFamily: T.font }}>
      {tabs.map(t => {
        const isActive = t.id === active;
        return (
          <div
            key={t.id}
            role="tab"
            tabIndex={0}
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(t.id); } }}
            style={{
              padding: '6px 12px',
              fontSize: T.fsGrid,
              fontWeight: isActive ? 700 : 500,
              color: isActive ? T.text : T.textMuted,
              borderBottom: isActive ? `2px solid ${T.accent}` : '2px solid transparent',
              marginBottom: -1,
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            {t.label}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Run tests — expect PASS, then commit**

```bash
cd frontend && npm test
git add frontend/src/ui/Field.jsx frontend/src/ui/Select.jsx frontend/src/ui/Tabs.jsx frontend/src/ui/__tests__/forms.test.jsx
git commit -m "feat: Field, Select, Tabs primitives"
```

---

### Task 5: KpiTile, Modal, Toast

**Files:**
- Create: `frontend/src/ui/KpiTile.jsx`, `frontend/src/ui/Modal.jsx`, `frontend/src/ui/Toast.jsx`
- Test: `frontend/src/ui/__tests__/overlay.test.jsx`

- [ ] **Step 1: Write failing test**

Create `frontend/src/ui/__tests__/overlay.test.jsx`:

```jsx
import { render, screen, fireEvent, act } from '@testing-library/react';
import Modal from '../Modal';
import KpiTile from '../KpiTile';
import { ToastProvider, useToast } from '../Toast';

test('Modal renders title and closes on Escape', () => {
  const onClose = vi.fn();
  render(<Modal title="Adjust Stock" onClose={onClose}><div>body</div></Modal>);
  expect(screen.getByText('Adjust Stock')).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalled();
});

test('KpiTile shows label and value', () => {
  render(<KpiTile label="OVERDUE" value={7} tone="danger" />);
  expect(screen.getByText('OVERDUE')).toBeInTheDocument();
  expect(screen.getByText('7')).toBeInTheDocument();
});

function Trigger() {
  const toast = useToast();
  return <button onClick={() => toast.error('Save failed')}>boom</button>;
}

test('Toast shows error message via useToast', () => {
  render(<ToastProvider><Trigger /></ToastProvider>);
  act(() => { fireEvent.click(screen.getByText('boom')); });
  expect(screen.getByText('Save failed')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test` — Expected: FAIL (modules missing)

- [ ] **Step 3: Create KpiTile.jsx**

```jsx
import { T } from './tokens';

const TONES = { default: T.text, danger: T.danger, ok: T.ok, accent: T.accentStrong };

export default function KpiTile({ label, value, sub, tone = 'default' }) {
  return (
    <div style={{ background: T.panel, padding: '6px 10px', fontFamily: T.font, borderRight: `1px solid ${T.hairline}`, display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 90 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 800, color: TONES[tone], fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      {sub && <span style={{ fontSize: 10, color: T.textFaint }}>{sub}</span>}
    </div>
  );
}
```

- [ ] **Step 4: Create Modal.jsx**

```jsx
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { T } from './tokens';

export default function Modal({ title, onClose, width = 560, children, footer }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(24,24,27,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '8vh', zIndex: 1000, fontFamily: T.font }}
    >
      <div style={{ background: T.panel, borderRadius: T.radius + 2, width, maxWidth: '94vw', maxHeight: '84vh', display: 'flex', flexDirection: 'column', border: `1px solid ${T.hairline}` }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${T.hairline}` }}>
          <div style={{ fontSize: T.fsBase, fontWeight: 700, color: T.text }}>{title}</div>
          <div style={{ flex: 1 }} />
          <div role="button" tabIndex={0} aria-label="Close" onClick={onClose}
            onKeyDown={e => { if (e.key === 'Enter') onClose(); }}
            style={{ cursor: 'pointer', color: T.textMuted, display: 'flex' }}>
            <X size={15} />
          </div>
        </div>
        <div style={{ padding: 14, overflowY: 'auto' }}>{children}</div>
        {footer && <div style={{ padding: '10px 14px', borderTop: `1px solid ${T.hairline}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>{footer}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create Toast.jsx**

```jsx
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { T } from './tokens';

const ToastCtx = createContext(null);

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const push = useCallback((type, message) => {
    const id = nextId.current++;
    setToasts(ts => [...ts, { id, type, message }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), type === 'error' ? 8000 : 4000);
  }, []);

  const api = {
    success: (m) => push('success', m),
    error: (m) => push('error', m),
  };

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div style={{ position: 'fixed', bottom: 34, right: 12, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 1100, fontFamily: T.font }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: t.type === 'error' ? T.dangerTint : T.okTint,
            color: t.type === 'error' ? T.danger : T.ok,
            border: `1px solid ${t.type === 'error' ? T.danger : T.ok}`,
            borderRadius: T.radius,
            padding: '7px 12px',
            fontSize: T.fsGrid,
            fontWeight: 600,
            maxWidth: 380,
          }}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
```

- [ ] **Step 6: Run tests — expect PASS, then commit**

```bash
cd frontend && npm test
git add frontend/src/ui/KpiTile.jsx frontend/src/ui/Modal.jsx frontend/src/ui/Toast.jsx frontend/src/ui/__tests__/overlay.test.jsx
git commit -m "feat: KpiTile, Modal, Toast primitives"
```

---

### Task 6: DataGrid

**Files:**
- Create: `frontend/src/ui/DataGrid.jsx`
- Test: `frontend/src/ui/__tests__/DataGrid.test.jsx`

- [ ] **Step 1: Write failing test**

Create `frontend/src/ui/__tests__/DataGrid.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import DataGrid from '../DataGrid';

const columns = [
  { key: 'id', label: 'Job#', width: 80 },
  { key: 'customer', label: 'Customer' },
  { key: 'value', label: 'Value', align: 'right' },
];
const rows = [
  { id: 'B', customer: 'Onsite', value: 319 },
  { id: 'A', customer: 'BHP', value: 867 },
];

test('renders rows and fires onRowClick', () => {
  const onRowClick = vi.fn();
  render(<DataGrid columns={columns} rows={rows} onRowClick={onRowClick} />);
  fireEvent.click(screen.getByText('BHP'));
  expect(onRowClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'A' }));
});

test('clicking a header sorts asc then desc', () => {
  render(<DataGrid columns={columns} rows={rows} />);
  const header = screen.getByText('Job#');
  fireEvent.click(header);
  let cells = screen.getAllByRole('row').slice(1); // skip header row
  expect(cells[0]).toHaveTextContent('A');
  fireEvent.click(header);
  cells = screen.getAllByRole('row').slice(1);
  expect(cells[0]).toHaveTextContent('B');
});

test('shows loading, error with retry, and empty states', () => {
  const onRetry = vi.fn();
  const { rerender } = render(<DataGrid columns={columns} rows={null} />);
  expect(screen.getByText('Loading…')).toBeInTheDocument();
  rerender(<DataGrid columns={columns} rows={[]} error="Server unreachable" onRetry={onRetry} />);
  expect(screen.getByText('Server unreachable')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Retry'));
  expect(onRetry).toHaveBeenCalled();
  rerender(<DataGrid columns={columns} rows={[]} />);
  expect(screen.getByText('No records')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test` — Expected: FAIL (module missing)

- [ ] **Step 3: Create DataGrid.jsx**

```jsx
import { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { T } from './tokens';
import Button from './Button';

export default function DataGrid({
  columns,            // [{ key, label, width?, align?, render?(row) }]
  rows,               // array | null/undefined = loading
  rowKey = 'id',
  onRowClick,
  onRowDoubleClick,
  selectedKey,
  error,              // string — shown as a strip above rows
  onRetry,
  emptyText = 'No records',
  initialSort,        // { key, dir }
  maxHeight,
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const loading = rows == null;

  const sorted = useMemo(() => {
    if (!rows || !sort) return rows ?? [];
    const { key, dir } = sort;
    return [...rows].sort((a, b) => {
      const av = a[key], bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = (typeof av === 'number' && typeof bv === 'number')
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sort]);

  const toggleSort = (key) =>
    setSort(s => (s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' }));

  const cellBase = {
    padding: '0 8px',
    fontSize: T.fsGrid,
    height: T.rowHeight,
    display: 'flex',
    alignItems: 'center',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  };

  return (
    <div style={{ background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radius, fontFamily: T.font, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight }}>
      {error && (
        <div style={{ background: T.dangerTint, color: T.danger, padding: '6px 10px', fontSize: T.fsGrid, display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${T.hairline}` }}>
          <span style={{ flex: 1 }}>{error}</span>
          {onRetry && <Button size="sm" variant="danger" onClick={onRetry}>Retry</Button>}
        </div>
      )}
      <div role="table" style={{ overflowY: 'auto', flex: 1 }}>
        <div role="row" style={{ display: 'flex', background: T.hairlineSoft, borderBottom: `1px solid ${T.hairline}`, position: 'sticky', top: 0, zIndex: 1 }}>
          {columns.map(c => (
            <div
              key={c.key}
              role="columnheader"
              onClick={() => toggleSort(c.key)}
              style={{
                ...cellBase,
                height: 26,
                width: c.width,
                flex: c.width ? `0 0 ${c.width}px` : 1,
                justifyContent: c.align === 'right' ? 'flex-end' : 'flex-start',
                fontSize: T.fsHeader,
                fontWeight: 700,
                color: T.headerText,
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
                cursor: 'pointer',
                userSelect: 'none',
                gap: 3,
              }}
            >
              {c.label}
              {sort?.key === c.key && (sort.dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
            </div>
          ))}
        </div>

        {loading && (
          <div style={{ ...cellBase, color: T.textMuted, justifyContent: 'center', height: 60 }}>Loading…</div>
        )}
        {!loading && !error && sorted.length === 0 && (
          <div style={{ ...cellBase, color: T.textFaint, justifyContent: 'center', height: 60 }}>{emptyText}</div>
        )}
        {!loading && sorted.map(row => {
          const key = row[rowKey];
          const selected = selectedKey != null && key === selectedKey;
          return (
            <div
              key={key}
              role="row"
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row) : undefined}
              style={{
                display: 'flex',
                borderBottom: `1px solid ${T.hairlineSoft}`,
                background: selected ? T.accentTint : 'transparent',
                cursor: onRowClick ? 'pointer' : 'default',
              }}
              onMouseEnter={e => { if (!selected) e.currentTarget.style.background = T.hairlineSoft; }}
              onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
            >
              {columns.map(c => (
                <div key={c.key} role="cell" style={{
                  ...cellBase,
                  width: c.width,
                  flex: c.width ? `0 0 ${c.width}px` : 1,
                  justifyContent: c.align === 'right' ? 'flex-end' : 'flex-start',
                  color: T.text,
                }}>
                  {c.render ? c.render(row) : row[c.key]}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect PASS, then commit**

```bash
cd frontend && npm test
git add frontend/src/ui/DataGrid.jsx frontend/src/ui/__tests__/DataGrid.test.jsx
git commit -m "feat: DataGrid primitive — dense table with sort, loading, error, empty states"
```

---

### Task 7: FilterBar

**Files:**
- Create: `frontend/src/ui/FilterBar.jsx`
- Test: `frontend/src/ui/__tests__/FilterBar.test.jsx`

- [ ] **Step 1: Write failing test**

Create `frontend/src/ui/__tests__/FilterBar.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import FilterBar from '../FilterBar';

const available = [
  { key: 'status', label: 'Status', options: [{ value: 'FINISH', label: 'Finish' }, { value: 'PRINT', label: 'Print' }] },
  { key: 'accMgr', label: 'Acc Mgr', options: [{ value: 'SM', label: 'SM' }] },
];

test('renders active filter chips and removes on ✕', () => {
  const onRemove = vi.fn();
  render(<FilterBar filters={[{ key: 'status', label: 'Status', value: 'FINISH', display: 'Finish' }]} available={available} onAdd={() => {}} onRemove={onRemove} />);
  expect(screen.getByText(/Status: Finish/)).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Remove Status filter'));
  expect(onRemove).toHaveBeenCalledWith('status');
});

test('adds a filter via the + Filter menu', () => {
  const onAdd = vi.fn();
  render(<FilterBar filters={[]} available={available} onAdd={onAdd} onRemove={() => {}} />);
  fireEvent.click(screen.getByText('+ Filter'));
  fireEvent.click(screen.getByText('Acc Mgr'));
  fireEvent.click(screen.getByText('SM'));
  expect(onAdd).toHaveBeenCalledWith('accMgr', 'SM');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test` — Expected: FAIL (module missing)

- [ ] **Step 3: Create FilterBar.jsx**

```jsx
import { useEffect, useRef, useState } from 'react';
import { T } from './tokens';

export default function FilterBar({ filters = [], available = [], onAdd, onRemove, right }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickedKey, setPickedKey] = useState(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setMenuOpen(false);
        setPickedKey(null);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const picked = available.find(a => a.key === pickedKey);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: T.font, flexWrap: 'wrap' }}>
      {filters.map(f => (
        <span key={f.key} style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: T.hairlineSoft, border: `1px solid ${T.hairline}`,
          borderRadius: T.radius - 1, padding: '2px 7px', fontSize: T.fsSmall, color: T.text,
        }}>
          {f.label}: {f.display ?? String(f.value)}
          <span
            role="button"
            tabIndex={0}
            aria-label={`Remove ${f.label} filter`}
            onClick={() => onRemove(f.key)}
            onKeyDown={e => { if (e.key === 'Enter') onRemove(f.key); }}
            style={{ cursor: 'pointer', color: T.textMuted, fontWeight: 700 }}
          >
            ✕
          </span>
        </span>
      ))}

      <div ref={wrapRef} style={{ position: 'relative' }}>
        <span
          role="button"
          tabIndex={0}
          onClick={() => { setMenuOpen(o => !o); setPickedKey(null); }}
          onKeyDown={e => { if (e.key === 'Enter') setMenuOpen(o => !o); }}
          style={{ fontSize: T.fsSmall, color: T.accentStrong, fontWeight: 700, cursor: 'pointer', padding: '2px 4px' }}
        >
          + Filter
        </span>
        {menuOpen && (
          <div style={{
            position: 'absolute', top: '110%', left: 0, zIndex: 50,
            background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radius,
            minWidth: 140, boxShadow: '0 4px 10px rgba(24,24,27,0.08)',
          }}>
            {!picked && available.filter(a => !filters.some(f => f.key === a.key)).map(a => (
              <div key={a.key} role="button" tabIndex={0}
                onClick={() => setPickedKey(a.key)}
                onKeyDown={e => { if (e.key === 'Enter') setPickedKey(a.key); }}
                style={{ padding: '6px 10px', fontSize: T.fsGrid, color: T.text, cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = T.hairlineSoft}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {a.label}
              </div>
            ))}
            {picked && picked.options.map(o => (
              <div key={o.value} role="button" tabIndex={0}
                onClick={() => { onAdd(picked.key, o.value); setMenuOpen(false); setPickedKey(null); }}
                onKeyDown={e => { if (e.key === 'Enter') { onAdd(picked.key, o.value); setMenuOpen(false); setPickedKey(null); } }}
                style={{ padding: '6px 10px', fontSize: T.fsGrid, color: T.text, cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = T.hairlineSoft}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {o.label}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />
      {right}
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect PASS, then commit**

```bash
cd frontend && npm test
git add frontend/src/ui/FilterBar.jsx frontend/src/ui/__tests__/FilterBar.test.jsx
git commit -m "feat: FilterBar primitive — filter chips with add/remove menu"
```

---

### Task 8: health API + StatusBar

**Files:**
- Modify: `frontend/src/api.js` (append near other exports)
- Create: `frontend/src/ui/shell/StatusBar.jsx`
- Test: `frontend/src/ui/__tests__/StatusBar.test.jsx`

- [ ] **Step 1: Add health export to api.js**

Append after the `adminSettings` export at the end of `frontend/src/api.js`:

```js
// ── Health ───────────────────────────────────────────────────────────────────

export const health = {
  check: () => request('/health'),
};
```

- [ ] **Step 2: Write failing test**

Create `frontend/src/ui/__tests__/StatusBar.test.jsx`:

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import StatusBar from '../shell/StatusBar';

vi.mock('../../api', () => ({
  health: { check: vi.fn() },
}));
import { health } from '../../api';

test('shows Connected when health check succeeds', async () => {
  health.check.mockResolvedValue({ status: 'ok' });
  render(<StatusBar currentUser={{ username: 'em', role: 'admin' }} />);
  expect(screen.getByText('User: em')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument());
});

test('shows Offline when health check fails', async () => {
  health.check.mockRejectedValue(new Error('down'));
  render(<StatusBar currentUser={{ username: 'em' }} />);
  await waitFor(() => expect(screen.getByText('Offline')).toBeInTheDocument());
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm test` — Expected: FAIL (StatusBar missing)

- [ ] **Step 4: Create StatusBar.jsx**

```jsx
import { useEffect, useState } from 'react';
import { T } from '../tokens';
import { health } from '../../api';

const POLL_MS = 60000;

export default function StatusBar({ currentUser }) {
  const [online, setOnline] = useState(null); // null = checking

  useEffect(() => {
    let alive = true;
    const ping = () =>
      health.check()
        .then(() => { if (alive) setOnline(true); })
        .catch(() => { if (alive) setOnline(false); });
    ping();
    const t = setInterval(ping, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const dotColor = online == null ? T.textFaint : online ? '#4ade80' : '#f87171';

  return (
    <div style={{
      height: 24, background: T.chrome, display: 'flex', alignItems: 'center',
      padding: '0 10px', gap: 14, flexShrink: 0, fontFamily: T.font,
    }}>
      <span style={{ fontSize: 10.5, color: T.chromeTextMuted }}>User: {currentUser?.username ?? '—'}</span>
      {currentUser?.role && <span style={{ fontSize: 10.5, color: T.chromeTextMuted, textTransform: 'capitalize' }}>{currentUser.role}</span>}
      <span style={{ fontSize: 10.5, color: T.chromeTextMuted }}>Total Image Group</span>
      <div style={{ flex: 1 }} />
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: T.chromeTextMuted }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor }} />
        {online == null ? 'Checking…' : online ? 'Connected' : 'Offline'}
      </span>
    </div>
  );
}
```

- [ ] **Step 5: Run tests — expect PASS, then commit**

```bash
cd frontend && npm test
git add frontend/src/api.js frontend/src/ui/shell/StatusBar.jsx frontend/src/ui/__tests__/StatusBar.test.jsx
git commit -m "feat: StatusBar with health-poll connection dot; health api export"
```

---

### Task 9: ModuleBar

**Files:**
- Create: `frontend/src/ui/shell/ModuleBar.jsx`
- Test: `frontend/src/ui/__tests__/ModuleBar.test.jsx`

The ModuleBar replicates ALL behaviour of the old Rail + Topbar: module navigation (same 9 ids as the old LabelPanel), job/quote badges, search input, New Job button, notification dot, admin toggle (admin role only), user initials.

- [ ] **Step 1: Write failing test**

Create `frontend/src/ui/__tests__/ModuleBar.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import ModuleBar from '../shell/ModuleBar';

const base = {
  activeModule: 'jobs',
  onNavigate: vi.fn(),
  adminMode: false,
  onAdminToggle: vi.fn(),
  currentUser: { username: 'em', role: 'admin' },
  badges: { jobCount: 128, quoteCount: 6 },
  onNewJob: vi.fn(),
  searchValue: '',
  onSearchChange: vi.fn(),
  notifCount: 2,
};

test('navigates on module tab click and shows badges', () => {
  render(<ModuleBar {...base} />);
  expect(screen.getByText('128')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Stock'));
  expect(base.onNavigate).toHaveBeenCalledWith('inventory');
});

test('admin lock only renders for admin role', () => {
  const { rerender } = render(<ModuleBar {...base} />);
  expect(screen.getByLabelText('Admin Tools')).toBeInTheDocument();
  rerender(<ModuleBar {...base} currentUser={{ username: 'jo', role: 'user' }} />);
  expect(screen.queryByLabelText('Admin Tools')).not.toBeInTheDocument();
});

test('search input forwards changes and New Job fires', () => {
  render(<ModuleBar {...base} />);
  fireEvent.change(screen.getByPlaceholderText('Search…'), { target: { value: 'bhp' } });
  expect(base.onSearchChange).toHaveBeenCalledWith('bhp');
  fireEvent.click(screen.getByText('New Job'));
  expect(base.onNewJob).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test` — Expected: FAIL (module missing)

- [ ] **Step 3: Create ModuleBar.jsx**

```jsx
import { Search, Bell, Plus, Lock } from 'lucide-react';
import { T } from '../tokens';

// Same module ids as the old LabelPanel — navigation behaviour is unchanged.
const MODULES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'jobs', label: 'Jobs', badgeKey: 'jobCount' },
  { id: 'quotes', label: 'Quotes', badgeKey: 'quoteCount' },
  { id: 'purchase-orders', label: 'Purchases' },
  { id: 'inventory', label: 'Stock' },
  { id: 'card-files', label: 'Card Files' },
  { id: 'customers', label: 'Customers' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'reports', label: 'Reports' },
];

export default function ModuleBar({
  activeModule, onNavigate, adminMode, onAdminToggle, currentUser,
  badges = {}, onNewJob, searchValue = '', onSearchChange, notifCount = 0,
}) {
  const initials = (currentUser?.username ?? 'U').slice(0, 2).toUpperCase();

  return (
    <div style={{
      height: 40, background: T.chrome, display: 'flex', alignItems: 'center',
      padding: '0 10px', gap: 2, flexShrink: 0, fontFamily: T.font,
    }}>
      <div style={{
        width: 22, height: 22, background: T.accent, borderRadius: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 8.5, fontWeight: 800, color: T.chrome, marginRight: 10, flexShrink: 0,
      }}>
        TIG
      </div>

      {MODULES.map(m => {
        const active = !adminMode && activeModule === m.id;
        const badge = m.badgeKey ? badges[m.badgeKey] : null;
        return (
          <div
            key={m.id}
            role="button"
            tabIndex={0}
            onClick={() => onNavigate(m.id)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(m.id); } }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 9px', borderRadius: 4, cursor: 'pointer', userSelect: 'none',
              fontSize: T.fsGrid, fontWeight: active ? 700 : 500,
              background: active ? T.chromeRaised : 'transparent',
              color: active ? T.chromeText : T.chromeTextMuted,
              boxShadow: active ? `inset 0 -2px 0 ${T.accent}` : 'none',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.color = T.chromeText; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.color = T.chromeTextMuted; }}
          >
            {m.label}
            {badge != null && badge > 0 && (
              <span style={{
                fontSize: 9.5, fontWeight: 700, background: T.chromeHover, color: T.chromeText,
                borderRadius: 8, padding: '0 5px', lineHeight: '14px',
              }}>
                {badge}
              </span>
            )}
          </div>
        );
      })}

      <div style={{ flex: 1 }} />

      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, background: T.chromeRaised,
        borderRadius: 4, padding: '4px 8px', width: 180, marginRight: 6,
      }}>
        <Search size={12} color={T.chromeTextMuted} />
        <input
          value={searchValue}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search…"
          style={{
            border: 'none', background: 'transparent', outline: 'none',
            fontSize: T.fsSmall, color: T.chromeText, width: '100%', fontFamily: T.font,
          }}
        />
      </div>

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: 5, cursor: 'pointer', marginRight: 2 }}>
        <Bell size={14} color={T.chromeTextMuted} />
        {notifCount > 0 && (
          <span style={{ position: 'absolute', top: 3, right: 2, width: 7, height: 7, background: T.danger, borderRadius: '50%', border: `1px solid ${T.chrome}` }} />
        )}
      </div>

      <button
        onClick={onNewJob}
        style={{
          background: T.accentStrong, color: '#fff', border: 'none', borderRadius: 4,
          padding: '5px 11px', fontSize: T.fsSmall, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4, fontFamily: T.font, marginRight: 6,
        }}
      >
        <Plus size={12} /> New Job
      </button>

      {currentUser?.role === 'admin' && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Admin Tools"
          title={adminMode ? 'Exit Admin' : 'Admin Tools'}
          onClick={onAdminToggle}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAdminToggle(); } }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26, borderRadius: 4, cursor: 'pointer',
            background: adminMode ? '#451a03' : 'transparent',
            color: adminMode ? T.accent : T.chromeTextMuted, marginRight: 4,
          }}
        >
          <Lock size={13} />
        </div>
      )}

      <div style={{
        width: 24, height: 24, borderRadius: '50%', background: T.chromeHover,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 700, color: T.chromeText, flexShrink: 0,
      }}>
        {initials}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect PASS, then commit**

```bash
cd frontend && npm test
git add frontend/src/ui/shell/ModuleBar.jsx frontend/src/ui/__tests__/ModuleBar.test.jsx
git commit -m "feat: ModuleBar — top chrome with module tabs, search, badges, admin toggle"
```

---

### Task 10: LiveTree

**Files:**
- Create: `frontend/src/ui/shell/LiveTree.jsx`
- Test: `frontend/src/ui/__tests__/LiveTree.test.jsx`

OPEN section = the monolith's existing `pinnedJobs`. LISTS section = predicates over the normalized jobs array. Clicking a list navigates to the Jobs module (deep filter wiring lands with the Jobs migration in Phase 2 — the `onSelectList` callback signature anticipates it).

- [ ] **Step 1: Write failing test**

Create `frontend/src/ui/__tests__/LiveTree.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import LiveTree from '../shell/LiveTree';

const today = new Date();
const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
const yesterday = new Date(today.getTime() - 86400000);

const jobs = [
  { id: 'J1', status: 'PRINT', due: fmt(today), accMgr: 'em' },
  { id: 'J2', status: 'ORDER', due: fmt(yesterday), accMgr: 'other' },
  { id: 'J3', status: 'Pick/Pack', due: null, accMgr: 'em' },
  { id: 'J4', status: 'PAID', due: fmt(yesterday), accMgr: 'em' },
];

const base = {
  jobs,
  pinnedJobs: [{ id: 'J1', status: 'PRINT' }],
  currentUser: { username: 'em' },
  onOpenJob: vi.fn(),
  onUnpinJob: vi.fn(),
  onSelectList: vi.fn(),
};

test('shows pinned jobs in OPEN and fires onOpenJob on click', () => {
  render(<LiveTree {...base} />);
  fireEvent.click(screen.getByText('J1'));
  expect(base.onOpenJob).toHaveBeenCalledWith(expect.objectContaining({ id: 'J1' }));
});

test('computes saved-list counts: My Jobs excludes PAID/CANCEL; Overdue uses due date', () => {
  render(<LiveTree {...base} />);
  // My Jobs: J1, J3 (J4 is PAID) → 2
  expect(screen.getByText('My Jobs').parentElement).toHaveTextContent('2');
  // Overdue: J2 (yesterday, active) → 1; J4 excluded (PAID)
  expect(screen.getByText('Overdue').parentElement).toHaveTextContent('1');
  // Due Today: J1 → 1
  expect(screen.getByText('Due Today').parentElement).toHaveTextContent('1');
  // Pick/Pack: J3 → 1
  expect(screen.getByText('Pick/Pack').parentElement).toHaveTextContent('1');
});

test('clicking a saved list fires onSelectList with its id', () => {
  render(<LiveTree {...base} />);
  fireEvent.click(screen.getByText('Overdue'));
  expect(base.onSelectList).toHaveBeenCalledWith('overdue');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test` — Expected: FAIL (module missing)

- [ ] **Step 3: Create LiveTree.jsx**

```jsx
import { X } from 'lucide-react';
import { T, statusColor } from '../tokens';
import { parseD } from '../dates';

const ACTIVE = (j) => !['PAID', 'CANCEL'].includes(j.status);

const isToday = (d) => {
  if (!d) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};

const isOverdue = (d) => {
  if (!d) return false;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return d < startOfToday;
};

export const SAVED_LISTS = [
  { id: 'mine', label: 'My Jobs', test: (j, user) => ACTIVE(j) && j.accMgr === user?.username },
  { id: 'due-today', label: 'Due Today', test: (j) => ACTIVE(j) && isToday(parseD(j.due)) },
  { id: 'overdue', label: 'Overdue', test: (j) => ACTIVE(j) && isOverdue(parseD(j.due)) },
  { id: 'pickpack', label: 'Pick/Pack', test: (j) => j.status === 'Pick/Pack' },
];

function SectionLabel({ children }) {
  return (
    <div style={{ padding: '8px 10px 3px', fontSize: 9.5, fontWeight: 700, color: T.textFaint, letterSpacing: '0.06em' }}>
      {children}
    </div>
  );
}

export default function LiveTree({ jobs = [], pinnedJobs = [], currentUser, onOpenJob, onUnpinJob, onSelectList }) {
  return (
    <div style={{
      width: 190, background: T.panel, borderRight: `1px solid ${T.hairline}`,
      overflowY: 'auto', flexShrink: 0, fontFamily: T.font, paddingBottom: 8,
    }}>
      <SectionLabel>OPEN</SectionLabel>
      {pinnedJobs.length === 0 && (
        <div style={{ padding: '2px 10px', fontSize: T.fsSmall, color: T.textFaint }}>No open records</div>
      )}
      {pinnedJobs.map(j => (
        <div
          key={j.id}
          role="button"
          tabIndex={0}
          onClick={() => onOpenJob(j)}
          onKeyDown={e => { if (e.key === 'Enter') onOpenJob(j); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px',
            fontSize: T.fsSmall, cursor: 'pointer', color: T.text,
          }}
          onMouseEnter={e => e.currentTarget.style.background = T.hairlineSoft}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <span style={{ fontWeight: 700 }}>{j.id}</span>
          <span style={{ color: statusColor(j.status), fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {j.status}
          </span>
          {onUnpinJob && (
            <span
              role="button"
              tabIndex={0}
              aria-label={`Close ${j.id}`}
              onClick={e => { e.stopPropagation(); onUnpinJob(j.id); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onUnpinJob(j.id); } }}
              style={{ color: T.textFaint, display: 'flex' }}
            >
              <X size={11} />
            </span>
          )}
        </div>
      ))}

      <SectionLabel>LISTS</SectionLabel>
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
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '3px 10px', fontSize: T.fsSmall, cursor: 'pointer', color: T.headerText,
            }}
            onMouseEnter={e => e.currentTarget.style.background = T.hairlineSoft}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span>{list.label}</span>
            <span style={{
              fontSize: 9.5, fontWeight: 700, color: list.id === 'overdue' && count > 0 ? T.danger : T.textMuted,
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
```

- [ ] **Step 4: Run tests — expect PASS, then commit**

```bash
cd frontend && npm test
git add frontend/src/ui/shell/LiveTree.jsx frontend/src/ui/__tests__/LiveTree.test.jsx
git commit -m "feat: LiveTree — open records (pinned jobs) and saved lists with live counts"
```

---

### Task 11: AppShell + wire into the app, delete old shell

**Files:**
- Create: `frontend/src/ui/shell/AppShell.jsx`
- Modify: `frontend/src/TotalImageERP.jsx` (import line 16, the `<Shell …>` opening tag ~line 8485, and its closing `</Shell>` tag)
- Delete: `frontend/src/components/shell/Rail.jsx`, `LabelPanel.jsx`, `Topbar.jsx`, `Shell.jsx`

- [ ] **Step 1: Create AppShell.jsx**

```jsx
import { useState } from 'react';
import { PanelLeft } from 'lucide-react';
import { T } from '../tokens';
import ModuleBar from './ModuleBar';
import LiveTree from './LiveTree';
import StatusBar from './StatusBar';

const TREE_KEY = 'tig.treeOpen';

export default function AppShell({
  // Same interface as the old Shell:
  activeModule, onNavigate, adminMode, onAdminToggle, currentUser,
  badges, onNewJob, searchValue, onSearchChange, notifCount,
  // New:
  jobs, pinnedJobs, onOpenJob, onUnpinJob,
  children,
}) {
  const [treeOpen, setTreeOpen] = useState(() => localStorage.getItem(TREE_KEY) !== '0');

  const toggleTree = () => setTreeOpen(open => {
    localStorage.setItem(TREE_KEY, open ? '0' : '1');
    return !open;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: T.page, fontFamily: T.font }}>
      <ModuleBar
        activeModule={activeModule}
        onNavigate={onNavigate}
        adminMode={adminMode}
        onAdminToggle={onAdminToggle}
        currentUser={currentUser}
        badges={badges}
        onNewJob={onNewJob}
        searchValue={searchValue}
        onSearchChange={onSearchChange}
        notifCount={notifCount}
      />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {treeOpen && (
          <LiveTree
            jobs={jobs}
            pinnedJobs={pinnedJobs}
            currentUser={currentUser}
            onOpenJob={onOpenJob}
            onUnpinJob={onUnpinJob}
            onSelectList={() => onNavigate('jobs')}
          />
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
          <div
            role="button"
            tabIndex={0}
            aria-label={treeOpen ? 'Collapse tree' : 'Expand tree'}
            title={treeOpen ? 'Collapse tree' : 'Expand tree'}
            onClick={toggleTree}
            onKeyDown={e => { if (e.key === 'Enter') toggleTree(); }}
            style={{
              position: 'absolute', top: 6, left: 6, zIndex: 20,
              width: 22, height: 22, borderRadius: 4, display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', color: T.textFaint,
              background: T.page, border: `1px solid ${T.hairline}`,
            }}
          >
            <PanelLeft size={13} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
            {children}
          </div>
        </div>
      </div>
      <StatusBar currentUser={currentUser} />
    </div>
  );
}
```

- [ ] **Step 2: Swap the import in TotalImageERP.jsx**

Line 16, replace:

```js
import Shell from './components/shell/Shell';
```

with:

```js
import AppShell from './ui/shell/AppShell';
```

- [ ] **Step 3: Update the Shell usage**

At ~line 8485, change the opening tag `<Shell` → `<AppShell` and add the four new props after the existing ones:

```jsx
    <AppShell
      activeModule={activeModule}
      onNavigate={setActiveModule}
      adminMode={adminMode}
      onAdminToggle={() => setAdminMode(v => !v)}
      currentUser={currentUser}
      badges={{
        jobCount: (jobs ?? []).filter(j => !['PAID','CANCEL'].includes(j.status)).length,
        quoteCount: (jobs ?? []).filter(j => j.status === 'QUOTE').length,
      }}
      onNewJob={() => openModal('job')}
      searchValue={searchTerm}
      onSearchChange={setSearchTerm}
      notifCount={(jobs ?? []).filter(j => !['PAID','CANCEL'].includes(j.status) && j.due && parseD(j.due) < new Date()).length}
      jobs={jobs ?? []}
      pinnedJobs={pinnedJobs}
      onOpenJob={pinJob}
      onUnpinJob={unpinJob}
    >
```

Find the matching closing tag (`grep -n "</Shell>" frontend/src/TotalImageERP.jsx`) and change it to `</AppShell>`.

- [ ] **Step 4: Delete old shell files**

```bash
git rm frontend/src/components/shell/Rail.jsx frontend/src/components/shell/LabelPanel.jsx frontend/src/components/shell/Topbar.jsx frontend/src/components/shell/Shell.jsx
```

Then verify nothing else imports them: `grep -rn "components/shell" frontend/src/` must return no results.

- [ ] **Step 5: Run all frontend tests**

Run: `cd frontend && npm test`
Expected: all pass

- [ ] **Step 6: Dev-server smoke test**

With backend running (`cd backend && uvicorn app.main:app --reload --port 8000`) and `cd frontend && npm run dev`, verify at http://localhost:3000:

1. Login works; new dark ModuleBar at top with amber TIG block, 9 module tabs, search, New Job, avatar.
2. Click each of the 9 tabs — same module content renders as before (content still old-styled; that's expected).
3. Jobs/Quotes tabs show count badges.
4. LiveTree on the left: LISTS shows My Jobs / Due Today / Overdue / Pick-Pack with counts; clicking one navigates to Jobs.
5. Open a job (existing flow) → it appears under OPEN in the tree; ✕ removes it; clicking it re-opens the job.
6. Collapse/expand the tree with the PanelLeft toggle; state survives a page reload.
7. StatusBar at bottom: username, role, green Connected dot. Stop the backend → dot turns red 'Offline' within 60 s (or on reload).
8. Admin user: lock icon toggles admin mode as before.
9. No console errors.

- [ ] **Step 7: Production build check**

Run: `cd frontend && npm run build`
Expected: builds without errors

- [ ] **Step 8: Commit**

```bash
git add -A frontend/src
git commit -m "feat: wire new AppShell (ModuleBar + LiveTree + StatusBar) into app; remove old shell"
```

---

### Task 12: Phase verification

- [ ] **Step 1: Full frontend test suite**

Run: `cd frontend && npm test` — Expected: all pass

- [ ] **Step 2: Backend suite untouched but verify anyway**

Run: `cd backend && python -m pytest --no-cov -q` — Expected: `134 passed` (no backend changes in this phase)

- [ ] **Step 3: Lint check on changed Python (none expected) and frontend build**

Run: `cd frontend && npm run build` — Expected: success

- [ ] **Step 4: Update CLAUDE.md key architecture notes**

In the root `CLAUDE.md`, under "Key architecture", append:

```markdown
- `frontend/src/ui/` — design tokens (`tokens.js`), UI primitives (DataGrid, FilterBar, StatusBadge, Button, Field, Select, Tabs, Modal, KpiTile, Toast)
- `frontend/src/ui/shell/` — app chrome: ModuleBar (top), LiveTree (left), StatusBar (bottom), AppShell (composition)
- Frontend tests: `cd frontend && npm test` (vitest + testing-library)
```

- [ ] **Step 5: Commit and mark phase complete**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md — ui/ folder and frontend test runner"
```

Phase 2 (core module migration: Jobs, Stock, Quotes, POs, CardFiles, Accounts, Dashboard) is planned next, against this now-real foundation.

---

## Phase 1 completion notes (2026-06-13)

All 12 tasks complete. Three spec deviations to carry into the Phase 2 plan:

1. **Ctrl+K shortcut not wired** — spec §2 gives the ModuleBar search a Ctrl+K focus shortcut; the input works by mouse only. Wire it when Jobs search lands in Phase 2.
2. **"Despatch Ready" saved list shipped as "Pick/Pack"** — Despatch Ready implies allocation checks that don't exist yet; LiveTree filters on `status === 'Pick/Pack'` instead. Revisit when allocation data exists.
3. **Per-module tree sections deferred** — spec §2's "module-specific sections appear per active module (e.g. recent SKUs under Stock)" needs migrated modules to exist; LiveTree currently shows the same OPEN/LISTS regardless of module. Add with the Stock module migration.
