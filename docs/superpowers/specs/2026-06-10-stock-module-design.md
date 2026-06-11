# Stock Module Implementation Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a full Jim2-parity Stock module — master/detail split layout with 5 tabs (Details, Locations, Pricing, Transactions, Committed), multi-branch location tracking, price levels with qty breakpoints, and stock movement history linked to jobs and POs.

**Architecture:** Additive backend schema — keep `InventoryItem.stock` + `committed_qty` as aggregate totals (backwards compat with job form and other modules), add `stock_locations` for branch detail, `stock_price_levels` + `stock_price_breakpoints` for pricing, extend `StockMovement` with optional job/PO FKs. Frontend: extract `renderInventory()` from `TotalImageERP.jsx` into a dedicated `StockModule` component tree with master/detail split.

**Tech Stack:** React 18 + Vite + TanStack Query v5 (JSX, inline styles), FastAPI + SQLAlchemy + Alembic + PostgreSQL, pytest (SQLite in-memory for tests).

---

## Current State

- `InventoryItem` model: `sku`, `name`, `category`, `supplier`, `stock`, `min_stock`, `reorder_qty`, `on_order_qty`, `weight_kg`, `committed_qty`, `unit_cost`, `sell_price`, `location` (single string), `status`, `style_id`, `colour_code`, `size_code`
- `StockMovement` model: `id`, `sku`, `date`, `type`, `quantity`, `reference`, `notes`, `created_at`
- Existing router: `GET/POST /inventory`, `GET/PATCH/DELETE /inventory/{sku}`, `POST /inventory/{sku}/adjust`, `POST /inventory/transfer`, `POST /inventory/stocktake`, `POST /inventory/auto-reorder`
- Frontend: `renderInventory()` inline function in `TotalImageERP.jsx` (~400 lines) — a flat table with KPI strip

---

## Backend Schema Changes

### 1. Extend `InventoryItem` (new columns, all nullable)

```python
# Jim2 item detail fields
item_type = Column(String(30), default="Depleting")   # Depleting / Non-Depleting / Service / Matrix
gl_group = Column(String(100), nullable=True)
barcode = Column(String(100), nullable=True)
buy_unit = Column(String(20), nullable=True)           # e.g. "UNIT"
sell_unit = Column(String(20), nullable=True)
buy_tax_pct = Column(Numeric(5, 2), default=10)
sell_tax_pct = Column(Numeric(5, 2), default=10)

# Cost tracking (updated on purchase receipt)
last_cost = Column(Numeric(10, 4), nullable=True)
last_cog = Column(Numeric(10, 4), nullable=True)
avg_cost = Column(Numeric(10, 4), nullable=True)
avg_cog = Column(Numeric(10, 4), nullable=True)
max_cog = Column(Numeric(10, 4), nullable=True)
last_po_cogs = Column(Numeric(10, 4), nullable=True)
avg_po_cogs = Column(Numeric(10, 4), nullable=True)
last_ex = Column(Numeric(10, 4), nullable=True)        # last sell price ex-tax
last_effective_date = Column(String(20), nullable=True) # DD/MM/YYYY
price_template = Column(String(100), nullable=True)
```

### 2. New `stock_locations` table

```python
class StockLocation(Base):
    __tablename__ = "stock_locations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sku = Column(String(50), ForeignKey("inventory.sku", ondelete="CASCADE"), nullable=False, index=True)
    branch = Column(String(50), nullable=False)         # e.g. "HQ", "MELB", "3PLP"
    zone = Column(String(20), nullable=True)
    qty_on_hand = Column(Integer, default=0)
    committed_qty = Column(Integer, default=0)
    backorder_qty = Column(Integer, default=0)
    on_po_qty = Column(Integer, default=0)
    primary_bin_1 = Column(String(50), nullable=True)
    max_qty_bin_1 = Column(Integer, nullable=True)
    primary_bin_2 = Column(String(50), nullable=True)
    max_qty_bin_2 = Column(Integer, nullable=True)

    __table_args__ = (UniqueConstraint("sku", "branch"),)

    @property
    def available_qty(self):
        return max(0, (self.qty_on_hand or 0) - (self.committed_qty or 0))
```

### 3. New `stock_price_levels` table

```python
class StockPriceLevel(Base):
    __tablename__ = "stock_price_levels"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sku = Column(String(50), ForeignKey("inventory.sku", ondelete="CASCADE"), nullable=False, index=True)
    price_level = Column(String(50), nullable=False)    # e.g. "1-Price A"
    price_calc_method = Column(String(50), default="Fixed Price")
    base_pl = Column(String(50), nullable=True)
    currency = Column(String(10), default="AUD")
    tax_code = Column(String(10), default="G")

    breakpoints = relationship("StockPriceBreakpoint", back_populates="level", cascade="all, delete-orphan")
    __table_args__ = (UniqueConstraint("sku", "price_level"),)
```

### 4. New `stock_price_breakpoints` table

