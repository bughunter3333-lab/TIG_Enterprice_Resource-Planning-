import { screen, fireEvent } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import AdminPanel from '../AdminPanel';
import * as api from '../../../api';

// Company Settings used to be a module no menu could open, so the company's
// own details, bank account and email server had no screen at all. It lives in
// Admin now; this keeps it reachable.
vi.mock('../../../api', () => ({
  users: { list: vi.fn(), access: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), resetPassword: vi.fn() },
  adminSettings: { get: vi.fn(), set: vi.fn() },
  settings: { getCompany: vi.fn(), updateCompany: vi.fn(), testSmtp: vi.fn() },
}));

const ADMIN = { id: 1, username: 'admin', full_name: 'Admin', role: 'admin', is_active: true };

beforeEach(() => {
  vi.clearAllMocks();
  api.users.list.mockResolvedValue([ADMIN]);
  api.users.access.mockResolvedValue({ roles: ['admin'], areas: [] });
  api.adminSettings.get.mockResolvedValue({ value: null });
  api.settings.getCompany.mockResolvedValue({ company_name: 'Total Image Group', abn: '', phone: '', smtp_password: null });
});

test('Company Settings is a tab in Admin, and opens the company settings', async () => {
  renderWithQuery(<AdminPanel currentUser={ADMIN} />);

  fireEvent.click(screen.getByRole('button', { name: 'Company Settings' }));

  expect(await screen.findByDisplayValue('Total Image Group')).toBeInTheDocument();
  expect(api.settings.getCompany).toHaveBeenCalled();
});

test('no tab saves a setting nothing reads (Phase 0)', () => {
  renderWithQuery(<AdminPanel currentUser={ADMIN} />);
  for (const lying of ['Job Fields', 'Status Workflow', 'Price Levels', 'Decoration Types']) {
    expect(screen.queryByRole('button', { name: lying })).toBeNull();
  }
  for (const kept of ['Users and roles', 'Company Settings', 'Print Templates', 'Jim2 Migration']) {
    expect(screen.getByRole('button', { name: kept })).toBeInTheDocument();
  }
});
