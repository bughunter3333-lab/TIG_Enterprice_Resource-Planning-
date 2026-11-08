/**
 * The screens of crash reporting: a crash is a recovery panel, not a white
 * page; one dialog takes every report; admins read them.
 */
import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import * as api from '../../../api';
import NotificationProvider from '../../../lib/NotificationProvider';
import { notify } from '../../../lib/notify';
import { SERVER_ERROR, reportProblem, resetCrashContext, setSignedIn } from '../../../lib/crashContext';
import { renderWithQuery } from '../../../test/renderWithQuery';
import CrashBoundary from '../CrashBoundary';
import CrashReporter from '../CrashReporter';
import CrashReportsModule from '../CrashReportsModule';
import { resetRecorded } from '../reporter';

vi.mock('../screenshot', () => ({
  NOT_IN_SCREENSHOT: 'data-crash-ignore',
  captureScreen: vi.fn(async () => 'data:image/jpeg;base64,SHOT'),
  imageToDataUrl: vi.fn(async () => 'data:image/jpeg;base64,PASTED'),
}));

beforeEach(() => {
  resetCrashContext();
  resetRecorded();
  setSignedIn(true);
  vi.spyOn(console, 'error').mockImplementation(() => {}); // React logs what it caught
});
afterEach(() => vi.restoreAllMocks());

function Bomb({ armed }) {
  if (armed) throw new TypeError('Cannot read properties of undefined');
  return <p>Working screen</p>;
}

test('a crashed screen is a recovery panel, recorded before anyone reports it', async () => {
  const send = vi.spyOn(api.crashReports, 'send').mockResolvedValue({ id: 11 });
  render(<CrashBoundary variant="screen" resetKey="jobs"><Bomb armed /></CrashBoundary>);
  expect(screen.getByRole('alert')).toHaveTextContent('This screen stopped working');
  await waitFor(() => expect(send).toHaveBeenCalled());
  expect(send.mock.calls[0][0]).toMatchObject({ kind: 'crash', auto: true, message: 'TypeError: Cannot read properties of undefined' });
  expect(await screen.findByText(/It has been recorded/)).toBeInTheDocument();
});

