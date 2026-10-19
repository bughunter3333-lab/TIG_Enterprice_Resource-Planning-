// Tyro iClient SDK wrapper
// Docs: https://iclientapi.tyro.com/
// The SDK communicates with a paired Tyro EFTPOS terminal on the local network.

let _scriptLoaded = false;
let _scriptLoading = null;

function loadScript(environment) {
  if (_scriptLoaded) return Promise.resolve();
  if (_scriptLoading) return _scriptLoading;

  const src = environment === 'production'
    ? 'https://iclient.tyro.com/iclient-lib.js'
    : 'https://iclient.sandbox.tyro.com/iclient-lib.js';

  _scriptLoading = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { _scriptLoaded = true; resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => { _scriptLoaded = true; resolve(); };
    s.onerror = () => reject(new Error('Failed to load Tyro iClient SDK — check your network connection'));
    document.head.appendChild(s);
  });

  return _scriptLoading;
}

// amountDollars: number (e.g. 143.50)
// callbacks: { onApproved, onDeclined, onCancelled, onFailed, onStatusUpdate }
// config: { merchantId, terminalId, environment }
export async function initiateTyroPurchase(amountDollars, config, callbacks) {
  const { merchantId, terminalId, environment = 'sandbox' } = config;
  const { onApproved, onDeclined, onCancelled, onFailed, onStatusUpdate } = callbacks;

  if (!merchantId) throw new Error('Tyro Merchant ID is not configured — go to Settings → Tyro EFTPOS');

  await loadScript(environment);

  if (!window.TYRO) throw new Error('Tyro iClient SDK did not load correctly');

  // Amount must be in cents as a string
  const amountCents = String(Math.round(amountDollars * 100));

  const iclient = new window.TYRO.ICLient(merchantId, {
    posProductInfo: {
      posProductVendor: 'Total Image',
      posProductName: 'TIG ERP',
      posProductVersion: '1.0',
      posProductId: terminalId || 'TIG-ERP-001',
    },
  });

  onStatusUpdate?.('Sending to terminal…');

  iclient.initiatePurchase(
    { amount: amountCents, cashout: '0', integratedReceipt: true },
    {
      approved(response) {
        onApproved?.(response);
      },
      declined(response) {
        onDeclined?.(response);
      },
      cancelled(response) {
        onCancelled?.(response);
      },
      failed(response) {
        onFailed?.(response);
      },
      awaitingSignature(response) {
        onStatusUpdate?.('Awaiting customer signature…');
        // Auto-accept signature — set to false to manually handle
        iclient.signatureRequired(true, response);
      },
    }
  );
}
