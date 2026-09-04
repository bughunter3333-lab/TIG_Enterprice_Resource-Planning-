/**
 * Grouping a grid by a column.
 *
 * JIM15. Jim2's despatch screen is the job list grouped by Ship#: fifteen jobs
 * become four consignments, each with its count. Sorting cannot do that — it
 * puts like rows together but never says where one site ends and the next
 * begins, or how many are in each.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import DataGrid from '../DataGrid';

const columns = [
  { key: 'id', label: 'Job#' },
  { key: 'shipTo', label: 'Ship#' },
  { key: 'customer', label: 'Customer' },
];

const rows = [
  { id: '1218996', shipTo: 'RICO.2201', customer: 'Ricoh' },
  { id: '1218790', shipTo: 'RICO.2202', customer: 'Ricoh' },
  { id: '1219454', shipTo: 'RICO.2201', customer: 'Ricoh' },
  { id: '1219015', shipTo: 'RICO.2202P', customer: 'Ricoh' },
  { id: '1218980', shipTo: 'RICO.2202', customer: 'Ricoh' },
];

test('without groupBy every row is rendered flat', () => {
  render(<DataGrid columns={columns} rows={rows} />);
  expect(screen.getAllByRole('row')).toHaveLength(rows.length + 1); // + header
  expect(screen.queryAllByRole('rowgroup')).toHaveLength(0);
});

test('grouping bands the rows and counts each band', () => {
  render(<DataGrid columns={columns} rows={rows} groupBy="shipTo" />);
  const bands = screen.getAllByRole('rowgroup');
  expect(bands).toHaveLength(3);

  // The banner is the first row in each band. The code also appears in each
  // row's own Ship# cell, which is why this addresses the banner directly
  // rather than by text.
  const banner = (band) => within(band).getAllByRole('row')[0];
  expect(banner(bands[0]).textContent).toBe('RICO.22012 jobs');
  expect(banner(bands[1]).textContent).toBe('RICO.22022 jobs');
  expect(banner(bands[2]).textContent).toBe('RICO.2202P1 job');
});

test('every row still appears exactly once', () => {
  render(<DataGrid columns={columns} rows={rows} groupBy="shipTo" />);
  rows.forEach(r => expect(screen.getByText(r.id)).toBeInTheDocument());
});

test('rows with no value for the column band under a dash rather than vanishing', () => {
  render(
    <DataGrid
      columns={columns}
      rows={[...rows, { id: '9999', customer: 'Ricoh' }]}
      groupBy="shipTo"
    />,
  );
  expect(screen.getByText('9999')).toBeInTheDocument();
  expect(screen.getAllByRole('rowgroup')).toHaveLength(4);
});

test('an empty string bands under the dash, same as a missing value', () => {
  // Real rows come off the normaliser with '' rather than undefined, so a
  // nullish check let them through and produced a band with a blank heading.
  render(
    <DataGrid
      columns={columns}
      rows={[{ id: '8888', shipTo: '', customer: 'Ricoh' }, ...rows]}
      groupBy="shipTo"
    />,
  );
  const bands = screen.getAllByRole('rowgroup');
  const dashBand = bands.find(b => within(b).getAllByRole('row')[0].textContent.startsWith('—'));
  expect(dashBand).toBeTruthy();
  expect(within(dashBand).getByText('8888')).toBeInTheDocument();
});

test('an empty grid still says so when grouping is on', () => {
  render(<DataGrid columns={columns} rows={[]} groupBy="shipTo" emptyText="No jobs" />);
  expect(screen.getByText('No jobs')).toBeInTheDocument();
});
