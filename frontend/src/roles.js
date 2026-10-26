/**
 * The roles an account can hold.
 *
 * Mirrors ALL_ROLES in backend/app/core/dependencies.py, and a backend test
 * asserts the two agree. The list used to live inline in the user screen, where
 * it fell behind the backend: `manager` could be checked for everywhere and
 * assigned nowhere.
 *
 * The first four are people, most senior first. `portal` is a service account
 * for the online store: it books orders and comments on them, nothing else.
 */
export const ROLES = ['admin', 'manager', 'staff', 'overseas_staff', 'portal'];

export const ROLE_LABELS = {
  admin: 'Admin',
  manager: 'Manager',
  staff: 'Staff',
  overseas_staff: 'Overseas Staff',
  portal: 'Online Store (service)',
};
