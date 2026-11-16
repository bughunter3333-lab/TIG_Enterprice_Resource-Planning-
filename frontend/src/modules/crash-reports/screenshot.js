/**
 * Pictures for a crash report: the app's own page, taken automatically, or one
 * the person pastes or attaches. Every picture leaves here as a JPEG data URL
 * no wider than MAX_WIDTH, well under the server's 3 MB.
 *
 * The capture library is loaded only when a picture is taken: nobody pays for
 * it until something goes wrong.
 */

const MAX_WIDTH = 1600;
const QUALITY = 0.72;
// A capture that has not finished by now is abandoned: the report goes without.
const CAPTURE_MS = 5000;
// The server refuses more than 3 MB; a data URL is a third larger than its bytes.
const MAX_DATA_URL = 3.9 * 1024 * 1024;

// Anything marked so — the report dialog itself — is left out of the picture.
export const NOT_IN_SCREENSHOT = 'data-crash-ignore';
// Never pictured: a password field of any kind, and anything marked sensitive
// (the two-factor QR code, a password being shown). The picture is stored and
// read by admins; secrets are not theirs to see.
const NEVER_PICTURED = `[${NOT_IN_SCREENSHOT}], [data-sensitive], input[type="password"]`;

/** Whether a node goes in the picture. */
export const pictured = (node) => !(node instanceof Element && node.closest(NEVER_PICTURED));

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);

/** The page as the person sees it now, or null when it cannot be taken. */
export async function captureScreen() {
  try {
    const width = document.documentElement.clientWidth || window.innerWidth;
    // The limit covers loading the library too: a slow network must not leave
    // the dialog waiting on a picture.
    const shot = await withTimeout(
      import('modern-screenshot').then(({ domToJpeg }) => domToJpeg(document.body, {
        quality: QUALITY,
        scale: Math.min(1, MAX_WIDTH / Math.max(width, 1)),
        backgroundColor: '#ffffff',
        filter: pictured,
      })),
      CAPTURE_MS,
    );
    return shot && shot.length <= MAX_DATA_URL ? shot : null;
  } catch {
    // A picture is a help, never a requirement: the report goes without one.
    return null;
  }
}

const readAsDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

/**
 * A pasted or attached image, made a JPEG no wider than MAX_WIDTH. A file that
 * is not an image, or cannot be drawn, is refused with a reason.
 */
export async function imageToDataUrl(file) {
  if (!file || !/^image\/(png|jpeg|webp|gif|bmp)$/.test(file.type)) {
    throw new Error('Choose a PNG, JPEG or WebP picture.');
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_WIDTH / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL('image/jpeg', QUALITY);
    if (url.length > MAX_DATA_URL) throw new Error('That picture is too large.');
    return url;
  } catch (e) {
    // No canvas to draw on (an old browser): send it as it is, if it fits.
    if (e?.message === 'That picture is too large.') throw e;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Choose a PNG, JPEG or WebP picture.', { cause: e });
    const url = await readAsDataUrl(file);
    if (url.length > MAX_DATA_URL) throw new Error('That picture is too large — over 3 MB.', { cause: e });
    return url;
  }
}
