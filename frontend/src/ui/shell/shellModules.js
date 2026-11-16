import {
  BarChart3, Boxes, CalendarDays, ClipboardList, Contact, Factory, FileText, Home, Landmark, ListChecks,
  Mail, ScanLine, Shirt, ShoppingCart, TrendingUp, Truck, Undo2, Upload, Users,
} from 'lucide-react';
import { areaView } from '../../lib/access';

// The modules, in the sidebar's groups. Same ids as ever — navigation is
// unchanged. `area` is the module's business area in the server's access table
// (AREAS in backend/app/core/access.py). Home has none: everyone has a Home.
// Every built screen has an entry: Scheduling, Order requirements, Suppliers,
// Styles, Email, Analytics and Import were mounted but reachable only by
// search or a Home tile, or not at all.
export const MODULE_GROUPS = [
  {
    label: 'Work',
    modules: [
      { id: 'home', label: 'Home', icon: Home },
      { id: 'jobs', label: 'Jobs', icon: ClipboardList, badgeKey: 'jobCount', area: 'Jobs and quotes' },
      { id: 'quotes', label: 'Quotes', icon: FileText, badgeKey: 'quoteCount', area: 'Jobs and quotes' },
      // Who has which work on the floor, by lane (docs/superpowers/specs/2026-11-07-production-board.md).
      { id: 'production', label: 'Production', icon: Factory, area: 'Jobs and quotes' },
      // Picking at the shelf, on a phone (docs/superpowers/specs/2026-11-09-phone-picking.md).
      { id: 'picking', label: 'Picking', icon: ScanLine, area: 'Jobs and quotes' },
      { id: 'scheduling', label: 'Scheduling', icon: CalendarDays, area: 'Jobs and quotes' },
    ],
  },
  {
    label: 'Operations',
    modules: [
      { id: 'purchase-orders', label: 'Purchases', icon: ShoppingCart, area: 'Purchasing' },
      { id: 'order-requirements', label: 'Order requirements', icon: ListChecks, area: 'Purchasing' },
      { id: 'suppliers', label: 'Suppliers', icon: Truck, area: 'Purchasing' },
      { id: 'inventory', label: 'Stock', icon: Boxes, area: 'Stock' },
      // Goods back on credit notes, waiting at RET (docs/superpowers/specs/2026-11-09-returns-credit-notes.md).
      { id: 'returns', label: 'Returns', icon: Undo2, area: 'Stock' },
      { id: 'styles', label: 'Styles', icon: Shirt, area: 'Stock' },
    ],
  },
  {
    label: 'Relationships',
    modules: [
      { id: 'customers', label: 'Customers', icon: Users, area: 'Customers' },
      { id: 'card-files', label: 'Card Files', icon: Contact, area: 'Card files' },
      { id: 'email', label: 'Email', icon: Mail, area: 'Email' },
    ],
  },
  {
    label: 'Finance',
    modules: [
      { id: 'accounts', label: 'Accounts', icon: Landmark, area: 'Accounts' },
      { id: 'reports', label: 'Reports', icon: BarChart3, area: 'Reports' },
      { id: 'analytics', label: 'Analytics', icon: TrendingUp, area: 'Reports' },
    ],
  },
  {
    label: 'Data',
    modules: [
      { id: 'import', label: 'Import', icon: Upload, area: 'System settings' },
    ],
  },
];

export const MODULES = MODULE_GROUPS.flatMap((g) => g.modules);

// A module is hidden only when the role can read nothing in its area — counted
// from the gates on the server's routes, not decided from the role's name. An
// area the table does not list is not a "nothing", so its module stays.
const readable = (access) => (m) => !m.area || (areaView(access, m.area)?.[0] ?? 1) > 0;

/**
 * The groups to draw, each with the modules this person may open: none while
 * their access is loading (rather than items that then vanish), every one if
 * it cannot be loaded — the server still enforces every route — and otherwise
 * the ones the role can read in. Empty groups are dropped.
 */
export function shownGroups(access, failed) {
  const keep = access ? readable(access) : () => failed;
  return MODULE_GROUPS
    .map((g) => ({ ...g, modules: g.modules.filter(keep) }))
    .filter((g) => g.modules.length > 0);
}

/** Whether a module is the one open: the 3D warehouse is part of Stock. */
export function isActive(moduleId, activeModule) {
  return activeModule === moduleId || (moduleId === 'inventory' && activeModule === 'warehouse');
}
