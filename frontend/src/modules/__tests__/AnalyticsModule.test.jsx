/**
 * The Analytics screen, now in the sidebar: it opens on every tab over what
 * the server really answers. The fixture is the API's own output for the TIG
 * demo data (backend/seed_demo.py) — including the forecast's "not enough
 * history" answer, which is what a new database gives for its first months.
 */
import { fireEvent, screen } from '@testing-library/react';
import * as api from '../../api';
import { renderWithQuery } from '../../test/renderWithQuery';
import AnalyticsModule from '../AnalyticsModule';
import fixture from './fixtures/analytics.json';

const CALLS = {
  getOverview: 'overview',
  getForecast: 'forecast',
  getDso: 'dso',
  getAbc: 'abc',
  getChurn: 'churn',
  getMargins: 'margins',
  getTurnaround: 'turnaround',
  getSeasonality: 'seasonality',
  getAnomalies: 'anomalies',
};

beforeEach(() => {
  for (const [method, key] of Object.entries(CALLS)) {
    vi.spyOn(api.analytics, method).mockResolvedValue(fixture[key]);
  }
});

afterEach(() => vi.restoreAllMocks());

test('the overview reads the receivables the demo books', async () => {
  renderWithQuery(<AnalyticsModule />);
  expect(await screen.findByText(/Collection DSO:/)).toBeInTheDocument();
});

test.each([
  'Revenue Forecast',
  'DSO & Collections',
  'Turnaround Time',
  'ABC Inventory',
  'Retention & Churn',
  'Pricing & Margins',
  'Anomaly Reports',
])('the %s tab opens on what the server answers', async (tab) => {
  renderWithQuery(<AnalyticsModule />);
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(tab.replace('&', '\\&')) }));
  // Nothing on the tab threw: the screen is still there, without an error box.
  expect(screen.getByRole('button', { name: /Overview/ })).toBeInTheDocument();
  expect(screen.queryByText(/^Error/)).toBeNull();
});
