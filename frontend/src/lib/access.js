/**
 * What the signed-in person may do, as the server says it.
 *
 * `GET /users/me/access` returns the person's role, its column of the access
 * table (`areas`: `{ area, view: [n, of], change: [n, of] }`) and `allowed`:
 * every route the role may call, as "METHOD /path" with the path template the
 * server matches (`POST /jobs/{job_id}/status`). Both are counted from the
 * gates on the routes themselves (backend/app/core/access.py), so the screen
 * asks the same question the server answers and never decides from a role's
 * name. The server still enforces every route; this only decides what to offer.
 */

const PARAM = /^\{[^/{}]+\}$/;

// A template matches a path segment by segment; a {param} takes exactly one
// non-empty segment, so the template itself matches too.
function matches(template, path) {
  const want = template.split('/');
  const got = path.split('/');
  return want.length === got.length
    && want.every((seg, i) => (PARAM.test(seg) ? got[i] !== '' : seg === got[i]));
}

/** Whether the person may call `method path`. False until access has loaded. */
export function canCall(access, method, path) {
  const allowed = access?.allowed;
  if (!Array.isArray(allowed)) return false;
  const verb = String(method).toUpperCase();
  return allowed.some((entry) => {
    const space = entry.indexOf(' ');
    return space > 0 && entry.slice(0, space) === verb && matches(entry.slice(space + 1), path);
  });
}

/**
 * Whether to offer an entry — a tab, a link — that calls `method path`: what
 * canCall says once access has loaded; nothing while it loads, rather than an
 * entry that then vanishes; everything if it cannot be loaded, because the
 * server still enforces every route. The rule the top bar keeps for modules.
 */
export function offers(access, failed, method, path) {
  return access ? canCall(access, method, path) : !!failed;
}

/** `[n, of]`: how many of an area's read routes the person may use, or null. */
export function areaView(access, area) {
  return access?.areas?.find((a) => a.area === area)?.view ?? null;
}