```python
class StockPriceBreakpoint(Base):
    __tablename__ = "stock_price_breakpoints"

    id = Column(Integer, primary_key=True, autoincrement=True)
    price_level_id = Column(Integer, ForeignKey("stock_price_levels.id", ondelete="CASCADE"), nullable=False)
    min_qty = Column(Integer, default=0)                # >= qty threshold
    price_ex = Column(Numeric(10, 4), nullable=False)
    price_inc = Column(Numeric(10, 4), nullable=False)
    pont_pct = Column(Numeric(5, 2), nullable=True)     # Pont% markup

    level = relationship("StockPriceLevel", back_populates="breakpoints")
```

### 5. Extend `StockMovement` (nullable columns, no breaking changes)

```python
# Add to existing StockMovement model:
job_id = Column(Integer, ForeignKey("jobs.id"), nullable=True, index=True)
po_id = Column(String(50), ForeignKey("purchase_orders.id"), nullable=True)
po_line = Column(Integer, nullable=True)
location_branch = Column(String(50), nullable=True)
qty_bal = Column(Integer, nullable=True)               # running balance after movement
pack_num = Column(String(50), nullable=True)
bin = Column(String(50), nullable=True)
link_tran_id = Column(Integer, ForeignKey("stock_movements.id"), nullable=True)
link_gl = Column(String(50), nullable=True)
```

---

## API Endpoints

All new endpoints added to `backend/app/routers/inventory.py`.

### Item Detail (extend existing PATCH)
`PATCH /inventory/{sku}` — extend `InventoryUpdate` schema to include all new Detail fields.

### Locations
```
GET  /inventory/{sku}/locations           → list of StockLocation rows
POST /inventory/{sku}/locations           → create branch row
PATCH /inventory/{sku}/locations/{branch} → update branch qtys / bins
DELETE /inventory/{sku}/locations/{branch}→ remove branch row
```

### Pricing
```
GET /inventory/{sku}/pricing              → cost tracking fields + all price levels with breakpoints
PUT /inventory/{sku}/pricing/cost         → update cost tracking fields only
POST   /inventory/{sku}/pricing/levels              → create price level + breakpoints
PUT    /inventory/{sku}/pricing/levels/{level_id}   → replace price level + breakpoints
DELETE /inventory/{sku}/pricing/levels/{level_id}   → remove price level
```

### Transactions
```
GET /inventory/{sku}/transactions?limit=50&offset=0 → paginated StockMovement rows with job/PO data joined
```

Response shape per row:
```json
{
  "id": 7930572,
  "date": "05/06/2026",
  "type": "Sale",
  "reference": "1201766",
  "location_branch": "HQ",
  "quantity": -5,
  "qty_bal": 0,
  "po_id": "2050787",
  "po_line": 4,
  "job_id": 1201766,
  "job_ref": "1201766",
  "pack_num": null,
  "bin": "Floor"
}
```

### Committed
```
GET /inventory/{sku}/committed → active job items where stock_code = sku
```

Queries `job_items` JOIN `jobs` WHERE `stock_code = sku` AND `job.status NOT IN ('PAID', 'CANCEL')`.

Response shape per row:
```json
{
  "card_code": "ONSIT",
  "customer_name": "Onsite Rental Group",
  "job_ref": "1207747",
  "job_id": 1207747,
  "date": "10/06/2026",
  "location_branch": "HQ",
  "qty": 5,
  "unit": "UNIT",
  "price_ex": 58.00,
  "price_inc": 63.80,
  "currency": "AUD",
  "total_aud": 319.00
}
```

---

## Frontend Architecture

```
frontend/src/components/stock/
  StockModule.jsx              ← master/detail layout, holds selectedSku state
  StockList.jsx                ← left panel: search, filter chips, item rows
  StockDetailPanel.jsx         ← right panel: header + tabs
  tabs/
    StockDetailsTab.jsx        ← Detail fields + qty summary strip
    StockLocationsTab.jsx      ← branch × qty grid, editable bins
    StockPricingTab.jsx        ← cost tracking section + price levels table
    StockTransactionsTab.jsx   ← paginated movement history, clickable job/PO refs
    StockCommittedTab.jsx      ← committed stock table, clickable job refs
```

