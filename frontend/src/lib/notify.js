// Simple pub/sub notifier for UI toasts
const subscribers = new Set();

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function notify(message, options = {}) {
  const payload = { message: String(message || ''), ...options };
  for (const s of Array.from(subscribers)) {
    try {
      s(payload);
    } catch (err) {
      // swallow: subscribers should handle their own errors
      // eslint-disable-next-line no-console
      console.error('notify subscriber error', err);
    }
  }
}

export default notify;
