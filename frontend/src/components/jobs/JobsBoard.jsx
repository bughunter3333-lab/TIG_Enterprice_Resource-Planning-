import KanbanColumn from './KanbanColumn';

const STATUSES = ['QUOTE', 'ORDER', 'In Progress', 'Pick/Pack', 'PROOF', 'PRINT', 'FINISH', 'INVOICE', 'PAID'];

export default function JobsBoard({ jobs, onJobClick }) {
  return (
    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
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
