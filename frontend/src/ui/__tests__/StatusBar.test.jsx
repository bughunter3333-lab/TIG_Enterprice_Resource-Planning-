import { render, screen, waitFor } from '@testing-library/react';
import StatusBar from '../shell/StatusBar';

vi.mock('../../api', () => ({
  health: { check: vi.fn() },
}));
import { health } from '../../api';

test('shows Connected when health check succeeds', async () => {
  health.check.mockResolvedValue({ status: 'ok' });
  render(<StatusBar currentUser={{ username: 'em', role: 'admin' }} />);
  // The username is promoted into its own span (live value vs static label),
  // so assert on the rendered text rather than a single text node.
  expect(screen.getByText('em')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument());
});

test('shows Offline when health check fails', async () => {
  health.check.mockRejectedValue(new Error('down'));
  render(<StatusBar currentUser={{ username: 'em' }} />);
  await waitFor(() => expect(screen.getByText('Offline')).toBeInTheDocument());
});
