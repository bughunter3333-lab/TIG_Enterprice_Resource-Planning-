import {
  accessWords, allowed, editChanges, editProblems, filterUsers, newUserProblems, passwordGaps, passwordProblem, userCounts,
} from '../userRules';

const USERS = [
  { id: 1, username: 'Emon117', full_name: 'Emon Miah', email: 'emon@tig.com.au', role: 'admin', is_active: true },
  { id: 2, username: 'j.smith', full_name: 'Jo Smith', email: 'Jo.Smith@tig.com.au', role: 'staff', is_active: true },
  { id: 3, username: 'old_hand', full_name: 'Old Hand', email: 'old@tig.com.au', role: 'manager', is_active: false },
];
const GOOD = { username: 'new.person', full_name: 'New Person', email: 'new@tig.com.au', password: 'Welcome2TIG', role: 'staff' };

describe('a password', () => {
  test('one that will do has nothing missing', () => {
    expect(passwordGaps('Welcome2TIG')).toEqual([]);
    expect(passwordProblem('Welcome2TIG')).toBeNull();
  });

  test('says each thing it lacks', () => {
    expect(passwordGaps('')).toEqual(['at least 8 characters', 'an uppercase letter', 'a digit']);
    expect(passwordGaps('alllowercase1')).toEqual(['an uppercase letter']);
    expect(passwordGaps('NoDigitsHere')).toEqual(['a digit']);
    // Characters are counted as the server counts them: an emoji is one, not two.
    expect(passwordGaps('Pass1\u{1F600}\u{1F600}')).toEqual(['at least 8 characters']);
    expect(passwordProblem('short')).toBe('It needs at least 8 characters, an uppercase letter, a digit.');
  });

  test('is no longer than what the server reads of it, counted in bytes', () => {
    expect(passwordGaps(`A1${'x'.repeat(70)}`)).toEqual([]);
    expect(passwordGaps(`A1${'x'.repeat(71)}`)).toEqual(['to be no longer than 72 bytes']);
    // 36 two-byte letters and A1 is 74 bytes, though only 38 characters.
    expect(passwordGaps(`A1${'é'.repeat(36)}`)).toEqual(['to be no longer than 72 bytes']);
  });
});

describe('a new account', () => {
  test('a complete form has nothing wrong with it', () => {
    expect(newUserProblems(GOOD, USERS)).toEqual({});
  });

  test('a username is something that can be typed to sign in', () => {
    for (const username of ['', 'ab', 'has space', '.dot', '-dash', 'jo@smith', 'x'.repeat(51)]) {
      expect(newUserProblems({ ...GOOD, username }, USERS).username).toMatch(/^3 to 50 letters/);
    }
    for (const username of ['abc', 'J.Smith-2', 'a_b', '9lives', 'x'.repeat(50), '  padded  ']) {
      expect(newUserProblems({ ...GOOD, username }, [])).toEqual({});
    }
  });

  test('a username or address already on an account is taken, whatever its case', () => {
    expect(newUserProblems({ ...GOOD, username: 'EMON117' }, USERS).username).toBe('That username is taken.');
    expect(newUserProblems({ ...GOOD, email: 'jo.smith@TIG.com.au' }, USERS).email).toBe('j.smith already uses this address.');
  });

  test('a name, an email address, a password and a real role are all needed', () => {
    const found = newUserProblems({ username: 'new.person', full_name: '  ', email: 'jo at work', password: 'weak', role: 'boss' }, USERS);
    expect(Object.keys(found).sort()).toEqual(['email', 'full_name', 'password', 'role']);
    expect(newUserProblems({ ...GOOD, full_name: 'N'.repeat(101) }, USERS).full_name).toBe('At most 100 characters.');
  });
});

describe('editing an account', () => {
  const jo = USERS[1];

  test('their own address is not a clash with themselves', () => {
    expect(editProblems({ full_name: 'Jo Smith', email: 'jo.smith@tig.com.au', role: 'staff' }, jo, USERS)).toEqual({});
    expect(editProblems({ full_name: 'Jo Smith', email: 'emon@tig.com.au', role: 'staff' }, jo, USERS).email).toBe('Emon117 already uses this address.');
    expect(editProblems({ full_name: '', email: 'x', role: 'nope' }, jo, USERS)).toMatchObject({ full_name: expect.any(String), email: expect.any(String), role: expect.any(String) });
  });

  test('only what was changed is sent', () => {
    expect(editChanges({ full_name: 'Jo Smith', email: 'Jo.Smith@tig.com.au', role: 'staff' }, jo)).toEqual({});
    expect(editChanges({ full_name: ' Jo Smith-Lee ', email: 'Jo.Smith@tig.com.au', role: 'manager' }, jo)).toEqual({ full_name: 'Jo Smith-Lee', role: 'manager' });
    expect(editChanges({ full_name: 'Jo Smith', email: 'jo@tig.com.au', role: 'staff' }, jo)).toEqual({ email: 'jo@tig.com.au' });
  });
});

describe('what an admin may do to an account', () => {
  test('anything to someone else; not their own role, access or account', () => {
    expect(allowed({ id: 1 }, USERS[1])).toEqual({ changeRole: true, deactivate: true, remove: true, self: false });
    expect(allowed({ id: 1 }, USERS[0])).toEqual({ changeRole: false, deactivate: false, remove: false, self: true });
  });
});

describe('finding accounts', () => {
  test('by any of username, name or email, without case', () => {
    expect(filterUsers(USERS, { query: 'SMITH' }).map((u) => u.id)).toEqual([2]);
    expect(filterUsers(USERS, { query: 'emon117' }).map((u) => u.id)).toEqual([1]);
    expect(filterUsers(USERS, { query: 'old@' }).map((u) => u.id)).toEqual([3]);
    expect(filterUsers(USERS, { query: '   ' })).toHaveLength(3);
    expect(filterUsers(USERS)).toHaveLength(3);
    expect(filterUsers(undefined, { query: 'x' })).toEqual([]);
  });

  test('by role and by status, together with the search', () => {
    expect(filterUsers(USERS, { role: 'manager' }).map((u) => u.id)).toEqual([3]);
    expect(filterUsers(USERS, { status: 'active' }).map((u) => u.id)).toEqual([1, 2]);
    expect(filterUsers(USERS, { status: 'inactive' }).map((u) => u.id)).toEqual([3]);
    expect(filterUsers(USERS, { role: 'manager', status: 'active' })).toEqual([]);
    expect(filterUsers(USERS, { query: 'o', role: 'staff' }).map((u) => u.id)).toEqual([2]);
  });

  test('counts by role and by status', () => {
    expect(userCounts(USERS)).toEqual({ all: 3, active: 2, inactive: 1, admin: 1, manager: 1, staff: 1, overseas_staff: 0 });
    expect(userCounts(undefined).all).toBe(0);
  });
});

describe('a cell of the access table', () => {
  test('all, none, or how many of how many', () => {
    expect(accessWords('view', [20, 20])).toBe('View all');
    expect(accessWords('view', [0, 14])).toBe('No view');
    expect(accessWords('view', [4, 14])).toBe('View 4 of 14');
    expect(accessWords('change', [21, 21])).toBe('Change all');
    expect(accessWords('change', [15, 21])).toBe('Change 15 of 21');
    expect(accessWords('change', [0, 21])).toBe('No changes');
  });

  test('an area with nothing of that kind says nothing', () => {
    expect(accessWords('change', [0, 0])).toBeNull();
  });
});
