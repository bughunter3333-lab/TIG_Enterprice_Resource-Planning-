import { useQuery } from '@tanstack/react-query';
import { users } from '../api';
import { offers } from './access';

/**
 * The signed-in person's access (GET /users/me/access; see lib/access.js).
 *
 * It changes only when an admin changes the role, so it is kept for five
 * minutes. `gcTime: 0` drops it the moment nothing on screen uses it, which is
 * when the person signs out: the next person to sign in on this browser gets
 * their own, not five minutes of the last person's.
 */
export function useMyAccess() {
  return useQuery({ queryKey: ['my-access'], queryFn: users.myAccess, staleTime: 300_000, gcTime: 0 });
}

/** `offer(method, path)`: whether to show an entry that calls that route (lib/access.js `offers`). */
export function useOffer() {
  const { data: access, isError } = useMyAccess();
  return (method, path) => offers(access, isError, method, path);
}
