import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import TemplateRenderer from '../../components/documents/TemplateRenderer';
import { PAPER } from '../../lib/documentTemplates';

/**
 * Print a template, and therefore produce its PDF.
 *
 * The browser's own print dialog is the PDF generator. That is the whole reason
 * these documents became templates: there is one renderer, so the preview, the
 * paper and the PDF are the same pixels rather than three implementations
 * agreeing by hand.
 *
 * The document is mounted into a dedicated root outside the application, and a
 * print stylesheet hides everything else. Rendering into a new window was the
 * obvious alternative and is worse: popup blockers eat it, and the new window
 * has none of the app's stylesheets, so the document prints unstyled.
 *
 * @page has to be written as a literal rule — it cannot read a CSS custom
 * property — so the sheet is generated per call from the template's paper.
 */

const STYLE_ID = 'doc-print-page-rule';
const ROOT_ID = 'print-root';

function ensureRoot() {
  let el = document.getElementById(ROOT_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = ROOT_ID;
    document.body.appendChild(el);
  }
  return el;
}

function setPageRule(paperKey) {
  const paper = PAPER[paperKey] || PAPER.A4;
  document.getElementById(STYLE_ID)?.remove();
  const style = document.createElement('style');
  style.id = STYLE_ID;
  // Margin is zero at the page level because the template already carries its
  // own margin; declaring both would inset the document twice.
  style.textContent = `@page { size: ${paper.width}mm ${paper.height}mm; margin: 0; }`;
  document.head.appendChild(style);
  return style;
}

/**
 * @returns {Promise<void>} resolves once the dialog has closed and the DOM is clean
 */
export function printDocument(template, job, company) {
  if (!job) return Promise.resolve();

  const host = ensureRoot();
  const style = setPageRule(template.paper);
  const root = createRoot(host);
  root.render(createElement(TemplateRenderer, { template, job, company }));

  return new Promise((resolve) => {
    // One frame for React to commit, a second for layout, before the dialog
    // freezes the page. Printing on the same tick prints an empty sheet.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const cleanup = () => {
          window.removeEventListener('afterprint', cleanup);
          // Unmount out of band: React refuses to unmount a root while it is
          // rendering, and afterprint can land inside that window.
          setTimeout(() => {
            root.unmount();
            host.innerHTML = '';
            style.remove();
            resolve();
          }, 0);
        };
        window.addEventListener('afterprint', cleanup);
        window.print();
        // Safari and some Linux builds never fire afterprint. Without this the
        // document stays mounted and the next print stacks a second copy under
        // the first.
        setTimeout(cleanup, 60000);
      });
    });
  });
}
