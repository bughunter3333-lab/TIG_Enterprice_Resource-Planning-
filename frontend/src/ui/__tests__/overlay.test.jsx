import { render, screen, fireEvent, act } from '@testing-library/react';
import Modal from '../Modal';
import KpiTile from '../KpiTile';
import { ToastProvider, useToast } from '../Toast';

test('Modal renders title and closes on Escape', () => {
  const onClose = vi.fn();
  render(<Modal title="Adjust Stock" onClose={onClose}><div>body</div></Modal>);
  expect(screen.getByText('Adjust Stock')).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalled();
});

test('KpiTile shows label and value', () => {
  render(<KpiTile label="OVERDUE" value={7} tone="danger" />);
  expect(screen.getByText('OVERDUE')).toBeInTheDocument();
  expect(screen.getByText('7')).toBeInTheDocument();
});

function Trigger() {
  const toast = useToast();
  return <button onClick={() => toast.error('Save failed')}>boom</button>;
}

test('Toast shows error message via useToast', () => {
  render(<ToastProvider><Trigger /></ToastProvider>);
  act(() => { fireEvent.click(screen.getByText('boom')); });
  expect(screen.getByText('Save failed')).toBeInTheDocument();
});
