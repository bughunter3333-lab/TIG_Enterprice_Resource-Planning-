/**
 * A pinned comment stays at the top of the job's trail (Jim2 v4.6), above the
 * newest-first rest, and any comment can be pinned or let go from the card.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import JobCommentsCard from '../JobCommentsCard';

const job = {
  id: '110001',
  comments: [
    { id: 1, comment: 'Logo 5mm higher, please', authorName: 'Ann', date: '01/11/2026', time: '09:00', pinnedAt: null },
    { id: 2, comment: 'Booked from the online store', authorName: 'System', date: '02/11/2026', time: '10:00', pinnedAt: null },
    { id: 3, comment: 'Status moved to PRINT', authorName: 'System', date: '03/11/2026', time: '11:00', pinnedAt: null },
  ],
};

const texts = () => within(screen.getByRole('list')).getAllByRole('listitem').map(li => li.textContent);

test('newest first when nothing is pinned', () => {
  render(<JobCommentsCard job={job} onAdd={() => {}} onPin={() => {}} />);
  expect(texts()[0]).toMatch(/Status moved to PRINT/);
});

test('a pinned comment comes first, and says it is pinned', () => {
  const pinned = { ...job, comments: job.comments.map(c => (c.id === 1 ? { ...c, pinnedAt: '2026-11-03T00:00:00Z' } : c)) };
  render(<JobCommentsCard job={pinned} onAdd={() => {}} onPin={() => {}} />);
  expect(texts()[0]).toMatch(/Logo 5mm higher/);
  expect(screen.getByRole('button', { name: 'Unpin comment' })).toBeInTheDocument();
});

test('pinning and unpinning go to the caller', () => {
  const onPin = vi.fn();
  render(<JobCommentsCard job={job} onAdd={() => {}} onPin={onPin} />);
  fireEvent.click(screen.getAllByRole('button', { name: 'Pin comment' })[2]); // oldest, last
  expect(onPin).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), true);
});

test('no pin buttons where pinning is not offered', () => {
  render(<JobCommentsCard job={job} onAdd={() => {}} />);
  expect(screen.queryByRole('button', { name: 'Pin comment' })).toBeNull();
});
