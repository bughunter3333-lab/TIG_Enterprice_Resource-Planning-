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
