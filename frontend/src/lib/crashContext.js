/**
 * What a crash report says about the moments before it
 * (docs/superpowers/specs/2026-11-08-crash-reports.md): the last steps — every
 * screen and job opened, every API call with its status and time — and where
 * the person is now.
 *
 * Plain module state, no React: `api.js` and the shell write to it from
 * anywhere, and a crash reads it at the moment it happens, when React may be
 * the thing that broke.
 */

const MAX_STEPS = 40;
const steps = [];
let place = { module: null, jobId: null };
// Reports go only from someone signed in: the routes need a person.
let signedIn = false;

export const setSignedIn = (value) => { signedIn = !!value; };
export const isSignedIn = () => signedIn;

/** Note a step: kind is nav · job · api · error · action. */
export function addStep(kind, text) {
  steps.push({ at: new Date().toISOString(), kind, text: String(text).slice(0, 300) });
  if (steps.length > MAX_STEPS) steps.splice(0, steps.length - MAX_STEPS);
}

export const lastSteps = () => steps.map((s) => ({ ...s }));

/** Where the person is: the screen (module) and the job open, if any. */
export function setPlace(next) {
  place = { ...place, ...next };
}

export const currentPlace = () => ({ ...place });

/** Everything about the browser and the build a report carries. */
export function environment() {
  const build = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';
  return {
    url: typeof window !== 'undefined' ? window.location.href : null,
    module: place.module,
    job_id: place.jobId,
    app_build: build,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : null,
  };
}

// A server error, as `api.js` saw it: the notice for it offers to report it.
export const SERVER_ERROR = 'app:server-error';
// Anything — the top bar, a notice, a crashed screen — asks for the report dialog.
export const REPORT_PROBLEM = 'app:report-problem';

/** Open the report dialog: { kind, message, stack, componentStack, requestId, crashId }. */
export function reportProblem(detail = {}) {
  window.dispatchEvent(new CustomEvent(REPORT_PROBLEM, { detail }));
}

/** For tests: start from nothing. */
export function resetCrashContext() {
  steps.length = 0;
  place = { module: null, jobId: null };
}
