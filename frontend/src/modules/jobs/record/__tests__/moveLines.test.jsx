/**
 * Moving lines to another job (docs/superpowers/specs/2026-11-08-move-lines.md):
 * only to the same customer's other open jobs; a garment takes its decoration;
 * nothing on order or already sent is offered.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import JobLinesCard from '../JobLinesCard';
import { isOpen, movable, moveTargets, whyNotMovable } from '../moveLines';

const job = (id, extra = {}) => ({ id, customerId: 'C1', status: 'ORDER', locked: false, items: [], ...extra });
const tee = { id: 1, displayType: 'product', stockCode: 'TEE', description: 'Tee', order: 4, supply: 4, priceEx: 10, total: 40 };
const logo = { id: 2, displayType: 'product', stockCode: 'EMB.X', description: 'Logo', isService: true, order: 4, supply: 4, total: 12 };
const onOrder = { id: 3, displayType: 'product', stockCode: 'CAP', description: 'Cap', poNo: 'PO-9', bOrd: 2, order: 2, supply: 0, total: 0 };

test("the lines go only to the same customer's other open jobs, newest first", () => {
  const here = job('1001');
  const jobs = [
    here,
    job('1002'),
    job('1005', { status: 'New' }),
    job('1003', { customerId: 'C2' }),
    job('1004', { status: 'INVOICE' }),
    job('1006', { status: 'Ready' }),
    job('1007', { locked: true }),
  ];
  expect(moveTargets(jobs, here).map((j) => j.id)).toEqual(['1005', '1002']);
  expect(moveTargets(jobs, job('1008', { status: 'PAID' }))).toEqual([]);
  expect(isOpen(job('x', { status: 'QUOTE' }))).toBe(true);
});

test('a decoration, a line on order or one sent cannot be ticked, and says why', () => {
  expect(movable(tee)).toBe(true);
  expect(movable(logo)).toBe(false);
  expect(whyNotMovable(logo)).toMatch(/goes with its garment/);
  expect(movable(onOrder)).toBe(false);
  expect(whyNotMovable(onOrder)).toMatch(/On order \(PO-9\)/);
  expect(movable({ ...tee, qtyDelivered: 1 })).toBe(false);
  expect(movable({ ...tee, displayType: 'section' })).toBe(false);
});

test('tick a line, choose the job, move it', async () => {
  const onMoveLines = vi.fn(async () => {});
  render(
    <JobLinesCard
      job={job('1001', { items: [tee, logo, onOrder] })}
      onOpenPO={() => {}}
      moveTargets={[job('1002', { custRef: 'Branch order' }), job('1005')]}
      onMoveLines={onMoveLines}
    />,
  );
  expect(screen.queryByRole('checkbox', { name: /EMB.X/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: /CAP/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: /Move line 1, TEE/ }));
  fireEvent.click(screen.getByRole('button', { name: /Move 1 to job/ }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('radio', { name: /1005/ }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Move to job 1005' }));
  await waitFor(() => expect(onMoveLines).toHaveBeenCalledWith([1], '1005'));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('a move the server refuses says why and keeps the dialog', async () => {
  const onMoveLines = vi.fn(async () => { throw new Error('Line 1 has gone out on a despatch.'); });
  render(<JobLinesCard job={job('1001', { items: [tee] })} onOpenPO={() => {}} moveTargets={[job('1002')]} onMoveLines={onMoveLines} />);
  fireEvent.click(screen.getByRole('checkbox', { name: /Move line 1/ }));
  fireEvent.click(screen.getByRole('button', { name: /Move 1 to job/ }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: /Move to job 1002/ }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('gone out on a despatch');
});

test('with nowhere to move them, or no right to, the lines have no ticks', () => {
  const { rerender } = render(<JobLinesCard job={job('1001', { items: [tee] })} onOpenPO={() => {}} moveTargets={[]} onMoveLines={vi.fn()} />);
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  rerender(<JobLinesCard job={job('1001', { items: [tee] })} onOpenPO={() => {}} moveTargets={[job('1002')]} />);
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});

test('ticks belong to the job: another job starts with none', () => {
  const props = { onOpenPO: () => {}, moveTargets: [job('1003')], onMoveLines: vi.fn() };
  const { rerender } = render(<JobLinesCard job={job('1001', { items: [tee] })} {...props} />);
  fireEvent.click(screen.getByRole('checkbox'));
  expect(screen.getByRole('checkbox')).toBeChecked();
  rerender(<JobLinesCard job={job('1002', { items: [{ ...tee, id: 99 }] })} {...props} />);
  expect(screen.getByRole('checkbox')).not.toBeChecked();
});
