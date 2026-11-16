import { render, screen, fireEvent } from '@testing-library/react';
import JobCard from '../JobCard';
import JobsBoard from '../JobsBoard';

const job = { id: '42', status: 'PRINT', customer: 'Acme Inc', due: '12/06/2026', total: 500, items: [] };

test('invokes onClick when the card is clicked', () => {
  const onClick = vi.fn();
  render(<JobCard job={job} onClick={onClick} />);
  fireEvent.click(screen.getByRole('button'));
  expect(onClick).toHaveBeenCalledTimes(1);
});

test('invokes onClick on Enter and Space keydown', () => {
  const onClick = vi.fn();
  render(<JobCard job={job} onClick={onClick} />);
  const card = screen.getByRole('button');
  fireEvent.keyDown(card, { key: 'Enter' });
  fireEvent.keyDown(card, { key: ' ' });
  expect(onClick).toHaveBeenCalledTimes(2);
});

test('a job past its due day says so, in either stored date shape', () => {
  render(<JobCard job={{ ...job, due: '2020-01-05' }} />);
  expect(screen.getByText(/overdue · 5 jan 2020/i)).toBeInTheDocument();
});

test('a job whose goods have gone is never overdue', () => {
  for (const status of ['FINISH', 'INVOICE', 'PAID']) {
    const { unmount } = render(<JobCard job={{ ...job, status, due: '05/01/2020' }} />);
    expect(screen.queryByText(/overdue/i)).not.toBeInTheDocument();
    unmount();
  }
});

test('the board has a column for a booked order (New), named as TIG says it', () => {
  render(<JobsBoard jobs={[{ ...job, status: 'New' }]} onJobClick={() => {}} />);
  expect(screen.getByRole('region', { name: 'Booked, 1 job' })).toHaveTextContent('Acme Inc');
});

test("the board has a column for each of TIG's floor steps", () => {
  render(<JobsBoard jobs={[]} onJobClick={() => {}} />);
  for (const name of ['Picked', 'Inco/Pick', 'ProdExt', 'Ready to invoice']) {
    expect(screen.getByRole('region', { name: `${name}, 0 jobs` })).toBeInTheDocument();
  }
});

test('does not throw when onClick is omitted', () => {
  render(<JobCard job={job} />);
  const card = screen.getByRole('button');
  expect(() => {
    fireEvent.click(card);
    fireEvent.keyDown(card, { key: 'Enter' });
  }).not.toThrow();
});
