import { render, screen, fireEvent } from '@testing-library/react';
import Field from '../Field';
import Select from '../Select';
import Tabs from '../Tabs';

test('Field renders label, value, and error', () => {
  render(<Field label="Customer" value="BHP" onChange={() => {}} error="Required" />);
  expect(screen.getByLabelText('Customer')).toHaveValue('BHP');
  expect(screen.getByText('Required')).toBeInTheDocument();
});

test('Select renders options and fires onChange', () => {
  const onChange = vi.fn();
  render(<Select label="Branch" value="HQ" onChange={onChange} options={[{ value: 'HQ', label: 'HQ' }, { value: 'MELB', label: 'Melbourne' }]} />);
  fireEvent.change(screen.getByLabelText('Branch'), { target: { value: 'MELB' } });
  expect(onChange).toHaveBeenCalled();
});

test('Tabs switches active tab on click', () => {
  const onChange = vi.fn();
  render(<Tabs tabs={[{ id: 'a', label: 'Details' }, { id: 'b', label: 'Pricing' }]} active="a" onChange={onChange} />);
  fireEvent.click(screen.getByText('Pricing'));
  expect(onChange).toHaveBeenCalledWith('b');
});
