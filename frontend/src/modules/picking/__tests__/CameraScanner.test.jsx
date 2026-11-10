/**
 * The phone's camera as a scanner (CameraScanner.jsx): started once, and let go
 * whenever it closes — even before the browser has handed it over.
 */
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import CameraScanner from '../CameraScanner';

let getUserMedia;
const stop = vi.fn();
const stream = () => ({ getTracks: () => [{ stop }] });

beforeEach(() => {
  stop.mockClear();
  getUserMedia = vi.fn().mockResolvedValue(stream());
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
  window.BarcodeDetector = class { detect() { return Promise.resolve([]); } };
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
});
afterEach(() => {
  delete window.BarcodeDetector;
  vi.restoreAllMocks();
});

test('the camera starts once, however often the count changes', async () => {
  const { rerender, unmount } = render(<CameraScanner onCode={() => {}} onClose={() => {}} />);
  rerender(<CameraScanner onCode={() => {}} onClose={() => {}} />);
  rerender(<CameraScanner onCode={() => {}} onClose={() => {}} />);
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
  await new Promise((r) => setTimeout(r, 10));
  expect(getUserMedia).toHaveBeenCalledTimes(1);
  unmount();
  expect(stop).toHaveBeenCalled();
});

test('closed before the browser hands the camera over, it is let go at once', async () => {
  let hand;
  getUserMedia.mockReturnValue(new Promise((resolve) => { hand = resolve; }));
  const { unmount } = render(<CameraScanner onCode={() => {}} onClose={() => {}} />);
  unmount();
  hand(stream());
  await waitFor(() => expect(stop).toHaveBeenCalled());
});
