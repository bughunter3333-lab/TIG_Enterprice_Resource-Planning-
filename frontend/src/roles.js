/**
 * The roles an account can hold.
 *
 * Mirrors ROLES in backend/app/core/dependencies.py, and a backend test asserts
 * the two agree. The list used to live inline in the user screen, where it fell
 * behind the backend: `manager` could be checked for everywhere and assigned
 * nowhere.
 */
export const ROLES = ['admin', 'manager', 'staff', 'overseas_staff'];

export const ROLE_LABELS = {
  admin: 'Admin',
  manager: 'Manager',
  staff: 'Staff',
  overseas_staff: 'Overseas Staff',
};
