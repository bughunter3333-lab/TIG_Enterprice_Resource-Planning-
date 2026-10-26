/**
 * Which of a job's lines are picked off a shelf: goods only. A section or note
 * is layout, and a decoration or alteration line is work done to a garment —
 * the server refuses to record a pick against one (POST /jobs/{id}/pick, 422),
 * so sending it would fail the whole save.
 */
export function pickableLines(job) {
  return (job?.items || []).filter(
    (item) => (item.displayType || 'product') === 'product' && !item.isService,
  );
}
