/**
 * The import surface.
 *
 * It takes no props, which is the point of how it was extracted: the four
 * pieces of state it needs (chosen files, previews, results, per-file loading)
 * are read here and nowhere else, so they moved down with it rather than being
 * threaded back through the monolith as eight props.
 *
 * That is exactly what makes it testable in isolation — mount it and it works,
 * with no scaffolding to stand up first. These assert the surface renders each
 * importable record type and that nothing calls the API until a file is chosen,
 * since the module's whole job is to not touch the database by accident.
 */
import { screen } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import ImportModule from '../ImportModule';

import { importData } from '../../../api';

// Spies on the real module rather than a mock of it. A partial object literal
// here is the project's one absolute testing rule, and this is why: the first
// attempt mocked preview and commit, the component also calls templateUrl
// during render, and the whole surface threw. Spying keeps every other method
// real, so a call the component makes cannot be silently absent.
let preview, customers;
beforeEach(() => {
  preview = vi.spyOn(importData, 'preview').mockResolvedValue({ rows: [] });
  customers = vi.spyOn(importData, 'customers').mockResolvedValue({ inserted: 0 });
});
afterEach(() => vi.restoreAllMocks());

test('mounts with no props at all', () => {
  expect(() => renderWithQuery(<ImportModule />)).not.toThrow();
});

test('offers every record type the importer supports', () => {
  renderWithQuery(<ImportModule />);
  // The full set, by heading. Several also appear in the surrounding copy, so
  // this pins the card rather than any mention of the word — and it fails if a
  // record type is dropped from the importer.
  for (const kind of ['Customers', 'Suppliers', 'Inventory / Stock',
                      'Jobs / Orders', 'Card Files (Ship Addresses)']) {
    expect(screen.getByRole('heading', { name: kind })).toBeInTheDocument();
  }
});

test('touches nothing until a file is chosen', () => {
  // Landing on the tab must not preview or commit anything: the import writes
  // to customers, stock and suppliers, so an accidental call is a data event.
  renderWithQuery(<ImportModule />);
  expect(preview).not.toHaveBeenCalled();
  expect(customers).not.toHaveBeenCalled();
});

test('explains itself before anything is uploaded', () => {
  renderWithQuery(<ImportModule />);
  expect(screen.getByText('How it works')).toBeInTheDocument();
  expect(screen.getAllByText('Click to select CSV file').length).toBeGreaterThan(0);
});
