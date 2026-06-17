# Card Files Module Migration Plan (Phase 2g)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Card Files list experience out of `renderCardFiles` onto the `ui/` primitives — a `CardFilesModule` with search, a group filter, and a DataGrid master list — while leaving the existing card detail panel (`selectedCardFile` + related-jobs view) and the create/edit modal wired to the monolith, exactly as Customers/PO/Jobs left their detail/operational panels.

**Architecture:** New `frontend/src/modules/card-files/`, mirroring `modules/customers/`. `CardFilesModule` is controlled: the monolith passes `cardFiles` (its existing query), the `search`/`group` filter state, `selectedId` (the card's `shipCode`), and callbacks. Filtering moves to a pure `cardFileFilters.js`. The master list becomes a DataGrid. **The `selectedCardFile` detail panel (card info + related jobs filtered by `shipTo === shipCode`) and the create/edit `cardFileModal` stay in the monolith** — clicking a row calls `onSelectCard`, New Card calls `onNewCard`. No KPI strip (the current module has none).

**Tech Stack:** React 18 + Vite, `ui/` primitives (DataGrid, Button), vitest + testing-library.

**Spec:** `docs/superpowers/specs/2026-06-11-ui-redesign-dense-jim2-design.md` §3 (CardFiles, same list/detail pattern as Customers).

---

## Codebase facts (verified 2026-06-14 — do not re-derive)

- `renderCardFiles()` starts at TotalImageERP.jsx:6603. Dispatched at `{!loading && activeModule === 'card-files' && renderCardFiles()}` (~line 8632). Structure: header (`{filtered.length} of {cardFiles.length} cards` + New Card File button) → search input + group `<select>` → **two-pane**: left card list (a column of `<button>` rows, NOT a table) and right detail panel (`selectedCardFile` → card info + related jobs). The create/edit modal (`cardFileModal.open`) renders at the END of the function.
- CardFiles query (monolith, ~line 723): `useQuery({ queryKey: ['cardFiles'], queryFn: api.cardFiles.list, ... })`. `CardFilesModule` receives `cardFiles` as a prop — no new query.
- Filter logic (verbatim, inside renderCardFiles):
  - `uniqueCfGroups = [...new Set(cardFiles.map(c => c.group).filter(Boolean))].sort()`
  - search (`cardFileSearch`) matches: `c.shipCode | c.customerCode | c.companyName | c.suburb` contains term
  - group (`cardFileGroup`, default `'all'`): `cardFileGroup === 'all' || c.group === cardFileGroup`
- Monolith state/handlers (stay in the monolith): `cardFileSearch`/`setCardFileSearch`, `cardFileGroup`/`setCardFileGroup`, `selectedCardFile`/`setSelectedCardFile`, `cardFileModal`/`setCardFileModal`, `cardFileForm`/`setCardFileForm`, `api.cardFiles.*`, the `cardFiles` + `jobs` queries.
- List row (current): each card is a button showing `c.shipCode` (mono, blue), `c.companyName || c.customerCode`, `c.suburb` + (`, ` + `c.state`), and a `c.group` badge. Selected when `selectedCardFile?.shipCode === c.shipCode`.
- `normalizeCardFile` fields: `shipCode, customerCode, group, companyName, contactName, suburb, state, postcode, country, phone, email, notes, createdAt`. **Identity key is `shipCode`** (not `id`).
- Detail panel: `relatedJobs = jobs.filter(j => j.shipTo === card.shipCode)`.
- `ui/` primitives: `DataGrid` (`columns`, `rows`, `rowKey`, `onRowClick`, `selectedKey`, `emptyText`, `maxHeight`), `Button` (`variant`, `size`). `T` tokens at `frontend/src/ui/tokens.js`. There is no FilterBar-style group control needed — a small inline native `<select>` styled with tokens is fine (matches the search input style).
- Tests: `cd frontend && npm test` (70 green). Build: `npm run build`. PostToolUse `check-sql-files.py` hook error is a broken machine-local hook — ignore; writes succeed.
- Commit style: conventional commits, no Co-Authored-By.

## File Map

| File | Responsibility |
|---|---|
| `frontend/src/modules/card-files/cardFileFilters.js` | Create — pure `filterCardFiles`, `cardFileGroups` |
| `frontend/src/modules/card-files/CardFileList.jsx` | Create — DataGrid master list (Ship Code, Company, Location, Group) |
| `frontend/src/modules/card-files/CardFilesModule.jsx` | Create — search + group select + New Card + CardFileList (controlled) |
| `frontend/src/TotalImageERP.jsx` | Modify — replace the list/search/group portion of renderCardFiles with `<CardFilesModule>`; keep detail panel + modal |
| `frontend/src/modules/card-files/__tests__/*.test.jsx` | Create — per-task tests |

---

### Task 1: cardFileFilters + CardFileList

**Files:**
- Create: `frontend/src/modules/card-files/cardFileFilters.js`
- Create: `frontend/src/modules/card-files/CardFileList.jsx`
- Test: `frontend/src/modules/card-files/__tests__/CardFileList.test.jsx`

- [ ] **Step 1: Write failing test**

Create `frontend/src/modules/card-files/__tests__/CardFileList.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import CardFileList from '../CardFileList';
import { filterCardFiles, cardFileGroups } from '../cardFileFilters';

const cards = [
  { shipCode: 'SYD-01', customerCode: 'ACME', companyName: 'Acme Co', group: 'Retail', suburb: 'Sydney', state: 'NSW' },
  { shipCode: 'MEL-02', customerCode: 'BHP', companyName: 'BHP Group', group: 'Mining', suburb: 'Melbourne', state: 'VIC' },
  { shipCode: 'SYD-03', customerCode: 'ACME', companyName: 'Acme North', group: 'Retail', suburb: 'Newcastle', state: 'NSW' },
];

test('filterCardFiles: search matches shipCode/customerCode/companyName/suburb', () => {
  expect(filterCardFiles(cards, 'mel', 'all')).toHaveLength(1);
  expect(filterCardFiles(cards, 'acme', 'all')).toHaveLength(2);   // customerCode + name
  expect(filterCardFiles(cards, 'newcastle', 'all')).toHaveLength(1); // suburb
});

test('filterCardFiles: group narrows; all passes everything', () => {
  expect(filterCardFiles(cards, '', 'Retail')).toHaveLength(2);
  expect(filterCardFiles(cards, '', 'Mining')).toHaveLength(1);
  expect(filterCardFiles(cards, '', 'all')).toHaveLength(3);
});

test('cardFileGroups returns sorted unique non-empty groups', () => {
  expect(cardFileGroups(cards)).toEqual(['Mining', 'Retail']);
});

test('CardFileList renders rows by shipCode and fires onSelect', () => {
  const onSelect = vi.fn();
  render(<CardFileList cards={cards} selectedId={null} onSelect={onSelect} />);
  expect(screen.getByText('SYD-01')).toBeInTheDocument();
  expect(screen.getByText('Acme Co')).toBeInTheDocument();
  fireEvent.click(screen.getByText('BHP Group'));
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ shipCode: 'MEL-02' }));
});
```

- [ ] **Step 2: Run to verify failure** — `cd "/d/Total Image Group/frontend" && npm test`

- [ ] **Step 3: Create cardFileFilters.js**

```js
export function cardFileGroups(cards) {
  return [...new Set((cards || []).map(c => c.group).filter(Boolean))].sort();
}

export function filterCardFiles(cards, search, group) {
  const term = (search || '').toLowerCase();
  return (cards || []).filter(c => {
    const matchesSearch = !term ||
      (c.shipCode || '').toLowerCase().includes(term) ||
      (c.customerCode || '').toLowerCase().includes(term) ||
      (c.companyName || '').toLowerCase().includes(term) ||
      (c.suburb || '').toLowerCase().includes(term);
    const matchesGroup = !group || group === 'all' || c.group === group;
    return matchesSearch && matchesGroup;
  });
}
```

- [ ] **Step 4: Create CardFileList.jsx**

```jsx
import DataGrid from '../../ui/DataGrid';
import { T } from '../../ui/tokens';

const location = (c) => [c.suburb, c.state].filter(Boolean).join(', ');

const COLUMNS = [
  { key: 'shipCode', label: 'Ship Code', width: 110, render: (c) => <span style={{ fontWeight: 700, color: T.accentStrong }}>{c.shipCode}</span> },
  { key: 'companyName', label: 'Company', render: (c) => c.companyName || c.customerCode || '—' },
  { key: 'location', label: 'Location', width: 150, render: (c) => location(c) || '—' },
  { key: 'group', label: 'Group', width: 90, render: (c) => c.group || '—' },
];

export default function CardFileList({ cards, selectedId, onSelect }) {
  return (
    <DataGrid
      columns={COLUMNS}
      rows={cards}
      rowKey="shipCode"
      selectedKey={selectedId}
      onRowClick={onSelect}
      emptyText="No card files match"
    />
  );
}
```

- [ ] **Step 5: Run tests — expect PASS, then commit**

```bash
cd frontend && npm test
git add frontend/src/modules/card-files/cardFileFilters.js frontend/src/modules/card-files/CardFileList.jsx frontend/src/modules/card-files/__tests__/CardFileList.test.jsx
git commit -m "feat: card file filters + CardFileList on DataGrid"
```

---

### Task 2: CardFilesModule (search + group + list)

**Files:**
- Create: `frontend/src/modules/card-files/CardFilesModule.jsx`
- Test: `frontend/src/modules/card-files/__tests__/CardFilesModule.test.jsx`

Controlled: parent owns `search`/`group`/`selectedId` and passes callbacks. Group options come from `cardFileGroups(cards)`; list from `filterCardFiles`.

- [ ] **Step 1: Write failing test**

Create `frontend/src/modules/card-files/__tests__/CardFilesModule.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import CardFilesModule from '../CardFilesModule';

const cards = [
  { shipCode: 'SYD-01', customerCode: 'ACME', companyName: 'Acme Co', group: 'Retail', suburb: 'Sydney', state: 'NSW' },
  { shipCode: 'MEL-02', customerCode: 'BHP', companyName: 'BHP Group', group: 'Mining', suburb: 'Melbourne', state: 'VIC' },
];
const base = {
  cardFiles: cards, search: '', group: 'all',
  onSearchChange: vi.fn(), onGroupChange: vi.fn(),
  selectedId: null, onSelectCard: vi.fn(), onNewCard: vi.fn(),
};

test('renders all cards by default', () => {
  render(<CardFilesModule {...base} />);
  expect(screen.getByText('SYD-01')).toBeInTheDocument();
  expect(screen.getByText('MEL-02')).toBeInTheDocument();
});

test('search forwards changes; New Card fires', () => {
  render(<CardFilesModule {...base} />);
  fireEvent.change(screen.getByPlaceholderText('Search card files…'), { target: { value: 'syd' } });
  expect(base.onSearchChange).toHaveBeenCalledWith('syd');
  fireEvent.click(screen.getByText('New Card File'));
  expect(base.onNewCard).toHaveBeenCalled();
});

test('group select lists groups and forwards changes', () => {
  render(<CardFilesModule {...base} />);
  fireEvent.change(screen.getByLabelText('Filter by group'), { target: { value: 'Mining' } });
  expect(base.onGroupChange).toHaveBeenCalledWith('Mining');
});

test('search + group props filter the visible list', () => {
  render(<CardFilesModule {...base} group="Mining" />);
  expect(screen.getByText('MEL-02')).toBeInTheDocument();
  expect(screen.queryByText('SYD-01')).not.toBeInTheDocument();
});

test('row click fires onSelectCard', () => {
  render(<CardFilesModule {...base} />);
  fireEvent.click(screen.getByText('Acme Co'));
  expect(base.onSelectCard).toHaveBeenCalledWith(expect.objectContaining({ shipCode: 'SYD-01' }));
});
```

- [ ] **Step 2: Run to verify failure** — `npm test`

- [ ] **Step 3: Create CardFilesModule.jsx**

```jsx
import { useMemo } from 'react';
import { Search, Plus } from 'lucide-react';
import Button from '../../ui/Button';
import { T } from '../../ui/tokens';
import CardFileList from './CardFileList';
import { filterCardFiles, cardFileGroups } from './cardFileFilters';

export default function CardFilesModule({
  cardFiles = [], search, group, onSearchChange, onGroupChange,
  selectedId, onSelectCard, onNewCard,
}) {
  const groups = useMemo(() => cardFileGroups(cardFiles), [cardFiles]);
  const filtered = useMemo(() => filterCardFiles(cardFiles, search, group), [cardFiles, search, group]);

  const controlStyle = {
    fontSize: T.fsGrid, fontFamily: T.font, color: T.text,
    border: `1px solid ${T.hairline}`, borderRadius: T.radius,
    background: T.panel, height: 28, padding: '0 8px',
  };

  return (
    <div style={{ fontFamily: T.font }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: T.panel, border: `1px solid ${T.hairline}`, borderRadius: T.radius, padding: '4px 8px', flex: 1, maxWidth: 280 }}>
          <Search size={12} color={T.textFaint} />
          <input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search card files…"
            style={{ border: 'none', outline: 'none', fontSize: T.fsGrid, width: '100%', fontFamily: T.font, color: T.text }}
          />
        </div>
        <select
          aria-label="Filter by group"
          value={group}
          onChange={e => onGroupChange(e.target.value)}
          style={controlStyle}
        >
          <option value="all">All Groups</option>
          {groups.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: T.fsSmall, color: T.textMuted }}>{filtered.length} of {cardFiles.length}</span>
        <Button size="sm" variant="primary" onClick={onNewCard}><Plus size={12} /> New Card File</Button>
      </div>

      <CardFileList cards={filtered} selectedId={selectedId} onSelect={onSelectCard} />
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect PASS, then commit**

```bash
cd frontend && npm test
git add frontend/src/modules/card-files/CardFilesModule.jsx frontend/src/modules/card-files/__tests__/CardFilesModule.test.jsx
git commit -m "feat: CardFilesModule — search, group filter, card list (controlled)"
```

---

### Task 3: Wire CardFilesModule into the monolith + verification

**Files:**
- Modify: `frontend/src/TotalImageERP.jsx`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add import** (near other module imports):

```js
import CardFilesModule from './modules/card-files/CardFilesModule';
```

- [ ] **Step 2: Replace the list/search/group portion of renderCardFiles**

In `renderCardFiles`, replace the header (`{filtered.length} of …` + New Card File button) + search input + group `<select>` + the **left card list pane** with `<CardFilesModule>`, and KEEP the **right detail panel** (`selectedCardFile` → card info + related jobs) AND the create/edit modal (`cardFileModal.open && (...)`) at the end. Target shape:

```jsx
  const renderCardFiles = () => {
    const card = selectedCardFile;
    const relatedJobs = card ? jobs.filter(j => j.shipTo === card.shipCode) : [];
    return (
      <>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ flex: '0 0 46%', minWidth: 0 }}>
            <CardFilesModule
              cardFiles={cardFiles}
              search={cardFileSearch}
              group={cardFileGroup}
              onSearchChange={setCardFileSearch}
              onGroupChange={setCardFileGroup}
              selectedId={selectedCardFile?.shipCode ?? null}
              onSelectCard={(c) => setSelectedCardFile(c)}
              onNewCard={() => setCardFileModal({ open: true, editing: null })}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* ...EXISTING detail panel (selectedCardFile ? card info + relatedJobs : empty), verbatim... */}
          </div>
        </div>
        {/* ...EXISTING cardFileModal.open && (...) modal, verbatim... */}
      </>
    );
  };
