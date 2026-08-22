/**
 * The branches stock can sit at.
 *
 * Mirrors backend/app/core/branches.py — a branch keys every stock position, so
 * the two lists disagreeing silently opens a position under a name nothing else
 * uses. A backend test asserts they match; adding a branch means editing both.
 */
export const BRANCHES = ['HQ', 'Warehouse', 'Melbourne', 'Sydney', 'Brisbane', 'Perth'];

export const DEFAULT_BRANCH = BRANCHES[0];
