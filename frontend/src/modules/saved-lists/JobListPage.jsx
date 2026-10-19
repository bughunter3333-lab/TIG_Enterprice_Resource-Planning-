import { notify } from '../../lib/notify';
import JobListBuilder from '../../modules/jobs/JobListBuilder';
import { matchJobList } from '../../modules/jobs/jobsFilters';

export default function JobListPage({ customers, deleteJobList, inventory, jobListModal, jobs, openModal, savedJobLists, setActiveJob, setActiveJobList, setActiveModule, setJobListModal, setShowJobDetail, updateListFilter }) {
  if (!jobListModal.open) return null;
  const d = jobListModal.draft;
  const jobsArr = jobs || [];
  const uniq = (sel) => [...new Set(jobsArr.map(sel).filter(Boolean))].sort();
  const options = {
    customers: (customers || []).map(c => ({ id: c.id, name: c.name })),
    accMgrs: uniq(j => j.accMgr),
    shipCodes: uniq(j => j.shipTo),
    groups: uniq(j => (j.customerId ? j.customerId.split('.')[0] : null)),
    types: uniq(j => j.type),
    branches: uniq(j => j.branch),
    priceLevels: uniq(j => j.priceLevel),
  };
  const results = jobsArr.filter(j => matchJobList(j, d));
  const editingId = jobListModal.editingId;
  const editingList = savedJobLists.find(l => l.id === editingId);
  const close = () => setJobListModal(m => ({ ...m, open: false, editingId: null }));
  // Run: commit the current filters to this list; it now runs live in the tree + jobs view.
  const run = () => {
    if (editingId) updateListFilter(editingId, { ...d });
    setActiveJobList({ ...d, name: editingList ? editingList.name : 'Filtered Jobs' });
    setShowJobDetail(false);
    setActiveModule(editingList && editingList.node === 'quotes' ? 'quotes' : 'jobs');
    notify(`Ran "${editingList ? editingList.name : 'list'}" — ${results.length} job${results.length === 1 ? '' : 's'}`, { type: 'success' });
    close();
  };
  // Cancel: a list that was never run is discarded (Jim2 keeps only run lists).
  const cancel = () => {
    if (editingId && editingList && editingList.filter == null) deleteJobList(editingId);
    close();
  };
  return (
    <JobListBuilder
      draft={d}
      listName={editingList ? editingList.name : 'Job List'}
      onChange={(patch) => setJobListModal(m => ({ ...m, draft: { ...m.draft, ...patch } }))}
      options={options}
      results={results}
      inventory={inventory}
      onRun={run}
      onCancel={cancel}
      onAddJob={() => { close(); openModal('job'); }}
      onEditJob={(job) => { close(); setActiveJob(job); openModal('job'); }}
      onViewJob={(job) => { close(); setActiveJob(job); setShowJobDetail(true); setActiveModule('jobs'); }}
    />
  );
}
