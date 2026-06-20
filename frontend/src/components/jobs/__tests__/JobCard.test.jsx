import { render, screen, fireEvent } from '@testing-library/react';
import JobCard from '../JobCard';

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

test('does not throw when onClick is omitted', () => {
  render(<JobCard job={job} />);
  const card = screen.getByRole('button');
  expect(() => {
    fireEvent.click(card);
    fireEvent.keyDown(card, { key: 'Enter' });
  }).not.toThrow();
});
