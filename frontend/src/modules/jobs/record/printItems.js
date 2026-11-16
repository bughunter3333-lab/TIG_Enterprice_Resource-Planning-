// Documents that print the job's prices: the same money the server keeps to
// staff on GET /jobs/sales-register and on the invoice PDFs (F23).
const PRICED_DOCUMENTS = new Set(['invoice', 'proforma', 'proformaBal']);

/**
 * The Print menu entries to offer. The invoice and proformas are built in the
 * browser from job data every role can read, so they are offered only where
 * the sales register is — `offer` is useOffer's (lib/access.js).
 */
export function offeredPrintItems(items, offer) {
  if (offer('GET', '/jobs/sales-register')) return items;
  return items.filter((item) => !PRICED_DOCUMENTS.has(item.key));
}
