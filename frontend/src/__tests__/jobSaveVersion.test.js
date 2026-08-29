/**
 * The job save has to carry two things the server needs: the version it was
 * loaded at, and the id of each line.
 *
 * Without the version, two people editing one job means the second save
 * silently overwrites the first. The version is a counter rather than the
 * job's `updated_at`, which moves too slowly to tell two quick saves apart. Without the line ids, the server cannot match
 * lines and falls back to replacing them all — which is what discarded
 * `po_no` and `qty_pick`, written by the requirements and picking screens.
 *
 * Both are easy to lose in a refactor of the payload builder and neither shows
 * up in the UI, so they are asserted directly.
 */
import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';

const JOB = {
  id: 'J-1',
  version: 7,
  updated_at: '2026-08-22T01:02:03.456789+00:00',
  customer_name: 'Zephyr Co',
  customer_id: 'ZEPH',
  status: 'ORDER',
  items: [
    { id: 11, display_type: 'product', stock_code: 'TEE-BLK', description: 'Tee', qty: 5 },
    { id: 12, display_type: 'product', stock_code: 'CAP-NVY', description: 'Cap', qty: 2 },
  ],
};

let calls;

beforeEach(() => {
  calls = [];
  vi.stubGlobal('fetch', (url, options) => {
    calls.push({ url, options });
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(JOB),
    });
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('saving a job', () => {
  test('carries the version it was loaded at', async () => {
    const { jobs } = await import('../api');
    const loaded = await jobs.get('J-1');
    expect(loaded.version).toBe(JOB.version);

    calls.length = 0;
    await jobs.update('J-1', loaded);

    expect(calls[0].options.headers['If-Match']).toBe('7');
  });

  test('the token is the counter, not the timestamp', async () => {
    // These were the same value until `updated_at` turned out to advance only
    // about once every 10ms: two saves inside one tick shared a token, so the
    // stale one matched and overwrote the other editor's work. The job still
    // carries `updated_at` for display, which is exactly why this is pinned.
    const { jobs } = await import('../api');
    const loaded = await jobs.get('J-1');

    calls.length = 0;
    await jobs.update('J-1', loaded);

    expect(calls[0].options.headers['If-Match']).not.toBe(JOB.updated_at);
  });

  test('version zero is still a version', async () => {
    // A falsy-but-present token has to be sent. Dropping it would make the
    // save unconditional, which is the failure this whole file guards.
    const { jobs } = await import('../api');
    calls.length = 0;
    await jobs.update('J-1', { id: 'J-1', version: 0, items: [] });

    expect(calls[0].options.headers['If-Match']).toBe('0');
  });

  test('sends each line back with its id', async () => {
    const { jobs } = await import('../api');
    const loaded = await jobs.get('J-1');

    calls.length = 0;
    await jobs.update('J-1', loaded);

    const sent = JSON.parse(calls[0].options.body).items;
    expect(sent.map((line) => line.id)).toEqual([11, 12]);
  });

  test('a line added in the browser has no id yet', async () => {
    const { jobs } = await import('../api');
    const loaded = await jobs.get('J-1');
    loaded.items.push({ description: 'new line', qty: 1 });

    calls.length = 0;
    await jobs.update('J-1', loaded);

    const sent = JSON.parse(calls[0].options.body).items;
    expect(sent).toHaveLength(3);
    expect(sent[2].id).toBeUndefined();
  });

  test('a job with no version yet sends no header', async () => {
    const { jobs } = await import('../api');
    calls.length = 0;
    await jobs.update('J-1', { id: 'J-1', items: [] });

    expect(calls[0].options.headers).toBeUndefined();
  });
});

describe('a rejected save', () => {
  test('surfaces the conflict message rather than the status code', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: false,
        status: 409,
        json: () =>
          Promise.resolve({
            detail: {
              error: 'conflict',
              message: 'This job was changed by someone else while you were editing it.',
            },
          }),
      })
    );

    const { jobs } = await import('../api');
    await expect(jobs.update('J-1', { id: 'J-1' })).rejects.toThrow(
      /changed by someone else/
    );
  });
});
