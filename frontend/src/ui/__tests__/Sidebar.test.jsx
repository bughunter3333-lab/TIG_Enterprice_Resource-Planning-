/**
 * The sidebar: the modules a role may open, in their groups, with counts; the
 * open one lit; folded to an icon rail on request. (These rules were the
 * module bar's; the modules moved from a top tab strip to the sidebar.)
 */
import { screen, fireEvent, within } from '@testing-library/react';
import { renderWithQuery } from '../../test/renderWithQuery';
import { users } from '../../api';
import Sidebar from '../shell/Sidebar';

vi.mock('../../api', () => ({
  users: { myAccess: vi.fn() },
}));

const base = {
  activeModule: 'jobs',
  onNavigate: vi.fn(),
  adminMode: false,
  currentUser: { username: 'em', full_name: 'Em Tan', role: 'admin' },
  badges: { jobCount: 128, quoteCount: 6 },
};

const AREAS = ['Jobs and quotes', 'Purchasing', 'Stock', 'Card files', 'Customers', 'Accounts', 'Reports'];
const access = ({ unreadable = [] } = {}) => ({
  role: 'staff',
  areas: AREAS.map((area) => ({ area, view: [unreadable.includes(area) ? 0 : 5, 5], change: [0, 5] })),
  allowed: ['GET /jobs'],
});

// In sidebar order: Work, Operations, Relationships, Finance.
const ALL = ['Home', 'Jobs', 'Quotes', 'Purchases', 'Stock', 'Customers', 'Card Files', 'Accounts', 'Reports'];
const items = () => within(screen.getByRole('navigation', { name: 'Spaces' })).queryAllByRole('button')
  .map((b) => b.textContent.replace(/\d+$/, ''));

const open = (props = {}, options) => renderWithQuery(<Sidebar {...base} {...props} />, options);

beforeEach(() => {
  vi.clearAllMocks();
  users.myAccess.mockResolvedValue(access());
});

test('navigates on a module and shows its count', async () => {
  open();
  fireEvent.click(await screen.findByText('Stock'));
  expect(base.onNavigate).toHaveBeenCalledWith('inventory');
  expect(screen.getByText('128')).toBeInTheDocument();
});

test('Home comes first, and is lit on Home', async () => {
  open({ activeModule: 'home' });
  const home = await screen.findByRole('button', { name: 'Home' });
  expect(items()[0]).toBe('Home');
  expect(home).toHaveAttribute('aria-current', 'page');
});

test('Stock stays lit in the 3D warehouse, and nothing is lit in admin', async () => {
  const { unmount } = open({ activeModule: 'warehouse' });
  expect(await screen.findByRole('button', { name: 'Stock' })).toHaveAttribute('aria-current', 'page');
  unmount();
  open({ adminMode: true });
  await screen.findByText('Reports');
  expect(screen.queryByRole('button', { current: 'page' })).toBeNull();
});

describe('which modules a role sees', () => {
  test('every module whose area the role can read in', async () => {
    open();
    await screen.findByText('Reports');
    expect(items()).toEqual(ALL);
  });

  test('a module is hidden when its area has nothing the role can read', async () => {
    users.myAccess.mockResolvedValue(access({ unreadable: ['Accounts', 'Purchasing'] }));
    open();
    await screen.findByText('Reports');
    expect(items()).toEqual(['Home', 'Jobs', 'Quotes', 'Stock', 'Customers', 'Card Files', 'Reports']);
  });

  test('Jobs and Quotes share their area', async () => {
    users.myAccess.mockResolvedValue(access({ unreadable: ['Jobs and quotes'] }));
    open();
    await screen.findByText('Reports');
    expect(items()).not.toContain('Jobs');
    expect(items()).not.toContain('Quotes');
  });

  test('an area the table does not list keeps its module', async () => {
    users.myAccess.mockResolvedValue({ ...access(), areas: [] });
    open();
    await screen.findByText('Reports');
    expect(items()).toEqual(ALL);
  });

  test('no modules while access is loading', () => {
    users.myAccess.mockReturnValue(new Promise(() => {}));
    open();
    expect(items()).toEqual([]);
  });

  test('every module when access cannot be loaded — the server still enforces each route', async () => {
    users.myAccess.mockRejectedValue(new Error('down'));
    open({}, { allowQueryErrors: true });
    await screen.findByText('Reports');
    expect(items()).toEqual(ALL);
  });
});

test('folds to an icon rail and back', async () => {
  const onToggleCollapsed = vi.fn();
  const { unmount } = open({ onToggleCollapsed });
  fireEvent.click(await screen.findByLabelText('Collapse sidebar'));
  expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  unmount();
  open({ collapsed: true, onToggleCollapsed });
  // Folded: the modules keep their names as tooltips, the labels go.
  expect(await screen.findByTitle('Stock')).toBeInTheDocument();
  expect(screen.queryByText('Em Tan')).toBeNull();
  fireEvent.click(screen.getByLabelText('Expand sidebar'));
  expect(onToggleCollapsed).toHaveBeenCalledTimes(2);
});

test('says who is signed in', () => {
  open();
  expect(screen.getByText('Em Tan')).toBeInTheDocument();
  expect(screen.getByText('admin')).toBeInTheDocument();
});
