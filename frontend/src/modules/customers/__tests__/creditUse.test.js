/**
 * The job form's credit-limit banner (F06) reads the customer's server
 * balance, as the customer list does. It used to sum balanceDue over the
 * loaded jobs — every status, quotes and cancelled jobs included, and only the
 * newest 500 — so a customer owing $200 of a $1,000 limit showed "over limit".
 */
import { expect, test } from 'vitest';
import { creditUse } from '../customerAggregates';

test('the banner reads the balance the server holds', () => {
  expect(creditUse({ id: 'ACME', creditLimit: 1000, balance: 200 })).toEqual({ outstanding: 200, overLimit: false, util: 20 });
});

test('over the limit, use is capped at 100% and said to be over', () => {
  expect(creditUse({ id: 'BHP', creditLimit: 1000, balance: 1500 })).toEqual({ outstanding: 1500, overLimit: true, util: 100 });
});

test('a customer with no limit, or none chosen, has no banner', () => {
  expect(creditUse({ id: 'CASH', creditLimit: 0, balance: 900 })).toBeNull();
  expect(creditUse(undefined)).toBeNull();
});
