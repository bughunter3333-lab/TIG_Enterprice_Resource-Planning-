import KanbanColumn from './KanbanColumn';
import { PRODUCTION_STATUSES } from '../../modules/jobs/jobStatuses';

// One column per step, in ladder order (Pick/Pack used to sit before PROOF).
// New has a column: without one, a confirmed order vanished from the board.
const STATUSES = ['QUOTE', 'New', ...PRODUCTION_STATUSES, 'INVOICE', 'PAID'];

export default function JobsBoard({ jobs, onJobClick }) {
  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}>
      {STATUSES.map(status => (
        <KanbanColumn
          key={status}
          status={status}
          jobs={(jobs ?? []).filter(j => j.status === status)}
          onJobClick={onJobClick}
        />
      ))}
    </div>
  );
}
