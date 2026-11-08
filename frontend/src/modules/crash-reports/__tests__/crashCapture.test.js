/**
 * What a crash report knows of the moments before it, and how it is sent
 * (docs/superpowers/specs/2026-11-08-crash-reports.md).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as api from '../../../api';
import {
  REPORT_PROBLEM, SERVER_ERROR, addStep, environment, lastSteps, reportProblem, resetCrashContext, setPlace, setSignedIn,
} from '../../../lib/crashContext';
import { errorParts, installGlobalHandlers, markCaught, recordCrash, resetRecorded, sendReport } from '../reporter';
import { pictured } from '../screenshot';

beforeEach(() => { resetCrashContext(); resetRecorded(); setSignedIn(true); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('the steps before a crash', () => {
  test('the last forty are kept, oldest dropped', () => {
    for (let n = 0; n < 45; n += 1) addStep('api', `GET /jobs/${n}`);
    const steps = lastSteps();
    expect(steps).toHaveLength(40);
    expect(steps[0].text).toBe('GET /jobs/5');
    expect(steps.at(-1)).toMatchObject({ kind: 'api', text: 'GET /jobs/44' });
  });

  test('where the person is goes with the browser and the build', () => {
    setPlace({ module: 'jobs', jobId: '1218774' });
    expect(environment()).toMatchObject({ module: 'jobs', job_id: '1218774', app_build: expect.any(String) });
    expect(environment().viewport).toMatch(/^\d+x\d+$/);
  });

  test('every API call is a step, without its query', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })));
    await api.jobs.list({ search: 'Ricoh private' });
    const step = lastSteps().at(-1);
    expect(step.kind).toBe('api');
    expect(step.text).toMatch(/^GET \/jobs → 200 \(\d+ ms\)$/);
    expect(step.text).not.toContain('Ricoh');
  });

  test('a server error carries its request id and raises the notice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 500, headers: { get: () => 'req-42' }, json: async () => ({ detail: 'Internal Server Error' }),
    })));
    const heard = vi.fn();
    window.addEventListener(SERVER_ERROR, heard);
    const err = await api.jobs.get('1').catch((e) => e);
    window.removeEventListener(SERVER_ERROR, heard);
    expect(err.requestId).toBe('req-42');
    expect(heard.mock.calls[0][0].detail).toMatchObject({ message: 'Internal Server Error', requestId: 'req-42' });
  });

  test('sending a report is not itself a step', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ id: 1 }) })));
    await api.crashReports.send({ kind: 'report' });
    expect(lastSteps()).toHaveLength(0);
  });

  test('anything may open the report dialog', () => {
    const heard = vi.fn();
    window.addEventListener(REPORT_PROBLEM, heard);
    reportProblem({ kind: 'report' });
    window.removeEventListener(REPORT_PROBLEM, heard);
    expect(heard.mock.calls[0][0].detail).toEqual({ kind: 'report' });
  });
});

describe('recording a crash nobody reported', () => {
  test('sent at once, with the steps and the place', async () => {
    const send = vi.spyOn(api.crashReports, 'send').mockResolvedValue({ id: 7 });
    addStep('nav', 'Jobs');
    const id = await recordCrash({ kind: 'crash', error: new TypeError('x is undefined'), componentStack: '\n in JobRecord' });
    expect(id).toBe(7);
    expect(send.mock.calls[0][0]).toMatchObject({
      kind: 'crash', auto: true, message: 'TypeError: x is undefined', component_stack: '\n in JobRecord',
    });
    expect(send.mock.calls[0][0].breadcrumbs.map((s) => s.kind)).toEqual(['nav', 'error']);
  });

  test('once per kind per visit, so a looping fault does not flood', async () => {
    const send = vi.spyOn(api.crashReports, 'send').mockResolvedValue({ id: 1 });
    const error = new Error('boom');
    await recordCrash({ kind: 'error', error });
    await recordCrash({ kind: 'error', error });
    expect(send).toHaveBeenCalledTimes(1);
  });

  test("the browser's own noise is not a crash", async () => {
    const send = vi.spyOn(api.crashReports, 'send');
    expect(await recordCrash({ kind: 'error', error: 'ResizeObserver loop completed with undelivered notifications.' })).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  test('a report that cannot be sent never throws', async () => {
    vi.spyOn(api.crashReports, 'send').mockRejectedValue(new Error('offline'));
    await expect(recordCrash({ error: new Error('x') })).resolves.toBeNull();
  });

  test('every uncaught error and rejection is recorded', async () => {
    const send = vi.spyOn(api.crashReports, 'send').mockResolvedValue({ id: 1 });
    const stop = installGlobalHandlers();
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('uncaught one'), message: 'uncaught one' }));
    const rejection = new Event('unhandledrejection');
    rejection.reason = new Error('rejected one');
    window.dispatchEvent(rejection);
    stop();
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls.map((c) => c[0].message)).toEqual(['Error: uncaught one', 'Error: rejected one']);
  });

  test('nothing is sent before anyone has signed in', async () => {
    setSignedIn(false);
    const send = vi.spyOn(api.crashReports, 'send');
    expect(await recordCrash({ error: new Error('on the sign-in screen') })).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  test('a crash a boundary caught is not recorded again as an error', async () => {
    const send = vi.spyOn(api.crashReports, 'send').mockResolvedValue({ id: 1 });
    const stop = installGlobalHandlers();
    const crash = new Error('caught by a boundary');
    window.dispatchEvent(new ErrorEvent('error', { error: crash, message: crash.message }));
    markCaught(crash);
    await new Promise((r) => setTimeout(r, 10));
    stop();
    expect(send).not.toHaveBeenCalled();
  });

  test('a report that failed to send is tried again the next time', async () => {
    const send = vi.spyOn(api.crashReports, 'send').mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ id: 3 });
    const error = new Error('flaky');
    expect(await recordCrash({ error })).toBeNull();
    expect(await recordCrash({ error })).toBe(3);
    expect(send).toHaveBeenCalledTimes(2);
  });

  test('the same crash again is the same report', async () => {
    vi.spyOn(api.crashReports, 'send').mockResolvedValue({ id: 4 });
    const error = new Error('again');
    expect(await recordCrash({ error })).toBe(4);
    expect(await recordCrash({ error })).toBe(4);
  });

  test('anything thrown has words', () => {
    expect(errorParts('plain words').message).toBe('plain words');
    expect(errorParts({ code: 1 }).message).toBe('{"code":1}');
    const loop = {};
    loop.self = loop;
    expect(errorParts(loop).message).toBe('[object Object]');
  });

  test('secrets are never in the picture: password fields, and anything marked sensitive', () => {
    document.body.innerHTML = `
      <input type="password" id="pw" />
      <div data-sensitive><img id="qr" alt="QR" /></div>
      <div data-crash-ignore><p id="dialog">dialog</p></div>
      <p id="page">the page</p>`;
    expect(pictured(document.getElementById('pw'))).toBe(false);
    expect(pictured(document.getElementById('qr'))).toBe(false);
    expect(pictured(document.getElementById('dialog'))).toBe(false);
    expect(pictured(document.getElementById('page'))).toBe(true);
    document.body.innerHTML = '';
  });
});

describe("the person's own report", () => {
  test('joins the crash already recorded', async () => {
    const add = vi.spyOn(api.crashReports, 'addDetails').mockResolvedValue({ id: 7 });
    await sendReport({ kind: 'crash', crashId: 7, description: 'Saving line 2', screenshot: 'data:image/jpeg;base64,AA' });
    expect(add).toHaveBeenCalledWith(7, { description: 'Saving line 2', screenshot: 'data:image/jpeg;base64,AA' });
  });

  test('too late to join it, it goes as a report of its own', async () => {
    vi.spyOn(api.crashReports, 'addDetails').mockRejectedValue(Object.assign(new Error('late'), { status: 409 }));
    const send = vi.spyOn(api.crashReports, 'send').mockResolvedValue({ id: 8 });
    await sendReport({ kind: 'crash', crashId: 7, description: 'x' });
    expect(send.mock.calls[0][0]).toMatchObject({ kind: 'crash', auto: false, description: 'x' });
  });

  test('a server error goes with its request id', async () => {
    const send = vi.spyOn(api.crashReports, 'send').mockResolvedValue({ id: 9 });
    await sendReport({ kind: 'server_error', requestId: 'req-42', message: 'PATCH /jobs/1 → Internal Server Error' });
    expect(send.mock.calls[0][0]).toMatchObject({
      kind: 'server_error', request_id: 'req-42', message: 'PATCH /jobs/1 → Internal Server Error', stack: null,
    });
  });
});