```

CAUTION: Read the full `renderCardFiles` first (6603 to its closing `};`). Keep the `card`/`relatedJobs` locals the detail panel needs (or compute them as shown). Preserve the detail panel and the `cardFileModal` block verbatim. Only the header + search + group select + the left list-of-buttons are removed (CardFilesModule replaces them). The old `uniqueCfGroups`/`filtered` locals are removed (CardFilesModule computes its own). If `setCardFileForm` is set when opening the New Card modal in the original code, replicate that in `onNewCard` (check the original `New Card File` button's onClick — if it does more than `setCardFileModal`, mirror it exactly; e.g. it may reset `cardFileForm`).

- [ ] **Step 3: Verify**

- `cd frontend && npm test` — all green; `cd frontend && npm run build` — succeeds.
- `grep -n "renderCardFiles" frontend/src/TotalImageERP.jsx` still shows the function + dispatch; old `uniqueCfGroups`/`filtered` list code is gone.
- Dev-server smoke (backend :8000, `npm run dev`): Card Files tab → search + group select + DataGrid list; clicking a row shows the detail panel (card info + related jobs) on the right; group select filters; New Card File opens the modal; no console errors.

- [ ] **Step 4: Update CLAUDE.md** "Key architecture": append after the customers bullet:

```markdown
- `frontend/src/modules/card-files/` — Card Files module (CardFilesModule list + search/group, cardFileFilters); detail panel + create/edit modal stay in the monolith
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/TotalImageERP.jsx CLAUDE.md
git commit -m "feat: Card Files list/search/group on CardFilesModule primitives; detail panel + modal unchanged"
```

---

## Known deferrals

- **Card detail panel** (card info + related jobs) and the **create/edit modal** stay old-styled, wired to monolith state. Re-skinning is a follow-up; they work as-is.
- If the New Card File button's original onClick resets `cardFileForm`, that reset must be mirrored in `onNewCard` (verify in Task 3 Step 2).
