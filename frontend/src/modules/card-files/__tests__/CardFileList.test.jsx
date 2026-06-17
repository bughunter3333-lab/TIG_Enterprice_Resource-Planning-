import { render, screen, fireEvent } from '@testing-library/react';
import CardFileList from '../CardFileList';
import { filterCardFiles, cardFileGroups } from '../cardFileFilters';

const cards = [
  { shipCode: 'SYD-01', customerCode: 'ACME', companyName: 'Acme Co', group: 'Retail', suburb: 'Sydney', state: 'NSW' },
  { shipCode: 'MEL-02', customerCode: 'BHP', companyName: 'BHP Group', group: 'Mining', suburb: 'Melbourne', state: 'VIC' },
  { shipCode: 'SYD-03', customerCode: 'ACME', companyName: 'Acme North', group: 'Retail', suburb: 'Newcastle', state: 'NSW' },
];

test('filterCardFiles: search matches shipCode/customerCode/companyName/suburb', () => {
  expect(filterCardFiles(cards, 'mel', 'all')).toHaveLength(1);
  expect(filterCardFiles(cards, 'acme', 'all')).toHaveLength(2);   // customerCode + name
  expect(filterCardFiles(cards, 'newcastle', 'all')).toHaveLength(1); // suburb
});

test('filterCardFiles: group narrows; all passes everything', () => {
  expect(filterCardFiles(cards, '', 'Retail')).toHaveLength(2);
  expect(filterCardFiles(cards, '', 'Mining')).toHaveLength(1);
  expect(filterCardFiles(cards, '', 'all')).toHaveLength(3);
});

test('cardFileGroups returns sorted unique non-empty groups', () => {
  expect(cardFileGroups(cards)).toEqual(['Mining', 'Retail']);
});

test('CardFileList renders rows by shipCode and fires onSelect', () => {
  const onSelect = vi.fn();
  render(<CardFileList cards={cards} selectedId={null} onSelect={onSelect} />);
  expect(screen.getByText('SYD-01')).toBeInTheDocument();
  expect(screen.getByText('Acme Co')).toBeInTheDocument();
  fireEvent.click(screen.getByText('BHP Group'));
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ shipCode: 'MEL-02' }));
});
