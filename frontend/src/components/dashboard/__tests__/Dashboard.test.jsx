import { render, screen } from '@testing-library/react';
import Dashboard from '../Dashboard';

const jobs = [
  { id: '1', status: 'PRINT', due: '12/06/2026', total: 500, invoicePaid: 0, customer: 'Acme Inc', items: [] },
  { id: '2', status: 'PAID', out: '01/06/2026', due: '01/06/2026', total: 300, invoicePaid: 300, customer: 'Widget Co', items: [] },
];

test('Dashboard renders KPI labels and the job pipeline', () => {
  render(<Dashboard jobs={jobs} onNewJob={() => {}} onNavigateJobs={() => {}} />);
  expect(screen.getByText('Jobs Open')).toBeInTheDocument();
  expect(screen.getByText('Job Pipeline')).toBeInTheDocument();
  const printElements = screen.getAllByText('PRINT');
  expect(printElements.length).toBeGreaterThan(0); // status in activity + pipeline
});
