/**
 * The document designer.
 *
 * What matters here is that editing the structure changes what prints. The
 * preview is the same component the printer uses, so a test that adds a block
 * and then finds it in the preview is testing the real path rather than a
 * mock-up of it.
 *
 * Spies on the real api module rather than a partial mock: the project rule,
 * and it has already caught a component calling a method a hand-written mock
 * did not define.
 */
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { renderWithQuery } from '../../../test/renderWithQuery';
import DocumentDesigner from '../DocumentDesigner';
import { documentTemplates, inventory as inventoryApi, jobs as jobsApi, settings } from '../../../api';

const job = {
  id: '1207512',
  customer: 'Zephyr Apparel',
  due: '15/08/2026',
  dateIn: '02/08/2026',
  items: [
    { id: 1, stockCode: 'TEE-BLK-M', description: 'Heavy Tee', order: 40, qtyPick: 40 },
    { id: 2, stockCode: 'CAP-NVY', description: 'Cap', order: 20, qtyPick: 12 },
    { id: 3, stockCode: 'HOODIE', description: 'Hoodie', order: 5, qtyPick: 0 },
  ],
};

let saveSpy;

beforeEach(() => {
  vi.spyOn(documentTemplates, 'list').mockResolvedValue({});
  saveSpy = vi.spyOn(documentTemplates, 'save').mockResolvedValue({ saved: true });
  vi.spyOn(jobsApi, 'list').mockResolvedValue([job]);
  vi.spyOn(settings, 'getCompany').mockResolvedValue({ company_name: 'Total Image' });
  // The bin column resolves against stock, so the preview asks for it.
  vi.spyOn(inventoryApi, 'list').mockResolvedValue([
    { sku: 'TEE-BLK-M', stock: 580, location: 'A-12-3' },
  ]);
});
afterEach(() => vi.restoreAllMocks());

const ready = () => waitFor(() => expect(screen.getByText(/Previewing job/)).toBeInTheDocument());

describe('the designer', () => {
  test('opens on the job sheet and previews it against a real job', async () => {
    renderWithQuery(<DocumentDesigner />);
    await ready();
    expect(screen.getByText('Previewing job #1207512')).toBeInTheDocument();
    expect(screen.getByText('JOB SHEET')).toBeInTheDocument();
  });

  test('switching document type loads that document, not the last one', async () => {
    renderWithQuery(<DocumentDesigner />);
    await ready();
    fireEvent.change(screen.getByLabelText('Document'), { target: { value: 'consignmentNote' } });

    await waitFor(() => expect(screen.getByText('CONSIGNMENT NOTE')).toBeInTheDocument());
    expect(screen.queryByText('JOB SHEET')).toBeNull();
  });

  test('the paper size drives the page, so a label is not laid out as A4', async () => {
    const { container } = renderWithQuery(<DocumentDesigner />);
    await ready();
    expect(container.querySelector('.doc-page')).toHaveStyle({ width: '210mm' });

    fireEvent.change(screen.getByLabelText('Document'), { target: { value: 'shipLabel' } });
    await waitFor(() =>
      expect(container.querySelector('.doc-page')).toHaveStyle({ width: '100mm' }),
    );
  });

  test('removing a block removes it from what prints', async () => {
    renderWithQuery(<DocumentDesigner />);
    await ready();
    expect(screen.getByText('JOB SHEET')).toBeInTheDocument();

    // The document title is the second block of the header band.
    const titleRow = screen.getByRole('button', { name: 'Document title' }).parentElement;
    fireEvent.click(within(titleRow).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(screen.queryByText('JOB SHEET')).toBeNull());
  });

  test('editing a block changes the preview', async () => {
    renderWithQuery(<DocumentDesigner />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Document title' }));

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'WORKS ORDER' } });
    await waitFor(() => expect(screen.getByText('WORKS ORDER')).toBeInTheDocument());
  });

  test('a column added to the item table appears as a column', async () => {
    const { container } = renderWithQuery(<DocumentDesigner />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Item table' }));

    fireEvent.click(screen.getByRole('button', { name: 'Picked' }));
    await waitFor(() => {
      const heads = [...container.querySelectorAll('th')].map(th => th.textContent);
      expect(heads).toContain('Picked');
    });
  });

  test('saving sends the whole template, not just the changed field', async () => {
    // The server stores the spec opaquely, so a partial save would silently
    // truncate the layout to whatever was edited last.
    renderWithQuery(<DocumentDesigner />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Document title' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'WORKS ORDER' } });

    fireEvent.click(screen.getByRole('button', { name: /save template/i }));
    await waitFor(() => expect(saveSpy).toHaveBeenCalled());

    const [docType, sent] = saveSpy.mock.calls[0];
    expect(docType).toBe('jobSheet');
    expect(Object.keys(sent.bands)).toEqual(['header', 'lines', 'footer']);
    expect(sent.bands.lines.length).toBeGreaterThan(0);
  });

  test('save is offered only once something has changed', async () => {
    renderWithQuery(<DocumentDesigner />);
    await ready();
    expect(screen.getByRole('button', { name: /saved/i })).toBeDisabled();
  });
});
