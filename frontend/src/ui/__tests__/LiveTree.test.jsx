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
  // FINISH excluded from My Jobs/Overdue/Due Today by ACTIVE — pins the monolith-aligned rule
  { id: 'J5', status: 'FINISH', due: fmt(yesterday), accMgr: 'em' },
];

const base = {
  jobs,
  pinnedJobs: [{ id: 'J1', status: 'PRINT' }],
  currentUser: { username: 'em' },
  onOpenJob: vi.fn(),
  onUnpinJob: vi.fn(),
  onSelectList: vi.fn(),
};

test('shows individual open jobs under Jobs and fires onOpenJob on click', () => {
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

const savedLists = [
  { id: 'L1', name: 'Zone Bowling', jobs: [
    { id: '1200193', status: 'Desp/Ready' },
    { id: '1200201', status: 'Desp/Ready' },
  ] },
];

test('saved list shows its live count and runs on click', () => {
  const onRunList = vi.fn();
  render(<LiveTree {...base} savedLists={savedLists} onRunList={onRunList} onDeleteList={vi.fn()} />);
  expect(screen.getByText('Zone Bowling').parentElement).toHaveTextContent('2');
  // members hidden until expanded
  expect(screen.queryByText('1200193')).toBeNull();
  fireEvent.click(screen.getByText('Zone Bowling'));
  expect(onRunList).toHaveBeenCalledWith('L1');
});

test('saved list caret expands to member jobs; clicking a member opens it', () => {
  const onOpenJob = vi.fn();
  render(<LiveTree {...base} onOpenJob={onOpenJob} savedLists={savedLists} onRunList={vi.fn()} onDeleteList={vi.fn()} />);
  const row = screen.getByText('Zone Bowling').closest('[role="button"]');
  fireEvent.click(row.firstChild); // the caret toggles expansion (not run)
  fireEvent.click(screen.getByText('1200193'));
  expect(onOpenJob).toHaveBeenCalledWith(expect.objectContaining({ id: '1200193' }));
});

test('saved list delete fires onDeleteList with its id', () => {
  const onDeleteList = vi.fn();
  render(<LiveTree {...base} savedLists={savedLists} onRunList={vi.fn()} onDeleteList={onDeleteList} />);
  fireEvent.click(screen.getByLabelText('Delete list Zone Bowling'));
  expect(onDeleteList).toHaveBeenCalledWith('L1');
});
