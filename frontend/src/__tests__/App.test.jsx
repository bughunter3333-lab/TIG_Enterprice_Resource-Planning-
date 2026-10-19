/**
 * Which screen a browser lands on: signing in, choosing a password of one's
 * own (when the one in use was an admin's), or the app.
 */
import { render, screen } from '@testing-library/react';
import { auth } from '../api';
import App from '../App';

vi.mock('../api', () => ({
  auth: { me: vi.fn(), logout: vi.fn(), changePassword: vi.fn(), login: vi.fn() },
}));
// The app itself is out of scope here; that it is reached is the point.
vi.mock('../TotalImageERP', () => ({ default: () => <p>The app</p> }));

const JO = { id: 2, username: 'j.smith', full_name: 'Jo Smith', role: 'staff' };

beforeEach(() => vi.clearAllMocks());

test('nobody signed in: the sign-in screen', async () => {
  auth.me.mockRejectedValue(new Error('Not authenticated'));
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
});

test('signed in on a password an admin chose: choosing their own, not the app', async () => {
  auth.me.mockResolvedValue({ ...JO, must_change_password: true });
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Choose your own password' })).toBeInTheDocument();
  expect(screen.queryByText('The app')).not.toBeInTheDocument();
});

test('signed in on their own password: the app', async () => {
  auth.me.mockResolvedValue({ ...JO, must_change_password: false });
  render(<App />);
  expect(await screen.findByText('The app')).toBeInTheDocument();
});
