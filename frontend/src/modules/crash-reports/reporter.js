/**
 * Sending crash reports (docs/superpowers/specs/2026-11-08-crash-reports.md).
 *
 * A crash is recorded on its own, the moment it happens — no picture, no words
 * — so none goes unseen; the person may then add their words and a picture to
 * it. Any other uncaught error is recorded the same way, once per kind per
 * visit, so one fault looping does not send a thousand.
 */
import { crashReports } from '../../api';
import { addStep, environment, isSignedIn, lastSteps } from '../../lib/crashContext';

// What browsers raise that is not a fault of the app.
const NOISE = [
  /ResizeObserver loop/i, // layout settling; harmless
  /^Script error\.?$/i, // another site's script, its details withheld by the browser
];

// Each kind recorded this visit, with the id it was recorded under — a crash
// that happens again is the same report, not a new one.
const recorded = new Map();
// What a crash boundary has caught. React also hands those to the window's
// error handler in development; they are recorded once, as crashes.
const caught = new WeakSet();

/** A boundary caught this: the window's handler leaves it alone. */
export function markCaught(error) {
  if (error && typeof error === 'object') caught.add(error);
}

/** An error's words and stack, whatever was thrown. */
export function errorParts(error) {
  if (error instanceof Error) {
    return { message: `${error.name}: ${error.message}`, stack: error.stack ?? null };
  }
  if (typeof error === 'string') return { message: error, stack: null };
  try {
    return { message: JSON.stringify(error ?? null), stack: null };
  } catch {
    return { message: String(error), stack: null }; // a circular object, say
  }
}

const firstFrame = (stack) => (stack ?? '').split('\n').find((l) => l.trim().startsWith('at ')) ?? '';

/**
 * Record a crash or an uncaught error without asking: its id, or null when it
 * was noise, already recorded this visit, or could not be sent. Never throws.
 */
export async function recordCrash({ kind = 'crash', error, componentStack = null }) {
  try {
    const { message, stack } = errorParts(error);
    addStep('error', message);
    if (NOISE.some((re) => re.test(message))) return null;
    if (!isSignedIn()) return null; // nobody to send it as
    const key = `${kind}|${message}|${firstFrame(stack)}`;
    if (!recorded.has(key)) {
      const sending = crashReports
        .send({
          kind, auto: true, message, stack, component_stack: componentStack,
          ...environment(), breadcrumbs: lastSteps(),
        })
        .then((sent) => sent.id)
        .catch(() => {
          recorded.delete(key); // not sent: the next time may get through
          return null;
        });
      recorded.set(key, sending);
    }
    return await recorded.get(key);
  } catch {
    return null; // a report must never become a second crash
  }
}

/**
 * Send what the person reported. With `crashId`, their words and picture join
 * the crash already recorded; otherwise it is a report of its own.
 */
export async function sendReport({ kind = 'report', description, screenshot, error, message: said, requestId, crashId }) {
  const details = { description: description || null, screenshot: screenshot || null };
  if (crashId) {
    try {
      return await crashReports.addDetails(crashId, details);
    } catch (e) {
      // Too late, or added already: send it as a report of its own instead.
      if (e?.status !== 404 && e?.status !== 409) throw e;
    }
  }
  // A server error has words and an address, no stack of ours.
  const { message, stack } = error ? errorParts(error) : { message: said ?? null, stack: null };
  return crashReports.send({
    kind, auto: false, message, stack, request_id: requestId ?? null,
    ...details, ...environment(), breadcrumbs: lastSteps(),
  });
}

/** Record every uncaught error and unhandled rejection; returns how to stop. */
export function installGlobalHandlers() {
  // A moment's wait, so a crash a boundary is catching is marked first.
  const later = (error) => setTimeout(() => {
    if (!(error && typeof error === 'object' && caught.has(error))) recordCrash({ kind: 'error', error });
  }, 0);
  const onError = (e) => later(e.error ?? e.message);
  const onRejection = (e) => later(e.reason);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}

/** For tests: forget what this visit has recorded. */
export const resetRecorded = () => recorded.clear();
