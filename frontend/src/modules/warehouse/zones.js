// The physical warehouse layout. Shared: the warehouse surface draws the bin
// grid from it, and the dashboard derives a capacity figure from the same
// numbers, so it cannot live inside either one.
export const WAREHOUSE_ZONES = [
  { zone: 'A', rows: 15, bays: 8, capacity: 480, utilization: 78, items: 342, description: 'General Apparel' },
  { zone: 'B', rows: 12, bays: 6, capacity: 288, utilization: 92, items: 418, description: 'Shirts & Polos' },
  { zone: 'C', rows: 10, bays: 5, capacity: 200, utilization: 65, items: 234, description: 'Outerwear & Jackets' },
  { zone: 'D', rows: 8, bays: 4, capacity: 128, utilization: 45, items: 127, description: 'Accessories & Services' },
];
