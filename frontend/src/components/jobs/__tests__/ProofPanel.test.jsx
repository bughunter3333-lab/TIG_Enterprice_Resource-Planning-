/**
 * The job page's proof (F31). A logo is proofed once, for every job that
 * carries it, so a job with logo lines shows each logo's proof and approves
 * through the logo; the job's own proof stays only for jobs with no logo.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import ProofPanel from '../ProofPanel';

const JOB = { id: '110000', proofStatus: 'none', proofNotes: '', items: [{ id: 1, logoId: null }] };
const WITH_LOGOS = {
  ...JOB,
  items: [
    { id: 1, logoId: null },
    { id: 2, logoId: 9, logoCode: 'EMB.PB31', logoProofStatus: 'sent' },
    { id: 3, logoId: 9, logoCode: 'EMB.PB31', logoProofStatus: 'sent' },
    { id: 4, logoId: 12, logoCode: 'SP.BACK', logoProofStatus: 'approved' },
  ],
};

test("a job with logo lines shows each logo's proof once, not a proof of its own", () => {
  renderWithQuery(<ProofPanel job={WITH_LOGOS} onUpdate={vi.fn()} onApproveLogo={vi.fn()} />);
  expect(screen.getAllByText('EMB.PB31')).toHaveLength(1);
  expect(screen.getByText('With the customer')).toBeInTheDocument();
  expect(screen.getByText('SP.BACK')).toBeInTheDocument();
  expect(screen.getByText('Approved')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /sent to client/i })).not.toBeInTheDocument();
});

test('a logo is approved through the logo, and only one not yet approved is offered', async () => {
  const onApproveLogo = vi.fn().mockResolvedValue(undefined);
  renderWithQuery(<ProofPanel job={WITH_LOGOS} onUpdate={vi.fn()} onApproveLogo={onApproveLogo} />);
  expect(screen.queryByRole('button', { name: 'Approve SP.BACK' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Approve EMB.PB31' }));
  await waitFor(() => expect(onApproveLogo).toHaveBeenCalledWith(9));
});

test('where approving a logo is not offered, the proof is shown and nothing else', () => {
  renderWithQuery(<ProofPanel job={WITH_LOGOS} onUpdate={vi.fn()} />);
  expect(screen.getByText('EMB.PB31')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument();
});

test('a job with no logo keeps its own proof', async () => {
  const onUpdate = vi.fn().mockResolvedValue(undefined);
  renderWithQuery(<ProofPanel job={JOB} onUpdate={onUpdate} onApproveLogo={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /sent to client/i }));
  await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('sent', ''));
});
