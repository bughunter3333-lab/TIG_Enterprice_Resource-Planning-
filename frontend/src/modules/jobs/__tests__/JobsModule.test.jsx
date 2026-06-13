import { render, screen, fireEvent } from '@testing-library/react';
import JobsList from '../JobsList';

const jobs = [
  { id: '1001', customer: 'BHP Group', status: 'PRINT', priority: 'Urgent', accMgr: 'SM', total: 1500, due: '12/06/2026', items: [{ decorationType: 'Embroidery' }] },
  { id: '1002', customer: 'Onsite Rental', status: 'QUOTE', priority: 'Normal', accMgr: 'JC', total: 300, due: '15/06/2026', items: [] },
];

test('renders job rows with status badge and money formatting, fires onJobClick', () => {
  const onJobClick = vi.fn();
  render(<JobsList jobs={jobs} onJobClick={onJobClick} />);
  expect(screen.getByText('1001')).toBeInTheDocument();
  expect(screen.getByText('PRINT')).toBeInTheDocument();      // StatusBadge text
  expect(screen.getByText('$1,500')).toBeInTheDocument();      // money, no decimals
  expect(screen.getByText('Embroidery')).toBeInTheDocument();  // decoration column
  fireEvent.click(screen.getByText('BHP Group'));
  expect(onJobClick).toHaveBeenCalledWith(expect.objectContaining({ id: '1001' }));
});
