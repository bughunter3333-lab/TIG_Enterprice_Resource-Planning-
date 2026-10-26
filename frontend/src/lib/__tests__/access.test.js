import { areaView, canCall, offers } from '../access';

const ACCESS = {
  role: 'staff',
  areas: [
    { area: 'Jobs and quotes', view: [12, 12], change: [9, 14] },
    { area: 'Accounts', view: [0, 14], change: [0, 10] },
  ],
  allowed: ['GET /jobs', 'GET /jobs/{job_id}', 'POST /jobs', 'POST /jobs/{job_id}/status'],
};

describe('canCall', () => {
  test('matches a route the role may call', () => {
    expect(canCall(ACCESS, 'GET', '/jobs')).toBe(true);
    expect(canCall(ACCESS, 'POST', '/jobs')).toBe(true);
  });

  test('a {param} takes exactly one non-empty segment', () => {
    expect(canCall(ACCESS, 'GET', '/jobs/1207505')).toBe(true);
    expect(canCall(ACCESS, 'POST', '/jobs/1207505/status')).toBe(true);
    expect(canCall(ACCESS, 'GET', '/jobs/12/07')).toBe(false);
    expect(canCall(ACCESS, 'POST', '/jobs//status')).toBe(false);
  });

  test('accepts the template itself', () => {
    expect(canCall(ACCESS, 'POST', '/jobs/{job_id}/status')).toBe(true);
  });

  test('the method has to match too, whatever its case', () => {
    expect(canCall(ACCESS, 'post', '/jobs')).toBe(true);
    expect(canCall(ACCESS, 'DELETE', '/jobs/1207505')).toBe(false);
  });

  test('a route not listed, a longer path or a prefix is refused', () => {
    expect(canCall(ACCESS, 'GET', '/reports/aged-receivables')).toBe(false);
    expect(canCall(ACCESS, 'GET', '/jobs/1207505/pdf')).toBe(false);
    expect(canCall(ACCESS, 'GET', '/job')).toBe(false);
  });

  test('nothing is allowed before access has loaded', () => {
    expect(canCall(undefined, 'GET', '/jobs')).toBe(false);
    expect(canCall(null, 'GET', '/jobs')).toBe(false);
    expect(canCall({ role: 'staff' }, 'GET', '/jobs')).toBe(false);
  });
});

describe('offers', () => {
  test('once access has loaded, what canCall says', () => {
    expect(offers(ACCESS, false, 'GET', '/jobs/1207505')).toBe(true);
    expect(offers(ACCESS, false, 'GET', '/reports/aged-receivables')).toBe(false);
  });

  test('nothing while access loads, everything if it cannot be loaded', () => {
    expect(offers(undefined, false, 'GET', '/jobs')).toBe(false);
    expect(offers(undefined, true, 'GET', '/reports/aged-receivables')).toBe(true);
  });
});

describe('areaView', () => {
  test('gives the role’s [n, of] reads for an area', () => {
    expect(areaView(ACCESS, 'Jobs and quotes')).toEqual([12, 12]);
    expect(areaView(ACCESS, 'Accounts')).toEqual([0, 14]);
  });

  test('null for an area the table does not list, or before access has loaded', () => {
    expect(areaView(ACCESS, 'Freight')).toBeNull();
    expect(areaView(undefined, 'Accounts')).toBeNull();
  });
});
