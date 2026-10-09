import { render, screen, fireEvent, within } from '@testing-library/react';
import ActionBar from '../shell/ActionBar';
import { pageActions } from '../shell/pageActions';

const noop = () => {};
const ctx = (over = {}) => ({
  activeModule: 'jobs', showJobDetail: false, activeJob: null,
  newJob: vi.fn(), openDispatch: noop, openSalesRegister: noop, createJobList: noop, exportJobs: noop,
  duplicateToSites: vi.fn(), unprint: vi.fn(),
  newPO: noop, editPO: noop, createPOList: noop, newCardFile: noop, editCardFile: noop,
  newStockItem: noop, openTransfer: noop, openAdjust: noop, openStocktake: noop, openWarehouse: noop,
  openStockFlow: noop, createStockList: noop, newCustomer: noop, newSupplier: noop,
  inventory: [], jobs: [], exportToCSV: vi.fn(), notify: vi.fn(),
  ...over,
});
const keys = (page) => page.actions.map((a) => a.key);

describe('pageActions', () => {
  test('the jobs list offers list actions, with New job as the one primary', () => {
    const page = pageActions(ctx());
    expect(page.title).toBe('Jobs');
    expect(keys(page)).toEqual(['new', 'dispatch', 'salesRegister', 'createList', 'export']);
    expect(page.actions.filter((a) => a.primary).map((a) => a.label)).toEqual(['New job']);
  });

  test('record actions appear on the job record only, never on the list', () => {
    expect(keys(pageActions(ctx()))).not.toContain('toSites');
    const page = pageActions(ctx({ showJobDetail: true, activeJob: { id: '1207505', status: 'PRINT' } }));
    expect(page.title).toBe('Job 1207505');
    expect(keys(page)).toEqual(['toSites']);
  });

  test('unprint is offered only on an invoiced job', () => {
    const invoiced = pageActions(ctx({ showJobDetail: true, activeJob: { id: 'J1', status: 'INVOICE' } }));
    expect(keys(invoiced)).toContain('unprint');
  });

  test('a page with nothing to offer gets no bar', () => {
    for (const m of ['scheduling', 'email', 'import', 'settings', 'user-management', 'warehouse', 'reports', 'dashboard']) {
      expect(pageActions(ctx({ activeModule: m }))).toBeNull();
    }
  });

  test('editing a purchase order is offered only when one is selected', () => {
    expect(keys(pageActions(ctx({ activeModule: 'purchase-orders' })))).not.toContain('edit');
    expect(keys(pageActions(ctx({ activeModule: 'purchase-orders', selectedPO: { id: 'PO-1' } })))).toContain('edit');
  });

  test('the low-stock export uses the shared projected-stock rule', () => {
    const c = ctx({
      activeModule: 'inventory',
      inventory: [
        // 5 on hand, 0 committed, 10 on PO, min 8: projected 15 — not low,
        // though on hand alone (5) is under the minimum.
        { sku: 'A', name: 'a', stock: 5, committed_qty: 0, on_order_qty: 10, min_stock: 8 },
        { sku: 'B', name: 'b', stock: 2, committed_qty: 0, on_order_qty: 0, min_stock: 8 },
      ],
    });
    const exportMenu = pageActions(c).actions.find((a) => a.key === 'reports');
    exportMenu.items.find((i) => i.label === 'Low stock / reorder').onClick();
    expect(c.exportToCSV.mock.calls[0][0].map((r) => r.code)).toEqual(['B']);
  });
});

describe('ActionBar', () => {
  test('shows the title and runs an action', () => {
    const page = pageActions(ctx());
    render(<ActionBar {...page} />);
    expect(screen.getByRole('heading', { name: 'Jobs' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /New job/ }));
    expect(page.actions[0].onClick).toHaveBeenCalled();
  });

  test('a menu opens, runs its item and closes; Escape closes it', () => {
    const c = ctx({ activeModule: 'inventory', inventory: [{ sku: 'A', name: 'a', stock: 1 }] });
    render(<ActionBar {...pageActions(c)} />);
    const trigger = screen.getByRole('button', { name: /Export/ });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Stock valuation' }));
    expect(c.exportToCSV).toHaveBeenCalledWith(expect.any(Array), 'stock-valuation');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