### StockModule.jsx
- State: `selectedSku` (string | null)
- Layout: `display: flex`, left panel 42% / right panel 58%
- Reuses the existing `useQuery(['inventory'])` from `TotalImageERP.jsx` via props (`jobs={jobs}` passed down so `StockModule` doesn't need its own jobs query)

### StockList.jsx
- Props: `items` (from inventory query), `selectedSku`, `onSelect`
- Filter chips: All / Low Stock / Out of Stock
- Search by SKU, name, category, supplier
- Each row: SKU (bold), description (truncated), category, qty badge (OK/LOW/OUT)
- Selected row: blue left border + light blue background

### StockDetailPanel.jsx
- Props: `sku` (string)
- Fetches item detail: `useQuery(['inventory', sku])`
- Tab state: `activeTab` ∈ ['details', 'locations', 'pricing', 'transactions', 'committed']
- Each tab component mounts only when active (lazy data fetch)
- Header: SKU, description, type · GL group — Edit button + Adjust Stock button

### StockDetailsTab.jsx
- Props: `item` (full InventoryItem object)
- Shows: Code, Type, GL Group, Description, Barcode, Buy Unit + tax%, Sell Unit + tax%
- Qty summary strip: On Hand / Committed / Available / Backorder / On PO (summed across all branches)
- Edit mode: inline form toggled by Edit button in panel header

### StockLocationsTab.jsx
- Query: `useQuery(['stock-locations', sku], () => api.stock.locations(sku))`
- Table: Branch | Zone | On Hand | Committed | Available | Backorder | On PO | Primary Bin 1 | Max | Primary Bin 2 | Max
- Editable cells for bin fields; qty changes go through adjust endpoint
- Add branch row button at bottom

### StockPricingTab.jsx
- Query: `useQuery(['stock-pricing', sku], () => api.stock.pricing(sku))`
- Top section: cost tracking grid (Last Cost, Last COG, Max COG, Last PO COGS / Avg Cost, Avg COG, Avg PO COGS / Last Ex., Last Effective Date, Price Template)
- Bottom section: price levels table — one card per price level showing method, currency, tax code, and breakpoint rows (>=Qty | Price Ex. | Price Inc. | Pont%)
- Add price level button; edit/delete per level

### StockTransactionsTab.jsx
- Query: `useQuery(['stock-transactions', sku], () => api.stock.transactions(sku, { limit: 100 }))`
- Table: Tran# | Date | Type | Ref# | Loc | Qty | Qty Bal | PO# | Job# | Pack# | Bin
- Job# cell: clickable → calls `onNavigateJob(job_id)` prop (navigates to Jobs module)
- PO# cell: clickable → calls `onNavigatePO(po_id)` prop (navigates to Purchase Orders module)
- Type badge: colour-coded (Sale = purple, Purchase = green, Adjustment = blue, Transfer = teal)

### StockCommittedTab.jsx
- Query: `useQuery(['stock-committed', sku], () => api.stock.committed(sku))`
- Table: Card Code | Customer Name | Job# | Date | Loc | Qty | Unit | Price Ex | Price Inc | Curr | Total (AUD)
- Job# cell: clickable → `onNavigateJob(job_id)`

---

## Data Flow

```
TotalImageERP.jsx
  └─ activeModule === 'inventory'
      └─ <StockModule
           inventory={inventory}          ← existing query, no new list fetch
           onNavigateJob={fn}             ← sets activeModule='jobs', opens job
           onNavigatePO={fn}             ← sets activeModule='purchase-orders', opens PO
         />
           └─ <StockList items={inventory} selectedSku onSelect />
           └─ <StockDetailPanel sku={selectedSku} onNavigateJob onNavigatePO />
                └─ tabs fetch their own data lazily when active
```

`renderInventory()` in `TotalImageERP.jsx` is deleted and replaced with `<StockModule />`.

---

## api.js additions

```js
export const stock = {
  locations: (sku) => request(`/inventory/${encodeURIComponent(sku)}/locations`),
  updateLocation: (sku, branch, data) => request(`/inventory/${encodeURIComponent(sku)}/locations/${encodeURIComponent(branch)}`, { method: 'PATCH', body: data }),
  addLocation: (sku, data) => request(`/inventory/${encodeURIComponent(sku)}/locations`, { method: 'POST', body: data }),
  deleteLocation: (sku, branch) => request(`/inventory/${encodeURIComponent(sku)}/locations/${encodeURIComponent(branch)}`, { method: 'DELETE' }),
  pricing: (sku) => request(`/inventory/${encodeURIComponent(sku)}/pricing`),
  updateCost: (sku, data) => request(`/inventory/${encodeURIComponent(sku)}/pricing/cost`, { method: 'PUT', body: data }),
  addPriceLevel: (sku, data) => request(`/inventory/${encodeURIComponent(sku)}/pricing/levels`, { method: 'POST', body: data }),
  updatePriceLevel: (sku, id, data) => request(`/inventory/${encodeURIComponent(sku)}/pricing/levels/${id}`, { method: 'PUT', body: data }),
  deletePriceLevel: (sku, id) => request(`/inventory/${encodeURIComponent(sku)}/pricing/levels/${id}`, { method: 'DELETE' }),
  transactions: (sku, params = {}) => request(`/inventory/${encodeURIComponent(sku)}/transactions?limit=${params.limit || 100}&offset=${params.offset || 0}`),
  committed: (sku) => request(`/inventory/${encodeURIComponent(sku)}/committed`),
};
```

---

## Testing

All tests use SQLite in-memory (existing conftest pattern).

**Unit tests** (`tests/unit/test_stock_pricing.py`):
- `test_available_qty_computed_correctly` — StockLocation.available_qty property
- `test_price_breakpoint_lookup` — given qty, returns correct price tier

**Integration tests** (`tests/integration/test_stock_module.py`):
- `test_locations_crud` — create, read, update, delete branch rows
- `test_pricing_crud` — create price level + breakpoints, update, delete
- `test_transactions_with_job_fk` — movement created with job_id, returned in list
- `test_committed_query` — job item with matching stock_code appears in committed endpoint
- `test_inventory_update_new_fields` — PATCH /inventory/{sku} updates item_type, gl_group, barcode
