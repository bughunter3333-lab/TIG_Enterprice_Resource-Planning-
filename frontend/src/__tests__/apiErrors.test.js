/**
 * What the request helper turns a failed response into is the only thing a
 * person ever reads. Two shapes of failure were being flattened into text that
 * described the transport instead of the problem:
 *
 *   - Every 401 threw a bare "Unauthenticated" before the body was read, so a
 *     mistyped password on the sign-in screen reported the HTTP condition
 *     rather than the server's "Invalid username or password".
 *   - A proxy or a stopped host answers with HTML, not JSON, so `detail` came
 *     back empty and the operator was shown "Request failed: 503".
 *
 * The 401 also drives the logout event, so widening the message must not stop
 * an expired session from signing the user out.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { auth } from '../api';

const respond = ({ status, body, json = true }) => ({
  ok: false,
  status,
  json: json ? async () => body : async () => { throw new SyntaxError('not JSON'); },
});

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('request() error messages', () => {
  test('a rejected sign-in reports the server reason, not the status name', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      respond({ status: 401, body: { detail: 'Invalid username or password' } })));

    await expect(auth.login('Emon117', 'wrong')).rejects.toThrow('Invalid username or password');
  });

  test('an expired session still raises auth:logout', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      respond({ status: 401, body: { detail: 'Not authenticated' } })));
    const onLogout = vi.fn();
    window.addEventListener('auth:logout', onLogout);

    await expect(auth.me()).rejects.toThrow('Not authenticated');
    expect(onLogout).toHaveBeenCalledTimes(1);

    window.removeEventListener('auth:logout', onLogout);
  });

  test('an unreachable backend says so instead of printing its status code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond({ status: 503, json: false })));

    await expect(auth.login('Emon117', 'x')).rejects.toThrow(/can't reach the server/i);
  });

  test('a validation error still lists what the server objected to', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      respond({ status: 422, body: { detail: [{ msg: 'field required' }, { msg: 'too short' }] } })));

    await expect(auth.login('a', 'b')).rejects.toThrow('field required; too short');
  });
});
