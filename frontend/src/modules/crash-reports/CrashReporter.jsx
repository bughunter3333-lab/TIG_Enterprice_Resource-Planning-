import { useEffect, useState } from 'react';
import { notify } from '../../lib/notify';
import { REPORT_PROBLEM, SERVER_ERROR, isSignedIn, reportProblem } from '../../lib/crashContext';
import ReportDialog from './ReportDialog';
import { captureScreen } from './screenshot';
import { installGlobalHandlers, sendReport } from './reporter';

/**
 * One report dialog for every way in — a crashed screen, a server error's
 * notice, Report a problem in the top bar — and the recorder of uncaught
 * errors. Mounted once, beside the app, outside its crash boundary, so it
 * still works when the app does not.
 *
 * The picture is taken as the dialog opens; the dialog is left out of it, so
 * it shows the page the person was looking at.
 */
export default function CrashReporter() {
  const [open, setOpen] = useState(null); // { kind, message, error, requestId, crashId }
  const [shot, setShot] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState(null);

  useEffect(() => installGlobalHandlers(), []);

  useEffect(() => {
    const onServerError = (e) => {
      const { message, requestId, method, path } = e.detail ?? {};
      if (!isSignedIn()) return; // a report needs a person to send it as
      // Which call failed is what tells one server error from another.
      const said = method && path ? `${method} ${path} → ${message}` : message;
      notify(message, {
        type: 'error',
        timeout: 10000,
        action: { label: 'Report', onClick: () => reportProblem({ kind: 'server_error', message: said, requestId }) },
      });
    };
    const onReport = (e) => {
      const detail = e.detail ?? {};
      if (!isSignedIn()) return;
      setSendError(null);
      setShot('pending');
      setOpen({
        kind: detail.kind ?? 'report',
        message: detail.message ?? (detail.error instanceof Error ? `${detail.error.name}: ${detail.error.message}` : null),
        error: detail.error ?? null,
        requestId: detail.requestId ?? null,
        crashId: detail.crashId ?? null,
        crashIdPromise: detail.crashIdPromise ?? null,
      });
      captureScreen().then((picture) => setShot(picture));
    };
    window.addEventListener(SERVER_ERROR, onServerError);
    window.addEventListener(REPORT_PROBLEM, onReport);
    return () => {
      window.removeEventListener(SERVER_ERROR, onServerError);
      window.removeEventListener(REPORT_PROBLEM, onReport);
    };
  }, []);

  if (!open) return null;

  const send = async ({ description, screenshot }) => {
    setBusy(true);
    setSendError(null);
    try {
      // A crash still being recorded is waited for, so the words join it.
      const crashId = open.crashId ?? (await open.crashIdPromise?.catch(() => null)) ?? null;
      await sendReport({
        kind: open.kind,
        description,
        screenshot,
        error: open.error,
        message: open.message,
        requestId: open.requestId,
        crashId,
      });
      setOpen(null);
      notify('Report sent — thank you. The team has it.', { type: 'success' });
    } catch (e) {
      setSendError(`The report could not be sent: ${e.message}. Try again in a moment.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ReportDialog
      key={`${open.kind}-${open.crashId ?? ''}-${open.requestId ?? ''}`}
      kind={open.kind}
      message={open.message}
      shot={shot}
      busy={busy}
      error={sendError}
      onSend={send}
      onClose={() => setOpen(null)}
    />
  );
}