test('moving to another screen clears the crash', async () => {
  vi.spyOn(api.crashReports, 'send').mockResolvedValue({ id: 12 });
  function Shell() {
    const [screenName, setScreen] = useState('jobs');
    return (
      <>
        <button type="button" onClick={() => setScreen('stock')}>Stock</button>
        <CrashBoundary variant="screen" resetKey={screenName}><Bomb armed={screenName === 'jobs'} /></CrashBoundary>
      </>
    );
  }
  render(<Shell />);
  expect(screen.getByRole('alert')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Stock' }));
  expect(await screen.findByText('Working screen')).toBeInTheDocument();
});

test('Report what happened: the person adds words and the automatic picture to the recorded crash', async () => {
  vi.spyOn(api.crashReports, 'send').mockResolvedValue({ id: 13 });
  const add = vi.spyOn(api.crashReports, 'addDetails').mockResolvedValue({ id: 13 });
  render(
    <NotificationProvider>
      <CrashBoundary variant="screen" resetKey="jobs"><Bomb armed /></CrashBoundary>
      <CrashReporter />
    </NotificationProvider>,
  );
  await screen.findByText(/It has been recorded/);
  fireEvent.click(screen.getByRole('button', { name: /Report what happened/ }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('TypeError: Cannot read properties of undefined')).toBeInTheDocument();
  expect(await within(dialog).findByAltText('The screenshot that will be sent')).toHaveAttribute('src', 'data:image/jpeg;base64,SHOT');
  fireEvent.change(within(dialog).getByLabelText(/What were you doing/), { target: { value: 'Saving line 2' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Send report' }));
  await waitFor(() => expect(add).toHaveBeenCalledWith(13, { description: 'Saving line 2', screenshot: 'data:image/jpeg;base64,SHOT' }));
  expect(await screen.findByText(/Report sent/)).toBeInTheDocument();
});

test('Report a problem: words are needed, the picture may be removed', async () => {
  const send = vi.spyOn(api.crashReports, 'send').mockResolvedValue({ id: 14 });
  render(<NotificationProvider><CrashReporter /></NotificationProvider>);
  reportProblem({ kind: 'report' });
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByAltText('The screenshot that will be sent');
  expect(within(dialog).getByRole('button', { name: 'Send report' })).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText(/What were you doing/), { target: { value: 'The total is wrong' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Remove/ }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Send report' }));
  await waitFor(() => expect(send).toHaveBeenCalled());
  expect(send.mock.calls[0][0]).toMatchObject({ kind: 'report', description: 'The total is wrong', screenshot: null });
});

test('a pasted picture replaces the automatic one', async () => {
  vi.spyOn(api.crashReports, 'send').mockResolvedValue({ id: 15 });
  render(<NotificationProvider><CrashReporter /></NotificationProvider>);
  reportProblem({ kind: 'report' });
  const dialog = await screen.findByRole('dialog');
  const file = new File(['x'], 'shot.png', { type: 'image/png' });
  fireEvent.paste(dialog, { clipboardData: { files: [file] } });
  await waitFor(() => expect(within(dialog).getByAltText('The screenshot that will be sent')).toHaveAttribute('src', 'data:image/jpeg;base64,PASTED'));
});

test('a server error is one notice, with a Report button that opens the dialog', async () => {
  render(<NotificationProvider><CrashReporter /></NotificationProvider>);
  // The screen that failed says so, and the reporter offers to report it.
  notify('Internal Server Error', { type: 'error' });
  window.dispatchEvent(new CustomEvent(SERVER_ERROR, { detail: { message: 'Internal Server Error', requestId: 'req-42', method: 'PATCH', path: '/jobs/1' } }));
  const notices = await screen.findAllByText('Internal Server Error');
  expect(notices).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Report' }));
  expect(await screen.findByRole('dialog', { name: 'Report this error' })).toBeInTheDocument();
});

test('before sign-in a crash offers Reload, not Report', async () => {
  setSignedIn(false);
  render(<CrashBoundary variant="page"><Bomb armed /></CrashBoundary>);
  expect(screen.getByRole('alert')).toHaveTextContent('The app stopped working');
  expect(screen.queryByRole('button', { name: /Report what happened/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Reload the app/ })).toBeInTheDocument();
});

test('a report that cannot be sent says so and keeps the dialog', async () => {
  vi.spyOn(api.crashReports, 'send').mockRejectedValue(new Error('offline'));
  render(<NotificationProvider><CrashReporter /></NotificationProvider>);
  reportProblem({ kind: 'report' });
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/What were you doing/), { target: { value: 'x' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Send report' }));
  expect(await within(dialog).findByText(/could not be sent: offline/)).toBeInTheDocument();
});

const ROWS = [
  { id: 2, created_at: '2026-11-08T09:42:00Z', kind: 'crash', auto: true, fingerprint: 'f1', message: 'TypeError: x', description: 'Saving line 2', module: 'jobs', job_id: '1218774', username: 'Lina', role: 'staff', status: 'new', has_screenshot: true, occurrences: 3 },
];
const DETAIL = {
  ...ROWS[0], stack: 'TypeError: x\n at JobRecord', component_stack: null, url: 'https://tig/', app_build: 'df665f1',
  user_agent: 'Chrome', viewport: '1440x900', request_id: null, screenshot_type: 'image/jpeg', details_added_at: '2026-11-08T09:43:00Z',
  admin_note: null, emailed: true,
  breadcrumbs: [{ at: '2026-11-08T09:41:58Z', kind: 'api', text: 'PATCH /jobs/1218774 → 500 (220 ms)' }],
};

test('admins read a report: its words, its picture, its steps, and mark it', async () => {
  vi.spyOn(api.crashReports, 'list').mockResolvedValue(ROWS);
  vi.spyOn(api.crashReports, 'get').mockResolvedValue(DETAIL);
  const review = vi.spyOn(api.crashReports, 'review').mockResolvedValue({ ...DETAIL, status: 'looking' });
  renderWithQuery(<CrashReportsModule />);
  fireEvent.click(await screen.findByText('Saving line 2'));
  const detail = await screen.findByRole('region', { name: 'Crash report 2' });
  expect(within(detail).getByAltText('Screenshot sent with report 2')).toHaveAttribute('src', '/api/crash-reports/2/screenshot');
  expect(within(detail).getByText(/PATCH \/jobs\/1218774 → 500/)).toBeInTheDocument();
  expect(within(detail).getByText(/seen 3 times/)).toBeInTheDocument();
  fireEvent.click(within(detail).getByRole('radio', { name: 'Looking' }));
  await waitFor(() => expect(review).toHaveBeenCalledWith(2, { status: 'looking' }));
});

test('an admin deletes a report for good, after saying so', async () => {
  vi.spyOn(api.crashReports, 'list').mockResolvedValue(ROWS);
  vi.spyOn(api.crashReports, 'get').mockResolvedValue(DETAIL);
  const remove = vi.spyOn(api.crashReports, 'remove').mockResolvedValue(null);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  renderWithQuery(<CrashReportsModule />);
  fireEvent.click(await screen.findByText('Saving line 2'));
  const detail = await screen.findByRole('region', { name: 'Crash report 2' });
  fireEvent.click(within(detail).getByRole('button', { name: 'Delete report' }));
  await waitFor(() => expect(remove).toHaveBeenCalledWith(2));
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Crash report 2' })).not.toBeInTheDocument());
});
