import { render, screen, fireEvent } from '@testing-library/react';
import CardFilesModule from '../CardFilesModule';

const cards = [
  { shipCode: 'SYD-01', customerCode: 'ACME', companyName: 'Acme Co', group: 'Retail', suburb: 'Sydney', state: 'NSW' },
  { shipCode: 'MEL-02', customerCode: 'BHP', companyName: 'BHP Group', group: 'Mining', suburb: 'Melbourne', state: 'VIC' },
];
const base = {
  cardFiles: cards, search: '', group: 'all',
  onSearchChange: vi.fn(), onGroupChange: vi.fn(),
  selectedId: null, onSelectCard: vi.fn(), onNewCard: vi.fn(),
};

test('renders all cards by default', () => {
  render(<CardFilesModule {...base} />);
  expect(screen.getByText('SYD-01')).toBeInTheDocument();
  expect(screen.getByText('MEL-02')).toBeInTheDocument();
});

test('search forwards changes; New Card fires', () => {
  render(<CardFilesModule {...base} />);
  fireEvent.change(screen.getByPlaceholderText('Search card files…'), { target: { value: 'syd' } });
  expect(base.onSearchChange).toHaveBeenCalledWith('syd');
  fireEvent.click(screen.getByText('New Card File'));
  expect(base.onNewCard).toHaveBeenCalled();
});

test('group select lists groups and forwards changes', () => {
  render(<CardFilesModule {...base} />);
  fireEvent.change(screen.getByLabelText('Filter by group'), { target: { value: 'Mining' } });
  expect(base.onGroupChange).toHaveBeenCalledWith('Mining');
});

test('search + group props filter the visible list', () => {
  render(<CardFilesModule {...base} group="Mining" />);
  expect(screen.getByText('MEL-02')).toBeInTheDocument();
  expect(screen.queryByText('SYD-01')).not.toBeInTheDocument();
});

test('row click fires onSelectCard', () => {
  render(<CardFilesModule {...base} />);
  fireEvent.click(screen.getByText('Acme Co'));
  expect(base.onSelectCard).toHaveBeenCalledWith(expect.objectContaining({ shipCode: 'SYD-01' }));
});
