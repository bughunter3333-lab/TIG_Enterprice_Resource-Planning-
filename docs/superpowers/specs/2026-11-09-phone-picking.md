# Picking on a phone (2026-11-09)

Roadmap Phase 1, item 4 — the picking part (receiving and stocktake belong to
the Stock module, not this round).

**Picking** in the sidebar (Jobs and quotes), laid out for a phone at the
shelf (`frontend/src/modules/picking/`):

- Scan the job's label, or type its number. The job's goods lines come in the
  order the shelves are walked — by bin, aisle · bay · position · level
  (`lib/binLocation.js`), a line with no bin last. Decoration, alterations and
  charges are not picked off a shelf and are not listed.
- Each scan of a garment — its stock code, or its stock item's barcode —
  counts one picked, up to what the line supplies; + and − correct it. A code
  not on the job, or a line picked in full already, says so (and the phone
  buzzes).
- A hardware scanner types into the scan field like a keyboard; a phone uses
  its camera through the browser's own barcode reader (`BarcodeDetector`, no
  library), offered only where the browser has one. The camera stops the
  moment the scanner is closed.
- Save the picks (`POST /jobs/{id}/pick`, the server's rule: a line with stock
  on back-order is not picked in full), then mark the job **Picked** or
  **Inco/Pick** — the same rule as the job's pick panel (`pickMoveFor`).
- Recording picks is for the roles the pick route admits; others see the
  picks only.
