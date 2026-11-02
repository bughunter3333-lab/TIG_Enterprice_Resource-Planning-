/**
 * The Details card's proof line: a job with logo lines is proofed on its
 * logos (F31), so the card reads them and never the job's own proof field,
 * which would contradict an approval held on the logo.
 */
import { render, screen } from '@testing-library/react';
import JobDetailsCard from '../JobDetailsCard';

const job = (over) => ({ id: '110000', status: 'ORDER', items: [], proofStatus: 'none', ...over });
const proof = () => screen.queryByText('Proof')?.nextElementSibling?.textContent;

test('a job with logo lines shows each logo’s proof, not its own', () => {
  render(<JobDetailsCard job={job({
    proofStatus: 'none',
    items: [
      { id: 1, logoId: 7, logoCode: 'EMB.PB31', logoProofStatus: 'approved' },
      { id: 2, logoId: 7, logoCode: 'EMB.PB31', logoProofStatus: 'approved' },
      { id: 3, logoId: 9, logoCode: 'DTF.BACK', logoProofStatus: 'sent' },
    ],
  })} />);
  expect(proof()).toBe('EMB.PB31 approved, DTF.BACK with the customer');
});

test('a job without logos shows its own proof once it has one', () => {
  render(<JobDetailsCard job={job({ proofStatus: 'sent' })} />);
  expect(proof()).toBe('sent');
});

test('a job with neither shows no proof line', () => {
  render(<JobDetailsCard job={job()} />);
  expect(screen.queryByText('Proof')).not.toBeInTheDocument();
});
