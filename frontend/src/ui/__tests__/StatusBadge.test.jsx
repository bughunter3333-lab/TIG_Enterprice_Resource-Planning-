import { render, screen, fireEvent } from '@testing-library/react';
import StatusBadge from '../StatusBadge';
import Button from '../Button';
import { STATUS_COLORS } from '../tokens';

test('StatusBadge renders status in its semantic colour (uppercased via CSS)', () => {
  render(<StatusBadge status="Pick/Pack" />);
  const el = screen.getByText('Pick/Pack'); // textTransform is CSS-only; DOM text is unchanged
  expect(el).toHaveStyle({ color: STATUS_COLORS['Pick/Pack'] });
  expect(el).toHaveStyle({ textTransform: 'uppercase' });
});

test('Button fires onClick and respects disabled', () => {
  const onClick = vi.fn();
  const { rerender } = render(<Button onClick={onClick}>Save</Button>);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(onClick).toHaveBeenCalledTimes(1);
  rerender(<Button onClick={onClick} disabled>Save</Button>);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(onClick).toHaveBeenCalledTimes(1);
});
