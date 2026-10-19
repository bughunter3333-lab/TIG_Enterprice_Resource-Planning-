/**
 * The shell every extracted modal renders through, so a regression here breaks
 * eleven screens at once rather than one.
 *
 * The behaviour worth pinning is the click routing: the backdrop dismisses, the
 * card does not, and a mousedown on a control inside the card must not start a
 * drag — otherwise selecting text in an input or clicking a button would pick
 * the whole dialog up and move it.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import DraggableModal from '../DraggableModal';

test('renders its children', () => {
  render(<DraggableModal onClose={vi.fn()}><p>body text</p></DraggableModal>);
  expect(screen.getByText('body text')).toBeInTheDocument();
});

test('clicking the backdrop closes it', () => {
  const onClose = vi.fn();
  const { container } = render(<DraggableModal onClose={onClose}><p>body</p></DraggableModal>);
  fireEvent.click(container.firstChild);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('clicking inside the card does not close it', () => {
  const onClose = vi.fn();
  render(<DraggableModal onClose={onClose}><p>body</p></DraggableModal>);
  fireEvent.click(screen.getByText('body'));
  expect(onClose).not.toHaveBeenCalled();
});

test('a mousedown on a control inside does not start a drag', () => {
  render(
    <DraggableModal onClose={vi.fn()}>
      <button type="button">Save</button>
    </DraggableModal>
  );
  const before = screen.getByText('Save').closest('div').getAttribute('style');
  fireEvent.mouseDown(screen.getByRole('button', { name: 'Save' }), { button: 0 });
  fireEvent.mouseMove(window, { clientX: 400, clientY: 400 });
  expect(screen.getByText('Save').closest('div').getAttribute('style')).toBe(before);
});

test('a right-click on the card does not start a drag', () => {
  render(<DraggableModal onClose={vi.fn()}><p>body</p></DraggableModal>);
  const card = screen.getByText('body').parentElement;
  const before = card.getAttribute('style');
  fireEvent.mouseDown(card, { button: 2 });
  fireEvent.mouseMove(window, { clientX: 500, clientY: 500 });
  expect(card.getAttribute('style')).toBe(before);
});

test('dragging the card body does move it', () => {
  // Without this the two tests above would pass even if dragging never worked
  // at all, which is the failure mode of asserting only that nothing happened.
  render(<DraggableModal onClose={vi.fn()}><p>body</p></DraggableModal>);
  const card = screen.getByText('body').parentElement;
  const before = card.getAttribute('style');
  fireEvent.mouseDown(card, { button: 0, clientX: 10, clientY: 10 });
  fireEvent.mouseMove(window, { clientX: 300, clientY: 220 });
  expect(card.getAttribute('style')).not.toBe(before);
});
