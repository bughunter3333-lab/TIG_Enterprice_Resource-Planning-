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
